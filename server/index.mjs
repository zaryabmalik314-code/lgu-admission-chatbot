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
import { matchFaq, isNarrowEnoughForCannedAnswer, FACTS, mentionsProgram, PROGRAM_PATTERN } from './faq.mjs';
import { checkRateLimit, rateLimitStats } from './ratelimit.mjs';
import { answerStream, isConfigured, describeProvider, ALL_PROVIDERS_FAILED_FALLBACK } from './llm.mjs';
import { getCached, setCached, cacheStats } from './cache.mjs';

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
  return `Is ka jawab mere paas nahi hai. Admission Office: ${FACTS.admissionOffice} · ${FACTS.email}`;
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
app.get('/', (req, res) => res.redirect('/demo/'));

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

  if (!question) {
    return res.status(400).json({ error: 'message is required' });
  }

  // Checked before any work is done, so a blocked request costs nothing.
  const limit = checkRateLimit(req.get('x-lgu-session'));
  if (!limit.allowed) {
    const msg =
      limit.scope === 'global'
        ? `Abhi bohot zyada sawal aa rahe hain. Thodi der baad koshish karein, ya Admission Office se rabta karein: ${FACTS.admissionOffice}`
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
    const chunks = await search(retrievalQuery, RETRIEVE_K);
    // Header chunks ride along as context but weren't matched by the query, so
    // they don't belong in the citation list shown to the student.
    cited = chunks.filter((c) => !c.isHeader);

    if (!isConfigured()) {
      // Without a key the bot still works, just narrower: hand back the best
      // FAQ match or point at the pages retrieval found.
      stream.send('meta', { tier: 'faq-fallback' });
      stream.send('delta', { text: fallbackAnswer(faq, cited) });
      stream.send('done', { sources: cited.slice(0, 3).map((c) => c.url) });
      return stream.end();
    }

    stream.send('meta', { tier: faq ? 'hybrid' : 'rag', sources: cited.map((c) => c.url) });

    const fullAnswer = await answerStream({
      question,
      history,
      chunks,
      faqHint: faq?.answer,
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

    // Skip caching the "every provider failed" message — that's a transient
    // outage, not an answer worth replaying to the next student.
    if (cacheable && fullAnswer && fullAnswer !== ALL_PROVIDERS_FAILED_FALLBACK) {
      setCached(question, { text: fullAnswer, sources });
    }
  } catch (err) {
    const rateLimited = err?.status === 429;
    console.error(rateLimited ? 'chat error: LLM rate limited' : 'chat error:', err);

    // If nothing streamed yet (the usual case — rate limits and provider errors
    // hit on the first call), degrade to the same answer the no-key path gives:
    // the FAQ text or links to the pages retrieval found. A quota outage should
    // still point students somewhere useful, not dead-end them.
    if (!streamedAny && !closed) {
      stream.send('delta', { text: fallbackAnswer(faq, cited) });
      stream.send('done', { sources: cited.slice(0, 3).map((c) => c.url) });
    } else {
      stream.send('error', {
        message: `Maazrat, abhi jawab mukammal nahi ho saka. Admission Office: ${FACTS.admissionOffice}`,
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
