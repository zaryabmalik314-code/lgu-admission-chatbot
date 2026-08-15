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
};

const feedback = {
  up: 0,
  down: 0,
  // Recent downvotes only — that's the actionable list (what to go fix),
  // not a full log. Upvotes don't need remembering individually.
  recentDown: [],
};

const TOP_Q_LIMIT = 50;
const RECENT_DOWN_LIMIT = 30;

function normalize(q) {
  return q.toLowerCase().trim().replace(/\s+/g, ' ').replace(/[?.!]+$/, '');
}

export function trackQuestion(question, tier, intentId) {
  counters.totalQuestions++;

  if (tier && counters.tierHits[tier] !== undefined) {
    counters.tierHits[tier]++;
  } else if (tier) {
    counters.tierHits[tier] = 1;
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

  return {
    totalQuestions: counters.totalQuestions,
    tiers: { ...counters.tierHits },
    topIntents,
    topQuestions,
    feedback: {
      up: feedback.up,
      down: feedback.down,
      recentDown: feedback.recentDown,
    },
  };
}
