(function () {
  // ── Talk to Mare — test harness client ──
  // Deliberately simple: toggle mic (tap to start, tap to stop) rather
  // than press-and-hold, and wait for speech_final/UtteranceEnd before
  // treating a transcript as final rather than acting on the first
  // is_final chunk — both lessons already learned the hard way building
  // per_bot's own voice pipeline (an early is_final-only version there
  // fired too early or more than once). No reason to relearn that here.

  let currentUser = null;
  let children = [];
  let sessionId = null;
  let locale = 'en';

  let audioCtx = null;
  let micStream = null;
  let processorNode = null;
  let sourceNode = null;
  let listenSocket = null;
  let listening = false;
  let latestTranscript = '';

  const els = {
    childSelect: document.getElementById('child-select'),
    startBtn: document.getElementById('start-btn'),
    endBtn: document.getElementById('end-btn'),
    status: document.getElementById('status'),
    transcript: document.getElementById('transcript'),
    micRow: document.getElementById('mic-row'),
    micBtn: document.getElementById('mic-btn'),
    player: document.getElementById('player'),
  };

  function setStatus(text) { els.status.textContent = text; }

  function addLine(who, text) {
    const div = document.createElement('div');
    div.className = `talk-line ${who}`;
    div.textContent = text;
    els.transcript.appendChild(div);
    els.transcript.scrollTop = els.transcript.scrollHeight;
  }

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

  async function loadChildren() {
    const res = await fetch('/api/children');
    const data = await res.json();
    children = data.children || [];
    els.childSelect.innerHTML = '';
    if (!children.length) {
      const opt = document.createElement('option');
      opt.textContent = 'No children on this account yet';
      els.childSelect.appendChild(opt);
      els.startBtn.disabled = true;
      return;
    }
    children.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = c.name + (c.age_band ? ` (${c.age_band})` : ' (no age band set)');
      els.childSelect.appendChild(opt);
    });
  }

  // ── PCM16 mic capture ──
  // Deepgram's /listen query string (server-side) asks for linear16 at
  // 16000Hz mono — browsers give mic audio at their own native rate
  // (usually 48000), so this downsamples in-browser before sending.
  function downsampleTo16k(float32Input, inputSampleRate) {
    const ratio = inputSampleRate / 16000;
    const outLength = Math.round(float32Input.length / ratio);
    const out = new Float32Array(outLength);
    for (let i = 0; i < outLength; i++) {
      out[i] = float32Input[Math.round(i * ratio)] || 0;
    }
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
    micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    sourceNode = audioCtx.createMediaStreamSource(micStream);
    // ScriptProcessorNode is deprecated but the simplest reliable way to
    // get raw PCM frames across browsers for a first working version of
    // this pipeline — an AudioWorklet rewrite is a reasonable later
    // improvement, not a blocker for proving the pipeline works at all.
    processorNode = audioCtx.createScriptProcessor(4096, 1, 1);

    listenSocket = new WebSocket(`wss://${location.host}/listen?session=${encodeURIComponent(sessionId)}&locale=${locale}`);
    listenSocket.onopen = () => console.log('[talk] /listen connected');
    listenSocket.onerror = (e) => console.error('[talk] /listen error', e);
    listenSocket.onclose = () => console.log('[talk] /listen closed');
    listenSocket.onmessage = (e) => {
      let data;
      try { data = JSON.parse(e.data); } catch { return; }
      const alt = data?.channel?.alternatives?.[0];
      if (alt?.transcript) latestTranscript = alt.transcript;
      // Only act once Deepgram itself says the utterance is done —
      // is_final fires on every short pause and would send half-sentences.
      if ((data.speech_final || data.type === 'UtteranceEnd') && latestTranscript.trim()) {
        const finalText = latestTranscript.trim();
        latestTranscript = '';
        stopListening();
        handleFinalTranscript(finalText);
      }
    };

    processorNode.onaudioprocess = (e) => {
      if (listenSocket.readyState !== WebSocket.OPEN) return;
      const input = e.inputBuffer.getChannelData(0);
      const down = downsampleTo16k(input, audioCtx.sampleRate);
      listenSocket.send(floatTo16BitPCM(down));
    };
    sourceNode.connect(processorNode);
    processorNode.connect(audioCtx.destination);

    listening = true;
    els.micBtn.classList.add('listening');
    els.micBtn.textContent = '⏹';
    setStatus('Listening…');
  }

  function stopListening() {
    if (!listening) return;
    listening = false;
    els.micBtn.classList.remove('listening');
    els.micBtn.textContent = '🎤';
    if (processorNode) { processorNode.disconnect(); processorNode = null; }
    if (sourceNode) { sourceNode.disconnect(); sourceNode = null; }
    if (audioCtx) { audioCtx.close(); audioCtx = null; }
    if (micStream) { micStream.getTracks().forEach(t => t.stop()); micStream = null; }
    if (listenSocket) { listenSocket.close(); listenSocket = null; }
  }

  async function handleFinalTranscript(text) {
    addLine('child', text);
    setStatus('Mare is thinking…');
    els.micBtn.disabled = true;
    try {
      const res = await fetch('/api/talk/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, message: text }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus(data.error || 'Something went wrong.');
        return;
      }
      addLine('mare', data.reply);
      await speak(data.reply);
      setStatus('Tap the microphone to talk.');
    } catch {
      setStatus('Something went wrong — try again.');
    } finally {
      els.micBtn.disabled = false;
    }
  }

  async function speak(text) {
    try {
      const res = await fetch('/api/speak', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) return; // voice not configured — text already shown, fine to skip audio
      const blob = await res.blob();
      els.player.src = URL.createObjectURL(blob);
      await els.player.play();
    } catch (e) {
      console.error('[talk] speak failed', e);
    }
  }

  async function beginConversation() {
    const childId = els.childSelect.value;
    if (!childId) return;
    els.startBtn.disabled = true;
    setStatus('Finding Mare…');
    try {
      const res = await fetch('/api/talk/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ childId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus(data.error || 'Could not start a conversation.');
        els.startBtn.disabled = false;
        return;
      }
      sessionId = data.sessionId;
      locale = data.locale;

      els.transcript.hidden = false;
      els.micRow.hidden = false;
      els.endBtn.hidden = false;
      document.getElementById('child-select').closest('.talk-field').hidden = true;
      els.startBtn.hidden = true;

      setStatus('Mare is saying hello…');
      const openRes = await fetch(`/api/talk/session/${sessionId}/opening`, { method: 'POST' });
      const openData = await openRes.json();
      if (openRes.ok) {
        addLine('mare', openData.reply);
        await speak(openData.reply);
      }
      setStatus('Tap the microphone to talk.');
    } catch {
      setStatus('Could not reach the server — try again.');
      els.startBtn.disabled = false;
    }
  }

  async function endConversation() {
    stopListening();
    if (sessionId) {
      await fetch(`/api/talk/session/${sessionId}/end`, { method: 'POST' }).catch(() => {});
    }
    sessionId = null;
    setStatus('Conversation ended.');
    els.micRow.hidden = true;
    els.endBtn.hidden = true;
  }

  els.startBtn.addEventListener('click', beginConversation);
  els.endBtn.addEventListener('click', endConversation);
  els.micBtn.addEventListener('click', () => {
    if (listening) stopListening();
    else startListening();
  });

  async function init() {
    currentUser = await checkSession();
    if (!currentUser || currentUser.role !== 'parent') {
      window.location.href = '/login.html';
      return;
    }
    await loadChildren();
  }
  init();
})();
