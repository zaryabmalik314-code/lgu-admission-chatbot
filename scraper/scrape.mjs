/**
 * LGU admission-site scraper.
 * Pulls the admission-relevant pages off lgu.edu.pk and writes a chunked
 * knowledge base the chatbot retrieves over.
 *
 * Usage: node scraper/scrape.mjs
 */
import { writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ORIGIN = 'https://lgu.edu.pk';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

// lgu.edu.pk 403s anything that doesn't look like a browser.
const HEADERS = {
  'User-Agent': UA,
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};

const CONCURRENCY = 6;
const DELAY_MS = 150;

// Only pages a prospective student would ever ask about. The sitemap has 600+
// URLs; the rest is conference/QEC/faculty-profile noise that would just dilute
// retrieval.
const INCLUDE = [
  /admission/i,
  /fee-structure/i,
  /\bfee\b/i,
  /scholarship/i,
  /eligibility/i,
  /criteria/i,
  /road-?map/i,
  /roadmap/i,
  /program/i,
  /courses/i,
  /department-of-/i,
  /^\/(apply|merit-list|contact|regulations|about-us|facilities|campus-life|result|download|testing|test)\/?$/i,
  /associate-degree/i,
  /adp-/i,
  /post-adp/i,
  /bachelor-of-/i,
  /master(s)?-of-/i,
  /doctor-of-/i,
  /\bbs-/i,
  /\bms-/i,
  /\bmba-/i,
  /\bbba-/i,
  /m-phil/i,
  /mphil/i,
  /ph-?d/i,
  /international-diploma/i,
  /internationalisation-(admissions|programs|application-process|about)/i,
  /student-handbook/i,
  /how-can-we-help/i,
];

// Pages that match INCLUDE by accident but carry nothing a student needs.
const EXCLUDE = [
  /conference/i,
  /icms/i,
  /icss/i,
  /itics/i,
  /icc-/i,
  /amlctf/i,
  /call-for-paper/i,
  /publication/i,
  /journal/i,
  /newsletter/i,
  /qec/i,
  /organogram/i,
  /-team\/?$/i,
  /faculty/i,
  /hods?-message/i,
  /hod-message/i,
  /deans?-message/i,
  /news-(and-)?events/i,
  /cloned/i,
  /\/(login|register|account|profile|users?|logout|password-reset|forgot|reset|change|my-account)/i,
  /maintenance/i,
  /donor|donation/i,
  /tender/i,
  /gallery/i,
  /lab-attendants/i,
  /achievements?/i,
  /societies/i,
  /main-page-template/i,
  /home-2/i,
  /all-posts/i,
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchText(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { headers: HEADERS, redirect: 'follow' });
      if (res.ok) return await res.text();
      if (res.status === 404) return null;
      // 403/429/5xx — back off and retry.
    } catch {
      /* network blip — retry */
    }
    await sleep(600 * (i + 1));
  }
  return null;
}

async function getSitemapUrls() {
  const xml = await fetchText(`${ORIGIN}/wp-sitemap-posts-page-1.xml`);
  if (!xml) throw new Error('Could not read sitemap');
  return [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map((m) => m[1]);
}

function decodeEntities(s) {
  const named = {
    amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
    rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“',
    ndash: '–', mdash: '—', hellip: '…', times: '×',
    amp39: "'",
  };
  return s
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&([a-z]+\d*);/gi, (m, n) => named[n.toLowerCase()] ?? m);
}

function flattenTable(tableHtml) {
  const rows = [];
  for (const [, tr] of tableHtml.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...tr.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)]
      .map(([, c]) => decodeEntities(c.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim())
      .filter(Boolean);
    if (cells.length) rows.push(cells.join(' | '));
  }
  return rows.join('\n');
}

/**
 * Tables carry the fee structures and roadmaps — the single most-asked-about
 * content on the site. Flatten each one to " | "-joined rows **in place**, so a
 * fee table stays next to the heading naming the programs it covers. Appending
 * them at the end instead cost us that adjacency, and a chunk of bare numbers
 * is unretrievable: "BSCS ki fee" matched the CS department page rather than
 * the fee table, because only the heading said "BSCS".
 *
 * The placeholder has to survive tag-stripping and entity decoding, hence a
 * bare alphanumeric token with no markup or entities in it.
 */
function extractTables(html) {
  const tables = [];
  const replaced = html.replace(/<table\b[^>]*>([\s\S]*?)<\/table>/gi, (_, inner) => {
    const text = flattenTable(inner);
    if (!text) return ' ';
    tables.push(text);
    return `\nLGUTABLEMARK${tables.length - 1}ENDMARK\n`;
  });
  return { replaced, tables };
}

function extractTitle(html) {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!m) return '';
  return decodeEntities(m[1]).replace(/\s*[–|-]\s*Lahore Garrison University.*$/i, '').trim();
}

// Avada chrome that survives the #content narrowing. Pure noise in retrieval —
// "Search for:" matching a query about search results would be a false hit.
const NOISE_LINES = [
  /^skip to content$/i,
  /^search for:?$/i,
  /^page load link$/i,
  /^go to top$/i,
  /^toggle navigation$/i,
  /^menu$/i,
  /^read more$/i,
  /^\s*$/,
  // "BS CS Road Map LGU 2025-08-27T09:05:29+00:00" — WP's modified stamp.
  /\bLGU \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+\d{2}:\d{2}$/,
];

