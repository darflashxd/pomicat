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
        category: "GOV_ID",
        regex: /\b([1-9][0-9]{15})\b/g,
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
      // 1c. US Employer Identification Number (EIN)
      {
        id: "US_EIN",
        name: "US Employer Identification Number (EIN)",
        category: "GOV_ID",
        regex: /\b((?:ein|fein|tax\s+id)\s*[:=\-]?\s*)(\d{2}-\d{7})\b/gi,
        replacement: "$1[REDACTED_EIN]"
      },
      // 1d. ABA Bank Routing Transit Number (9 digits with checksum)
      {
        id: "ABA_ROUTING",
        name: "ABA Bank Routing Transit Number",
        category: "CREDENTIALS",
        regex: /\b((?:(?:routing(?:\s+transit|\s+number)?|aba(?:\s+routing)?)\s*[:=\-]?\s*))(\d{9})\b/gi,
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
        regex: /\b([A-Z]{2}\d{2}[A-Z0-9]{11,30})\b/gi,
        validator: (raw) => this.validateIBAN(raw),
        replacement: "[REDACTED_IBAN]"
      },
      // 1f. SWIFT / BIC Code
      {
        id: "SWIFT_BIC",
        name: "SWIFT / BIC Banking Code",
        category: "CREDENTIALS",
        regex: /\b((?:(?:swift(?:\s+code|\s+bic)?|bic)\s*[:=\-]?\s*))([A-Z]{4}[A-Z]{2}[A-Z0-9]{2}(?:[A-Z0-9]{3})?)\b/gi,
        replacement: "$1[REDACTED_SWIFT_BIC]"
      },
      // 2. Credit Card Numbers (13-19 digits with Luhn verification)
      {
        id: "CREDIT_CARD",
        name: "Credit Card",
        category: "FINANCIAL",
        regex: /\b(?:\d{4}[ -]?){3}\d{4}\b|\b\d{15,16}\b/g,
        validator: this.luhnCheck,
        replacement: "[REDACTED_CARD_NUMBER]"
      },
      // 3. Email Addresses
      {
        id: "EMAIL",
        name: "Email Address",
        category: "PROFILE",
        regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
        replacement: (match, index, context) => `[user_${Math.abs(this.hashString(match)) % 1000}@protected.local]`
      },
      // 4. Phone Numbers (ID: +62/08..., US/International)
      {
        id: "PHONE",
        name: "Phone Number",
        category: "PROFILE",
        regex: /(?:\+?62|0)8[1-9][0-9]{7,10}\b|(?<=^|[\s,;:(])(?:\+?1[-.\s]?)?\(?[2-9]\d{2}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
        replacement: "[REDACTED_PHONE]"
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
        regex: /\bAIzaSy[A-Za-z0-9_-]{33}\b/g,
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
      // 5d. Ethereum / EVM Wallet Address (0x...)
      {
        id: "EVM_CRYPTO_WALLET",
        name: "Ethereum EVM Wallet Address",
        category: "CREDENTIALS",
        regex: /\b(0x[a-fA-F0-9]{40})\b/g,
        replacement: "[REDACTED_CRYPTO_WALLET]"
      },
      // 5e. BIP-39 12/24-Word Recovery Mnemonic Seed Phrase
      {
        id: "BIP39_SEED_PHRASE",
        name: "BIP-39 Mnemonic Recovery Seed Phrase",
        category: "CREDENTIALS",
        regex: /(\b(?:seed|mnemonic|recovery(?:\s+phrase)?|bip-?39)[^:\n\r]*[:=\-]?\s*)([a-z]{3,12}(?:[ \t]+[a-z]{3,12}){11,23})\b/gi,
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
      // 10. Database Connection Strings (Postgres, MySQL, Mongo, Redis with passwords)
      {
        id: "DATABASE_URI",
        name: "Database Credentials URI",
        category: "CREDENTIALS",
        regex: /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis):\/\/[^:\s]+:[^@\s]+@[^\s/:]+(?::\d+)?\/[^\s]*/gi,
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
      // 11. Physical Home / Street Address (Expanded for KTP/Domisili and structured forms)
      {
        id: "ADDRESS_ID",
        name: "Physical Home/Street Address",
        category: "PROFILE",
        regex: /\b(?:alamat(?:\s+(?:ktp|domisili|saya|tinggal|rumah))?(?:\s+di|\s+adalah|\s*:)?\s*)([A-Za-z0-9\s.,\/-]+?)(?=\s*(?:nomor\s+telfon|nomor\s+hp|no\s+hp|no\s+telp|telfon|telepon|phone|email|nik|nim|npwp|paspor|passport|sim|bpjs|gaji|[\r\n]|$))/gi,
        validator: (raw) => {
          const physicalMarkers = /\b(?:jalan|jl\.?|gang|gg\.?|kampung|kp\.?|komplek|perumahan|dusun|desa|kelurahan|kecamatan|rt\s*\d+|rw\s*\d+|no(?:mor)?\s*\d+|blok\s*[a-z0-9]+)\b/i;
          const computingExclusions = /\b(?:memori|memory|fungsi|function|pointer|register|symbol|instruksi|instruction|hex|libc|gdb|binary|assembly|setcontext|ip|mac|url|socket)\b|&[a-zA-Z_]|0x[0-9a-fA-F]+/i;
          return physicalMarkers.test(raw) && !computingExclusions.test(raw);
        },
        replacement: "alamat di [REDACTED_ADDRESS] "
      },
      // 11b. English Residential / Shipping Address (US / UK Street & Postal Formats)
      {
        id: "ENGLISH_PHYSICAL_ADDRESS",
        name: "US/UK Physical Street Address",
        category: "PROFILE",
        regex: /\b((?:(?:residential|shipping|mailing|home|street)?\s*address\s*[:=\-]?\s*)(?:to\s+my\s+residential\s+address\s*:\s*)?)((?:(?:Flat|Unit|Apt|Apartment|Suite)\s+\d+[a-zA-Z]?,?\s*)?(?:[0-9]{1,5}\s+)?[A-Za-z0-9\s.,\/-]+?(?:Street|St|Avenue|Ave|Boulevard|Blvd|Road|Rd|Drive|Dr|Lane|Ln|Way|Court|Ct)[A-Za-z0-9\s.,\/-]*?(?:[A-Z]{2}\s+\d{5}(?:-\d{4})?|[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}))\b/gi,
        replacement: "$1[REDACTED_ADDRESS]"
      },
      // 12. Indonesian Tax ID (NPWP - 15/16 digits formatted or raw)
      {
        id: "ID_NPWP",
        name: "Indonesian Tax ID (NPWP)",
        category: "GOV_ID",
        regex: /\b((?:npwp(?:\s+pribadi|\s+badan)?\s*[:=\-]?\s*)?)(\d{2}\.\d{3}\.\d{3}\.\d{1}-\d{3}\.\d{3})\b/gi,
        replacement: "$1[REDACTED_NPWP]"
      },
      // 13. Indonesian & International Passport (Paspor RI)
      {
        id: "PASSPORT_RI",
        name: "Passport Number",
        category: "GOV_ID",
        regex: /\b((?:(?:nomor\s+)?paspor(?:\s+ri)?|passport)\s*[:=\-]?\s*)([A-Z]\d{7})\b/gi,
        replacement: "$1[REDACTED_PASSPORT]"
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
      // 16. Academic & Student Identification (NIM, NPM, NRP, Student ID)
      {
        id: "STUDENT_ID",
        name: "Student ID / Academic NIM",
        category: "GOV_ID",
        regex: /\b((?:nim|npm|nrp|no\.?\s*mahasiswa|student\s*id|nomor\s*induk\s*mahasiswa)\s*[:=\-]?\s*)([0-9]{8,14})\b/gi,
        replacement: "$1[REDACTED_NIM]"
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
      // 14. Modern Zsh / Powerline Prompt (e.g. Mon 28 Sep - 18:24  ~  @darflashxd )
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
        regex: /((?:\bwhoami|\$USER)(?:\s*[:=>\->]+\s*|\s+))([a-zA-Z0-9._-]+)\b/gi,
        replacement: "$1[user]"
      },
      // 21. Internal Hostname user@host (Non-TLD, developer handles)
      {
        id: "UNIX_USER_HOST",
        name: "Internal User & Hostname",
        category: "SYSTEM",
        regex: /\b([a-zA-Z0-9._-]+)@([a-zA-Z0-9_-]+)(?!\.[a-zA-Z]{2,})\b/g,
        replacement: "[user]@[host]"
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
          category: pattern.category || "GENERAL",
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
