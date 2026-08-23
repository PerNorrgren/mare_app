(function () {
  // ── mare-helper-widget.js ──
  // Site-wide Mare Helper. Same character as Talk to Mare (see
  // prompts.js's buildMareHelperSystemPrompt) — not a separate helper
  // like per_bot's Tomte — available on every page: showcase, library,
  // login, teacher hub, admin, even alongside the child's own Talk to
  // Mare session.
  //
  // Text-only for now. Live voice input (a microphone streamed to
  // Deepgram, matching Talk to Mare's own pipeline) is real future
  // work, not built in this pass — the widget has a "speak replies
  // aloud" toggle using the existing TTS endpoint, but no voice INPUT
  // yet, and that's a deliberate phase-1 scope line, not an oversight.
  //
  // Pages that want child-register replies (currently just reader.html
  // and talk.html, when a child profile is active) set
  // window.MareHelperContext = { isChild: true, ageBand, childName }
  // before this script runs. Every other page just omits it and gets
  // the adult/app-helper register, with the audience resolved
  // server-side from the session cookie if one exists.

  const STORAGE_KEY_HISTORY = null; // deliberately not persisted across page loads — see note in the panel-open handler below.
  let history = []; // { role: 'user'|'assistant', content: string }[], capped client-side
  let lastFocusLabel = '';
  let hasGreeted = false;
  let speakReplies = false;

  function pageLabel() {
    return document.title || window.location.pathname;
  }

  function t(key, fallback) {
    if (window.MareI18n && window.MareI18n.ready) {
      const val = window.MareI18n.t(key);
      // MareI18n.t returns the key itself when missing — fall back to
      // the English default passed in rather than showing a raw key.
      if (val && val !== key) return val;
    }
    return fallback;
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // ── Track the last meaningful thing clicked, for context ──
  function setupFocusTracking() {
    document.addEventListener('click', (e) => {
      const el = e.target.closest('button, a, [role="button"]');
      if (!el || el.closest('#mare-helper-root')) return; // ignore clicks inside the widget itself
      const label = el.getAttribute('aria-label') || el.textContent.trim();
      if (label) lastFocusLabel = label.slice(0, 120);
    }, true);
  }

  // ── Build the widget DOM ──
  function buildWidget() {
    const root = document.createElement('div');
    root.id = 'mare-helper-root';
    root.innerHTML = `
      <button type="button" id="mh-launcher" aria-label="Mare">
        <span id="mh-launcher-avatar"></span>
      </button>
      <div id="mh-greeting-bubble" hidden></div>
      <div id="mh-panel" hidden>
        <div id="mh-panel-header">
          <span id="mh-panel-avatar"></span>
          <div id="mh-panel-title-wrap">
            <div id="mh-panel-title">Mare</div>
            <div id="mh-panel-sub"></div>
          </div>
          <label id="mh-speak-toggle" title="Speak replies aloud">
            <input type="checkbox" id="mh-speak-checkbox">
            <span aria-hidden="true">🔊</span>
          </label>
          <button type="button" id="mh-close-btn" aria-label="Close">✕</button>
        </div>
        <div id="mh-messages"></div>
        <form id="mh-input-form">
          <input type="text" id="mh-input" autocomplete="off" placeholder="">
          <button type="submit" id="mh-send-btn">→</button>
        </form>
      </div>
    `;
    document.body.appendChild(root);
    return root;
  }

  function appendMessage(role, text) {
    const messages = document.getElementById('mh-messages');
    const bubble = document.createElement('div');
    bubble.className = `mh-bubble mh-bubble-${role}`;
    bubble.textContent = text;
    messages.appendChild(bubble);
    messages.scrollTop = messages.scrollHeight;
  }

  function appendTyping() {
    const messages = document.getElementById('mh-messages');
    const el = document.createElement('div');
    el.className = 'mh-bubble mh-bubble-assistant mh-typing';
    el.id = 'mh-typing-indicator';
    el.innerHTML = '<span></span><span></span><span></span>';
    messages.appendChild(el);
    messages.scrollTop = messages.scrollHeight;
  }
  function removeTyping() {
    const el = document.getElementById('mh-typing-indicator');
    if (el) el.remove();
  }

  function currentContext() {
    const ctx = window.MareHelperContext || {};
    return {
      page: pageLabel(),
      focus: lastFocusLabel || undefined,
      isChild: !!ctx.isChild,
      ageBand: ctx.ageBand,
      childName: ctx.childName,
      productId: ctx.productId || undefined,
    };
  }

  async function maybeSpeak(text) {
    if (!speakReplies) return;
    try {
      const res = await fetch('/api/speak', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) return; // voice not configured — text reply already shown, fail silently
      const blob = await res.blob();
      new Audio(URL.createObjectURL(blob)).play().catch(() => {});
    } catch { /* no-op — text reply stands on its own */ }
  }

  async function sendGreeting() {
    if (hasGreeted) return;
    hasGreeted = true;
    appendTyping();
    try {
      const res = await fetch('/api/mare-helper/greet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(currentContext()),
      });
      removeTyping();
      if (!res.ok) {
        appendMessage('assistant', t('mareHelperUnavailable', "I'm having a quiet moment — try again shortly."));
        return;
      }
      const data = await res.json();
      appendMessage('assistant', data.reply);
      history.push({ role: 'assistant', content: data.reply });
      maybeSpeak(data.reply);
    } catch {
      removeTyping();
      appendMessage('assistant', t('mareHelperUnavailable', "I'm having a quiet moment — try again shortly."));
    }
  }

  async function sendMessage(text) {
    appendMessage('user', text);
    history.push({ role: 'user', content: text });
    appendTyping();
    try {
      const res = await fetch('/api/mare-helper/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...currentContext(), message: text, history: history.slice(-10) }),
      });
      removeTyping();
      if (!res.ok) {
        appendMessage('assistant', res.status === 429
          ? t('mareHelperRateLimited', "Let's pause a moment — try again in a little while.")
          : t('mareHelperUnavailable', "I'm having a quiet moment — try again shortly."));
        return;
      }
      const data = await res.json();
      appendMessage('assistant', data.reply);
      history.push({ role: 'assistant', content: data.reply });
      maybeSpeak(data.reply);
    } catch {
      removeTyping();
      appendMessage('assistant', t('mareHelperUnavailable', "I'm having a quiet moment — try again shortly."));
    }
  }

  function openPanel() {
    document.getElementById('mh-panel').hidden = false;
    document.getElementById('mh-greeting-bubble').hidden = true;
    document.getElementById('mh-launcher').setAttribute('aria-expanded', 'true');
    // History is intentionally per-page-load only, not persisted to
    // storage — Mare Helper is a lightweight "quick question" tool,
    // not a saved conversation. Each panel-open within the same page
    // load continues the same in-memory thread; a fresh page load
    // starts clean.
    if (!hasGreeted) sendGreeting();
    document.getElementById('mh-input').focus();
  }
  function closePanel() {
    document.getElementById('mh-panel').hidden = true;
    document.getElementById('mh-launcher').setAttribute('aria-expanded', 'false');
  }
  // Clears the in-memory thread and greeted flag — used when a page
  // wants to open the widget fresh about something specific (a
  // product) rather than continuing whatever was already being
  // discussed. Without this, opening the widget for product B after
  // already chatting about product A would carry A's messages into B's
  // conversation, confusing both the transcript shown and the model's
  // own context.
  function resetConversation() {
    history = [];
    hasGreeted = false;
    document.getElementById('mh-messages').innerHTML = '';
  }

  // Small public API — for pages (like the merchandise storefront)
  // that want to actively open the widget about something specific,
  // rather than waiting for the person to click the launcher
  // themselves. window.MareHelperContext still carries the actual
  // context (see currentContext() above); this just triggers a clean
  // open once that context is set.
  window.MareHelperAPI = {
    openForProduct(productId) {
      window.MareHelperContext = { productId };
      resetConversation();
      openPanel();
    },
    close: () => closePanel(),
  };

  function setupInteractions() {
    document.getElementById('mh-launcher').addEventListener('click', () => {
      const panel = document.getElementById('mh-panel');
      if (panel.hidden) openPanel(); else closePanel();
    });
    document.getElementById('mh-close-btn').addEventListener('click', closePanel);
    document.getElementById('mh-speak-checkbox').addEventListener('change', (e) => {
      speakReplies = e.target.checked;
    });
    document.getElementById('mh-input-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const input = document.getElementById('mh-input');
      const text = input.value.trim();
      if (!text) return;
      input.value = '';
      sendMessage(text);
    });
    document.getElementById('mh-greeting-bubble').addEventListener('click', openPanel);
  }

  // A soft, proactive peek — a small greeting bubble appears near the
  // launcher a few seconds after page load (not the full panel, which
  // would be intrusive), inviting a click without forcing a
  // conversation on anyone who doesn't want one.
  function showGreetingBubble() {
    const panel = document.getElementById('mh-panel');
    if (!panel.hidden) return; // already open, no need for the peek
    const bubble = document.getElementById('mh-greeting-bubble');
    bubble.textContent = t('mareHelperBubble', 'Need a hand? Just ask.');
    bubble.hidden = false;
    setTimeout(() => { if (panel.hidden) bubble.hidden = true; }, 8000);
  }

  function applyLabels() {
    document.getElementById('mh-input').placeholder = t('mareHelperInputPlaceholder', 'Ask Mare anything…');
    document.getElementById('mh-panel-sub').textContent = t('mareHelperPanelSub', "Here to help, or just to talk.");
  }

  function init() {
    setupFocusTracking();
    const root = buildWidget();
    setupInteractions();
    if (window.MareI18n && window.MareI18n.ready) {
      window.MareI18n.ready.then(applyLabels);
    } else {
      applyLabels();
    }
    setTimeout(showGreetingBubble, 4000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