function htmlToText(html) {
  // Narrow to the main content column first — Avada wraps the real page body in
  // #content, and everything outside it is the same nav/footer on every page.
  const contentMatch = html.match(/<div[^>]+id=["']content["'][^>]*>([\s\S]*)<\/div>\s*<\/div>/i);
  let body = contentMatch ? contentMatch[1] : html;

  body = body
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<nav\b[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<footer\b[\s\S]*?<\/footer>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ');

  // Swap tables for placeholders only after the noisy elements are gone, so a
  // <table> inside a <nav> isn't preserved.
  const { replaced, tables } = extractTables(body);

  body = replaced
    .replace(/<\/(p|div|li|h[1-6]|tr|br)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');

  let text = decodeEntities(body)
    .replace(/[ \t ]+/g, ' ')
    .replace(/\n\s*\n\s*\n+/g, '\n\n')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !NOISE_LINES.some((re) => re.test(l)))
    .join('\n')
    // Restore each table where it stood in the page.
    .replace(/LGUTABLEMARK(\d+)ENDMARK/g, (_, i) => '\n' + (tables[+i] ?? '') + '\n')
    .replace(/\n{3,}/g, '\n\n');

  return text.trim();
}

/**
 * A line that reads like a section label rather than body text. Used to keep a
 * fee or roadmap table identifiable after chunking splits it away from the
 * heading naming the programs it covers.
 */
function isHeadingLine(line) {
  if (line.includes('|')) return false;
  if (line.length < 6 || line.length > 110) return false;
  if (/^[\d\s.,%-]+$/.test(line)) return false;
  return /^(BS|MS|ADP|Post|PhD|Ph\.?D|M\.?Phil|MBA|BBA|Fee|Programs?|Deptt|Department|Faculty|Semester|Total|Admission|Eligibility|Road ?Map|Structure|Category|Graduation|Undergraduate)\b/i.test(
    line
  );
}

/**
 * Split a page into retrieval-sized chunks.
 *
 * Every chunk carries the page title and the most recent section heading, so a
 * slice of a 55-chunk fee-structure page still says which faculty and programs
 * its numbers belong to. Without that, a chunk of pure numbers matches nothing.
 */
function chunk(title, url, text, maxChars = 1100) {
  const lines = text.split('\n');
  const chunks = [];
  let buf = '';
  let heading = '';
  let headingLine = -Infinity;
  let chunkStartLine = 0;

  // Only carry a heading that sat just above the chunk. On pages built from
  // Avada tabs, every section heading renders in one block at the top while the
  // tables render far below, so an unconditional carry-over labels a table with
  // whichever department happened to be listed last — telling a BSCS applicant
  // the Humanities fee. Requiring adjacency keeps the useful case (a heading
  // directly above a long table) and drops the dangerous one.
  const ADJACENT_LINES = 4;

  const flush = (atLine) => {
    const t = buf.trim();
    if (t.length > 40) {
      const near = chunkStartLine - headingLine <= ADJACENT_LINES;
      const prefix = heading && near && !t.includes(heading) ? `${heading}\n` : '';
      // `pos` lets retrieval pull a page's first chunk alongside a later one:
      // on the combined fee-structure page the program and faculty labels live
      // in chunk 0 while the numbers live further down.
      chunks.push({ title, url, pos: chunks.length, text: prefix + t });
    }
    buf = '';
    chunkStartLine = atLine;
  };

  lines.forEach((line, i) => {
    if (buf.length + line.length > maxChars && buf) flush(i);
    buf += line + '\n';
    if (isHeadingLine(line)) {
      heading = line;
      headingLine = i;
    }
  });
  flush(lines.length);
  return chunks;
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: limit }, async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await fn(items[idx], idx);
        await sleep(DELAY_MS);
      }
    })
  );
  return out;
}

async function main() {
  console.log('Reading sitemap…');
  const all = await getSitemapUrls();

  const targets = all.filter((u) => {
    const path = u.replace(ORIGIN, '');
    if (EXCLUDE.some((re) => re.test(path))) return false;
    return INCLUDE.some((re) => re.test(path));
  });

  console.log(`${all.length} pages in sitemap → ${targets.length} admission-relevant`);

  let done = 0;
  const pages = await mapLimit(targets, CONCURRENCY, async (url) => {
    const html = await fetchText(url);
    done++;
    if (done % 25 === 0) console.log(`  fetched ${done}/${targets.length}`);
    if (!html) return { url, ok: false };
    const title = extractTitle(html) || url;
    const text = htmlToText(html);
    return { url, ok: true, title, text };
  });

  const good = pages.filter((p) => p.ok && p.text && p.text.length > 120);
  const failed = pages.filter((p) => !p.ok);

  const chunks = [];
  for (const p of good) chunks.push(...chunk(p.title, p.url, p.text));
  chunks.forEach((c, i) => (c.id = `c${i}`));

  await mkdir(join(ROOT, 'data'), { recursive: true });
  await writeFile(
    join(ROOT, 'data', 'kb.json'),
    JSON.stringify(
      {
        source: ORIGIN,
        scrapedAt: new Date().toISOString(),
        pageCount: good.length,
        chunkCount: chunks.length,
        chunks,
      },
      null,
      2
    )
  );
  await writeFile(
    join(ROOT, 'data', 'pages.json'),
    JSON.stringify(good.map(({ url, title, text }) => ({ url, title, text })), null, 2)
  );

  console.log(
    `\nDone. ${good.length} pages kept, ${failed.length} failed, ${chunks.length} chunks → data/kb.json`
  );
  if (failed.length) console.log('Failed:', failed.map((f) => f.url).join('\n  '));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
