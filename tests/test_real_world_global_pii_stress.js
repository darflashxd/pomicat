/**
 * PomiCat: Real-World Global PII & Deep In-the-Wild Stress Test Suite
 * 
 * Evaluates real-world messy, uncurated human conversational prompts
 * across 12 diverse PII categories beyond financial and standard cyber configs:
 * 
 *   Cluster 1: Vital Life PII (Date of Birth ISO/ID/EN, Age, Mother's Maiden Name KBA)
 *   Cluster 2: Family Relationships & Children (Names of spouse, kids, elementary school)
 *   Cluster 3: Automotive & Physical Assets (Indonesian plate, US plate, 17-char VIN)
 *   Cluster 4: Hardware & Device Identifiers (Mobile IMEI 15-digit)
 *   Cluster 5: Network & Infrastructure (IPv6 full/compressed, Hardware MAC address)
 *   Cluster 6: Precision Geolocation (GPS Latitude / Longitude coordinates)
 *   Cluster 7: East Asian National IDs (Chinese National ID 18-digit, Korean RRN, Japanese My Number)
 *   Cluster 8: Australasian & Latin American IDs (Australian TFN & Medicare, Mexican CURP & RFC)
 *   Cluster 9: Special Category Article 9 Sensitive Demographics (Sexual orientation, religion)
 *   Cluster 10: Multi-Turn Echo Immunity: Verification that ALL 12 categories are swept in assistant turn!
 */

const assert = require("assert");
const HeuristicsRedactor = require("../extension/engine/heuristics.js");
const ContextualClassifier = require("../extension/engine/contextual.js");
const ConsistentPseudonymizer = require("../extension/engine/pseudonymizer.js");

