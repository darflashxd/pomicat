/**
 * PomiCat: Tier 2: Contextual rules
 * Rule-based (regex) classifier that separates personal disclosures ("my salary",
 * "gaji saya") from public or statistical figures ("average salary", "rata-rata").
 * No ML model runs here. A DistilBERT token classifier was trained (see training/,
 * held-out F1 0.64) but is not shipped in the extension.
 */

const CODE_AT_WORDS = new Set(("import media keyframes font-face supports charset page layer tailwind apply " +
  "override deprecated param returns return throws type typedef property example see since author version " +
  "app router test before after component injectable input output viewchild hostlistener " +
  "dataclass staticmethod classmethod property pytest mock patch").split(" "));

// Money words checked for one-letter typos (see fixMoneyTypos), and real words one letter away
const MONEY_WORDS = ["salary", "salaries", "income", "paycheck", "savings", "mortgage", "budget", "revenue", "pension", "allowance", "gaji", "gajian", "tabungan", "cicilan", "penghasilan", "pendapatan"];
const NOT_MONEY_TYPOS = new Set(["gali", "haji", "saji", "kaji", "baji", "sayings", "revenge", "tension", "mension", "budgie", "budge", "budged", "salami"]);
// An amount written with its currency ("$5,000", "70000 dollars", "Rp 5 juta")
const EXPLICIT_CURRENCY = /(?:[$€£¥₹]\s*\d|\b(?:Rp|IDR|USD|EUR|GBP|SGD|INR|Rs\.?)\s*\d|\d[\d.,]*\s*(?:dollars?|dolar|bucks|rupiah|euros?|pounds?|juta|jt|ribu|rb|miliar|milyar)\b)/i;

