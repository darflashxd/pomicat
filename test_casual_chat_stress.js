/**
 * SafeShare-AI — Comprehensive Casual & Natural Language Stress Test
 * Validates that SafeShare redacts 100% of real-world informal, casual, slang,
 * and conversational chats in both Indonesian and English without requiring rigid formal grammar.
 */

const assert = require("assert");
const HeuristicsRedactor = require("./extension/engine/heuristics.js");
const ContextualClassifier = require("./extension/engine/contextual.js");
const ConsistentPseudonymizer = require("./extension/engine/pseudonymizer.js");

function runCasualChatAudit() {
  console.log("================================================================================");
  console.log("       SAFESHARE-AI: 20 CASUAL & NATURAL LANGUAGE STRESS-TEST SCENARIOS");
  console.log("================================================================================");

  const heuristics = new HeuristicsRedactor();
  const contextual = new ContextualClassifier();
  const pseudonymizer = new ConsistentPseudonymizer();

  function scanAndAnonymize(turns) {
    pseudonymizer.reset();
    const detectedContextual = [];
    const intermediateTurns = [];

    turns.forEach((t, i) => {
      const hRes = heuristics.scan(t.content);
      const cRes = contextual.classifyTurn(hRes.sanitizedText, i);
      detectedContextual.push(...cRes);
      intermediateTurns.push({ role: t.role, content: hRes.sanitizedText });
    });

    return pseudonymizer.anonymizeConversation(intermediateTurns, detectedContextual);
  }

  const testCases = [
    // Case 1: Casual Indonesian Introduction + Juta & Jt
    {
      id: "CASUAL-01",
      name: "Halo saya [Nama] + gaji gw 15 juta + cicilan 5jt",
      turns: [
        { role: "user", content: "Halo saya Budi Santoso, gaji gw 15 juta dan cicilan 5jt per bulan." }
      ],
      validate: (out) => {
        assert(!out[0].content.includes("Budi Santoso"), "Name must be redacted");
        assert(!out[0].content.includes("15 juta"), "15 juta must be redacted");
        assert(!out[0].content.includes("5jt"), "5jt must be redacted");
      }
    },
    // Case 2: Nama lengkap saya
    {
      id: "CASUAL-02",
      name: "Nama lengkap saya + take home pay 20jt",
      turns: [
        { role: "user", content: "Nama lengkap saya Ahmad Fauzi, take home pay 20jt per bulan." }
      ],
      validate: (out) => {
        assert(!out[0].content.includes("Ahmad Fauzi"), "Name must be redacted");
        assert(!out[0].content.includes("20jt"), "20jt must be redacted");
      }
    },
    // Case 3: Perkenalkan saya + gaji di kantor cuma 8.5 juta
    {
      id: "CASUAL-03",
      name: "Perkenalkan saya + gaji di kantor 8.5 juta",
      turns: [
        { role: "user", content: "Perkenalkan saya Siti Nurhaliza, gaji di kantor cuma 8.5 juta." }
      ],
      validate: (out) => {
        assert(!out[0].content.includes("Siti Nurhaliza"));
        assert(!out[0].content.includes("8.5 juta"));
      }
    },
    // Case 4: Perkenalkan namaku + uang saku 3jt
    {
      id: "CASUAL-04",
      name: "Perkenalkan namaku + kompensasi 3jt",
      turns: [
        { role: "user", content: "Perkenalkan namaku Dimas Pratama, uang saku dan kompensasi 3jt." }
      ],
      validate: (out) => {
        assert(!out[0].content.includes("Dimas Pratama"));
        assert(!out[0].content.includes("3jt"));
      }
    },
    // Case 5: Nama gw + THP 35 juta
    {
      id: "CASUAL-05",
      name: "Nama gw + thp 35 juta",
      turns: [
        { role: "user", content: "Nama gw Kevin Sanjaya, thp 35 juta sebulan." }
      ],
      validate: (out) => {
        assert(!out[0].content.includes("Kevin Sanjaya"));
        assert(!out[0].content.includes("35 juta"));
      }
    },
    // Case 6: Panggil saya + hutang pinjol 10jt
    {
      id: "CASUAL-06",
      name: "Panggil saya + hutang pinjol 10jt",
      turns: [
        { role: "user", content: "Panggil saja saya Hendra Wijaya, hutang pinjol 10jt menumpuk." }
      ],
      validate: (out) => {
        assert(!out[0].content.includes("Hendra Wijaya"));
        assert(!out[0].content.includes("10jt"));
      }
    },
    // Case 7: English - My name is + salary 90k
    {
      id: "CASUAL-07",
      name: "English: My name is + salary is 90k",
      turns: [
        { role: "user", content: "My name is John Miller, my salary is 90k annually." }
      ],
      validate: (out) => {
        assert(!out[0].content.includes("John Miller"));
        assert(!out[0].content.includes("90k"));
      }
    },
    // Case 8: English - My full name is + making 120k
    {
      id: "CASUAL-08",
      name: "English: My full name is + making 120k",
      turns: [
        { role: "user", content: "My full name is Sarah Connor, making 120k as lead engineer." }
      ],
      validate: (out) => {
        assert(!out[0].content.includes("Sarah Connor"));
        assert(!out[0].content.includes("120k"));
      }
    },
    // Case 9: English - I am + earning 150k
    {
      id: "CASUAL-09",
      name: "English: I am + earning 150k",
      turns: [
        { role: "user", content: "I am Michael Scott, earning 150k per year." }
      ],
      validate: (out) => {
        assert(!out[0].content.includes("Michael Scott"));
        assert(!out[0].content.includes("150k"));
      }
    },
    // Case 10: English - Im + debt is 25k
    {
      id: "CASUAL-10",
      name: "English: Im + debt is 25k",
      turns: [
        { role: "user", content: "Im David Miller, personal debt is 25k on credit cards." }
      ],
      validate: (out) => {
        assert(!out[0].content.includes("David Miller"));
        assert(!out[0].content.includes("25k"));
      }
    },
    // Case 11: Active verb: Psikiater meresepkan saya Lexapro 20mg
    {
      id: "CASUAL-11",
      name: "Psikiater meresepkan saya Lexapro 20mg",
      turns: [
        { role: "user", content: "Psikiater meresepkan saya Lexapro 20mg setiap malam." }
      ],
      validate: (out) => {
        assert(!out[0].content.includes("Lexapro 20mg"));
        assert(out[0].content.includes("[CONFIDENTIAL_HEALTH_RECORD_1]"));
      }
    },
    // Case 12: Dokter memberi saya obat Zoloft 50mg
    {
      id: "CASUAL-12",
      name: "Dokter memberi saya obat Zoloft 50mg",
      turns: [
        { role: "user", content: "Dokter memberi saya obat Zoloft 50mg untuk terapi." }
      ],
      validate: (out) => {
        assert(!out[0].content.includes("Zoloft 50mg"));
        assert(out[0].content.includes("[CONFIDENTIAL_HEALTH_RECORD_1]"));
      }
    },
    // Case 13: Saya sedang mengonsumsi Xanax 1mg
    {
      id: "CASUAL-13",
      name: "Saya sedang mengonsumsi Xanax 1mg",
      turns: [
        { role: "user", content: "Saya sedang mengonsumsi Xanax 1mg saat serangan panik." }
      ],
      validate: (out) => {
        assert(!out[0].content.includes("Xanax 1mg"));
        assert(out[0].content.includes("[CONFIDENTIAL_HEALTH_RECORD_1]"));
      }
    },
    // Case 14: Kemarin saya divonis diabetes tipe 2
    {
      id: "CASUAL-14",
      name: "Kemarin saya divonis diabetes tipe 2",
      turns: [
        { role: "user", content: "Kemarin saya divonis diabetes tipe 2 oleh dokter spesialis." }
      ],
      validate: (out) => {
        assert(!out[0].content.includes("diabetes tipe 2"));
      }
    },
    // Case 15: Hasil tes menyatakan saya positif HIV
    {
      id: "CASUAL-15",
      name: "Hasil tes menyatakan saya positif HIV",
      turns: [
        { role: "user", content: "Hasil tes darah menyatakan saya positif HIV." }
      ],
      validate: (out) => {
        assert(!out[0].content.toLowerCase().includes("positif hiv"));
      }
    },
    // Case 16: Saya menderita depresi klinis berat
    {
      id: "CASUAL-16",
      name: "Saya menderita depresi klinis berat",
      turns: [
        { role: "user", content: "Saya menderita depresi klinis berat sejak bulan lalu." }
      ],
      validate: (out) => {
        assert(!out[0].content.includes("depresi klinis berat"));
      }
    },
    // Case 17: Terminal Powerline prompt with handle @darflashxd
    {
      id: "CASUAL-17",
      name: "Terminal Powerline prompt with handle @darflashxd",
      turns: [
        { role: "user", content: "Mon 28 Sep - 18:24  ~  @darflashxd  node demo.js" }
      ],
      validate: (out) => {
        assert(!out[0].content.includes("darflashxd"));
        assert(out[0].content.includes("@[user]"));
      }
    },
    // Case 18: Terminal whoami and $USER output
    {
      id: "CASUAL-18",
      name: "Terminal whoami and $USER command outputs",
      turns: [
        { role: "user", content: "Output sistem: whoami: darflashxd, echo $USER: darflashxd" }
      ],
      validate: (out) => {
        assert(!out[0].content.includes("darflashxd"));
        assert(out[0].content.includes("[user]"));
      }
    },
    // Case 19: Full Casual Dialog with AI Assistant Projections
    {
      id: "CASUAL-19",
      name: "Full 2-Turn Dialogue with Assistant 2nd-person projections",
      turns: [
        { role: "user", content: "Gaji gw 15 juta dan cicilan 5jt. Berapa sisa uang dan kenaikan 20%?" },
        { role: "assistant", content: "Dari gaji Anda yang 15 juta, kenaikan 20% menjadi sekitar 18 juta. Sisa uang Anda setelah cicilan adalah 10 juta per bulan." }
      ],
      validate: (out) => {
        assert(!out[0].content.includes("15 juta"));
        assert(!out[0].content.includes("5jt"));
        assert(!out[1].content.includes("15 juta"));
        assert(!out[1].content.includes("18 juta"));
        assert(!out[1].content.includes("10 juta"));
      }
    },
    // Case 20: Generic drug cross-turn leakage in assistant reply
    {
      id: "CASUAL-20",
      name: "Generic drug escitalopram in assistant reply",
      turns: [
        { role: "user", content: "Psikiater meresepkan saya Lexapro 20mg." },
        { role: "assistant", content: "Jangan menghentikan escitalopram 20mg sendiri tanpa konsultasi." }
      ],
      validate: (out) => {
        assert(!out[0].content.includes("Lexapro 20mg"));
        assert(!out[1].content.toLowerCase().includes("escitalopram"));
      }
    }
  ];

  let passed = 0;
  testCases.forEach((tc, idx) => {
    try {
      const res = scanAndAnonymize(tc.turns);
      tc.validate(res.anonymizedTurns);
      passed++;
      console.log(`  [✓] Case ${String(idx + 1).padStart(2, "0")} PASSED: ${tc.name}`);
    } catch (err) {
      console.error(`  [✗] Case ${String(idx + 1).padStart(2, "0")} FAILED: ${tc.name}`);
      console.error("      Error:", err.message);
      throw err;
    }
  });

  console.log("\n================================================================================");
  console.log(`  RESULT: ${passed}/${testCases.length} CASUAL & INFORMAL CHAT CASES PASSED 100%!`);
  console.log("================================================================================");
}

runCasualChatAudit();
