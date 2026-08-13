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
import { matchFaq, isNarrowEnoughForCannedAnswer, FACTS } from './faq.mjs';
import { checkRateLimit, rateLimitStats } from './ratelimit.mjs';
import { answerStream, isConfigured, describeProvider } from './llm.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = process.env.PORT || 3000;
const RETRIEVE_K = Number(process.env.RETRIEVE_K) || 6;

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

  try {
    const faq = matchFaq(question);

    // Tier 1 — a clean FAQ hit answers instantly, for free.
    if (faq && isNarrowEnoughForCannedAnswer(question, faq)) {
      stream.send('meta', { tier: 'faq', intent: faq.id });
      stream.send('delta', { text: faq.answer });
      stream.send('done', { sources: faq.sources });
      return stream.end();
    }

    // Tier 2 — retrieve, then ground the model on what we found.
    // Retrieved context is the bulk of the input tokens, so this is the main
    // cost dial after the model choice. Below ~5 the combined fee-structure
    // page starts dropping out of range on program-specific fee questions.
    const chunks = await search(question, RETRIEVE_K);
    // Header chunks ride along as context but weren't matched by the query, so
    // they don't belong in the citation list shown to the student.
    const cited = chunks.filter((c) => !c.isHeader);

    if (!isConfigured()) {
      // Without a key the bot still works, just narrower: hand back the best
      // FAQ match or point at the pages retrieval found.
      const text = faq
        ? faq.answer
        : cited.length
          ? `Is ka jawab in pages par hai:\n\n${cited
              .slice(0, 3)
              .map((c) => `- [${c.title}](${c.url})`)
              .join('\n')}`
          : `Is ka jawab mere paas nahi hai. Admission Office: ${FACTS.admissionOffice} · ${FACTS.email}`;
      stream.send('meta', { tier: 'faq-fallback' });
      stream.send('delta', { text });
      stream.send('done', { sources: cited.slice(0, 3).map((c) => c.url) });
      return stream.end();
    }

    stream.send('meta', { tier: faq ? 'hybrid' : 'rag', sources: cited.map((c) => c.url) });

    await answerStream({
      question,
      history,
      chunks,
      faqHint: faq?.answer,
      onDelta: (text) => {
        if (!closed) stream.send('delta', { text });
      },
    });

    stream.send('done', {
      sources: [...new Set(cited.slice(0, 3).map((c) => c.url))],
    });
    stream.end();
  } catch (err) {
    console.error('chat error:', err);
    // The stream headers are already sent, so the error has to travel as an
    // event rather than an HTTP status.
    stream.send('error', {
      message: `Maazrat, abhi jawab nahi de saka. Admission Office: ${FACTS.admissionOffice}`,
    });
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
