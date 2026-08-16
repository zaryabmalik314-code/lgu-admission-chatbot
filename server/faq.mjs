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
  admissionMobile: '0322-2757543, 0329-4292976',
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

export function detectLangSwitch(text) {
  const q = text.toLowerCase();
  if (/\b(talk|speak|reply|respond|answer|write)\b.*\b(in\s+)?(english)\b/.test(q)) return 'en';
  if (/\b(english)\s*(mein|me|main|mai)\s*(baat|bolo|jawab|likho|karo)/.test(q)) return 'en';
  if (/\b(switch|change)\s*(to\s*)?(english)\b/.test(q)) return 'en';
  if (/\b(talk|speak|reply|respond|answer|write)\b.*\b(in\s+)?(urdu)\b/.test(q)) return 'ur';
  if (/\b(urdu)\s*(mein|me|main|mai)\s*(baat|bolo|jawab|likho|karo)/.test(q)) return 'ur';
  if (/\b(switch|change)\s*(to\s*)?(urdu)\b/.test(q)) return 'ur';
  return null;
}

// A program name in the question means program-specific numbers are wanted.
// The abbreviation group is the program CODES students type — including the
// specific ones the site uses (cmai, dfcs, wcci, bch) that don't start with a
// generic "bs"/"ms" prefix, so "cmai ki fee" is recognised as program-specific
// rather than falling into the "which program?" vague-fee reply.
export const PROGRAM_PATTERN =
  /\b(bscs|bsse|bsit|bsds|bsai|bba|mba|bsaf|cmai|dfcs|wcci|bch|mscs|msit|msds|msai|mscp|adp|post.?adp|m\.?phil|mphil|ph\.?d|phd|ms|bs)\b|\b(computer science|software engineering|information technology|data science|artificial intelligence|computational math(ematics)?|cyber ?security|digital forensic|psychology|english|urdu|chemistry|physics|math(ematics)?|zoology|botany|microbiology|biotech(nology)?|biochemistry|nutrition|criminology|forensic|economics|islamic|business administration|accounting|mass ?com|media|international relations)\b/i;

export function mentionsProgram(query) {
  return PROGRAM_PATTERN.test(query);
}

// Broader than PROGRAM_PATTERN: the everyday subject words a student uses to
// describe an interest ("I like biology", "I'm into computers"), which don't
// always match a formal program code.
const FIELD_PATTERN =
  /\b(bio(logy)?|computers?|computing|programming|coding|softwares?|business|commerce|finance|account(ing|s)?|management|math(s|ematics)?|physics|chemistry|psychology|english|urdu|media|journalism|communication|criminology|forensics?|economics|islamic|zoology|botany|nutrition|dietetics|artificial intelligence|data science|cyber ?security|electronics)\b/i;

// A marks statement ("i got 85%") also matches eligibility-advising's marks
// regexes, which would otherwise hijack a question that's really about
// scholarships ("85% ICS, scholarship milega?") and answer the wrong thing.
const SCHOLARSHIP_PATTERN = /scholar|scholership|wazifa|wazaif|financial (aid|assistance)|fee (concession|discount)|need based/i;


/**
 * Intermediate streams mapped to the LGU BS programs that fit them. This is a
 * stable, factual mapping (an ICS student's natural options are the computing
 * degrees), so templating it is both safe and far more useful than a generic
 * criteria table — which is what a "suggest me a degree" question actually
 * wants. Program names are proper nouns, identical in every language; only the
 * surrounding sentence changes.
 */
const STREAMS = [
  {
    re: /\b(ics|i\.?c\.?s\.?|pre.?comp|comp(uter)?\s*science)\b/i,
    label: 'ICS (computer science)',
    programs: [
      'BS Computational Mathematics & AI (CMAI) — HEC-recognized',
      'BS Computer Science (BSCS)',
      'BS Software Engineering (BSSE)',
      'BS Information Technology (BSIT)',
      'BS Data Science',
      'BS Artificial Intelligence',
      'BS Cyber Security',
    ],
    also: { en: 'BBA or BS Mathematics', ur: 'BBA ya BS Mathematics' },
  },
  {
    re: /\b(pre.?med(ical)?|medical\s*group|bio(logy)?\s*(group|inter|student)?)\b/i,
    label: 'pre-medical',
    programs: [
      'BS Biotechnology',
      'BS Microbiology',
      'BS Biochemistry',
      'BS Zoology',
      'BS Human Nutrition & Dietetics',
      'BS Chemistry',
      'BS Clinical Psychology',
      'BS Criminology & Forensic Sciences',
    ],
    also: { en: 'BBA', ur: 'BBA' },
  },
  {
    re: /\b(pre.?eng(ineer)?(ing)?|engineering\s*group)\b/i,
    label: 'pre-engineering',
    programs: [
      'BS Physics',
      'BS Computational Mathematics & AI',
      'BS Computer Science',
      'BS Software Engineering',
      'BS Computational Physics & Data Science',
    ],
    also: { en: 'BS IT or BS Data Science', ur: 'BS IT ya BS Data Science' },
  },
  {
    re: /\b(i\.?com|icom|d\.?com|commerce|tijarat)\b/i,
    label: 'commerce',
    programs: ['BBA', 'BS Accounting & Finance', 'BS Economics'],
    also: null,
  },
  {
    re: /\b(f\.?a\.?|arts|humanities)\b/i,
    label: 'arts / humanities',
    programs: [
      'BS English',
      'BS Urdu',
      'BS Media & Communication',
      'BS Clinical Psychology',
      'BS Criminology',
      'BS International Relations',
      'BS Islamic Studies',
    ],
    also: null,
  },
];

/** First plausible marks figure in the query (30–100), else null. */
function parseMarks(query) {
  const nums = [...query.matchAll(/(\d{1,3})\s*(%|percent|marks?|fisad)?/gi)]
    .map((m) => parseInt(m[1], 10))
    .filter((n) => n >= 30 && n <= 100);
  return nums.length ? nums[0] : null;
}

/**
 * The advising answer. If the student named an intermediate stream, suggest the
 * programs that fit it — short, and actually a recommendation. Otherwise ask
 * which stream they did rather than dumping the whole criteria table.
 *
 * Reads recent history because advising is a two-turn conversation: a student
 * says "I'm from ICS inter", then follows with just "i got 60". The stream from
 * the earlier turn has to carry into the follow-up, or the second message maps
 * 60% to the wrong row (the old bug: an ICS student told they qualify for PhD).
 */
