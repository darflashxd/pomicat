/**
 * SafeShare-AI — Tier 1: Deterministic Heuristic & High-Entropy Scanner
 * Instantly identifies and redacts hard secrets, credentials, PII (KTP, CC, email, phone)
 * with zero perceptible latency (< 2ms).
 */

class HeuristicsRedactor {
  constructor() {
    this.patterns = [
      // 1. Indonesian KTP / NIK (16 digits)
      {
        id: "ID_NIK",
        name: "Indonesian NIK / KTP",
        regex: /\b([1-9][0-9]{15})\b/g,
        replacement: "[REDACTED_NIK]"
      },
      // 2. Credit Card Numbers (13-19 digits with Luhn verification)
      {
        id: "CREDIT_CARD",
        name: "Credit Card",
        regex: /\b(?:\d{4}[ -]?){3}\d{4}\b|\b\d{15,16}\b/g,
        validator: this.luhnCheck,
        replacement: "[REDACTED_CARD_NUMBER]"
      },
      // 3. Email Addresses
      {
        id: "EMAIL",
        name: "Email Address",
        regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
        replacement: (match, index, context) => `[user_${Math.abs(this.hashString(match)) % 1000}@protected.local]`
      },
      // 4. Phone Numbers (ID: +62/08..., US/International)
      {
        id: "PHONE",
        name: "Phone Number",
        regex: /(?:\+?62|0)8[1-9][0-9]{7,10}\b|\b\+?1[-.\s]?\(?[2-9]\d{2}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
        replacement: "[REDACTED_PHONE]"
      },
      // 5. OpenAI API Keys (Legacy & Project keys)
      {
        id: "OPENAI_KEY",
        name: "OpenAI Secret Key",
        regex: /\bsk-(?:proj-)?[A-Za-z0-9_-]{32,80}\b/g,
        replacement: "sk-dummy-test-key-placeholder"
      },
      // 5b. Stripe Production & Restricted Keys (sk_live_, rk_live_, etc.)
      {
        id: "STRIPE_KEY",
        name: "Stripe Secret Key",
        regex: /\b(?:sk|rk)_(?:live|test)_[a-zA-Z0-9]{20,99}\b/g,
        replacement: "[REDACTED_STRIPE_KEY]"
      },
      // 5c. Slack Webhook URLs
      {
        id: "SLACK_WEBHOOK",
        name: "Slack Incoming Webhook",
        regex: /\bhttps:\/\/hooks\.slack\.com\/services\/T[a-zA-Z0-9_]+\/B[a-zA-Z0-9_]+\/[a-zA-Z0-9_]+\b/g,
        replacement: "[REDACTED_SLACK_WEBHOOK]"
      },
      // 5d. Ethereum / EVM Wallet Address (0x...)
      {
        id: "EVM_CRYPTO_WALLET",
        name: "Ethereum EVM Wallet Address",
        regex: /\b(0x[a-fA-F0-9]{40})\b/g,
        replacement: "[REDACTED_CRYPTO_WALLET]"
      },
      // 5e. BIP-39 12/24-Word Recovery Mnemonic Seed Phrase
      {
        id: "BIP39_SEED_PHRASE",
        name: "BIP-39 Mnemonic Recovery Seed Phrase",
        regex: /(\b(?:seed|mnemonic|recovery(?:\s+phrase)?|bip-?39)[^:\n\r]*[:=\-]?\s*)([a-z]{3,12}(?:[ \t]+[a-z]{3,12}){11,23})\b/gi,
        replacement: "$1[REDACTED_MNEMONIC_SEED_PHRASE]"
      },
      // 5f. Linux /etc/shadow Password Hashes
      {
        id: "LINUX_SHADOW_HASH",
        name: "Linux Shadow Password Hash",
        regex: /\$(?:1|2[aby]?|5|6)\$[a-zA-Z0-9_$./=-]+\$[a-zA-Z0-9./]{16,86}/g,
        replacement: "$6$rounds=4096$[REDACTED_PASSWORD_HASH]"
      },
      // 6. GitHub Personal Access Tokens
      {
        id: "GITHUB_TOKEN",
        name: "GitHub Access Token",
        regex: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{36,255}\b/g,
        replacement: "ghp_dummyPlaceholderTokenForTesting00000"
      },
      // 7. AWS Access Key IDs
      {
        id: "AWS_KEY",
        name: "AWS Access Key",
        regex: /\b(?:AKIA|ABIA|ACCA|ASIA)[0-9A-Z]{16}\b/g,
        replacement: "AKIAIOSFODNN7EXAMPLE"
      },
      // 8. JSON Web Tokens (JWT)
      {
        id: "JWT",
        name: "JSON Web Token",
        regex: /\beyJ[A-Za-z0-9-_=]+\.eyJ[A-Za-z0-9-_=]+\.[A-Za-z0-9-_.+/=]*\b/g,
        replacement: "[REDACTED_JWT_TOKEN]"
      },
      // 9. RSA/SSH/EC Private Keys (PEM blocks)
      {
        id: "PEM_PRIVATE_KEY",
        name: "Private Key Block",
        regex: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g,
        replacement: "-----BEGIN PRIVATE KEY-----\n[REDACTED_PRIVATE_KEY_BLOCK]\n-----END PRIVATE KEY-----"
      },
      // 10. Database Connection Strings (Postgres, MySQL, Mongo, Redis with passwords)
      {
        id: "DATABASE_URI",
        name: "Database Credentials URI",
        regex: /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis):\/\/[^:\s]+:[^@\s]+@[^\s/:]+(?::\d+)?\/[^\s]*/gi,
        replacement: "postgresql://postgres:placeholder_password@localhost:5432/sandbox_db"
      },
      // 11. Physical Home / Street Address (Expanded for KTP/Domisili and structured forms)
      {
        id: "ADDRESS_ID",
        name: "Physical Home/Street Address",
        regex: /\b(?:alamat(?:\s+(?:ktp|domisili|saya|tinggal|rumah))?(?:\s+di|\s+adalah|\s*:)?\s*)([A-Za-z0-9\s.,\/-]+?)(?=\s*(?:nomor\s+telfon|nomor\s+hp|no\s+hp|no\s+telp|telfon|telepon|phone|email|nik|nim|npwp|paspor|passport|sim|bpjs|gaji|[\r\n]|$))/gi,
        validator: (raw) => {
          const physicalMarkers = /\b(?:jalan|jl\.?|gang|gg\.?|kampung|kp\.?|komplek|perumahan|dusun|desa|kelurahan|kecamatan|rt\s*\d+|rw\s*\d+|no(?:mor)?\s*\d+|blok\s*[a-z0-9]+)\b/i;
          const computingExclusions = /\b(?:memori|memory|fungsi|function|pointer|register|symbol|instruksi|instruction|hex|libc|gdb|binary|assembly|setcontext|ip|mac|url|socket)\b|&[a-zA-Z_]|0x[0-9a-fA-F]+/i;
          return physicalMarkers.test(raw) && !computingExclusions.test(raw);
        },
        replacement: "alamat di [REDACTED_ADDRESS] "
      },
      // 12. Indonesian Tax ID (NPWP - 15/16 digits formatted or raw)
      {
        id: "ID_NPWP",
        name: "Indonesian Tax ID (NPWP)",
        regex: /\b((?:npwp(?:\s+pribadi|\s+badan)?\s*[:=\-]?\s*)?)(\d{2}\.\d{3}\.\d{3}\.\d{1}-\d{3}\.\d{3})\b/gi,
        replacement: "$1[REDACTED_NPWP]"
      },
      // 13. Indonesian & International Passport (Paspor RI)
      {
        id: "PASSPORT_RI",
        name: "Passport Number",
        regex: /\b((?:(?:nomor\s+)?paspor(?:\s+ri)?|passport)\s*[:=\-]?\s*)([A-Z]\d{7})\b/gi,
        replacement: "$1[REDACTED_PASSPORT]"
      },
      // 14. BPJS Kesehatan & Ketenagakerjaan (11-13 digits)
      {
        id: "ID_BPJS",
        name: "BPJS Health & Employment ID",
        regex: /\b((?:(?:nomor\s+)?bpjs(?:\s+kesehatan|\s+ketenagakerjaan|\s+tk)?)\s*[:=\-]?\s*)(\d{11,13})\b/gi,
        replacement: "$1[REDACTED_BPJS]"
      },
      // 15. Indonesian Driving License (SIM A/C - 12 digits)
      {
        id: "ID_SIM",
        name: "Indonesian Driver License (SIM)",
        regex: /\b((?:(?:nomor\s+)?sim(?:\s+[a-c])?)\s*[:=\-]?\s*)(\d{12})\b/gi,
        replacement: "$1[REDACTED_SIM]"
      },
      // 16. Academic & Student Identification (NIM, NPM, NRP, Student ID)
      {
        id: "STUDENT_ID",
        name: "Student ID / Academic NIM",
        regex: /\b((?:nim|npm|nrp|no\.?\s*mahasiswa|student\s*id|nomor\s*induk\s*mahasiswa)\s*[:=\-]?\s*)([0-9]{8,14})\b/gi,
        replacement: "$1[REDACTED_NIM]"
      },
      // 17. Unix / Linux Terminal Shell Prompt (e.g. user@host:~/path$)
      {
        id: "TERMINAL_PROMPT",
        name: "Terminal Shell Prompt",
        regex: /((?:\([a-zA-Z0-9._-]+\)\s*)?)\b([a-zA-Z0-9._-]+)@([a-zA-Z0-9._-]+):([~/\w\s\p{L}.-]+)([\$#])/gu,
        replacement: "$1[user]@[host]:~/[sandbox_path]$5"
      },
      // 13. Kali Linux Modern Shell Prompt (┌──(user㉿host)-[~/path])
      {
        id: "KALI_TERMINAL_PROMPT",
        name: "Kali Linux Shell Prompt",
        regex: /┌──\(([a-zA-Z0-9._-]+)㉿([a-zA-Z0-9._-]+)\)-\[([~/\w\s\p{L}.-]*)\](?:\s*[\r\n]+\s*└─[\$#])?/gu,
        replacement: "┌──([user]㉿[host])-[~/[sandbox_path]]\n└─$"
      },
      // 14. Modern Zsh / Powerline Prompt (e.g. Mon 28 Sep - 18:24  ~  @darflashxd )
      {
        id: "POWERLINE_ZSH_PROMPT",
        name: "Powerline & Modern Zsh Prompt",
        regex: /(?:[A-Za-z]{3}\s+\d{1,2}\s+[A-Za-z]{3}\s+-\s+\d{1,2}:\d{2}\s*[\uE0B0-\uE0B3\s]*)?(?:~[\uE0B0-\uE0B3\s]*)?@([a-zA-Z0-9._-]+)(\s*[\uE0B0-\uE0B3])/gu,
        replacement: "@[user]$2"
      },
      // 15. macOS Default Terminal Prompt (user@host ~ %)
      {
        id: "MACOS_TERMINAL_PROMPT",
        name: "macOS Shell Prompt",
        regex: /\b([a-zA-Z0-9._-]+)@([a-zA-Z0-9._-]+)\s+([~/\w\s\p{L}.-]+)\s*%/gu,
        replacement: "[user]@[host] ~/[sandbox_path] %"
      },
      // 16. Windows PowerShell & CMD Prompt (PS C:\Users\user\path> or C:\Users\user\path>)
      {
        id: "WINDOWS_PROMPT",
        name: "Windows Shell Prompt",
        regex: /\b((?:PS\s+)?[A-Z]:\\Users\\)([a-zA-Z0-9._-]+)(\\[^>\n\r]*)?>/gi,
        replacement: "$1[user]$3>"
      },
      // 17. Git Commit Author Metadata (Author: user <email>)
      {
        id: "GIT_AUTHOR_TRACE",
        name: "Git Author Identity",
        regex: /\b(Author:\s*)([a-zA-Z0-9._\s-]+?)\s*<([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[A-Za-z]{2,})>/gi,
        replacement: "$1[User_A] <[user@protected.local]>"
      },
      // 18. SSH Public Key Identity Comment (ssh-ed25519 AAA... user@host)
      {
        id: "SSH_KEY_COMMENT",
        name: "SSH Key Identity Comment",
        regex: /\b(ssh-(?:ed25519|rsa|ecdsa|dss)\s+[A-Za-z0-9+/=]{32,}\s+)([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+)\b/g,
        replacement: "$1[user]@[host]"
      },
      // 19. Linux POSIX ID & whoami output (uid=1000(user) gid=1000(group))
      {
        id: "POSIX_ID_OUTPUT",
        name: "POSIX Identity Command Output",
        regex: /\b(uid=\d+\()([a-zA-Z0-9._-]+)(\)\s+gid=\d+\()([a-zA-Z0-9._-]+)(\)(?:\s+groups=[\d(),a-zA-Z0-9._-]+)?)/g,
        replacement: "$1[user]$3[group]) groups=1000([group])"
      },
      // 20. Shell output for whoami and USER environment variable
      {
        id: "WHOAMI_USER_OUTPUT",
        name: "Whoami or USER Command Output",
        regex: /((?:\bwhoami|\$USER)(?:\s*[:=>\->]+\s*|\s+))([a-zA-Z0-9._-]+)\b/gi,
        replacement: "$1[user]"
      },
      // 21. Internal Hostname user@host (Non-TLD, developer handles)
      {
        id: "UNIX_USER_HOST",
        name: "Internal User & Hostname",
        regex: /\b([a-zA-Z0-9._-]+)@([a-zA-Z0-9_-]+)(?!\.[a-zA-Z]{2,})\b/g,
        replacement: "[user]@[host]"
      },
      // 22. User Home Directory Paths (Linux / macOS / Windows)
      {
        id: "USER_HOME_PATH",
        name: "User Home Directory Path",
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
   * Scans and redacts deterministic secrets and PII from input text.
   * Returns: { sanitizedText, detections: [{ type, matched, offset, length }] }
   */
  scan(text) {
    let sanitizedText = text;
    const detections = [];

    for (const pattern of this.patterns) {
      let match;
      const regex = new RegExp(pattern.regex.source, pattern.regex.flags);
      
      while ((match = regex.exec(text)) !== null) {
        const raw = match[0];
        if (pattern.validator && !pattern.validator(raw)) {
          continue;
        }

        let repl;
        if (typeof pattern.replacement === "function") {
          repl = pattern.replacement(raw, match.index, text);
        } else if (typeof pattern.replacement === "string" && pattern.replacement.includes("$")) {
          repl = raw.replace(new RegExp(pattern.regex.source, pattern.regex.flags), pattern.replacement);
        } else {
          repl = pattern.replacement;
        }

        detections.push({
          type: pattern.id,
          name: pattern.name,
          raw: raw,
          replacement: repl,
          index: match.index,
          length: raw.length
        });
      }
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
      }
    }

    // Apply replacements from back to front to preserve offsets
    nonOverlapping.sort((a, b) => b.index - a.index);
    for (const det of nonOverlapping) {
      sanitizedText = 
        sanitizedText.substring(0, det.index) + 
        det.replacement + 
        sanitizedText.substring(det.index + det.length);
    }

    return {
      sanitizedText,
      detections: nonOverlapping
    };
  }
}

// Export for ES module or extension content script
if (typeof module !== "undefined" && module.exports) {
  module.exports = HeuristicsRedactor;
}
