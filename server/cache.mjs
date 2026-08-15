/**
 * Exact-match response cache for the LLM tier.
 *
 * During peak intake, hundreds of students ask the same handful of questions
 * ("CMAI ki fee kitni hai", "BSCS criteria kya hai") within the same hour.
 * Each one currently pays for a fresh LLM call. Caching the answer to an
 * exact repeat costs nothing to serve and is indistinguishable to the
 * student, since the underlying facts (kb.json) don't change between scrapes.
 *
 * In-memory, like ratelimit.mjs, for the same reason: this runs as a single
 * worker (see the Procfile), so one process holds the whole cache. It resets
 * on redeploy, which is exactly when a re-scrape would invalidate it anyway.
 *
 * Only questions asked with no prior conversation history are cached. A
 * mid-conversation question can mean something history-dependent ("iska
 * roadmap", "aur uski fee?") that the same text would answer differently in
 * a different conversation — caching by text alone would risk serving one
 * student's answer, unlabeled, to another student's different question.
 */

const MAX_ENTRIES = 500;
const store = new Map(); // insertion order doubles as LRU order

let hits = 0;
let misses = 0;

function normalize(question) {
  return question.toLowerCase().trim().replace(/\s+/g, ' ').replace(/[?.!]+$/, '');
}

export function getCached(question) {
  const key = normalize(question);
  const hit = store.get(key);
  if (!hit) {
    misses++;
    return null;
  }
  hits++;
  // Bump to most-recently-used: delete + re-set moves it to the end of Map's
  // iteration order, which is what the eviction below reads as "oldest first".
  store.delete(key);
  store.set(key, hit);
  return hit;
}

export function setCached(question, value) {
  const key = normalize(question);
  if (!store.has(key) && store.size >= MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    store.delete(oldest);
  }
  store.set(key, value);
}

export function cacheStats() {
  return { size: store.size, hits, misses };
}
