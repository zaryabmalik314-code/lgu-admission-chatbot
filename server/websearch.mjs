/**
 * Lightweight web search fallback — when the scraped knowledge base doesn't
 * cover a question, search the web (scoped to LGU) and feed the results as
 * extra context to the LLM.
 *
 * Uses DuckDuckGo HTML (no API key needed). Results are text snippets, not
 * full page scrapes — good enough for the model to ground a short answer on.
 */

const DDG_URL = 'https://duckduckgo.com/html/';
const TIMEOUT = 5000;

/**
 * @param {string} query  the student's question
 * @param {number} max    how many results to return
 * @returns {Promise<Array<{title:string, snippet:string, url:string}>>}
 */
export async function webSearch(query, max = 3) {
  const q = `${query} LGU Lahore Garrison University`;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT);

    const res = await fetch(`${DDG_URL}?q=${encodeURIComponent(q)}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) return [];
    const html = await res.text();
    return parseResults(html, max);
  } catch (err) {
    console.error('[websearch] failed:', err.message);
    return [];
  }
}

function parseResults(html, max) {
  const results = [];

  const linkRe = /<a[^>]+class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
  const snippetRe = /<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;

  const links = [...html.matchAll(linkRe)];
  const snippets = [...html.matchAll(snippetRe)];

  for (let i = 0; i < Math.min(links.length, max); i++) {
    let url = links[i][1];
    const udMatch = url.match(/uddg=([^&]+)/);
    if (udMatch) url = decodeURIComponent(udMatch[1]);

    const title = stripTags(links[i][2]).trim();
    const snippet = i < snippets.length ? stripTags(snippets[i][1]).trim() : '';

    if (!title || !url) continue;
    results.push({ title, snippet, url });
  }

  return results;
}

function stripTags(html) {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, ' ');
}
