/**
 * PomiCat: Tier 1: Deterministic Heuristic & High-Entropy Scanner
 * Instantly identifies and redacts hard secrets, credentials, PII (KTP, CC, email, phone)
 * with zero perceptible latency (< 2ms).
 */

class HeuristicsRedactor {
  constructor() {
    this.patterns = [
      {
        id: "SPELLED_OTP", name: "Spelled authentication code", category: "CREDENTIALS", valueGroup: 2,
        regex: /\b((?:kode\s+OTP(?:\s+saya)?|(?:my\s+)?OTP(?:\s+code)?(?:\s+is)?)\s*[:=]?\s*)((?:(?:zero|one|two|three|four|five|six|seven|eight|nine|nol|satu|dua|tiga|empat|lima|enam|tujuh|delapan|sembilan)[ \t]+){3,7}(?:zero|one|two|three|four|five|six|seven|eight|nine|nol|satu|dua|tiga|empat|lima|enam|tujuh|delapan|sembilan))\b(?![ \t]+(?:zero|one|two|three|four|five|six|seven|eight|nine|nol|satu|dua|tiga|empat|lima|enam|tujuh|delapan|sembilan)\b)/gi,
        replacement: "$1[REDACTED_OTP]"
      },
      {
        id: "SPACED_EMAIL", name: "Letter-spaced email", category: "PROFILE", valueGroup: 2,
        regex: /\b((?:email(?:\s+(?:is|saya))?|(?:send\s+it|kirim)\s+(?:to|ke))\s*[:=]?\s*)((?:[a-z0-9][ \t]+){2,}[a-z0-9][ \t]*@[ \t]*(?:[a-z0-9-][ \t]*)+\.[ \t]*(?:[a-z][ \t]+){1,11}[a-z])(?![a-z0-9])/gi,
        replacement: "$1[REDACTED_EMAIL]"
      },
      {
        id: "GROUPED_NIK", name: "Labelled grouped NIK / KTP", category: "GOV_ID", valueGroup: 2,
        regex: /\b((?:NIK|KTP)(?:\s+(?:saya|aku))?\s*[:=]?\s*)([1-9](?:[ \t]?\d){15})(?![ \t]?\d)/gi,
        validator: (raw) => /\d[ \t]+\d/.test(raw),
        replacement: "$1[REDACTED_NIK]"
      },
      {
        id: "AU_MOBILE", name: "Australian domestic mobile", category: "PROFILE", valueGroup: 1,
        regex: /\b(04\d{2}[ \t-]?\d{3}[ \t-]?\d{3})(?!\d)/g,
        replacement: "[REDACTED_PHONE]"
      },
      {
        id: "INDIA_POSTAL_ADDRESS", name: "Indian postal address", category: "PROFILE", valueGroup: 2,
        regex: /\b((?:my\s+address\s+is|I\s+live\s+at)\s+)((?:Flat|Unit|Apartment)\s+[\w-]+,\s*[^\r\n.!?]{1,100}?\b[1-9]\d{5})(?!\d)/gi,
        replacement: "$1[REDACTED_ADDRESS]"
      },
      {
        id: "ADDRESS_FIELD", name: "Unquoted address field", category: "PROFILE", valueGroup: 2,
        // ponytail: bounded unquoted fields; quoted/XML addresses retain their existing recognizers.
        regex: /\b(Address:\s*)(\d{1,6}\s+[^\r\n.!?]{5,120}?)(?=\s+(?:before|after|please)\b|[.!?](?:\s|$)|\r?\n|$)/gi,
        replacement: "$1[REDACTED_ADDRESS]"
      },
      {
        id: "ADDRESS_LABELLED", name: "Labelled address field", category: "PROFILE", valueGroup: 2,
        // Table cells flatten to "Label | value"; prose uses "Address:"/"Alamat:". Accept both.
        regex: /\b((?:home|mailing|residential|permanent|current|office|shipping)\s+address|address|alamat)(?:\s*\([^)\r\n]{0,40}\))?\s*[:：=\-–—|]*\s*((?:(?:jl\.?|jalan|gg\.?|gang|kp\.?|kampung|blok|rt|rw|dusun|desa|kel\.?|kec\.?)\s+|\d{1,6}\s+\p{L})[^\r\n|]{4,120}?)(?=\s*(?:\r?\n|\||\b(?:before|after|please)\b|;|(?<!\b(?:No|Jl|Gg|Kp|Kel|Kec))\.(?:\s|$)|$))/giu,
        replacement: "$1[REDACTED_ADDRESS]"
      },
      {
        id: "ADDRESS_STREET_ID", name: "Indonesian street address", category: "PROFILE", valueGroup: 1,
        // Unlabelled "Jl. ... 10510" cells still carry a home address; postal code bounds the match.
        regex: /\b((?:jl\.?|jalan)\s+[^\r\n|]{3,110}?\b\d{5})(?![ \t]?\d)/giu,
        replacement: "[REDACTED_ADDRESS]"
      },
      {
        id: "COORDINATE_PAIR", name: "Personal coordinates", category: "PROFILE", valueGroup: 2,
        regex: /((?:\b(?:coordinates|koordinat)(?:\s+(?:rumah|saya|are|is)){0,3}\s*[:=]?\s*|google\.com\/maps\/@))(-?\d{1,2}\.\d+\s*,\s*-?\d{1,3}\.\d+)(?!\d)/gi,
        validator: (raw) => {
          const pair = raw.match(/(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)$/);
          return pair && Math.abs(Number(pair[1])) <= 90 && Math.abs(Number(pair[2])) <= 180;
        },
        replacement: "$1[REDACTED_LOCATION]"
      },
      // Structured values own their complete span before generic number recognizers run.
      {
        id: "CREDENTIAL_VALUE", name: "Explicit credential value", category: "CREDENTIALS", valueGroup: 2,
        regex: /\b((?:password\s+for\s+(?:my\s+)?(?:online\s+)?banking\s+is\s+|(?:x-api-key|aws_secret_access_key|aws\s+secret|jwt_secret)(?:\s*[:=]\s*|\s+))['"]?)(?![\[\s:=])([^\s'"\r\n]+)(?=\s|['"]|$)/gi,
        replacement: "$1[REDACTED_SECRET]"
      },
      {
        id: "AUTHENTICATION_CODE", name: "OTP / PIN / login code", category: "CREDENTIALS", valueGroup: 2,
        regex: /\b((?:(?:kode[ \t]+)?OTP|PIN[ \t]+ATM|ATM[ \t]+PIN|Token[ \t]+2FA)(?:[ \t]+[\p{L}]{1,24}){0,3}[ \t]*[:=]?[ \t]*)(\d{4,8})(?!\d)/giu,
        replacement: "$1[REDACTED_OTP]"
      },
      {
        // Labelled national IDs, kept whole: "Aadhaar number is 1234 5678 9012", "German tax ID is
        // 12 345 678 901", "National Insurance number is QQ 12 34 56 C", "BSN is 111222333",
        // "My Number card ID is 9876 5432 1098", "VAT number is DE123456789". Not "my number is 0812…".
        id: "LABELLED_NATIONAL_ID", name: "National ID (labelled)", category: "GOV_ID", valueGroup: 3,
        regex: /\b((?:aadhaa?r|(?:japanese\s+)?my\s+number\s+card|individual\s+number|(?:german\s+|personal\s+)?tax\s+(?:id|identification)|steuer-?id|BSN|burgerservicenummer|citizen\s+service\s+number|national\s+insurance|NI\s+number|NINO|VAT)(?:\s+(?:number|no\.?|card|ID))*)((?:\s+(?:is|was))?\s*[:=#]?\s*)((?:[A-Z]{1,3}[ -]?)?\d[\d -]{4,20}\d(?:[ -]?[A-Z](?![A-Za-z]))?)(?![\w-])/gi,
        validator: (raw) => (raw.match(/\d/g) || []).length >= 6,
        replacement: "$1$2[REDACTED_ID]"
      },
      {
        id: "UK_SORT_CODE", name: "UK sort code", category: "FINANCIAL", valueGroup: 2,
        regex: /\b(sort[ \t]+code(?:[ \t]+(?:is|was))?[ \t]*[:=]?[ \t]*)(\d{2}[- ]\d{2}[- ]\d{2})(?![\d-])/gi,
        replacement: "$1[REDACTED_SORT_CODE]"
      },
      {
        // "My 2FA backup code is 8842-1197", "recovery code: 4F7K-9QX2" (card security codes: CVV rule)
        id: "BACKUP_CODE", name: "2FA backup / recovery code", category: "CREDENTIALS", valueGroup: 2,
        regex: /\b((?:(?:2FA|MFA|two[- ]factor)[ \t]+)?(?:backup|recovery)[ \t]+codes?)((?:[ \t]+(?:is|are|was))?[ \t]*[:=]?[ \t]*)([A-Z0-9]{3,8}(?:-[A-Z0-9]{3,8}|[ ]\d{3,8}){0,3})(?![A-Z0-9-])/giu,
        validator: (raw) => /\d/.test(raw),
        replacement: "$1$2[REDACTED_OTP]"
      },
      {
        id: "LOGIN_CODE", name: "Login code", category: "CREDENTIALS", valueGroup: 2,
        regex: /\b(Use\s+)(\d{4,8})(\s+as\s+your\s+(?:login|verification|security)\s+code)\b/gi,
        replacement: "$1[REDACTED_OTP]$3"
      },
      {
        id: "GROUPED_IBAN", name: "Formatted IBAN", category: "FINANCIAL", valueGroup: 2,
        regex: /\b((?:IBAN(?:\s+is)?\s*[:=]?\s*)?)(DE\d{2}(?:[ \t]?\d){18}|GB\d{2}[ \t]?[A-Z]{4}(?:[ \t]?\d){14}|FR\d{2}(?:[ \t]?[A-Z0-9]){23}|NL\d{2}[ \t]?[A-Z]{4}(?:[ \t]?\d){10}|ES\d{2}(?:[ \t]?\d){20}|IT\d{2}[ \t]?[A-Z](?:[ \t]?[A-Z0-9]){22})(?![A-Z0-9])/gi,
        // Explicitly labelled invalid test/account values remain sensitive; otherwise require MOD-97.
        validator: (raw) => /^IBAN\b/i.test(raw) || this.validateIBAN(raw),
        replacement: "$1[REDACTED_IBAN]"
      },
      {
        id: "GROUPED_ACCOUNT", name: "Grouped bank account", category: "FINANCIAL", valueGroup: 2,
        regex: /\b((?:rekening|account)(?:\s+(?:Mandiri|BCA|saya|aku|number|is)){0,3}\s*[:=]?\s*)(\d{3}-\d{2}-\d{7}-\d)(?!\d)/gi,
        replacement: "$1[REDACTED_ACCOUNT]"
      },
      {
        id: "BANK_NAMED_ACCOUNT", name: "Named bank account", category: "FINANCIAL", valueGroup: 2,
        // "BCA 5271 8890 1234" in a table cell has no "rekening/account" keyword; the bank name
        // plus 10-18 grouped digits is specific enough to stay high precision.
        regex: /\b((?:bank\s+)?(?:bca|mandiri|bni|bri|cimb(?:\s+niaga)?|permata|bsi|bank\s+syariah\s+indonesia|jago|jenius|danamon|btn|ocbc(?:\s+nisp)?|uob|maybank)\b[\s:.\-–—]*(?:(?:a\/n|atas\s+nama)\s+)?)((?:\d{2,4}[ \t-]){2,4}\d{2,4}|\d{10,18})(?![ \t-]?\d|[\p{L}_])/giu,
        validator: (raw) => {
          const digits = (raw.match(/\d/g) || []).length;
          return digits >= 10 && digits <= 18;
        },
        replacement: "$1[REDACTED_ACCOUNT]"
      },
      {
        id: "BIRTH_YEAR", name: "Explicit birth year", category: "PROFILE", valueGroup: 2,
        regex: /\b((?:born\s+in|birth\s+year\s+is|lahir\s+tahun)\s+)((?:19|20)\d{2})\b/gi,
        replacement: "$1[REDACTED_DOB]"
      },
      {
        id: "CLI_AUTH_ARGUMENT", name: "Command credential", category: "CREDENTIALS", valueGroup: 2,
        regex: /\b((?:redis-cli\b[^\n|;]*?\s-a\s+|docker\s+login\b[^\n|;]*?\s(?:-p|--password)\s+|hydra\b[^\n|;]*?\s-p\s+|smbclient\b[^\n|;]*?\s-U\s+[^\s%]+%))('[^'\n]+'|"[^"\n]+"|[^\s'"\n]+)/g,
        replacement: "$1[REDACTED_PASSWORD]"
      },
      // 1. Indonesian KTP / NIK (16 digits)
      {
        id: "ID_NIK",
        name: "Indonesian NIK / KTP",
        category: "GOV_ID",
        regex: /\b([1-9][0-9]{15})\b/g,
        // A 16-digit amount ("7000000000000000 dollars") is not a NIK: the amount rules take it, so
        // the AI gets <S1> and the maths is done on your screen. A real NIK ends in a serial number
        // from 0001, never 0000, and isn't written with a currency.
        validator: (raw, index, text) => {
          if (raw.endsWith("0000")) return false;
          if (!text) return true;
          const after = text.slice(index + raw.length, index + raw.length + 12);
          const before = text.slice(Math.max(0, index - 5), index);
          return !/^\s*(?:dollars?|dolar|bucks|usd|idr|rupiah|euros?|pounds?)\b/i.test(after) && !/(?:Rp\.?|IDR|USD|[$€£])\s*$/i.test(before);
        },
        replacement: "[REDACTED_NIK]"
      },
      // 1b. US Social Security Number (SSN - 9 digits formatted)
      {
        id: "US_SSN",
        name: "US Social Security Number (SSN)",
        category: "GOV_ID",
        regex: /\b([0-9]{3}-[0-9]{2}-[0-9]{4})\b/g,
        validator: (raw) => this.validateSSN(raw),
        replacement: "[REDACTED_SSN]"
      },
      // 1b-2. US Social Security Number (Raw 9-15 digits, JSON/XML, or masked format with context)
      {
        id: "US_SSN_RAW",
        name: "US Social Security Number (Raw)",
        category: "GOV_ID",
        regex: /(?:<ssn>([^<]+)<\/ssn>|["']?ssn["']?\s*[:=]\s*["']?([0-9\s*.-]{9,20})["']?|\b((?:(?:social\s+security(?:\s+number)?|ssn)(?:\s+is|\s*[:=\-])?\s*))([0-9\s*.-]{9,20})\b)/gi,
        validator: (raw) => {
          if (raw.includes("*")) return true;
          const digits = raw.replace(/\D/g, "");
          return digits.length >= 9 && digits.length <= 15 && digits !== "000000000" && !digits.startsWith("000") && !digits.startsWith("666");
        },
        replacement: (raw) => {
          const m = /^([^0-9*<"']*(?:<ssn>|["']?ssn["']?\s*[:=]\s*["']?|(?:social\s+security(?:\s+number)?|ssn)(?:\s+is|\s*[:=\-])?\s*))/i.exec(raw);
          const prefix = m ? m[1] : "";
          const suffix = raw.endsWith("</ssn>") ? "</ssn>" : (raw.endsWith('"') ? '"' : (raw.endsWith("'") ? "'" : ""));
          return `${prefix}[REDACTED_SSN]${suffix}`;
        }
      },
      // 1c. US Employer Identification Number (EIN)
      {
        id: "US_EIN",
        name: "US Employer Identification Number (EIN)",
        category: "GOV_ID",
        regex: /\b((?:ein|fein|tax\s+id)\s*(?:is\b|[:=\-])?\s*)(\d{2}-\d{7})\b/gi,
        replacement: "$1[REDACTED_EIN]"
      },
      // 1d. ABA Bank Routing Transit Number (9 digits with checksum)
      {
        id: "ABA_ROUTING",
        name: "ABA Bank Routing Transit Number",
        category: "CREDENTIALS",
        regex: /\b((?:(?:routing(?:\s+transit|\s+number)?|aba(?:\s+routing)?)\s*(?:is|was|[:=\-])?\s*))(\d{9})\b/gi,
        validator: (raw) => {
          const digits = raw.replace(/\D/g, "");
          const last9 = digits.slice(-9);
          return this.validateRouting(last9);
        },
        replacement: "$1[REDACTED_ROUTING_NUMBER]"
      },
      // 1e. International Bank Account Number (IBAN - ISO 13616)
      {
        id: "IBAN_ACCOUNT",
        name: "International Bank Account Number (IBAN)",
        category: "FINANCIAL",
        regex: /\b((?:iban\s*[:=\-~]?\s*|(?<=\b)))([A-Z]{2}\d{2}[A-Z0-9]{11,30})\b/gi,
        validator: (raw, index, text) => {
          const hasContext = /iban/i.test(raw) || /(?:iban)\s*[:=\-~]?\s*$/i.test(text.substring(Math.max(0, index - 20), index));
          if (hasContext) return true;
          return this.validateIBAN(raw);
        },
        replacement: "$1[REDACTED_IBAN]"
      },
      // 1f. SWIFT / BIC Code
      // 2. Credit Card Numbers (12-19 digits with Luhn verification & Fail-Closed Context Fallback)
      {
        id: "CREDIT_CARD",
        name: "Credit Card",
        category: "FINANCIAL",
        regex: /\b(?:\d{4}[ .-]?){3}\d{4}\b|\b3[47]\d{2}[ -]\d{6}[ -]\d{5}\b|\b\d{12,19}\b/g,
        validator: (raw, index, text) => {
          // Digits inside a DOI or URL path are identifiers, not cards
          if (text && /(?:doi\.org\/|\b10\.\d{4,9}\/|https?:\/\/)\S*$/i.test(text.substring(Math.max(0, index - 120), index))) return false;
          if (this.luhnCheck(raw)) return true;
          // Fail-closed fallback: if Luhn fails, but surrounding context explicitly indicates a card number, redact it!
          if (text) {
            const start = Math.max(0, index - 80);
            const end = Math.min(text.length, index + raw.length + 80);
            const window = text.substring(start, end).toLowerCase();
            return /\b(?:card(?:\s+number)?|debit|credit|visa|mastercard|amex|discover|ends\s+in|ending\s+in|pan|cvv|cvc|exp)\b/.test(window);
          }
          return false;
        },
        replacement: "[REDACTED_CARD_NUMBER]"
      },
      // 2b. Card Security Verification Code (CVV, CVC, CID, CSC, CVN - 3-4 digits formatted, spaced, or conversational)
      {
        id: "CARD_SECURITY_CODE",
        name: "Card Security Code (CVV/CVC)",
        category: "FINANCIAL",
        regex: /\b((?:(?:(?:card\s+)?(?:security|verification)\s+(?:code|number|value)|cvv2?|cvc2?|cid|csc|cvn2?|c\s*v\s*v|c\s*v\s*c)(?:\s*\/\s*(?:cvv2?|cvc2?|cid|csc|cvn2?))?(?:\s+(?:on\s+the\s+back(?:\s+of\s+(?:the|my)\s+card)?|code|number))?)\s*(?:[:=\-~]|is|was|of|equals)?\s*[\[\("']?)([0-9]{3,4}|[0-9]\s+[0-9]\s+[0-9](?:\s+[0-9])?)([\]\)"']?)/gi,
        replacement: (raw) => {
          const m = raw.match(/^([\s\S]*?[\[\("']?)([0-9\s]{3,7})([\]\)"']?)$/);
          if (m) {
            const prefix = m[1].replace(/[\[\("']$/, "");
            return `${prefix}[REDACTED_CVV]`;
          }
          return "[REDACTED_CVV]";
        }
      },
      // 2c. Card Expiration Date (MM/YY or MM/YYYY with anchor)
      {
        id: "CARD_EXPIRY_DATE",
        name: "Card Expiration Date",
        category: "FINANCIAL",
        regex: /\b((?:(?:card\s+)?(?:exp(?:iration)?|expiry)(?:\s+date)?)\s*[:=\-]?\s*)((?:0[1-9]|1[0-2])[\/-](?:20)?\d{2})\b/gi,
        replacement: "$1[REDACTED_CARD_EXPIRY]"
      },
      // 2d. Universal Record, Account, Policy, Loan, & Booking Identifiers (Cross-Domain)
      {
        id: "CARD_EXPIRY_WORDS",
        name: "Card Expiration (month name)",
        category: "FINANCIAL",
        regex: /\b((?:card\s+)?(?:expir(?:ation|y|es)|exp)(?:\s+date)?\s*(?:is|in|as|means|:)?\s*)((?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+20\d{2})\b/gi,
        replacement: "$1[REDACTED_CARD_EXPIRY]"
      },
      {
        id: "UNIVERSAL_RECORD_IDENTIFIER",
        name: "Account / Record Identifier",
        category: "FINANCIAL",
        regex: /\b((?:(?:checking|savings|bank|loan|credit|mortgage|deposit)\s+account(?:\s+number)?|(?:(?:account|acct|loan|policy|claim|member|group|booking|pnr|e-?ticket|record|case|docket|invoice|order|tracking)(?:\s+(?:#|id|number|no\.?|code|reference|\bref\b))?)|(?:sofi|wf|wells\s+fargo|chase|citi|bofa|aetna|cigna|united|metlife)\s+(?:account|loan|policy))\s*(?:[:=\-]|is)?\s*#?)((?=[A-Za-z_/-]*\d)[A-Za-z0-9]{1,8}[-_/][A-Za-z0-9_-]{4,24}|1Z[0-9A-Z]{16}|[0-9]{6,18}|(?=[A-Za-z0-9]*\d)[A-Za-z0-9]{5,12})\b/gi,
        validator: (raw, index, text) => {
          const clean = raw.trim();
          if (/^(?:active|pending|closed|open|true|false|none|null|undefined|ready)$/i.test(clean)) return false;
          // An amount, not an ID: "loan is Rp480,000,000", "loan of USD5000"
          const value = clean.replace(/^.*?[#:=\s]#?(?=[^\s#:=]*$)/, "");
          if (/^(?:rp|idr|rs|inr|usd|sgd|eur|gbp|aud|cad|myr|php|thb|jpy|cny|hkd|chf)\.?\d/i.test(value)) return false;
          if (/^\d+$/.test(value) && text && Number.isInteger(index) && /^[.,]\d{3}/.test(text.slice(index + raw.length))) return false;
          return true;
        },
        replacement: "$1[REDACTED_RECORD_ID]"
      },
      // 2d-bis. Personal ID numbers after a label ("Roll No. 932353568953", "Pin No. is 9826…", "NAME: …
      // No. : 9323…", "Student ID 20231045"): RedacBench's name + ID pairs leaked through every rule
      {
        id: "LABELLED_PERSONAL_ID",
        name: "Labelled ID number",
        category: "GOV_ID",
        regex: /\b((?:(?:roll|registration|reg|employee|staff|member|pin|identity|identification|id|serial|matriculation)\s*(?:no\.?|number|nr\.?|#|id)|no\.)\s*(?:is\s+|[:#=]\s*)?)(\d(?:[\d -]{4,20})\d)\b/gi,
        validator: (raw) => {
          const value = (raw.match(/(\d[\d -]*\d)\s*$/) || [""])[0].replace(/\D/g, "");
          return value.length >= 6 && value.length <= 16;
        },
        replacement: "$1[REDACTED_ID]"
      },
      // 2e. Standalone Bank Account Prefix Identifiers (e.g. WF-990218374, SOFI-99821174, AETNA-8849201)
      {
        id: "PREFIXED_BANK_LOAN_ID",
        name: "Bank / Loan / Policy ID",
        category: "FINANCIAL",
        regex: /\b((?:(?:from|to|via|on|in|#|account|acct|loan|policy|claim|ref|rekening)\s*(?:[:=\-]|is)?\s*)?)([A-Z]{2,6}-\d{6,14})\b/g,
        validator: (raw, index, text) => {
          const m = raw.match(/([A-Z]{2,6})-(\d{6,14})/);
          if (!m) return false;
          const prefix = m[1].toUpperCase();
          const technicalExclusions = ["CVE", "RFC", "ISO", "IEEE", "HTTP", "HTTPS", "UTF", "UTC", "SHA", "MD", "SONNET", "OPUS", "HAIKU", "LLAMA", "GEMINI", "CLAUDE", "PORT"];
          if (technicalExclusions.includes(prefix)) return false;

          const knownInstitutions = ["WF", "SOFI", "CHASE", "CITI", "BOFA", "PNC", "ALLY", "AETNA", "CIGNA", "METLIFE", "USAA", "TD", "BCA", "BRI", "BNI", "MANDIRI", "AMEX", "DISCOVER"];
          if (knownInstitutions.includes(prefix)) return true;

          if (text) {
            const start = Math.max(0, index - 80);
            const end = Math.min(text.length, index + raw.length + 80);
            const window = text.substring(start, end).toLowerCase();
            return /\b(?:account|acct|loan|checking|savings|balance|bank|policy|claim|deposit|statement|bill|rekening|pinjaman|member)\b/.test(window);
          }
          return false;
        },
        replacement: "$1[REDACTED_ACCOUNT_ID]"
      },
      // 2f. Card Ending In Last 4 Digits
      {
        id: "CARD_LAST_FOUR",
        name: "Card Last Four Digits",
        category: "FINANCIAL",
        regex: /\b((?:(?:(?:(?:debit|credit)\s+)?(?:card|account))\s*[:=\-]?\s*)?(?:ends|ending)\s+in\s*|(?:(?:debit|credit)\s+)?card\s+ending\s+)([0-9]{4})\b/gi,
        validator: (raw, index, text) => {
          if (text) {
            const start = Math.max(0, index - 40);
            const before = text.substring(start, index).toLowerCase();
            if (/\b(?:year|quarter|month|period|semester|fiscal|week|day)\s*$/i.test(before)) {
              return false;
            }
          }
          return true;
        },
        replacement: "$1[REDACTED_CARD_LAST_4]"
      },
      // 2g. Indonesian & International Bank Account Number (8 to 18 digits or hyphenated with context)
      {
        id: "ID_BANK_ACCOUNT",
        name: "Bank Account Number",
        category: "FINANCIAL",
        regex: /\b((?:(?:nomor\s+)?rekening(?:\s+bank)?|no\.?\s*rek(?:ening)?|rek(?:ening)?(?:\s+(?:bca|mandiri|bni|bri|cimb|jago|jenius|permata|bsi))?|(?:checking|savings|direct\s+deposit|bank)?\s*(?:account|acct)(?:\s+(?:number|no|#))?|(?:dbs|posb|ocbc|uob|chase|bofa|citi|wells\s+fargo)\s+(?:account|acct)?)\s*(?:aku|saya|kamu|Anda|nya|is|was|[:=\-~#])*\s*)([0-9]{3,4}[-\s][0-9]{5,7}[-\s][0-9]|[0-9]{4}[-\s][0-9]{4}[-\s][0-9]{4}|[0-9]{8,18})\b/gi,
        replacement: "$1[REDACTED_ACCOUNT_NUMBER]"
      },
      // 3. Email Addresses (Standard and Defanged [at]/[dot]/(at)/(dot))
      {
        id: "EMAIL",
        name: "Email Address",
        category: "PROFILE",
        regex: /\b[A-Za-z0-9._%+-]+(?:\s*@\s*|\s*\[at\]\s*|\s*\(at\)\s*)[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+|\s*\[dot\]\s*[A-Za-z0-9-]+|\s*\(dot\)\s*[A-Za-z0-9-]+)*(?:\.|\s*\[dot\]\s*|\s*\(dot\)\s*)(?:[A-Za-z]{2,12})\b/gi,
        // git@github.com:team/repo is the standard Git SSH address, not a person's email
        validator: (raw) => !raw.includes("@protected.local") && !/^git@/i.test(raw),
        replacement: (match, index, context) => `[user_${Math.abs(this.hashString(match)) % 1000}@protected.local]`
      },
      // 4. Phone Numbers (ID, SG, UK, AU, IN, US, E.164 Global with Toll-Free Hotline Protection)
      {
        id: "PHONE",
        name: "Phone Number",
        category: "PROFILE",
        regex: /(?:\b(?:\+62|62|0)[\s.-]?8[1-9](?:[\s.-]?[0-9]){7,10}\b|\+(?:65[\s.-]?[689]\d{3}[\s.-]?\d{4}|44[\s.-]?(?:0)?\d{2,4}[\s.-]?\d{3,4}[\s.-]?\d{3,4}|61[\s.-]?(?:0)?\d[\s.-]?\d{4}[\s.-]?\d{4}|91[\s.-]?[6-9]\d{4}[\s.-]?\d{5}|[1-9]\d{0,2}[\s.-]?\(?\d{2,4}\)?[\s.-]?\d{3,4}[\s.-]?\d{3,4})\b|(?<=^|[\s,;:(])(?:\+?1[-.\s]?)?\(?[2-9]\d{2}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b)/gi,
        validator: (raw, index, text) => {
          // If it's a toll-free number (800, 888, 877, 866, 855, 844, 833) in corporate/support context, preserve it!
          const digits = raw.replace(/\D/g, "");
          // "7000000000 dollars" is an amount (the amount rules take it), not a phone number
          if (/^\d+$/.test(raw) && text &&
            /^\s*(?:dollars?|dolar|bucks|usd|idr|rupiah|euros?|pounds?|juta|ribu|rb|miliar|milyar)\b/i.test(text.slice(index + raw.length))) return false;
          const isTollFree = /^(?:1)?(?:800|888|877|866|855|844|833)/.test(digits);
          if (isTollFree && text) {
            const start = Math.max(0, index - 80);
            const window = text.substring(start, Math.min(text.length, index + raw.length + 40)).toLowerCase();
            if (/\b(?:call|support|service|official|hotline|helpdesk|contact|toll-?free|bank|wells\s+fargo|customer|help|amazon|sofi|aetna|cigna|number\s+on\s+the\s+back)\b/.test(window)) {
              return false; // Preserve public business support hotline
            }
          }
          return digits.length >= 7 && digits.length <= 15; // Redact personal phone numbers
        },
        replacement: "[REDACTED_PHONE]"
      },
      // 4b. Contextual Phone & Fax Numbers (Formatted, spaced, or prefixed by Phone/Tel/Fax/Mobile/JSON/XML)
      {
        id: "CONTEXT_PHONE",
        name: "Contextual Phone / Fax Number",
        category: "PROFILE",
        regex: /(?:<phone>([^<]+)<\/phone>|["']?(?:phone|mobile|telephone|fax|celular|contact|tel)["']?\s*[:=]\s*["']?([+0-9()][+0-9() ./-]{5,22}[0-9])["']?|\b((?:(?:phone|mobile|tel(?:ephone)?|fax|whatsapp|call\s+(?:me\s+)?at|answering\s+at|reach\s+(?:me|us)\s+at|messages?\s+to|text(?:ing)?\s+to)\s*(?:#|number|no\.?)?)\s*[:=\-]?\s*)([+0-9()][+0-9() ./-]{5,22}[0-9])(?:\s*-(?:Office|Fax|Mobile|Home|Work)\b)?)/gi,
        validator: (raw) => {
          const digits = raw.replace(/\D/g, "");
          return digits.length >= 7 && digits.length <= 16;
        },
        replacement: (raw) => {
          const m = /^([^0-9+(<"']*(?:<phone>|["']?(?:phone|mobile|telephone|fax|celular|contact|tel)["']?\s*[:=]\s*["']?|(?:phone|mobile|tel(?:ephone)?|fax|whatsapp|call\s+(?:me\s+)?at|answering\s+at|reach\s+(?:me|us)\s+at|messages?\s+to|text(?:ing)?\s+to)\s*(?:#|number|no\.?)?\s*[:=\-]?\s*))/i.exec(raw);
          const prefix = m ? m[1] : "";
          const suffixM = /(-(?:Office|Fax|Mobile|Home|Work)|<\/phone>|["'])$/i.exec(raw);
          const suffix = suffixM ? suffixM[1] : "";
          return `${prefix}[REDACTED_PHONE]${suffix}`;
        }
      },
      // 4c. IPv4 Address (Excluding localhost, broadcast, version markers, and public DNS / CIDR blocks)
      {
        id: "IPV4_ADDRESS",
        name: "IPv4 Network Address",
        category: "SYSTEM",
        // "@" before it (ssh deploy@203.0.113.15) and ".", "!", "?" after it (end of a sentence) count too
        regex: /(?<=^|[\s,;:(|/\\="'`@])(?:25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9]?[0-9])\.(?:25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9]?[0-9])\.(?:25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9]?[0-9])\.(?:25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9]?[0-9])(?=$|[\s,;:)|\/\\="'`!?]|\.(?!\w))/g,
        validator: (raw, index, text) => {
          const val = raw.trim();
          if (val === "127.0.0.1" || val === "0.0.0.0" || val === "255.255.255.255") return false;
          // Preserve public DNS providers (Cloudflare, Google, Quad9, OpenDNS)
          if (/^(?:1\.1\.1\.1|1\.0\.0\.1|8\.8\.8\.8|8\.8\.4\.4|9\.9\.9\.9|208\.67\.222\.222|208\.67\.220\.220)$/.test(val)) return false;
          // Preserve non-routable addresses (RFC 1918 private + link-local): they identify
          // a LAN, not a person. Public IPs are still redacted. See also Tier-0 PRIVATE_IP.
          if (/^(?:10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.|169\.254\.)/.test(val)) return false;
          if (text) {
            // Exclude CIDR network masks like /24, /16, /8, /32
            const after = text.substring(index + raw.length, index + raw.length + 4);
            if (/^\/\d{1,2}\b/.test(after)) return false;

            const prev = text.substring(Math.max(0, index - 15), index);
            if (/\b(?:v|version|ver)\s*$/i.test(prev)) return false;
          }
          return true;
        },
        replacement: "[REDACTED_IP]"
      },
      // 5. OpenAI API Keys (Legacy & Project keys)
      {
        id: "OPENAI_KEY",
        name: "OpenAI Secret Key",
        category: "CREDENTIALS",
        regex: /\bsk-(?:proj-)?[A-Za-z0-9_-]{32,80}\b/g,
        replacement: "sk-dummy-test-key-placeholder"
      },
      // 5a-1. Anthropic API Key (Claude)
      {
        id: "ANTHROPIC_KEY",
        name: "Anthropic Claude API Key",
        category: "CREDENTIALS",
        regex: /\bsk-ant-api03-[A-Za-z0-9_-]{80,110}\b/g,
        replacement: "sk-ant-api03-dummyPlaceholderKeyForTesting00000"
      },
      // 5a-2. Google Cloud / Maps API Key
      {
        id: "GOOGLE_API_KEY",
        name: "Google Cloud / Maps API Key",
        category: "CREDENTIALS",
        regex: /\bAIzaSy[A-Za-z0-9_-]{30,35}\b/g,
        replacement: "AIzaSyDummyPlaceholderGoogleApiKey0000"
      },
      // 5a-3. Hugging Face Access Token
      {
        id: "HUGGINGFACE_TOKEN",
        name: "Hugging Face Access Token",
        category: "CREDENTIALS",
        regex: /\bhf_[A-Za-z0-9]{34,40}\b/g,
        replacement: "hf_dummyPlaceholderHuggingFaceToken000"
      },
      // 5a-3b. Other AI provider keys: Groq (gsk_), xAI (xai-), Replicate (r8_)
      {
        id: "AI_PROVIDER_KEY",
        name: "AI Provider API Key (Groq / xAI / Replicate)",
        category: "CREDENTIALS",
        regex: /\b(?:gsk_[A-Za-z0-9]{40,60}|xai-[A-Za-z0-9]{60,90}|r8_[A-Za-z0-9]{30,40})\b/g,
        replacement: "[REDACTED_API_KEY]"
      },
      // 5a-3c. Bearer tokens in pasted headers / curl commands: "Authorization: Bearer <token>"
      {
        id: "BEARER_TOKEN",
        name: "Bearer Token",
        category: "CREDENTIALS",
        regex: /(\bBearer\s+)([A-Za-z0-9\-._~+/]{20,}=*)/g,
        replacement: "$1[REDACTED_TOKEN]"
      },
      // 5a-4. NPM Automation / Publish Access Token
      {
        id: "NPM_TOKEN",
        name: "NPM Access Token",
        category: "CREDENTIALS",
        regex: /\bnpm_[A-Za-z0-9]{36,50}\b/g,
        replacement: "npm_dummyPlaceholderNpmTokenForTesting0000"
      },
      // 5a-5. GitLab Personal Access Token
      {
        id: "GITLAB_TOKEN",
        name: "GitLab Personal Access Token",
        category: "CREDENTIALS",
        regex: /\bglpat-[A-Za-z0-9_-]{20,30}\b/g,
        replacement: "glpat-dummyPlaceholderGitLabToken00000"
      },
      // 5a-6. WireGuard VPN Private Key
      {
        id: "WIREGUARD_PRIVATE_KEY",
        name: "WireGuard VPN Private Key",
        category: "CREDENTIALS",
        regex: /(\bPrivateKey\s*=\s*)([A-Za-z0-9+/]{42,45}=)/g,
        replacement: "$1[REDACTED_WIREGUARD_PRIVATE_KEY]"
      },
      // 5b. Stripe Production & Restricted Keys (sk_live_, rk_live_, etc.)
      {
        id: "STRIPE_KEY",
        name: "Stripe Secret Key",
        category: "CREDENTIALS",
        regex: /\b(?:sk|rk)_(?:live|test)_[a-zA-Z0-9]{20,99}\b/g,
        replacement: "[REDACTED_STRIPE_KEY]"
      },
      // 5c. Slack Webhook URLs
      {
        id: "SLACK_WEBHOOK",
        name: "Slack Incoming Webhook",
        category: "CREDENTIALS",
        regex: /\bhttps:\/\/hooks\.slack\.com\/services\/T[a-zA-Z0-9_]+\/B[a-zA-Z0-9_]+\/[a-zA-Z0-9_]+\b/g,
        replacement: "[REDACTED_SLACK_WEBHOOK]"
      },
      // 5c-2. Slack API Tokens (Bot xoxb-, User xoxp-, App xapp-, Workspace xoxa-, Refresh xoxr-)
      {
        id: "SLACK_TOKEN",
        name: "Slack API Token",
        category: "CREDENTIALS",
        regex: /\bxox[baprs]-[0-9]{10,14}-[0-9]{10,14}[a-zA-Z0-9_-]*\b/g,
        replacement: "[REDACTED_SLACK_TOKEN]"
      },
      // 5d. Ethereum / EVM Wallet Address (0x...)
      {
        id: "EVM_CRYPTO_WALLET",
        name: "Ethereum EVM Wallet Address",
        category: "CREDENTIALS",
        regex: /\b(0x[a-fA-F0-9]{40})\b/g,
        replacement: "[REDACTED_CRYPTO_WALLET]"
      },
      // 5d-2. Bitcoin BTC Wallet Address (Bech32 bc1 & Base58 Legacy 1 or 3)
      {
        id: "BITCOIN_WALLET",
        name: "Bitcoin BTC Wallet Address",
        category: "CREDENTIALS",
        regex: /\b(bc1[a-z0-9]{25,60}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})\b/g,
        replacement: "[REDACTED_CRYPTO_WALLET]"
      },
      // 5d-3. Solana SOL Wallet Address (Base58, 32-44 chars)
      {
        id: "SOLANA_WALLET",
        name: "Solana SOL Wallet Address",
        category: "CREDENTIALS",
        regex: /\b([1-9A-HJ-NP-Za-km-z]{32,44})\b/g,
        validator: (raw, index, text) => {
          if (!text) return false;
          const start = Math.max(0, index - 80);
          const end = Math.min(text.length, index + raw.length + 80);
          const window = text.substring(start, end).toLowerCase();
          return /\b(?:sol|solana|phantom|wallet|address|dompet|transfer|crypto|token|pubkey)\b/.test(window);
        },
        replacement: "[REDACTED_CRYPTO_WALLET]"
      },
      // 5e. BIP-39 12/24-Word Recovery Mnemonic Seed Phrase
      {
        id: "BIP39_SEED_PHRASE",
        name: "BIP-39 Mnemonic Recovery Seed Phrase",
        category: "CREDENTIALS",
        regex: /(\b(?:seed|mnemonic|recovery(?:\s+phrase)?|bip-?39)[^:\n\r]*?[:=\-]?\s*)\b(?!(?:phrase|words?|are|was|were|is)\b)([a-z]{3,12}(?:[ \t]+[a-z]{3,12}){11,23})\b/gi,
        replacement: "$1[REDACTED_MNEMONIC_SEED_PHRASE]"
      },
      // 5f. Linux /etc/shadow Password Hashes
      {
        id: "LINUX_SHADOW_HASH",
        name: "Linux Shadow Password Hash",
        category: "CREDENTIALS",
        regex: /\$(?:1|2[aby]?|5|6)\$[a-zA-Z0-9_$./=-]+\$[a-zA-Z0-9./]{16,86}/g,
        replacement: "$6$rounds=4096$[REDACTED_PASSWORD_HASH]"
      },
      // 6. GitHub Personal Access Tokens
      {
        id: "GITHUB_TOKEN",
        name: "GitHub Access Token",
        category: "CREDENTIALS",
        regex: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{36,255}\b/g,
        replacement: "ghp_dummyPlaceholderTokenForTesting00000"
      },
      // 7. AWS Access Key IDs
      {
        id: "AWS_KEY",
        name: "AWS Access Key",
        category: "CREDENTIALS",
        regex: /\b(?:AKIA|ABIA|ACCA|ASIA)[0-9A-Z]{16}\b/g,
        replacement: "AKIAIOSFODNN7EXAMPLE"
      },
      // 8. JSON Web Tokens (JWT)
      {
        id: "JWT",
        name: "JSON Web Token",
        category: "CREDENTIALS",
        regex: /\beyJ[A-Za-z0-9-_=]+\.eyJ[A-Za-z0-9-_=]+\.[A-Za-z0-9-_.+/=]*\b/g,
        replacement: "[REDACTED_JWT_TOKEN]"
      },
      // 9. RSA/SSH/EC Private Keys (PEM blocks)
      {
        id: "PEM_PRIVATE_KEY",
        name: "Private Key Block",
        category: "CREDENTIALS",
        regex: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g,
        replacement: "-----BEGIN PRIVATE KEY-----\n[REDACTED_PRIVATE_KEY_BLOCK]\n-----END PRIVATE KEY-----"
      },
      // 10. Database Connection Strings (Postgres, MySQL, Mongo, Redis with passwords, supporting URL-encoded schemes)
      {
        id: "DATABASE_URI",
        name: "Database Credentials URI",
        category: "CREDENTIALS",
        regex: /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis)(?::\/\/|%3A%2F%2F)[^:\s'"]*:[^@\s'"]+@[^\s/:'"]+(?::\d+)?(?:\/[^\s'"]*)?/gi,
        replacement: "postgresql://postgres:placeholder_password@localhost:5432/sandbox_db"
      },
      // 10b. CLI Curl / Basic Auth Credentials (-u user:password)
      {
        id: "CLI_BASIC_AUTH",
        name: "CLI Basic Auth Credentials",
        category: "CREDENTIALS",
        regex: /(\b(?:curl[^\n]*?-u\s+|-u\s+))([A-Za-z0-9._-]+:[^\s]+)/gi,
        replacement: "$1[user]:[password]"
      },
      // 10c. HTTP Basic Authorization Header (Base64)
      {
        id: "HTTP_BASIC_AUTH_HEADER",
        name: "HTTP Basic Authorization Header",
        category: "CREDENTIALS",
        regex: /(\bAuthorization:\s*Basic\s+)([A-Za-z0-9+/=]{16,})/gi,
        replacement: "$1[REDACTED_BASE64_CREDENTIALS]"
      },
      // 10d. Environment Variables Secrets (AWS Secret Key, DB Passwords, API Tokens, etc.)
      {
        id: "ENV_CONFIG_SECRET",
        name: "Environment Variable Secret",
        category: "CREDENTIALS",
        regex: /\b((?:[A-Z0-9_]*(?:SECRET|PASSWORD|PASSWD|TOKEN|PRIVATE_KEY|API_KEY|ACCESS_KEY)|DATABASE_URL|DB_URL|AWS_SECRET_ACCESS_KEY|SECRET_ACCESS_KEY|API_SECRET|DB_PASS(?:WORD)?|PASSWORD|SECRET_KEY|AUTH_TOKEN|PRIVATE_KEY|APP_SECRET|CLIENT_SECRET)\s*=\s*)(?!\$\{[^}\n]+\}|\$[A-Za-z_]\w*)([^\s\r\n'"]{8,})/gi,
        replacement: "$1[REDACTED_SECRET]"
      },
      // 10d-2. Passwords on the command line: mysql -pSECRET / --password=SECRET, sshpass -p SECRET
      // ("mysql -p" with nothing after it asks for the password, so it isn't matched)
      {
        id: "CLI_PASSWORD_FLAG",
        name: "Password in a Command-Line Flag",
        category: "CREDENTIALS",
        regex: /(\b(?:(?:mysql|mysqldump|mysqladmin|mariadb)\b[^\n|;&]*?\s-p|sshpass\s+-p\s+|[^\s]*\s--password[= ]))('[^'\n]+'|"[^"\n]+"|[^\s'"]{4,})/g,
        replacement: "$1[REDACTED_PASSWORD]"
      },
      // 10d-3. Credentials inside a URL: https://user:TOKEN@host (git clone, database URLs)
      {
        id: "URL_CREDENTIALS",
        name: "Credentials in a URL",
        category: "CREDENTIALS",
        regex: /(\b[a-z][a-z0-9+.-]*:\/\/[^\s/:@]+:)([^\s@/]{4,})(@[^\s/]+)/gi,
        replacement: "$1[REDACTED_PASSWORD]$3"
      },
      // 10e. YAML Configuration Password & Secret Block
      {
        id: "YAML_CONFIG_SECRET",
        name: "YAML Config Secret Key",
        category: "CREDENTIALS",
        regex: /(^[ \t]*(?:password|passwd|secret|token|api_key|auth_token)\s*:\s*)([^\s\r\n'"]{6,})/gmi,
        replacement: "$1[REDACTED_SECRET]"
      },
      // One-time codes: "OTP 482913", "kode verifikasi: 4821", "verification code is 773190"
      {
        id: "OTP_CODE",
        name: "One-Time Password / Verification Code",
        category: "CREDENTIALS",
        regex: /\b((?:OTP|one[- ]time\s+(?:password|passcode|code)|verification\s+code|security\s+code|2FA\s+code|auth(?:entication)?\s+code|kode\s+(?:OTP|verifikasi|keamanan|akses|token))\s*(?:(?:is|adalah|kamu|saya|aku|nya)\s+)?[:=]?\s*)(\d{4,8})\b/gi,
        replacement: "$1[REDACTED_OTP]"
      },
      // 10f. Conversational Natural Language Password / Kata Sandi (Indonesian & English, JSON/XML, Logs)
      // Free-text form: at most 3 words between "password" and the value, and the value must look
      // like a password: introduced by "is"/"adalah"/":"/"=", or containing a digit or symbol and
      // not a hyphenated word ("m-banking") or an existing [PLACEHOLDER].
      {
        id: "CONVERSATIONAL_PASSWORD",
        name: "Password / Passcode Secret",
        category: "CREDENTIALS",
        regex: /(?:<password>([^<]+)<\/password>|(?:(?:56=PASS\^|PASS\^|PASS=|PWD=)([^\s|\r\n'"]{5,}))|["']?(?:(?:(?:root|admin|database|db|wifi|temporary|temp|default|user)\s+)?(?:password|passwd|passcode|kata_sandi|pw|pwd|pass))["']?\s*(?:[:=]|\bdiset\s+ke\b|\bdiset\s+menjadi\b|\bdiatur\s+ke\b|\bset\s+to\b|\bis\b|\badalah\b)\s*["']?([^\s\r\n'"]{5,})["']?|\b((?:(?:(?:my|the|our|temporary|temp|default|admin|root|wifi|staging|production|database|db)\s+)?(?:password|passwd|passcode|kata\s+sandi|kata_sandi|pw|pwd|pass)(?:\s+(?:for(?:\s+(?:my|the|our|your))?|to(?:\s+(?:the|my))?|of|in|on|at|my|the|our|your|email|account|user|login|username|staging|production|server|db|database|admin|root|akun|saya|ku|aku|gue|gw|kamu|mu|milik|wifi|hotspot|router|laptop|pc|komputer|hp|bank|m-?banking|atm|kartu|rekening|bca|mandiri|bri|bni|cimb|jenius|baru|lama|temp|temporary|default|adalah|is|yaitu|ialah|yakni|merupakan|berupa|nya)){0,3}\s*(?:adalah|is|yaitu|ialah|[:=])?\s+))((?:(?<=(?:\bis|\badalah|\byaitu|\bialah|[:=])\s{1,3})|(?![a-z]+(?:-[a-z]+)+\b)(?=[^\s'"\[\]]*(?:\d|[^\w\s'"\[\]](?=[^\s'"\[\]]))))[^\s\r\n'"\[\]]{5,})(?=\s|$|[)\]}>,;]))/gi,
        validator: (raw, index, text) => {
          if (!text) return true;
          const lineStart = Math.max(0, text.lastIndexOf("\n", index));
          const line = text.substring(lineStart, index).toLowerCase();
          if (/\b(?:def|function|class|import|const|let|var)\s+$/.test(line)) return false;
          const valueMatch = /^(?:[\s\S]*?(?:[:=]|\bdiset\s+ke\b|\bdiset\s+menjadi\b|\bdiatur\s+ke\b|\bset\s+to\b|\bis\b|\badalah\b)\s*["']?)([^"'\r\n]+?)(?:["']|[.,;!?]?\s*$)/i.exec(raw);
          const candidateValue = valueMatch ? valueMatch[1].trim() : raw.trim();
          if (/^(?:required|unchanged|confidential|valid|invalid|correct|incorrect|hidden|redacted|missing|secret|protected|secure|insecure|plaintext|temporary|optional|needed|set|reset)$/i.test(candidateValue)) return false;
          // "password:" with the value on a later line: only a secret-looking value (a digit or a
          // symbol), not the next line of prose ("…generated password:\n\nSuggested Wi-Fi password")
          if (/[:=][ \t]*\r?\n/.test(raw) && /^[\p{L}\s-]+$/u.test(candidateValue)) return false;
          return true;
        },
        extractToken: (match, raw) => {
          if (match[1]) return match[1];
          if (match[2]) return match[2];
          if (match[3]) return match[3];
          if (match[5]) return match[5];
          return raw;
        },
        replacement: (raw, matchIndex, text, match) => {
          if (match && match[4]) return `${match[4]}[REDACTED_PASSWORD]`;
          if (match && match[1]) return `<password>[REDACTED_PASSWORD]</password>`;
          if (match && match[2]) {
            const eqIdx = raw.indexOf("=");
            const hatIdx = raw.indexOf("^");
            const delimIdx = (eqIdx !== -1) ? eqIdx : hatIdx;
            const pfx = (delimIdx !== -1) ? raw.substring(0, delimIdx + 1) : "";
            return `${pfx}[REDACTED_PASSWORD]`;
          }
          if (match && match[3]) {
            const m = /^([\s\S]*?(?:[:=]|\bdiset\s+ke\b|\bdiset\s+menjadi\b|\bdiatur\s+ke\b|\bset\s+to\b|\bis\b|\badalah\b)\s*["']?)/i.exec(raw);
            const pfx = m ? m[1] : "";
            const suffix = (raw.endsWith('"') ? '"' : (raw.endsWith("'") ? "'" : ""));
            return `${pfx}[REDACTED_PASSWORD]${suffix}`;
          }
          return "[REDACTED_PASSWORD]";
        }
      },
      // 11. Physical Home / Street Address (Expanded for KTP/Domisili and structured forms)
      {
        id: "ADDRESS_ID",
        name: "Physical Home/Street Address",
        category: "PROFILE",
        regex: /\b((?:(?:alamat(?:\s+(?:ktp|domisili|saya|tinggal|rumah))?|(?:saya\s+)?tinggal\s+di|rumah(?:\s+saya)?\s+di|domisili(?:\s+di)?)(?:\s+di|\s+adalah|\s*:)?\s*))([A-Za-z0-9\s.,\/-]+?)(?=\s*[,;]?\s*(?:tolong|mohon|buatkan|rute|jadwal|bisa)\b|(?<!\b(?:jl|no|rt|rw|kel|kec|kp|gg|blok))\.[!?\s]|\s*(?:nomor\s+telfon|nomor\s+hp|no\s+hp|no\s+telp|telfon|telepon|hp|phone|email|nik|nim|npwp|paspor|passport|sim|bpjs|gaji|dan\s+nomor|dengan\s+nomor)\b|[\r\n]|$)/gi,
        validator: (raw) => {
          const physicalMarkers = /\b(?:jalan|jl\.?|gang|gg\.?|kampung|kp\.?|komplek|perumahan|dusun|desa|kelurahan|kecamatan|rt\s*\d+|rw\s*\d+|no(?:mor)?\s*\d+|blok\s*[a-z0-9]+)\b/i;
          const computingExclusions = /\b(?:memori|memory|fungsi|function|pointer|register|symbol|instruksi|instruction|hex|libc|gdb|binary|assembly|setcontext|ip|mac|url|socket)\b|&[a-zA-Z_]|0x[0-9a-fA-F]+/i;
          return physicalMarkers.test(raw) && !computingExclusions.test(raw);
        },
        replacement: "$1[REDACTED_ADDRESS]"
      },
      // 11b. English Residential / Shipping Address (US, UK, European & International Street Formats)
      {
        // "I'm at 1600 Pennsylvania Avenue NW": only a house number plus a street word, so
        // "I'm at work 9 hours a day" or "I'm at level 5" are not addresses
        id: "AT_STREET_ADDRESS", name: "Street address after \"I'm at\"", category: "PROFILE", valueGroup: 2,
        regex: /\b((?:i'?m|i[ \t]+am|we'?re|we[ \t]+are)[ \t]+at[ \t]+)(\d{1,6}[A-Za-z]?[ \t]+(?:\p{L}[\p{L}.'-]*[ \t]+){0,4}(?:Street|St|Avenue|Ave|Boulevard|Blvd|Road|Rd|Drive|Dr|Lane|Ln|Way|Court|Ct|Place|Pl|Parkway|Pkwy|Square|Sq)\b\.?(?:[ \t]+(?:NW|NE|SW|SE))?)/giu,
        replacement: "$1[REDACTED_ADDRESS]"
      },
      {
        id: "ENGLISH_PHYSICAL_ADDRESS",
        // The "street name + house number" branch stays within one sentence and 40 characters:
        // "I live in Bandung and work as a nurse. … born on 14" is not an address.
        name: "International Physical Street Address",
        category: "PROFILE",
        regex: /(?:<address>([^<]+)<\/address>|["']?(?:street_address|physical_address|billing_address|shipping_address|address)["']?[ \t]*[:=][ \t]*["']?([^"'\r\n]{10,120})["']?|\b((?:(?:(?:(?:my|our|home|residential|shipping|mailing|street|billing|physical|company|business|office)[ \t]+)?address(?:[ \t]+of[ \t]+[A-Za-z0-9._ \t-]+)?[ \t]*(?:is|was|[:=\-])?[ \t]*(?:to[ \t]+my[ \t]+residential[ \t]+address[ \t]*:[ \t]*)?|(?:(?:shipping|deliver(?:y|ing)?|ship|send|sent|dispatched)[ \t]+(?:(?:it|this|them|that|(?:the|my)[ \t]+\p{L}+)[ \t]+)?to[ \t]+)|(?:(?:[A-Za-z\p{L}]+(?:[ \t]+[A-Za-z\p{L}]+)?)[ \t]+)?(?:live[s]?|living|stay[s]?|staying|reside[s]?|residing)[ \t]+(?:at|in)[ \t]+|(?:(?:office|store|headquarters|facility|branch)[ \t]+is[ \t]+at[ \t]+))))[ \t]*((?:(?:Flat|Unit|Apt|Apartment|Suite|Block|Blk|Box|PSC)\.?[ \t]+[0-9A-Za-z#]+,?[ \t]*(?:[0-9]{1,5}[ \t]+)?|[0-9]{1,6}[A-Za-z]?[ \t]+)[A-Za-z0-9\p{L} \t.,\/-]+?\b(?:Street|St|Avenue|Ave|Boulevard|Blvd|Road|Rd|Drive|Dr|Lane|Ln|Way|Court|Ct|Terrace|Ter|Place|Pl|Circle|Cir|Parkway|Pkwy|Crescent|Cres|Grove|Walk|Hill|Square|Sq|Close|Cl|katu|tie|strasse|str|gatan|vej|weg|allee|calle|rue|via|avda|piazza|utca|u\.)\b(?:[A-Za-z0-9\p{L} \t.,\/-]*?(?:Singapore[ \t]+\d{6}|[A-Z]{2}[ \t]+\d{5}(?:-\d{4})?|[A-Z]{1,2}\d[A-Z\d]?[ \t]*\d[A-Z]{2}|\b\d{3}-\d{4}\b|\b(?:NSW|VIC|QLD|TAS|ACT)[ \t]+\d{4}\b|\b\d{5,6}\b(?:[ \t]+\p{L}[\p{L}-]+)?))?(?:(?:,[ \t]*(?!(?:please|thanks?|thank|help|now|today|tomorrow|tonight|and|but|so|then|ok|okay|pls|yes|no|indonesia|singapore|malaysia|japan|germany|france|india|australia|canada|netherlands|england|spain|italy|china|korea|united\s+(?:kingdom|states)|uk|usa|us)\b)\p{L}[\p{L}-]+(?:[ \t]+(?!(?:please|thanks?|thank|help|now|today|tomorrow|tonight|and|but|so|then|ok|okay|pls|yes|no|indonesia|singapore|malaysia|japan|germany|france|india|australia|canada|netherlands|england|spain|italy|china|korea|united\s+(?:kingdom|states)|uk|usa|us)\b)\p{L}[\p{L}-]+)?){1,2}(?:[ \t]+(?:NSW|VIC|QLD|TAS|ACT|[A-Z]{2})[ \t]+\d{4,5})?(?=[ \t]*(?:[.;!?()]|\r?\n|$)))?|(?:(?![.!?][ \t]|\b(?:and|but|that|which|who|whose|has|have|had|is|are|was|were|with|because|so|or|then|than)\b)[A-Za-z\p{L} .-]){1,40}?[ \t]+\d+[a-zA-Z]?(?:[A-Za-z0-9\p{L} \t.,\/-]*?\b(?:Apt|Apartment|Suite|Unit|Box|PSC)\.?[ \t]+[0-9A-Za-z#]+)?(?:[A-Za-z0-9\p{L} \t.,\/-]*?(?:Singapore[ \t]+\d{6}|[A-Z]{2}[ \t]+\d{5}(?:-\d{4})?|[A-Z]{1,2}\d[A-Z\d]?[ \t]*\d[A-Z]{2}|\b\d{3}-\d{4}\b|\b(?:NSW|VIC|QLD|TAS|ACT)[ \t]+\d{4}\b|\b\d{5,6}\b(?:[ \t]+\p{L}[\p{L}-]+)?))?(?:(?:,[ \t]*(?!(?:please|thanks?|thank|help|now|today|tomorrow|tonight|and|but|so|then|ok|okay|pls|yes|no|indonesia|singapore|malaysia|japan|germany|france|india|australia|canada|netherlands|england|spain|italy|china|korea|united\s+(?:kingdom|states)|uk|usa|us)\b)\p{L}[\p{L}-]+(?:[ \t]+(?!(?:please|thanks?|thank|help|now|today|tomorrow|tonight|and|but|so|then|ok|okay|pls|yes|no|indonesia|singapore|malaysia|japan|germany|france|india|australia|canada|netherlands|england|spain|italy|china|korea|united\s+(?:kingdom|states)|uk|usa|us)\b)\p{L}[\p{L}-]+)?){1,2}(?:[ \t]+(?:NSW|VIC|QLD|TAS|ACT|[A-Z]{2})[ \t]+\d{4,5})?(?=[ \t]*(?:[.;!?()]|\r?\n|$)))?|\d{1,4}(?:-\d{1,4}){1,3}[ \t]+[\p{L} ,.-]{2,60}?\b\d{3}-\d{4}\b|(?:PSC[ \t]+\d+,[ \t]*Box[ \t]+\d+|PO[ \t]+Box[ \t]+\d+)[A-Za-z0-9 \t.,\/-]+))/giu,
        validator: (raw, index, text) => {
          if (/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}(?:\/\d{1,2})?\b/.test(raw)) return false;
          if (text && Number.isInteger(index)) {
            const lead = text.slice(Math.max(0, index - 40), index) + raw.slice(0, Math.max(0, raw.search(/address/i)));
            if (/\b(?:ip|ipv[46]|mac|e-?mail|broadcast|network|subnet|gateway|bitcoin|btc|eth(?:ereum)?|wallet|crypto|web|server|host|wi-?fi|memory|return|base|loopback|multicast|hardware|ip\s*v[46])\s*$/i.test(lead)) return false;
            if (/^[.:][0-9a-f]/i.test(text.slice(index + raw.length, index + raw.length + 2))) return false;
          }
          const computingExclusions = /\b(?:memori|memory|fungsi|function|pointer|register|symbol|instruksi|instruction|hex|libc|gdb|binary|assembly|setcontext|ip|mac|url|socket)\b|&[a-zA-Z_]|0x[0-9a-fA-F]+/i;
          return !computingExclusions.test(raw);
        },
        extractToken: (match, raw) => {
          if (match[1]) return match[1];
          if (match[2]) return match[2];
          if (match[4]) return match[4];
          return raw;
        },
        replacement: (raw) => {
          const m = /^([^<"']*(?:<address>|["']?(?:street_address|physical_address|billing_address|shipping_address|address)["']?\s*[:=]\s*["']?|(?:(?:(?:my|our|home|residential|shipping|mailing|street|billing|physical|company|business|office)\s+)?address(?:\s+of\s+[A-Za-z0-9._\s-]+)?\s*(?:is|was|[:=\-])?\s*(?:to\s+my\s+residential\s+address\s*:\s*)?|(?:(?:shipping|deliver(?:y|ing)?|ship|send|sent|dispatched)\s+(?:(?:it|this|them|that|(?:the|my)\s+\p{L}+)\s+)?to\s+)|(?:(?:[A-Za-z\p{L}]+(?:\s+[A-Za-z\p{L}]+)?)\s+)?(?:lives?|staying?|resides?)\s+(?:at|in)\s+|(?:(?:office|store|headquarters|facility|branch)\s+is\s+at\s+))\s*))/iu.exec(raw);
          const prefix = m ? m[1] : "";
          const suffix = raw.endsWith("</address>") ? "</address>" : (raw.endsWith('"') ? '"' : (raw.endsWith("'") ? "'" : ""));
          return `${prefix}[REDACTED_ADDRESS]${suffix}`;
        }
      },
      // 12. Indonesian Tax ID (NPWP - 15/16 digits formatted or raw)
      {
        id: "ID_NPWP",
        name: "Indonesian Tax ID (NPWP)",
        category: "GOV_ID",
        regex: /\b((?:npwp(?:\s+pribadi|\s+badan)?\s*[:=\-]?\s*)?)(\d{2}\.\d{3}\.\d{3}\.\d{1}-\d{3}\.\d{3})\b/gi,
        replacement: "$1[REDACTED_NPWP]"
      },
      // 13. Indonesian & International Passport (Paspor RI / US / UK / Global Alphanumeric, JSON/XML)
      {
        id: "PASSPORT_NUMBER",
        name: "Passport Number",
        category: "GOV_ID",
        regex: /(?:<passport>([^<]+)<\/passport>|["']?passport(?:_number)?["']?\s*[:=]\s*["']?([A-Z0-9]{6,14})["']?|\b((?:(?:nomor\s+)?paspor(?:\s+ri)?|(?:us|uk|international)?\s*passport(?:\s*(?:#|id|number|no\.?))?)\s*(?:is|was|saya|ku|Anda|kamu|[:=\-~])*\s*)([A-Z0-9]{2,4}[0-9]{4,8}|[A-Z]\d{7,9}|\d{9})\b)/gi,
        replacement: (raw) => {
          const m = /^([^A-Z0-9<"']*(?:<passport>|["']?passport(?:_number)?["']?\s*[:=]\s*["']?|(?:(?:nomor\s+)?paspor(?:\s+ri)?|(?:us|uk|international)?\s*passport(?:\s*(?:#|id|number|no\.?))?)\s*(?:is|was|saya|ku|Anda|kamu|[:=\-~])*\s*))/i.exec(raw);
          const prefix = m ? m[1] : "";
          const suffix = raw.endsWith("</passport>") ? "</passport>" : (raw.endsWith('"') ? '"' : (raw.endsWith("'") ? "'" : ""));
          return `${prefix}[REDACTED_PASSPORT]${suffix}`;
        }
      },
      // 14. BPJS Kesehatan & Ketenagakerjaan (11-13 digits)
      {
        id: "ID_BPJS",
        name: "BPJS Health & Employment ID",
        category: "GOV_ID",
        regex: /\b((?:(?:nomor\s+)?bpjs(?:\s+kesehatan|\s+ketenagakerjaan|\s+tk)?)\s*[:=\-]?\s*)(\d{11,13})\b/gi,
        replacement: "$1[REDACTED_BPJS]"
      },
      // 15. Indonesian Driving License (SIM A/C - 12 digits)
      {
        id: "ID_SIM",
        name: "Indonesian Driver License (SIM)",
        category: "GOV_ID",
        regex: /\b((?:(?:nomor\s+)?sim(?:\s+[a-c])?)\s*[:=\-]?\s*)(\d{12})\b/gi,
        replacement: "$1[REDACTED_SIM]"
      },
      // 15b. International Driver's License (US State, UK, Global, JSON/XML)
      {
        id: "DRIVER_LICENSE",
        name: "Driver License",
        category: "GOV_ID",
        regex: /(?:<driver_license>([^<]+)<\/driver_license>|["']?(?:driver_license|drivers_license|driver_licence|driving_licence|dl)["']?\s*[:=]\s*["']?([A-Z0-9.-]{6,25})["']?|\b((?:(?:driver'?s?\s*(?:license|licence)|driving\s*licence|dl)\s*(?:#|id|number|no\.?)?)\s*(?:is|was|[:=\-~])*\s*)([A-Z0-9]{1,6}[- .]?[A-Z0-9]{3,10}(?:[- .][A-Z0-9]{1,8})*|[0-9]{6,18})\b)/gi,
        replacement: (raw) => {
          const m = /^([^A-Z0-9<"']*(?:<driver_license>|["']?(?:driver_license|drivers_license|driver_licence|driving_licence|dl)["']?\s*[:=]\s*["']?|(?:(?:driver'?s?\s*(?:license|licence)|driving\s*licence|dl)\s*(?:#|id|number|no\.?)?)\s*(?:is|was|[:=\-~])*\s*))/i.exec(raw);
          const prefix = m ? m[1] : "";
          const suffix = raw.endsWith("</driver_license>") ? "</driver_license>" : (raw.endsWith('"') ? '"' : (raw.endsWith("'") ? "'" : ""));
          return `${prefix}[REDACTED_DRIVER_LICENSE]${suffix}`;
        }
      },
      // 15c. International National Identity Card / Citizen ID
      {
        id: "NATIONAL_ID_CARD",
        name: "National Identity Card",
        category: "GOV_ID",
        regex: /(?:<national_id>([^<]+)<\/national_id>|["']?(?:national_id|national_identity|citizen_id|resident_id|identity_card|verificationProcess|verification_process|id_number)["']?\s*[:=]\s*["']?([A-Z0-9]{5,20})["']?|\b((?:(?:national|citizen|resident|identity|id)\s+(?:card|number|no\.?|id|#))\s*(?:is|was|[:=\-~])*\s*)([A-Z0-9]{1,4}[- ]?[A-Z0-9]{5,12})\b)/gi,
        replacement: (raw) => {
          const m = /^([^A-Z0-9<"']*(?:<national_id>|["']?(?:national_id|national_identity|citizen_id|resident_id|identity_card|verificationProcess|verification_process|id_number)["']?\s*[:=]\s*["']?|(?:(?:national|citizen|resident|identity|id)\s+(?:card|number|no\.?|id|#))\s*(?:is|was|[:=\-~])*\s*))/i.exec(raw);
          const prefix = m ? m[1] : "";
          const suffix = raw.endsWith("</national_id>") ? "</national_id>" : (raw.endsWith('"') ? '"' : (raw.endsWith("'") ? "'" : ""));
          return `${prefix}[REDACTED_NATIONAL_ID]${suffix}`;
        }
      },
      // 16. Academic & Student Identification (NIM, NPM, NRP, Student ID)
      {
        id: "STUDENT_ID",
        name: "Student ID / Academic NIM",
        category: "GOV_ID",
        regex: /\b((?:nim|npm|nrp|no\.?\s*mahasiswa|student\s*id|nomor\s*induk\s*mahasiswa)\s*[:=\-]?\s*)([0-9]{8,14})\b/gi,
        replacement: "$1[REDACTED_NIM]"
      },
      // 16b. UK National Insurance Number (NINO)
      {
        id: "UK_NINO",
        name: "UK National Insurance Number (NINO)",
        category: "GOV_ID",
        regex: /\b((?:(?:nino|national\s+insurance(?:\s+number)?)\s*[:=\-~]?\s*|(?<=\b)))([A-CEGHJ-PR-TW-Z][A-CEGHJ-NPR-TW-Z]\s*\d{2}\s*\d{2}\s*\d{2}\s*[A-D])\b/gi,
        replacement: "$1[REDACTED_NINO]"
      },
      // 16c. Canadian Social Insurance Number (SIN)
      {
        id: "CA_SIN",
        name: "Canadian Social Insurance Number (SIN)",
        category: "GOV_ID",
        regex: /\b((?:(?:sin|social\s+insurance(?:\s+number)?)\s*[:=\-~]?\s*|(?<=\b)))(\d{3}[-\s]\d{3}[-\s]\d{3})\b/gi,
        validator: (raw, index, text) => {
          if (!text) return true;
          if (/\d[\s-]?$/.test(text.slice(Math.max(0, index - 2), index))) return false;
          const window = text.substring(Math.max(0, index - 60), Math.min(text.length, index + raw.length + 60)).toLowerCase();
          return /\b(?:sin|social\s+insurance|cra|canada|canadian|tax|resident)\b/.test(window);
        },
        replacement: "$1[REDACTED_SIN]"
      },
      // 16d. Indian Aadhaar Number (12 digits)
      {
        id: "IN_AADHAAR",
        name: "Indian Aadhaar Number",
        category: "GOV_ID",
        regex: /\b((?:(?:aadhaar|uidai|adhaar)(?:\s+(?:number|card))?\s*[:=\-~]?\s*|(?<=\b)))([2-9]\d{3}[-\s]\d{4}[-\s]\d{4})\b/gi,
        validator: (raw, index, text) => {
          if (!text) return true;
          const window = text.substring(Math.max(0, index - 60), Math.min(text.length, index + raw.length + 60)).toLowerCase();
          return /\b(?:aadhaar|uidai|adhaar|india|indian|resident|citizen|kyc)\b/.test(window);
        },
        replacement: "$1[REDACTED_AADHAAR]"
      },
      // 16e. Indian Permanent Account Number (PAN)
      {
        id: "IN_PAN",
        name: "Indian PAN Card Number",
        category: "GOV_ID",
        regex: /\b((?:(?:pan(?:\s+(?:card|number))?)\s*[:=\-~]?\s*|(?<=\b)))([A-Z]{5}[0-9]{4}[A-Z])\b/gi,
        validator: (raw, index, text) => {
          if (!text) return true;
          const window = text.substring(Math.max(0, index - 60), Math.min(text.length, index + raw.length + 60)).toLowerCase();
          return /\b(?:pan|income\s+tax|tax\s+filing|kyc|india|indian)\b/.test(window);
        },
        replacement: "$1[REDACTED_PAN]"
      },
      // 16f. Singapore NRIC / FIN
      {
        id: "SG_NRIC",
        name: "Singapore NRIC / FIN",
        category: "GOV_ID",
        regex: /\b((?:(?:nric|fin)(?:\s+(?:number|id))?\s*[:=\-~]?\s*|(?<=\b)))([STFGMS]\d{7}[A-Z])\b/gi,
        replacement: "$1[REDACTED_NRIC]"
      },
      // 16g. Brazilian CPF
      {
        id: "BR_CPF",
        name: "Brazilian CPF",
        category: "GOV_ID",
        regex: /\b((?:(?:cpf)\s*[:=\-~]?\s*|(?<=\b)))(\d{3}\.\d{3}\.\d{3}-\d{2})\b/gi,
        replacement: "$1[REDACTED_CPF]"
      },
      // 16h. Spanish DNI / NIE
      {
        id: "ES_DNI",
        name: "Spanish DNI / NIE",
        category: "GOV_ID",
        regex: /\b((?:(?:dni|nie)\s*[:=\-~]?\s*|(?<=\b)))(\d{8}[A-HJ-NP-TV-Z]|[XYZ]\d{7}[A-HJ-NP-TV-Z])\b/gi,
        replacement: "$1[REDACTED_DNI]"
      },
      // 16i. Italian Codice Fiscale
      {
        id: "IT_CODICE_FISCALE",
        name: "Italian Codice Fiscale",
        category: "GOV_ID",
        regex: /\b((?:(?:codice\s+fiscale)\s*[:=\-~]?\s*|(?<=\b)))([A-Z]{6}\d{2}[A-EHLMPR-T]\d{2}[A-Z]\d{3}[A-Z])\b/gi,
        replacement: "$1[REDACTED_TAX_ID]"
      },
      // 16j. UK Bank Sort Code (6 digits)
      {
        id: "UK_SORT_CODE",
        name: "UK Bank Sort Code",
        category: "CREDENTIALS",
        regex: /\b((?:(?:sort\s+code)\s*[:=\-~]?\s*))(\d{2}[-\s]\d{2}[-\s]\d{2})\b/gi,
        replacement: "$1[REDACTED_SORT_CODE]"
      },
      // 16k. Indian IFSC Banking Code
      {
        id: "IN_IFSC",
        name: "Indian IFSC Code",
        category: "CREDENTIALS",
        regex: /\b((?:(?:ifsc(?:\s+code)?)\s*[:=\-~]?\s*))([A-Z]{4}0[A-Z0-9]{6})\b/gi,
        replacement: "$1[REDACTED_IFSC]"
      },
      // 16l. Australian BSB Code
      {
        id: "AU_BSB",
        name: "Australian BSB Banking Code",
        category: "CREDENTIALS",
        regex: /\b((?:(?:bsb(?:\s+number|\s+code)?)\s*[:=\-~]?\s*))(\d{3}[-\s]\d{3})\b/gi,
        replacement: "$1[REDACTED_BSB]"
      },
      // 16m. UK NHS Number (Healthcare Patient ID)
      {
        id: "UK_NHS",
        name: "UK NHS Number",
        category: "HEALTH",
        regex: /\b((?:(?:nhs(?:\s+number)?)\s*[:=\-~]?\s*))(\d{3}[-\s]?\d{3}[-\s]?\d{4})\b/gi,
        replacement: "$1[REDACTED_HEALTH_ID]"
      },
      // 16n. US Hospital Medical Record Number (MRN)
      {
        id: "US_MRN",
        name: "Medical Record Number (MRN)",
        category: "HEALTH",
        regex: /\b((?:(?:mrn|medical\s+record(?:\s+number)?|patient(?:\s+record)?\s+id)\s*[:=\-~]?\s*))([A-Za-z0-9]{6,12})\b/gi,
        replacement: "$1[REDACTED_HEALTH_ID]"
      },
      // 16o. GitHub Fine-Grained Personal Access Token
      {
        id: "GITHUB_FINE_GRAINED",
        name: "GitHub Fine-Grained Token",
        category: "CREDENTIALS",
        regex: /\b(github_pat_[A-Za-z0-9_]{60,100})\b/g,
        replacement: "[REDACTED_GITHUB_TOKEN]"
      },
      // 16p. Telegram Bot API Token
      {
        id: "TELEGRAM_BOT_TOKEN",
        name: "Telegram Bot API Token",
        category: "CREDENTIALS",
        regex: /\b(\d{8,10}:[A-Za-z0-9_-]{35})\b/g,
        replacement: "[REDACTED_TELEGRAM_TOKEN]"
      },
      // 16q. Date of Birth (DoB) - International & Indonesian Formats
      {
        id: "ID_DOB",
        name: "Date of Birth (DoB)",
        category: "PROFILE",
        regex: /\b((?:(?:date\s+of\s+birth|dob|born\s+on|birth\s*date|tanggal\s+lahir|tgl\s+lahir|lahir(?:\s+tanggal|\s+pada)?)\s*(?:is|\s*[:=\-~])?\s*))(\d{4}[-/.]\d{2}[-/.]\d{2}|\d{1,2}[-/.]\d{1,2}[-/.]\d{4}|(?:(?:\d{1,2}\s+(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)|Januari|Februari|Maret|April|Mei|Juni|Juli|Agustus|September|Oktober|November|Desember))|(?:(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember))\s+\d{1,2}(?:th|st|nd|rd)?)),?\s+\d{4})\b/gi,
        replacement: "$1[REDACTED_DOB]"
      },
      // 16q-2. Bare birth dates: date formats WITHOUT an explicit keyword only count when a
      // personal birth marker sits nearby ("My birthday is May 5 1998", "ulang tahun saya 5 Mei 1998").
      // Plain "meeting on 2026-01-05" is left alone.
      {
        id: "ID_DOB_BARE",
        name: "Date of Birth (bare, contextual)",
        category: "PROFILE",
        regex: /\b(\d{4}[-/.]\d{2}[-/.]\d{2}|\d{1,2}[-/.]\d{1,2}[-/.](?:19|20)\d{2}|\d{1,2}\s+(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)|Januari|Februari|Maret|April|Mei|Juni|Juli|Agustus|September|Oktober|November|Desember)\s+\d{4}|(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember))\s+\d{1,2}(?:th|st|nd|rd)?,?\s+\d{4})\b/gi,
        validator: (raw, index, text) => {
          if (!text) return false;
          const window = text.substring(Math.max(0, index - 60), index + raw.length + 20);
          return /(?:\bbirth(?:day|date)?\b|\bborn\b|\bdob\b|\blahir\b|ulang\stahun|kelahiran|tanggal\slahir)/i.test(window);
        },
        replacement: "[REDACTED_DOB]"
      },
      // 16r. Mother's Maiden Name (Knowledge-Based Authentication Question)
      {
        id: "ID_MOTHER_MAIDEN",
        name: "Mother's Maiden Name",
        category: "PROFILE",
        regex: /\b((?:(?:mother(?:\x27?s)?\s+maiden\s+name|nama\s+ibu\s+kandung)(?:\s+saya)?(?:\s+adalah|\s+is|\s*[:=\-~])?\s*))([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+){0,3}?)(?=\s+(?:and\b|is\b|born\b|living\b|from\b|was\b|di\b|dan\b|pada\b)|[,.;\n\r]|$)/gi,
        replacement: "$1[REDACTED_FAMILY_NAME]"
      },
      // 16s. Vehicle License Plates (Indonesian Police Numbers e.g. B 1829 XYZ, D 1234 AB)
      {
        id: "ID_PLATE_RI",
        name: "Indonesian Vehicle License Plate",
        category: "PROFILE",
        regex: /\b((?:(?:plat(?:\s+nomor|\s+mobil|\s+motor)?|nomor\s+polisi|nopol)\s*[:=\-~]?\s*|(?<=\b)))([A-Za-z]{1,2}\s+\d{1,4}\s+[A-Za-z]{1,3})\b/g,
        validator: (raw, matchIndex, text) => {
          // If preceded by a dash - or -- or / (e.g. -p 5432), it is a CLI flag or path, not a plate!
          if (matchIndex > 0 && /[-/]/.test(text[matchIndex - 1])) return false;

          const m = raw.trim().split(/\s+/);
          if (m.length < 3) return false;
          const plateTokens = m.slice(-3);
          const validPrefixes = new Set([
            "A","B","D","E","F","G","H","K","L","M","N","P","R","S","T",
            "AA","AB","AD","AE","AG","BA","BB","BD","BE","BG","BH","BK",
            "BL","BM","BN","BP","DA","KB","KH","KT","KU","DB","DC","DD",
            "DE","DG","DH","DK","DM","DN","DT","DW","PA","PB"
          ]);
          if (!validPrefixes.has(plateTokens[0].toUpperCase())) return false;

          const hasContext = m.length > 3 || /(?:plat(?:\s+nomor|\s+mobil|\s+motor)?|nomor\s+polisi|nopol)\s*[:=\-~]?\s*$/i.test(text.substring(Math.max(0, matchIndex - 30), matchIndex));
          if (!hasContext) {
            // Without explicit context, the code and suffix MUST be uppercase
            if (plateTokens[0] !== plateTokens[0].toUpperCase() || plateTokens[2] !== plateTokens[2].toUpperCase()) return false;
            const commonWords = new Set([
              "IF","IN","TO","AT","BY","ON","OF","OR","IS","IT","AS","AN","AM","BE","DO","GO","HE","ME","MY","NO","SO","UP","WE",
              "FOR","AND","THE","NOT","CAN","OUT","NEW","SEE","RUN","APP","DEV","DB","GIT","SSH","KEY","API","LOG",
              "DI","KE","YG","DAN","INI","ITU","DARI","ADA","BISA","MAU","AKAN"
            ]);
            if (commonWords.has(plateTokens[2].toUpperCase())) return false;
          }
          return true;
        },
        replacement: "$1[REDACTED_LICENSE_PLATE]"
      },
      // 16t. US/International Vehicle License Plate
      {
        id: "US_PLATE",
        name: "US/International License Plate",
        category: "PROFILE",
        // At least one digit, so "Plate count method" is not a plate
        regex: /\b((?:(?:license\s+plate|plate(?:\s+number)?)\s*[:=\-~]?(?:\s*is)?\s*))((?=[A-Z]*\d)[A-Z0-9]{5,8})\b/gi,
        replacement: "$1[REDACTED_LICENSE_PLATE]"
      },
      // 16u. Vehicle Identification Number (VIN - 17 alphanumeric ISO 3779 standard)
      {
        id: "VEHICLE_VIN",
        name: "Vehicle Identification Number (VIN)",
        category: "PROFILE",
        regex: /\b((?:(?:vin|vehicle\s+identification(?:\s+number)?|nomor\s+rangka)\s*(?:is|\s*[:=\-~])?\s*))([A-HJ-NPR-Z0-9]{17})\b/gi,
        replacement: "$1[REDACTED_VIN]"
      },
      // 16v. Mobile Device IMEI (15-digit identifier with context)
      {
        id: "DEVICE_IMEI",
        name: "Mobile Device IMEI",
        category: "PROFILE",
        regex: /\b((?:(?:imei|device\s+id)\s*(?:is|\s*[:=\-~])?\s*))(\d{15})\b/gi,
        replacement: "$1[REDACTED_IMEI]"
      },
      // 16w. Network IPv6 Address (Full, Compressed, Local)
      {
        id: "NETWORK_IPV6",
        name: "IPv6 Network Address",
        category: "SYSTEM",
        regex: /\b(?:(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|(?:[0-9a-fA-F]{1,4}:){1,7}:|(?:[0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|(?:[0-9a-fA-F]{1,4}:){1,5}(?::[0-9a-fA-F]{1,4}){1,2}|(?:[0-9a-fA-F]{1,4}:){1,4}(?::[0-9a-fA-F]{1,4}){1,3}|(?:[0-9a-fA-F]{1,4}:){1,3}(?::[0-9a-fA-F]{1,4}){1,4}|(?:[0-9a-fA-F]{1,4}:){1,2}(?::[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:(?:(?::[0-9a-fA-F]{1,4}){1,6})|:(?:(?::[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(?::[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,})(?![0-9a-fA-F:])/gi,
        validator: (raw) => {
          // Exclude simple CSS or code structures
          return raw.includes(":") && raw.length >= 7;
        },
        replacement: "[REDACTED_IPV6]"
      },
      {
        // Telegram bot token: "123456789:AAH-…" (bot id, colon, 30+ character secret)
        id: "TELEGRAM_BOT_TOKEN", name: "Telegram bot token", category: "CREDENTIALS",
        regex: /\b\d{8,10}:[A-Za-z0-9_-]{30,50}(?![A-Za-z0-9_-])/g,
        replacement: "[REDACTED_TELEGRAM_TOKEN]"
      },
      {
        // Internal URLs and hostnames reveal a company's network: wiki.acmecorp.internal/…,
        // db-prod-01.corp.internal, jenkins.corp.local. System details: "Keep debug details" keeps them.
        id: "INTERNAL_URL", name: "Internal URL", category: "SYSTEM",
        regex: /\bhttps?:\/\/[A-Za-z0-9.-]+\.(?:internal|local|corp|lan|intranet|home\.arpa)(?::\d+)?(?:\/[^\s"'<>)]*[^\s"'<>),.;:!?])?/gi,
        replacement: "[REDACTED_INTERNAL_URL]"
      },
      {
        id: "INTERNAL_HOSTNAME", name: "Internal hostname", category: "SYSTEM",
        regex: /(?<![@\w.-])(?:[A-Za-z0-9-]+\.)+(?:internal|local|corp|lan|intranet|home\.arpa)\b(?![.-]\w)/gi,
        replacement: "[REDACTED_HOST]"
      },
      // 16x. Hardware MAC Address (Standard Colon, Dash, or Dot formats)
      {
        id: "HARDWARE_MAC",
        name: "Hardware MAC Address",
        category: "SYSTEM",
        regex: /\b(?:[0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}\b|\b(?:[0-9A-Fa-f]{4}\.){2}[0-9A-Fa-f]{4}\b/gi,
        replacement: "[REDACTED_MAC_ADDRESS]"
      },
      // 16y. Precision GPS Coordinates (Latitude & Longitude)
      {
        id: "GPS_COORDINATES",
        name: "Precision GPS Coordinates",
        category: "PROFILE",
        regex: /\b(?:(?:coordinates|coords|lat(?:itude)?|lokasi\s+gps)\s*[:=\-~]?\s*[-+]?\d{1,3}\.\d{4,8}\s*[,;\s]\s*(?:long(?:itude)?|lng)?\s*[:=\-~]?\s*[-+]?\d{1,3}\.\d{4,8}|lat\s*[-+]?\d{1,3}\.\d{4,8}\s*,\s*long\s*[-+]?\d{1,3}\.\d{4,8})\b/gi,
        replacement: "[REDACTED_GPS_COORDINATES]"
      },
      // 16z-1. Chinese Resident Identity Card (18 digits)
      {
        id: "CN_CITIZEN_ID",
        name: "Chinese National ID",
        category: "GOV_ID",
        regex: /\b((?:(?:citizen\s+id|resident\s+id|id\s+card|shenfenzheng)\s*[:=\-~]?\s*|(?<=\b)))(\d{6}(?:18|19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{3}[\dXx])\b/gi,
        validator: (raw, index, text) => {
          if (!text) return true;
          const window = text.substring(Math.max(0, index - 60), Math.min(text.length, index + raw.length + 60)).toLowerCase();
          return /\b(?:china|chinese|resident|citizen|shenfenzheng|prc|beijing|shanghai|shenzhen)\b/.test(window);
        },
        replacement: "$1[REDACTED_NATIONAL_ID]"
      },
      // 16z-2. Korean Resident Registration Number (RRN - 13 digits YYMMDD-1XXXXXX)
      {
        id: "KR_RRN",
        name: "Korean Resident Registration Number",
        category: "GOV_ID",
        regex: /\b((?:(?:rrn|resident\s+registration(?:\s+number)?)\s*[:=\-~]?\s*|(?<=\b)))(\d{6}[-\s][1-4]\d{6})\b/gi,
        replacement: "$1[REDACTED_NATIONAL_ID]"
      },
      // 16z-3. Japanese My Number (Individual Number - 12 digits)
      {
        id: "JP_MY_NUMBER",
        name: "Japanese My Number",
        category: "GOV_ID",
        regex: /\b((?:(?:my\s+number|individual\s+number)(?:\s*\([^)]*\))?\s*(?:is|\s*[:=\-~])?\s*))(\d{4}\s*\d{4}\s*\d{4})\b/gi,
        replacement: "$1[REDACTED_NATIONAL_ID]"
      },
      // 16z-4. Australian Tax File Number (TFN - 8-9 digits)
      {
        id: "AU_TFN",
        name: "Australian Tax File Number",
        category: "GOV_ID",
        regex: /\b((?:(?:tfn|tax\s+file\s+number)\s*(?:is|\s*[:=\-~])?\s*))(\d{3}\s*\d{3}\s*\d{2,3})\b/gi,
        replacement: "$1[REDACTED_TAX_ID]"
      },
      // 16z-5. Australian Medicare Number (10-11 digits)
      {
        id: "AU_MEDICARE",
        name: "Australian Medicare Number",
        category: "HEALTH",
        regex: /\b((?:(?:medicare(?:\s+(?:number|card))?)\s*(?:is|\s*[:=\-~])?\s*))([2-6]\d{3}\s*\d{5}\s*\d{1,2})\b/gi,
        replacement: "$1[REDACTED_HEALTH_ID]"
      },
      // 16z-6. Mexican CURP (18 characters)
      {
        id: "MX_CURP",
        name: "Mexican CURP ID",
        category: "GOV_ID",
        regex: /\b((?:(?:curp)\s*[:=\-~]?\s*|(?<=\b)))([A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z0-9]\d)\b/gi,
        replacement: "$1[REDACTED_NATIONAL_ID]"
      },
      // 16z-7. Mexican RFC Tax ID (12-13 characters)
      {
        id: "MX_RFC",
        name: "Mexican RFC Tax ID",
        category: "GOV_ID",
        regex: /\b((?:(?:rfc)\s*[:=\-~]?\s*|(?<=\b)))([A-Z]{3,4}\d{6}[A-Z0-9]{3})\b/gi,
        replacement: "$1[REDACTED_TAX_ID]"
      },
      // 17. Unix / Linux Terminal Shell Prompt (e.g. user@host:~/path$)
      {
        id: "TERMINAL_PROMPT",
        name: "Terminal Shell Prompt",
        category: "SYSTEM",
        regex: /((?:\([a-zA-Z0-9._-]+\)\s*)?)\b([a-zA-Z0-9._-]+)@([a-zA-Z0-9._-]+):([~/\w\s\p{L}.-]+)([\$#])/gu,
        replacement: "$1[user]@[host]:~/[sandbox_path]$5"
      },
      // 13. Kali Linux Modern Shell Prompt (┌──(user㉿host)-[~/path])
      {
        id: "KALI_TERMINAL_PROMPT",
        name: "Kali Linux Shell Prompt",
        category: "SYSTEM",
        regex: /┌──\(([a-zA-Z0-9._-]+)㉿([a-zA-Z0-9._-]+)\)-\[([~/\w\s\p{L}.-]*)\](?:\s*[\r\n]+\s*└─[\$#])?/gu,
        replacement: "┌──([user]㉿[host])-[~/[sandbox_path]]\n└─$"
      },
      // 14. Modern Zsh / Powerline Prompt (e.g. Mon 28 Sep - 18:24  ~  @jdoe_dev )
      {
        id: "POWERLINE_ZSH_PROMPT",
        name: "Powerline & Modern Zsh Prompt",
        category: "SYSTEM",
        regex: /(?:[A-Za-z]{3}\s+\d{1,2}\s+[A-Za-z]{3}\s+-\s+\d{1,2}:\d{2}\s*[\uE0B0-\uE0B3\s]*)?(?:~[\uE0B0-\uE0B3\s]*)?@([a-zA-Z0-9._-]+)(\s*[\uE0B0-\uE0B3])/gu,
        replacement: "@[user]$2"
      },
      // 15. macOS Default Terminal Prompt (user@host ~ %)
      {
        id: "MACOS_TERMINAL_PROMPT",
        name: "macOS Shell Prompt",
        category: "SYSTEM",
        regex: /\b([a-zA-Z0-9._-]+)@([a-zA-Z0-9._-]+)\s+([~/\w\s\p{L}.-]+)\s*%/gu,
        replacement: "[user]@[host] ~/[sandbox_path] %"
      },
      // 16. Windows PowerShell & CMD Prompt (PS C:\Users\user\path> or C:\Users\user\path>)
      {
        id: "WINDOWS_PROMPT",
        name: "Windows Shell Prompt",
        category: "SYSTEM",
        regex: /\b((?:PS\s+)?[A-Z]:\\Users\\)([a-zA-Z0-9._-]+)(\\[^>\n\r]*)?>/gi,
        replacement: "$1[user]$3>"
      },
      // 17. Git Commit Author Metadata (Author: user <email>)
      {
        id: "GIT_AUTHOR_TRACE",
        name: "Git Author Identity",
        category: "SYSTEM",
        regex: /\b(Author:\s*)([a-zA-Z0-9._\s-]+?)\s*<([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[A-Za-z]{2,})>/gi,
        replacement: "$1[User_A] <[user@protected.local]>"
      },
      // 18. SSH Public Key Identity Comment (ssh-ed25519 AAA... user@host)
      {
        id: "SSH_KEY_COMMENT",
        name: "SSH Key Identity Comment",
        category: "SYSTEM",
        regex: /\b(ssh-(?:ed25519|rsa|ecdsa|dss)\s+[A-Za-z0-9+/=]{32,}\s+)([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+)\b/g,
        replacement: "$1[user]@[host]"
      },
      // 19. Linux POSIX ID & whoami output (uid=1000(user) gid=1000(group))
      {
        id: "POSIX_ID_OUTPUT",
        name: "POSIX Identity Command Output",
        category: "SYSTEM",
        regex: /\b(uid=\d+\()([a-zA-Z0-9._-]+)(\)\s+gid=\d+\()([a-zA-Z0-9._-]+)(\)(?:\s+groups=[\d(),a-zA-Z0-9._-]+)?)/g,
        replacement: "$1[user]$3[group]) groups=1000([group])"
      },
      // 20. Shell output for whoami and USER environment variable
      {
        id: "WHOAMI_USER_OUTPUT",
        name: "Whoami or USER Command Output",
        category: "SYSTEM",
        // Case-sensitive: $USER is the shell variable, $user is a PHP/Perl variable
        regex: /((?:\b[Ww][Hh][Oo][Aa][Mm][Ii]|\$USER)(?:\s*[:=>\->]+\s*|\s+))([a-zA-Z0-9._-]+)\b/g,
        replacement: "$1[user]"
      },
      // 21. Internal Hostname user@host (Non-TLD, developer handles)
      {
        id: "UNIX_USER_HOST",
        name: "Internal User & Hostname",
        category: "SYSTEM",
        // Host must contain a letter: CSS "wght@400" or "pkg@1" are not user@host
        regex: /\b([a-zA-Z0-9._-]+)@([a-zA-Z0-9_-]*[a-zA-Z][a-zA-Z0-9_-]*)(?!\.[a-zA-Z]{2,})\b/g,
        // Only in technical context; in prose "meet me@5pm", "me@home", "hello@world" are not logins.
        // Counts as technical: a remote-login command before it on the same line (ssh, scp, git …),
        // a path right after it (scp user@host:/path), or a host that looks like a machine name
        // (localhost, web-01, db01).
        validator: (raw, index, text) => {
          if (!text) return true;
          const prev = text[index - 1], next = text[index + raw.length];
          if ((prev && !/[\s"'`(\[<,;=:]/.test(prev)) || (next && /[!#$%^&*+=~]/.test(next))) return false;
          const host = raw.slice(raw.indexOf("@") + 1);
          const lineStart = text.lastIndexOf("\n", index) + 1;
          const before = text.slice(lineStart, index);
          return /\b(?:ssh|scp|sftp|rsync|mosh|telnet|ftp|git|ansible|login|sudo|su|psql|mysql|kubectl|docker)\b/i.test(before) ||
            text[index + raw.length] === ":" ||
            /^(?:localhost|[a-z][a-z0-9]*(?:-[a-z0-9]+)*-?\d+[a-z0-9-]*)$/i.test(host);
        },
        replacement: "[user]@[host]"
      },
      // 21b. Address at a big mail provider with the ".com" left off ("email me at john@gmail")
      {
        id: "EMAIL_NO_TLD",
        name: "Email Address (provider without domain ending)",
        category: "PROFILE",
        regex: /\b[a-zA-Z0-9._%+-]+@(?:gmail|googlemail|yahoo|ymail|outlook|hotmail|live|icloud|proton(?:mail)?)\b(?!\.[a-zA-Z])/gi,
        replacement: "[REDACTED_EMAIL]"
      },
      // 22. User Home Directory Paths (Linux / macOS / Windows)
      {
        id: "USER_HOME_PATH",
        name: "User Home Directory Path",
        category: "SYSTEM",
        regex: /(?:\/home\/|~\/|\/Users\/|[A-Z]:\\Users\\)[a-zA-Z0-9._-]+(?:\/[a-zA-Z0-9_\-.\s\p{L}]+)*/gu,
        replacement: "~/[sandbox_path]"
      }
    ];
  }

  /**
   * Calculates Shannon Entropy of a string to detect high-entropy secrets (passwords, tokens).
   */
  shannonEntropy(str) {
    if (!str || str.length === 0) return 0;
    const freqs = {};
    for (let char of str) {
      freqs[char] = (freqs[char] || 0) + 1;
    }
    let entropy = 0;
    const len = str.length;
    for (let char in freqs) {
      const p = freqs[char] / len;
      entropy -= p * Math.log2(p);
    }
    return entropy;
  }

  validateSSN(val) {
    if (!val) return false;
    const parts = val.split("-");
    if (parts.length !== 3) return false;
    const area = parseInt(parts[0], 10);
    const group = parseInt(parts[1], 10);
    const serial = parseInt(parts[2], 10);
    if (isNaN(area) || isNaN(group) || isNaN(serial)) return false;
    if (area === 0 || area === 666) return false;
    if (group === 0) return false;
    if (serial === 0) return false;
    return true;
  }

  validateRouting(val) {
    if (!val) return false;
    const digits = val.replace(/\D/g, "");
    if (digits.length !== 9) return false;
    const d = digits.split("").map(Number);
    const checksum = (3 * (d[0] + d[3] + d[6]) + 7 * (d[1] + d[4] + d[7]) + 1 * (d[2] + d[5] + d[8])) % 10;
    return checksum === 0;
  }

  validateIBAN(val) {
    if (!val) return false;
    const clean = val.replace(/[\s-]/g, "").toUpperCase();
    if (clean.length < 15 || clean.length > 34) return false;
    const validCountries = new Set([
      "AL", "AD", "AT", "AZ", "BH", "BY", "BE", "BA", "BR", "BG", "CR", "HR", "CY", "CZ", "DK", "DO",
      "EG", "EE", "FO", "FI", "FR", "GE", "DE", "GI", "GR", "GL", "GT", "HU", "IS", "IQ", "IE", "IL",
      "IT", "JO", "KZ", "XK", "KW", "LV", "LB", "LI", "LT", "LU", "MT", "MR", "MU", "MD", "MC", "ME",
      "NL", "MK", "NO", "PK", "PS", "PL", "PT", "QA", "RO", "LC", "SM", "ST", "SA", "RS", "SC", "SK",
      "SI", "ES", "SD", "SE", "CH", "TL", "TN", "TR", "UA", "AE", "GB", "VA", "VG"
    ]);
    const country = clean.substring(0, 2);
    if (!validCountries.has(country)) return false;

    const rearranged = clean.substring(4) + clean.substring(0, 4);
    let numStr = "";
    for (let i = 0; i < rearranged.length; i++) {
      const code = rearranged.charCodeAt(i);
      if (code >= 65 && code <= 90) {
        numStr += (code - 55).toString();
      } else if (code >= 48 && code <= 57) {
        numStr += rearranged[i];
      } else {
        return false;
      }
    }
    let remainder = 0;
    for (let i = 0; i < numStr.length; i += 7) {
      const chunk = remainder.toString() + numStr.substring(i, i + 7);
      remainder = parseInt(chunk, 10) % 97;
    }
    return remainder === 1;
  }

  /**
   * Validates credit card number with Luhn formula.
   */
  luhnCheck(val) {
    const sanitized = val.replace(/\D/g, "");
    if (sanitized.length < 13 || sanitized.length > 19) return false;
    let sum = 0;
    let shouldDouble = false;
    for (let i = sanitized.length - 1; i >= 0; i--) {
      let digit = parseInt(sanitized.charAt(i), 10);
      if (shouldDouble) {
        digit *= 2;
        if (digit > 9) digit -= 9;
      }
      sum += digit;
      shouldDouble = !shouldDouble;
    }
    return sum % 10 === 0;
  }

  hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash |= 0;
    }
    return hash;
  }

  /**
   * Normalizes Unicode NFKC and maps Cyrillic/Greek lookalikes (homoglyphs) to Latin ASCII.
   * Defeats Unicode homoglyph spoofing and fullwidth/bold evasion attacks.
   */
  normalizeHomoglyphs(text) {
    if (!text || typeof text !== "string") return "";
    // Step 1: Strip invisible evasion markers: zero-width and joiners, soft hyphen, bidi controls
    // (U+202A-202E, U+2066-2069, LRM/RLM) and Unicode tag characters (U+E0000-E007F, "ASCII
    // smuggling"). Any of them inside "sk-proj-…" or a NIK used to hide it from every rule.
    let s = text.replace(/[\u200B-\u200F\uFEFF\u00AD\u2060-\u2064\u180E\u202A-\u202E\u2066-\u2069]|[\u{E0000}-\u{E007F}]/gu, "");
    // Step 2: Unicode NFKC Canonical Decomposition & Compatibility Composition
    s = s.normalize("NFKC");
    // Step 3: Cyrillic / Greek confusable character mapping to Latin ASCII
    const confusableMap = {
      "\u0410": "A", "\u0412": "B", "\u0421": "C", "\u0415": "E", "\u041D": "H",
      "\u0406": "I", "\u0408": "J", "\u041A": "K", "\u041C": "M", "\u041E": "O",
      "\u0420": "P", "\u0405": "S", "\u0422": "T", "\u0425": "X", "\u04AE": "Y",
      "\u0430": "a", "\u0441": "c", "\u0435": "e", "\u0456": "i", "\u0458": "j",
      "\u043A": "k", "\u043E": "o", "\u0440": "p", "\u0455": "s", "\u0445": "x",
      "\u0443": "y", "\u0391": "A", "\u0392": "B", "\u0395": "E", "\u0397": "H",
      "\u0399": "I", "\u039A": "K", "\u039C": "M", "\u039D": "N", "\u039F": "O",
      "\u03A1": "P", "\u03A4": "T", "\u03A7": "X", "\u03BF": "o"
    };
    return s.replace(/[\u0410-\u0458\u0391-\u03BF]/g, (ch) => confusableMap[ch] || ch);
  }

  /**
   * Removes invisible "ASCII smuggling" characters: Unicode tag characters (kept only inside a flag
   * emoji such as England's) and bidi override/isolate controls. They have no business in chat text
   * and can carry hidden instructions for an AI. This is the only change scan() makes to text
   * outside a detection.
   */
  stripSmuggled(text) {
    return String(text || "").replace(/(?<!\u{1F3F4}[\u{E0020}-\u{E007E}]*)[\u{E0000}-\u{E007F}]|[‪-‮⁦-⁩]/gu, "");
  }

  /**
   * normalizeHomoglyphs() one code point at a time, remembering where each output character came
   * from: start[i]/end[i] are the original text's offsets of the code point that produced output
   * character i. scan() matches rules on the normalised text and uses this to replace exactly the
   * matching original span, so text outside a match (Russian, Greek, emoji) is left as typed.
   */
  normalizeWithMap(text) {
    const start = [];
    const end = [];
    let out = "";
    for (let i = 0; i < text.length;) {
      const cp = text.codePointAt(i);
      const ch = String.fromCodePoint(cp);
      // Printable ASCII never changes; only other characters go through the full normalisation
      let piece = ch;
      if (cp < 0x20 || cp >= 0x7f) {
        this._normCache = this._normCache || new Map();
        piece = this._normCache.get(ch);
        if (piece === undefined) this._normCache.set(ch, (piece = this.normalizeHomoglyphs(ch)));
      }
      for (let k = 0; k < piece.length; k++) {
        start.push(i);
        end.push(i + ch.length);
      }
      out += piece;
      i += ch.length;
    }
    return { text: out, start, end };
  }

  /**
   * Scans and redacts deterministic secrets and PII from input text.
   * Returns: { sanitizedText, detections: [{ type, matched, offset, length }] }
   */
  scan(text, { labelDetection } = {}) {
    if (!text) return { sanitizedText: "", detections: [], baseText: "" };
    // Rules match on a normalised copy (look-alike letters, invisible characters, NFKC), so
    // "аlice@example.com" with a Cyrillic а is still caught. The output is built from the original
    // text (minus smuggling characters): detection offsets below are mapped back to it, and text
    // outside a detection is not touched. baseText is the text those offsets refer to.
    const baseText = this.stripSmuggled(text);
    const norm = this.normalizeWithMap(baseText);
    text = norm.text;
    let sanitizedText = baseText;
    const detections = [];

    for (const pattern of this.patterns) {
      let match;
      // Capture indices are native in supported Chrome/Firefox and Node 18+.
      const regex = new RegExp(pattern.regex.source, pattern.regex.flags.includes("d") ? pattern.regex.flags : pattern.regex.flags + "d");
      
      while ((match = regex.exec(text)) !== null) {
        if (pattern.id === "ENGLISH_PHYSICAL_ADDRESS" && match[2]) {
          const valueStart = match.indices[2][0];
          const quoted = /['"]/.test(text[valueStart - 1] || "");
          if (!quoted) {
            const stop = /[.!?](?=\s|$)|\s+(?:before|after|please)\b/i.exec(match[2]);
            if (stop) {
              match[2] = match[2].slice(0, stop.index);
              match.indices[2][1] = valueStart + stop.index;
              match[0] = text.slice(match.index, valueStart + stop.index);
            }
          }
        }
        const raw = match[0];
        if (pattern.id === "ENGLISH_PHYSICAL_ADDRESS" && /\[(?:have|enter|insert|your|REDACTED)[^\]]*\]/i.test(raw)) continue;
        if (pattern.validator && !pattern.validator(raw, match.index, text)) {
          continue;
        }
        // Purely numeric matches inside a URL or DOI are identifiers (doi.org/10.1128/..., /posts/123...),
        // except an IP that is the URL's host (http://36.72.150.11:53/, https://user@36.72.150.11)
        const isUrlHostIp = pattern.id === "IPV4_ADDRESS" && /(?:\/\/|@)$/.test(text.substring(Math.max(0, match.index - 2), match.index));
        if (!isUrlHostIp && /^[\d\s.\-\/]+$/.test(raw) && /(?:https?:\/\/|doi\.org\/|www\.)[^\s"\'<>]*$/i.test(text.substring(Math.max(0, match.index - 200), match.index))) {
          continue;
        }

        let repl;
        if (typeof pattern.replacement === "function") {
          repl = pattern.replacement(raw, match.index, text, match);
        } else if (typeof pattern.replacement === "string" && pattern.replacement.includes("$")) {
          repl = raw.replace(new RegExp(pattern.regex.source, pattern.regex.flags), pattern.replacement);
        } else {
          repl = pattern.replacement;
        }

        let secretToken;
        let secretGroup = pattern.valueGroup;
        if (pattern.valueGroup) {
          secretToken = match[pattern.valueGroup];
        } else if (typeof pattern.extractToken === "function") {
          secretToken = pattern.extractToken(match, raw);
        } else if (match.length > 2 && match[2]) {
          secretToken = match[2];
          secretGroup = 2;
        } else {
          let lastG = null;
          for (let g = match.length - 1; g >= 1; g--) {
            if (match[g] !== undefined) {
              lastG = match[g];
              secretGroup = g;
              break;
            }
          }
          secretToken = lastG || raw;
        }
        if (pattern.id === "CARD_SECURITY_CODE" && typeof secretToken === "string") {
          secretToken = secretToken.replace(/\D/g, "");
        }
        if (/^\[(?:REDACTED_|[A-Z][A-Z0-9_]*_\d+\])/.test(secretToken || "")) continue;

        // Never locate a capture with indexOf: its value may also occur in the label.
        const valueGroup = secretGroup || match.findIndex((s, i) => i > 0 && s === secretToken);
        const valueIndices = secretToken === raw ? match.indices[0] : match.indices[valueGroup];
        detections.push({
          type: pattern.id,
          name: pattern.name,
          category: pattern.category || "GENERAL",
          raw: raw,
          secretToken: secretToken,
          replacement: repl,
          index: match.index,
          length: raw.length,
          valueStart: valueIndices ? valueIndices[0] : null,
          valueEnd: valueIndices ? valueIndices[1] : null,
          source: "heuristic",
          reason: pattern.name
        });
      }
    }

    // Map each detection from the normalised text back to the original span it came from
    for (const det of detections) {
      if (!det.length) continue;
      const from = norm.start[det.index];
      const to = norm.end[det.index + det.length - 1];
      if (from === undefined || to === undefined) continue;
      det.normalizedRaw = det.raw;
      if (det.valueStart !== null && det.valueEnd > det.valueStart) {
        det.valueStart = norm.start[det.valueStart];
        det.valueEnd = norm.end[det.valueEnd - 1];
      }
      // The secret part (e.g. the value after "password ") is mapped back too, when it is a plain
      // substring of the match (card security codes are digit-stripped and stay as they are)
      if (Number.isInteger(det.valueStart) && Number.isInteger(det.valueEnd)) {
        det.secretToken = baseText.slice(det.valueStart, det.valueEnd);
      }
      det.raw = baseText.slice(from, to);
      det.index = from;
      det.length = to - from;
      det.start = from;
      det.end = to;
    }

    // Resolve overlapping detections: prefer larger spans (e.g. TERMINAL_PROMPT over inner user@host)
    const sortedByLength = [...detections].sort((a, b) => b.length - a.length);
    const nonOverlapping = [];

    for (const det of sortedByLength) {
      const detStart = det.index;
      const detEnd = det.index + det.length;
      let overlaps = false;
      for (const acc of nonOverlapping) {
        const accStart = acc.index;
        const accEnd = acc.index + acc.length;
        if (detStart < accEnd && detEnd > accStart) {
          overlaps = true;
          break;
        }
      }
      if (!overlaps) {
        nonOverlapping.push(det);
      } else if (Number.isInteger(det.valueStart) && Number.isInteger(det.valueEnd)) {
        // A losing match may extend beyond the winner. Never silently leave its sensitive tail.
        let uncovered = [[det.valueStart, det.valueEnd]];
        for (const accepted of nonOverlapping) {
          const s = accepted.index, e = s + accepted.length;
          uncovered = uncovered.flatMap(([a, b]) => b <= s || a >= e ? [[a, b]] :
            [[a, Math.min(b, s)], [Math.max(a, e), b]].filter(([x, y]) => x < y));
        }
        const tag = /\[(?:REDACTED|CONFIDENTIAL|INTERNAL)_[A-Z0-9_]+\]/.exec(det.replacement)?.[0] || '[REDACTED_SECRET]';
        for (const [start, end] of uncovered) {
          nonOverlapping.push({...det, index:start, length:end-start, start, end,
            valueStart:start, valueEnd:end, raw:baseText.slice(start,end),
            secretToken:baseText.slice(start,end), replacement:tag, reason:'Overlapping sensitive value remainder'});
        }
      }
    }

    // Apply replacements from back to front to preserve offsets
    nonOverlapping.sort((a, b) => b.index - a.index);
    for (const det of nonOverlapping) {
      if (labelDetection) {
        const tag = labelDetection(det);
        if (tag) {
          det.tag = tag;
          det.replacement = det.replacement.replace(/\[(?:REDACTED|CONFIDENTIAL|INTERNAL|HR|User|ANONYMIZED)_[A-Z0-9_]+\]/g, tag);
        }
      }
      sanitizedText = 
        sanitizedText.substring(0, det.index) + 
        det.replacement + 
        sanitizedText.substring(det.index + det.length);
    }

    return {
      sanitizedText,
      detections: nonOverlapping,
      baseText
    };
  }
}

// Export for ES module or extension content script
if (typeof module !== "undefined" && module.exports) {
  module.exports = HeuristicsRedactor;
}
