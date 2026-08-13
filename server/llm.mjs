/**
 * Tier 2 of the hybrid brain: Claude, grounded in retrieved chunks.
 *
 * The model never answers from its own knowledge of LGU — everything it states
 * has to come from the supplied context, because the site is the only source of
 * truth for fees and deadlines and it changes every intake.
 */
import Anthropic from '@anthropic-ai/sdk';
import { FACTS } from './faq.mjs';

const MODEL = process.env.CLAUDE_MODEL || 'claude-haiku-4-5';
const EFFORT = process.env.CLAUDE_EFFORT || 'low';

/**
 * Adaptive thinking and `effort` exist only on the Opus/Sonnet 4.6+ line.
 * Sending either to Haiku 4.5 is a 400, so the cheap model — the sensible
 * default for a public admission bot — would break the moment someone set
 * CLAUDE_MODEL. Pick the parameters from the model instead of assuming.
 */
function tuningFor(model) {
  const supportsEffort = /^claude-(opus-(5|4-[678])|sonnet-(5|4-6)|fable-5|mythos-5)/.test(model);
  return supportsEffort
    ? { thinking: { type: 'adaptive' }, output_config: { effort: EFFORT } }
    : {};
}

let client;
function getClient() {
  if (!client) client = new Anthropic(); // reads ANTHROPIC_API_KEY
  return client;
}

export function isConfigured() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

const SYSTEM = `You are the admissions assistant for Lahore Garrison University (LGU), Lahore, Pakistan. You are embedded as a chat widget on the LGU website and you talk to prospective students and their parents.

## Grounding
Answer ONLY from the CONTEXT provided in the user turn. The context is scraped from lgu.edu.pk and is the single source of truth for fees, criteria, deadlines, and program details.
- If the context does not contain the answer, say so plainly and point the person to the Admission Office (${FACTS.admissionOffice}, ${FACTS.email}). Never guess a fee, a date, a merit percentage, or a program that isn't in the context.
- Never invent scholarship amounts, seat counts, or admission dates.
- Fees and deadlines change every intake. When you quote a fee, mention it should be confirmed with the Admission Office.

## Language
Mirror the user's language exactly:
- English question -> English answer.
- Roman Urdu question (e.g. "fees kitni hai") -> Roman Urdu answer, same casual register.
- Urdu script question -> Urdu script answer.
Never switch language mid-answer unless the user did.

## Style
- Short. Two to five sentences, or a small markdown table for anything with numbers.
- Lead with the direct answer; put caveats after.
- Use a markdown table when quoting fee structures or criteria — never a wall of prose.
- No preamble ("Great question!", "Sure!"). Answer immediately.
- You are talking to teenagers and their parents, many of whom are stressed about money and deadlines. Be warm and plain-spoken, never bureaucratic.

## Scope
You only handle LGU admissions: programs, fees, criteria, scholarships, roadmaps, test guidelines, campus and contact. If asked about anything else (homework help, general chat, other universities), say briefly that you only cover LGU admissions and offer what you can help with.

## Apply link
When the person is ready to apply, give them ${FACTS.applyUrl}`;

function buildContext(chunks, faqHint) {
  const parts = [];
  if (faqHint) {
    parts.push(`[VERIFIED FACT SHEET]\n${faqHint}`);
  }
  for (const c of chunks) {
    parts.push(`[SOURCE: ${c.title}]\n[URL: ${c.url}]\n${c.text}`);
  }
  return parts.join('\n\n---\n\n');
}

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

  const messages = [
    // Only the last few turns — an admission chat rarely needs more, and it
    // keeps the cached system prefix doing the heavy lifting.
    ...history.slice(-6).map((m) => ({ role: m.role, content: m.content })),
    {
      role: 'user',
      content: `CONTEXT FROM lgu.edu.pk:\n\n${context}\n\n---\n\nSTUDENT'S QUESTION: ${question}`,
    },
  ];

  const stream = getClient().messages.stream({
    model: MODEL,
    max_tokens: 1500,
    system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
    ...tuningFor(MODEL),
    messages,
  });

  stream.on('text', (delta) => onDelta(delta));

  const final = await stream.finalMessage();

  if (final.stop_reason === 'refusal') {
    const fallback = `Is sawal ka jawab main nahi de sakta. Admission Office se rabta karein: ${FACTS.admissionOffice}`;
    onDelta(fallback);
    return fallback;
  }

  return final.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('');
}
