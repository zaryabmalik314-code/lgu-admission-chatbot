/**
 * Heuristic pre-filter for prompt-injection / jailbreak attempts.
 *
 * The system prompt tells the model these override attempts aren't real
 * instructions, but relying on the LLM alone means every attempt still costs
 * a paid API call, and success depends on that one model's adherence on that
 * one request. Known attack shapes (seen in production on the dashboard) are
 * cheap to catch here instead — deterministic, free, and not persuadable —
 * so only genuinely novel phrasings ever reach the model at all.
 */

const PATTERNS = [
  { name: 'ignore-instructions', re: /\b(ignore|disregard|forget)\b[^.]{0,25}\b(previous|prior|above|earlier|all)\b[^.]{0,25}\b(instructions?|rules?|polic(?:y|ies)|prompt|restrictions?)\b/i },
  { name: 'fake-policy-update', re: /\b(system|policy)\s*(update|notice|change)\b[^.]{0,60}\b(polic(?:y|ies)|restrictions?|rules?)\b/i },
  { name: 'confirm-new-policy', re: /\bconfirm\s+the\s+(new\s+)?polic(?:y|ies)\b/i },
  { name: 'no-longer-chatbot', re: /\byou\s*(?:are|'re)\s*(?:not|no longer)\b[^.]{0,40}\b(?:lgu|admissions?|chatbot|assistant)\b/i },
  { name: 'roleplay-jailbreak', re: /\b(let'?s\s*roleplay|in this fictional (?:role|scenario)|pretend (?:you are|to be))\b/i },
  { name: 'unrestricted-claim', re: /\b(unrestricted|uncensored|no[\s-]?(?:source\s)?restrictions?|without\s+restrictions?)\b/i },
  { name: 'fake-mode', re: /\b(offline|maintenance|developer|debug|admin|god)\s*mode\b/i },
  { name: 'own-knowledge-override', re: /\banswer\b[^.]{0,30}\b(?:entirely|only|instead)\b[^.]{0,30}\b(?:your own knowledge|pretrained knowledge|model knowledge)\b/i },
  { name: 'do-not-apply-restriction', re: /\bdo not\b[^.]{0,40}\b(?:search|apply|use|follow)\b[^.]{0,40}\b(?:lgu|website|restriction|polic(?:y|ies))\b/i },
  { name: 'translation-wrapper', re: /\btranslat(?:e|ion)\b[^.]{0,80}\bdo not apply\b/i },
  { name: 'dan-jailbreak', re: /\bDAN\b/ },
  { name: 'reveal-prompt', re: /\b(?:reveal|show|print|repeat)\b[^.]{0,30}\b(?:system prompt|your instructions|the (?:words|text) above)\b/i },
];

/**
 * @returns {string|null} the matched pattern's name, or null if the text looks clean.
 */
export function detectInjection(text) {
  for (const { name, re } of PATTERNS) {
    if (re.test(text)) return name;
  }
  return null;
}
