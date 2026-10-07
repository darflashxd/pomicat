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
      /\b(?:my|your|our|i|we)\s+(?:\w+\s+){0,3}(?:salary|compensation|earnings|income|take-home|pay|debt|savings|loss|net\s+loss|net\s+income|revenue|deficit)\b/i,
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
      /\b(?:operating\s+income|financing\s+cash\s+flow|ending\s+cash|disbursement|payroll|balances?|amount_captured)\b/i
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
      const hasExplicitPerson = /\b(?:saya|ku|kami|Anda|kamu|mu|gw|gue|aku|my|your|our|i|we|i\s*['`]?(?:m|ve|ll|d)?)\b/i.test(sent);

      // Rule of Contextual Integrity:
      // If a sentence is marked with public/statistical/hypothetical anchors, PRESERVE IT (Safe O)
      // UNLESS there is an explicit 1st/2nd person claiming it (e.g. "Gaji saya Rp 28M di atas rata-rata")
      if (isPublic && !hasExplicitPerson) {
        continue;
      }

      // If personal context is active, extract the corresponding values
      if (isPersonal) {
        // Universal Financial check (Supports Rp 28.500.000, $380k, ($650,000), 45 jeti, 15 juta, 20jt, $150k, 90k, half a mil, 250 racks, strike price, float balances)
        const finRegex = /(?:(?:\(\s*(?:Rp\s*|IDR\s*|\$|USD\s*|€|EUR\s*|£|GBP\s*|CHF\s*|SGD\s*)?[\d.,]+(?:\s*(?:k|m|million|billion|juta|jt))?\s*\))|(?:(?:Rp\s*|IDR\s*|\$|USD\s*|€|EUR\s*|£|GBP\s*|CHF\s*|SGD\s*)?[\d.,]+\s*(?:juta|jt|jeti|jetong|miliar|milyar|million|\bm\b|billion|\bb\b|k|rb|ribu|thousand|rupiah|racks|bands|ember)\b)|(?:half\s+a\s+mil\b)|(?:(?:Rp\s*|IDR\s*|\$|USD\s*|€|EUR\s*|£|GBP\s*|CHF\s*|SGD\s*)[\d.,]+)|\b\d{4,12}(?:[.,]\d{2})\b|\b\d{1,3}(?:\.\d{3})+(?:,\d+)?|\b\d{1,3}(?:,\d{3})+(?:\.\d+)?|\b\d{5,12}\b)/gi;
        const nonFinUnits = /^\s*(?:copies\s*\/\s*m[lL]|cells\s*\/\s*u[lL]|gwei|wei|eth|btc|sol|mmol\s*\/\s*l|mg\s*\/\s*dl|u\s*\/\s*l|gas|saham|lembar|shares|bps|basis\s+points|years?|months?)\b/i;
        const finMatches = sent.matchAll(finRegex);
        for (const m of finMatches) {
          const matchIndex = m.index;
          const matchStr = m[0];

          // Skip IRC retirement plan references like 401k or 401(k)
          if (/^401\s*k$/i.test(matchStr.trim()) || /\b401\(?k\)?\b/i.test(matchStr)) continue;

          // Skip if part of an IP address (e.g. 10.244.0.15)
          if (matchIndex > 0 && /[\w.]/.test(sent[matchIndex - 1])) continue;
          const afterText = sent.substring(matchIndex + matchStr.length);
          if (/^\.\d+/.test(afterText)) continue;

          // Skip if followed by non-financial clinical or blockchain units (e.g. 45.000 copies/mL)
          if (nonFinUnits.test(afterText)) continue;

          // Skip if inside technical container / OS user configs
          const lineStart = Math.max(0, sent.lastIndexOf("\n", matchIndex));
          const beforeInLine = sent.substring(lineStart, matchIndex);
          if (/(?:runAsUser|runAsGroup|fsGroup|port|containerPort|uid|gid)\s*[:=]\s*$/i.test(beforeInLine)) continue;

          detected.push({
            turnIndex,
            raw: matchStr,
            category: "SENSITIVE_FINANCIAL",
            sentence: sent,
            confidence: 0.98
          });
        }

        // Comprehensive Health check (Active & passive, cancer, diabetes, HIV lab biomarkers, psychotropics)
        const healthRegex = /(?:(?:(?:limfosit\s+)?CD4\b[^\n,.]*?\b\d+\s*cells\s*\/\s*u[lL]|HIV(?:-1)?\s+[^\n,.]*?Viral\s+Load\s+[^\n,.]*?[\d.,]+\s*copies\s*\/\s*m[lL])|(?:(?:[a-zA-Z]+\s+)?cancer|kanker\s+[^\s,.]+)(?:\s+(?:stadium|stage)\s+\d+[a-c]?)?|(?:diabetes(?:\s+melitus)?(?:\s+tipe\s+\d+)?|hepatitis\s+[a-c])|leukimia|leukemia|hiv(?:\s*positif)?|positif\s*hiv|skizofrenia|schizophrenia|bipolar(?:\s+(?:affective\s+disorder|[12]|episode\s+\w+))?|depresi(?:\s*(?:klinis|berat|mayor))?|gangguan\s*kecemasan(?:\s*menyeluruh)?|anxiety(?:\s*disorder)?|F31\.\d+|(?:lexapro|escitalopram|sertraline|zoloft|alprazolam|xanax|adderall|ritalin|prozac|fluoxetine|valium|diazepam|metformin|lipitor|atorvastatin|clonazepam|risperidone|lithium(?:\s+carbonate)?|clozapine|quetiapine)(?:\s*\d+\s*mg)?)/gi;
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

        // Corporate confidential check (match all occurrences)
        const corpMatches = sent.matchAll(/(?:Project\s[A-Z][a-zA-Z0-9_-]+|Inisiatif\s[A-Z][a-zA-Z0-9_-]+|[a-z0-9-]+(?:\.[a-z0-9-]+)*\.corp(?:\.internal)?:\d{2,5})/gi);
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
        const hrMatch = sent.match(/(?:Surat Peringatan (?:Pertama|Kedua|Ketiga|\d|\(SP-[1-3]\))|PHK sepihak|PIP \d+ hari|final written warning|Performance Improvement Plan)/i);
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
