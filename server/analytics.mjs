/**
 * Lightweight in-memory analytics for tracking chatbot usage patterns.
 *
 * Resets on redeploy like the cache — that's fine for spotting trends
 * within a traffic window. For durable analytics, pipe these stats to
 * an external store later.
 */

const counters = {
  totalQuestions: 0,
  tierHits: { faq: 0, cache: 0, rag: 0, hybrid: 0, 'faq-fallback': 0 },
  intentHits: {},
  topQuestions: new Map(),
  tokenEstimates: { input: 0, output: 0 },
  providerHits: {},
  costSavedByCache: 0,
  costSavedByFaq: 0,
};

const feedback = {
  up: 0,
  down: 0,
  recentDown: [],
};

const unanswered = [];

const TOP_Q_LIMIT = 50;
const RECENT_DOWN_LIMIT = 30;
const UNANSWERED_LIMIT = 50;

const liveClients = new Set();

function broadcast() {
  const data = JSON.stringify(analyticsStats());
  for (const res of liveClients) {
    try { res.write(`data: ${data}\n\n`); } catch { liveClients.delete(res); }
  }
}

export function subscribeAnalytics(req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write(`data: ${JSON.stringify(analyticsStats())}\n\n`);
  liveClients.add(res);
  req.on('close', () => liveClients.delete(res));
}

function normalize(q) {
  return q.toLowerCase().trim().replace(/\s+/g, ' ').replace(/[?.!]+$/, '');
}

const AVG_INPUT_TOKENS = { hybrid: 1200, rag: 2400 };
const AVG_OUTPUT_TOKENS = { hybrid: 200, rag: 400 };

export function trackQuestion(question, tier, intentId) {
  counters.totalQuestions++;

  if (tier && counters.tierHits[tier] !== undefined) {
    counters.tierHits[tier]++;
  } else if (tier) {
    counters.tierHits[tier] = 1;
  }

  if (tier === 'faq' || tier === 'faq-fallback') counters.costSavedByFaq++;
  if (tier === 'cache') counters.costSavedByCache++;

  if (tier === 'hybrid' || tier === 'rag') {
    counters.tokenEstimates.input += AVG_INPUT_TOKENS[tier];
    counters.tokenEstimates.output += AVG_OUTPUT_TOKENS[tier];
  }

  if (intentId) {
    counters.intentHits[intentId] = (counters.intentHits[intentId] || 0) + 1;
  }

  const key = normalize(question);
  const count = (counters.topQuestions.get(key) || 0) + 1;
  counters.topQuestions.set(key, count);
  if (counters.topQuestions.size > TOP_Q_LIMIT * 2) {
    const sorted = [...counters.topQuestions.entries()].sort((a, b) => b[1] - a[1]);
    counters.topQuestions = new Map(sorted.slice(0, TOP_Q_LIMIT));
  }
  broadcast();
}

export function trackUnanswered(question, reason) {
  unanswered.unshift({
    question: normalize(question),
    reason,
    at: new Date().toISOString(),
  });
  if (unanswered.length > UNANSWERED_LIMIT) {
    unanswered.length = UNANSWERED_LIMIT;
  }
  broadcast();
}

export function trackProvider(provider) {
  counters.providerHits[provider] = (counters.providerHits[provider] || 0) + 1;
}

export function trackFeedback(question, answer, tier, intentId, rating) {
  if (rating !== 'up' && rating !== 'down') return;
  feedback[rating]++;

  if (rating === 'down') {
    feedback.recentDown.unshift({
      question: normalize(question),
      answer: String(answer || '').slice(0, 300),
      tier,
      intentId,
      at: new Date().toISOString(),
    });
    if (feedback.recentDown.length > RECENT_DOWN_LIMIT) {
      feedback.recentDown.length = RECENT_DOWN_LIMIT;
    }
  }
  broadcast();
}

export function analyticsStats() {
  const topQuestions = [...counters.topQuestions.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([q, count]) => ({ question: q, count }));

  const topIntents = Object.entries(counters.intentHits)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([id, count]) => ({ intent: id, count }));

  const llmCalls = (counters.tierHits.hybrid || 0) + (counters.tierHits.rag || 0);
  const freeCalls = (counters.tierHits.faq || 0) + (counters.tierHits.cache || 0) + (counters.tierHits['faq-fallback'] || 0);

  return {
    totalQuestions: counters.totalQuestions,
    tiers: { ...counters.tierHits },
    cost: {
      llmCalls,
      freeCalls,
      savedByFaq: counters.costSavedByFaq,
      savedByCache: counters.costSavedByCache,
      pctFree: counters.totalQuestions ? Math.round((freeCalls / counters.totalQuestions) * 100) : 0,
      estimatedTokens: { ...counters.tokenEstimates },
      providers: { ...counters.providerHits },
    },
    topIntents,
    topQuestions,
    feedback: {
      up: feedback.up,
      down: feedback.down,
      recentDown: feedback.recentDown,
    },
    unanswered,
  };
}
