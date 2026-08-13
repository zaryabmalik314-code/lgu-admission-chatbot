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

// Roman Urdu is Urdu written in English letters, so it can't be detected by
// character set. These function words are what actually distinguish it: they
// are extremely common in Urdu and essentially absent from English.
const ROMAN_URDU_MARKERS =
  /\b(kitni|kitna|kitne|kya|kyun|kaise|kaisay|kahan|kab|hai|hain|ho|hoga|hogi|mujhe|mujhy|mera|meri|apna|aap|aapka|ka|ki|ko|ke|se|mein|par|kar|karein|karna|karta|karti|chahiye|chahiyay|zaroori|nahi|nahin|acha|theek|batao|bataen|dein|lein|sakta|sakti|sakte|wala|wali|dakhla|fees|paisa|shart|wazifa|imtihan|parhai)\b/i;

/**
 * @returns {'ur'|'roman-ur'|'en'}
 */
export function detectLanguage(text) {
  if (/[؀-ۿ]/.test(text)) return 'ur';
  return ROMAN_URDU_MARKERS.test(text) ? 'roman-ur' : 'en';
}

// A program name in the question means program-specific numbers are wanted.
const PROGRAM_PATTERN =
  /\b(bscs|bsse|bsit|bsds|bsai|bba|mba|bsaf|adp|post.?adp|m\.?phil|mphil|ph\.?d|phd|ms|bs)\b|\b(computer science|software engineering|information technology|data science|artificial intelligence|cyber ?security|psychology|english|urdu|chemistry|physics|math(ematics)?|zoology|botany|microbiology|biotech(nology)?|biochemistry|nutrition|criminology|forensic|economics|islamic|business administration|accounting|mass ?com|media|international relations)\b/i;

export function mentionsProgram(query) {
  return PROGRAM_PATTERN.test(query);
}

/**
 * Each intent needs `any` (at least one must appear) and optionally `all`
 * (every one must appear), and may set `unless` to suppress itself. Patterns
 * run against the lowercased query, so they cover Roman Urdu spellings
 * alongside English.
 *
 * `answer` is Roman Urdu, `answerEn` is English. LGU takes international
 * students and plenty of applicants write in English, so serving one canned
 * language to everyone answers half of them in a language they didn't use.
 */
const INTENTS = [
  {
    // "fees kitni hai?" with no program named. Every faculty has a different
    // fee table, so there is no single right answer — left to the model it
    // picks numbers from whichever tables retrieval happened to return, which
    // reads as authoritative and is wrong for most readers. Asking which
    // program is both cheaper and more useful.
    id: 'fee-vague',
    any: [/\bfees?\b/, /\bfis\b/, /kharcha/, /learning investment/, /how much.*(cost|pay)/, /kitni.*(fee|paisa)/],
    unless: mentionsProgram,
    answer: `Fee har program ke liye alag hai. Aap kis program ke baare mein poochh rahe hain?

Misal ke tor par:
- BSCS / BSSE / BSIT / BS Data Science / BS AI
- BBA / MBA / BS Accounting & Finance
- BS Psychology / BS English / BS Criminology
- MS / M.Phil / PhD

Program ka naam batayein, main us ki poori fee structure bata deta hoon.

Ya poori list yahan hai: ${FACTS.feeUrl}`,
    answerEn: `Fees differ by program. Which program are you asking about?

For example:
- BSCS / BSSE / BSIT / BS Data Science / BS AI
- BBA / MBA / BS Accounting & Finance
- BS Psychology / BS English / BS Criminology
- MS / M.Phil / PhD

Tell me the program and I'll give you its full fee structure.

Or see the full list here: ${FACTS.feeUrl}`,
    sources: [FACTS.feeUrl],
    skipRetrieval: true,
  },
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
    answerEn: `Applications are submitted through LGU's online admission portal: ${FACTS.applyUrl}

Steps:
1. Register on the portal
2. Select your program (BS / ADP / MS / M.Phil / PhD)
3. Upload your academic record and documents
4. Submit the form and wait for the admission test / interview

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
    answerEn: `LGU's minimum admission criteria (based on your last completed degree):

| Program | Minimum |
|---|---|
| BSCS / BSSE / BSIT | 50% |
| Basic Sciences | 50% |
| Social Sciences & Languages | 50% |
| BS Psychology | 50% |
| Master | 50% |
| MS / M.Phil | 50% or 2.5 CGPA |
| PhD | 70% or 3.0 CGPA |

Each department also holds its own admission test — guidelines: ${FACTS.testUrl}`,
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
    answerEn: `LGU offers seven categories of financial assistance:

- Category I — Merit Based Scholarship
- Category II — Performance Based Award
- Category III — Defence Based Subsidy
- Category IV — Garrisonian & Kinship Based Scholarship
- Category V — LGU Employees Scholarship
- Category VI — Sports Based Scholarship
- Category VII — Need Based Scholarship

Contact the Admission Office for eligibility and how to apply: ${FACTS.admissionOffice}`,
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
    answerEn: `Lahore Garrison University

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
    answerEn: `Merit lists are published on LGU's official merit list page: ${FACTS.meritUrl}

The list is updated after each intake (Fall / Spring). Keep your form number handy.`,
    sources: [FACTS.meritUrl],
  },
  {
    id: 'test',
    any: [/entry test|admission test|entrance test/, /test kaise|test kya|imtihan/, /nts|test pattern|syllabus/],
    answer: `Har department ka apna admission test hota hai. Department-wise test guidelines yahan available hain: ${FACTS.testUrl}

Test ke baad merit list ${FACTS.meritUrl} par aati hai.`,
    answerEn: `Each department holds its own admission test. Department-wise test guidelines are here: ${FACTS.testUrl}

After the test, the merit list is published at ${FACTS.meritUrl}`,
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
    answerEn: `Hello! I'm the LGU Admissions assistant.

You can ask me about:
- Fee structure for any program
- Admission criteria and eligibility
- How to apply, and deadlines
- Scholarships
- Roadmaps / courses for any degree

What would you like to know?`,
    sources: [],
    skipRetrieval: true,
  },
];

/**
 * @returns {{id, answer, sources, lang}|null} a canned answer in the language
 *   the student wrote in, or null to fall through to the retrieval + LLM tier.
 */
export function matchFaq(query) {
  const q = query.toLowerCase().trim();
  const lang = detectLanguage(query);

  for (const intent of INTENTS) {
    const anyHit = intent.any.some((re) => re.test(q));
    if (!anyHit) continue;
    if (intent.all && !intent.all.every((re) => re.test(q))) continue;
    if (intent.unless?.(q)) continue;

    // Urdu script gets the Roman Urdu text rather than an English answer —
    // same language, just a different script, so it's much the closer match.
    const answer = lang === 'en' ? (intent.answerEn ?? intent.answer) : intent.answer;

    return { id: intent.id, answer, lang, sources: intent.sources, skipRetrieval: intent.skipRetrieval };
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

  // A program name almost always means program-specific numbers are wanted,
  // which the canned answers don't carry.
  if (mentionsProgram(q)) return false;

  // Compound questions ("aur", "also", "?") usually need more than one answer.
  if ((q.match(/\?/g) || []).length > 1) return false;
  if (/\b(aur|also|plus|both)\b/.test(q) && q.length > 40) return false;

  return true;
}
