/**
 * PomiCat: Tier 3: Canonical Equivalence Class & Global Cross-Turn Sweeper
 * 
 * Neutralizes "Echo & Derivation Leakage":
 * When an AI assistant echoes user data, formats it with abbreviations (e.g. "Rp28,5 jt"),
 * calculates annualized earnings ("Rp342 juta/tahun"), computes remainders ("Rp14,3 juta"),
 * or ratios ("49,8%"), this engine builds canonical equivalence clusters and scrubs
 * the entire conversation history (User and Assistant turns) using consistent pseudonyms.
 */

/**
 * PomiCat: Adversary-Oracle Reconstruction Solver
 * 
 * Replaces naive hardcoded blocklists with a dynamic mathematical solver.
 * Probes whether any visible numbers in LLM responses can invert/reconstruct
 * the original secret parameter (e.g. 10.8M / 12 / 0.30 = 3M).
 * If reconstructable, suppresses the minimal hitting set using whole-token spans.
 */
// Function words and programming type names that are never part of a person's name.
const COMMON_WORDS = new Set(("the a an and or but if of to in on at by for with from as is are was were be been being " +
  "that this these those it its he she they them his her their we our you your i me my one ones would could should " +
  "will can may might must shall do does did done have has had not no yes so than then there here what which who whom " +
  "whose when where why how all any some each every both more most other such only own same too very just also now " +
  "about into over after before under again further once out up down off above below between through during without " +
  "yang dan di ke dari ini itu untuk dengan pada adalah akan juga tidak atau saya aku kamu anda dia mereka kami kita " +
  "string str int integer long double float boolean bool char byte object any list map array dict set tuple void null " +
  "none true false item items name names value values key data type id").split(/\s+/));

// Lowercase name particles allowed after the first token ("Vincent van Gogh", "Mohammed bin Salman")
const NAME_PARTICLES = new Set("van von de der den du del della da di la le bin binti al el".split(" "));

// A learned "name" must be letters only, contain no common words, and (for loose forms such as
// "I'm X") start each token with a capital letter.
function looksLikeName(tokens, { requireCapital = false } = {}) {
  return tokens.length > 0 && tokens.every((t, i) =>
    (i > 0 && NAME_PARTICLES.has(t)) ||
    (/^\p{L}[\p{L}'-]*$/u.test(t) && t.length >= 2 && !COMMON_WORDS.has(t.toLowerCase()) &&
      (!requireCapital || /^\p{Lu}/u.test(t))));
}

// Stated ages, shared by the defence (below) and the attack (policy.js inferBirthYears):
//   age:   "I am 28 years old", "I'm 28.", "you are 28 in 2026", "umur saya 28 tahun"
//   atAge: "in 2020 at 22", "tahun 2020 di usia 22"
const AGE_PATTERNS = {
  age: /\b(?:i'?m|i am|you'?re|you are|aged?|at the age of|umur(?:\s+saya)?|usia(?:\s+saya)?|berumur|berusia)\s+(\d{1,2})(?=\s*(?:years?(?:\s+old)?|yrs?|y\/o|yo|tahun|th)\b|\s*[,.!?]|\s+(?:in|on|this|now|sekarang)\b|\s*$)/i,
  atAge: /\b(?:in|tahun)\s+((?:19|20)\d{2})\s*,?\s+(?:at|when i was|pada usia|di usia|umur)\s+(?:age\s+)?(\d{1,2})\b/i
};

// Clues that pin down a hidden date, shared by the defence (below) and the attack
// (policy.js inferDates): "[REDACTED_DATE] is a Tuesday, the day after my birthday on the 14th"
// leaves only a couple of possible dates in a year.
// ponytail: clues are searched within DATE_CLUE_WINDOW characters of the hidden date, not by
// sentence structure; a clue about another date in that window is hidden too (safe side).
const DATE_CLUE_WINDOW = 120;
const HIDDEN_DATE = /\[(?:REDACTED_)?(?:DOB|DATE)(?:_\d+)?\]|<DATE_TIME>/g;
const WEEKDAY_NUM = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6,
  minggu: 0, senin: 1, selasa: 2, rabu: 3, kamis: 4, jumat: 5, "jum'at": 5, sabtu: 6 };
const MONTH_NUM = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, mei: 4, jun: 5, jul: 6, aug: 7, agu: 7, sep: 8, oct: 9, okt: 9, nov: 10, dec: 11, des: 11 };
const MONTH_WORD = "(?:jan(?:uary|uari)?|feb(?:ruary|ruari)?|mar(?:ch|et)?|apr(?:il)?|may|mei|jun(?:e|i)?|jul(?:y|i)?|aug(?:ust)?|agu(?:stus)?|sep(?:tember)?|oct(?:ober)?|okt(?:ober)?|nov(?:ember)?|dec(?:ember)?|des(?:ember)?)";
const NUM_WORD = { a: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, ten: 10, se: 1 };

/** Weekdays, day offsets and visible day numbers in a piece of text: [{ kind, index, length, ... }] */
function dateClues(text) {
  const clues = [];
  const add = (re, fn) => { for (const m of text.matchAll(re)) clues.push({ index: m.index, length: m[0].length, ...fn(m) }); };
  add(/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|senin|selasa|rabu|kamis|jum'?at|sabtu|(?<=hari\s)minggu)\b/gi,
    (m) => ({ kind: "weekday", dow: WEEKDAY_NUM[m[1].toLowerCase().replace("jum'at", "jumat")] }));
  add(/\b(?:(?:the\s+)?(a|one|two|three|four|five|six|seven|ten|\d{1,2})?\s*(day|week)s?\s+(after|before|later|earlier)|(se|\d{1,2})\s*(hari|minggu)\s+(setelah|sesudah|sebelum|kemudian)|(besoknya|keesokan\s+harinya))\b/gi,
    (m) => {
      if (m[7]) return { kind: "offset", days: 1 };
      const n = m[1] || m[4] ? (NUM_WORD[(m[1] || m[4]).toLowerCase()] || +(m[1] || m[4])) : 1;
      const unit = /week|minggu/i.test(m[2] || m[5]) ? 7 : 1;
      const before = /before|earlier|sebelum/i.test(m[3] || m[6]);
      return { kind: "offset", days: (before ? -1 : 1) * n * unit };
    });
  add(new RegExp(`\\b(?:the\\s+(\\d{1,2})(?:st|nd|rd|th)\\b|tanggal\\s+(\\d{1,2})\\b|(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MONTH_WORD})\\b|(${MONTH_WORD})\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b)(?!\\s*,?\\s*(?:19|20)\\d{2})`, "gi"),
    (m) => {
      const day = +(m[1] || m[2] || m[3] || m[6]);
      const mon = m[4] || m[5];
      return { kind: "anchor", day, month: mon ? MONTH_NUM[mon.toLowerCase().slice(0, 3)] : null };
    });
  return clues.filter((c) => c.kind !== "anchor" || (c.day >= 1 && c.day <= 31));
}

/** Clues (found by cluesIn) within DATE_CLUE_WINDOW characters of each hidden placeholder. */
function cluesNear(text, hidden, cluesIn) {
  const out = [];
  for (const m of text.matchAll(hidden)) {
    const from = Math.max(0, m.index - DATE_CLUE_WINDOW);
    const near = cluesIn(text.slice(from, m.index + m[0].length + DATE_CLUE_WINDOW))
      .map((c) => ({ ...c, index: c.index + from }))
      .filter((c) => c.index + c.length <= m.index || c.index >= m.index + m[0].length);
    out.push({ placeholder: m[0], index: m.index, clues: near });
  }
  return out;
}
const hiddenDateClues = (text) => cluesNear(text, HIDDEN_DATE, dateClues);

// A hidden address comes back from landmarks and distances next to it ("5 minutes from Masjid
// Raya", "behind the Indomaret on Jl. Merdeka"). There is no attack in invert() for these (it
// would need a map); the defence hides them. Each phrase runs to the next comma/full stop.
const HIDDEN_PLACE = /\[(?:REDACTED_)?(?:ADDRESS|LOCATION|PLACE)(?:_\d+)?\]/g;
function placeClues(text) {
  const re = /\b(?:\d+\s*(?:min(?:ute)?s?|menit|km|kilomet(?:er|re)s?|meters?|blocks?)\s+(?:walk(?:ing)?\s+|drive\s+|jalan\s+kaki\s+)?(?:away\s+)?(?:from|to|dari|ke)|next\s+to|near|across\s+from|opposite|behind|in\s+front\s+of|around\s+the\s+corner\s+from|dekat|di\s+samping|di\s+sebelah|di\s+belakang|di\s+depan|seberang)\s+[^,.;!?\n]{2,60}/gi;
  return [...text.matchAll(re)].map((m) => ({ kind: "landmark", index: m.index, length: m[0].length }));
}
const hiddenPlaceClues = (text) => cluesNear(text, HIDDEN_PLACE, placeClues);