function buildAdvisingAnswer(query, lang, history = []) {
  const en = lang === 'en';

  // The student's own recent turns, newest first — never the bot's, so we don't
  // detect a stream from the bot having listed programs earlier.
  const priorText = history
    .filter((h) => h.role === 'user')
    .slice(-4)
    .map((h) => h.content)
    .reverse()
    .join(' \n ');

  // Prefer what's in the current message; fall back to the conversation.
  const stream = STREAMS.find((s) => s.re.test(query)) || STREAMS.find((s) => s.re.test(priorText));
  const marks = parseMarks(query) ?? parseMarks(priorText);

  if (!stream) {
    return en
      ? `Which Intermediate stream did you do — ICS, pre-medical, pre-engineering, commerce, or arts? Tell me that and I'll suggest the programs that fit. After Intermediate you're eligible for any BS program at 50%. Apply: ${FACTS.applyUrl}`
      : `Aap ne Intermediate mein kaunsa group kiya — ICS, pre-medical, pre-engineering, commerce, ya arts? Yeh bata dein, main aap ke liye munasib programs suggest kar deta hoon. Intermediate ke baad 50% par aap kisi bhi BS program ke liye eligible hain. Apply: ${FACTS.applyUrl}`;
  }

  let marksLine = '';
  if (marks != null) {
    if (marks >= 50) {
      marksLine = en
        ? `With ${marks}% you're comfortably above the 50% minimum. `
        : `${marks}% ke saath aap 50% minimum se aaraam se upar hain. `;
    } else {
      marksLine = en
        ? `Note: BS programs need 50%, so at ${marks}% confirm eligibility with the office, or consider an ADP (2-year). `
        : `Note: BS ke liye 50% chahiye, is liye ${marks}% par office se confirm karein, ya ADP (2-saal) consider karein. `;
    }
  }

  const list = stream.programs.map((p) => `- ${p}`).join('\n');
  const also = stream.also ? (en ? stream.also.en : stream.also.ur) : null;
  const article = /^[aeiou]/i.test(stream.label) ? 'an' : 'a';

  return en
    ? `${marksLine}With ${article} ${stream.label} background, these LGU programs fit best:\n\n${list}\n\n${
        also ? `You'd also qualify for ${also}. ` : ''
      }Each has its own admission test. Confirm which of these are open this intake under "Programs Offered and Admission Schedule" before applying. Apply: ${FACTS.applyUrl}`
    : `${marksLine}${stream.label} background ke saath, aap ke liye ye LGU programs sab se munasib hain:\n\n${list}\n\n${
        also ? `Aap ${also} ke liye bhi eligible hain. ` : ''
      }Har ek ka apna admission test hota hai. Apply karne se pehle "Programs Offered and Admission Schedule" mein confirm kar lein ke ye is intake mein open hain. Apply: ${FACTS.applyUrl}`;
}

/**
 * Degree-level overviews ("BS info", "MS info", "PhD info") — a different
 * question from STREAMS (which programs fit *my* background) and from
 * programs-list (the generic "what do you offer"). This is a level-scoped
 * catalog, so it's templated the same way advising is: detect which level the
 * student named, return that level's fixed, verified list.
 */
const LEVELS = [
  {
    re: /\bbs\b|\bundergrad(uate)?\b|\bbachelors?\b/i,
    label: { en: 'BS (undergraduate)', ur: 'BS (undergraduate)' },
    duration: { en: '4 years, 8 semesters', ur: '4 saal, 8 semesters' },
    eligibility: { en: 'Intermediate (or equivalent) with 50%', ur: 'Intermediate (ya equivalent) 50% ke saath' },
    // CMAI leads here for the same reason it leads programs-list and the
    // "featured program" system-prompt rule: no personalization signal to
    // weigh it against yet.
    programs: [
      'BS Computational Mathematics & AI (CMAI) — HEC-recognized',
      'BSCS / BSSE / BSIT / BS Data Science / BS AI / BS Cyber Security',
      'BBA / BS Accounting & Finance / BS Digital Business / BS Economics',
      'BS Psychology / BS Clinical Psychology',
      'BS Biotechnology / BS Human Nutrition & Dietetics / BS Genetics',
      'BS Chemistry / BS Physics / BS Computational Physics & Data Science',
      'BS Criminology (Digital Forensics, Crime Scene, Financial Crime)',
      'BS English / BS Media & Communication / BS International Relations',
    ],
  },
  {
    re: /\bms\b|\bm\.?phil\b|\bmphil\b|\bmasters?\b|\bpostgraduate\b/i,
    label: { en: 'MS / M.Phil', ur: 'MS / M.Phil' },
    duration: { en: '2 years', ur: '2 saal' },
    eligibility: { en: 'Relevant BS with 50% or 2.5 CGPA', ur: 'Relevant BS 50% ya 2.5 CGPA ke saath' },
    programs: [
      'MS Computer Science (MSCS, weekend option available)',
      'MS Information Technology (MSIT)',
      'MS Data Science (MSDS)',
      'MS Artificial Intelligence (MSAI)',
      'MBA (Business / Non-Business)',
      'MS Clinical Psychology / MS Psychology / M.Phil Applied Psychology',
      'M.Phil Mathematics / M.Phil English / M.Phil Mass Communication / M.Phil Islamic Studies / M.Phil International Relations',
    ],
  },
  {
    re: /\bph\.?d\b|\bdoctorate\b|\bdoctoral\b/i,
    label: { en: 'PhD', ur: 'PhD' },
    duration: { en: '3 years minimum (up to 7–8 years max)', ur: '3 saal minimum (max 7–8 saal tak)' },
    eligibility: { en: 'MS/M.Phil with 70% or 3.0 CGPA', ur: 'MS/M.Phil 70% ya 3.0 CGPA ke saath' },
    programs: [
      'PhD Computer Science',
      'PhD Mathematics',
      'PhD Management Sciences',
      'PhD Chemistry',
      'PhD Urdu',
    ],
  },
];

function buildLevelInfoAnswer(query, lang) {
  const en = lang === 'en';
  const level = LEVELS.find((l) => l.re.test(query));
  if (!level) return null;

  const list = level.programs.map((p) => `- ${p}`).join('\n');
  // This is LGU's full catalog for the level, not this intake's open list —
  // a handful of these programs (e.g. BS Urdu, BS Physics) don't run every
  // admission cycle. Without this line students read the catalog as "open now".
  const caveat = en
    ? "Not every program takes new admissions every intake — check \"Programs Offered and Admission Schedule\" on the portal for what's open right now."
    : 'Har program har intake mein open nahi hota — abhi kya open hai yeh portal par "Programs Offered and Admission Schedule" mein dekh lein.';
  return en
    ? `**${level.label.en} at LGU** — ${level.duration.en}. Eligibility: ${level.eligibility.en}.\n\n${list}\n\n${caveat}\n\nFull list: ${FACTS.admissionsUrl}\nApply: ${FACTS.applyUrl}`
    : `**${level.label.ur} LGU mein** — ${level.duration.ur}. Eligibility: ${level.eligibility.ur}.\n\n${list}\n\n${caveat}\n\nPoori list: ${FACTS.admissionsUrl}\nApply: ${FACTS.applyUrl}`;
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
    // Checked before the vague fee-catchall below: "fee structure" contains
    // the word "fee" too, so without this ordering the broader fee-vague
    // intent would win and this comparison table would never fire.
    id: 'fee-structure',
    any: [/fee\s*structure/, /fees?\s*(table|list|comparison|compare)/, /total\s*(fee|charges|cost)/, /per\s*credit\s*hour/, /semester\s*fee/, /admission\s*fee/],
    unless: mentionsProgram,
    answerFn: (query, lang) => {
      const table = `| Program | Admission Fee | Per Credit Hour | 1st Sem (Est.) | Total (Est.) |
