# LGU Admissions Chatbot

An embeddable chat widget for the Lahore Garrison University admission site. It
answers questions about fees, admission criteria, scholarships, roadmaps and the
application process in English, Roman Urdu, or Urdu.

Its knowledge comes from lgu.edu.pk itself — 223 admission-relevant pages are
scraped into a local knowledge base, so fee tables and criteria are whatever the
site currently says rather than something hardcoded.

## How it answers (hybrid)

```
question
   │
   ├─ 1. FAQ match?  ──────► curated answer, instant, no API cost
   │     (criteria, how to apply, contact, scholarships, merit, test)
   │
   └─ 2. BM25 retrieval over 536 chunks
         │
         └─ 3. Claude, grounded strictly in the retrieved chunks
```

Tier 1 handles the questions an admission office answers hundreds of times a day
and costs nothing. Anything program-specific ("BSCS ki fee kitni hai") skips the
canned answer on purpose and goes to retrieval, because only the live scraped
tables have those numbers.

Retrieval is lexical (BM25), not embeddings: the corpus is mostly program codes,
proper nouns and numbers — `BSCS`, `17,500`, `M.Phil` — which lexical search
matches better, and it needs no API call, so tier 1 stays free. A Roman-Urdu
synonym map (`fees`→`fee`, `dakhla`→`admission`, `kitni`→`how much`) is what
makes "fees kitni hai" retrievable at all.

## Cost

Measured against the real knowledge base: a question sends roughly 2,500 input
tokens (system prompt + ~1,400 tokens of retrieved context + recent history) and
gets back ~350 output tokens.

| Model | Per question | 7,500 questions/month |
|---|---|---|
| `claude-haiku-4-5` (default) | ~0.43¢ | ~$32 |
| `claude-sonnet-5` | ~1.3¢ | ~$96 |
| `claude-opus-5` | ~2.1¢ | ~$158 |

Haiku is the default because retrieval has already located the answer — the
model reformats retrieved facts into the student's language rather than
reasoning from scratch, which is what small models are good at. Move up a tier
if answers read poorly on real questions.

The other dials, in order of effect:

1. **The FAQ tier** — every question it catches costs nothing. Adding intents to
   `server/faq.mjs` is the cheapest possible improvement.
2. **`RETRIEVE_K`** — retrieved context is most of the input. Don't go below 5;
   the combined fee-structure page starts falling out of range.
3. **A spend limit** in the Anthropic Console, as a hard backstop.

Note that adaptive thinking and `effort` only exist on the Opus/Sonnet line;
they are omitted automatically on models that reject them.

## Setup

```bash
npm install
cp .env.example .env      # add your ANTHROPIC_API_KEY
npm start
```

Open <http://localhost:3000/demo/>.

The bot runs without an API key too — it just falls back to curated answers and
links to the pages retrieval found, which is a useful way to test the widget.

## Refreshing the knowledge base

Fee structures and deadlines change every intake. Re-run:

```bash
npm run scrape
```

This re-reads the sitemap, fetches the admission-relevant pages, and rewrites
`data/kb.json`. Restart the server to pick it up. Worth running at the start of
every admission cycle — and worth checking the output, since the site's page
structure occasionally changes.

## Embedding on the real site

One tag before `</body>`:

```html
<script src="https://YOUR-BACKEND/widget.js"
        data-api="https://YOUR-BACKEND"></script>
```

Optional: `data-accent="#0b5d3b"`, `data-title="LGU Admissions"`.

The widget renders inside a shadow root, so the site's own theme CSS (Avada, on
lgu.edu.pk) can't restyle it and it can't leak styles back into the page.

## Layout

| Path | What it is |
|---|---|
| `scraper/scrape.mjs` | Sitemap crawl → `data/kb.json` |
| `server/retrieve.mjs` | BM25 index + Roman Urdu synonyms |
| `server/faq.mjs` | Curated intents and verified contact facts |
| `server/llm.mjs` | Claude call, grounded + streaming |
| `server/index.mjs` | Express API (SSE) |
| `widget/lgu-chat.js` | The embeddable widget |
| `demo/index.html` | Local test page |

## Deploying

Runs anywhere Node 20+ runs. For Railway: set `ANTHROPIC_API_KEY` and
`ALLOWED_ORIGINS`, and let it run `npm start`. `data/kb.json` is committed, so
the scrape does not need to run at deploy time.

**Set `ALLOWED_ORIGINS` in production.** Unset means any origin can call
`/api/chat`, which means any site can spend your API key.

## Known limitations

- **The combined fee-structure page is ambiguous by construction.** On
  `/fee-structure/` the section headings render in one block and the fee tables
  in another, so a table cannot be reliably matched to the program it belongs to
  by text alone. Retrieval sends the page's header chunk along with any fee
  chunk so the model can see the labels, and the system prompt tells it to
  recommend confirming fees with the Admission Office. Program-specific pages
  (e.g. `/bs-se-fee-structure/`) do not have this problem.
- **The LLM tier has not been run end-to-end.** No API key was available while
  building, so tiers 1 and 3 (FAQ, retrieval, widget, streaming) are verified
  working, but the Claude call itself has not been exercised against the live
  API. Test it once with a key before going live.
- No rate limiting. Add one before this is publicly linked.
- Answers are only as current as the last scrape.