// 1 -> A, 26 -> Z, 27 -> AA (spreadsheet style), so name labels never run into symbols
function letterLabel(n) {
  let s = "";
  for (; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

// Shared by equivalence classes and solver tokens; never join separate amounts/ranges.
function isEmbeddedFinancialSpan(text, start, end) {
  const before = text.slice(0, start);
  const after = text.slice(end);
  return /[\p{L}\p{N}_./]$|[\p{L}\p{N}_./]-$/u.test(before) ||
    /^[\p{L}\p{N}_]|^-[\p{L}\p{N}_]|^[.,]\d/u.test(after) ||
    (/^\/[\p{L}\p{N}_]/u.test(after) && !/^\/(?:month|mo|year|yr|bulan|tahun|day|hari|week|minggu|hour|jam)\b/i.test(after));
}

function parseFinancialAmount(raw) {
  if (typeof raw !== "string" || !raw.trim()) return 0;
  const clean = raw.trim().toLowerCase();
  const spoken = /^(.*?)\s+(juta|miliar|ribu)(?:\s+rupiah)?$/.exec(clean);
  if (spoken && !/\d/.test(spoken[1])) {
    const digits = {nol:0,satu:1,dua:2,tiga:3,empat:4,lima:5,enam:6,tujuh:7,delapan:8,sembilan:9,sepuluh:10,sebelas:11};
    const words = spoken[1].split(/\s+/);
    let total = 0;
    if (words[0] === 'seratus') { total = 100; words.shift(); }
    else if (words[1] === 'ratus' && digits[words[0]] >= 2) total = digits[words.splice(0, 2)[0]] * 100;
    let current = 0;
    if (words.length === 1 && Object.hasOwn(digits, words[0])) current = digits[words[0]];
    else if (words.length === 2 && words[1] === 'belas' && digits[words[0]] >= 2 && digits[words[0]] <= 9) current = 10 + digits[words[0]];
    else if (words.length >= 2 && words.length <= 3 && words[1] === 'puluh' && digits[words[0]] >= 2 && digits[words[0]] <= 9 && (words.length === 2 || (digits[words[2]] >= 1 && digits[words[2]] <= 9))) current = digits[words[0]] * 10 + (digits[words[2]] || 0);
    else if (words.length) return 0;
    // ponytail: bounded integer ID amounts; fractions/multiple scale groups need a grammar parser.
    return (total + current) * ({ribu:1e3,juta:1e6,miliar:1e9}[spoken[2]]);
  }
  if (clean.includes("half a mil") && !/\d/.test(clean)) return 500000;
  // English number words before a currency word: "fifteen thousand dollars" = 15000
  const english = /^((?:[a-z]+[\s-]+)+?)(?:dollars?|bucks|euros?|pounds?|rupees?|rupiah|ringgit|yen)$/.exec(clean);
  if (english && !/\d/.test(clean)) {
    const units = {one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,eleven:11,twelve:12,thirteen:13,fourteen:14,
      fifteen:15,sixteen:16,seventeen:17,eighteen:18,nineteen:19,twenty:20,thirty:30,forty:40,fifty:50,sixty:60,seventy:70,eighty:80,ninety:90};
    let total = 0, current = 0, seen = false;
    for (const w of english[1].trim().split(/[\s-]+/)) {
      if (w === "and") continue;
      if (w === "a") { current += 1; continue; }
      if (Object.hasOwn(units, w)) { current += units[w]; seen = true; }
      else if (w === "hundred") { current = (current || 1) * 100; seen = true; }
      else if (w === "thousand" || w === "million" || w === "billion") { total += (current || 1) * {thousand:1e3,million:1e6,billion:1e9}[w]; current = 0; seen = true; }
      else return 0;
    }
    return seen ? total + current : 0;
  }
  const match = /\d(?:[\d.,'’ \u00a0\u202f]*\d)?/.exec(clean);
  if (!match) return 0;
  const before = clean.slice(0, match.index);
  const after = clean.slice(match.index + match[0].length);
  if (/\d/.test(before + after)) return 0;
  const number = match[0].replace(/[\u00a0\u202f]/g, " ").replace(/’/g, "'");
  let integer = number;
  let fraction = "";
  // Indian grouping (lakh/crore): ₹18,00,000, Rs 1,50,00,000. Only after an Indian currency
  // marker; a bare 1,23,456 stays ambiguous.
  const lakh = /^\d{1,2}(?:,\d{2})+,\d{3}$/.test(number) && /(?:₹|\binr|\brs\.?)\s*$/.test(before);
  // ponytail: locale-free 1,234 / 1.234 mean thousands (also with units); 0.123 is
  // fractional. Add an explicit locale option if three-decimal amounts need disambiguation.
  if (/[.,]/.test(number) && !lakh && !/^[1-9]\d{0,2}([.,])\d{3}(?:\1\d{3})*$/.test(number)) {
    const i = Math.max(number.lastIndexOf("."), number.lastIndexOf(","));
    integer = number.slice(0, i);
    fraction = number.slice(i + 1);
    if (integer.includes(number[i]) || !/^\d+$/.test(fraction)) return 0;
  }
  if (!lakh && !/^\d+$/.test(integer) && !/^[1-9]\d{0,2}([.,' ])\d{3}(?:\1\d{3})*$/.test(integer)) return 0;
  const unit = /^\s*(miliar|milyar|billions?|ember|crores?|juta|jt|jeti|jetong|millions?|lakhs?|lpa|rb|ribu|thousands?|grand|racks|bands|[bmk])(?![a-z])/i.exec(after);
  const u = unit ? unit[1] : "";
  const scale = /^(?:miliar|milyar|billion|ember|b$)/.test(u) ? 1e9 :
    /^crore/.test(u) ? 1e7 : /^(?:juta|jt|jeti|jetong|million|m$)/.test(u) ? 1e6 :
    /^(?:lakh|lpa)/.test(u) ? 1e5 : u ? 1e3 : 1;
  const negative = /[-−]\s*(?:(?:rp\.?|idr|\$|usd|€|eur|£|gbp|chf|sgd)\s*)?$/.test(before) ||
    (before.lastIndexOf("(") > before.lastIndexOf(")") && after.includes(")"));
  const value = Number(integer.replace(/[.,' ]/g, "") + (fraction ? "." + fraction : "")) * scale;
  return Number.isFinite(value) ? (negative ? -value : value) : 0;
}

class AdversaryOracleSolver {
  constructor(tolerance = 0.015) {
    this.tolerance = tolerance;
    // Periodic accumulation constants: months in 1 to 10 years, weeks, quarters
    this.PERIODIC_CONSTANTS = [1, 2, 3, 4, 5, 6, 10, 12, 24, 36, 48, 52, 60, 120, 100];
    this.publicAnchorsRx = /\b(?:rata-rata|median|benchmark|standar|survei|indeks|umr|laporan publik|indeed|glassdoor|levels\.fyi)\b/i;
    this.hasExplicitPersonRx = /\b(?:saya|ku|kami|Anda|kamu|mu|gw|gue|aku|my|your)\b/i;
  }

  findCodeBlockSpans(text) {
    const spans = [];
    const rx = /```[a-zA-Z0-9_-]*[\s\S]*?```/g;
    let m;
    while ((m = rx.exec(text)) !== null) {
      spans.push([m.index, m.index + m[0].length]);
    }
    return spans;
  }

  isSafePublicSpan(text, start, end) {
    const lineStart = Math.max(0, text.lastIndexOf("\n", start));
    const nextNewline = text.indexOf("\n", end);
    const lineEnd = nextNewline === -1 ? text.length : nextNewline;
    const line = text.substring(lineStart, lineEnd);
    return this.publicAnchorsRx.test(line) && !this.hasExplicitPersonRx.test(line);
  }

  lexNumericSpans(text) {
    // Identify telephone spans to avoid lexing phone digits (like 1-800-869-3557) as financial amounts
    const phoneSpans = [];
    const phoneRx = /(?:\+?1[-.\s]?)?\(?[2-9]\d{2}\)?[-.\s]\d{3}[-.\s]\d{4}\b/g;
    let pm;
    while ((pm = phoneRx.exec(text)) !== null) {
      phoneSpans.push([pm.index, pm.index + pm[0].length]);
    }

    // Identify address spans to avoid lexing house numbers (e.g. 742 Evergreen Terrace) or postal codes as financial amounts
    const addressSpans = [];
    const addrRx = /\b(?:(?:(?:residential|shipping|mailing|home|street|billing)\s+)?address\s*[:=\-]?\s*(?:to\s+my\s+residential\s+address\s*:\s*)?|(?:(?:shipping|deliver(?:y|ing)?|ship|send|sent)\s+to\s+))?((?:(?:Flat|Unit|Apt|Apartment|Suite)\s+\d+[a-zA-Z]?,?\s*(?:[0-9]{1,5}\s+)?|[0-9]{1,5}\s+)[A-Za-z0-9\s.,\/-]+?\b(?:Street|St|Avenue|Ave|Boulevard|Blvd|Road|Rd|Drive|Dr|Lane|Ln|Way|Court|Ct|Terrace|Ter|Place|Pl|Circle|Cir|Parkway|Pkwy)\b(?:[A-Za-z0-9\s.,\/-]*?(?:[A-Z]{2}\s+\d{5}(?:-\d{4})?|[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}))?)/gi;
    let am;
    while ((am = addrRx.exec(text)) !== null) {
      addressSpans.push([am.index, am.index + am[0].length]);
    }
    const idAddrRx = /\b(?:alamat(?:\s+(?:ktp|domisili|saya|tinggal|rumah))?(?:\s+di|\s+adalah|\s*:)?\s*)([A-Za-z0-9\s.,\/-]+?)(?=\s*(?:nomor\s+telfon|nomor\s+hp|no\s+hp|no\s+telp|telfon|telepon|phone|email|nik|nim|npwp|paspor|passport|sim|bpjs|gaji|[\r\n]|$))/gi;
    let iam;
    while ((iam = idAddrRx.exec(text)) !== null) {
      if (/\b(?:jalan|jl\.?|gang|gg\.?|kampung|kp\.?|komplek|perumahan|dusun|desa|kelurahan|kecamatan|rt\s*\d+|rw\s*\d+|no(?:mor)?\s*\d+|blok\s*[a-z0-9]+)\b/i.test(iam[0])) {
        addressSpans.push([iam.index, iam.index + iam[0].length]);
      }
    }

    // Regex matching whole numerical tokens with currency, units, decimals, and %
    const rx = /(?:(?:\(\s*(?:(?:Rp\.?|IDR|(?:S|A|C|NZ|HK|US)?\$|USD|€|EUR|£|GBP|CHF|SGD|₹|INR|Rs\.?)\s*)?\d+(?:[.,]\d+|[ '\u00a0\u202f’]\d{3}(?!\d))*(?:\s*(?:juta|jt|jeti|jetong|miliar|milyar|millions?|billions?|crores?|lakhs?|lpa|k|rb|ribu|thousands?|racks|bands|ember|[mb])(?!\w))?\s*\))|(?:(?:Rp\.?|IDR|(?:S|A|C|NZ|HK|US)?\$|USD|€|EUR|£|GBP|CHF|SGD|₹|INR|Rs\.?)\s*)?\d+(?:[.,]\d+|[ '\u00a0\u202f’]\d{3}(?!\d))*(?:\s*(?:juta|jt|jeti|jetong|miliar|milyar|millions?|billions?|crores?|lakhs?|lpa|k|rb|ribu|thousands?|racks|bands|ember|%(?!\w)|[mb](?!\w)|\s+[mb]\b))?|half\s+a\s+mil\b)/gi;
    const nonFinUnits = /^\s*(?:(?:additional|more|extra|fewer|less)\s+)?(?:months?|years?|days?|hours?|weeks?|quarters?|percentage\s+points?|basis\s+points?|bps|points?|pts?|shares?|tokens?|users?|employees?|engineers?|customers?|plates?|guests?|items?|copies|cells|copies\s*\/\s*m[lL]|cells\s*\/\s*u[lL]|gwei|wei|eth|btc|sol|mmol\s*\/\s*l|mg\s*\/\s*dl|u\s*\/\s*l|gas|saham|lembar)\b/i;
    const tokens = [];
    let m;
    while ((m = rx.exec(text)) !== null) {
      const raw = m[0].trim();
      if (!raw) continue;
      if (/^(?:401|403|457)$/.test(raw) && /^\([a-z]\)/i.test(text.slice(m.index + m[0].length))) continue;

      // Skip if inside a telephone number or physical address
      if (phoneSpans.some(([s, e]) => m.index >= s && (m.index + m[0].length) <= e)) {
        continue;
      }
      if (addressSpans.some(([s, e]) => m.index >= s && (m.index + m[0].length) <= e)) {
        continue;
      }

      // Ensure we don't start in the middle of a word or tag or dot or port (e.g. 10.244.0.15, :5432)
      if (m.index > 0 && /[\w.:]/.test(text[m.index - 1])) {
        continue;
      }

      if (isEmbeddedFinancialSpan(text, m.index, m.index + m[0].length)) continue;
      const afterText = text.substring(m.index + m[0].length);
      // Skip if followed by dot and digits (IP address check) or URL path (:5432/db), but allow financial time periods (/month, /year, /bulan)
      if (/^\.\d+/.test(afterText) || (/^\/[a-zA-Z0-9_]/.test(afterText) && !/^\/(?:month|mo|year|yr|bulan|thn|tahun|day|hari|hr|hour|jam|week|minggu)\b/i.test(afterText))) {
        continue;
      }

      // Skip if followed by non-financial technical/lab units
      if (nonFinUnits.test(afterText)) {
        continue;
      }

      // Skip if inside technical container / OS user / network port configs
      const lineStart = Math.max(0, text.lastIndexOf("\n", m.index));
      const beforeInLine = text.substring(lineStart, m.index);
      if (/\b(?:runAsUser|runAsGroup|fsGroup|port|listen_port|containerPort|uid|gid)\s*[:=]\s*$/i.test(beforeInLine)) {
        continue;
      }

      // Skip calendar years (1950-2040) unless explicitly preceded by currency symbols
      if (/^\d{4}$/.test(raw)) {
        const yNum = parseInt(raw, 10);
        if (yNum >= 1950 && yNum <= 2040 && !/(?:Rp|IDR|\$|USD|€|EUR|£|GBP|CHF|SGD|₹|INR|Rs\.?)/i.test(raw)) {
          const beforeSnippet = text.substring(Math.max(0, m.index - 40), m.index).toLowerCase();
          const afterSnippet = text.substring(m.index + m[0].length, Math.min(text.length, m.index + m[0].length + 20)).toLowerCase();
          const isExplicitFinancial = /(?:rent|salary|gaji|income|pay|bonus|debt|owe|making|earning|take-home|spending|spent|balance|cost|fee|bill|charge|saving|tabungan)\s+(?:is\s+|of\s+)?$/i.test(beforeSnippet) || /^\s*(?:\/month|\/mo|\/year|\/bulan|per\s+month|per\s+year)/i.test(afterSnippet);
          if (!isExplicitFinancial) {
            continue; // Treat as calendar year, not financial leak
          }
        }
      }

      const cleanLower = raw.toLowerCase();
      const isRatio = cleanLower.endsWith("%");

      // Solver compares magnitudes, including accounting negatives; parser retains signs.
      const val = Math.abs(parseFinancialAmount(raw)) / (isRatio ? 100 : 1);

      if (val > 0) {
        tokens.push({
          raw: m[0],
          start: m.index,
          end: m.index + m[0].length,
          val: val,
          isRatio: isRatio,
          isSmallInt: !isRatio && val <= 100 && !/(?:Rp|IDR|\$|USD|€|EUR|£|GBP|CHF|SGD|₹|INR|Rs\.?)/i.test(raw)
        });
      }
    }
    return tokens;
  }

  solveAndRedact(text, secretValues, disabledLeaks = [], labelLeak = null) {
    if (!secretValues || secretValues.length === 0) return text;
    const tokens = this.lexNumericSpans(text);
    const ratios = tokens.filter(t => t.isRatio && t.val > 0).map(t => t.val);
    const codeBlocks = this.findCodeBlockSpans(text);
    const leaks = [];

    // 1. Extend secret values with pairwise arithmetic combinations (sums, differences, remainders)
    const extendedSecrets = new Set(secretValues);
    for (let i = 0; i < secretValues.length; i++) {
      for (let j = i + 1; j < secretValues.length; j++) {
        const sA = secretValues[i];
        const sB = secretValues[j];
        if (sA + sB >= 100) extendedSecrets.add(sA + sB);
        if (Math.abs(sA - sB) >= 100) extendedSecrets.add(Math.abs(sA - sB));
      }
    }

    // 2. Depth 2 differences & multi-item deductions (e.g. 6200 - 2400 - 580 = 3220)
    const cur = Array.from(extendedSecrets);
    for (let i = 0; i < cur.length; i++) {
      for (let j = i + 1; j < cur.length; j++) {
        const diff = Math.abs(cur[i] - cur[j]);
        if (diff >= 100 && extendedSecrets.size < 500) {
          extendedSecrets.add(diff);
        }
      }
    }

    // 3. Monthly debt amortization targets
    for (const s of secretValues) {
      if (s >= 5000) {
        for (const r of [0.05, 0.08, 0.10, 0.15, 0.20, 0.249, 0.25, 0.30]) {
          const rm = r / 12;
          const pmt = Math.round(s * (rm / (1 - Math.pow(1 + rm, -12))));
          if (pmt > 100) extendedSecrets.add(pmt);
        }
      }
    }

    // 4. Debt monthly remainder cashflows: e.g. 3220 - 1710 = 1510
    const cur2 = Array.from(extendedSecrets);
    for (let i = 0; i < cur2.length; i++) {
      for (let j = i + 1; j < cur2.length; j++) {
        const diff = Math.abs(cur2[i] - cur2[j]);
        if (diff >= 100 && extendedSecrets.size < 1000) {
          extendedSecrets.add(diff);
        }
      }
    }

    const secretsToTest = Array.from(extendedSecrets);

    for (const secret of secretsToTest) {
      if (secret < 100) continue;

      for (const token of tokens) {
        if (token.isRatio || token.isSmallInt || (token.val < 100 && !/(?:Rp|IDR|\$|USD|€|EUR|£|GBP|CHF|SGD|₹|INR|Rs\.?)/i.test(token.raw))) continue;
        if (codeBlocks.some(([s, e]) => token.start >= s && token.start < e)) continue;
        // A public-looking label cannot override a direct relation to a known secret.
        const directRelation = secretValues.some(value => Math.abs(token.val - value) / value <= this.tolerance ||
          ratios.filter(r => r > 0 && r < 1).some(r =>
            [token.val / r, token.val / (1 - r)].some(v => Math.abs(v - value) / value <= this.tolerance)));
        if (!directRelation && this.isSafePublicSpan(text, token.start, token.end)) continue;
        if (disabledLeaks.some(dl => String(dl).trim().toLowerCase() === token.raw.trim().toLowerCase() ||
          this.lexNumericSpans(String(dl)).some(t => !t.isRatio && Math.abs(token.val - t.val) <= 0.01))) continue;

        let isLeak = false;

        // 1. Direct equality with secret
        if (Math.abs(token.val - secret) / secret <= this.tolerance) {
          isLeak = true;
        }

        // 2. Periodic multiplier/divisor (months, years, weeks)
        if (!isLeak) {
          for (const c of this.PERIODIC_CONSTANTS) {
            if (Math.abs(token.val * c - secret) / secret <= this.tolerance || Math.abs(token.val / c - secret) / secret <= this.tolerance) {
              isLeak = true;
              break;
            }
          }
        }

        // 3. Ratio inversion and Periodic Accumulation
        if (!isLeak) {
          const allRatios = [...ratios, ...ratios.map(x => 1 - x).filter(x => x > 0 && x < 1)];
          for (const r of allRatios) {
            if (Math.abs(token.val / r - secret) / secret <= this.tolerance || Math.abs(token.val * r - secret) / secret <= this.tolerance) {
              isLeak = true;
              break;
            }
            for (const c of this.PERIODIC_CONSTANTS) {
              const c1 = (token.val / c) / r;
              if (Math.abs(c1 - secret) / secret <= this.tolerance) {
                isLeak = true;
                break;
              }
              const c2 = (token.val * c) / r;
              if (Math.abs(c2 - secret) / secret <= this.tolerance) {
                isLeak = true;
                break;
              }
            }
            if (isLeak) break;
          }
        }

        // 4. Percentage raise / projection inversions
        if (!isLeak) {
          for (const p of [0.05, 0.10, 0.12, 0.15, 0.20, 0.25, 0.30, 0.40, 0.50]) {
            if (Math.abs(token.val / (1 + p) - secret) / secret <= this.tolerance || Math.abs(token.val / p - secret) / secret <= this.tolerance) {
              isLeak = true;
              break;
            }
          }
        }

        // 5. Midpoint percentage raise inversions (e.g. 15-20% midpoint on 28.5M = 33M)
        if (!isLeak) {
          const midpoints = [0.125, 0.175, 0.15, 0.225, 0.25];
          for (const mp of midpoints) {
            if (Math.abs(token.val / (1 + mp) - secret) / secret <= 0.03) {
              isLeak = true;
              break;
            }
          }
        }

        // 6. Pairwise Additive / System of Equations Inversion (e.g. (A + B)/2 = secret or A - B = secret)
        if (!isLeak && tokens.length >= 2) {
          for (const other of tokens) {
            if (other === token) continue;
            if (this.isSafePublicSpan(text, other.start, other.end)) continue;
            const sum = token.val + other.val;
            const diff = Math.abs(token.val - other.val);
            if (
              Math.abs(sum / 2 - secret) / secret <= this.tolerance ||
              Math.abs(diff / 2 - secret) / secret <= this.tolerance ||
              Math.abs(sum - secret) / secret <= this.tolerance ||
              Math.abs(diff - secret) / secret <= this.tolerance
            ) {
              isLeak = true;
              break;
            }
          }
        }

        if (isLeak) {
          const lineStart = Math.max(0, text.lastIndexOf("\n", token.start));
          const nextNl = text.indexOf("\n", token.end);
          const lineEnd = nextNl === -1 ? text.length : nextNl;
          const line = text.substring(lineStart, lineEnd).toLowerCase();

          // Context window before token (up to 35 chars) accurately captures descriptors without bleeding into adjacent clauses
          const localBefore = text.substring(Math.max(0, token.start - 35), token.start).toLowerCase();

          let tag = "[REDACTED_BUDGET_ALLOCATION]";
          // 1. Direct equality with user base secrets takes precedence over derived labels!
          if (secretValues.some(sv => Math.abs(token.val - sv) / sv <= this.tolerance)) {
            tag = "[REDACTED_FINANCIAL_1]";
          } else if (/\b(?:year|years|tahun|timeline|akumulasi)\b/i.test(localBefore)) {
            tag = "[REDACTED_SAVINGS_ACCUMULATION]";
          } else if (/\b(?:kenaikan|increment|delta|tambahan|raise)\b/i.test(localBefore)) {
            tag = "[REDACTED_SALARY_INCREMENT]";
          } else if (/\b(?:naik|proyeksi|projected|menjadi|target)\b/i.test(localBefore)) {
            tag = "[REDACTED_PROJECTED_SALARY]";
          } else if (/\b(?:sisa|remainder|remaining|cicilan|cashflow|kpr|payoff|discretionary|available)\b/i.test(localBefore)) {
            tag = "[REDACTED_REMAINDER_CASHFLOW]";
          } else if (/\b(?:pro-forma|runway|pre-money|burn|budget|anggaran|alokasi|car|cars|food|transport|saving|savings|tabungan|rent|groceries|spend|spending)\b/i.test(localBefore)) {
            tag = "[REDACTED_BUDGET_ALLOCATION]";
          } else if (/\b(?:year|years|tahun|timeline|akumulasi)\b/i.test(line)) {
            tag = "[REDACTED_SAVINGS_ACCUMULATION]";
          } else if (/\b(?:sisa|remainder|remaining|cicilan|cashflow|kpr|debt|payoff|discretionary|available)\b/i.test(line)) {
            tag = "[REDACTED_REMAINDER_CASHFLOW]";
          } else if (/\b(?:pro-forma|runway|pre-money|burn|budget|anggaran|alokasi|car|cars|food|transport|saving|savings|tabungan|rent|groceries)\b/i.test(line)) {
            tag = "[REDACTED_BUDGET_ALLOCATION]";
          }

          leaks.push({
            start: token.start,
            end: token.end,
            raw: token.raw,
            val: token.val,
            replacement: labelLeak ? labelLeak(token.raw, tag) : tag
          });
        }
      }
    }

    // Sort leaks in reverse position order and deduplicate
    leaks.sort((a, b) => b.start - a.start);
    const seen = new Set();
    const dedupedLeaks = [];
    let out = text;
    for (const l of leaks) {
      const key = `${l.start}:${l.end}`;
      if (!seen.has(key)) {
        seen.add(key);
        dedupedLeaks.push(l);
        out = out.substring(0, l.start) + l.replacement + out.substring(l.end);
      }
    }

    this.lastLeaks = dedupedLeaks;
    return out;
  }
}

class ConsistentPseudonymizer {
  constructor() {
    this.entityMap = new Map();
    this.counters = {
      USER: 1,
      CORP: 1,
      FINANCIAL: 1,
      HEALTH: 1,
      HR: 1,
      PROJECT: 1
    };
  }

  reset() {
    this.entityMap.clear();
    for (let k in this.counters) {
      this.counters[k] = 1;
    }
  }

  setEntityMap(map) {
    this.entityMap = new Map(map || []);
  }

  /** Parse one formatted amount into base units, retaining fractions and accounting signs. */
  parseFinancialValue(raw) {
    return parseFinancialAmount(raw);
  }

  /**
   * Generates or retrieves an existing consistent pseudonym for an entity.
   */
  getPseudonym(rawEntity, category) {
    const key = `${category}::${rawEntity.trim().toLowerCase()}`;
    if (this.entityMap.has(key)) {
      return this.entityMap.get(key);
    }

    let pseudonym;
    switch (category) {
      case "SENSITIVE_FINANCIAL":
        pseudonym = `[REDACTED_FINANCIAL_${this.counters.FINANCIAL++}]`;
        break;
      case "SENSITIVE_HEALTH":
        pseudonym = `[CONFIDENTIAL_HEALTH_RECORD_${this.counters.HEALTH++}]`;
        break;
      case "SENSITIVE_CORP":
        pseudonym = `[INTERNAL_CORP_ASSET_${this.counters.CORP++}]`;
        break;
      case "SENSITIVE_LEGAL_HR":
        pseudonym = `[HR_DISCIPLINARY_RECORD_${this.counters.HR++}]`;
        break;
      case "SENSITIVE_USER":
      case "USER": {
        // "Rina" after "Rina Kusuma" (or the reverse) is the same person: reuse the label
        const words = rawEntity.trim().toLowerCase().split(/\s+/);
        for (const [k, v] of this.entityMap) {
          const m = /^(?:SENSITIVE_)?USER::(.+)$/.exec(k);
          if (!m) continue;
          const other = m[1].split(/\s+/);
          const shorter = words.length <= other.length ? words : other;
          const longer = shorter === words ? other : words;
          if (shorter.every((w) => longer.includes(w))) {
            this.entityMap.set(key, v);
            return v;
          }
        }
        pseudonym = `[User_${letterLabel(this.counters.USER++)}]`;
        break;
      }
      default:
        // Other categories (e.g. LOCATION from an external detector) get their own numbered label
        this.counters[category] = this.counters[category] || 1;
        pseudonym = `[${category}_${this.counters[category]++}]`;
    }

    this.entityMap.set(key, pseudonym);
    return pseudonym;
  }

  /**
   * Builds an Equivalence Class of regex patterns for an entity, capturing all
   * abbreviations, reformattings, and arithmetic derivations made by LLMs.
   */
  buildEquivalenceVariants(raw, category, allEntities = []) {
    const variants = [];
    const escapedRaw = raw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Whole-token match: a short value like "pa" must not be replaced inside "spatial".
    // Attached currency prefixes are allowed, opaque tokens containing the same digits are not.
    variants.push(category === "SENSITIVE_FINANCIAL"
      ? `(?:(?<![\\w.,])|(?<=\\bRp)|(?<=\\bIDR)|(?<=\\bUSD))${escapedRaw}(?![\\w]|[.,]\\d)`
      : `(?<!\\w)${escapedRaw}(?!\\w)`);

    if (category === "SENSITIVE_FINANCIAL") {
      // Card number formats with spaces, hyphens, or no separators
      const cardDigits = raw.replace(/\D/g, "");
      if (cardDigits.length >= 15 && cardDigits.length <= 19) {
        variants.push(`\\b${cardDigits}\\b`);
        variants.push(`\\b${cardDigits.replace(/(\d{4})/g, "$1 ").trim()}\\b`);
        variants.push(`\\b${cardDigits.replace(/(\d{4})/g, "$1-").slice(0, -1)}\\b`);
      }

      // Bank account / loan prefix code variants (e.g. WF-990218374, SOFI-99821174)
      const pfxMatch = raw.match(/^([A-Za-z]{2,6})[-_ ]?(\d{6,14})$/);
      if (pfxMatch) {
        const pfx = pfxMatch[1];
        const numPart = pfxMatch[2];
        variants.push(`\\b${pfx}[-_ ]?${numPart}\\b`);
        variants.push(`\\b${numPart}\\b`);
      }

      // Card expiration date variants (e.g. "exp 08/27" -> also match raw "08/27")
      const expDateMatch = raw.match(/\b((?:0[1-9]|1[0-2])[\/-](?:20)?\d{2})\b/);
      if (expDateMatch) {
        variants.push(`\\b${expDateMatch[1]}\\b`);
      }

      // Card last 4 digits variants (e.g. "ends in 4417" -> also match "ending in 4417", "ends in 4417")
      const last4Match = raw.match(/\b(?:(?:card|debit|credit|account)\s+)?(?:ends|ending)\s+in\s+([0-9]{4})\b/i);
      if (last4Match) {
        variants.push(`\\bending\\s+in\\s+${last4Match[1]}\\b`);
        variants.push(`\\bends\\s+in\\s+${last4Match[1]}\\b`);
      }

      const num = this.parseFinancialValue(raw);
      if (num && !isNaN(num) && num >= 1000) {
        const idFormatted = num.toLocaleString("id-ID").replace(/\./g, "\\.");
        const enFormatted = num.toLocaleString("en-US").replace(/\./g, "\\.");

        // 1. Currency prefix + formatted number or plain number
        variants.push(`(?<![\\w.,$€£¥])(?:Rp\\s*|IDR\\s*|\\$\\s*|USD\\s*)?${idFormatted}(?![\\w.,])`);
        variants.push(`(?<![\\w.,$€£¥])(?:Rp\\s*|IDR\\s*|\\$\\s*|USD\\s*)?${enFormatted}(?![\\w.,])`);
        variants.push(`(?<![\\w.,])${String(num).replace(/\./g, "\\.")}(?![\\w.,])`);

        // 1b. Thousands abbreviations (e.g. 145k, 340k, 18k, 25k, $340K)
        if (num >= 1e3 && num < 1e9) {
          const thousands = num / 1e3;
          if (thousands === Math.floor(thousands) || thousands.toFixed(1).endsWith(".5")) {
            const kth = thousands.toString().replace(".", "\\.");
            variants.push(`(?<![\\w.,$€£¥])(?:(?:Rp\\.?|IDR|\\$|USD|€|EUR|£|GBP|CHF|SGD)\\s*)?${kth}\\s*(?:k|rb|ribu|thousand)(?![\\w.,])`);
          }
        }

        // 2. Millions abbreviations (e.g. 28,5 juta, 28.5 jt, 28,5 jt, $1.5M, $18M)
        if (num >= 1e5) {
          const millions = num / 1e6;
          const milDot = millions.toString().replace(".", "\\.");
          const milComma = millions.toString().replace(".", ",");
          variants.push(`(?<![\\w.,$€£¥])(?:(?:Rp\\.?|IDR|\\$|USD|€|EUR|£|GBP|CHF|SGD)\\s*)?(?:${milDot}|${milComma})\\s*(?:juta|jt|jeti|million|m)(?![\\w.,])`);
          
          if (millions === Math.floor(millions)) {
            variants.push(`(?<![\\w.,$€£¥])(?:(?:Rp\\.?|IDR|\\$|USD|€|EUR|£|GBP|CHF|SGD)\\s*)?${Math.floor(millions)}\\s*(?:juta|jt|jeti|million|m)(?![\\w.,])`);
          }

          // 3. Annualized derivations ONLY if raw explicitly indicated monthly frequency
          const isMonthlyEntity = /(?:month|mo|bulan|per\s+month|\/mo|\/month|\/bulan|sebulan|monthly)/i.test(raw);
          if (isMonthlyEntity) {
            const annual = num * 12;
            const annualM = annual / 1e6;
            const annDot = annualM.toString().replace(".", "\\.");
            const annComma = annualM.toString().replace(".", ",");
            variants.push(`(?<![\\w.,$€£¥])(?:Rp\\s*|IDR\\s*|\\$\\s*|USD\\s*)?(?:${annDot}|${annComma})\\s*(?:juta|jt|million|m)(?:\\s*\\/\\s*tahun|\\s*per\\s*tahun)?(?![\\w.,])`);
            variants.push(`(?<![\\w.,$€£¥])(?:Rp\\s*|IDR\\s*|\\$\\s*|USD\\s*)?${annual.toLocaleString("id-ID").replace(/\./g, "\\.")}(?![\\w.,])`);
          }
        }
      }
    } else if (category === "SENSITIVE_HEALTH") {
      const drugEquivalents = {
        "lexapro": ["escitalopram", "cipralex"],
        "escitalopram": ["lexapro", "cipralex"],
        "cipralex": ["escitalopram", "lexapro"],
        "zoloft": ["sertraline"],
        "sertraline": ["zoloft"],
        "wellbutrin": ["bupropion", "zyban"],
        "bupropion": ["wellbutrin", "zyban"],
        "prozac": ["fluoxetine"],
        "fluoxetine": ["prozac"],
        "xanax": ["alprazolam"],
        "alprazolam": ["xanax"],
        "valium": ["diazepam"],
        "diazepam": ["valium"],
        "clonazepam": ["klonopin", "rivotril"],
        "klonopin": ["clonazepam", "rivotril"],
        "rivotril": ["clonazepam", "klonopin"],
        "risperidone": ["risperdal"],
        "risperdal": ["risperidone"],
        "lithium": ["lithium carbonate", "eskalith", "priadel"],
        "clozapine": ["clozaril"],
        "clozaril": ["clozapine"],
        "adderall": ["amphetamine", "dextroamphetamine"],
        "ritalin": ["methylphenidate", "concerta"],
        "concerta": ["methylphenidate", "ritalin"],
        "methylphenidate": ["ritalin", "concerta"],
        "cymbalta": ["duloxetine"],
        "duloxetine": ["cymbalta"],
        "glucophage": ["metformin"],
        "metformin": ["glucophage"],
        "lipitor": ["atorvastatin"],
        "atorvastatin": ["lipitor"]
      };

      const words = raw.toLowerCase().split(/\s+/);
      const synonyms = new Set();
      for (let w of words) {
        if (drugEquivalents[w]) {
          drugEquivalents[w].forEach(syn => synonyms.add(syn));
        }
      }

      // Add base drug brand/name variants without dosage (e.g. "150mg Wellbutrin XL" -> "Wellbutrin XL", "Wellbutrin")
      const strippedDose = raw.replace(/\b\d+\s*(?:mg|iu|mcg|ml)\b/gi, "").trim();
      if (strippedDose.length >= 3) {
        variants.push(`\\b(?:obat\\s+)?${strippedDose.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:\\s+\\d+\\s*(?:mg|iu|mcg|ml))?\\b`);
        // If it's a multi-token brand with formulation suffix (XL, XR, SR, CR, IR), also match root brand
        if (/(?:XL|XR|SR|CR|IR)\b/i.test(strippedDose)) {
          const firstToken = strippedDose.split(/\s+/)[0];
          if (firstToken.length >= 4 && !/^(?:tablet|capsule|liquid|oral|daily|twice)$/i.test(firstToken)) {
            variants.push(`\\b(?:obat\\s+)?${firstToken.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:\\s+(?:XL|XR|SR|CR|IR))?(?:\\s+\\d+\\s*(?:mg|iu|mcg|ml))?\\b`);
          }
        }
      }

      // Add all recognized generic/brand synonyms
      for (let syn of synonyms) {
        const escapedSyn = syn.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        variants.push(`\\b(?:obat\\s+)?${escapedSyn}(?:\\s+\\d+\\s*mg)?\\b`);
      }
    } else if (category === "SENSITIVE_CORP") {
      const match = raw.match(/Project\s+([A-Z][a-z0-9]+)/i);
      if (match) {
        variants.push(`\\bProject\\s+${match[1]}\\b`);
      }
    } else if (category === "USER" || category === "SENSITIVE_USER") {
      // Build full name, handles, and individual name words
      const cleanRaw = raw.replace(/^@/, "").trim();
      variants.push(`@?${cleanRaw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);

      const words = cleanRaw.split(/\s+/);
      // 1. Full name
      variants.push(`\\b${words.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+')}\\b`);
      
      // 2. Multi-word sub-combinations (e.g. "Budianto Kusuma", "Kusuma Alama")
      for (let i = 0; i < words.length; i++) {
        for (let j = i + 2; j <= words.length; j++) {
          if (j - i < words.length) {
            variants.push(`\\b${words.slice(i, j).map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+')}\\b`);
          }
        }
      }

      // 3. Individual name tokens (>= 3 chars, never a common word: one bad name must not
      //    turn every "that" in the chat into a placeholder)
      for (let w of words) {
        if (w.length >= 3 && !COMMON_WORDS.has(w.toLowerCase())) {
          variants.push(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
        }
      }
    }

    return variants;
  }

  /**
   * Sweeps and neutralizes entities and their equivalence classes across ALL turns (User & Assistant).
   * @param {Array<{role: string, content: string}>} turns
   * @param {Array<{turnIndex: number, raw: string, category: string}>} detectedEntities
   * @param {Array<{type: string, raw: string, replacement: string}>} heuristicDetections
   */
  anonymizeConversation(turns, detectedEntities, heuristicDetections = [], options = {}) {
    if (options.masterEntityMap) {
      this.entityMap = new Map(options.masterEntityMap);
    }
    const updatedTurns = JSON.parse(JSON.stringify(turns));

    // Extract user name if introduced in user prompt, respecting stop-words and clause boundaries
    const userIntroMatches = [];
    const nameStopWords = new Set([
      "alamat", "tinggal", "umur", "usia", "nomor", "no", "telfon", "telepon", "hp", "wa",
      "email", "bekerja", "dan", "dari", "lahir", "nik", "nim", "kpr", "gaji", "di", "jalan", "jl",
      "address", "phone", "living", "working", "born", "age", "years", "my", "saya", "staf",
      "seorang", "karyawan", "pekerja", "adalah", "applying", "looking", "seeking", "interested",
      "planning", "trying", "wondering", "hoping", "writing", "asking", "building", "using", "here",
      "not", "currently", "just", "also", "now", "reaching", "facing", "dealing", "having",
      "struggling", "earning", "making", "paying", "saving", "investing", "borrowing", "holding",
      "reporting", "filing", "a", "an", "the", "in", "on", "to", "for", "with", "at", "by", "from",
      "debt", "loan", "consolidation"
    ]);

    turns.forEach((turn, idx) => {
      if (turn.role === "user" && !options.keepNames) {
        const nameIntroRx = /(?:(?:(?:\b(?:nama\s+(?:lengkap\s+)?(?:saya|gw|gue|ku)|namaku|perkenalkan\s+(?:nama\s+saya|saya|namaku)?|panggil\s+(?:saja\s+)?(?:saya|aku)|my\s+(?:full\s+)?name\s+is|i\s*[\x27\x60]?\s*(?:am|m)|call\s+me|halo\s+saya|dear|by|directed\s+by|requested\s+by)\s+)|(?:\b(?:nama\s+lengkap|full\s+name|name|nama|user|patient|applicant|customer|client|employee|author|account\s+holder|billing\s+address)\s*[:=\-]\s*)))([^,.\n!?]+)/giu;
        let nm;
        while ((nm = nameIntroRx.exec(turn.content)) !== null) {
          const rawPhrase = nm[1].trim();
          const words = rawPhrase.split(/\s+/);
          const nameTokens = [];
          for (const w of words) {
            const clean = w.toLowerCase().replace(/[^a-z]/g, "");
            // A name ends at the first stop word or common word: "Rina Kusuma and I live" -> "Rina Kusuma"
            if (nameStopWords.has(clean) || COMMON_WORDS.has(clean)) break;
            nameTokens.push(w);
            if (nameTokens.length >= 4) break; // Max 4 words for a realistic name
          }
          if (nameTokens.length > 0 && !nameStopWords.has(nameTokens[0].toLowerCase())) {
            const isLooseForm = /^(?:i\s*[\x27\x60]?\s*(?:am|m)|call\s+me)/i.test(nm[0]);
            const lineStart = turn.content.lastIndexOf("\n", nm.index) + 1;
            const lineEnd = turn.content.indexOf("\n", nm.index);
            const line = turn.content.slice(lineStart, lineEnd === -1 ? undefined : lineEnd);
            if (!looksLikeName(nameTokens, { requireCapital: isLooseForm })) {
              // skip: code, prose fragments ("one that would carry") or type names
            } else if (/[:=\-]\s*$/.test(nm[0]) && /[{}()\[\];<>"'`]|\b(?:val|var|let|const|def|fn|func|public|private)\b/.test(line)) {
              // skip: "name: String" style key-value inside code
            } else {
              userIntroMatches.push({
                turnIndex: idx,
                raw: nameTokens.join(" "),
                category: "USER"
              });
            }
          }
        }

        // Formal titles / Salutations: e.g. "Dr. Jonathan Vance", "Mr. David Miller", "Mrs. Sara Schwarz"
        const titleRx = /\b(?:Dr\.|Prof\.|Mr\.|Mrs\.|Ms\.)\s+([\p{Lu}][\p{Ll}]+(?:\s+[\p{Lu}][\p{Ll}]+){1,3})\b/gu;
        let tr;
        while ((tr = titleRx.exec(turn.content)) !== null) {
          const tName = tr[1].trim();
          const tWords = tName.split(/\s+/);
          if (tWords.length >= 2 && looksLikeName(tWords, { requireCapital: true })) {
            userIntroMatches.push({
              turnIndex: idx,
              raw: tName,
              category: "USER"
            });
          }
        }

        // Markdown table row extraction (e.g. | Employee | ... \n | Alexander Pierce | ...)
        const tableLines = turn.content.split("\n");
        let employeeColIdx = -1;
        for (let lIdx = 0; lIdx < tableLines.length; lIdx++) {
          const line = tableLines[lIdx].trim();
          if (line.startsWith("|") && line.endsWith("|")) {
            const cells = line.split("|").slice(1, -1).map(c => c.trim());
            if (employeeColIdx === -1) {
              const foundIdx = cells.findIndex(c => /^(?:Employee|Name|User|Karyawan|Nama|Person)$/i.test(c));
              if (foundIdx !== -1) employeeColIdx = foundIdx;
            } else if (!line.includes("---") && cells[employeeColIdx]) {
              const cellVal = cells[employeeColIdx].trim();
              if (cellVal && cellVal.split(/\s+/).length <= 4 && looksLikeName(cellVal.split(/\s+/))) {
                userIntroMatches.push({
                  turnIndex: idx,
                  raw: cellVal,
                  category: "USER"
                });
              }
            }
          }
        }

        // Legal & HR report party: e.g. "harassment from Vice President Robert Vance at Vance Refrigeration"
        const legalPartyRx = /(?:from|against)\s+(?:(?:Vice\s+President|President|Director|Manager|Lead)\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\s+at\s+([A-Z][a-zA-Z0-9_-]+(?:\s+[A-Z][a-zA-Z0-9_-]+)*)/g;
        let lp;
        while ((lp = legalPartyRx.exec(turn.content)) !== null) {
          userIntroMatches.push({
            turnIndex: idx,
            raw: lp[1].trim(),
            category: "USER"
          });
          userIntroMatches.push({
            turnIndex: idx,
            raw: lp[2].trim(),
            category: "CORP"
          });
        }

        // Email sign-off / closing signature detection:
        // e.g. "Best regards,\nDr. Jonathan Vance\nHead of Research"
        const signOffRx = /(?:(?:Best\s+regards|Warm\s+regards|Kind\s+regards|Sincerely|Regards|Thanks\s+(?:and\s+regards)?|Warmly|Cheers|Respectfully|Yours\s+truly|Salam),?\s*[\r\n]+)(?:(?:Dr\.|Prof\.|Mr\.|Mrs\.|Ms\.)[ \t]+)?([\p{L}][\p{L}'-]*(?:[ \t]+[\p{L}][\p{L}'-]*){0,3})/giu;
        let so;
        while ((so = signOffRx.exec(turn.content)) !== null) {
          const sigName = so[1].trim();
          if (sigName && !nameStopWords.has(sigName.toLowerCase()) && sigName.split(/\s+/).length <= 4) {
            userIntroMatches.push({
              turnIndex: idx,
              raw: sigName,
              category: "USER"
            });
          }
        }
      }
    });

    const allTargets = [...detectedEntities, ...userIntroMatches];

    // Compute arithmetic derivations between financial pairs (e.g. Remainder and Ratios)
    const financialNums = allTargets
      .filter(e => e.category === "SENSITIVE_FINANCIAL")
      .map(e => ({ raw: e.raw, val: this.parseFinancialValue(e.raw) }))
      .filter(e => !isNaN(e.val) && e.val >= 1000);

    const derivedPatterns = [];
    const uniqueFinancialVals = Array.from(new Set(financialNums.map(e => e.val))).sort((a, b) => b - a);

    if (uniqueFinancialVals.length >= 2) {
      const valA = uniqueFinancialVals[0]; // Primary/highest financial value e.g. 28.5M
      const valB = uniqueFinancialVals[1]; // Secondary financial value e.g. 14.2M
      const diff = valA - valB;

      if (diff >= 100000) {
        const diffM = diff / 1e6;
        const diffDot = diffM.toFixed(1).replace(".", "\\.");
        const diffComma = diffM.toFixed(1).replace(".", ",");
        derivedPatterns.push({
          pattern: `(?<![\\d.,])(?:(?:Rp\\s*|IDR\\s*|\\$\\s*|USD\\s*)?(?:${diffDot}|${diffComma})\\s*(?:juta|jt|million|m))\\b`,
          replacement: "[REDACTED_REMAINDER_CASHFLOW]"
        });
        derivedPatterns.push({
          pattern: `(?<![\\d.,])(?:(?:Rp\\s*|IDR\\s*|\\$\\s*|USD\\s*)?${diff.toLocaleString("id-ID").replace(/\./g, "\\.")})\\b`,
          replacement: "[REDACTED_REMAINDER_CASHFLOW]"
        });
      }

      // Debt ratio e.g. 14.2 / 28.5 = 49.8%
      if (valA > 0) {
        const ratioNum = (valB / valA) * 100;
        if (ratioNum >= 15 && ratioNum <= 95) {
          const ratio = ratioNum.toFixed(1);
          const ratioDot = ratio.replace(".", "\\.");
          const ratioComma = ratio.replace(".", ",");
          derivedPatterns.push({
            pattern: `\\b(?:${ratioDot}|${ratioComma})\\s*%(?!\\w)`,
            replacement: "[REDACTED_DEBT_RATIO]"
          });
        }
      }
    }

    // Neutralize Percentage Projection Clusters & Compound Residuals
    const percentages = [5, 10, 12, 15, 20, 25, 30, 35, 40, 50];
    const fullConvText = updatedTurns.map(t => t.content || "").join(" ").toLowerCase();
    const hasSalaryContext = /\b(?:salary|gaji|upah|penghasilan|pay|compensation|thp)\b/i.test(fullConvText);
    const projectionTag = hasSalaryContext ? "[REDACTED_PROJECTED_SALARY]" : "[REDACTED_BUDGET_ALLOCATION]";

    for (const val of uniqueFinancialVals) {
      for (const p of percentages) {
        const total = Math.round(val * (1 + p / 100));
        const delta = Math.round(val * (p / 100));
        const roundedTotal = Math.round(total / 1e6) * 1e6; // e.g. 32.775.000 -> 33.000.000!

        const allCandidateTotals = [];
        if (total >= 1000 && total !== val) allCandidateTotals.push(total);
        if (roundedTotal >= 100000 && roundedTotal !== total && roundedTotal !== val) allCandidateTotals.push(roundedTotal);

        for (const candTotal of allCandidateTotals) {
          // 1. Full formatted total
          derivedPatterns.push({
            pattern: `(?<![\\d.,])(?:(?:Rp\\s*|IDR\\s*|\\$\\s*|USD\\s*)?${candTotal.toLocaleString("id-ID").replace(/\./g, "\\.")})\\b`,
            replacement: projectionTag
          });
          derivedPatterns.push({
            pattern: `(?<![\\d.,])(?:(?:Rp\\s*|IDR\\s*|\\$\\s*|USD\\s*)?${candTotal.toLocaleString("en-US").replace(/,/g, ",")})\\b`,
            replacement: projectionTag
          });

          // 2. Abbreviated millions total (e.g. 33 juta, 33 jt)
          const candM = candTotal / 1e6;
          const totDot = candM.toString().replace(".", "\\.");
          const totComma = candM.toString().replace(".", ",");
          derivedPatterns.push({
            pattern: `(?<![\\d.,])(?:(?:Rp\\s*|IDR\\s*|\\$\\s*|USD\\s*)?(?:${totDot}|${totComma})\\s*(?:juta|jt|million|m))\\b`,
            replacement: projectionTag
          });
        }

        // 3. Full formatted delta increment
        if (delta >= 1000) {
          derivedPatterns.push({
            pattern: `(?<![\\d.,])(?:(?:Rp\\s*|IDR\\s*|\\$\\s*|USD\\s*)?${delta.toLocaleString("id-ID").replace(/\./g, "\\.")})\\b`,
            replacement: "[REDACTED_SALARY_INCREMENT]"
          });
          derivedPatterns.push({
            pattern: `(?<![\\d.,])(?:(?:Rp\\s*|IDR\\s*|\\$\\s*|USD\\s*)?${delta.toLocaleString("en-US").replace(/,/g, ",")})\\b`,
            replacement: "[REDACTED_SALARY_INCREMENT]"
          });

          // 4. Abbreviated millions delta
          const deltaM = delta / 1e6;
          const delDot = deltaM.toString().replace(".", "\\.");
          const delComma = deltaM.toString().replace(".", ",");
          derivedPatterns.push({
            pattern: `(?<![\\d.,])(?:(?:Rp\\s*|IDR\\s*|\\$\\s*|USD\\s*)?(?:${delDot}|${delComma})\\s*(?:juta|jt|million|m)(?:\\s*(?:per bulan|\\/bulan))?)\\b`,
            replacement: "[REDACTED_SALARY_INCREMENT]"
          });
        }

        // 5. Compound Residual Formula: (Gaji * (1 + p)) - Hutang
        if (uniqueFinancialVals.length >= 2) {
          const debtVal = uniqueFinancialVals.find(v => v < val);
          if (debtVal) {
            const remainder = total - debtVal;
            if (remainder >= 1000) {
              const remM = remainder / 1e6;
              const remDot = remM.toString().replace(".", "\\.");
              const remComma = remM.toString().replace(".", ",");
              derivedPatterns.push({
                pattern: `(?<![\\d.,])(?:(?:Rp\\s*|IDR\\s*|\\$\\s*|USD\\s*)?${remainder.toLocaleString("id-ID").replace(/\./g, "\\.")})\\b`,
                replacement: "[REDACTED_PROJECTED_CASHFLOW]"
              });
              derivedPatterns.push({
                pattern: `(?<![\\d.,])(?:(?:Rp\\s*|IDR\\s*|\\$\\s*|USD\\s*)?(?:${remDot}|${remComma})\\s*(?:juta|jt|million|m))\\b`,
                replacement: "[REDACTED_PROJECTED_CASHFLOW]"
              });
            }
          }
        }
      }

      // Range Midpoint Projections (e.g. 15-20% midpoint on 28.5M = 33.487.500 -> 33.000.000)
      const rangePairs = [[10, 15], [15, 20], [10, 20], [20, 25], [20, 30]];
      for (const [p1, p2] of rangePairs) {
        const midRate = (p1 + p2) / 200;
        const midTotal = Math.round(val * (1 + midRate));
        const midRounded = Math.round(midTotal / 1e6) * 1e6;
        for (const midVal of [midTotal, midRounded]) {
          if (midVal >= 1000 && midVal !== val) {
            derivedPatterns.push({
              pattern: `(?<![\\d.,])(?:(?:Rp\\s*|IDR\\s*|\\$\\s*|USD\\s*)?${midVal.toLocaleString("id-ID").replace(/\./g, "\\.")})\\b`,
              replacement: projectionTag
            });
            const mM = midVal / 1e6;
            derivedPatterns.push({
              pattern: `(?<![\\d.,])(?:(?:Rp\\s*|IDR\\s*|\\$\\s*|USD\\s*)?(?:${mM.toString().replace(".", "\\.")}|${mM.toString().replace(".", ",")})\\s*(?:juta|jt|million|m))\\b`,
              replacement: projectionTag
            });
          }
        }
      }
    }

    // 1. Build replacement clusters for all target entities (Highest Priority)
    const baseRules = [];
    for (const ent of allTargets) {
      const pseudo = this.getPseudonym(ent.raw, ent.category);
      const variants = this.buildEquivalenceVariants(ent.raw, ent.category, allTargets);

      for (const v of variants) {
        baseRules.push({
          regexStr: v,
          replacement: pseudo,
          length: v.length,
          isDerived: false,
          isFinancial: ent.category === "SENSITIVE_FINANCIAL"
        });
      }
    }
    baseRules.sort((a, b) => b.length - a.length);

    // 2. Add cross-turn sweep rules from Tier 1 Heuristic Detections
    const heuristicRules = [];
    for (const hd of heuristicDetections) {
      if (hd && hd.raw) {
        const ruleStart = heuristicRules.length;
        if (hd.category === "CREDENTIALS") {
          const values = [];
          const token = hd.secretToken || hd.raw;
          const uri = /:\/\/[^\s]*?:([^@\s]+)@/.exec(token);
          if (uri) {
            values.push(uri[1]);
            try { values.push(decodeURIComponent(uri[1])); } catch (_) {}
          }
          if (hd.type === "CLI_BASIC_AUTH") values.push(token.slice(token.indexOf(":") + 1));
          // A connection string's token is already just its password ("p%40ss" may be echoed decoded)
          if (hd.type === "DATABASE_URI" && !uri) {
            values.push(token);
            try { values.push(decodeURIComponent(token)); } catch (_) {}
          }
          if (/PASSWORD|SECRET|CREDENTIAL/.test(hd.type) && token.length >= 8) values.push(token.replace(/[.,;]+$/, ""));
          for (const value of new Set(values.filter(v => v.length >= 8))) {
            heuristicRules.push({regexStr: `(?<![\\p{L}\\p{N}_])${value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\p{N}_])`, replacement: "[REDACTED_SECRET]", length: value.length, isDerived: false});
          }
        }
        const hEsc = hd.raw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        heuristicRules.push({
          regexStr: `\\b${hEsc}\\b`,
          replacement: hd.replacement,
          length: hd.raw.length,
          isDerived: false
        });

        const token = hd.secretToken || hd.raw;

        // Special handling for physical addresses (sweep pure street address string across assistant turns)
        if (hd.type === "ENGLISH_PHYSICAL_ADDRESS" || hd.type === "ADDRESS_ID") {
          if (token && token.length >= 6) {
            const aEsc = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            heuristicRules.push({
              regexStr: `\\b${aEsc}\\b`,
              replacement: "[REDACTED_ADDRESS]",
              length: token.length,
              isDerived: false
            });
          }
        }

        // Special handling for card expiration dates (e.g. "exp 08/27" -> also sweep raw date "08/27")
        if (hd.type === "CARD_EXPIRY_DATE") {
          const m = token.match(/((?:0[1-9]|1[0-2])[\/-](?:20)?\d{2})/);
          if (m) {
            heuristicRules.push({
              regexStr: `\\b${m[1]}\\b`,
              replacement: "[REDACTED_CARD_EXPIRY]",
              length: m[1].length,
              isDerived: false
            });
          }
        }

        // Special handling for card security codes (e.g. "CVV 339" -> also sweep raw code "339")
        if (hd.type === "CARD_SECURITY_CODE") {
          const cleanDigits = (token || "").replace(/\D/g, "");
          if (cleanDigits.length >= 3 && cleanDigits.length <= 4) {
            heuristicRules.push({
              regexStr: `\\b${cleanDigits}\\b`,
              replacement: "[REDACTED_CVV]",
              length: cleanDigits.length,
              isDerived: false
            });
            const spacedDigits = cleanDigits.split("").join("\\s+");
            heuristicRules.push({
              regexStr: `\\b${spacedDigits}\\b`,
              replacement: "[REDACTED_CVV]",
              length: spacedDigits.length,
              isDerived: false
            });
          }
        }

        // Special handling for international identity numbers and life PII (sweep raw normalized token)
        if ([
          "UK_NINO", "CA_SIN", "IN_AADHAAR", "IN_PAN", "SG_NRIC",
          "BR_CPF", "ES_DNI", "IT_CODICE_FISCALE", "UK_SORT_CODE",
          "IN_IFSC", "AU_BSB", "UK_NHS", "US_MRN", "GITHUB_FINE_GRAINED", "TELEGRAM_BOT_TOKEN",
          "ID_DOB", "ID_MOTHER_MAIDEN", "ID_PLATE_RI", "US_PLATE", "VEHICLE_VIN", "DEVICE_IMEI",
          "NETWORK_IPV6", "HARDWARE_MAC", "GPS_COORDINATES", "CN_CITIZEN_ID", "KR_RRN",
          "JP_MY_NUMBER", "AU_TFN", "AU_MEDICARE", "MX_CURP", "MX_RFC"
        ].includes(hd.type)) {
          if (token && token.length >= 3) {
            const rawClean = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            heuristicRules.push({
              regexStr: `\\b${rawClean}\\b`,
              replacement: hd.replacement,
              length: token.length,
              isDerived: false
            });
            // If token contains hyphens, spaces, colons, or dots, also sweep unformatted variant
            const unspaced = token.replace(/[\s\-_.:]/g, "");
            if (unspaced.length >= 5 && unspaced !== token) {
              heuristicRules.push({
                regexStr: `\\b${unspaced}\\b`,
                replacement: hd.replacement,
                length: unspaced.length,
                isDerived: false
              });
            }
          }
        }

        // Special handling for credit/debit card numbers (sweep raw digits, spaced, and dashed)
        if (hd.type === "CREDIT_CARD") {
          const cardDigits = token.replace(/\D/g, "");
          if (cardDigits.length >= 13 && cardDigits.length <= 19) {
            heuristicRules.push({ regexStr: `\\b${cardDigits}\\b`, replacement: "[REDACTED_CARD_NUMBER]", length: cardDigits.length, isDerived: false });
            const spaced = cardDigits.replace(/(\d{4})/g, "$1 ").trim();
            const dashed = cardDigits.replace(/(\d{4})/g, "$1-").replace(/-$/, "");
            heuristicRules.push({ regexStr: `\\b${spaced.replace(/\s+/g, "\\s+")}\\b`, replacement: "[REDACTED_CARD_NUMBER]", length: spaced.length, isDerived: false });
            heuristicRules.push({ regexStr: `\\b${dashed}\\b`, replacement: "[REDACTED_CARD_NUMBER]", length: dashed.length, isDerived: false });
            // Amex 4-6-5 format
            if (cardDigits.length === 15) {
              const amexDashed = `${cardDigits.slice(0, 4)}-${cardDigits.slice(4, 10)}-${cardDigits.slice(10)}`;
              const amexSpaced = `${cardDigits.slice(0, 4)} ${cardDigits.slice(4, 10)} ${cardDigits.slice(10)}`;
              heuristicRules.push({ regexStr: `\\b${amexDashed}\\b`, replacement: "[REDACTED_CARD_NUMBER]", length: amexDashed.length, isDerived: false });
              heuristicRules.push({ regexStr: `\\b${amexSpaced.replace(/\s+/g, "\\s+")}\\b`, replacement: "[REDACTED_CARD_NUMBER]", length: amexSpaced.length, isDerived: false });
            }
          }
        }

        // Special handling for bank accounts, loan prefix IDs, and universal record identifiers
        if (hd.type === "PREFIXED_BANK_LOAN_ID" || hd.type === "UNIVERSAL_RECORD_IDENTIFIER") {
          const idVal = token;
          if (idVal && idVal.length >= 4) {
            const idEsc = idVal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            heuristicRules.push({ regexStr: `\\b${idEsc}\\b`, replacement: "[REDACTED_RECORD_ID]", length: idVal.length, isDerived: false });

            const pfxMatch = idVal.match(/^([A-Za-z]{2,6})[-_ ]?(\d{6,14})$/);
            if (pfxMatch) {
              heuristicRules.push({ regexStr: `\\b${pfxMatch[1]}[-_ ]?${pfxMatch[2]}\\b`, replacement: "[REDACTED_RECORD_ID]", length: idVal.length, isDerived: false });
              heuristicRules.push({ regexStr: `\\b${pfxMatch[2]}\\b`, replacement: "[REDACTED_RECORD_ID]", length: pfxMatch[2].length, isDerived: false });
            }
          }
        }
        if (hd.tag) {
          for (const rule of heuristicRules.slice(ruleStart)) {
            rule.replacement = rule.replacement.replace(/\[REDACTED_[A-Z0-9_]+\]/g, hd.tag);
          }
        }
      }
    }
    heuristicRules.sort((a, b) => b.length - a.length);

    // 3. Add derived arithmetic patterns (Lowest priority, applies only to non-base calculations in assistant turns)
    const derivedRules = [];
    for (const dp of derivedPatterns) {
      derivedRules.push({
        regexStr: dp.pattern,
        replacement: dp.replacement,
        length: dp.pattern.length,
        isDerived: true
      });
    }
    derivedRules.sort((a, b) => b.length - a.length);

    // Helper to check if a match is inside an existing bracket tag e.g. [REDACTED_...]
    const isInsideBracket = (text, offset, length) => {
      const lastOpen = text.lastIndexOf("[", offset);
      const lastClose = text.lastIndexOf("]", offset);
      if (lastOpen === -1 || lastOpen < lastClose) {
        return false;
      }
      const nextClose = text.indexOf("]", offset + length - 1);
      const nextOpen = text.indexOf("[", offset + length - 1);
      if (nextClose === -1 || (nextOpen !== -1 && nextClose > nextOpen)) {
        return false;
      }
      const bracketContent = text.substring(lastOpen, nextClose + 1);
      return /^\[(?:REDACTED|CONFIDENTIAL|INTERNAL|HR|User|ANONYMIZED)_[A-Z0-9_]+\]$/.test(bracketContent);
    };

    const solverHelper = new AdversaryOracleSolver();
    const allDerivedLeaks = [];
    const isKeptAmount = raw => (options.disabledLeaks || []).some(dl => {
      if (raw.trim().toLowerCase() === dl.trim().toLowerCase()) return true;
      const values = solverHelper.lexNumericSpans(raw).filter(t => !t.isRatio);
      const kept = solverHelper.lexNumericSpans(dl).filter(t => !t.isRatio);
      return values.length === 1 && kept.some(t => Math.abs(t.val - values[0].val) <= 0.01);
    });
    const labelLeak = (raw, tag) => options.labelLeak ? options.labelLeak(raw, tag) : tag;

    // Step A: Apply Base Rules (Immutable Primary User Secrets)
    for (const rule of baseRules) {
      const reg = new RegExp(rule.regexStr, "gi");
      for (let turn of updatedTurns) {
        if (turn.content) {
          turn.content = turn.content.replace(reg, (match, ...args) => {
            const offset = typeof args[args.length - 2] === "number" ? args[args.length - 2] : args[args.length - 3];
            if (isInsideBracket(turn.content, offset, match.length)) {
              return match;
            }
            if (rule.isFinancial && isEmbeddedFinancialSpan(turn.content, offset, offset + match.length)) return match;
            return rule.replacement;
          });
        }
      }
    }

    // Step B: Apply Heuristic Cross-Turn Sweep Rules
    for (const rule of heuristicRules) {
      const reg = new RegExp(rule.regexStr, "gi");
      for (let turn of updatedTurns) {
        if (turn.content) {
          turn.content = turn.content.replace(reg, (match, ...args) => {
            const offset = typeof args[args.length - 2] === "number" ? args[args.length - 2] : args[args.length - 3];
            if (isInsideBracket(turn.content, offset, match.length)) {
              return match;
            }
            return rule.replacement;
          });
        }
      }
    }

    // Step C: Apply Derived Calculations (Never Overwrites Bracketed Base Secrets)
    for (const rule of derivedRules) {
      const reg = new RegExp(rule.regexStr, "gi");
      for (let turn of updatedTurns) {
        if (turn.content) {
          turn.content = turn.content.replace(reg, (match, ...args) => {
            const offset = typeof args[args.length - 2] === "number" ? args[args.length - 2] : args[args.length - 3];
            if (isInsideBracket(turn.content, offset, match.length)) {
              return match;
            }
            if (solverHelper.isSafePublicSpan(turn.content, offset, offset + match.length)) {
              // Preserve unrelated public figures, but never an explicit ratio of a known secret.
              const line = turn.content.slice(turn.content.lastIndexOf("\n", offset) + 1, turn.content.indexOf("\n", offset) < 0 ? undefined : turn.content.indexOf("\n", offset));
              const value = Math.abs(parseFinancialAmount(match));
              const ratios = solverHelper.lexNumericSpans(line).filter(t => t.isRatio && t.val > 0 && t.val < 1);
              if (!financialNums.some(f => Math.abs(value - f.val) / f.val <= solverHelper.tolerance || ratios.some(r =>
                [value / r.val, value / (1 - r.val)].some(v => Math.abs(v - f.val) / f.val <= solverHelper.tolerance)))) return match;
            }
            if (isEmbeddedFinancialSpan(turn.content, offset, offset + match.length)) return match;
            const cleanMatch = match.trim();
            if (isKeptAmount(cleanMatch)) {
              return match;
            }
            const replacement = labelLeak(cleanMatch, rule.replacement);
            allDerivedLeaks.push({
              raw: cleanMatch,
              replacement,
              category: "FINANCIAL",
              isDerived: true,
              isAlgebraic: true
            });
            return replacement;
          });
        }
      }
    }

    // Syntactic Arrow Sweeper: e.g. "[REDACTED_FINANCIAL_1] → Rp32,775 jt"
    const arrowRx = /(\[REDACTED_FINANCIAL_\d+\]\s*(?:→|->|menjadi|naik menjadi)\s*)((?:Rp\s*|IDR\s*|\$\s*)?[\d.,]+(?:\s*(?:jt|juta|k|million))?)/gi;
    for (let turn of updatedTurns) {
      if (turn.content) {
        turn.content = turn.content.replace(arrowRx, (fullMatch, p1, rawNum) => {
          const cleanNum = rawNum.trim();
          if (isKeptAmount(cleanNum)) {
            return fullMatch;
          }
          const replacement = labelLeak(cleanNum, "[REDACTED_PROJECTED_SALARY]");
          allDerivedLeaks.push({
            raw: cleanNum,
            replacement,
            category: "FINANCIAL",
            isDerived: true,
            isAlgebraic: true
          });
          return `${p1}${replacement}`;
        });
      }
    }

    // Syntactic Increment Sweeper: e.g. "Kenaikan hanya:\nRp4,275 jt/bulan"
    const incRx = /(Kenaikan(?:\s+hanya|\s+sebesar)?\s*:\s*)((?:Rp\s*|IDR\s*|\$\s*)?[\d.,]+(?:\s*(?:jt|juta|k|million))?(?:\s*(?:per bulan|\/bulan))?)/gi;
    for (let turn of updatedTurns) {
      if (turn.content) {
        turn.content = turn.content.replace(incRx, (fullMatch, p1, rawNum) => {
          const cleanNum = rawNum.trim();
          if (isKeptAmount(cleanNum)) {
            return fullMatch;
          }
          const replacement = labelLeak(cleanNum, "[REDACTED_SALARY_INCREMENT]");
          allDerivedLeaks.push({
            raw: cleanNum,
            replacement,
            category: "FINANCIAL",
            isDerived: true,
            isAlgebraic: true
          });
          return `${p1}${replacement}`;
        });
      }
    }

    // Phase 3: Adversary-Oracle Reconstruction Solver
    // Evaluates all visible numbers against known secret values and suppresses derived leaks
    const disabledFinancialVals = (options.disabledFinancialVals || []);
    // extraSecrets: values behind before-sending symbols (<S1>) that appear in the chat
    const financialSecrets = [...financialNums.map(f => f.val), ...(options.extraSecrets || [])]
      .filter(v => !disabledFinancialVals.some(dv => Math.abs(v - dv) / v <= 0.01));
    const allSolverLeaks = [];
    if (financialSecrets.length > 0) {
      const solver = new AdversaryOracleSolver();
      for (let turn of updatedTurns) {
        // A user message that pastes a conversation ("Assistant: …") carries derived figures too
        if (turn.content && (turn.role === "assistant" || /^\s*assistant\s*:/im.test(turn.content))) {
          turn.content = solver.solveAndRedact(turn.content, financialSecrets, options.disabledLeaks || [], options.labelLeak);
          if (solver.lastLeaks && solver.lastLeaks.length > 0) {
            turn.solverLeaks = [...solver.lastLeaks].sort((a, b) => (a.start || 0) - (b.start || 0));
            allSolverLeaks.push(...solver.lastLeaks);
          }
        }
      }
    }

    // Deduplicate combined leaks by raw string and replacement tag
    const seenLeakRaws = new Set();
    const combinedLeaks = [];
    for (const lk of [...allSolverLeaks, ...allDerivedLeaks]) {
      if (lk && lk.raw) {
        const k = `${lk.raw.toLowerCase()}::${lk.replacement}`;
        if (!seenLeakRaws.has(k)) {
          seenLeakRaws.add(k);
          combinedLeaks.push(lk);
        }
      }
    }

    // A stated age is personal on its own ("I'm 28 years old"), and with a birth date it gives the
    // year ("I am 28" + the current year, "in 2020 at 22"), so it is always hidden
    {
      for (const t of updatedTurns) {
        t.content = t.content
          .replace(new RegExp(AGE_PATTERNS.age.source, "gi"), (m, n) => m.replace(n, "[REDACTED_AGE]"))
          .replace(new RegExp(AGE_PATTERNS.atAge.source, "gi"), (m, y, n) => m.replace(new RegExp(`\\b${n}\\b(?!.*\\b${n}\\b)`), "[REDACTED_AGE]"));
      }
    }

    // A hidden date comes back from the clues around it ("is a Tuesday, the day after the 14th"):
    // hide weekdays, offsets and day numbers next to every hidden date.
    // Same for a hidden address: landmarks and distances next to it.
    const DATE_CLUE_TAG = { weekday: "[REDACTED_WEEKDAY]", offset: "[REDACTED_OFFSET]", anchor: "[REDACTED_DAY]", landmark: "[REDACTED_LANDMARK]" };
    for (const t of updatedTurns) {
      const spans = [...hiddenDateClues(t.content), ...hiddenPlaceClues(t.content)]
        .flatMap((h) => h.clues).sort((a, b) => b.index - a.index);
      let limit = Infinity;
      for (const c of spans) {
        if (c.index + c.length > limit) continue; // overlaps one already replaced
        t.content = t.content.slice(0, c.index) + DATE_CLUE_TAG[c.kind] + t.content.slice(c.index + c.length);
        limit = c.index;
      }
    }

    return {
      anonymizedTurns: updatedTurns,
      mappings: Array.from(this.entityMap.entries()).map(([k, v]) => {
        const [cat, raw] = k.split("::");
        return { category: cat, original: raw, pseudonym: v };
      }),
      solverLeaks: combinedLeaks
    };
  }
}

// A name or place is the writer's own only when it comes right after words that tie it to them
// ("my wife Rina", "I live in Bandung", "teman saya Budi"). Used by the CLI's Presidio pass and the
// extension's before-sending NER pass.
const RELATION = "wife|husband|son|daughter|kid|child|mom|mum|mother|dad|father|parent|sister|brother|sibling|cousin|aunt|uncle|grandma|grandpa|grandmother|grandfather|friend|best friend|boss|colleague|coworker|co-worker|manager|supervisor|teacher|neighbou?r|landlord|tenant|doctor|therapist|partner|girlfriend|boyfriend|fianc[eé]e?|ex|roommate|lawyer|client|student";
const RELATION_ID = "istri|suami|anak|ibu|ayah|bapak|kakak|adik|teman|sahabat|bos|atasan|pacar|tetangga|dokter|guru";
const PERSONAL_BEFORE = {
  PERSON: new RegExp(
    `(?:\\b(?:my|our)\\s+(?:\\w+\\s+)?(?:${RELATION})|\\bmy name is|\\bi'?m|\\bi am|\\bcall me|\\bthis is|` +
    `\\bnama\\s+(?:saya|ku|aku|gue)|\\b(?:${RELATION_ID})\\s+(?:saya|ku|aku|gue|gw|kami))\\s*,?\\s*(?:named\\s+|called\\s+|is\\s+|bernama\\s+|namanya\\s+)?$`, "i"),
  LOCATION: /(?:\b(?:i|we)\s+(?:live|lived|am living|are living|stay|work|grew up|moved|was born|were born)\s+(?:in|at|to|near)|\b(?:i'?m|i am|we're|we are)\s+(?:[\w'-]+\s+){0,4}(?:from|based in|located in)|\bmy (?:home|address|apartment|house|office|school|hometown) is (?:in|at)?|\b(?:tinggal|kerja|bekerja|lahir|kuliah|sekolah)\s+di|\bsaya dari|\baku dari)\s*$/i
};

ConsistentPseudonymizer.AdversaryOracleSolver = AdversaryOracleSolver;
ConsistentPseudonymizer.PERSONAL_BEFORE = PERSONAL_BEFORE;
ConsistentPseudonymizer.looksLikeName = looksLikeName;
ConsistentPseudonymizer.AGE_PATTERNS = AGE_PATTERNS;
ConsistentPseudonymizer.hiddenDateClues = hiddenDateClues;

if (typeof module !== "undefined" && module.exports) {
  module.exports = ConsistentPseudonymizer;
  module.exports.AdversaryOracleSolver = AdversaryOracleSolver;
}