| --- | --- | --- | --- | --- |
| BSCS / BSSE / BSIT / BSDS / BSAI / BS CySec | 17,500 | 7,744 | 163,252 | 1,086,848 |
| CMAI / BS Chem / Math / Stats / Physics | 17,500 | 6,403 | 140,614 | 921,836 |
| BBA | 17,500 | 7,392 | 155,916 | 1,032,384 |
| BS Psych / BS Clinical Psych | 17,500 | 7,392 | 158,416 | 1,052,384 |
| BS A&F / Mass Com / IR / Econ | 17,500 | 6,695 | 143,370 | 940,380 |
| BS Bio / Biotech / Micro / Zoology / Nutrition | 17,500 | 6,695 | 145,870 | 960,380 |
| BS English / BS Urdu | 17,500 | 5,160 | 110,580 | 737,760 |
| MS/MPhil CS / IT / DS | 20,000 | 11,816 | 165,392 | 387,580 |
| PhD CS | 50,000 | 15,246 | 195,814 | 816,408 |`;
      const note = lang === 'en'
        ? `\n\nAll amounts are in PKR (FY 2026-27). Fees may change — confirm with Admission Office: ${FACTS.admissionOffice} / ${FACTS.admissionMobile}\n\nFull details: ${FACTS.feeUrl}`
        : `\n\nSaari fees PKR mein hain (FY 2026-27). Fees change ho sakti hain — confirm karein Admission Office se: ${FACTS.admissionOffice} / ${FACTS.admissionMobile}\n\nPoori list: ${FACTS.feeUrl}`;
      const intro = lang === 'en'
        ? 'Here\'s the fee structure for top programs at LGU:\n\n'
        : 'LGU ke popular programs ki fee structure:\n\n';
      return intro + table + note;
    },
    sources: [FACTS.feeUrl],
    skipRetrieval: true,
  },
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
- BS Computational Mathematics & AI (CMAI) — HEC-recognized
- BSCS / BSSE / BSIT / BS Data Science / BS AI
- BBA / MBA / BS Accounting & Finance
- BS Psychology / BS English / BS Criminology
- MS / M.Phil / PhD

Program ka naam batayein, main us ki poori fee structure bata deta hoon.

Ya poori list yahan hai: ${FACTS.feeUrl}`,
    answerEn: `Fees differ by program. Which program are you asking about?

For example:
- BS Computational Mathematics & AI (CMAI) — HEC-recognized
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

Admission Office: ${FACTS.admissionOffice} / ${FACTS.admissionMobile} · ${FACTS.email}`,
    answerEn: `Applications are submitted through LGU's online admission portal: ${FACTS.applyUrl}

Steps:
1. Register on the portal
2. Select your program (BS / ADP / MS / M.Phil / PhD)
3. Upload your academic record and documents
4. Submit the form and wait for the admission test / interview

Admission Office: ${FACTS.admissionOffice} / ${FACTS.admissionMobile} · ${FACTS.email}`,
    sources: [FACTS.applyUrl, FACTS.admissionsUrl],
  },
  {
    // "I have X% marks, which program can I get?" — the core advising question.
    // It was getting refused as off-topic, or answered wrong: the model read
    // the criteria table and told a student with 70% intermediate marks they
    // could do a PhD, because 70% is the PhD row. A canned answer keyed on the
    // question is both safe and reliable — the table is fixed and verified, and
    // the framing makes clear which prior qualification each row applies to.
    id: 'eligibility-advising',
    // Fires on eligibility/recommendation phrasing. But if the student names a
    // subject and gives no marks ("I like biology, which program?"), that's an
    // interest question — they want the programs in that field, not the generic
    // criteria table — so it's suppressed and retrieval lists real programs.
    // With marks present, eligibility is the priority and the table wins.
    unless: (q) => (FIELD_PATTERN.test(q) && parseMarks(q) == null) || SCHOLARSHIP_PATTERN.test(q),
    any: [
      /which (degree|program|course|field)/,
      /what (degree|program|course).*(can|should) i/,
      /suggest.*(degree|program|course|field)/,
      /recommend.*(degree|program|course)/,
      /(kaunsa|konsa|kon sa|kaun sa).*(program|degree|course|field|le)/,
      /(le sakta|le sakti|kar sakta|kar sakti|mil sakta|mil sakti).*(hoon|hun|hai)/,
      /kis (degree|program|field) (mein|me)/,
      // Bare marks statements — the common follow-up. "i got 60", "scored 55",
      // "mere 60", "60%", "60 marks", or a message that's just "60". These
      // inherit the stream from earlier turns via buildAdvisingAnswer.
      // Bare stream name — "ics", "pre medical", "fsc pre eng". A student
      // who types just their intermediate stream clearly wants to know which
      // LGU programs fit; without this they fall to retrieval which matches
      // wrong chunks (e.g. Physics for "ics").
      /^\s*(ics|i\.?c\.?s\.?|fsc|f\.?s\.?c\.?|pre.?med(ical)?|pre.?eng(ineer)?(ing)?|i\.?com|icom|d\.?com|f\.?a\.?)\s*[?.!]*\s*$/i,
      /\b(got|scored|liye|liya|have|hain?)\s+\d{2,3}\b/i,
      /\bmere?\s+\d{2,3}\b/i,
      // \b can never follow a literal "%" (it's not a word character, so the
      // boundary check fails against the space or end-of-string after it) —
      // the old `(%|percent|fisad|marks?)\b` form silently never matched a
      // bare "85%". Boundary now sits only after the word-based alternatives.
      /\b\d{2,3}\s*(%|percent\b|fisad\b|marks?\b)/i,
      /^\s*\d{2,3}\s*%?\s*[?.!]*\s*$/,
    ],
    // Answer depends on the stream/marks in the question, so it's generated
    // rather than static. See buildAdvisingAnswer.
    answerFn: buildAdvisingAnswer,
    sources: [FACTS.criteriaUrl],
    skipRetrieval: true,
  },
  {
    id: 'criteria',
    any: [/criteria/, /eligib/, /kitne (marks|number)/, /minimum (marks|percentage)/, /shart|sharait/, /requirement/],
    // A program name means they want that program's specific criteria — let
    // retrieval handle it rather than the generic table.
    unless: mentionsProgram,
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
    // Students often fold marks into the scholarship question itself ("85% ICS,
    // scholarship milega in CMAI?"), so the answer opens with a line about their
    // marks before the category list — otherwise it reads like it ignored half
    // the question.
    id: 'merit-scholarship',
    any: [/merit\s*based/i],
    all: [/scholar|scholership|wazifa|wazaif/],
    answerFn: (query, lang) => {
      const en = lang === 'en';
      const marks = parseMarks(query);

      const table = `| % of Marks (Intermediate) | Tuition Fee Exemption | Continuation Criteria |
|---|---|---|
| 80% to 84.99% | 25% | SGPA 3.5 & Above |
| 85% to 99% | 50% | SGPA 3.5 & Above |
| Position Holder (Board) | 100% | SGPA 3.5 & Above |

| Grades (A-Level) | Tuition Fee Exemption | Continuation Criteria |
|---|---|---|
| Straight A* | 100% | SGPA 3.5 & Above |
| At least two A* (no less than A in others) | 50% | SGPA 3.5 & Above |`;

      const marksLine =
        marks == null ? ''
        : marks >= 85 ? (en
            ? `With ${marks}% you qualify for 50% tuition fee exemption! `
            : `${marks}% ke saath aapko 50% tuition fee exemption milegi! `)
        : marks >= 80 ? (en
            ? `With ${marks}% you qualify for 25% tuition fee exemption. `
            : `${marks}% ke saath aapko 25% tuition fee exemption milegi. `)
        : (en
            ? `${marks}% is below the 80% threshold for merit-based tuition exemption. Check Need Based or other categories. `
            : `${marks}% merit-based tuition exemption ke 80% threshold se neeche hai. Need Based ya doosri categories dekhein. `);

      return en
        ? `${marksLine}LGU's Merit Based Scholarship (Category I) offers tuition fee exemption based on your intermediate/A-Level marks:\n\n${table}\n\nYou must maintain SGPA 3.5 or above each semester to keep the scholarship.\n\nAdmission Office: ${FACTS.admissionOffice} / ${FACTS.admissionMobile}`
        : `${marksLine}LGU ka Merit Based Scholarship (Category I) aapke intermediate/A-Level marks ke hisaab se tuition fee exemption deta hai:\n\n${table}\n\nScholarship barqarar rakhne ke liye har semester SGPA 3.5 ya usse zyada chahiye.\n\nAdmission Office: ${FACTS.admissionOffice} / ${FACTS.admissionMobile}`;
    },
    sources: [FACTS.scholarshipUrl],
    skipRetrieval: true,
  },
  {
    id: 'scholarship',
    any: [/scholar|scholership/, /wazifa|wazaif/, /financial (aid|assistance)/, /fee (concession|discount)/, /need based/],
    answerFn: (query, lang) => {
      const en = lang === 'en';
      const marks = parseMarks(query);
      const marksLine =
        marks == null
          ? ''
          : marks >= 80
          ? en
            ? `With ${marks}% you're in strong range for Category I (Merit Based) — final award still depends on that intake's merit list. `
            : `${marks}% ke saath aap Category I (Merit Based) ke liye strong range mein hain — final award us intake ki merit list par depend karta hai. `
          : marks >= 60
          ? en
            ? `${marks}% gives you a reasonable shot at merit-based scholarships, though the cutoff moves each intake depending on the merit list. `
            : `${marks}% ke saath merit-based scholarship ka reasonable chance hai, lekin cutoff har intake ki merit list ke hisaab se badalta hai. `
          : en
          ? `${marks}% is below where merit-based awards usually land — Need Based or Defence/Kinship categories may fit better depending on your situation. `
          : `${marks}% merit-based awards ke usual range se kam hai — aap ki situation ke hisaab se Need Based ya Defence/Kinship category zyada munasib ho sakti hai. `;

      const list = `- Category I — Merit Based Scholarship
- Category II — Performance Based Award
- Category III — Defence Based Subsidy
- Category IV — Garrisonian & Kinship Based Scholarship
- Category V — LGU Employees Scholarship
- Category VI — Sports Based Scholarship
- Category VII — Need Based Scholarship`;

      return en
        ? `${marksLine}LGU offers seven categories of financial assistance, and they apply across all programs:\n\n${list}\n\nContact the Admission Office for exact eligibility and how to apply: ${FACTS.admissionOffice} / ${FACTS.admissionMobile}`
        : `${marksLine}LGU par 7 tarah ki financial assistance available hai, aur ye har program par apply hoti hai:\n\n${list}\n\nExact eligibility aur apply karne ke liye Admission Office se rabta karein: ${FACTS.admissionOffice} / ${FACTS.admissionMobile}`;
    },
    sources: [FACTS.scholarshipUrl],
    // The category list is the same regardless of which program is named, so a
    // program mention shouldn't push this to the LLM tier the way it does for
    // program-specific questions (fees, roadmap). Serve instantly.
    skipRetrieval: true,
  },
  {
    id: 'supply-supplementary',
    any: [/\bsuppl(y|ementary)\b/, /\bcompartment\b/, /part\s*1\s*(result|marks)/, /\b(fail|ruk|pending)\b.*\b(subject|paper)\b/, /\bprovisional\b.*\b(admiss|dakhla)\b/],
    answer: `Haan, aap apply kar sakte hain! LGU provisional admission deta hai 1st year (Part 1) ke result ki buniyad par, jab tak Part 2 ka result nahi aa jata.

Lekin yaad rakhein:
- Part 2 ka complete result aane ke baad submit karna zaroori hai
- Final eligibility 50% marks par check hogi (Part 1 + Part 2 dono mila kar)
- Agar 50% se kam aaye to admission cancel ho jayega

Toh agar aapke Part 1 mein pass hain aur Part 2 pending hai ya supply hai, apply kar dein — seat secure ho jayegi provisionally.

Apply: ${FACTS.applyUrl}
Admission Office: ${FACTS.admissionOffice} / ${FACTS.admissionMobile}`,
    answerEn: `Yes, you can apply! LGU offers provisional admission based on your Part 1 (1st year) Intermediate results while you await Part 2 results.

Key conditions:
- You must submit your complete result once Part 2 results are declared
- Final eligibility requires minimum 50% marks overall (Part 1 + Part 2 combined)
- If you fall below 50%, the admission will be cancelled

So if you have a supply/supplementary in Part 2, go ahead and apply — your seat is secured provisionally until your complete result comes in.

Apply: ${FACTS.applyUrl}
Admission Office: ${FACTS.admissionOffice} / ${FACTS.admissionMobile}`,
    sources: [FACTS.applyUrl],
    skipRetrieval: true,
  },
  {
    id: 'entry-test-dates',
    any: [
      /ent(e)?ry\s*test/, // "entery test" is a common typo
      /admission test|entrance test/,
      /test.*date|test.*kab|imtihan.*kab/,
      /test.*schedule/,
      /\bnext\b.*\btest\b|\btest\b.*\bnext\b/,
      /\bwhen\b.*\btest\b/,
    ],
    unless: (q) => /pattern|syllabus|guide|prepare|tayyar/i.test(q),
    answer: `**Fa-2026 Entry Test Schedule:**

| Faculty / Department | Last Date to Apply | Entry Test Date |
|---|---|---|
| Faculty of Computer Science (BSCS, BSSE, BSDS, BSAI, BS CySec, MSCS, MSAI, MSDS) | 17 Aug 2026 | 18 Aug 2026 |
| Management Sciences, English, Criminology, Mathematics, CMAI | 17 Aug 2026 | 18 Aug 2026 |
| Psychology (BS Psy, MS Psy, BS PCP, MSCP) | 20 Aug 2026 | 21 Aug 2026 |
| Basic Sciences, Languages, BS Mass Comm | No entry test | Open merit |

- Entry test multiple rounds mein hota hai — jaldi appear hona better hai, seats rolling basis par fill hoti hain
- Agar result se khush nahi, next round mein dobara de sakte hain

Apply: ${FACTS.applyUrl}
Admission Office: ${FACTS.admissionOffice} / ${FACTS.admissionMobile}`,
    answerEn: `**Fa-2026 Entry Test Schedule:**

| Faculty / Department | Last Date to Apply | Entry Test Date |
|---|---|---|
| Faculty of Computer Science (BSCS, BSSE, BSDS, BSAI, BS CySec, MSCS, MSAI, MSDS) | 17 Aug 2026 | 18 Aug 2026 |
| Management Sciences, English, Criminology, Mathematics, CMAI | 17 Aug 2026 | 18 Aug 2026 |
| Psychology (BS Psy, MS Psy, BS PCP, MSCP) | 20 Aug 2026 | 21 Aug 2026 |
| Basic Sciences, Languages, BS Mass Comm | No entry test | Open merit |

- Entry tests are conducted in multiple rounds — appearing early is better as seats fill on a rolling basis
- You can reappear in later rounds to improve your score

Apply: ${FACTS.applyUrl}
Admission Office: ${FACTS.admissionOffice} / ${FACTS.admissionMobile}`,
    sources: [FACTS.applyUrl],
    skipRetrieval: true,
  },
  {
    id: 'last-date',
    any: [/last date|deadline|akhri tarikh|kab tak|last day/, /apply.*kab tak|kab tak.*apply/],
    unless: (q) => /merit|result|fee|challan/i.test(q),
    answer: `**Fa-2026 Last Dates to Apply:**

- Computer Science programs (BSCS, BSSE, BSDS, BSAI, BS CySec): **17 Aug 2026**
- Management Sciences, English, Criminology, Mathematics, CMAI: **17 Aug 2026**
- Psychology programs: **20 Aug 2026**
- Basic Sciences, Languages, BS Mass Comm: **18 Aug 2026**

Jaldi apply karein — seats limited hain aur rolling basis par fill hoti hain. Sab seats bharr jaane ke baad admissions band ho jayenge.

Apply: ${FACTS.applyUrl}`,
    answerEn: `**Fa-2026 Last Dates to Apply:**

- Computer Science programs (BSCS, BSSE, BSDS, BSAI, BS CySec): **17 Aug 2026**
- Management Sciences, English, Criminology, Mathematics, CMAI: **17 Aug 2026**
- Psychology programs: **20 Aug 2026**
- Basic Sciences, Languages, BS Mass Comm: **18 Aug 2026**

Apply early — seats are limited and filled on a rolling basis. Admissions close once all seats are filled.

Apply: ${FACTS.applyUrl}`,
    sources: [FACTS.applyUrl],
    skipRetrieval: true,
  },
  {
    id: 'documents-required',
    any: [/document|dastawez|kagaz/, /kya.*chahiye.*admission|admission.*chahiye/, /required.*admission|admission.*required/, /submit.*kya|kya.*submit|kya.*lana/],
    answer: `Admission ke liye ye documents chahiye:

- Intermediate / A-Level result (Part 1 ya complete)
- Matric / O-Level result
- CNIC ya B-Form ki copy
- 2 passport size photos
- Character certificate (last institution se)
- Migration certificate (agar doosri university se aa rahe hain)

Online form ke saath scan copies upload karein. Original documents admission confirm hone par verify hoti hain.

Apply online: ${FACTS.applyUrl}
Admission Office: ${FACTS.admissionOffice} / ${FACTS.admissionMobile}`,
    answerEn: `Documents required for admission:

- Intermediate / A-Level result (Part 1 or complete)
- Matric / O-Level result
- CNIC or B-Form copy
- 2 passport-size photos
- Character certificate (from last institution)
- Migration certificate (if transferring from another university)

Upload scanned copies with your online form. Original documents are verified upon admission confirmation.

Apply online: ${FACTS.applyUrl}
Admission Office: ${FACTS.admissionOffice} / ${FACTS.admissionMobile}`,
    sources: [FACTS.applyUrl],
    skipRetrieval: true,
  },
  {
    id: 'hostel-transport',
    any: [/hostel|accommodation|rehaaish|rihaaish/, /transport|\bbus\b|\bvan\b|conveyance/, /bahar se|out of city|doosre shehar/],
    answer: `LGU ki website par filhal hostel ya transport ki specific details available nahi hain. In cheezon ke liye seedha Admission Office se poochein — woh aapko updated availability bata sakte hain:

- Phone: ${FACTS.admissionOffice} / ${FACTS.admissionMobile}
- Email: ${FACTS.email}
- Campus: ${FACTS.address}`,
    answerEn: `LGU's website doesn't currently list specific hostel or transport details. For the latest availability, contact the Admission Office directly:

- Phone: ${FACTS.admissionOffice} / ${FACTS.admissionMobile}
- Email: ${FACTS.email}
- Campus: ${FACTS.address}`,
    sources: ['https://lgu.edu.pk/contact/'],
    skipRetrieval: true,
  },
  {
    id: 'contact',
    any: [/contact|rabta/, /phone|number|call/, /email/, /address|pata|kahan hai|location/, /campus kahan/],
    answer: `Lahore Garrison University

- Address: ${FACTS.address}
- Phone: ${FACTS.phone}
- Admission Office: ${FACTS.admissionOffice} / ${FACTS.admissionMobile}
- Email: ${FACTS.email}`,
    answerEn: `Lahore Garrison University

- Address: ${FACTS.address}
- Phone: ${FACTS.phone}
- Admission Office: ${FACTS.admissionOffice} / ${FACTS.admissionMobile}
- Email: ${FACTS.email}`,
    sources: ['https://lgu.edu.pk/contact/'],
    // These facts never vary by program, so a query like "CMAI number" must not
    // fall through to the LLM tier just because it names a program — that tier
    // sees conversation history, and if the creator intent fired earlier in the
    // same session, the model can leak the developer's personal number into an
    // unrelated contact answer.
    skipRetrieval: true,
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
    // Students type this as a direct choice between two similarly-named
    // undergrad programs. Both are 4-year BS degrees — retrieval has
    // repeatedly confused "BS AI" with the unrelated MS(AI) graduate program
    // (LGU's own site even mislabels the BS AI page's URL slug as an IT
    // roadmap), so this is answered here with verified facts rather than
    // left to chunk retrieval.
    id: 'cmai-vs-bsai',
    any: [
      /\bcmai\b[^.?!]{0,20}\b(or|vs\.?|versus|ya)\b[^.?!]{0,20}\b(bs\s*ai|bsai|ai|artificial intelligence)\b/,
      /\b(bs\s*ai|bsai|ai|artificial intelligence)\b[^.?!]{0,20}\b(or|vs\.?|versus|ya)\b[^.?!]{0,20}\bcmai\b/,
      /difference between cmai and (bs\s*ai|bsai|ai|artificial intelligence)/,
      /cmai.*(better|different|same).*\b(bs\s*ai|bsai|ai)\b/,
    ],
    answer: `CMAI aur BS AI dono alag 4-year BS degrees hain, lekin department aur focus different hai:

**BS Computational Mathematics & AI (CMAI)** — Department of Mathematics, HEC-recognized, 135 credit hours. Applied math + AI ka combination — theory, modeling, algorithms ki strong base.

**BS Artificial Intelligence (BS AI)** — Computer Science faculty, NCEAC accredited, 131 credit hours. Programming/software engineering-heavy — AI specifically as a CS major.

Note: MS (AI) ek alag cheez hai — woh 2-year graduate degree hai, inn dono BS programs se unrelated.

Agar math/theory pasand hai to CMAI, agar coding/software pasand hai to BS AI zyada fit karega. Dono ki fee: ${FACTS.feeUrl}
Apply: ${FACTS.applyUrl}`,
    answerEn: `CMAI and BS AI are two separate 4-year BS degrees, but they differ in department and focus:

**BS Computational Mathematics & AI (CMAI)** — Department of Mathematics, HEC-recognized, 135 credit hours. Blends applied math with AI — strong grounding in theory, modeling, and algorithms.

**BS Artificial Intelligence (BS AI)** — Computer Science faculty, NCEAC accredited, 131 credit hours. Programming/software-engineering-heavy — AI as a dedicated CS major.

Note: MS (AI) is a different program entirely — a 2-year graduate degree, unrelated to either of these BS programs.

If you lean toward math/theory, CMAI fits better; if you lean toward coding/software, BS AI is the closer match. Fee structure: ${FACTS.feeUrl}
Apply: ${FACTS.applyUrl}`,
    sources: [
      'https://lgu.edu.pk/bs-mathematics-in-computational-mathematics-and-artificial-intelligence/',
      'https://lgu.edu.pk/bs-information-technology-road-map-2/',
    ],
  },
  {
    id: 'cmai-hec',
    any: [/cmai.*(hec|recogni|accredit|valid|manya)/, /(hec|recogni|accredit).*(cmai|computational math)/],
    answer: `Haan, BS Computational Mathematics & AI (CMAI) HEC-recognized degree hai. Ye LGU ke Department of Mathematics ke under aata hai — 4 saal ka program hai, 135 credit hours.

Apply: ${FACTS.applyUrl}
Admission Office: ${FACTS.admissionOffice} / ${FACTS.admissionMobile}`,
    answerEn: `Yes, BS Computational Mathematics & AI (CMAI) is fully HEC-recognized. It's a 4-year program under LGU's Department of Mathematics — 135 credit hours.

Apply: ${FACTS.applyUrl}
Admission Office: ${FACTS.admissionOffice} / ${FACTS.admissionMobile}`,
    sources: [FACTS.applyUrl],
    skipRetrieval: true,
  },
  {
    id: 'cmai-scope',
    any: [
      /cmai.*(scope|career|job|future|salary|demand|placement)/,
      /(scope|career|job|future|salary|demand|placement).*(cmai|computational math)/,
      /computational math.*(scope|career|job|future)/,
    ],
    answer: `**BS Computational Mathematics & AI (CMAI)** — LGU Department of Mathematics, HEC-recognized, 4 saal / 135 credit hours.

**Math aur AI kaise blend hote hain (learning approach):**
Students pehle strong mathematical foundation build karte hain — Linear Algebra, Calculus, Probability & Statistics, ODEs/PDEs — aur phir usi math ko AI/ML mein apply karte hain. Yani Machine Learning ya Deep Learning sikhte waqt aapko already pata hota hai ke algorithm ke peeche ka math kya hai aur kyu kaam karta hai. Ye "samajh ke seekhna" hai, sirf tools chalana nahi.

**Curriculum ka flow:**
- **Semesters 1–3** — Math + Programming foundations (Calculus, Linear Algebra, Discrete Math, OOP, Python, Data Structures)
- **Semesters 4–6** — Math aur AI ka intersection (Machine Learning, Neural Networks & Deep Learning, Optimization Theory, Numerical Computing, Fuzzy Logic)
- **Semesters 7–8** — Applied skills + industry exposure (Cryptography, SAP Data Intelligence, Capstone Project, Internship)

**Career scope:**
Math + AI ka combination ML Engineer, Data Scientist, Quantitative Analyst, aur Research roles mein directly kaam aata hai. Higher studies mein MS AI / MS CS / M.Phil Mathematics ke liye eligible hain.

Apply: ${FACTS.applyUrl}
Fee structure: ${FACTS.feeUrl}
Full roadmap: https://lgu.edu.pk/bs-mathematics-in-computational-mathematics-and-artificial-intelligence/`,
    answerEn: `**BS Computational Mathematics & AI (CMAI)** — LGU Department of Mathematics, HEC-recognized, 4 years / 135 credit hours.

**How math and AI blend (the learning approach):**
Students first build a strong mathematical foundation — Linear Algebra, Calculus, Probability & Statistics, ODEs/PDEs — and then apply that math directly in AI/ML courses. So when you study Machine Learning or Deep Learning, you already understand the math behind how and why the algorithms work. It's learning to understand, not just learning to use tools.

**Curriculum flow:**
- **Semesters 1–3** — Math + Programming foundations (Calculus, Linear Algebra, Discrete Math, OOP, Python, Data Structures)
- **Semesters 4–6** — Where math meets AI (Machine Learning, Neural Networks & Deep Learning, Optimization Theory, Numerical Computing, Fuzzy Logic)
- **Semesters 7–8** — Applied skills + industry exposure (Cryptography, SAP Data Intelligence, Capstone Project, Internship)

**Career scope:**
The math + AI combination feeds directly into ML Engineer, Data Scientist, Quantitative Analyst, and Research roles. For higher studies, graduates are eligible for MS AI / MS CS / M.Phil Mathematics.

Apply: ${FACTS.applyUrl}
Fee structure: ${FACTS.feeUrl}
Full roadmap: https://lgu.edu.pk/bs-mathematics-in-computational-mathematics-and-artificial-intelligence/`,
    sources: ['https://lgu.edu.pk/bs-mathematics-in-computational-mathematics-and-artificial-intelligence/', FACTS.applyUrl],
    // Question mentions CMAI (a program) which normally routes to the LLM tier
    // via mentionsProgram(); without this the polished scope answer would be
    // replaced by an LLM summary of retrieved chunks.
    skipRetrieval: true,
  },
  {
    // General "what is CMAI" / "tell me about CMAI" — placed after cmai-scope
    // and cmai-vs-bsai so those more specific intents get first refusal; this
    // is the catch-all for a bare mention with no scope/comparison angle. Also
    // what the widget's opening suggestion chip links to.
    id: 'cmai-info',
    any: [
      /\bcmai\b[^.?!]{0,20}\b(kya hai|kya h|hai kya|info|information|details|matlab|kya cheez)\b/,
      /\b(what is|tell me about|about)\b[^.?!]{0,10}\bcmai\b/,
      /^\s*cmai\s*\??\s*$/,
      /\bcmai\b[^.?!]{0,15}\b(ke bare|kay bare|k baray|k bare)\b/,
    ],
    answer: `**BS Computational Mathematics & Artificial Intelligence (CMAI)** LGU ke Department of Mathematics ka HEC-recognized degree hai — 4 saal, 8 semesters, 135 credit hours.

Isme pehle math ki neev lagti hai (Linear Algebra, Calculus, Statistics) aur phir usi math ko AI/ML courses mein apply karte hain — Machine Learning, Deep Learning, Optimization. Iska matlab hai ke students sirf AI tools chalana nahi seekhte, balke samajhte hain ke algorithms kaise aur kyu kaam karte hain.

Eligibility: Intermediate (ya equivalent) 50% ke saath — ICS, pre-engineering ya math background wale students ke liye best fit.

Apply: ${FACTS.applyUrl}
Fee structure: ${FACTS.feeUrl}`,
    answerEn: `**BS Computational Mathematics & Artificial Intelligence (CMAI)** is an HEC-recognized degree from LGU's Department of Mathematics — 4 years, 8 semesters, 135 credit hours.

Students first build a math foundation (Linear Algebra, Calculus, Statistics) and then apply it in AI/ML courses — Machine Learning, Deep Learning, Optimization. This means students don't just learn to use AI tools; they understand how and why the algorithms work.

Eligibility: Intermediate (or equivalent) with 50% — best fit for ICS, pre-engineering, or math-background students.

Apply: ${FACTS.applyUrl}
Fee structure: ${FACTS.feeUrl}`,
    sources: [
      'https://lgu.edu.pk/bs-mathematics-in-computational-mathematics-and-artificial-intelligence/',
      'https://lgu.edu.pk/mathematics-programs/',
    ],
    skipRetrieval: true,
  },
  {
    // "BS info" / "MS info" / "PhD info" — a level-scoped catalog. Distinct
    // from programs-list (generic "what do you offer") and from STREAMS
    // (advising by intermediate background): this answers "what does LGU
    // have at the BS/MS/PhD level" directly, so it's served instantly rather
    // than routed through retrieval.
    id: 'degree-level-info',
    any: [
      /\bbs\b[^.?!]{0,20}\b(info|information|programs?|degrees?|details|options?|offer(ed)?|list)\b/,
      /\b(undergrad(uate)?|bachelors?)\b[^.?!]{0,20}\b(info|information|programs?|degrees?|details|options?|offer(ed)?)\b/,
      /\bms\b[^.?!]{0,20}\b(info|information|programs?|degrees?|details|options?|offer(ed)?|list)\b/,
      /\b(m\.?phil|mphil|postgraduate|masters?)\b[^.?!]{0,20}\b(info|information|programs?|degrees?|details|options?|offer(ed)?)\b/,
      /\b(ph\.?d|doctorate|doctoral)\b[^.?!]{0,20}\b(info|information|programs?|degrees?|details|options?|offer(ed)?|list)?\b/,
      /^\s*(bs|ms|ph\.?d|mphil|m\.?phil)\s*(info|information)?\s*[?.!]*\s*$/,
    ],
    answerFn: (q, lang) => buildLevelInfoAnswer(q, lang) ?? (lang === 'en'
      ? `Which level — BS, MS/M.Phil, or PhD? I'll list the programs LGU offers there.`
      : `Kaunsa level — BS, MS/M.Phil, ya PhD? Main wahan LGU ke programs bata deta hoon.`),
    sources: [FACTS.admissionsUrl],
    skipRetrieval: true,
  },
  {
    // Generic "what do you offer" with no field/interest named — the case
    // where there's no personalization signal to weigh CMAI against, so
    // leading with it is a display choice, not advice overriding a better fit.
    // If the student names a field or gives marks, PROGRAM_PATTERN/FIELD_PATTERN
    // or the eligibility-advising intent take over instead of this one.
    id: 'programs-list',
    any: [
      /what (programs?|degrees?|courses?) (do you|does lgu) offer/,
      /which (programs?|degrees?|courses?) (are|is) available/,
      /(konse?|kaunse?|kon se|kaun se) programs?/,
      /list of programs/,
      /programs? (offered|available)/,
    ],
    unless: (q) => mentionsProgram(q) || FIELD_PATTERN.test(q),
    answer: `LGU kai faculties mein BS, MS/M.Phil aur PhD offer karta hai. Popular programs:

- BSCS / BSSE / BSIT / BS Data Science / BS AI / CMAI
- BBA / MBA / BS Accounting & Finance
- BS Psychology / BS English / BS Criminology

Poori list yahan: ${FACTS.admissionsUrl}`,
    answerEn: `LGU offers BS, MS/M.Phil, and PhD programs across several faculties. Popular programs:

- BSCS / BSSE / BSIT / BS Data Science / BS AI / CMAI
- BBA / MBA / BS Accounting & Finance
- BS Psychology / BS English / BS Criminology

Full list here: ${FACTS.admissionsUrl}`,
    sources: [FACTS.admissionsUrl],
  },
  {
    id: 'creator',
    any: [
      /who (made|make|makes|built|build|builds|created|create|creates|developed|develop|develops|designed|design|designs) (you|this|this bot|this chatbot)/,
      /who is your (creator|developer|maker)/,
      /(tumhe|tumhein|aapko|apko) kis ne (banaya|develop kiya)/,
      /ye bot kis ne banaya/,
    ],
    answer: `Mujhe Zaryab Malik ne banaya hai — woh khud LGU mein BS Computational Mathematics & AI (CMAI) ke 2nd semester ke student hain.

Instagram: https://www.instagram.com/capt_zaryab_malik

Admission se related sawal ke liye: ${FACTS.admissionOffice} / ${FACTS.admissionMobile}`,
    answerEn: `I was built by Zaryab Malik — he's a 2nd semester BS Computational Mathematics & AI (CMAI) student at LGU.

Instagram: https://www.instagram.com/capt_zaryab_malik

For admission-related queries: ${FACTS.admissionOffice} / ${FACTS.admissionMobile}`,
    sources: [],
    skipRetrieval: true,
  },
  {
    id: 'owner',
    any: [
      /who owns (you|this|this bot|this chatbot)/,
      /who runs (you|this|this bot|this chatbot)/,
      /are you (official|affiliated)/,
      /(ye bot|ye chatbot) kis ka hai/,
    ],
    answer: `Main Lahore Garrison University (LGU) ke admissions ka official assistant hoon. Mujhe Zaryab Malik ne LGU ke liye develop kiya hai.`,
    answerEn: `I'm the official LGU (Lahore Garrison University) admissions assistant. I was developed for LGU by Zaryab Malik.`,
    sources: [],
    skipRetrieval: true,
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
 * @param {string} query the current user message
 * @param {Array<{role:string, content:string}>} [history] prior turns, so an
 *   answer can use context from earlier in the open conversation
 * @returns {{id, answer, sources, lang}|null} a canned answer in the language
 *   the student wrote in, or null to fall through to the retrieval + LLM tier.
 */
// Words the FAQ regexes actually key off. A typo in one of these ("entery",
// "shcolarship") can make an otherwise well-formed question miss every
// intent and fall through to the LLM tier — costing an API call for a
// question the FAQ tier already has a canned answer for.
const DOMAIN_KEYWORDS = [
  'entry', 'test', 'tests', 'admission', 'apply', 'application',
  'fee', 'fees', 'scholarship', 'scholarships', 'criteria', 'eligibility',
  'merit', 'deadline', 'document', 'documents', 'structure', 'schedule',
  'semester', 'credit', 'campus', 'hostel', 'transport', 'program', 'degree',
  'roadmap', 'course', 'courses', 'apply', 'psychology', 'criminology',
  'mathematics', 'engineering', 'computer', 'science',
];

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...new Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}

