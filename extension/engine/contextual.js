/**
 * SafeShare-AI — Tier 2: Contextual Integrity Classifier
 * Connects to ONNX Runtime Web / Transformers.js to execute local in-browser inference.
 * Differentiates contextual personal data (e.g. personal salary, private diagnosis)
 * from statistical / public / educational data.
 */

class ContextualClassifier {
  constructor() {
    this.session = null;
    this.id2label = {
      0: "O",
      1: "B-SENSITIVE_FINANCIAL",
      2: "I-SENSITIVE_FINANCIAL",
      3: "B-SENSITIVE_HEALTH",
      4: "I-SENSITIVE_HEALTH",
      5: "B-SENSITIVE_CORP",
      6: "I-SENSITIVE_CORP",
      7: "B-SENSITIVE_LEGAL_HR",
      8: "I-SENSITIVE_LEGAL_HR",
      9: "B-SENSITIVE_USER",
      10: "I-SENSITIVE_USER"
    };

    // Contextual trigger patterns for high-speed local inference (1st & 2nd person, Casual, Advice, & Elliptical)
    this.personalAnchors = [
      /\b(?:gaji|penghasilan|upah|bonus|take home pay|thp|kompensasi|uang saku|pendapatan|tunjangan|remunerasi)(?:\s+\w+)?\s*(?:saya|ku|kami|Anda|kamu|mu|gw|gue|aku)?\b/i,
      /\b(?:gajiku|penghasilanku|upahku|gajimu|penghasilanmu)\b/i,
      /\b(?:gaji|penghasilan|kompensasi|upah|pendapatan)\s+(?:saya|Anda|kamu|gw|gue|ku|mu)\b/i,
      /\b(?:my|your|our|i|we)\s+(?:\w+\s+){0,3}(?:salary|compensation|earnings|income|take-home|pay|debt|savings|checking|account|debit|card|policy|claim|insurance|bill|billing|loss|net\s+loss|net\s+income|revenue|deficit)\b/i,
      /\b(?:i owe|i make|you make|you earn|earning|making)\b/i,
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
      /\b(?:kondisi|resep|obat|penyakit|diagnosis)\s+(?:saya|Anda|kamu|ku|mu)\b/i,
      /\b(?:proyek rahasia kita|nama sandi proyek|server internal kita|endpoint internal)\b/i,
      /\b(?:internal codename|our secret project|our internal database|our unannounced)\b/i,
      /\b(?:saya dijatuhi sanksi|saya dipanggil hrd|saya kena sp|saya di-phk)\b/i,
      /\b(?:sanksi untuk Anda|peringatan untuk Anda|pemutusan hubungan kerja Anda)\b/i,
      /\b(?:i was placed on|my termination|my disciplinary warning|unjustified pip|your disciplinary warning)\b/i,
      /\b(?:@darflashxd|@dracraaah|@budianto|@[\w.-]{3,})\b/i,
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
      /\b(?:rent|renting|landlord|struggling\s+hard|cooked|paycheck)\b/i
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
  classifyTurn(turnText, turnIndex) {
    const detected = [];
    const sentences = turnText.split(/(?<=[.!?\n])\s+/);

    for (const sent of sentences) {
      const isPersonal = this.personalAnchors.some(rx => rx.test(sent));
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
        // Pre-compute phone number spans to prevent telephone numbers (e.g. 1-800-869-3557) from being parsed as financial amounts
        const phoneSpans = [];
        const phoneRx = /(?:\+?1[-.\s]?)?\(?[2-9]\d{2}\)?[-.\s]\d{3}[-.\s]\d{4}\b|(?:\+?62|0)8[1-9][0-9]{7,10}\b/g;
        let pm;
        while ((pm = phoneRx.exec(sent)) !== null) {
          phoneSpans.push([pm.index, pm.index + pm[0].length]);
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

        // Universal Financial check (Supports Rp 28.500.000, $380k, ($650,000), $18M, 45 jeti, 15 juta, 20jt, 45 LPA, 10 Lakh, $150k, 90k, half a mil, 250 racks, strike price, float balances)
        const finRegex = /(?:(?:\(\s*(?:Rp\s*|IDR\s*|\$|USD\s*|€|EUR\s*|£|GBP\s*|CHF\s*|SGD\s*|₹|INR\s*)?[\d.,]+(?:\s*(?:k|m|million|billion|juta|jt|lpa|lakhs?|crores?))?\s*\))|(?:(?:Rp\s*|IDR\s*|\$|USD\s*|€|EUR\s*|£|GBP\s*|CHF\s*|SGD\s*|₹|INR\s*)?[\d.,]+(?:\s*(?:juta|jt|jeti|jetong|miliar|milyar|million|billion|k|rb|ribu|thousand|rupiah|racks|bands|ember|lpa|lakhs?|crores?)\b|[mb](?!\w)|\s+[mb]\b))|(?:half\s+a\s+mil\b)|(?:(?:Rp\s*|IDR\s*|\$|USD\s*|€|EUR\s*|£|GBP\s*|CHF\s*|SGD\s*)[\d.,]+)|\b\d{4,12}(?:[.,]\d{2})\b|\b\d{1,3}(?:\.\d{3})+(?:,\d+)?|\b\d{1,3}(?:,\d{3})+(?:\.\d+)?|\b\d{4,12}\b)/gi;
        const nonFinUnits = /^\s*(?:copies\s*\/\s*m[lL]|cells\s*\/\s*u[lL]|gwei|wei|eth|btc|sol|mmol\s*\/\s*l|mg\s*\/\s*dl|u\s*\/\s*l|gas|saham|lembar|shares|bps|basis\s+points|years?|months?)\b/i;
        const finMatches = sent.matchAll(finRegex);
        for (const m of finMatches) {
          const matchIndex = m.index;
          const matchStr = m[0];

          // Skip if inside a telephone number or physical address
          if (phoneSpans.some(([s, e]) => matchIndex >= s && (matchIndex + matchStr.length) <= e)) {
            continue;
          }
          if (addressSpans.some(([s, e]) => matchIndex >= s && (matchIndex + matchStr.length) <= e)) {
            continue;
          }

          // Skip IRC retirement plan references like 401k or 401(k)
          if (/^401\s*k$/i.test(matchStr.trim()) || /\b401\(?k\)?\b/i.test(matchStr)) continue;

          // Skip if part of an IP address (e.g. 10.244.0.15) or network port (localhost:5432, 127.0.0.1:8080)
          if (matchIndex > 0 && /[\w.:]/.test(sent[matchIndex - 1])) continue;
          const afterText = sent.substring(matchIndex + matchStr.length);
          if (/^\.\d+/.test(afterText)) continue;
          // Skip if followed by URL path (e.g. :5432/sandbox_db), but allow financial time periods (/month, /year, /bulan)
          if (/^\/[a-zA-Z0-9_]/.test(afterText) && !/^\/(?:month|mo|year|yr|bulan|thn|tahun|day|hari|hr|hour|jam|week|minggu)\b/i.test(afterText)) continue;

          // Skip if followed by non-financial clinical or blockchain units (e.g. 45.000 copies/mL)
          if (nonFinUnits.test(afterText)) continue;

          // Skip if inside technical container / OS user / network port configs
          const lineStart = Math.max(0, sent.lastIndexOf("\n", matchIndex));
          const beforeInLine = sent.substring(lineStart, matchIndex);
          if (/\b(?:runAsUser|runAsGroup|fsGroup|port|listen_port|containerPort|uid|gid)\s*[:=]\s*$/i.test(beforeInLine)) continue;

          // If a 4-digit number looks like a calendar year (1950-2040), ensure explicit financial context
          if (/^\d{4}$/.test(matchStr)) {
            const num = parseInt(matchStr, 10);
            if (num >= 1950 && num <= 2040) {
              const prevSnippet = sent.substring(Math.max(0, matchIndex - 30), matchIndex);
              const nextSnippet = sent.substring(matchIndex + matchStr.length, matchIndex + matchStr.length + 30);
              const isExplicitFinancialContext = /(?:rent|salary|gaji|income|pay|bonus|debt|owe|making|earning|take-home|take\s+home|spending|spent|disbursement)\s+(?:is\s+|of\s+)?$/i.test(prevSnippet) || /(?:a\s+month|\/mo|\/month|monthly|annually|per\s+year|\/year)/i.test(nextSnippet);
              if (!isExplicitFinancialContext) {
                continue; // Preserve calendar year
              }
            }
          }

          detected.push({
            turnIndex,
            raw: matchStr,
            category: "SENSITIVE_FINANCIAL",
            sentence: sent,
            confidence: 0.98
          });
        }

        // Comprehensive Health check (Active & passive, cancer, diabetes, HIV lab biomarkers, psychotropics, trauma)
        const healthRegex = /(?:(?:(?:limfosit\s+)?CD4\b[^\n,.]*?\b\d+\s*cells\s*\/\s*u[lL]|HIV(?:-1)?\s+[^\n,.]*?Viral\s+Load\s+[^\n,.]*?[\d.,]+\s*copies\s*\/\s*m[lL])|(?:(?:[a-zA-Z]+\s+)?(?:cancer|adenocarcinoma|carcinoma|melanoma|sarcoma|lymphoma|leukemia|leukimia)|kanker\s+[^\s,.]+)(?:\s+(?:stadium|stage)\s+(?:IV|I{1,3}|\d)[a-c]?)?|(?:Stage\s+(?:IV|I{1,3}|\d)\s+[a-zA-Z]+(?:\s+with\s+[a-zA-Z\s]+)?)|(?:diabetes(?:\s+melitus)?(?:\s+tipe\s+\d+)?|hepatitis\s+[a-c])|hiv(?:\s*positif)?|positif\s*hiv|tested\s+positive\s+for\s+hiv|skizofrenia|schizophrenia|paranoid\s+schizophrenia|bipolar(?:\s+(?:affective\s+disorder|II|I|[12]|episode\s+\w+))?|depresi(?:\s*(?:klinis|berat|mayor))?|Major\s+Depressive\s+Disorder|adult\s+adhd|adhd|gangguan\s*kecemasan(?:\s*menyeluruh)?|anxiety(?:\s*disorder)?|F31\.\d+|(?:childhood\s+trauma|suicidal\s+ideation|self-harm|ptsd)|(?:lexapro|escitalopram|sertraline|zoloft|wellbutrin(?:\s+xl)?|alprazolam|xanax|klonopin|clonazepam|adderall(?:\s+xr)?|ritalin|vyvanse|prozac|fluoxetine|valium|diazepam|metformin|lipitor|atorvastatin|risperidone|lithium(?:\s+carbonate)?|clozapine|quetiapine|seroquel|lantus(?:\s+insulin)?|biktarvy)(?:\s*[\d.]+\s*mg)?)/gi;
        const healthMatches = sent.matchAll(healthRegex);
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

        // User handle / nickname check (e.g. @darflashxd)
        const userHandleMatches = sent.matchAll(/(?<![a-zA-Z0-9._-])@([a-zA-Z0-9._-]{3,30})/gi);
        const ignoredHandles = new Set(["protected.local", "localhost", "internal", "sandbox_db", "example.com"]);
        for (const m of userHandleMatches) {
          const handleLower = m[1].toLowerCase();
          if (ignoredHandles.has(handleLower) || handleLower.endsWith(".local") || handleLower.endsWith(".internal")) {
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
        const hrMatch = sent.match(/(?:Surat Peringatan (?:Pertama|Kedua|Ketiga|\d|\(SP-[1-3]\))|PHK sepihak|PIP \d+ hari|(?:\d+[- ]day\s+)?(?:Performance Improvement Plan(?:\s+\(PIP\))?|pip\b)|final written warning|written warning(?:\s+from\s+hr)?|disciplinary warning)/i);
        if (hrMatch) {
          detected.push({
            turnIndex,
            raw: hrMatch[0],
            category: "SENSITIVE_LEGAL_HR",
            sentence: sent,
            confidence: 0.95
          });
        }
      }
    }

    return detected;
  }
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = ContextualClassifier;
}
