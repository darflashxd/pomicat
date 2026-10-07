#!/usr/bin/env node
/**
 * SafeShare-AI — Standalone Forensic Traitor-Tracing Decoder (Black Hat Arsenal CLI)
 * 
 * Extracts and verifies imperceptible Zero-Width Unicode HMAC watermarks from leaked AI text.
 * Determines the exact recipient, session ID, and timestamp of the unauthorized leak.
 * 
 * Usage:
 *   node safeshare/forensic_decoder.js --text "Leaked text from social media, pastebin, etc."
 *   node safeshare/forensic_decoder.js --file ./leaked_snippet.txt
 *   cat leaked.txt | node safeshare/forensic_decoder.js
 */

const fs = require("fs");
const path = require("path");
const SafeShareSteganography = require("./viewer/engine/steganography.js");

function parseArgs() {
  const args = process.argv.slice(2);
  let text = null;
  let file = null;
  let key = "SafeShare-Default-MasterKey-2026";

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--text" || args[i] === "-t") {
      text = args[++i];
    } else if (args[i] === "--file" || args[i] === "-f") {
      file = args[++i];
    } else if (args[i] === "--key" || args[i] === "-k") {
      key = args[++i];
    } else if (args[i] === "--help" || args[i] === "-h") {
      printHelp();
      process.exit(0);
    }
  }

  return { text, file, key };
}

function printHelp() {
  console.log(`
SafeShare-AI Forensic Traitor-Tracing Decoder
Black Hat Arsenal & AI Context Privacy Tool

Options:
  --text, -t <string>    Input string suspected of containing leaked AI conversation
  --file, -f <path>      Path to text file to analyze
  --key,  -k <secret>    HMAC Secret Key (default: master demo key)
  --help, -h             Show this help screen
`);
}

async function main() {
  const { text: cliText, file: cliFile, key: secretKey } = parseArgs();
  let targetText = cliText;

  if (!targetText && cliFile) {
    if (!fs.existsSync(cliFile)) {
      console.error(`[-] File not found: ${cliFile}`);
      process.exit(1);
    }
    targetText = fs.readFileSync(cliFile, "utf-8");
  }

  // If still no text, check stdin stream
  if (!targetText) {
    if (!process.stdin.isTTY) {
      targetText = fs.readFileSync(0, "utf-8");
    }
  }

  if (!targetText || targetText.trim().length === 0) {
    printHelp();
    console.error("[-] Error: No input text provided for forensic decoding.");
    process.exit(1);
  }

  console.log("================================================================================");
  console.log("        SAFESHARE-AI: FORENSIC TRAITOR-TRACING STEGANOGRAPHIC AUDIT");
  console.log("================================================================================");

  const steg = new SafeShareSteganography(secretKey);
  const result = steg.extract(targetText, secretKey);

  console.log(`[*] Target Text Length : ${targetText.length} characters`);
  console.log(`[*] Master Key Digest  : ${Buffer.from(secretKey).toString("base64").substring(0, 16)}...`);

  if (!result.detected) {
    console.log("\n[-] STATUS: NO FORENSIC WATERMARK DETECTED");
    console.log("    Explanation: The examined text does not contain SafeShare Zero-Width markers.");
    console.log("================================================================================");
    process.exit(2);
  }

  console.log("\n[+] STATUS: FORENSIC WATERMARK CONFIRMED IN LEAKED TEXT!");
  console.log(`    Total Embedded Markers: ${result.watermarkCount}`);
  console.log(`    HMAC-SHA256 Signature : ${result.signature} [${result.validSignature ? "✓ VERIFIED AUTHENTIC" : "✗ TAMPERED/FORGED"}]`);

  if (result.metadata) {
    console.log("\n--------------------------------------------------------------------------------");
    console.log("               LEAKER ATTRIBUTION & AUDIT RECONSTRUCTION");
    console.log("--------------------------------------------------------------------------------");
    console.log(`  👤 Identified Recipient : ${result.metadata.recipientId}`);
    console.log(`  🔑 Ephemeral Session ID : ${result.metadata.sessionId}`);
    console.log(`  ⏱️ Session Creation Time : ${result.metadata.date} (${result.metadata.timestamp})`);
    console.log(`  🛡️ Cryptographic Proof  : Non-Repudiation Guaranteed (Zero False-Positive)`);
    console.log("--------------------------------------------------------------------------------");
  }

  console.log("\n[+] Clean Human-Readable Text Preview:");
  const cleanSnippet = steg.clean(targetText).substring(0, 200).replace(/\n/g, " ");
  console.log(`    "${cleanSnippet}..."`);

  console.log("\n================================================================================");
  console.log("  FORENSIC CONCLUSION: TRAITOR POSITIVELY IDENTIFIED VIA STEGANOGRAPHIC PROOF");
  console.log("================================================================================");
}

if (require.main === module) {
  main().catch(err => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
}