/**
 * Nudges misspelled domain words toward their correct form so the regex
 * intents below still fire. Deliberately conservative: only touches words
 * that AREN'T already a known keyword and are within a small edit distance
 * of exactly one — a 4-letter word 2 edits from "fee" is more likely a
 * different word entirely than a typo of "fee".
 */
function correctTypos(text) {
  return text
    .split(/(\s+)/)
    .map((tok) => {
      const clean = tok.replace(/[^a-z]/gi, '').toLowerCase();
      if (clean.length < 4 || DOMAIN_KEYWORDS.includes(clean)) return tok;
      const threshold = clean.length <= 5 ? 1 : 2;
      let best = null;
      let bestDist = Infinity;
      for (const kw of DOMAIN_KEYWORDS) {
        if (Math.abs(kw.length - clean.length) > threshold) continue;
        const d = levenshtein(clean, kw);
        if (d < bestDist) {
          bestDist = d;
          best = kw;
        }
      }
      return best && bestDist <= threshold ? tok.replace(clean, best) : tok;
    })
    .join('');
}

const KNOWN_WORDS = new Set([
  // English common
  'a','an','the','i','is','it','in','on','to','of','or','my','me','do','no','hi','ok','at','so',
  'if','we','be','he','us','up','as','by','go','am','has','are','was','and','but','for','not',
  'you','how','can','all','get','got','its','our','out','had','who','new','now','may','any','say',
  'old','her','him','his','she','too','two','one','use','way','set','end','own','off','try','let',
  'big','day','see','yet','ask','did','sir','yes','what','whats','when','with','this','that','from',
  'have','will','your','more','each','they','been','like','long','make','many','some','than','them',
  'then','time','very','just','know','take','come','over','also','back','much','most','only','into',
  'here','last','made','done','must','give','need','want','help','tell','show','good','work','look',
  'year','find','does','best','keep','same','offer','about','which','after','first','where','check',
  'detail','info','list','total','per','near','open','close','start','hows','there','these','those',
  'would','could','should','please','thanks','thank','really','still','right','left',
  // Roman Urdu
  'kya','hai','hain','mein','kar','kaise','kitni','kitna','ye','wo','nahi','aur','mera','meri',
  'apna','kab','kahan','bhi','koi','sab','se','ke','ko','ka','ki','par','ho','hoga','hogi','dein',
  'aap','tum','yeh','kuch','abhi','acha','theek','wala','wali','bata','batao','bolo','chahiye',
  'milta','milti','hota','hoti','sakta','sakti','dedo','dikhao','pata','naya','purana','konsa',
  'konsi','kaisa','jaisa','lena','dena','raha','rahi','jata','jati','ata','ati','lagta','lagti',
  'seat','roadmap',
  // Programs & academics
  'lgu','bs','ms','cs','it','ai','ds','se','phd','mphil','msc','mscs','msai','msds','bscs','bsse',
  'bsit','bsai','bsds','cmai','bba','mba','adp','dpt','llb','acf',
  'fee','apply','admission','program','degree','test','mark','scholarship','merit','criteria',
  'campus','hostel','hec','nceac','transport','bus','document','deadline','schedule','semester',
  'credit','hour','cgpa','gpa','percentage','aggregate','result','pass','fail',
  // Departments & subjects
  'science','engineering','computer','software','data','psychology','criminology','english','urdu',
  'chemistry','physics','nursing','pharmd','math','maths','biology','biotech','biotechnology',
  'genetics','microbiology','nutrition','dietetics','pharmacy','pharmacology','accounting','finance','management','marketing',
  'business','commerce','economics','law','cyber','security','forensic','digital','clinical',
  'applied','literature','electronics','electrical',
  // Common question words
  'date','when','next','entry','structure','available','offered','required','submit','eligible',
  'minimum','maximum','contact','number','phone','email','address','location','form','online',
  'download','prospectus','brochure','intake','fall','spring','morning','evening','weekend',
  'duration','year','month','class','course','subject','elective','internship','project','thesis',
  'research','faculty','teacher','professor','department','office','library','lab',
]);

