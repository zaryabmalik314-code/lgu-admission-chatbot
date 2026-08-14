/**
 * Tier 2 of the hybrid brain: an LLM, grounded in retrieved chunks.
 *
 * The model never answers from its own knowledge of LGU — everything it states
 * has to come from the supplied context, because the site is the only source of
 * truth for fees and deadlines and it changes every intake.
 *
 * Three providers sit behind one interface, chosen with LLM_PROVIDER:
 *   groq       (default) cheap and fast
 *   gemini     the most generous free tier by far — ~1,500 requests/day free,
 *              no card — so it can run the whole bot for free most of the year
 *   anthropic  the quality benchmark
 * The thing most likely to differ between them is Roman Urdu quality — most
 * students type "fees kitni hai", not "what is the fee" — so being able to A/B
 * them on real questions with one env var is worth far more than the few lines
 * each implementation costs.
 */
import { FACTS, detectLanguage } from './faq.mjs';

const PROVIDER = (process.env.LLM_PROVIDER || 'groq').toLowerCase();

const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const CLAUDE_MODEL = process.env.CLAUDE_MODEL || 'claude-haiku-4-5';
const EFFORT = process.env.CLAUDE_EFFORT || 'low';

const KEY_ENV = { groq: 'GROQ_API_KEY', gemini: 'GEMINI_API_KEY', anthropic: 'ANTHROPIC_API_KEY' };
const MODEL_OF = { groq: GROQ_MODEL, gemini: GEMINI_MODEL, anthropic: CLAUDE_MODEL };

export function isConfigured() {
  return Boolean(process.env[KEY_ENV[PROVIDER] || 'GROQ_API_KEY']);
}

export function describeProvider() {
  return `${PROVIDER}/${MODEL_OF[PROVIDER] || GROQ_MODEL}`;
}

const SYSTEM = `You are the admissions assistant for Lahore Garrison University (LGU), Lahore, Pakistan. You are embedded as a chat widget on the LGU website and you talk to prospective students and their parents.

## Grounding
Answer ONLY from the CONTEXT provided in the user turn. The context is scraped from lgu.edu.pk and is the single source of truth for fees, criteria, deadlines, and program details.
- NEVER use these phrases or anything like them: "the context", "the provided context", "the context provided", "the information provided", "the provided information", "not specified in", "based on the information I have". The student cannot see any of that and it sounds like a robot. You are simply LGU's assistant — speak as if the knowledge is your own.
- When you don't have a specific answer, say it warmly and briefly in your own voice, then be genuinely helpful — offer what you CAN help with and give the Admission Office. Example of the RIGHT tone for "who is the VC?": "I'm mainly here for admissions, so I don't have that one — but I can help you with programs, fees, criteria, scholarships, or how to apply. For anything else the Admission Office (${FACTS.admissionOffice}, ${FACTS.email}) is your best bet." Keep it to one or two sentences. Never guess a fee, a date, a merit percentage, or a program you don't have.
- Never invent scholarship amounts, seat counts, or admission dates.
- Fees and deadlines change every intake. When you quote a fee, mention it should be confirmed with the Admission Office.
- FEES ARE PROGRAM-SPECIFIC. The combined fee page lists many programs, grouped by faculty. A fee block names the program(s) it applies to — either a "Program: X" line, a heading, or a "Programs: X, Y, Z" list. Quote the fee confidently when the program asked about appears in that block's naming (e.g. BSCS when the block says "Programs: BSCS, BSSE, BSIT..."). But if the block names only OTHER programs and not the one asked about, do NOT quote its number as if it were this program — say the specific figure isn't separately listed and point to the full fee page (${FACTS.feeUrl}) and the Admission Office.

## Language — this matters most
Reply in the SAME language the student wrote in. Decide from their message alone:
- Plain English question -> answer in English.
- Roman Urdu (Urdu written in English letters, e.g. "fees kitni hai", "dakhla kaise lein", "kya mujhe scholarship mil sakti hai") -> answer in Roman Urdu, same casual register. Do NOT answer such questions in English.
- Urdu script -> answer in Urdu script.
Never switch language part-way through an answer. Keep proper nouns, program names, and numbers as-is in every language.

## Style
- Short. Two to five sentences, or a small markdown table for anything with numbers.
- Lead with the direct answer; put caveats after.
- Use a markdown table when quoting fee structures or criteria — never a wall of prose.
- No preamble ("Great question!", "Sure!"). Answer immediately.
- You are talking to teenagers and their parents, many of whom are stressed about money and deadlines. Be warm and plain-spoken, never bureaucratic.

## Scope
You help with LGU admissions: programs, fees, criteria, scholarships, roadmaps, test guidelines, campus and contact.

Helping a prospective student decide is squarely in scope. "I have X% marks, which program can I get into?", "which degree suits someone interested in Y?", "am I eligible for Z?" — these are exactly your job. Answer them from the criteria and program information in the context. When someone gives their marks, map them to the criteria, but be careful which prior qualification each requirement applies to (e.g. the PhD 70% requirement is on a Master's degree, not on Intermediate). If you're unsure of their exact situation, ask a brief follow-up rather than guessing.

Only refuse things genuinely outside LGU admissions — writing code, homework, essays, general knowledge, other universities, casual chat. For those, refuse in one sentence and say what you can help with instead. Don't answer first and apologise after: for a genuinely off-topic request, answering at all is the failure. But don't over-apply this — a student asking which LGU program fits them is on-topic, not off-topic.

## Apply link
When the person is ready to apply, give them ${FACTS.applyUrl}`;

