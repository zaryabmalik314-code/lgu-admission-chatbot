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
  // Matches the LGU admission site: deep green structure + gold call-to-action.
  // ACCENT drives the header, bubble and the student's own messages; GOLD is the
  // send button and interactive highlights, echoing the site's "Apply Now".
  const ACCENT = script?.dataset.accent || '#14532d';
  const GOLD = script?.dataset.gold || '#f4b41a';
  const TITLE = script?.dataset.title || 'LGU Admissions';
  // Speech-recognition language. Urdu (ur-PK) transcribes spoken Urdu to Urdu
  // script, which the bot handles; set data-voice-lang="en-US" for an
  // English-speaking audience.
  const VOICE_LANG = script?.dataset.voiceLang || 'ur-PK';

  const SUGGESTIONS = [
    'BSCS ki fee kitni hai?',
    'Admission criteria kya hai?',
    'How do I apply?',
    'Scholarships available hain?',
  ];

  // A stable per-browser id so the server can rate limit one person without
  // keying on IP — the whole campus shares one NAT address, so an IP bucket
  // would lock out everyone on the wifi at once.
  const SESSION_KEY = 'lgu-chat-session';
  let sessionId;
  try {
    sessionId = localStorage.getItem(SESSION_KEY);
    if (!sessionId) {
      sessionId = (crypto.randomUUID?.() || String(Math.random()).slice(2) + Date.now());
      localStorage.setItem(SESSION_KEY, sessionId);
    }
  } catch {
    // Private mode or blocked storage — fall back to a per-page-load id.
    sessionId = String(Math.random()).slice(2) + Date.now();
  }

  const host = document.createElement('div');
  host.id = 'lgu-chat-root';
  host.style.cssText = 'position:fixed;z-index:2147483000;bottom:0;right:0;';
  document.body.appendChild(host);
  const root = host.attachShadow({ mode: 'open' });

  root.innerHTML = `
    <style>
      :host, * { box-sizing: border-box; }
      .wrap {
        position: fixed; bottom: 20px; right: 20px;
        font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
        font-size: 15px; line-height: 1.5;
      }
      .bubble {
        width: 58px; height: 58px; border-radius: 50%; border: 0;
        background: ${ACCENT}; color: #fff; cursor: pointer;
        box-shadow: 0 6px 24px rgba(0,0,0,.28);
        display: grid; place-items: center;
        transition: transform .18s ease;
      }
      .bubble:hover { transform: scale(1.06); }
      .bubble svg { width: 26px; height: 26px; }

      .panel {
        position: absolute; bottom: 74px; right: 0;
        width: min(94vw, 400px); height: min(76vh, 600px);
        background: #fff; border-radius: 16px; overflow: hidden;
        display: none; flex-direction: column;
        box-shadow: 0 18px 48px rgba(0,0,0,.26);
        border: 1px solid rgba(0,0,0,.08);
      }
      .panel.open { display: flex; }

      header {
        background: ${ACCENT}; color: #fff; padding: 14px 16px;
        display: flex; align-items: center; gap: 10px; flex-shrink: 0;
      }
      header .t { font-weight: 600; font-size: 15px; }
      header .s { font-size: 12px; opacity: .82; }
      header .close {
        background: transparent; border: 0; color: #fff;
        font-size: 22px; line-height: 1; cursor: pointer; opacity: .85; padding: 0 4px;
      }
      header .tts {
        margin-left: auto; background: transparent; border: 0; color: #fff;
        cursor: pointer; opacity: .6; padding: 4px 6px; display: grid; place-items: center;
      }
      header .tts:hover { opacity: .85; }
      header .tts.on { opacity: 1; color: ${GOLD}; }

      .log { flex: 1; overflow-y: auto; padding: 16px; background: #f7f8f7; }
      .msg { margin-bottom: 12px; display: flex; }
      .msg.user { justify-content: flex-end; }
      .b {
        max-width: 84%; padding: 10px 13px; border-radius: 14px;
        white-space: pre-wrap; word-wrap: break-word; overflow-wrap: anywhere;
      }
      .msg.bot .b { background: #fff; border: 1px solid #e6e8e6; border-bottom-left-radius: 4px; }
      .msg.user .b { background: ${ACCENT}; color: #fff; border-bottom-right-radius: 4px; }

      /* Answers arrive as markdown; these keep tables and links readable. */
      .b table { border-collapse: collapse; margin: 8px 0; font-size: 13px; width: 100%; }
      .b th, .b td { border: 1px solid #dfe3df; padding: 5px 8px; text-align: left; }
      .b th { background: #eef2ef; font-weight: 600; }
      .b a { color: ${ACCENT}; }
      .b ul { margin: 6px 0; padding-left: 20px; }
      .b code { background: #eef2ef; padding: 1px 4px; border-radius: 4px; font-size: 13px; }

      .src { margin-top: 6px; font-size: 11.5px; color: #6b736b; }
      .src a { color: #6b736b; }

      .chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 4px; }
      .chip {
        background: #fff; border: 1px solid #d8ded8; border-radius: 999px;
        padding: 6px 11px; font-size: 13px; cursor: pointer; color: #23302a;
      }
      .chip:hover { border-color: ${GOLD}; background: #fffdf5; }

      .dots span {
        display: inline-block; width: 6px; height: 6px; margin-right: 3px;
        border-radius: 50%; background: #9aa39a; animation: bl 1.2s infinite;
      }
      .dots span:nth-child(2) { animation-delay: .2s; }
      .dots span:nth-child(3) { animation-delay: .4s; }
      @keyframes bl { 0%,60%,100% { opacity: .3 } 30% { opacity: 1 } }

      form { display: flex; gap: 8px; padding: 12px; border-top: 1px solid #e6e8e6; background: #fff; flex-shrink: 0; }
      input {
        flex: 1; padding: 10px 13px; border: 1px solid #d8ded8; border-radius: 22px;
        font: inherit; outline: none; min-width: 0;
      }
      input:focus { border-color: ${GOLD}; }
      /* Gold send button with dark-green icon — mirrors the site's "Apply Now". */
      form button {
        background: ${GOLD}; color: ${ACCENT}; border: 0; border-radius: 50%;
        width: 40px; height: 40px; cursor: pointer; flex-shrink: 0;
        display: grid; place-items: center;
      }
      form button:hover { filter: brightness(1.05); }
      form button:disabled { opacity: .45; cursor: default; }
      /* Mic — neutral until listening, then pulses red so it's obvious it's live. */
      .mic {
        background: #eef2ef; color: #40514a; border: 0; border-radius: 50%;
        width: 40px; height: 40px; cursor: pointer; flex-shrink: 0;
        display: grid; place-items: center;
      }
      .mic:hover { background: #e2e9e3; }
      .mic.listening { background: #e53935; color: #fff; animation: pulse 1.3s infinite; }
      @keyframes pulse {
        0% { box-shadow: 0 0 0 0 rgba(229,57,53,.5); }
        70% { box-shadow: 0 0 0 9px rgba(229,57,53,0); }
        100% { box-shadow: 0 0 0 0 rgba(229,57,53,0); }
      }

      @media (max-width: 480px) {
        .wrap { bottom: 14px; right: 14px; }
        .panel { width: calc(100vw - 28px); height: 74vh; }
      }
    </style>

    <div class="wrap">
      <div class="panel" part="panel">
        <header>
          <div>
            <div class="t">${TITLE}</div>
            <div class="s">Fees · Criteria · Apply</div>
          </div>
          <button class="tts" aria-label="Read answers aloud" title="Read answers aloud">
            <svg viewBox="0 0 24 24" width="19" height="19" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3a4.5 4.5 0 00-2.5-4v8a4.5 4.5 0 002.5-4z"/></svg>
          </button>
          <button class="close" aria-label="Close">&times;</button>
        </header>
        <div class="log"></div>
        <form>
          <button type="button" class="mic" aria-label="Speak your question" title="Speak your question">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M12 15a3 3 0 003-3V6a3 3 0 00-6 0v6a3 3 0 003 3z"/><path d="M17 12a5 5 0 01-10 0H5a7 7 0 006 6.92V22h2v-3.08A7 7 0 0019 12h-2z"/></svg>
          </button>
          <input type="text" dir="auto" placeholder="Apna sawal likhein..." autocomplete="off" />
          <button type="submit" aria-label="Send">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M2 21l21-9L2 3v7l15 2-15 2v7z"/></svg>
          </button>
        </form>
      </div>
      <button class="bubble" aria-label="Open admissions chat">
        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 2H4a2 2 0 00-2 2v18l4-4h14a2 2 0 002-2V4a2 2 0 00-2-2z"/></svg>
      </button>
    </div>
  `;

  const $ = (s) => root.querySelector(s);
  const panel = $('.panel');
  const log = $('.log');
  const form = $('form');
  const input = $('input');
  const sendBtn = form.querySelector('button');

  const history = [];
  let busy = false;

  /**
   * Minimal markdown -> HTML. Deliberately not a full parser: the model is
   * instructed to emit only tables, lists, links, bold and code, and escaping
   * first means anything it emits outside that set renders as literal text
   * rather than as markup.
   */
  function md(src) {
    const esc = src
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    const lines = esc.split('\n');
    const out = [];
    let i = 0;

    while (i < lines.length) {
      // Table: a header row followed by a |---|---| separator.
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
      // Bare URLs, but not ones already inside an href we just built.
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

  function showSuggestions() {
    const el = document.createElement('div');
    el.className = 'chips';
    for (const s of SUGGESTIONS) {
      const c = document.createElement('button');
      c.className = 'chip';
      c.type = 'button';
      c.textContent = s;
      c.addEventListener('click', () => {
        el.remove();
        ask(s);
      });
      el.appendChild(c);
    }
    log.appendChild(el);
    log.scrollTop = log.scrollHeight;
  }

  function greet() {
    addMsg(
      'bot',
      md(
        'Assalam-o-Alaikum! Main LGU Admissions ka assistant hoon.\n\nFees, criteria, scholarships ya apply karne ke baare mein kuch bhi poochein.'
      )
    );
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

      // Rate limiting replies with JSON, not a stream — show its message
      // rather than the generic connection error.
      if (res.status === 429) {
        const body = await res.json().catch(() => ({}));
        bubble.innerHTML = md(body.message || 'Thodi der baad koshish karein.');
        return;
      }

      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';

      // Parse SSE by hand — EventSource can't POST.
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

          if (evLine[1] === 'delta') {
            answer += payload.text;
            bubble.innerHTML = md(answer);
            log.scrollTop = log.scrollHeight;
          } else if (evLine[1] === 'done') {
            sources = payload.sources || [];
          } else if (evLine[1] === 'error') {
            answer = payload.message;
            bubble.innerHTML = md(answer);
          }
        }
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
      speak(answer);
    } catch (err) {
      bubble.innerHTML = md(
        'Server se rabta nahi ho saka. Admission Office: 042-37181823'
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

  $('.bubble').addEventListener('click', () => {
    panel.classList.add('open');
    if (!log.children.length) greet();
    input.focus();
  });

  $('.close').addEventListener('click', () => panel.classList.remove('open'));

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') panel.classList.remove('open');
  });

  /* ---------------------------- Voice input --------------------------- */
  // Browser-native speech recognition — no server, no key, no cost. Hidden
  // entirely on browsers that don't support it (mainly Firefox).
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
      rec.interimResults = true; // show words in the box as they're recognised
      rec.continuous = false; // one question per tap

      rec.onstart = () => {
        listening = true;
        micBtn.classList.add('listening');
        input.placeholder = 'Sun raha hoon…';
      };
      rec.onresult = (e) => {
        input.value = Array.from(e.results)
          .map((r) => r[0].transcript)
          .join('');
      };
      rec.onend = () => {
        listening = false;
        micBtn.classList.remove('listening');
        input.placeholder = 'Apna sawal likhein...';
        const q = input.value.trim();
        if (q) {
          input.value = '';
          ask(q); // auto-send what was spoken
        }
      };
      rec.onerror = () => {
        listening = false;
        micBtn.classList.remove('listening');
        input.placeholder = 'Apna sawal likhein...';
      };
      try {
        rec.start();
      } catch {
        /* start() throws if already running — ignore */
      }
    });
  }

  /* ---------------------------- Voice output -------------------------- */
  // Off by default — auto-playing audio is intrusive. The header speaker
  // toggles it; when on, each answer is read aloud.
  const ttsBtn = $('.tts');
  let ttsOn = false;
  const canSpeak = 'speechSynthesis' in window;
  if (!canSpeak) {
    ttsBtn.style.display = 'none';
  } else {
    ttsBtn.addEventListener('click', () => {
      ttsOn = !ttsOn;
      ttsBtn.classList.toggle('on', ttsOn);
      if (!ttsOn) speechSynthesis.cancel();
    });
  }

  function speak(text) {
    if (!ttsOn || !canSpeak || !text) return;
    // Strip markdown so tables and links don't get read as punctuation soup.
    const clean = text
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // [label](url) -> label
      .replace(/https?:\/\/\S+/g, '') // bare URLs
      .replace(/[|#*`_>]/g, ' ') // table pipes, markdown marks
      .replace(/^[\s-]+/gm, '') // list bullets / rules
      .replace(/\s+/g, ' ')
      .trim();
    if (!clean) return;

    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(clean);
    // Urdu script -> an Urdu voice if the device has one; otherwise default.
    const lang = /[؀-ۿ]/.test(text) ? 'ur-PK' : 'en-US';
    u.lang = lang;
    const voices = speechSynthesis.getVoices();
    u.voice =
      voices.find((v) => v.lang === lang) ||
      voices.find((v) => v.lang.startsWith(lang.slice(0, 2))) ||
      null;
    speechSynthesis.speak(u);
  }
})();