class ContextualClassifier {
  constructor() {
    // Contextual trigger patterns (1st & 2nd person, Casual, Advice, & Elliptical)
    this.personalAnchors = [
      // The writer's own condition ("I'm pregnant", "saya sedang hamil", "I have diabetes")
      /\b(?:i\s*['’]?m|i\s+am|i\s+have|i\s+was|saya|aku)\s+(?:\w+\s+){0,2}(?:pregnant|hamil|diabetic|diabetes|bipolar|schizophreni[ac]|skizofrenia|depresi|hiv(?:[- ]positive)?)\b/i,
      /\b(?:gaji|penghasilan|upah|bonus|take home pay|thp|kompensasi|uang saku|pendapatan|tunjangan|remunerasi)(?:\s+\w+)?\s*(?:saya|ku|kami|Anda|kamu|mu|gw|gue|aku)?\b/i,
      /\b(?:gajiku|penghasilanku|upahku|gajimu|penghasilanmu)\b/i,
      /\b(?:gaji|penghasilan|kompensasi|upah|pendapatan)\s+(?:saya|Anda|kamu|gw|gue|ku|mu)\b/i,
      /\b(?:anggaran|budget|alokasi\s+(?:anggaran|dana)?|biaya\s+(?:proyek|migrasi|server|operasional)|dana\s+proyek)(?:\s+\w+)?\s*(?:saya|ku|kami|kita|Anda|kamu|mu|gw|gue|aku)\b/i,
      /\b(?:my|your|our)\s+(?:\w+\s+){0,3}(?:project\s+budget|migration\s+budget|allocated\s+budget|project\s+cost|operational\s+cost)\b/i,
      /\b(?:my|your|our|i|we)\s+(?:\w+\s+){0,3}(?:salary|compensation|earnings|income|take-home|pay|debt|savings|checking|account|debit|card|policy|claim|insurance|bill|billing|loss|net\s+loss|net\s+income|revenue|deficit)\b/i,
      /\b(?:my|your|our|i|we)?\s*(?:\w+\s+){0,3}(?:monthly\s+base|annual\s+base|base\s+salary|gross\s+salary|gross\s+income|net\s+income|housing\s+allowance|relocation\s+stipend|stipend|remuneration|compensation\s+package)\b/i,
      /\b(?:base|base\s+pay|base\s+salary|salary|gaji|income|allowance|bonus)\s*(?:is|was|of|sebesar|adalah|[:=])?\s*(?:Rp|IDR|(?:S|A|C|NZ|HK|US)\$|\$|USD|€|EUR|£|GBP|CHF|SGD|AUD|CAD|JPY|¥|HKD|NZD|MYR|₹|INR|Rs\.?)?\s*[\d.,]+/i,
      /\b(?:cpf|superannuation|pension)\b/i,
      /\b(?:(?:i|you)\s+(?:(?:also|now|still|currently|usually|actually|only|roughly|about)\s+)?(?:owe|make|earn)|earning|making|i pocket|i pull in|clearing)\b/i,
      /\b(?:personal\s+debt|credit\s+card\s+debt|mortgage|student\s+loan|debt|loans)\b/i,
      /\b(?:my|your|saya|Anda)\s+(?:\w+\s+){0,2}(?:base\s+salary|annual\s+salary|monthly\s+salary|monthly\s+income|annual\s+income|gross\s+income|net\s+income|take-home\s+pay|hourly\s+rate)\b/i,
      /\b(?:i|we|my)\s+(?:\w+\s+){0,2}(?:save|saving|invest|investing)\b/i,
      /\bsaving\s+(?:\$|usd|rp)?[\d.,]+/i,
      /\b(?:net\s+loss|operating\s+loss|net\s+income|operating\s+income|operating\s+deficit)\b/i,
      /\b(?:negotiating|negotiate|counter-offer|aiming\s+for|asking\s+for)\s+(?:for\s+)?(?:\$|usd|rp)?\d+/i,
      /\b(?:limit|credit\s+limit|card\s+limit)\s+(?:\$|usd|rp)?[\d.,]+/i,
      /\b(?:hutang|cicilan|pinjaman|pinjol|kpr|tabungan|rekening|esop|opsi\s+saham|strike\s+price)(?:\s+\w+)?\s*(?:saya|ku|kami|Anda|kamu|mu|gw|gue|aku)?\b/i,
      /\b(?:hutangku|cicilanku|tabunganku|hutang Anda|cicilan Anda)\b/i,
      /\b(?:proyeksi gaji|kenaikan gaji|kenaikan bersih|sisa setelah cicilan|sisa uang|menjadi sekitar|naik menjadi|capital\s+gain)\b/i,
      /\b(?:gaji pokok|take home pay|penghasilan bulanan|dapat tawaran gaji|gaji di kantor)\b/i,
      /\b(?:didiagnosis|mendiagnosis|mengidap|menderita|divonis|positif|sakit|rawat inap|terkena|terdiagnosis|biopsi|hasil lab|hasil tes)\b/i,
      /\b(?:meresepkan|diresepkan|diberi obat|memberi saya obat|minum obat|mengonsumsi|resep dokter|resep psikiater)\b/i,
      /\b(?:psikiater|psikolog|onkolog|dokter spesialis|dokter gigi|dokter kandungan)\b/i,
      /\b(?:prescribed|diagnosed|diagnosis|medication|psychiatrist|oncologist|suffering from)\b/i,
      /\b(?:I\s+have|saya\s+(?:kena|punya|mengalami))\s+(?:asthma|asma|depression|depresi|epilepsy|epilepsi|diabetes|hipertensi|hypertension|high\s+blood\s+pressure)\b/i,
      /\b(?:kondisi|resep|obat|penyakit|diagnosis)\s+(?:saya|Anda|kamu|ku|mu)\b/i,
      /\b(?:proyek rahasia kita|nama sandi proyek|server internal kita|endpoint internal)\b/i,
      /\b(?:internal codename|our secret project|our internal database|our unannounced)\b/i,
      /\b(?:saya dijatuhi sanksi|saya dipanggil hrd|saya kena sp|saya di-phk)\b/i,
      /\b(?:sanksi untuk Anda|peringatan untuk Anda|pemutusan hubungan kerja Anda)\b/i,
      /\b(?:i was placed on|my termination|my disciplinary warning|unjustified pip|your disciplinary warning)\b/i,
      /\b@[\w.-]{3,}\b/i,
      /\b(?:tc|total\s+comp(?:ensation)?|base\s+salary|annual\s+salary|monthly\s+salary|take-home|hourly\s+rate|rsu|rsus|equity|stock\s+options?|strike\s+price|409a|vesting|cliff)\b/i,
      /\b(?:sign-on\s+bonus|relocation\s+(?:bonus|stipend)|retention\s+bonus|severance(?:\s+package)?|settlement\s+amount|retainer\s+fee)\b/i,
      /\b(?:burn\s+rate|monthly\s+burn|cash\s+runway|runway|arr|mrr|acv|ebitda|gross\s+margins?|safe\s+note|valuation\s+cap|post-money|pre-money)\b/i,
      /\b(?:mortgage(?:\s+loan)?|down\s+payment|conforming\s+loan|dti|debt-to-income|ltv|loan-to-value|student\s+loans?|revolving\s+(?:debt|balance)|credit\s+limit|apr)\b/i,
      /\b(?:401\(?k\)?|roth\s+ira|capital\s+gains|family\s+trust|net\s+worth|portfolio\s+balance|deposito|wire|transfer)\b/i,
      /\b(?:racks|bands|half\s+a\s+mil|ember)\b/i,
      /\b(?:operating\s+income|financing\s+cash\s+flow|ending\s+cash|disbursement|payroll|balances?|amount_captured)\b/i,
      /\b(?:psychiatrist|psychologist|oncologist|endocrinologist|therapist|physician|doctor|dr\.)\b/i,
      /\b(?:prescribed|diagnosed|diagnosis|medication|pathology\s+report|biopsy\s+results?|hba1c|viral\s+load|tested\s+positive)\b/i,
      /\b(?:switched\s+(?:me|my)|switch\s+(?:me|my)|put\s+me\s+on|started\s+me\s+on|taking|taking\s+daily|prescribing\s+me|prescribed\s+me)\b/i,
      /\b(?:clinical\s+consultation|consultation\s+notes|patient|struggling\s+with|taper\s+off|titrate|initiate)\b/i,
      /\b(?:pip|performance\s+improvement\s+plan|written\s+warning|harassment|hostile\s+work\s+environment|wrongful\s+termination|eeoc|title\s+vii)\b/i,
      /\b(?:project\s+(?!(?:management|planning|manager|lead|update|timeline|report|review|charter|lifecycle|work|description)\b)[a-z][a-z0-9_-]+|non-disclosure|nda|trade\s+secret)\b/i,
      /\b(?:lpa|lakhs?|crores?|joining\s+bonus)\b/i,
      /\b(?:therapy\s+session|psychotherapy|counseling|childhood\s+trauma|trauma|panic\s+attacks?|suicidal\s+ideation|self-harm|ptsd)\b/i,
      /\b(?:checking\s+account|savings\s+account|debit\s+card|credit\s+card|autopay|declined|insufficient\s+funds|overdraft|chargeback|card\s+transaction|available\s+balance|do\s+not\s+honor|card\s+ending\s+in|ends\s+in\s+\d{4})\b/i,
      /\b(?:health\s+insurance|dental\s+insurance|vision\s+insurance|medical\s+bill(?:ing)?|insurance\s+claim|claim\s+number|member\s+id|group\s+number|in-network|out-of-network|deductible|coinsurance|copay(?:ment)?|out-of-pocket|explanation\s+of\s+benefits|eob)\b/i,
      /\b(?:rent|renting|landlord|struggling\s+hard|cooked|paycheck)\b/i,
      /\b(?:my\s+(?:wife|husband|partner|fiancee?|son|daughter|child|children|kids?|mom|dad|mother|father|parents?|brother|sister|family)|istri\s+saya|suami\s+saya|anak\s+saya|ibu\s+saya|ayah\s+saya)\b/i,
      /\b(?:our\s+(?:son|daughter|children|kids?)|anak\s+kami)\b/i,
      /\b(?:my\s+date\s+of\s+birth|i\s+was\s+born|tanggal\s+lahir\s+saya|saya\s+lahir)\b/i,
      /\b(?:i\s+am\s+(?:a\s+)?(?:\d{1,2}\s*(?:yo|years\s+old)?\s*)?(?:gay|lesbian|bisexual|transgender|queer|muslim|christian|catholic|hindu|buddhist|jewish|mormon|atheist|agnostic))\b/i,
      /\b(?:saya\s+(?:seorang\s+)?(?:muslim|kristen|katolik|hindu|buddha|konghucu|penghayat|gay|lesbi|biseksual|transgender))\b/i
    ];

    this.publicAnchors = [
      /\b(?:rata-rata|median|benchmark|standar|survei|indeks|umr|laporan publik)\b/i,
      /\b(?:average|median|industry standard|according to|benchmark|public report)\b/i,
      /\b(?:federal\s+reserve|the\s+fed|fomc|central\s+bank|interest\s+rate|target\s+range|overnight\s+rate|treasury\s+yield)\b/i,
      /\b(?:s&p\s*500|nasdaq|dow\s+jones|ftse|nikkei|cpi|consumer\s+price\s+index|inflation\s+rate)\b/i,
      /\b(?:irs\s+guidelines|statutory|401\(?k\)?\s+contribution\s+limit|catch-up\s+limit|conforming\s+loan\s+limit)\b/i,
      /\b(?:bureau\s+of\s+labor\s+statistics|bls|sec\s+filing|10-k|10-q|quarterly\s+revenue|market\s+cap)\b/i,
      /\b(?:misalkan|sebagai contoh|studi kasus|simulasi|andai kata|hitunglah)\b/i,
      /\b(?:suppose|hypothetical|example scenario|calculate|what if|for illustration)\b/i,
      /\b(?:apa saja gejala|bagaimana cara|mekanisme kerja|faktor risiko|artikel jurnal|menurut undang-undang)\b/i,
      /\b(?:what are the symptoms|how does|mechanism of action|under federal law|statutory requirement)\b/i
    ];
  }

  /**
   * Scans a text turn and identifies whether any embedded financial, health, corporate,
   * or HR entities are personal/sensitive vs safe/public.
   */
  /**
   * Money words typed with one slip ("slary", "sallary", "incmoe", "gajii") read as the word
   * itself, so a typo doesn't switch amount protection off. One letter missing, extra, wrong or
   * two swapped; words of 4+ letters only, and real words that sit one letter away are left alone.
   * Only used to decide whether a sentence is about your money, never shown or sent.
   */
  static fixMoneyTypos(text) {
    const near = (a, b) => {
      if (a === b || Math.abs(a.length - b.length) > 1) return a === b;
      if (a.length === b.length) {
        const diff = [...a].map((c, i) => (c !== b[i] ? i : -1)).filter(i => i >= 0);
        return diff.length === 1 || (diff.length === 2 && diff[1] === diff[0] + 1 && a[diff[0]] === b[diff[1]] && a[diff[1]] === b[diff[0]]);
      }
      const [l, sh] = a.length > b.length ? [a, b] : [b, a];
      for (let i = 0; i < l.length; i++) if (l.slice(0, i) + l.slice(i + 1) === sh) return true;
      return false;
    };
    return text.replace(/\p{L}{4,}/gu, (w) => {
      const lw = w.toLowerCase();
      if (MONEY_WORDS.includes(lw) || NOT_MONEY_TYPOS.has(lw)) return w;
      return MONEY_WORDS.find(k => near(lw, k)) || w;
    });
  }

  classifyTurn(turnText, turnIndex, protectedDetections = []) {
    if (turnIndex === 0) this.lastFinancialTurn = null;
    // ponytail: only adjacent financial corrections inherit context; broader dialogue needs explicit topic tracking.
    const correction = Number.isInteger(this.lastFinancialTurn) && turnIndex > this.lastFinancialTurn && turnIndex - this.lastFinancialTurn <= 2 && /^\s*(?:sorry\s+typo|correction\s*:|actually\s+it|wait,?\s+it|no,?.*correct\s+amount)/i.test(turnText);
    // Analyze original coordinates without interpreting parts of already identified values as money.
    // Preserve sentence punctuation and length; don't let replacement labels supply new context.
    for (const det of [...protectedDetections].sort((a, b) => b.index - a.index)) {
      if (!Number.isInteger(det.index) || !Number.isInteger(det.length) || det.index < 0 || det.index + det.length > turnText.length) {
        throw new Error('Invalid protected detection bounds');
      }
      const part = turnText.slice(det.index, det.index + det.length).replace(/[^\r\n]/g, ' ');
      turnText = turnText.slice(0, det.index) + part + turnText.slice(det.index + det.length);
    }
    const detected = [];
    const sentences = turnText.split(/(?<=[.!?\n])\s+/);

    for (const sent of sentences) {
      // A typo in the money word, or "my/I" plus an explicit currency, still makes it personal
      const rentTotal = /\btotal move-in cost\b/i.test(sent) && /\bdeposit of \d+(?:\.\d+)?x rent\b/i.test(turnText);
      let isPersonal = correction || rentTotal || this.personalAnchors.some(rx => rx.test(sent)) ||
        (/\b(?:my|our|saya|aku|gue|gw|kami)\b/i.test(sent) && EXPLICIT_CURRENCY.test(sent));
      if (!isPersonal && /\d/.test(sent)) {
        const fixed = ContextualClassifier.fixMoneyTypos(sent);
        isPersonal = fixed !== sent && this.personalAnchors.some(rx => rx.test(fixed));
      }
      const isPublic = this.publicAnchors.some(rx => rx.test(sent));
      const hasExplicitPerson = /\b(?:saya|ku|kami|Anda|kamu|mu|gw|gue|aku|my|your|our|i|we|patient|i\s*['`]?(?:m|ve|ll|d)?)\b/i.test(sent);

      // Rule of Contextual Integrity:
      // If a sentence is marked with public/statistical/hypothetical anchors, PRESERVE IT (Safe O)
      // UNLESS there is an explicit 1st/2nd person claiming it (e.g. "Gaji saya Rp 28M di atas rata-rata")
      if (isPublic && !hasExplicitPerson) {
        continue;
      }

      // If personal context is active, extract the corresponding values
      if (isPersonal) {
        for (const m of sent.matchAll(/\b\d+(?:\.\d+)?\s+grand\b/gi)) {
          detected.push({turnIndex, raw:m[0], category:"SENSITIVE_FINANCIAL", sentence:sent, confidence:0.95});
        }
        // Keep the original wording; the amount parser resolves bounded Indonesian number words.
        const spokenAmounts = sent.matchAll(/\b(?:nol|satu|dua|tiga|empat|lima|enam|tujuh|delapan|sembilan|sepuluh|sebelas|seratus|seribu)(?:\s+(?:nol|satu|dua|tiga|empat|lima|enam|tujuh|delapan|sembilan|sepuluh|sebelas|belas|puluh|ratus|seratus)){0,8}\s+(?:juta|miliar|ribu)(?:\s+rupiah)?\b/gi);
        if (/\b(?:gaji|penghasilan|upah|pendapatan|bonus|tabungan)\b/i.test(sent)) {
          for (const m of spokenAmounts) detected.push({turnIndex, raw:m[0], category:"SENSITIVE_FINANCIAL", sentence:sent, confidence:0.95});
        }
        // Pre-compute phone number spans to prevent telephone numbers (e.g. 1-800-869-3557, 0812-3456-7890) from being parsed as financial amounts
        const phoneSpans = [];
        const phoneRx = /(?:\+62|62|0)[\s.-]?8[1-9](?:[\s.-]?[0-9]){7,10}\b|(?:\+?1[-.\s]?)?\(?[2-9]\d{2}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g;
        let pm;
        while ((pm = phoneRx.exec(sent)) !== null) {
          phoneSpans.push([pm.index, pm.index + pm[0].length]);
        }

        // Pre-compute bank account spans to prevent account numbers (e.g. rekening 1234567890) from being parsed as financial amounts
        const bankAccountSpans = [];
        const bankAccRx = /\b(?:(?:nomor\s+)?rekening(?:\s+bank)?|no\.?\s*rek(?:ening)?|rek(?:ening)?(?:\s+(?:bca|mandiri|bni|bri|cimb|jago|jenius|permata|bsi))?|bank\s+account(?:\s+number)?|account\s+number)\s*(?:aku|saya|kamu|Anda|nya)?\s*[:=\-~]?\s*([0-9]{8,18})\b/gi;
        let bm;
        while ((bm = bankAccRx.exec(sent)) !== null) {
          const numStr = bm[1];
          const numIdx = bm.index + bm[0].lastIndexOf(numStr);
          bankAccountSpans.push([numIdx, numIdx + numStr.length]);
        }

        // Pre-compute address spans to prevent house numbers (e.g. 742 Evergreen Terrace) and postal zip codes from being parsed as financial amounts
        const addressSpans = [];
        const addrRx = /\b(?:(?:(?:residential|shipping|mailing|home|street|billing)\s+)?address\s*[:=\-]?\s*(?:to\s+my\s+residential\s+address\s*:\s*)?|(?:(?:shipping|deliver(?:y|ing)?|ship|send|sent)\s+to\s+))?((?:(?:Flat|Unit|Apt|Apartment|Suite)\s+\d+[a-zA-Z]?,?\s*(?:[0-9]{1,5}\s+)?|[0-9]{1,5}\s+)[A-Za-z0-9\s.,\/-]+?\b(?:Street|St|Avenue|Ave|Boulevard|Blvd|Road|Rd|Drive|Dr|Lane|Ln|Way|Court|Ct|Terrace|Ter|Place|Pl|Circle|Cir|Parkway|Pkwy)\b(?:[A-Za-z0-9\s.,\/-]*?(?:[A-Z]{2}\s+\d{5}(?:-\d{4})?|[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}))?)/gi;
        let am;
        while ((am = addrRx.exec(sent)) !== null) {
          addressSpans.push([am.index, am.index + am[0].length]);
        }
        const idAddrRx = /\b(?:alamat(?:\s+(?:ktp|domisili|saya|tinggal|rumah))?(?:\s+di|\s+adalah|\s*:)?\s*)([A-Za-z0-9\s.,\/-]+?)(?=\s*(?:nomor\s+telfon|nomor\s+hp|no\s+hp|no\s+telp|telfon|telepon|phone|email|nik|nim|npwp|paspor|passport|sim|bpjs|gaji|[\r\n]|$))/gi;
        let iam;
        while ((iam = idAddrRx.exec(sent)) !== null) {
          if (/\b(?:jalan|jl\.?|gang|gg\.?|kampung|kp\.?|komplek|perumahan|dusun|desa|kelurahan|kecamatan|rt\s*\d+|rw\s*\d+|no(?:mor)?\s*\d+|blok\s*[a-z0-9]+)\b/i.test(iam[0])) {
            addressSpans.push([iam.index, iam.index + iam[0].length]);
          }
        }

        // Universal Financial check (Supports Rp 28.500.000, $380k, ($650,000), $18M, 45 jeti, 15 juta, 20jt, 45 LPA, 10 Lakh, $150k, 90k, half a mil, 250 racks, strike price, float balances, global currencies: SGD, AUD, CAD, EUR, GBP, CHF, JPY, HKD, NZD, MYR)
        const finRegex = /(?:(?:\(\s*(?:Rp\s*|IDR\s*|(?:S|A|C|NZ|HK|US)\$\s*|\$|USD\s*|€|EUR\s*|£|GBP\s*|CHF\s*|SGD\s*|AUD\s*|CAD\s*|JPY\s*|¥|HKD\s*|NZD\s*|MYR\s*|₹\s*|INR\s*|Rs\.?\s*)?[\d.,]+(?:\s*(?:k|m|million|billion|juta|jt|lpa|lakhs?|crores?))?\s*\))|(?:(?:Rp\s*|IDR\s*|(?:S|A|C|NZ|HK|US)\$\s*|\$|USD\s*|€|EUR\s*|£|GBP\s*|CHF\s*|SGD\s*|AUD\s*|CAD\s*|JPY\s*|¥|HKD\s*|NZD\s*|MYR\s*|₹\s*|INR\s*|Rs\.?\s*)?[\d.,]+(?:\s*(?:juta|jt|jeti|jetong|miliar|milyar|million|billion|k|rb|ribu|thousand|rupiah|dollars?|dolar|bucks|usd|idr|euros?|pounds?|racks|bands|ember|lpa|lakhs?|crores?)\b|[mb](?!\w)|\s+[mb]\b))|(?:half\s+a\s+mil\b)|(?:(?:Rp\s*|IDR\s*|(?:S|A|C|NZ|HK|US)\$\s*|\$|USD\s*|€|EUR\s*|£|GBP\s*|CHF\s*|SGD\s*|AUD\s*|CAD\s*|JPY\s*|¥|HKD\s*|NZD\s*|MYR\s*|₹\s*|INR\s*|Rs\.?\s*)[\d.,]+)|\b\d{4,12}(?:[.,]\d{2})\b|\b\d{1,3}(?:\.\d{3})+(?:,\d+)?|\b\d{1,2}(?:,\d{2})+,\d{3}\b|\b\d{1,3}(?:,\d{3})+(?:\.\d+)?|\b\d{4,18}\b)/gi;
        const nonFinUnits = /^\s*(?:copies\s*\/\s*m[lL]|cells\s*\/\s*u[lL]|gwei|wei|eth|btc|sol|mmol\s*\/\s*l|mg\s*\/\s*dl|u\s*\/\s*l|gas|saham|lembar|shares|bps|basis\s+points|years?|months?)\b/i;
        const finSpans = [];
        const finMatches = sent.matchAll(finRegex);
        for (const m of finMatches) {
          const matchIndex = m.index;
          let matchStr = m[0].replace(/[.,;:]+$/, "");
          if (!matchStr) continue;

          // Skip if inside a telephone number, bank account number, or physical address
          if (phoneSpans.some(([s, e]) => matchIndex >= s && (matchIndex + matchStr.length) <= e)) {
            continue;
          }
          if (bankAccountSpans.some(([s, e]) => matchIndex >= s && (matchIndex + matchStr.length) <= e)) {
            continue;
          }
          if (addressSpans.some(([s, e]) => matchIndex >= s && (matchIndex + matchStr.length) <= e)) {
            continue;
          }

          // Skip IRC retirement plan references like 401k or 401(k)
          if (/^401\s*k$/i.test(matchStr.trim()) || /\b401\(?k\)?\b/i.test(matchStr)) continue;

          // Skip if part of an IP address (e.g. 10.244.0.15) or network port (localhost:5432, 127.0.0.1:8080)
          if (matchIndex > 0 && /[\p{L}\p{N}_.:]/u.test(sent[matchIndex - 1])) continue;
          const afterText = sent.substring(matchIndex + matchStr.length);
          if (/^[\p{L}\p{N}_]|^[.,]\d+/u.test(afterText)) continue;
          // Skip if followed by URL path (e.g. :5432/sandbox_db), but allow financial time periods (/month, /year, /bulan)
          if (/^\/[a-zA-Z0-9_]/.test(afterText) && !/^\/(?:month|mo|year|yr|bulan|thn|tahun|day|hari|hr|hour|jam|week|minggu)\b/i.test(afterText)) continue;

          // Skip if followed by non-financial clinical or blockchain units (e.g. 45.000 copies/mL)
          if (nonFinUnits.test(afterText)) continue;

          // Skip if inside technical container / OS user / network port configs
          const lineStart = Math.max(0, sent.lastIndexOf("\n", matchIndex));
          const beforeInLine = sent.substring(lineStart, matchIndex);
          if (/\b(?:runAsUser|runAsGroup|fsGroup|port|listen_port|containerPort|uid|gid)\s*(?:[:=]\s*)?$/i.test(beforeInLine)) continue;

          // Skip bare numbers without currency/unit that are part of hyphenated tokens (e.g. xoxb-123456-..., uuid-1234),
          // config assignments (KEY=1234), CLI flags (-p 5432, --port 8080), or inside code
          if (/^\d+$/.test(matchStr)) {
            if (/[a-zA-Z0-9]-$/.test(sent.substring(0, matchIndex))) continue;
            if (/^-[a-zA-Z0-9]/.test(afterText)) continue;
            if (/\b[A-Za-z0-9_-]+\s*=\s*[^\s]*$/.test(beforeInLine)) continue;
            if (/(?:^|\s)-+[a-zA-Z0-9_]+\s*$/.test(beforeInLine)) continue;
          }

          // Numbers inside URLs / DOIs are identifiers
          if (/(?:https?:\/\/|doi\.org\/|www\.)\S*$/i.test(sent.substring(Math.max(0, matchIndex - 200), matchIndex))) continue;

          // "25m high", "100m away": metres, not millions
          if (/^\d[\d.,]*\s*m$/i.test(matchStr) && /^\s*(?:high|tall|long|wide|deep|away|above|below|apart|across|radius|diameter)\b|^\s*\/\s*s\b/i.test(afterText)) continue;

          // If a 4-digit number looks like a calendar year (1950-2040), ensure explicit financial context.
          // Parentheses are stripped first so citation years like "(2021)" are treated as years too.
          const bareNum = matchStr.replace(/^\(\s*|\s*\)$/g, "");
          if (/^\d{4}$/.test(bareNum)) {
            const num = parseInt(bareNum, 10);
            if (num >= 1950 && num <= 2040) {
              const prevSnippet = sent.substring(Math.max(0, matchIndex - 30), matchIndex);
              const nextSnippet = sent.substring(matchIndex + matchStr.length, matchIndex + matchStr.length + 30);
              const isExplicitFinancialContext = /(?:rent|salary|gaji|income|pay|bonus|debt|owe|making|earning|take-home|take\s+home|spending|spent|disbursement)\s+(?:is\s+|of\s+)?$/i.test(prevSnippet) || /(?:a\s+month|\/mo|\/month|monthly|annually|per\s+year|\/year)/i.test(nextSnippet);
              if (!isExplicitFinancialContext) {
                continue; // Preserve calendar year
              }
            }
          }

          finSpans.push([matchIndex, matchIndex + matchStr.length]);
          detected.push({
            turnIndex,
            raw: matchStr,
            category: "SENSITIVE_FINANCIAL",
            sentence: sent,
            confidence: 0.98
          });
        }

        // Contextual 2-3 digit expense numbers (e.g. "car payment is 580", "car is 450", "rent of 600", "fee is 50", "gym is 40", "580/mo")
        const shortExpenseRx = /\b(?:(?:payment|car\s+payment|rent|auto|lease|fee|bill|cost|spend|spending|gaji|sewa|cicilan|bayar|iuran|tarif)\s+(?:is|of|for|about|around|sebesar|adalah|:)?\s*(\d{2,3})\b|(?<![.,\d])(\d{2,3})\s*(?:\/mo|\/month|monthly|\/yr|\/year|\/bulan|per\s+bulan|\/minggu)\b)/gi;
        const shortExpenseMatches = sent.matchAll(shortExpenseRx);
        for (const sm of shortExpenseMatches) {
          const rawNum = sm[1] || sm[2];
          if (!rawNum) continue;
          const matchIndex = sm.index + sm[0].lastIndexOf(rawNum);

          // Percentages are ratios, not expense amounts: "spend 15% on hobbies" must not hide "15".
          if (/^\s*%/.test(sent.substring(matchIndex + rawNum.length))) continue;

          if (phoneSpans.some(([s, e]) => matchIndex >= s && (matchIndex + rawNum.length) <= e)) continue;
          if (bankAccountSpans.some(([s, e]) => matchIndex >= s && (matchIndex + rawNum.length) <= e)) continue;
          if (addressSpans.some(([s, e]) => matchIndex >= s && (matchIndex + rawNum.length) <= e)) continue;
          if (finSpans.some(([s, e]) => matchIndex >= s && (matchIndex + rawNum.length) <= e)) continue;
          if (detected.some(d => d.turnIndex === turnIndex && d.raw === rawNum)) continue;

          finSpans.push([matchIndex, matchIndex + rawNum.length]);
          detected.push({
            turnIndex,
            raw: rawNum,
            category: "SENSITIVE_FINANCIAL",
            sentence: sent,
            confidence: 0.95
          });
        }

        // Comprehensive Health check (Active & passive, cancer, diabetes, HIV lab biomarkers, psychotropics, trauma, oncology biologics)
        const healthRegex = /(?:(?:(?:limfosit\s+)?CD4\b[^\n,.]*?\b\d+\s*cells\s*\/\s*u[lL]|HIV(?:-1)?\s+[^\n,.]*?Viral\s+Load\s+[^\n,.]*?[\d.,]+\s*copies\s*\/\s*m[lL])|(?:(?:[a-zA-Z]+\s+)?(?:cancer|adenocarcinoma|carcinoma|melanoma|sarcoma|lymphoma|leukemia|leukimia)|kanker\s+[^\s,.]+)(?:\s+(?:stadium|stage)\s+(?:IV|I{1,3}|\d)[a-c]?)?|(?:Stage\s+(?:IV|I{1,3}|\d)\s+[a-zA-Z]+(?:\s+with\s+[a-zA-Z\s]+)?)|(?:diabetes(?:\s+melitus)?(?:\s+tipe\s+\d+)?|hepatitis\s+[a-c])|hiv(?:\s*positif)?|positif\s*hiv|tested\s+positive\s+for\s+hiv|skizofrenia|schizophrenia|paranoid\s+schizophrenia|bipolar(?:\s+(?:affective\s+disorder|II|I|[12]|episode\s+\w+))?|depresi(?:\s*(?:klinis|berat|mayor))?|Major\s+Depressive\s+Disorder|adult\s+adhd|adhd|gangguan\s*kecemasan(?:\s*menyeluruh)?|anxiety(?:\s*disorder)?|F31\.\d+|(?:childhood\s+trauma|suicidal\s+ideation|self-harm|ptsd)|(?:lexapro|escitalopram|sertraline|zoloft|wellbutrin(?:\s+xl)?|bupropion|rituximab|venlafaxine|effexor|duloxetine|cymbalta|lisdexamfetamine|methotrexate|keytruda|pembrolizumab|alprazolam|xanax|klonopin|clonazepam|adderall(?:\s+xr)?|ritalin|vyvanse|prozac|fluoxetine|valium|diazepam|metformin|lipitor|atorvastatin|risperidone|lithium(?:\s+carbonate)?|clozapine|quetiapine|seroquel|lantus(?:\s+insulin)?|biktarvy|cisplatin|doxorubicin|paclitaxel|carboplatin|tamoxifen|imatinib|trastuzumab|nivolumab|ibrutinib|\b[a-zA-Z]{4,}(?:mab|tinib|zomib|xaban)\b)(?:\s*[\d.]+\s*(?:mg|mcg|ml|iv))?)/gi;
        const healthMatches = sent.matchAll(new RegExp(healthRegex.source + '|\\b(?:asthma|asma|depression|depresi|epilepsy|epilepsi|hipertensi|hypertension|high\\s+blood\\s+pressure|pregnant|pregnancy|hamil|diabetes|diabetic|anxiety\\s+disorder|bipolar|schizophrenia|skizofrenia|HIV(?:[- ]positive)?)\\b', 'gi'));
        for (const m of healthMatches) {
          detected.push({
            turnIndex,
            raw: m[0],
            category: "SENSITIVE_HEALTH",
            sentence: sent,
            confidence: 0.96
          });
        }

        // Corporate confidential check (match specific project names, excluding generic nouns like project management)
        const corpMatches = sent.matchAll(/(?:Project\s+(?!(?:Management|Planning|Manager|Managers|Lead|Leads|Update|Updates|Timeline|Timelines|Report|Reports|Review|Reviews|Description|Work|Workstream|Overview|Summary|Charter|Lifecycle|Scope|that|this|the|a|an)\b)[A-Z][a-zA-Z0-9_-]+|Inisiatif\s+[A-Z][a-zA-Z0-9_-]+|[a-z0-9-]+(?:\.[a-z0-9-]+)*\.corp(?:\.internal)?:\d{2,5})/g);
        for (const m of corpMatches) {
          detected.push({
            turnIndex,
            raw: m[0],
            category: "SENSITIVE_CORP",
            sentence: sent,
            confidence: 0.97
          });
        }

        // User handle / nickname check (e.g. @jdoe_dev)
        const userHandleMatches = sent.matchAll(/(?<![a-zA-Z0-9._-])@([a-zA-Z0-9._-]{3,30})/gi);
        const ignoredHandles = new Set(["protected.local", "localhost", "internal", "sandbox_db", "example.com"]);
        for (const m of userHandleMatches) {
          const handleLower = m[1].toLowerCase();
          if (ignoredHandles.has(handleLower) || handleLower.endsWith(".local") || handleLower.endsWith(".internal")) {
            continue;
          }
          // CSS at-rules, decorators and doc tags (@import, @media, @Override, @param, @app.route)
          const lineAround = sent.slice(sent.lastIndexOf("\n", m.index) + 1, (sent.indexOf("\n", m.index) + 1 || sent.length + 1) - 1);
          if (CODE_AT_WORDS.has(handleLower.split(".")[0]) || /[;{}()=<>]/.test(lineAround)) {
            continue;
          }
          detected.push({
            turnIndex,
            raw: m[0],
            category: "SENSITIVE_USER",
            sentence: sent,
            confidence: 0.99
          });
        }

        // Academic / Student ID check (e.g. NIM: 3002455595)
        const nimMatches = sent.matchAll(/\b(?:nim|npm|nrp|no\.?\s*mahasiswa|student\s*id)\b\s*[:=\-]?\s*([0-9]{8,14})\b/gi);
        for (const m of nimMatches) {
          detected.push({
            turnIndex,
            raw: m[0],
            category: "SENSITIVE_USER",
            sentence: sent,
            confidence: 0.99
          });
        }

        // HR action check
        const hrMatch = sent.match(/(?:Surat Peringatan (?:Pertama|Kedua|Ketiga|\d|\(SP-[1-3]\))|PHK sepihak|PIP \d+ hari|(?:\d+[- ]day\s+)?(?:Performance Improvement Plan(?:\s+\(PIP\))?|pip\b)|final written warning|written warning(?:\s+from\s+hr)?|disciplinary warning|formal\s+disciplinary\s+hearing|termination\s+notice|gross\s+misconduct|mutual\s+nda)/i);
        if (hrMatch && !(/^pip$/i.test(hrMatch[0]) && (!/\b(?:hr|manager|performance|disciplin\w*|severance|employment|employer|placed|warning|fired|termination)\b/i.test(turnText) || /\bpip\s+install\b|picture[- ]in[- ]picture/i.test(sent)))) {
          detected.push({
            turnIndex,
            raw: hrMatch[0],
            category: "SENSITIVE_LEGAL_HR",
            sentence: sent,
            confidence: 0.95
          });
        }

        // Family member names (e.g. "my wife Jessica", "our 5-year-old son Lucas", "anak saya Budi")
        const familyMatches = sent.matchAll(/(?:(?:(?:my|our)\s+(?:wife|husband|fiancee?|partner|mother|father|mom|dad|brother|sister)|(?:istri|suami|ibu|ayah)\s+saya)\s+(?:named\s+)?)([A-Z][a-z]+)(?=\s+(?:and\b|who\b|is\b|attends?\b|goes\b|works?\b|lives?\b|dan\b|yang\b)|[,.;\n\r]|$)|(?:(?:(?:our|my)\s+(?:\d{1,2}[-\s]year[-\s]old\s+)?(?:son|daughter|child|kid|boy|girl)|anak\s+(?:saya|kami))\s+(?:named\s+)?)([A-Z][a-z]+)/gi);
        for (const m of familyMatches) {
          const name = m[1] || m[2];
          if (name && name.length >= 2 && !["The", "A", "An", "In", "On", "At", "My", "Our", "And"].includes(name)) {
            detected.push({
              turnIndex,
              raw: name,
              category: "SENSITIVE_USER",
              sentence: sent,
              confidence: 0.95
            });
          }
        }

        // Special Category Demographics / Sexual Orientation / Religious Affiliation in 1st person
        const demoMatches = sent.matchAll(/\b(?:bisexual(?:\s+female|\s+male)?|homosexual|transgender|asexual|pansexual|non-binary|gay|lesbian|penganut\s+[A-Za-z]+|(?<=\b(?:i\s+am\s+(?:a\s+)?|i['’]m\s+(?:a\s+)?|saya\s+(?:seorang\s+)?|aku\s+))(?:muslim|christian|catholic|hindu|buddhist|jewish|atheist|kristen|katolik|buddha|konghucu|ateis)|attending\s+[A-Z][a-zA-Z\s]+(?:Islamic|Baptist|Catholic|Methodist|Lutheran|Orthodox|Jewish|Synagogue|Mosque|Temple|Pesantren))\b/gi);
        for (const m of demoMatches) {
          detected.push({
            turnIndex,
            raw: m[0],
            category: "SENSITIVE_USER",
            sentence: sent,
            confidence: 0.92
          });
        }
      }
    }

    if (detected.some(d => d.category === "SENSITIVE_FINANCIAL")) this.lastFinancialTurn = turnIndex;
    return detected;
  }
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = ContextualClassifier;
}
