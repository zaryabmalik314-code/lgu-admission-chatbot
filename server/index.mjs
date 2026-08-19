/**
 * LGU admission chatbot API.
 *
 * POST /api/chat  -> SSE stream of answer deltas
 * GET  /api/health
 * GET  /widget.js -> the embeddable widget (served from the same origin so a
 *                    site owner only needs one <script> tag)
 */
import express from 'express';
import cors from 'cors';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { search, loadIndex } from './retrieve.mjs';
import { matchFaq, isNarrowEnoughForCannedAnswer, FACTS, mentionsProgram, PROGRAM_PATTERN, detectLangSwitch } from './faq.mjs';
import { checkRateLimit, rateLimitStats } from './ratelimit.mjs';
import { answerStream, isConfigured, describeProvider, ALL_PROVIDERS_FAILED_FALLBACK } from './llm.mjs';
import { getCached, setCached, cacheStats } from './cache.mjs';
import { trackQuestion, trackFeedback, trackUnanswered, analyticsStats, subscribeAnalytics } from './analytics.mjs';
import { webSearch } from './websearch.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = process.env.PORT || 3000;
const RETRIEVE_K = Number(process.env.RETRIEVE_K) || 6;

/**
 * The answer to give when the LLM can't run — no key, or the provider is out of
 * quota. Falls back to the best FAQ text, then to links for the pages retrieval
 * found, then to the office. Never a dead end: even with the token budget
 * exhausted, a student still gets pointed at the right page.
 */
function fallbackAnswer(faq, cited) {
  if (faq) return faq.answer;
  if (cited.length) {
    return (
      'Is ka jawab in pages par hai:\n\n' +
      cited
        .slice(0, 3)
        .map((c) => `- [${c.title}](${c.url})`)
        .join('\n')
    );
  }
  return `Is ka jawab mere paas nahi hai. Admission Office: ${FACTS.admissionOffice} / ${FACTS.admissionMobile} · ${FACTS.email}`;
}

const app = express();
app.use(express.json({ limit: '64kb' }));

// The widget is embedded on lgu.edu.pk but also needs to work from the demo
// page and any staging host, so the allowlist is env-driven with a permissive
// default for local development.
const ALLOWED = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, cb) {
      if (!origin) return cb(null, true); // curl, same-origin
      if (!ALLOWED.length) return cb(null, true); // unset = open (dev)
      cb(null, ALLOWED.includes(origin));
    },
    allowedHeaders: ['Content-Type', 'x-lgu-session'],
  })
);

app.use('/widget.js', express.static(join(ROOT, 'widget', 'lgu-chat.js')));
app.use('/demo', express.static(join(ROOT, 'demo')));
app.use('/dashboard', express.static(join(ROOT, 'dashboard')));
app.get('/', (req, res) => res.redirect('/demo/'));

const DASH_PASS = process.env.DASHBOARD_PASSWORD || '';
function dashAuth(req, res, next) {
  if (!DASH_PASS) return next();
  const token = req.get('x-dashboard-auth') || req.query.token;
  if (token === DASH_PASS) return next();
  return res.status(401).json({ error: 'unauthorized' });
}

app.get('/api/health', async (req, res) => {
  const idx = await loadIndex();
  res.json({
    ok: true,
    chunks: idx.docs.length,
    scrapedAt: idx.scrapedAt,
    source: idx.source,
    llm: describeProvider(),
    llmReady: isConfigured() ? true : 'missing API key — running FAQ-only',
    rate: rateLimitStats(),
    cache: cacheStats(),
  });
});

app.get('/api/analytics', dashAuth, (req, res) => {
  res.json(analyticsStats());
});

app.get('/api/analytics/live', dashAuth, (req, res) => {
  subscribeAnalytics(req, res);
});

