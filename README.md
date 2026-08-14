# LGU Admissions Chatbot

An embeddable chat widget for the Lahore Garrison University admission site. It
answers questions about fees, admission criteria, scholarships, roadmaps and the
application process in English, Roman Urdu, or Urdu.

Its knowledge comes from lgu.edu.pk itself — 237 admission-relevant pages are
scraped into a local knowledge base, so fee tables and criteria are whatever the
site currently says rather than something hardcoded.

## How it answers (hybrid)

```
question
   │
   ├─ 1. FAQ match?  ──────► curated answer, instant, no API cost
   │     (criteria, how to apply, contact, scholarships, merit, test)
   │
   └─ 2. BM25 retrieval over 575 chunks
         │
         └─ 3. Claude, grounded strictly in the retrieved chunks
```

Tier 1 handles the questions an admission office answers hundreds of times a day
and costs nothing. Anything program-specific ("BSCS ki fee kitni hai") skips the
canned answer on purpose and goes to retrieval, because only the live scraped
tables have those numbers.

Retrieval is lexical (BM25), not embeddings: the corpus is mostly program codes,
proper nouns and numbers — `BSCS`, `17,500`, `M.Phil` — which lexical search
matches better, and it needs no API call, so tier 1 stays free.

Query tokens are normalised in three ways before matching, each fixing a real
failure seen in use:

| Input | Problem | Handling |
|---|---|---|
| `fees kitni hai` | Roman Urdu isn't in the corpus | Synonym map to the English terms the site uses |
| `bscmai` | Site writes `BS CMAI` with a space, so the glued form matches nothing | Split a degree prefix off when the remainder is a real term |
| `creteria` | One typo returned **zero** results for the whole query | Nearest vocabulary term within 1–2 edits |

## Providers and cost

**Groq is the default.** Set `LLM_PROVIDER=anthropic` to switch; nothing else
changes, so the same questions can be run against both.

Measured against the real knowledge base, a question sends roughly 2,500 input
tokens (system prompt + ~1,400 tokens of retrieved context + recent history) and
gets back ~350 output tokens — so cost is dominated by input.

| Provider / model | Per question | 7,500 questions/month |
|---|---|---|
| Groq `llama-3.3-70b-versatile` (default) | ~0.2¢ | ~$15 |
| Groq `llama-3.1-8b-instant` | ~0.02¢ | ~$1.50 |
| `claude-haiku-4-5` | ~0.43¢ | ~$32 |
| `claude-sonnet-5` | ~1.3¢ | ~$96 |

### The Groq free tier is a daily token cap, not a request count

The free tier is **100,000 tokens/day** for `llama-3.3-70b-versatile`. Each
LLM-tier question sends ~2,500 tokens of context, so that's only **~40
LLM-answered questions per day** before it's exhausted for ~an hour.

Two things soften this:

- **FAQ-tier questions cost zero tokens** — criteria, how-to-apply, contact,
  scholarships, merit, and the marks-advising table are all canned. Only
  program-specific and interest questions hit the LLM.
- **When the cap is reached the bot degrades gracefully** — instead of a
  dead-end it returns links to the pages retrieval found, so students are still
  pointed to the right place.

For a live admission bot during intake season, the free tier won't be enough.
Upgrade to the Groq Dev tier (pay-per-token, still cheap — see the cost table)
at <https://console.groq.com/settings/billing>, or switch to the Anthropic
provider. Treat the cost figures as estimates and confirm against the provider's
current pricing.

### Watch Roman Urdu quality

This is the one place a cheaper model is likely to disappoint, and it is the
majority case: most students type `fees kitni hai`, not `what is the fee`. The
failure is not a crash — the bot answers in English instead, or writes stilted
Urdu. Before going live, ask each of these and check the reply comes back in the
same language:

```
fees kitni hai?
dakhla kaise lein?
BSCS ke liye kitne marks chahiye?
kya scholarship mil sakti hai?
```

If replies drift to English, try `GROQ_MODEL=qwen/qwen3-32b` (usually the
strongest on Urdu of the Groq models) before giving up on the provider.

Groq retires model IDs fairly often — a stale one fails at request time, so
check <https://console.groq.com/docs/models> when a previously working model
starts erroring.

### Other cost dials

1. **The FAQ tier** — every question it catches costs nothing. Adding intents to
   `server/faq.mjs` is the cheapest possible improvement.
2. **`RETRIEVE_K`** — retrieved context is most of the input. Don't go below 5;
   the combined fee-structure page starts falling out of range.
3. **A spend limit** in the provider console, as a hard backstop.

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

The widget ships with the LGU theme by default — deep green (`#14532d`) header
and bubble, gold (`#f4b41a`) send button — matching the admission site's green
structure and gold "Apply Now" buttons. Override if needed:
`data-accent` (primary green), `data-gold` (accent), `data-title`.

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
- **Only the Groq path has been run end-to-end.** Verified against live
  questions with `llama-3.3-70b-versatile`, including that quoted fees match
  the source page. The Anthropic path shares the same code around it but has
  not been exercised against the live API.
- **Vague questions are answered by asking back.** "How much is the fee?" with
  no program named returns a clarifying question rather than a number, because
  every faculty has a different fee table and picking one would read as
  authoritative while being wrong for most readers.
- **Some LGU pages are empty on their side.** `/ph-d-cs-fee-structure/` reads
  "Fee Structure will be display soon!"; `/doctoral/`, `/training-programs/` and
  the `/internationalisation-*` pages are headings with no body. The scraper
  reports every page it drops for being too thin, so a real page that stops
  extracting correctly shows up instead of vanishing quietly — check that list
  after each scrape.
- Answers are only as current as the last scrape.

## Rate limiting

Two independent limits, neither keyed on IP — the whole campus sits behind one
NAT address, so an IP bucket would lock out every student on the wifi at once.

| Limit | Default | Keyed on |
|---|---|---|
| Per session | 20 per 5 min | A browser id in `localStorage` |
| Global | 500 per hour | Everything |

Session ids are client-generated and therefore spoofable; that's acceptable
because the per-session limit exists to stop one person hammering the widget,
which is the realistic case. The global limit is what actually protects the API
bill. Both are tunable via `RATE_*` environment variables.

Counters are in memory, so they reset on redeploy and each instance counts its
own traffic. That's the right trade for a single small service — reach for Redis
only if this ever runs more than one instance.
