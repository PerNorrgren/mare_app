(function () {
  // ── talk.js — the real Talk to Mare experience ──
  // The underlying pipeline (mic capture -> /listen -> /api/talk/chat ->
  // /api/speak) is unchanged from the test harness that proved it works
  // — same distance-threshold-free toggle mic, same wait-for-speech_final
  // logic, same PCM16 downsampling. What's new here is entirely the
  // presentation: a single glowing orb standing in for Mare's presence,
  // with idle/listening/thinking/speaking states, instead of a status
  // line and a mic button.

  let currentUser = null;
  let children = [];
  let selectedChild = null;
  let sessionId = null;
  let locale = 'en';

  let audioCtx = null;
  let micStream = null;
  let processorNode = null;
  let sourceNode = null;
  let listenSocket = null;
  let listening = false;
  let latestTranscript = '';
  let captionsOn = false;

  const els = {};
  function cacheEls() {
    ['picker-view', 'child-grid', 'no-children-msg',
     'talk-view', 'talk-child-name', 'leave-btn', 'captions-btn',
     'orb-btn', 'state-label', 'captions-bar', 'caption-line',
     'leave-confirm', 'leave-cancel-btn', 'leave-confirm-btn',
     'talk-loading',
    ].forEach(id => { els[id] = document.getElementById(id); });
  }

  function setViewportHeight() { document.documentElement.style.setProperty('--vh-px', window.innerHeight + 'px'); }
  function setViewportHeightDelayed() { [50, 150, 300].forEach(d => setTimeout(setViewportHeight, d)); }

  async function checkSession() {
    try {
      const res = await fetch('/api/me');
      if (!res.ok) return null;
      const data = await res.json();
      return data.user;
    } catch {
      return null;
    }
  }

  function setupLangSwitch() {
    document.querySelectorAll('#lang-switch .lang-btn').forEach(btn => {
      const lang = btn.getAttribute('data-lang');
      btn.classList.toggle('active', lang === window.MareI18n.locale);
      btn.addEventListener('click', () => window.MareI18n.switchLocale(lang));
    });
  }

  // ── Orb state machine ──
  // idle -> (tap) -> listening -> (speech_final) -> thinking -> (reply) -> speaking -> idle
  function setOrbState(state) {
    els['orb-btn'].className = 'talk-orb-wrap' + (state !== 'idle' && state !== 'disabled' ? ` state-${state}` : '');
    if (state === 'disabled') els['orb-btn'].classList.add('state-disabled');
    const t = window.MareI18n.t;
    const labels = {
      idle: 'talkStateIdle',
      listening: 'talkStateListening',
      thinking: 'talkStateThinking',
      speaking: 'talkStateSpeaking',
      disabled: 'talkStateDisabled',
    };
    els['state-label'].textContent = t(labels[state] || 'talkStateIdle');
  }

  function showCaption(text) {
    if (!captionsOn || !text) return;
    els['caption-line'].textContent = text;
  }

  // ── Child picker ──
  const AVATAR_COLORS = ['#EAC066', '#7FB5A8', '#D98E73', '#8CA9D9', '#C98CC9', '#A8C97E'];
  async function loadChildren() {
    const data = await api('/api/children');
    children = data.children || [];
    els['child-grid'].innerHTML = '';
    if (!children.length) {
      els['no-children-msg'].hidden = false;
      return;
    }
    children.forEach((c, i) => {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'talk-child-card';
      const avatar = document.createElement('span');
      avatar.className = 'talk-child-avatar';
      avatar.style.background = AVATAR_COLORS[i % AVATAR_COLORS.length];
      avatar.textContent = (c.name || '?').charAt(0).toUpperCase();
      card.appendChild(avatar);
      const name = document.createElement('span');
      name.className = 'talk-child-name';
      name.textContent = c.name;
      card.appendChild(name);
      card.addEventListener('click', () => beginConversation(c));
      els['child-grid'].appendChild(card);
    });
  }

  async function api(path, options) {
    const res = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...options });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
  }

  // ── PCM16 mic capture — unchanged from the proven test harness ──
  function downsampleTo16k(float32Input, inputSampleRate) {
    const ratio = inputSampleRate / 16000;
    const outLength = Math.round(float32Input.length / ratio);
    const out = new Float32Array(outLength);
    for (let i = 0; i < outLength; i++) out[i] = float32Input[Math.round(i * ratio)] || 0;
    return out;
  }
  function floatTo16BitPCM(float32) {
    const buf = new ArrayBuffer(float32.length * 2);
    const view = new DataView(buf);
    for (let i = 0; i < float32.length; i++) {
      const s = Math.max(-1, Math.min(1, float32[i]));
      view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    }
    return buf;
  }

  async function startListening() {
    if (listening) return;
    setOrbState('listening');
    micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    sourceNode = audioCtx.createMediaStreamSource(micStream);
    processorNode = audioCtx.createScriptProcessor(4096, 1, 1);

    listenSocket = new WebSocket(`wss://${location.host}/listen?session=${encodeURIComponent(sessionId)}&locale=${locale}`);
    listenSocket.onerror = (e) => console.error('[talk] /listen error', e);
    listenSocket.onmessage = (e) => {
      let data;
      try { data = JSON.parse(e.data); } catch { return; }
      const alt = data?.channel?.alternatives?.[0];
      if (alt?.transcript) latestTranscript = alt.transcript;
      if ((data.speech_final || data.type === 'UtteranceEnd') && latestTranscript.trim()) {
        const finalText = latestTranscript.trim();
        latestTranscript = '';
        stopListening();
        handleFinalTranscript(finalText);
      }
    };
    processorNode.onaudioprocess = (e) => {
      if (!listenSocket || listenSocket.readyState !== WebSocket.OPEN) return;
      const input = e.inputBuffer.getChannelData(0);
      const down = downsampleTo16k(input, audioCtx.sampleRate);
      listenSocket.send(floatTo16BitPCM(down));
    };
    sourceNode.connect(processorNode);
    processorNode.connect(audioCtx.destination);
    listening = true;
  }

  function stopListening() {
    if (!listening) return;
    listening = false;
    if (processorNode) { processorNode.disconnect(); processorNode = null; }
    if (sourceNode) { sourceNode.disconnect(); sourceNode = null; }
    if (audioCtx) { audioCtx.close(); audioCtx = null; }
    if (micStream) { micStream.getTracks().forEach(t => t.stop()); micStream = null; }
    if (listenSocket) { listenSocket.close(); listenSocket = null; }
  }

  async function handleFinalTranscript(text) {
    showCaption(text);
    setOrbState('thinking');
    try {
      const data = await api('/api/talk/chat', { method: 'POST', body: JSON.stringify({ sessionId, message: text }) });
      await speak(data.reply);
    } catch {
      setOrbState('idle');
    }
  }

  async function speak(text) {
    setOrbState('speaking');
    showCaption(text);
    try {
      const res = await fetch('/api/speak', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) });
      if (!res.ok) { setOrbState('idle'); return; }
      const blob = await res.blob();
      const audio = new Audio(URL.createObjectURL(blob));
      audio.addEventListener('ended', () => setOrbState('idle'));
      audio.addEventListener('error', () => setOrbState('idle'));
      await audio.play();
    } catch {
      setOrbState('idle');
    }
  }

  async function beginConversation(child) {
    selectedChild = child;
    // Lets the site-wide Mare Helper widget (if opened while this Talk
    // to Mare conversation is active) use the same age-appropriate
    // register, rather than defaulting to the adult/app-helper voice.
    window.MareHelperContext = { isChild: true, ageBand: child.age_band, childName: child.name };
    els['picker-view'].hidden = true;
    els['talk-view'].hidden = false;
    els['talk-child-name'].textContent = child.name;
    setOrbState('disabled');

    try {
      const data = await api('/api/talk/session', { method: 'POST', body: JSON.stringify({ childId: child.id }) });
      sessionId = data.sessionId;
      locale = data.locale;
      const openData = await api(`/api/talk/session/${sessionId}/opening`, { method: 'POST' });
      await speak(openData.reply);
    } catch (err) {
      setOrbState('idle');
      els['state-label'].textContent = err.message || window.MareI18n.t('talkErrorGeneric');
    }
  }

  function setupOrb() {
    els['orb-btn'].addEventListener('click', () => {
      if (els['orb-btn'].classList.contains('state-disabled')) return;
      if (listening) {
        stopListening();
        setOrbState('idle');
      } else if (!els['orb-btn'].classList.contains('state-thinking') && !els['orb-btn'].classList.contains('state-speaking')) {
        startListening();
      }
    });
  }

  function setupCaptions() {
    els['captions-btn'].addEventListener('click', () => {
      captionsOn = !captionsOn;
      els['captions-btn'].classList.toggle('active', captionsOn);
      els['captions-bar'].hidden = !captionsOn;
    });
  }

  async function endConversationAndLeave() {
    stopListening();
    if (sessionId) await api(`/api/talk/session/${sessionId}/end`, { method: 'POST' }).catch(() => {});
    window.location.href = '/';
  }
  function setupLeave() {
    els['leave-btn'].addEventListener('click', () => { els['leave-confirm'].hidden = false; });
    els['leave-cancel-btn'].addEventListener('click', () => { els['leave-confirm'].hidden = true; });
    els['leave-confirm-btn'].addEventListener('click', endConversationAndLeave);
  }

  async function init() {
    cacheEls();
    await window.MareI18n.ready;
    setViewportHeight();
    window.addEventListener('resize', setViewportHeight);
    window.addEventListener('orientationchange', setViewportHeightDelayed);
    window.addEventListener('resize', setViewportHeightDelayed);

    setupLangSwitch();
    setupOrb();
    setupCaptions();
    setupLeave();

    currentUser = await checkSession();
    if (!currentUser || currentUser.role !== 'parent') {
      window.location.href = '/login.html';
      return;
    }
    await loadChildren();
    els['talk-loading'].hidden = true;
  }
  init();
})();