function looksLikeGibberish(text) {
  const clean = text.replace(/[^a-zA-Z؀-ۿ\s]/g, '').trim();
  if (!clean || clean.length < 2) return true;
  if (/[؀-ۿ]/.test(clean)) return false;
  const words = clean.toLowerCase().split(/\s+/);
  const realCount = words.filter((w) => {
    if (KNOWN_WORDS.has(w)) return true;
    if (w.endsWith('s') && KNOWN_WORDS.has(w.slice(0, -1))) return true;
    if (w.endsWith('ing') && KNOWN_WORDS.has(w.slice(0, -3))) return true;
    return false;
  }).length;
  return words.length <= 3 && realCount === 0;
}

export function matchFaq(query, history = []) {
  const q = query.toLowerCase().trim();
  const lang = detectLanguage(query);

  if (looksLikeGibberish(q)) {
    return {
      id: 'gibberish',
      answer: `Yeh samajh nahi aaya. Apna sawal dubara likhein — jaise "BSCS ki fee?" ya "How to apply?"`,
      lang,
      sources: [],
      skipRetrieval: true,
    };
  }

  // A bare marks/stream follow-up ("mere 85% hain", "ics") inherits whatever
  // the conversation was actually about — it doesn't repeat "scholarship",
  // so without this it falls through with no scholarship-specific match at
  // all. Seen in testing: that fell to the LLM tier ungrounded, which quoted
  // one specific program's page (a marks-based tuition-exemption table that
  // exists only on the BS Economics roadmap) as if it were LGU's general
  // scholarship policy. Checked before the main loop so it wins over
  // eligibility-advising, which would otherwise answer with a program list
  // instead of addressing the scholarship the student actually asked about.
  const isMarksOrStreamOnly =
    !SCHOLARSHIP_PATTERN.test(q) && !mentionsProgram(q) && (parseMarks(q) != null || STREAMS.some((s) => s.re.test(q)));
  if (isMarksOrStreamOnly) {
    const priorUserText = history
      .filter((h) => h.role === 'user')
      .slice(-1)
      .map((h) => h.content)
      .join(' ');
    if (SCHOLARSHIP_PATTERN.test(priorUserText)) {
      const scholarshipIntent = INTENTS.find((i) => i.id === 'scholarship');
      const answer = scholarshipIntent.answerFn(query, lang, history);
      return { id: scholarshipIntent.id, answer, lang, sources: scholarshipIntent.sources, skipRetrieval: true };
    }
  }

  // Only computed once and only used as a fallback match — the exact query
  // is always tried first, so a typo-corrected false positive can only ever
  // rescue a question that would otherwise have missed every intent, never
  // override a match the exact text already found.
  const qFixed = correctTypos(q);
  const fixed = qFixed !== q;

  for (const intent of INTENTS) {
    const anyHit = intent.any.some((re) => re.test(q) || (fixed && re.test(qFixed)));
    if (!anyHit) continue;
    if (intent.all && !intent.all.every((re) => re.test(q) || (fixed && re.test(qFixed)))) continue;
    if (intent.unless?.(q)) continue;

    // Urdu script gets the Roman Urdu text rather than an English answer —
    // same language, just a different script, so it's much the closer match.
    const answer = intent.answerFn
      ? intent.answerFn(query, lang, history)
      : lang === 'en'
        ? (intent.answerEn ?? intent.answer)
        : intent.answer;

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
