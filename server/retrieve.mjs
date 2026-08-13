/**
 * BM25 retrieval over the scraped knowledge base.
 *
 * No embeddings on purpose: the corpus is ~600 chunks of mostly proper nouns,
 * program codes, and numbers ("BSCS", "17,500", "MPhil"), which lexical search
 * handles better than a small embedding model — and it needs no API call on the
 * retrieval path, so the FAQ tier stays free.
 */
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const K1 = 1.5;
const B = 0.75;

// Students type in Roman Urdu as often as English. Normalising to the English
// term the site actually uses is what makes "fees kitni hai" retrievable at all.
const SYNONYMS = {
  fees: 'fee',
  fis: 'fee',
  kharcha: 'fee cost',
  paisa: 'fee',
  paise: 'fee',
  kitni: 'how much',
  kitna: 'how much',
  kitne: 'how much',
  dakhla: 'admission',
  dakhle: 'admission',
  daakhla: 'admission',
  admision: 'admission',
  admision_form: 'admission form',
  kab: 'when date deadline',
  kahan: 'where location address',
  kaise: 'how process',
  kaisay: 'how process',
  chahiye: 'required',
  zaroori: 'required',
  shart: 'criteria requirement',
  sharait: 'criteria requirement',
  marks: 'percentage marks',
  number: 'percentage marks',
  numbers: 'percentage marks',
  percent: 'percentage',
  parcentage: 'percentage',
  merit: 'merit list',
  wazifa: 'scholarship',
  wazaif: 'scholarship',
  scholership: 'scholarship',
  chuti: 'holiday',
  imtihan: 'test exam',
  test: 'test exam entry',
  parhai: 'study program',
  program: 'program degree',
  programme: 'program degree',
  degree: 'program degree',
  semester: 'semester',
  timing: 'timing schedule',
  campus: 'campus address location',
  hostel: 'hostel accommodation',
  transport: 'transport bus',
  // Program shorthand students actually type. The site writes program codes
  // both glued ("BSCS") and spaced ("BS CS"), so each form has to reach both.
  cs: 'computer science bscs',
  it: 'information technology bsit',
  se: 'software engineering bsse',
  ai: 'artificial intelligence bsai',
  ds: 'data science bsds',
  bscs: 'bscs bs cs computer science',
  bsse: 'bsse bs se software engineering',
  bsit: 'bsit bs it information technology',
  bsds: 'bsds bs ds data science',
  bsai: 'bsai bs ai artificial intelligence',
  mscs: 'mscs ms cs computer science',
  bba: 'bba business administration management',
  mba: 'mba business administration management',
  psychology: 'psychology',
};

const STOPWORDS = new Set(
  ('a an the is are was were be been being of for to in on at by with and or ' +
    'i me my we our you your it its this that these those do does did what ' +
    'which who whom how can could should would will shall may might must ' +
    'hai hain ho hun kya ka ke ki ko se me mein par pe aur ya bhi to hi na ' +
    'nahi nahin mujhe mujhy mera meri apna please plz sir').split(' ')
);

function tokenize(text) {
  const raw = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s.]/gu, ' ')
    // Keep "17,500" and "3.0" intact but split "bs-cs" style joins.
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ');

  const out = [];
  for (const t of raw) {
    if (!t) continue;
    const expanded = SYNONYMS[t];
    const parts = expanded ? expanded.split(' ') : [t];
    for (const p of parts) {
      if (p.length < 2 || STOPWORDS.has(p)) continue;
      out.push(p);
    }
  }
  return out;
}

let index = null;

export async function loadIndex() {
  if (index) return index;

  const kb = JSON.parse(await readFile(join(ROOT, 'data', 'kb.json'), 'utf8'));
  const docs = kb.chunks.map((c) => {
    // The title repeats on every chunk of a page; weighting it lightly (x2)
    // helps "BS CS fee structure" find the right page without letting long
    // pages with many chunks dominate.
    const tokens = [...tokenize(c.title), ...tokenize(c.title), ...tokenize(c.text)];
    const tf = new Map();
    for (const t of tokens) tf.set(t, (tf.get(t) || 0) + 1);
    return { ...c, tf, len: tokens.length };
  });

  const df = new Map();
  for (const d of docs) for (const t of d.tf.keys()) df.set(t, (df.get(t) || 0) + 1);

  const avgLen = docs.reduce((s, d) => s + d.len, 0) / docs.length;
  const idf = new Map();
  for (const [t, n] of df) idf.set(t, Math.log(1 + (docs.length - n + 0.5) / (n + 0.5)));

  index = { docs, idf, avgLen, scrapedAt: kb.scrapedAt, source: kb.source };
  return index;
}

/**
 * @returns {Promise<Array<{title, url, text, score}>>} top-k chunks, best first.
 */
export async function search(query, k = 6) {
  const { docs, idf, avgLen } = await loadIndex();
  const qTokens = tokenize(query);
  if (!qTokens.length) return [];

  const scored = [];
  for (const d of docs) {
    let score = 0;
    for (const t of qTokens) {
      const f = d.tf.get(t);
      if (!f) continue;
      const w = idf.get(t) ?? 0;
      score += (w * f * (K1 + 1)) / (f + K1 * (1 - B + (B * d.len) / avgLen));
    }
    if (score > 0) scored.push({ title: d.title, url: d.url, pos: d.pos, text: d.text, score });
  }

  scored.sort((a, b) => b.score - a.score);

  // Cap per-page chunks so one long fee-structure page can't fill the whole
  // context and crowd out the roadmap or criteria page the user also needs.
  const perUrl = new Map();
  const out = [];
  for (const s of scored) {
    const n = perUrl.get(s.url) || 0;
    if (n >= 2) continue;
    perUrl.set(s.url, n + 1);
    out.push(s);
    if (out.length >= k) break;
  }

  // A mid-page chunk is often just numbers — the labels that say which faculty
  // and programs those numbers belong to are in the page's first chunk. Pull it
  // in so the model can tell a BSCS fee table from a Humanities one.
  const have = new Set(out.map((c) => `${c.url}#${c.pos}`));
  const headers = [];
  for (const s of out) {
    if (s.pos === 0) continue;
    const key = `${s.url}#0`;
    if (have.has(key)) continue;
    const head = docs.find((d) => d.url === s.url && d.pos === 0);
    if (!head) continue;
    have.add(key);
    // Context only — these weren't matched by the query, so they must not be
    // presented to the student as the source of the answer.
    headers.push({ title: head.title, url: head.url, pos: 0, text: head.text, score: 0, isHeader: true });
  }

  return [...headers, ...out];
}
