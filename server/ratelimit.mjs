/**
 * Rate limiting for a public, unauthenticated widget.
 *
 * Deliberately NOT keyed on IP. The whole LGU campus sits behind one NAT
 * address, so an IP bucket would be shared by every student on the wifi: the
 * first few would use it up and everyone else would be locked out. The same
 * trap bit the attendance project.
 *
 * Instead there are two independent limits:
 *
 *   per-session  a browser-generated id kept in localStorage. Spoofable, and
 *                that's fine — it stops one person hammering the widget, which
 *                is the realistic case, and it costs a determined abuser
 *                nothing to bypass.
 *   global       the actual protection for the API bill. Whatever someone does
 *                with session ids, total spend per hour has a ceiling.
 *
 * In-memory, so counters reset on redeploy and each instance counts its own
 * traffic. That's the right trade for one small service; reach for Redis only
 * if this ever runs more than one instance.
 */

const SESSION_MAX = Number(process.env.RATE_SESSION_MAX) || 20;
const SESSION_WINDOW_MS = (Number(process.env.RATE_SESSION_WINDOW_S) || 300) * 1000;

const GLOBAL_MAX = Number(process.env.RATE_GLOBAL_MAX) || 500;
const GLOBAL_WINDOW_MS = (Number(process.env.RATE_GLOBAL_WINDOW_S) || 3600) * 1000;

const hits = new Map(); // key -> number[] of timestamps
let lastSweep = Date.now();

function countWithin(key, windowMs, now) {
  const times = hits.get(key);
  if (!times) return 0;
  // Timestamps are appended in order, so dropping the expired prefix is enough.
  let i = 0;
  while (i < times.length && now - times[i] > windowMs) i++;
  if (i) times.splice(0, i);
  if (!times.length) hits.delete(key);
  return times.length;
}

function record(key, now) {
  const times = hits.get(key);
  if (times) times.push(now);
  else hits.set(key, [now]);
}

/** Drop keys nobody has touched, so an idle service doesn't grow forever. */
function sweep(now) {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  const oldest = Math.max(SESSION_WINDOW_MS, GLOBAL_WINDOW_MS);
  for (const [key, times] of hits) {
    if (!times.length || now - times[times.length - 1] > oldest) hits.delete(key);
  }
}

/**
 * @returns {{allowed: true} | {allowed: false, scope: 'session'|'global', retryAfter: number}}
 */
export function checkRateLimit(sessionId) {
  const now = Date.now();
  sweep(now);

  if (countWithin('__global__', GLOBAL_WINDOW_MS, now) >= GLOBAL_MAX) {
    return { allowed: false, scope: 'global', retryAfter: Math.ceil(GLOBAL_WINDOW_MS / 1000) };
  }

  const key = `s:${sessionId || 'anon'}`;
  if (countWithin(key, SESSION_WINDOW_MS, now) >= SESSION_MAX) {
    return { allowed: false, scope: 'session', retryAfter: Math.ceil(SESSION_WINDOW_MS / 1000) };
  }

  record(key, now);
  record('__global__', now);
  return { allowed: true };
}

export function rateLimitStats() {
  const now = Date.now();
  return {
    globalLastHour: countWithin('__global__', GLOBAL_WINDOW_MS, now),
    globalMax: GLOBAL_MAX,
    activeSessions: [...hits.keys()].filter((k) => k.startsWith('s:')).length,
  };
}