app.post('/api/feedback', (req, res) => {
  const rating = req.body?.rating;
  const question = String(req.body?.question || '').slice(0, 500);
  const answer = String(req.body?.answer || '').slice(0, 2000);
  const tier = req.body?.tier ? String(req.body.tier).slice(0, 30) : undefined;
  const intentId = req.body?.intentId ? String(req.body.intentId).slice(0, 60) : undefined;

  if ((rating !== 'up' && rating !== 'down') || !question) {
    return res.status(400).json({ error: 'rating (up|down) and question are required' });
  }

  trackFeedback(question, answer, tier, intentId, rating);
  res.json({ ok: true });
});

function sse(res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  return {
    send(event, data) {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    },
    end() {
      res.end();
    },
  };
}

app.post('/api/chat', async (req, res) => {
  const question = String(req.body?.message || '').slice(0, 2000).trim();
  const history = Array.isArray(req.body?.history) ? req.body.history : [];
  const clientLang = req.body?.lang || null;
  const switchLang = detectLangSwitch(question);
  const effectiveLang = switchLang || clientLang;

  if (!question) {
    return res.status(400).json({ error: 'message is required' });
  }

  // Checked before any work is done, so a blocked request costs nothing.
  const limit = checkRateLimit(req.get('x-lgu-session'));
  if (!limit.allowed) {
    const msg =
      limit.scope === 'global'
        ? `Abhi bohot zyada sawal aa rahe hain. Thodi der baad koshish karein, ya Admission Office se rabta karein: ${FACTS.admissionOffice} / ${FACTS.admissionMobile}`
        : limit.scope === 'quota'
        ? `Aap ke aaj ke ${limit.dailyMax} messages poore ho gaye. Kal dobara koshish karein, ya Admission Office se rabta karein: ${FACTS.admissionOffice} / ${FACTS.admissionMobile}`
        : `Aap ne bohot tezi se kai sawal poochh liye. Thodi der ruk kar dobara koshish karein.`;
    res.set('Retry-After', String(limit.retryAfter));
    return res.status(429).json({ error: 'rate_limited', scope: limit.scope, message: msg });
  }

  const stream = sse(res);

  // Must be `res`, not `req`: the request's readable side closes as soon as the
  // body has been parsed, so a `req` listener fires immediately on every call
  // and would suppress every delta. `res` closes when the client actually goes
  // away, which is what we want to stop generating for.
  let closed = false;
  res.on('close', () => {
    closed = true;
  });

  // Hoisted so the catch can fall back to them if the LLM call fails.
  let faq = null;
  let cited = [];
  let streamedAny = false;

  try {
    faq = matchFaq(question, history);

    // Tier 1 — a clean FAQ hit answers instantly, for free.
    if (faq && isNarrowEnoughForCannedAnswer(question, faq)) {
      trackQuestion(question, 'faq', faq.id);
      if (faq.id === 'gibberish') trackUnanswered(question, 'gibberish');
      stream.send('meta', { tier: 'faq', intent: faq.id });
      stream.send('delta', { text: faq.answer });
      stream.send('done', { sources: faq.sources });
      return stream.end();
    }

    // Tier 1.5 — an exact repeat of a fresh question that already paid for an
    // LLM call once. Only cacheable with no prior history: a mid-conversation
    // question can mean something history-dependent that the same text would
    // answer differently in a different conversation (see cache.mjs).
    const cacheable = history.length === 0;
    if (cacheable) {
      const cached = getCached(question);
      if (cached) {
        trackQuestion(question, 'cache', faq?.id);
        stream.send('meta', { tier: 'cache', intent: faq?.id });
        stream.send('delta', { text: cached.text });
        stream.send('done', { sources: cached.sources });
        return stream.end();
      }
    }

    // Tier 2 — retrieve, then ground the model on what we found.
    // Retrieved context is the bulk of the input tokens, so this is the main
    // cost dial after the model choice. Below ~5 the combined fee-structure
    // page starts dropping out of range on program-specific fee questions.
    //
    // When the question uses pronouns ("this program", "iska roadmap"),
    // BM25 has no program-specific tokens to match. Pull program names
    // from the last few turns so retrieval finds the right page.
    let retrievalQuery = question;
    if (!mentionsProgram(question) && history.length) {
      const recent = history.slice(-4).map((m) => m.content).join(' ');
      const programs = recent.match(new RegExp(PROGRAM_PATTERN.source, 'gi'));
      if (programs) retrievalQuery = question + ' ' + [...new Set(programs)].join(' ');
    }
    const k = faq ? 4 : RETRIEVE_K;
    const chunks = await search(retrievalQuery, k);
    // Header chunks ride along as context but weren't matched by the query, so
    // they don't belong in the citation list shown to the student.
    cited = chunks.filter((c) => !c.isHeader);

    // Web search fallback — when the scraped KB doesn't cover the topic well,
    // search the web (scoped to LGU) for extra context. Only fires on pure
    // RAG queries (no FAQ match) with weak BM25 scores.
    const topScore = cited[0]?.score ?? 0;
    if (!faq && topScore < 3 && isConfigured()) {
      try {
        const webResults = await webSearch(question);
        for (const r of webResults) {
          chunks.push({
            title: `[Web] ${r.title}`,
            url: r.url,
            text: r.snippet,
            score: 0,
            isWeb: true,
          });
        }
        if (webResults.length) {
          const webCited = webResults.map((r) => ({ title: r.title, url: r.url }));
          cited.push(...webCited);
        }
      } catch { /* non-fatal */ }
    }

    if (!isConfigured()) {
      trackUnanswered(question, 'no-llm-key');
      stream.send('meta', { tier: 'faq-fallback' });
      stream.send('delta', { text: fallbackAnswer(faq, cited) });
      stream.send('done', { sources: cited.slice(0, 3).map((c) => c.url) });
      return stream.end();
    }

    const usedWeb = chunks.some((c) => c.isWeb);
    const tier = faq ? 'hybrid' : usedWeb ? 'rag+web' : 'rag';
    trackQuestion(question, tier, faq?.id);
    const meta = { tier, intent: faq?.id, sources: cited.map((c) => c.url) };
    if (switchLang) meta.setLang = switchLang;
    stream.send('meta', meta);

    const fullAnswer = await answerStream({
      question,
      history,
      chunks,
      faqHint: faq?.answer,
      prefer: faq ? 'groq' : 'gemini',
      maxTokens: faq ? 400 : 800,
      lang: effectiveLang,
      onDelta: (text) => {
        if (!closed) {
          streamedAny = true;
          stream.send('delta', { text });
        }
      },
    });

    const sources = [...new Set(cited.slice(0, 3).map((c) => c.url))];
    stream.send('done', { sources });
    stream.end();

    if (fullAnswer === ALL_PROVIDERS_FAILED_FALLBACK) {
      trackUnanswered(question, 'all-providers-failed');
    }

    if (cacheable && fullAnswer && fullAnswer !== ALL_PROVIDERS_FAILED_FALLBACK) {
      setCached(question, { text: fullAnswer, sources });
    }
  } catch (err) {
    const rateLimited = err?.status === 429;
    console.error(rateLimited ? 'chat error: LLM rate limited' : 'chat error:', err);
    trackUnanswered(question, rateLimited ? 'rate-limited' : 'llm-error');

    // If nothing streamed yet (the usual case — rate limits and provider errors
    // hit on the first call), degrade to the same answer the no-key path gives:
    // the FAQ text or links to the pages retrieval found. A quota outage should
    // still point students somewhere useful, not dead-end them.
    if (!streamedAny && !closed) {
      stream.send('delta', { text: fallbackAnswer(faq, cited) });
      stream.send('done', { sources: cited.slice(0, 3).map((c) => c.url) });
    } else {
      stream.send('error', {
        message: `Maazrat, abhi jawab mukammal nahi ho saka. Admission Office: ${FACTS.admissionOffice} / ${FACTS.admissionMobile}`,
      });
    }
    stream.end();
  }
});

app.listen(PORT, () => {
  console.log(`LGU admission chatbot on http://localhost:${PORT}`);
  console.log(`  demo:   http://localhost:${PORT}/demo/`);
  console.log(`  widget: http://localhost:${PORT}/widget.js`);
  console.log(`  model:  ${describeProvider()}`);
  if (!isConfigured()) console.log('  NOTE: no API key set — running FAQ-only.');
});
