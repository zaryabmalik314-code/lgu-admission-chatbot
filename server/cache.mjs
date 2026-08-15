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

const STOP_WORDS = new Set([
  'kya', 'hai', 'hain', 'ho', 'hoti', 'hota', 'mujhe', 'muje', 'ye', 'yeh',
  'wo', 'woh', 'ka', 'ki', 'ke', 'ko', 'se', 'me', 'mein', 'main', 'bhi',
  'aur', 'ek', 'to', 'toh', 'na', 'nahi', 'nhi', 'ya', 'per', 'par', 'ap',
  'aap', 'kitni', 'kitna', 'kitne', 'kaise', 'kab', 'kahan', 'konsa', 'konsi',
  'batao', 'bataye', 'bataen', 'bataiye', 'chahiye', 'chahte',
  'sir', 'madam', 'bhai', 'yaar', 'ji',
  'the', 'is', 'a', 'an', 'what', 'how', 'can', 'do', 'does', 'did',
  'will', 'would', 'could', 'should', 'i', 'my', 'me', 'we', 'our',
  'about', 'for', 'of', 'in', 'on', 'at', 'to', 'and', 'or', 'but',
  'tell', 'please', 'pls', 'plz', 'hello', 'hi', 'hey', 'thanks', 'thank',
  'want', 'need', 'know', 'get', 'are', 'was', 'were', 'be', 'been',
  'have', 'has', 'had', 'this', 'that', 'it', 'its',
]);

const PLURAL_MAP = {
  fees: 'fee', programs: 'program', scholarships: 'scholarship',
  courses: 'course', documents: 'document', tests: 'test',
  deadlines: 'deadline', semesters: 'semester', marks: 'mark',
};

function normalize(question) {
  const words = question
    .toLowerCase()
    .trim()
    .replace(/[?.!,;:'"()]/g, '')
    .split(/\s+/)
    .filter((w) => w.length > 0 && !STOP_WORDS.has(w))
    .map((w) => PLURAL_MAP[w] || w)
    .sort();
  return words.join(' ') || question.toLowerCase().trim();
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
