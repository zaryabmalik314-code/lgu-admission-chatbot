/**
 * Tier 1 of the hybrid brain: curated answers for the questions that make up
 * most of an admission office's inbox.
 *
 * A match here costs nothing and never hallucinates, so anything with a stable,
 * verifiable answer belongs in this file rather than in the LLM tier. Anything
 * that varies by program (exact fees, roadmaps) deliberately does NOT — those
 * fall through to retrieval, which reads the live scraped numbers.
 */

// Facts pulled from lgu.edu.pk during the scrape. Re-check these when the
// scraper reports a changed contact or criteria page.
export const FACTS = {
  phone: '042-37181821-22',
  admissionOffice: '042-37181823',
  email: 'admissions@lgu.edu.pk',
  address: 'Main Campus, Sector C, DHA Phase 6, Lahore',
  applyUrl: 'https://admissions.lgu.edu.pk/',
  admissionsUrl: 'https://lgu.edu.pk/admissions/',
  feeUrl: 'https://lgu.edu.pk/fee-structure/',
  criteriaUrl: 'https://lgu.edu.pk/admission-criteria/',
  scholarshipUrl: 'https://lgu.edu.pk/scholarships/',
  meritUrl: 'https://lgu.edu.pk/merit-list/',
  testUrl: 'https://lgu.edu.pk/admission-test-guidelines/',
};

/**
 * Each intent needs `any` (at least one must appear) and optionally `all`
 * (every one must appear). Patterns run against the lowercased query, so they
 * cover Roman Urdu spellings alongside English.
 */
const INTENTS = [
  {
    id: 'apply-how',
    any: [/how (do i |can i |to )?apply/, /apply (online|kaise|kese)/, /admission form/, /dakhla kaise/, /form (kahan|kaise|kese)/],
    answer: `Online admission form LGU ke admission portal se bhari jaati hai: ${FACTS.applyUrl}

Steps:
1. Portal par jaa kar register karein
2. Apna program select karein (BS / ADP / MS / M.Phil / PhD)
3. Academic record aur documents upload karein
4. Form submit kar ke admission test / interview ka intezar karein

Admission Office: ${FACTS.admissionOffice} · ${FACTS.email}`,
    sources: [FACTS.applyUrl, FACTS.admissionsUrl],
  },
  {
    id: 'criteria',
    any: [/criteria/, /eligib/, /kitne (marks|number)/, /minimum (marks|percentage)/, /shart|sharait/, /requirement/],
    answer: `LGU ka minimum admission criteria (aakhri hasil ki gayi degree ke hisaab se):

| Program | Minimum |
|---|---|
| BSCS / BSSE / BSIT | 50% |
| Basic Sciences | 50% |
| Social Sciences & Languages | 50% |
| BS Psychology | 50% |
| Master | 50% |
| MS / M.Phil | 50% ya 2.5 CGPA |
| PhD | 70% ya 3.0 CGPA |

Har department ka apna admission test bhi hota hai — guidelines: ${FACTS.testUrl}`,
    sources: [FACTS.criteriaUrl, FACTS.testUrl],
  },
  {
    id: 'scholarship',
    any: [/scholar|scholership/, /wazifa|wazaif/, /financial (aid|assistance)/, /fee (concession|discount)/, /need based/],
    answer: `LGU par 7 tarah ki financial assistance available hai:

- Category I — Merit Based Scholarship
- Category II — Performance Based Award
- Category III — Defence Based Subsidy
- Category IV — Garrisonian & Kinship Based Scholarship
- Category V — LGU Employees Scholarship
- Category VI — Sports Based Scholarship
- Category VII — Need Based Scholarship

Eligibility aur application ke liye Admission Office se rabta karein: ${FACTS.admissionOffice}`,
    sources: [FACTS.scholarshipUrl],
  },
  {
    id: 'contact',
    any: [/contact|rabta/, /phone|number|call/, /email/, /address|pata|kahan hai|location/, /campus kahan/],
    answer: `Lahore Garrison University

- Address: ${FACTS.address}
- Phone: ${FACTS.phone}
- Admission Office: ${FACTS.admissionOffice}
- Email: ${FACTS.email}`,
    sources: ['https://lgu.edu.pk/contact/'],
  },
  {
    id: 'merit-list',
    any: [/merit list/, /merit kab/, /result kab|natija/, /selected|selection list/],
    answer: `Merit lists LGU ki official merit list page par publish hoti hain: ${FACTS.meritUrl}

Har intake (Fall / Spring) ke baad list update hoti hai. Apna form number saath rakhein.`,
    sources: [FACTS.meritUrl],
  },
  {
    id: 'test',
    any: [/entry test|admission test|entrance test/, /test kaise|test kya|imtihan/, /nts|test pattern|syllabus/],
    answer: `Har department ka apna admission test hota hai. Department-wise test guidelines yahan available hain: ${FACTS.testUrl}

Test ke baad merit list ${FACTS.meritUrl} par aati hai.`,
    sources: [FACTS.testUrl],
  },
  {
    id: 'greeting',
    any: [/^\s*(hi|hello|hey|salam|assalam|aoa|as-salam|slam)\b/, /^\s*(kya haal|kaise ho)/],
    answer: `Assalam-o-Alaikum! Main LGU Admissions ka assistant hoon.

Aap mujh se pooch sakte hain:
- Kisi bhi program ki fee structure
- Admission criteria aur eligibility
- Apply karne ka tareeqa aur deadlines
- Scholarships
- Roadmap / courses kisi degree ke

Kya jaanna chahenge?`,
    sources: [],
    skipRetrieval: true,
  },
];

/**
 * @returns {{id, answer, sources}|null} a canned answer, or null to fall
 *   through to the retrieval + LLM tier.
 */
export function matchFaq(query) {
  const q = query.toLowerCase().trim();

  for (const intent of INTENTS) {
    const anyHit = intent.any.some((re) => re.test(q));
    if (!anyHit) continue;
    if (intent.all && !intent.all.every((re) => re.test(q))) continue;
    return { id: intent.id, answer: intent.answer, sources: intent.sources, skipRetrieval: intent.skipRetrieval };
  }
  return null;
}

/**
 * A FAQ hit is only safe to serve verbatim when the question is *just* that
 * intent. "BSCS ki fee kitni hai aur criteria kya hai?" mentions criteria but
 * needs the real fee table, so questions carrying extra specifics go to the LLM
 * with the FAQ text supplied as context instead.
 */
export function isNarrowEnoughForCannedAnswer(query, faq) {
  if (faq.skipRetrieval) return true;
  const q = query.toLowerCase();

  // A program name in the question almost always means program-specific
  // numbers are wanted, which the canned answers don't carry.
  const mentionsProgram =
    /\b(bscs|bsse|bsit|bsds|bsai|bba|mba|bs\s|ms\s|m\.?phil|phd|adp|psychology|english|urdu|chemistry|physics|math|zoology|microbio|biotech|criminology|economics|islamic)/i.test(
      q
    );
  if (mentionsProgram) return false;

  // Compound questions ("aur", "also", "?") usually need more than one answer.
  if ((q.match(/\?/g) || []).length > 1) return false;
  if (/\b(aur|also|plus|both)\b/.test(q) && q.length > 40) return false;

  return true;
}
