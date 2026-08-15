/**
 * LGU Admissions chat widget.
 *
 * Embed with a single tag on any page:
 *   <script src="https://YOUR-BACKEND/widget.js" data-api="https://YOUR-BACKEND"></script>
 *
 * Everything lives in a shadow root — lgu.edu.pk runs the Avada theme, whose
 * global styles would otherwise rewrite the widget's buttons and inputs.
 */
(function () {
  'use strict';

  if (window.__lguChatLoaded) return;
  window.__lguChatLoaded = true;

  const script = document.currentScript;
  const API = (script?.dataset.api || new URL(script.src).origin).replace(/\/$/, '');
  const ACCENT = script?.dataset.accent || '#14532d';
  const GOLD = script?.dataset.gold || '#f4b41a';
  const TITLE = script?.dataset.title || 'LGU Admissions';
  const VOICE_LANG = script?.dataset.voiceLang || 'ur-PK';

  const LANGS = {
    en: {
      placeholder: 'Type your question...',
      powered: 'Powered by LGU AI',
      listen: 'Listen',
      listening: 'Listening...',
      greeting: "Hi! I'm LGU's admissions assistant.\n\nAsk me about programs, fees, criteria, scholarships, or how to apply.",
      suggestions: ['Fee structure', 'What is CMAI?', 'Admission criteria', 'How to apply?', 'Available scholarships', 'Is CMAI HEC recognized?'],
    },
    ur: {
      placeholder: 'Apna sawal likhein...',
      powered: 'Powered by LGU AI',
      listen: 'Sunein',
      listening: 'Sun raha hoon…',
      greeting: 'Assalam-o-Alaikum! Main LGU Admissions ka assistant hoon.\n\nFees, criteria, scholarships ya apply karne ke baare mein kuch bhi poochein.',
      suggestions: ['Fee structure', 'CMAI kya hai?', 'Is CMAI recognized by HEC?', 'Admission criteria kya hai?', 'Apply kaise karein?', 'Scholarships available hain?'],
    },
  };

  const LK = 'lgu-chat-lang';
  let lang;
  try { lang = localStorage.getItem(LK) || 'ur'; } catch { lang = 'ur'; }
  const L = () => LANGS[lang];

  const SESSION_KEY = 'lgu-chat-session';
  let sessionId;
  try {
    sessionId = localStorage.getItem(SESSION_KEY);
    if (!sessionId) {
      sessionId = (crypto.randomUUID?.() || String(Math.random()).slice(2) + Date.now());
      localStorage.setItem(SESSION_KEY, sessionId);
    }
  } catch {
    sessionId = String(Math.random()).slice(2) + Date.now();
  }

  const host = document.createElement('div');
  host.id = 'lgu-chat-root';
  host.style.cssText = 'position:fixed;z-index:2147483000;bottom:0;right:0;';
  document.body.appendChild(host);
  const root = host.attachShadow({ mode: 'open' });

  root.innerHTML = `
    <style>
      :host, * { box-sizing: border-box; margin: 0; padding: 0; }
      .wrap {
        position: fixed; bottom: 22px; right: 22px;
        font-family: "Segoe UI", system-ui, -apple-system, Roboto, "Helvetica Neue", sans-serif;
        font-size: 15px; line-height: 1.5; -webkit-font-smoothing: antialiased;
      }

      /* ── Launcher bubble ── */
      .bubble {
        width: 62px; height: 62px; border-radius: 50%; border: 0;
        background: linear-gradient(135deg, ${ACCENT} 0%, #1a6b3c 100%);
        color: #fff; cursor: pointer; position: relative;
        box-shadow: 0 8px 32px rgba(20,83,45,.45), 0 2px 8px rgba(0,0,0,.12);
        display: grid; place-items: center;
        transition: transform .28s cubic-bezier(.34,1.56,.64,1), box-shadow .28s;
      }
      .bubble:hover {
        transform: scale(1.1);
        box-shadow: 0 12px 40px rgba(20,83,45,.5), 0 4px 12px rgba(0,0,0,.15);
      }
      .bubble:active { transform: scale(.95); }
      .bubble .ico-chat, .bubble .ico-close {
        position: absolute; width: 26px; height: 26px;
        transition: transform .35s cubic-bezier(.4,0,.2,1), opacity .25s;
      }
      .bubble .ico-close { opacity: 0; transform: rotate(-90deg) scale(.6); }
      .bubble.active .ico-chat { opacity: 0; transform: rotate(90deg) scale(.6); }
      .bubble.active .ico-close { opacity: 1; transform: rotate(0) scale(1); }
      .bubble::after {
        content: ""; position: absolute; inset: 0; border-radius: 50%;
        animation: ring 2.8s ease-out infinite;
      }
      .bubble.active::after { animation: none; }
      @keyframes ring {
        0% { box-shadow: 0 0 0 0 rgba(20,83,45,.3); }
        70% { box-shadow: 0 0 0 16px rgba(20,83,45,0); }
        100% { box-shadow: 0 0 0 0 rgba(20,83,45,0); }
      }

      /* Tooltip label next to the bubble */
      .tooltip {
        position: absolute; right: 72px; top: 50%; transform: translateY(-50%);
        background: #fff; color: #1f2b25; padding: 8px 16px; border-radius: 12px;
        font-size: 13.5px; font-weight: 550; white-space: nowrap;
        box-shadow: 0 4px 20px rgba(0,0,0,.12), 0 1px 4px rgba(0,0,0,.08);
        opacity: 0; pointer-events: none;
        animation: tooltipIn 0.5s 2s cubic-bezier(.2,.8,.3,1) forwards;
      }
      .tooltip::after {
        content: ""; position: absolute; right: -6px; top: 50%; transform: translateY(-50%);
        border: 6px solid transparent; border-left-color: #fff;
      }
      .bubble.active ~ .tooltip { opacity: 0 !important; animation: none; }
      @keyframes tooltipIn {
        from { opacity: 0; transform: translateY(-50%) translateX(8px); }
        to { opacity: 1; transform: translateY(-50%) translateX(0); }
      }

      /* ── Panel ── */
      .panel {
        position: absolute; bottom: 80px; right: 0;
        width: min(94vw, 410px); height: min(80vh, 640px);
        background: #fff; border-radius: 20px; overflow: hidden;
        display: flex; flex-direction: column;
        box-shadow: 0 20px 60px rgba(0,0,0,.18), 0 4px 16px rgba(0,0,0,.08);
        border: 1px solid rgba(0,0,0,.06);
        opacity: 0; visibility: hidden; pointer-events: none;
        transform: translateY(20px) scale(.92); transform-origin: bottom right;
        transition: opacity .3s ease, transform .4s cubic-bezier(.16,1,.3,1), visibility .3s;
      }
      .panel.open {
        opacity: 1; visibility: visible; pointer-events: auto;
        transform: translateY(0) scale(1);
      }

      /* ── Header ── */
      header {
        background: linear-gradient(135deg, ${ACCENT} 0%, #0c3520 60%, #0a2e1b 100%);
        color: #fff; padding: 16px 18px; display: flex; align-items: center; gap: 12px; flex-shrink: 0;
        position: relative; overflow: hidden;
      }
      header::before {
        content: ""; position: absolute; inset: 0;
        background: radial-gradient(circle at 80% 20%, rgba(244,180,26,.08) 0%, transparent 60%);
      }
      header .ava {
        width: 44px; height: 44px; border-radius: 50%; flex-shrink: 0;
        background: #fff; border: 2px solid rgba(255,255,255,.35);
        display: grid; place-items: center; overflow: hidden;
        box-shadow: 0 2px 10px rgba(0,0,0,.15);
        position: relative;
      }
      header .ava img { width: 100%; height: 100%; object-fit: cover; }
      header .meta { min-width: 0; position: relative; }
      header .t { font-weight: 650; font-size: 16px; letter-spacing: .2px; }
      header .s {
        font-size: 12px; opacity: .9; display: flex; align-items: center; gap: 6px; margin-top: 2px;
      }
      header .s .live {
        width: 8px; height: 8px; border-radius: 50%; background: #4ade80;
        box-shadow: 0 0 8px rgba(74,222,128,.9);
        animation: livePulse 2s ease-in-out infinite;
      }
      @keyframes livePulse {
        0%, 100% { opacity: 1; } 50% { opacity: .6; }
      }
      header .close {
        margin-left: auto; background: rgba(255,255,255,.12); border: 0; color: #fff;
        width: 32px; height: 32px; border-radius: 50%;
        font-size: 20px; line-height: 1; cursor: pointer;
        display: grid; place-items: center;
        transition: background .2s, transform .2s;
        position: relative;
      }
      header .close:hover { background: rgba(255,255,255,.22); transform: rotate(90deg); }

      /* ── Per-message "read aloud" control ── */
      .read {
        margin-top: 8px; display: inline-flex; align-items: center; gap: 5px;
        background: transparent; border: 0; cursor: pointer; padding: 2px 0;
        color: ${ACCENT}; font-size: 12px; font-weight: 550; opacity: .7;
        transition: opacity .2s, color .2s;
      }
      .read:hover { opacity: 1; }
      .read.playing { color: #e53935; opacity: 1; }
      .read svg { width: 14px; height: 14px; }

      /* ── Per-message feedback (thumbs) ── */
      .fb { margin-top: 6px; display: inline-flex; align-items: center; gap: 4px; }
      .fb-btn {
        background: transparent; border: 0; cursor: pointer; padding: 3px;
        color: #a3aca4; border-radius: 6px; display: grid; place-items: center;
        opacity: .6; transition: opacity .2s, color .2s, background .2s, transform .15s;
      }
      .fb-btn svg { width: 13px; height: 13px; }
      .fb-btn:hover:not(:disabled) { opacity: 1; background: #eef3ef; color: ${ACCENT}; }
      .fb-btn:active:not(:disabled) { transform: scale(.88); }
      .fb-btn:disabled { cursor: default; }
      .fb.voted .fb-btn:not(.picked) { opacity: .25; }
      .fb-btn.picked { opacity: 1; color: ${ACCENT}; background: #eef3ef; }
      .fb-btn.fb-down.picked { color: #e53935; background: #fdeceb; }
      .wrap.dark .fb-btn { color: #6a7580; }
      .wrap.dark .fb-btn:hover:not(:disabled) { background: #2a3040; color: #8ac4a0; }
      .wrap.dark .fb-btn.picked { color: #8ac4a0; background: #2a3040; }
      .wrap.dark .fb-btn.fb-down.picked { color: #f47069; background: #3a2426; }

      /* ── Chat log ── */
      .log {
        flex: 1; overflow-y: auto; padding: 20px 16px;
        background: linear-gradient(180deg, #f0f4f0 0%, #f7f9f7 100%);
      }
      .log::-webkit-scrollbar { width: 5px; }
      .log::-webkit-scrollbar-thumb { background: rgba(0,0,0,.12); border-radius: 4px; }
      .log::-webkit-scrollbar-track { background: transparent; }

      /* ── Messages ── */
      .msg { margin-bottom: 14px; display: flex; }
      .msg.user { justify-content: flex-end; }
      .msg.bot { animation: msgBot .4s cubic-bezier(.2,.9,.3,1) both; }
      .msg.user { animation: msgUser .35s cubic-bezier(.2,.9,.3,1) both; }
      @keyframes msgBot {
        from { opacity: 0; transform: translateX(-12px) translateY(6px); }
        to { opacity: 1; transform: none; }
      }
      @keyframes msgUser {
        from { opacity: 0; transform: translateX(12px) translateY(6px); }
        to { opacity: 1; transform: none; }
      }
      .b {
        max-width: 84%; padding: 12px 16px; font-size: 14.5px; line-height: 1.6;
        white-space: pre-wrap; word-wrap: break-word; overflow-wrap: anywhere;
      }
      .msg.bot .b {
        background: #fff; color: #1f2b25; border-radius: 18px 18px 18px 6px;
        box-shadow: 0 1px 4px rgba(0,0,0,.06), 0 0 0 1px rgba(0,0,0,.03);
      }
      .msg.user .b {
        background: linear-gradient(135deg, ${ACCENT}, #1a6b3c);
        color: #fff; border-radius: 18px 18px 6px 18px;
        box-shadow: 0 3px 12px rgba(20,83,45,.25);
      }

      /* Markdown in answers */
      .b table { border-collapse: collapse; margin: 10px 0 4px; font-size: 13px; width: 100%; }
      .b th, .b td { border: 1px solid #e0e6e1; padding: 7px 10px; text-align: left; }
      .b th { background: #eef3ef; font-weight: 600; }
      .b a {
        color: ${ACCENT}; font-weight: 550; text-decoration: none;
        border-bottom: 1.5px solid rgba(20,83,45,.25);
        transition: border-color .2s;
      }
      .b a:hover { border-bottom-color: ${ACCENT}; }
      .b ul { margin: 6px 0; padding-left: 20px; }
      .b li { margin: 3px 0; }
      .b code { background: #eef3ef; padding: 1px 5px; border-radius: 5px; font-size: 13px; }
      .b strong { font-weight: 650; }

      .src { margin-top: 8px; font-size: 11px; color: #8a928a; }
      .src a { color: #8a928a; text-decoration: none; border-bottom: 1px dotted #bbb; }
      .src a:hover { color: ${ACCENT}; border-bottom-color: ${ACCENT}; }

      /* ── Suggestion chips ── */
      .chips {
        display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px;
        animation: chipsIn .5s cubic-bezier(.2,.8,.3,1) both;
      }
      @keyframes chipsIn {
        from { opacity: 0; transform: translateY(10px); }
        to { opacity: 1; transform: none; }
      }
      .chip {
        background: #fff; border: 1.5px solid #dde4dd; border-radius: 999px;
        padding: 8px 16px; font-size: 13px; cursor: pointer; color: ${ACCENT}; font-weight: 550;
        box-shadow: 0 1px 3px rgba(0,0,0,.04);
        transition: all .25s cubic-bezier(.2,.8,.3,1);
      }
      .chip:hover {
        border-color: ${GOLD}; background: linear-gradient(135deg, #fffef8, #fffdf2);
        transform: translateY(-2px); box-shadow: 0 6px 16px rgba(244,180,26,.18);
        color: #0e3a1f;
      }
      .chip:active { transform: translateY(0) scale(.97); }

      /* ── Typing indicator ── */
      .dots { display: flex; align-items: center; gap: 5px; padding: 4px 0; }
      .dots span {
        display: block; width: 8px; height: 8px;
        border-radius: 50%; background: ${ACCENT}; opacity: .25;
        animation: bounce 1.4s infinite ease-in-out;
      }
      .dots span:nth-child(1) { animation-delay: 0s; }
      .dots span:nth-child(2) { animation-delay: .2s; }
      .dots span:nth-child(3) { animation-delay: .4s; }
      @keyframes bounce {
        0%, 60%, 100% { transform: translateY(0); opacity: .25; }
        30% { transform: translateY(-8px); opacity: .9; }
      }

      /* ── Input area ── */
      form {
        display: flex; gap: 8px; padding: 14px 16px;
        border-top: 1px solid #eef1ee; background: #fff; flex-shrink: 0;
        align-items: center;
      }
      input {
        flex: 1; padding: 12px 16px; border: 2px solid #e2e8e3; border-radius: 24px;
        font: inherit; font-size: 14.5px; outline: none; min-width: 0; background: #f8faf8;
        transition: border-color .25s, box-shadow .25s, background .25s;
      }
      input:focus {
        border-color: ${GOLD}; background: #fff;
        box-shadow: 0 0 0 4px rgba(244,180,26,.15);
      }
      input::placeholder { color: #9ca89c; }
      .send {
        background: linear-gradient(135deg, ${GOLD}, #e6a817);
        color: ${ACCENT}; border: 0; border-radius: 50%;
        width: 44px; height: 44px; cursor: pointer; flex-shrink: 0;
        display: grid; place-items: center;
        box-shadow: 0 3px 12px rgba(244,180,26,.35);
        transition: transform .2s cubic-bezier(.2,.8,.3,1), box-shadow .2s, filter .2s;
      }
      .send:hover {
        transform: scale(1.08);
        box-shadow: 0 5px 18px rgba(244,180,26,.45);
      }
      .send:active { transform: scale(.95); }
      .send:disabled { opacity: .4; cursor: default; transform: none; box-shadow: none; filter: grayscale(.3); }
      .send svg { transition: transform .2s; }
      .send:not(:disabled):hover svg { transform: translateX(1px); }

      /* Mic button */
      .mic {
        background: #eef3ef; color: #4a5e50; border: 0; border-radius: 50%;
        width: 44px; height: 44px; cursor: pointer; flex-shrink: 0;
        display: grid; place-items: center;
        transition: background .2s, color .2s, transform .2s;
      }
      .mic:hover { background: #e0e8e1; color: ${ACCENT}; transform: scale(1.05); }
      .mic:active { transform: scale(.95); }
      .mic.listening {
        background: #e53935; color: #fff;
        animation: micPulse 1.3s infinite;
      }
      @keyframes micPulse {
        0% { box-shadow: 0 0 0 0 rgba(229,57,53,.45); }
        70% { box-shadow: 0 0 0 10px rgba(229,57,53,0); }
        100% { box-shadow: 0 0 0 0 rgba(229,57,53,0); }
      }

      /* ── Powered-by footer ── */
      .powered {
        text-align: center; padding: 6px; font-size: 10.5px; color: #b0b8b0;
        background: #fff; letter-spacing: .2px;
      }

      /* ── Mobile full-screen ── */
      @media (max-width: 600px) {
        .wrap { bottom: 16px; right: 16px; }
        .tooltip { display: none; }
        .panel {
          position: fixed; top: 0; left: 0; right: 0; bottom: auto;
          width: 100%; height: 100vh; height: 100dvh; max-height: none;
          border-radius: 0; border: 0;
        }
        .panel.open ~ .bubble { display: none; }
      }

      /* ── Dark mode ── */
      .wrap.dark .panel { background: #1a1e2a; border-color: rgba(255,255,255,.08); }
      .wrap.dark .log { background: linear-gradient(180deg, #12161f 0%, #161a24 100%); }
      .wrap.dark .log::-webkit-scrollbar-thumb { background: rgba(255,255,255,.15); }
      .wrap.dark .msg.bot .b {
        background: #242938; color: #dce0e8;
        box-shadow: 0 1px 4px rgba(0,0,0,.2), 0 0 0 1px rgba(255,255,255,.04);
      }
      .wrap.dark .b table { border-color: #333a4a; }
      .wrap.dark .b th, .wrap.dark .b td { border-color: #333a4a; }
      .wrap.dark .b th { background: #2a3040; }
      .wrap.dark .b code { background: #2a3040; color: #c8d0dc; }
      .wrap.dark .src { color: #6a7580; }
      .wrap.dark .src a { color: #6a7580; border-bottom-color: #4a5560; }
      .wrap.dark .chip {
        background: #242938; border-color: #333a4a; color: #8ac4a0;
      }
      .wrap.dark .chip:hover {
        background: #2a3040; border-color: ${GOLD}; color: #c8d8cc;
      }
      .wrap.dark form { background: #1a1e2a; border-top-color: #262c3a; }
      .wrap.dark input {
        background: #242938; border-color: #333a4a; color: #dce0e8;
      }
      .wrap.dark input:focus { background: #2a3040; border-color: ${GOLD}; }
      .wrap.dark input::placeholder { color: #5a6570; }
      .wrap.dark .mic { background: #242938; color: #8a9490; }
      .wrap.dark .mic:hover { background: #2a3040; color: #8ac4a0; }
      .wrap.dark .powered { background: #1a1e2a; color: #4a5460; }
      .wrap.dark .tooltip { background: #242938; color: #dce0e8; box-shadow: 0 4px 20px rgba(0,0,0,.3); }
      .wrap.dark .tooltip::after { border-left-color: #242938; }
      .wrap.dark .dots span { background: #8ac4a0; }
      .wrap.dark .read { color: #8ac4a0; }

      /* Dark-mode toggle */
      .dm-toggle {
        background: rgba(255,255,255,.1); border: 0; color: #fff;
        width: 30px; height: 30px; border-radius: 8px; cursor: pointer;
        display: grid; place-items: center;
        transition: background .25s, transform .25s;
        position: relative; flex-shrink: 0; overflow: hidden;
      }
      .dm-toggle:hover { background: rgba(255,255,255,.2); transform: scale(1.08); }
      .dm-toggle:active { transform: scale(.92); }
      .dm-toggle svg { width: 16px; height: 16px; transition: transform .4s cubic-bezier(.4,0,.2,1), opacity .25s; }
      .dm-toggle .ico-sun { position: absolute; opacity: 0; transform: rotate(90deg) scale(.5); }
      .wrap.dark .dm-toggle .ico-moon { opacity: 0; transform: rotate(-90deg) scale(.5); }
      .wrap.dark .dm-toggle .ico-sun { opacity: 1; transform: rotate(0) scale(1); }

      /* Language toggle */
      .lang-toggle {
        background: rgba(255,255,255,.1); border: 0; color: #fff;
        padding: 2px 8px; border-radius: 8px; cursor: pointer;
        font-size: 11px; font-weight: 700; letter-spacing: .5px;
        transition: background .25s, transform .25s; flex-shrink: 0;
      }
      .lang-toggle:hover { background: rgba(255,255,255,.2); transform: scale(1.08); }
      .lang-toggle:active { transform: scale(.92); }

      @media (prefers-reduced-motion: reduce) {
        *, *::before, *::after {
          animation-duration: 0.01ms !important;
          transition-duration: 0.01ms !important;
        }
      }
    </style>

    <div class="wrap">
      <div class="panel" part="panel">
        <header>
          <div class="ava">
            <img src="https://lgu.edu.pk/wp-content/uploads/2022/05/cropped-lgu_logo-Site-Identity-192x192.png" alt="LGU" />
          </div>
          <div class="meta">
            <div class="t">${TITLE}</div>
            <div class="s"><span class="live"></span>Online</div>
          </div>
          <button class="lang-toggle" aria-label="Switch language">${lang === 'ur' ? 'EN' : 'UR'}</button>
          <button class="dm-toggle" aria-label="Toggle dark mode">
            <svg class="ico-moon" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3a9 9 0 1 0 9 9c0-.46-.04-.92-.1-1.36a5.389 5.389 0 0 1-4.4 2.26 5.403 5.403 0 0 1-3.14-9.8c-.44-.06-.9-.1-1.36-.1z"/></svg>
            <svg class="ico-sun" viewBox="0 0 24 24" fill="currentColor"><path d="M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10zm0-5a1 1 0 0 1 1 1v1a1 1 0 1 1-2 0V3a1 1 0 0 1 1-1zm0 18a1 1 0 0 1 1 1v1a1 1 0 1 1-2 0v-1a1 1 0 0 1 1-1zm9-9a1 1 0 0 1 0 2h-1a1 1 0 1 1 0-2h1zM4 11a1 1 0 0 1 0 2H3a1 1 0 1 1 0-2h1zm14.36-5.95a1 1 0 0 1 0 1.41l-.7.71a1 1 0 0 1-1.42-1.42l.71-.7a1 1 0 0 1 1.41 0zM7.05 17.66a1 1 0 0 1 0 1.41l-.7.71a1 1 0 1 1-1.42-1.42l.71-.7a1 1 0 0 1 1.41 0zm11.9 0a1 1 0 0 1-1.41 0l-.71-.7a1 1 0 0 1 1.42-1.42l.7.71a1 1 0 0 1 0 1.41zM7.05 6.34a1 1 0 0 1-1.41 0l-.71-.7a1 1 0 0 1 1.42-1.42l.7.71a1 1 0 0 1 0 1.41z"/></svg>
          </button>
          <button class="close" aria-label="Close">&times;</button>
        </header>
        <div class="log"></div>
        <form>
          <button type="button" class="mic" aria-label="Speak your question" title="Speak your question">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M12 15a3 3 0 003-3V6a3 3 0 00-6 0v6a3 3 0 003 3z"/><path d="M17 12a5 5 0 01-10 0H5a7 7 0 006 6.92V22h2v-3.08A7 7 0 0019 12h-2z"/></svg>
          </button>
          <input type="text" dir="auto" placeholder="${L().placeholder}" autocomplete="off" />
          <button type="submit" class="send" aria-label="Send">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M2 21l21-9L2 3v7l15 2-15 2v7z"/></svg>
          </button>
        </form>
        <div class="powered">Powered by LGU AI</div>
      </div>
      <button class="bubble" aria-label="Open admissions chat">
        <svg class="ico-chat" viewBox="0 0 24 24" fill="currentColor"><path d="M20 2H4a2 2 0 00-2 2v18l4-4h14a2 2 0 002-2V4a2 2 0 00-2-2z"/></svg>
        <svg class="ico-close" viewBox="0 0 24 24" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
      </button>
      <div class="tooltip">Need help with admissions? 💬</div>
    </div>
  `;

  const $ = (s) => root.querySelector(s);
  const panel = $('.panel');
  const log = $('.log');
  const form = $('form');
  const input = $('input');
  const sendBtn = form.querySelector('.send');
  const bubbleBtn = $('.bubble');

  const wrap = $('.wrap');
  const dmBtn = $('.dm-toggle');
  const DM_KEY = 'lgu-chat-dark';
  function applyDark(on) {
    wrap.classList.toggle('dark', on);
    try { localStorage.setItem(DM_KEY, on ? '1' : '0'); } catch {}
  }
  let darkPref;
  try { darkPref = localStorage.getItem(DM_KEY); } catch {}
  if (darkPref === '1') applyDark(true);
  else if (darkPref === null && matchMedia('(prefers-color-scheme: dark)').matches) applyDark(true);
  dmBtn.addEventListener('click', () => applyDark(!wrap.classList.contains('dark')));

  const langBtn = $('.lang-toggle');
  function applyLang(l) {
    lang = l;
    try { localStorage.setItem(LK, l); } catch {}
    const labels = L();
    langBtn.textContent = l === 'ur' ? 'EN' : 'UR';
    input.placeholder = labels.placeholder;
    root.querySelector('.powered').textContent = labels.powered;
  }
  langBtn.addEventListener('click', () => {
    applyLang(lang === 'ur' ? 'en' : 'ur');
  });

  const history = [];
  let busy = false;

  function md(src) {
    const esc = src
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    const lines = esc.split('\n');
    const out = [];
    let i = 0;

    while (i < lines.length) {
      if (/^\s*\|.*\|\s*$/.test(lines[i]) && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1] || '')) {
        const cells = (r) =>
          r.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
        const head = cells(lines[i]);
        i += 2;
        const rows = [];
        while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) rows.push(cells(lines[i++]));
        out.push(
          `<table><thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>` +
            rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('') +
            '</tbody></table>'
        );
        continue;
      }

      if (/^\s*[-*]\s+/.test(lines[i])) {
        const items = [];
        while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
          items.push(lines[i++].replace(/^\s*[-*]\s+/, ''));
        }
        out.push(`<ul>${items.map((t) => `<li>${t}</li>`).join('')}</ul>`);
        continue;
      }

      out.push(lines[i++]);
    }

    return out
      .join('\n')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
      .replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, '$1<a href="$2" target="_blank" rel="noopener">$2</a>')
      .replace(/\n{3,}/g, '\n\n');
  }

  function addMsg(who, html) {
    const el = document.createElement('div');
    el.className = `msg ${who}`;
    el.innerHTML = `<div class="b">${html}</div>`;
    log.appendChild(el);
    log.scrollTop = log.scrollHeight;
    return el.querySelector('.b');
  }

  function showChips(items, cls) {
    const el = document.createElement('div');
    el.className = 'chips' + (cls ? ' ' + cls : '');
    for (const s of items) {
      const c = document.createElement('button');
      c.className = 'chip';
      c.type = 'button';
      c.textContent = s;
      c.addEventListener('click', () => {
        root.querySelectorAll('.chips').forEach((ch) => ch.remove());
        ask(s);
      });
      el.appendChild(c);
    }
    log.appendChild(el);
    log.scrollTop = log.scrollHeight;
  }

  function showSuggestions() {
    showChips(L().suggestions);
  }

  function getFollowUps(question) {
    const q = question.toLowerCase();
    const pgm = q.match(/\b(bscs|bsse|bsit|bsds|bsai|cmai|bba|mba|bsms|mscs|mcs|bsaf|pharmd|dpt|llb)\b/i);
    const p = pgm ? pgm[1].toUpperCase() : null;

    if (/fee|fees|tuition|cost|kitni|paisa/.test(q))
      return p ? [`${p} criteria`, 'Scholarships', 'How to apply'] : ['Scholarships', 'How to apply', 'Required documents'];
    if (/criteria|eligibility|marks|merit|percentage|kitne/.test(q))
      return p ? [`${p} fee`, 'How to apply', 'Scholarships'] : ['Fee structure', 'How to apply', 'Entry test dates'];
    if (/scholarship|wazifa/.test(q))
      return ['How to apply', 'Fee structure', 'Required documents'];
    if (/apply|admission|dakhla|form/.test(q))
      return ['Required documents', 'Entry test dates', 'Fee structure'];
    if (/document|kagaz|dastawez|required|submit/.test(q))
      return ['How to apply', 'Entry test dates', 'Fee structure'];
    if (/test|entry|imtihan/.test(q))
      return ['How to apply', 'Required documents', 'Admission criteria'];
    if (/program|degree|course|offered/.test(q))
      return ['Fee structure', 'Admission criteria', 'How to apply'];
    if (/hostel|transport|bus|campus/.test(q))
      return ['Fee structure', 'How to apply', 'Programs offered'];
    return ['Fee structure', 'Admission criteria', 'How to apply'];
  }

  function greet() {
    addMsg('bot', md(L().greeting));
    showSuggestions();
  }

  async function ask(question) {
    if (busy) return;
    busy = true;
    sendBtn.disabled = true;

    addMsg('user', md(question));
    const bubble = addMsg('bot', '<span class="dots"><span></span><span></span><span></span></span>');

    let answer = '';
    let sources = [];

    try {
      const res = await fetch(`${API}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-lgu-session': sessionId },
        body: JSON.stringify({ message: question, history: history.slice(-6) }),
      });

      if (res.status === 429) {
        const body = await res.json().catch(() => ({}));
        bubble.innerHTML = md(body.message || 'Thodi der baad koshish karein.');
        return;
      }

      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      let currentTier = '';
      let currentIntent = '';
      const pendingDeltas = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });

        const frames = buf.split('\n\n');
        buf = frames.pop() || '';

        for (const frame of frames) {
          const evLine = frame.match(/^event:\s*(.+)$/m);
          const dataLine = frame.match(/^data:\s*(.+)$/m);
          if (!evLine || !dataLine) continue;

          let payload;
          try {
            payload = JSON.parse(dataLine[1]);
          } catch {
            continue;
          }

          if (evLine[1] === 'meta') {
            currentTier = payload.tier;
            currentIntent = payload.intent || '';
          } else if (evLine[1] === 'delta') {
            if (currentTier === 'faq' || currentTier === 'cache') {
              pendingDeltas.push(payload.text);
            } else {
              answer += payload.text;
              bubble.innerHTML = md(answer);
              log.scrollTop = log.scrollHeight;
            }
          } else if (evLine[1] === 'done') {
            sources = payload.sources || [];
          } else if (evLine[1] === 'error') {
            answer = payload.message;
            bubble.innerHTML = md(answer);
          }
        }
      }

      if (pendingDeltas.length) {
        await new Promise((r) => setTimeout(r, 400));
        answer = pendingDeltas.join('');
        bubble.innerHTML = md(answer);
      }

      if (!answer) {
        answer = 'Maazrat, jawab nahi mila. Dobara koshish karein.';
        bubble.innerHTML = md(answer);
      }

      if (sources.length) {
        const s = document.createElement('div');
        s.className = 'src';
        s.innerHTML =
          'Source: ' +
          sources
            .slice(0, 2)
            .map((u) => `<a href="${u}" target="_blank" rel="noopener">${new URL(u).pathname}</a>`)
            .join(' · ');
        bubble.appendChild(s);
      }

      history.push({ role: 'user', content: question }, { role: 'assistant', content: answer });
      attachReadAloud(bubble, answer);
      attachFeedback(bubble, question, answer, currentTier, currentIntent);
      showChips(getFollowUps(question), 'follow-chips');
    } catch (err) {
      bubble.innerHTML = md(
        'Server se rabta nahi ho saka. Admission Office: 042-37181823 / 0322-2757543'
      );
    } finally {
      busy = false;
      sendBtn.disabled = false;
      input.focus();
      log.scrollTop = log.scrollHeight;
    }
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const q = input.value.trim();
    if (!q) return;
    input.value = '';
    ask(q);
  });

  const vv = window.visualViewport;
  function fitViewport() {
    const mobile = matchMedia('(max-width: 600px)').matches;
    if (vv && mobile && panel.classList.contains('open')) {
      panel.style.height = vv.height + 'px';
      panel.style.top = vv.offsetTop + 'px';
    } else {
      panel.style.height = '';
      panel.style.top = '';
    }
  }
  if (vv) {
    vv.addEventListener('resize', fitViewport);
    vv.addEventListener('scroll', fitViewport);
  }

  function openPanel() {
    panel.classList.add('open');
    bubbleBtn.classList.add('active');
    if (!log.children.length) greet();
    fitViewport();
    input.focus();
  }
  function closePanel() {
    panel.classList.remove('open');
    bubbleBtn.classList.remove('active');
    fitViewport();
  }

  bubbleBtn.addEventListener('click', () => {
    panel.classList.contains('open') ? closePanel() : openPanel();
  });
  $('.close').addEventListener('click', closePanel);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closePanel();
  });

  /* ---------------------------- Voice input --------------------------- */
  const micBtn = $('.mic');
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    micBtn.style.display = 'none';
  } else {
    let rec = null;
    let listening = false;

    micBtn.addEventListener('click', () => {
      if (listening) {
        rec?.stop();
        return;
      }
      rec = new SR();
      rec.lang = VOICE_LANG;
      rec.interimResults = true;
      rec.continuous = false;

      rec.onstart = () => {
        listening = true;
        micBtn.classList.add('listening');
        input.placeholder = L().listening;
      };
      rec.onresult = (e) => {
        input.value = Array.from(e.results)
          .map((r) => r[0].transcript)
          .join('');
      };
      rec.onend = () => {
        listening = false;
        micBtn.classList.remove('listening');
        input.placeholder = L().placeholder;
        const q = input.value.trim();
        if (q) {
          input.value = '';
          ask(q);
        }
      };
      rec.onerror = () => {
        listening = false;
        micBtn.classList.remove('listening');
        input.placeholder = L().placeholder;
      };
      try {
        rec.start();
      } catch {
        /* start() throws if already running — ignore */
      }
    });
  }

  /* ---------------------------- Voice output -------------------------- */
  const canSpeak = 'speechSynthesis' in window;
  const SPEAKER_SVG =
    '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3a4.5 4.5 0 00-2.5-4v8a4.5 4.5 0 002.5-4z"/></svg>';

  function speakText(text, btn) {
    const clean = text
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/https?:\/\/\S+/g, '')
      .replace(/[|#*`_>]/g, ' ')
      .replace(/^[\s-]+/gm, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!clean) return;

    speechSynthesis.cancel();
    root.querySelectorAll('.read.playing').forEach((b) => b.classList.remove('playing'));

    const u = new SpeechSynthesisUtterance(clean);
    const lang = /[؀-ۿ]/.test(text) ? 'ur-PK' : 'en-US';
    u.lang = lang;
    const voices = speechSynthesis.getVoices();
    u.voice =
      voices.find((v) => v.lang === lang) ||
      voices.find((v) => v.lang.startsWith(lang.slice(0, 2))) ||
      null;

    btn.classList.add('playing');
    u.onend = () => btn.classList.remove('playing');
    u.onerror = () => btn.classList.remove('playing');
    speechSynthesis.speak(u);
  }

  function attachReadAloud(bubble, text) {
    if (!canSpeak || !text) return;
    const btn = document.createElement('button');
    btn.className = 'read';
    btn.type = 'button';
    btn.innerHTML = `${SPEAKER_SVG}<span>${L().listen}</span>`;
    btn.addEventListener('click', () => {
      if (btn.classList.contains('playing')) {
        speechSynthesis.cancel();
        btn.classList.remove('playing');
      } else {
        speakText(text, btn);
      }
    });
    bubble.appendChild(btn);
  }

  function attachFeedback(bubble, question, answer, tier, intentId) {
    const wrap = document.createElement('div');
    wrap.className = 'fb';

    const vote = (rating, btn, otherBtn) => {
      if (wrap.classList.contains('voted')) return;
      wrap.classList.add('voted');
      btn.classList.add('picked');
      otherBtn.disabled = true;
      fetch(`${API}/api/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, answer, tier, intentId, rating }),
      }).catch(() => {});
    };

    const up = document.createElement('button');
    up.type = 'button';
    up.className = 'fb-btn';
    up.setAttribute('aria-label', 'Helpful answer');
    up.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M2 21h2a1 1 0 001-1v-9a1 1 0 00-1-1H2v11zM22.71 10.29l-3.79-3.79a1 1 0 01-.29-.7V3a2 2 0 00-2-2h-.28a1 1 0 00-.95.68L13 8H8a2 2 0 00-2 2v9a2 2 0 002 2h9.28a2 2 0 001.94-1.51l1.66-6.5a2 2 0 00-.17-1.7z"/></svg>';

    const down = document.createElement('button');
    down.type = 'button';
    down.className = 'fb-btn fb-down';
    down.setAttribute('aria-label', 'Unhelpful answer');
    down.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M22 3h-2a1 1 0 00-1 1v9a1 1 0 001 1h2V3zM1.29 13.71l3.79 3.79c.18.18.29.43.29.7V21a2 2 0 002 2h.28a1 1 0 00.95-.68L11 16h5a2 2 0 002-2V5a2 2 0 00-2-2H6.72a2 2 0 00-1.94 1.51l-1.66 6.5a2 2 0 00.17 1.7z"/></svg>';

    up.addEventListener('click', () => vote('up', up, down));
    down.addEventListener('click', () => vote('down', down, up));

    wrap.appendChild(up);
    wrap.appendChild(down);
    bubble.appendChild(wrap);
  }
})();