function buildContext(chunks, faqHint) {
  const parts = [];
  if (faqHint) parts.push(`[VERIFIED FACT SHEET]\n${faqHint}`);
  for (const c of chunks) parts.push(`[SOURCE: ${c.title}]\n[URL: ${c.url}]\n${c.text}`);
  return parts.join('\n\n---\n\n');
}

const LANGUAGE_DIRECTIVE = {
  en: 'English',
  'roman-ur': 'Roman Urdu (Urdu written in English letters)',
  ur: 'Urdu script',
};

/**
 * The language rule is stated in the system prompt, but smaller models follow
 * it unreliably — and the failure is silent, answering an English question in
 * Roman Urdu. Detecting the language here and naming it in the turn turns a
 * judgement call into an instruction.
 */
function buildUserTurn(question, context) {
  const lang = LANGUAGE_DIRECTIVE[detectLanguage(question)];
  return (
    `CONTEXT FROM lgu.edu.pk:\n\n${context}\n\n---\n\n` +
    `STUDENT'S QUESTION: ${question}\n\n` +
    `REPLY LANGUAGE: ${lang}. Write your entire answer in ${lang}.\n` +
    `SCOPE CHECK: only refuse if this is genuinely unrelated to LGU admissions (code, homework, other universities, casual chat) — then refuse in one sentence, no partial answer, no disclaimer-after-answering. A prospective student asking which LGU program fits their marks or interests is ON-topic; answer it from the criteria above.`
  );
}

// Only the last few turns — an admission chat rarely needs more.
const recent = (history) => history.slice(-6).map((m) => ({ role: m.role, content: m.content }));

/* ------------------------------- Groq -------------------------------- */

let groqClient;
async function streamGroq({ question, history, context, onDelta }) {
  if (!groqClient) {
    const { default: Groq } = await import('groq-sdk');
    groqClient = new Groq(); // reads GROQ_API_KEY
  }

  const stream = await groqClient.chat.completions.create({
    model: GROQ_MODEL,
    stream: true,
    max_tokens: 1200,
    // Low but not zero: these are factual answers read off a fee table, and
    // the phrasing still has to sound like a person rather than a form.
    temperature: 0.3,
    messages: [
      { role: 'system', content: SYSTEM },
      ...recent(history),
      { role: 'user', content: buildUserTurn(question, context) },
    ],
  });

  let full = '';
  for await (const chunk of stream) {
    const delta = chunk.choices?.[0]?.delta?.content;
    if (!delta) continue;
    full += delta;
    onDelta(delta);
  }
  return full;
}

/* ------------------------------- Gemini ------------------------------ */

let geminiClient;
async function streamGemini({ question, history, context, onDelta }) {
  if (!geminiClient) {
    const { GoogleGenAI } = await import('@google/genai');
    geminiClient = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }

  // Gemini uses 'model' where the others use 'assistant', and system text goes
  // in config.systemInstruction rather than in the message list.
  const contents = [
    ...recent(history).map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    })),
    { role: 'user', parts: [{ text: buildUserTurn(question, context) }] },
  ];

  const stream = await geminiClient.models.generateContentStream({
    model: GEMINI_MODEL,
    contents,
    config: {
      systemInstruction: SYSTEM,
      temperature: 0.3,
      maxOutputTokens: 1200,
    },
  });

  let full = '';
  for await (const chunk of stream) {
    const delta = chunk.text;
    if (!delta) continue;
    full += delta;
    onDelta(delta);
  }
  return full;
}

/* ----------------------------- Anthropic ------------------------------ */

let anthropicClient;

/**
 * Adaptive thinking and `effort` exist only on the Opus/Sonnet 4.6+ line;
 * sending either to Haiku 4.5 is a 400.
 */
function claudeTuning(model) {
  const supported = /^claude-(opus-(5|4-[678])|sonnet-(5|4-6)|fable-5|mythos-5)/.test(model);
  return supported
    ? { thinking: { type: 'adaptive' }, output_config: { effort: EFFORT } }
    : {};
}

async function streamAnthropic({ question, history, context, onDelta }) {
  if (!anthropicClient) {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    anthropicClient = new Anthropic(); // reads ANTHROPIC_API_KEY
  }

  const stream = anthropicClient.messages.stream({
    model: CLAUDE_MODEL,
    max_tokens: 1200,
    system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
    ...claudeTuning(CLAUDE_MODEL),
    messages: [
      ...recent(history),
      { role: 'user', content: buildUserTurn(question, context) },
    ],
  });

  stream.on('text', (delta) => onDelta(delta));
  const final = await stream.finalMessage();

  if (final.stop_reason === 'refusal') {
    const fallback = `Is sawal ka jawab main nahi de sakta. Admission Office se rabta karein: ${FACTS.admissionOffice}`;
    onDelta(fallback);
    return fallback;
  }

  return final.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
}

/* ------------------------------ dispatch ------------------------------ */

/**
 * Streams an answer as text deltas.
 *
 * @param {object} args
 * @param {string} args.question
 * @param {Array<{role:string, content:string}>} args.history prior turns
 * @param {Array} args.chunks retrieved context
 * @param {string} [args.faqHint] a canned answer to fold in as verified context
 * @param {(text:string)=>void} args.onDelta
 * @returns {Promise<string>} the full answer
 */
export async function answerStream({ question, history = [], chunks, faqHint, onDelta }) {
  const context = buildContext(chunks, faqHint);
  const args = { question, history, context, onDelta };
  if (PROVIDER === 'anthropic') return streamAnthropic(args);
  if (PROVIDER === 'gemini') return streamGemini(args);
  return streamGroq(args);
}