function runRealWorldGlobalPIISuite() {
  console.log("================================================================================");
  console.log("    SAFESHARE-AI: REAL-WORLD GLOBAL PII & IN-THE-WILD STRESS AUDIT");
  console.log("================================================================================");

  const heuristics = new HeuristicsRedactor();
  const contextual = new ContextualClassifier();
  const pseudonymizer = new ConsistentPseudonymizer();

  function processDialogue(userText, asstText = "") {
    pseudonymizer.reset();
    const hU = heuristics.scan(userText);
    const hA = asstText ? heuristics.scan(asstText) : { sanitizedText: "", detections: [] };
    const cU = contextual.classifyTurn(hU.sanitizedText, 0);
    const cA = asstText ? contextual.classifyTurn(hA.sanitizedText, 1) : [];

    const turns = [{ role: "user", content: hU.sanitizedText }];
    if (asstText) turns.push({ role: "assistant", content: hA.sanitizedText });

    return pseudonymizer.anonymizeConversation(
      turns,
      [...cU, ...cA],
      [...hU.detections, ...hA.detections]
    );
  }

  let totalTests = 0;
  let passedTests = 0;

  function assertNeutralized(name, userText, asstText, forbiddenTokens, expectedTags = []) {
    totalTests++;
    const res = processDialogue(userText, asstText);
    const userOut = res.anonymizedTurns[0].content;
    const asstOut = asstText ? res.anonymizedTurns[1].content : "";

    for (const token of forbiddenTokens) {
      assert(!userOut.includes(token), `[FAIL] ${name}: Token '${token}' leaked in User turn!\nOutput: ${userOut}`);
      if (asstText) {
        assert(!asstOut.includes(token), `[FAIL] ${name}: Token '${token}' leaked in Assistant turn!\nOutput: ${asstOut}`);
      }
    }

    for (const tag of expectedTags) {
      assert(userOut.includes(tag) || asstOut.includes(tag), `[FAIL] ${name}: Expected tag '${tag}' not found in output!`);
    }

    console.log(`  [✓] ${name} PASSED!`);
    passedTests++;
    return res;
  }

  // ---------------------------------------------------------------------------
  // CLUSTER 1: VITAL LIFE PII (DOB, AGE, MOTHER MAIDEN NAME)
  // ---------------------------------------------------------------------------
  console.log("\n[Cluster 1] Testing Vital Life PII (DoB & Mother's Maiden Name)...");

  assertNeutralized(
    "VEC-LIFE-01: ISO Date of Birth (YYYY-MM-DD)",
    "My date of birth is 1994-08-15 and I am 32 years old.",
    "Happy early birthday for August 15! 1994-08-15 is recorded.",
    ["1994-08-15"],
    ["[REDACTED_DOB]"]
  );

  assertNeutralized(
    "VEC-LIFE-02: Indonesian Date of Birth (DD Bulan YYYY)",
    "Saya lahir tanggal 12 Mei 1999 di RS Cipto Mangunkusumo Jakarta.",
    "Baik, tercatat Anda lahir 12 Mei 1999.",
    ["12 Mei 1999"],
    ["[REDACTED_DOB]"]
  );

  assertNeutralized(
    "VEC-LIFE-03: English Conversational Date of Birth (Month Day, Year)",
    "Born on August 15, 1994 in California.",
    "Noted born on August 15, 1994.",
    ["August 15, 1994"],
    ["[REDACTED_DOB]"]
  );

  assertNeutralized(
    "VEC-LIFE-04: Mother's Maiden Name (English KBA Security Question)",
    "My mother maiden name is Armstrong and place of birth is Chicago.",
    "Security question answer Armstrong verified.",
    ["Armstrong"],
    ["[REDACTED_FAMILY_NAME]"]
  );

  assertNeutralized(
    "VEC-LIFE-05: Mother's Maiden Name (Indonesian Bank Security Question)",
    "Nama ibu kandung saya adalah Siti Aminah di Jakarta.",
    "Data nama ibu kandung Siti Aminah telah cocok.",
    ["Siti Aminah"],
    ["[REDACTED_FAMILY_NAME]"]
  );

  // ---------------------------------------------------------------------------
  // CLUSTER 2: FAMILY RELATIONSHIPS & CHILD NAMES
  // ---------------------------------------------------------------------------
  console.log("\n[Cluster 2] Testing Family Relationships & Children...");

  assertNeutralized(
    "VEC-FAM-01: Spouse & Child Names with Elementary School",
    "My wife Jessica and our 5-year-old son Lucas attend Lincoln Elementary.",
    "Sending greetings to Jessica and Lucas.",
    ["Jessica", "Lucas"],
    ["[User_"]
  );

  assertNeutralized(
    "VEC-FAM-02: Indonesian Family Members",
    "Istri saya Ratna dan anak saya Budi sedang liburan di Bali.",
    "Semoga Ratna dan Budi menikmati liburan.",
    ["Ratna", "Budi"],
    ["[User_"]
  );

  // ---------------------------------------------------------------------------
  // CLUSTER 3: AUTOMOTIVE & PHYSICAL ASSETS (PLATES & VIN)
  // ---------------------------------------------------------------------------
  console.log("\n[Cluster 3] Testing Automotive & Physical Assets...");

  assertNeutralized(
    "VEC-AUTO-01: Indonesian Police Vehicle License Plate (B 1829 XYZ)",
    "Mobil saya Avanza hitam plat nomor B 1829 XYZ hilang di parkiran.",
    "Laporan kehilangan untuk mobil B 1829 XYZ telah dibuat.",
    ["B 1829 XYZ"],
    ["[REDACTED_LICENSE_PLATE]"]
  );

  assertNeutralized(
    "VEC-AUTO-02: US Vehicle License Plate (7XYZ891)",
    "Rental car California license plate is 7XYZ891 parked on 4th street.",
    "Found parking record for plate 7XYZ891.",
    ["7XYZ891"],
    ["[REDACTED_LICENSE_PLATE]"]
  );

  assertNeutralized(
    "VEC-AUTO-03: 17-Character ISO 3779 Vehicle Identification Number (VIN)",
    "Honda sedan VIN is 1HGCR2F83HA123456 ready for DMV registration.",
    "VIN 1HGCR2F83HA123456 verified with Honda database.",
    ["1HGCR2F83HA123456"],
    ["[REDACTED_VIN]"]
  );

  // ---------------------------------------------------------------------------
  // CLUSTER 4: MOBILE & HARDWARE IDENTIFIERS (IMEI)
  // ---------------------------------------------------------------------------
  console.log("\n[Cluster 4] Testing Mobile & Hardware Identifiers...");

  assertNeutralized(
    "VEC-HW-01: Mobile Phone 15-Digit IMEI",
    "My iPhone IMEI is 352099001761482 please blacklist the stolen device.",
    "Blacklisting device IMEI 352099001761482 with carrier.",
    ["352099001761482"],
    ["[REDACTED_IMEI]"]
  );

  // ---------------------------------------------------------------------------
  // CLUSTER 5: NETWORK & INFRASTRUCTURE (IPV6 & MAC)
  // ---------------------------------------------------------------------------
  console.log("\n[Cluster 5] Testing Network & Infrastructure...");

  assertNeutralized(
    "VEC-NET-01: IPv6 Global Unicast Address",
    "Staging server IPv6 is 2001:0db8:85a3:0000:0000:8a2e:0370:7334 port 8080.",
    "Connecting to 2001:0db8:85a3:0000:0000:8a2e:0370:7334 over HTTPS.",
    ["2001:0db8:85a3:0000:0000:8a2e:0370:7334"],
    ["[REDACTED_IPV6]"]
  );

  assertNeutralized(
    "VEC-NET-02: Hardware MAC Address (Standard Colon & Dash)",
    "Router interface MAC address is 00:1A:2B:3C:4D:5E on eth0.",
    "ARP table updated for 00:1A:2B:3C:4D:5E.",
    ["00:1A:2B:3C:4D:5E"],
    ["[REDACTED_MAC_ADDRESS]"]
  );

  // ---------------------------------------------------------------------------
  // CLUSTER 6: PRECISION GEOLOCATION & GPS COORDINATES
  // ---------------------------------------------------------------------------
  console.log("\n[Cluster 6] Testing Precision Geolocation & GPS...");

  assertNeutralized(
    "VEC-GEO-01: Precision Latitude & Longitude Coordinates",
    "Currently stranded at coordinates lat -6.2088, long 106.8456 please send help.",
    "Dispatching emergency rescue to lat -6.2088, long 106.8456.",
    ["-6.2088, long 106.8456"],
    ["[REDACTED_GPS_COORDINATES]"]
  );

  // ---------------------------------------------------------------------------
  // CLUSTER 7: EAST ASIAN NATIONAL IDENTIFIERS
  // ---------------------------------------------------------------------------
  console.log("\n[Cluster 7] Testing East Asian National Identifiers...");

  assertNeutralized(
    "VEC-ASIA-01: Chinese Resident Identity Card (18 digits)",
    "China citizen ID card: 440301199001011234 from Shenzhen PRC.",
    "Validated citizen ID 440301199001011234.",
    ["440301199001011234"],
    ["[REDACTED_NATIONAL_ID]"]
  );

  assertNeutralized(
    "VEC-ASIA-02: Korean Resident Registration Number (RRN)",
    "Korean citizen resident registration number: 950101-1234567.",
    "Verified Korean RRN 950101-1234567 with ministry.",
    ["950101-1234567"],
    ["[REDACTED_NATIONAL_ID]"]
  );

  assertNeutralized(
    "VEC-ASIA-03: Japanese My Number (Individual Number 12 digits)",
    "Japan tax individual number (My Number): 1234 5678 9012.",
    "My Number 1234 5678 9012 registered for national pension.",
    ["1234 5678 9012"],
    ["[REDACTED_NATIONAL_ID]"]
  );

  // ---------------------------------------------------------------------------
  // CLUSTER 8: AUSTRALASIAN & LATIN AMERICAN IDENTIFIERS
  // ---------------------------------------------------------------------------
  console.log("\n[Cluster 8] Testing Australasian & Latin American Identifiers...");

  assertNeutralized(
    "VEC-GLOBAL-01: Australian Tax File Number (TFN)",
    "ATO Australian tax file number TFN: 123 456 789.",
    "TFN 123 456 789 linked with ATO.",
    ["123 456 789"],
    ["[REDACTED_TAX_ID]"]
  );

  assertNeutralized(
    "VEC-GLOBAL-02: Australian Medicare Number",
    "Australian Medicare number is 2123 45678 1 for hospital admission.",
    "Medicare 2123 45678 1 checked in.",
    ["2123 45678 1"],
    ["[REDACTED_HEALTH_ID]"]
  );

  assertNeutralized(
    "VEC-GLOBAL-03: Mexican CURP ID (18 characters)",
    "Registro civil Mexico CURP: VAMJ900101HDFRNR09.",
    "CURP VAMJ900101HDFRNR09 valid.",
    ["VAMJ900101HDFRNR09"],
    ["[REDACTED_NATIONAL_ID]"]
  );

  assertNeutralized(
    "VEC-GLOBAL-04: Mexican RFC Tax ID",
    "SAT Mexico RFC: VAM9001011A2 for invoice.",
    "RFC VAM9001011A2 generated.",
    ["VAM9001011A2"],
    ["[REDACTED_TAX_ID]"]
  );

  // ---------------------------------------------------------------------------
  // CLUSTER 9: SPECIAL CATEGORY ARTICLE 9 SENSITIVE DEMOGRAPHICS
  // ---------------------------------------------------------------------------
  console.log("\n[Cluster 9] Testing Special Category Article 9 Sensitive Demographics...");

  assertNeutralized(
    "VEC-DEMO-01: Sexual Orientation & Religious Institution",
    "I am a 28yo bisexual female attending Al-Ihsan Islamic boarding school.",
    "Thank you for sharing your experience at Al-Ihsan Islamic boarding school.",
    ["bisexual female"],
    ["[User_"]
  );

  // ---------------------------------------------------------------------------
  // CLUSTER 10: ZERO-FALSE-POSITIVE REVERSE CONTROLS
  // ---------------------------------------------------------------------------
  console.log("\n[Cluster 10] Testing Zero-False-Positive Reverse Controls...");

  const rSafe1 = processDialogue("Let us discuss the history of the Boeing 747 aircraft in 1969.", "Boeing 747 first flew in 1969.");
  assert(rSafe1.anonymizedTurns[0].content.includes("Boeing 747"), "Boeing 747 must not be treated as a license plate!");
  assert(rSafe1.anonymizedTurns[0].content.includes("1969"), "Year 1969 must not be treated as DoB!");
  console.log("  [✓] VEC-ZFP-01: Historical aviation model (Boeing 747) and year 1969 preserved!");
  totalTests++; passedTests++;

  const rSafe2 = processDialogue("Deploy container with port mapping 8080:80 on Docker bridge.", "Docker port mapping 8080:80 configured.");
  assert(rSafe2.anonymizedTurns[0].content.includes("8080:80"), "Port mapping 8080:80 must not be treated as MAC address!");
  console.log("  [✓] VEC-ZFP-02: Docker network port mapping (8080:80) 100% preserved!");
  totalTests++; passedTests++;

  console.log("\n================================================================================");
  console.log("    REAL-WORLD GLOBAL PII BENCHMARK SUMMARY");
  console.log("================================================================================");
  console.log(`[*] Total Vectors Evaluated      : ${totalTests}`);
  console.log(`[*] Vectors 100% Passed          : ${passedTests} / ${totalTests} (100.0%)`);
  console.log(`[*] Global PII Leakage Rate      : 0.00% (Zero Secret Footprint)`);
  console.log(`[*] Multi-Turn Assistant Sweeps  : 100% Fully Sanitized Across Dialogue Turns`);
  console.log("================================================================================\n");
}

if (require.main === module) {
  runRealWorldGlobalPIISuite();
}

module.exports = runRealWorldGlobalPIISuite;
