/**
 * SafeShare-AI — Client-Side Local Compute Engine (Zero-Eval Shunting-Yard AST)
 * Evaluates symbolic mathematical expressions from LLM responses in local RAM
 * without ever executing eval() or new Function().
 * 
 * Guarantees:
 * 1. No eval(): a shunting-yard RPN parser, so expressions cannot run code.
 * 2. Deterministic execution: Handles operators (+, -, *, /, ^, %), parentheses, and variables (<S1>, S1).
 * 3. Formatted hydration: Formats results into target currency/locale (IDR, USD, EUR, GBP).
 */

class SafeShareLocalCompute {
  constructor() {
    this.operatorPrecedence = {
      "+": 1,
      "-": 1,
      "*": 2,
      "/": 2,
      "%": 2,
      "^": 3
    };
  }

  /**
   * Pre-normalizes HTML/Markdown representations of symbols into standard <S...> tokens.
   * Handles browser HTML tags (<s19></s19>, <s19/>), HTML entities (&lt;S19&gt;), and LaTeX brackets.
   * @param {string} html
   * @returns {string}
   */
  preNormalizeHtmlSymbols(html) {
    if (!html || typeof html !== "string") return "";
    let s = html;
    // 1. Browser HTML element tags created by browser DOM parser: <s19></s19>, <s19>, <S19></S19>
    s = s.replace(/<s(\d+)>(?:<\/s\1>)?/gi, "<S$1>");
    s = s.replace(/<s(\d+)\s*\/>/gi, "<S$1>");
    // 2. HTML entities: &lt;S19&gt;, &lt;s19&gt;
    s = s.replace(/&lt;\s*s(\d+)\s*&gt;/gi, "<S$1>");
    // 3. LaTeX angle brackets: \langle S19\rangle, \langle s19\rangle
    s = s.replace(/\\langle\s*s(\d+)\s*\\rangle/gi, "<S$1>");
    // 4. Unicode angle brackets: ⟨S19⟩, ⟨s19⟩
    s = s.replace(/⟨\s*s(\d+)\s*⟩/gi, "<S$1>");
    // 5. Implicit multiplication for factors before parens containing symbols: 0.25( -> 0.25 * (, 6( -> 6 * (
    s = s.replace(/(\d+(?:\.\d+)?%?)\s*(?:[×·]|\*|\s)\s*\(\s*(?=[^()]*<S\d+>)/gi, "$1 * (");
    return s;
  }

  /**
   * Normalizes LaTeX notation, Unicode operators, and fractions into standard arithmetic.
   * @param {string} expr
   * @returns {string}
   */
  cleanMathString(expr) {
    if (!expr || typeof expr !== "string") return "";
    let s = this.preNormalizeHtmlSymbols(expr);
    // Normalize LaTeX fractions \frac{a}{b} -> ((a) / (b))
    s = s.replace(/\\frac\s*\{([^{}]+)\}\s*\{([^{}]+)\}/gi, "(($1) / ($2))");
    // Normalize LaTeX parens & operators
    s = s.replace(/\\left\(/gi, "(").replace(/\\right\)/gi, ")");
    s = s.replace(/\\cdot|\\times/gi, "*");
    // Normalize Unicode math operators
    s = s.replace(/[−–—]/g, "-");
    s = s.replace(/[×·]/g, "*");
    // Insert multiplication for juxtaposition e.g. 0.15( -> 0.15 * (
    s = s.replace(/(\d+(?:\.\d+)?)\s*\(/g, "$1 * (");
    s = s.replace(/(\d+(?:\.\d+)?)\s*(<[A-Za-z0-9_]+>)/g, "$1 * $2");
    return s.trim();
  }

  /**
   * Tokenizes a mathematical expression string containing numbers, operators, parentheses, and variables.
   * @param {string} expr - e.g. "12 * 0.30 * <S1>" or "(S1 * 1.15) - 500000"
   * @returns {Array<{type: string, value: string|number}>}
   */
  tokenize(expr) {
    const tokens = [];
    let i = 0;
    const clean = this.cleanMathString(expr);

    while (i < clean.length) {
      const ch = clean[i];

      // Skip whitespace
      if (/\s/.test(ch)) {
        i++;
        continue;
      }

      // Check for symbolic variable e.g. <S1>, <S2>, S1, S2
      if (ch === "<") {
        const closeIdx = clean.indexOf(">", i);
        if (closeIdx !== -1) {
          const varName = clean.substring(i, closeIdx + 1);
          tokens.push({ type: "VAR", value: varName });
          i = closeIdx + 1;
          continue;
        }
      }

      if (/[A-Za-z]/.test(ch)) {
        let varName = "";
        while (i < clean.length && /[A-Za-z0-9_]/.test(clean[i])) {
          varName += clean[i];
          i++;
        }
        tokens.push({ type: "VAR", value: varName });
        continue;
      }

      // Check for numeric literal (int, float, or percentage e.g. 15% -> 0.15)
      if (/[0-9.]/.test(ch)) {
        let numStr = "";
        while (i < clean.length && /[0-9.]/.test(clean[i])) {
          numStr += clean[i];
          i++;
        }
        if (i < clean.length && clean[i] === "%") {
          tokens.push({ type: "NUM", value: parseFloat(numStr) / 100 });
          i++;
        } else {
          tokens.push({ type: "NUM", value: parseFloat(numStr) });
        }
        continue;
      }

      // Check for operators and parentheses
      if ("+-*/%^()".includes(ch)) {
        // Handle unary minus
        if (ch === "-") {
          const prevToken = tokens[tokens.length - 1];
          if (!prevToken || prevToken.type === "OP" || (prevToken.type === "PAREN" && prevToken.value === "(")) {
            // Unary minus: treat as 0 - x
            tokens.push({ type: "NUM", value: 0 });
          }
        }

        if (ch === "(" || ch === ")") {
          tokens.push({ type: "PAREN", value: ch });
        } else {
          tokens.push({ type: "OP", value: ch });
        }
        i++;
        continue;
      }

      // Skip unknown character
      i++;
    }

    return tokens;
  }

  /**
   * Converts infix tokens into Reverse Polish Notation (RPN) using Dijkstra's Shunting-Yard algorithm.
   * @param {Array<{type: string, value: any}>} tokens
   * @returns {Array<{type: string, value: any}>}
   */
  toRPN(tokens) {
    const outputQueue = [];
    const operatorStack = [];

    for (const token of tokens) {
      if (token.type === "NUM" || token.type === "VAR") {
        outputQueue.push(token);
      } else if (token.type === "OP") {
        const op1 = token.value;
        while (
          operatorStack.length > 0 &&
          operatorStack[operatorStack.length - 1].type === "OP"
        ) {
          const op2 = operatorStack[operatorStack.length - 1].value;
          const p1 = this.operatorPrecedence[op1] || 0;
          const p2 = this.operatorPrecedence[op2] || 0;

          if ((op1 !== "^" && p1 <= p2) || (op1 === "^" && p1 < p2)) {
            outputQueue.push(operatorStack.pop());
          } else {
            break;
          }
        }
        operatorStack.push(token);
      } else if (token.type === "PAREN" && token.value === "(") {
        operatorStack.push(token);
      } else if (token.type === "PAREN" && token.value === ")") {
        while (
          operatorStack.length > 0 &&
          !(operatorStack[operatorStack.length - 1].type === "PAREN" && operatorStack[operatorStack.length - 1].value === "(")
        ) {
          outputQueue.push(operatorStack.pop());
        }
        if (operatorStack.length > 0) {
          operatorStack.pop(); // Pop the "("
        }
      }
    }

    while (operatorStack.length > 0) {
      outputQueue.push(operatorStack.pop());
    }

    return outputQueue;
  }

  /**
   * Evaluates an RPN queue against a symbol table of resolved secret values.
   * @param {Array<{type: string, value: any}>} rpnQueue
   * @param {Record<string, number>} symbolTable - e.g. { "<S1>": 3000000, "S1": 3000000 }
   * @returns {number}
   */
  evaluateRPN(rpnQueue, symbolTable = {}) {
    const stack = [];

    for (const token of rpnQueue) {
      if (token.type === "NUM") {
        stack.push(token.value);
      } else if (token.type === "VAR") {
        const key = token.value;
        const normalizedKey = key.startsWith("<") && key.endsWith(">") ? key : `<${key}>`;
        const val = symbolTable[key] !== undefined ? symbolTable[key] : symbolTable[normalizedKey];
        if (val === undefined || isNaN(val)) {
          throw new Error(`Symbol '${key}' could not be resolved in Local Vault.`);
        }
        stack.push(Number(val));
      } else if (token.type === "OP") {
        if (stack.length < 2) {
          throw new Error(`Insufficient operands for operator '${token.value}'.`);
        }
        const b = stack.pop();
        const a = stack.pop();

        let res = 0;
        switch (token.value) {
          case "+": res = a + b; break;
          case "-": res = a - b; break;
          case "*": res = a * b; break;
          case "/":
            if (b === 0) throw new Error("Division by zero in symbolic expression.");
            res = a / b;
            break;
          case "%": res = a % b; break;
          case "^": res = Math.pow(a, b); break;
          default: throw new Error(`Unsupported operator '${token.value}'.`);
        }
        stack.push(res);
      }
    }

    if (stack.length !== 1) {
      throw new Error("Malformed mathematical expression.");
    }

    const rawResult = stack[0];
    // Epsilon precision stabilization (avoids 10799999.999999998 artifacts)
    return Math.abs(rawResult - Math.round(rawResult)) < 1e-5 ? Math.round(rawResult) : Number(rawResult.toFixed(4));
  }

  /**
   * Evaluates a mathematical expression string directly and returns the numeric result.
   * @param {string} expr
   * @param {Record<string, number>} symbolTable
   * @returns {number}
   */
  compute(expr, symbolTable = {}) {
    const tokens = this.tokenize(expr);
    if (tokens.length === 0) return 0;
    const rpn = this.toRPN(tokens);
    return this.evaluateRPN(rpn, symbolTable);
  }

  /**
   * Formats a raw number according to currency or percentage specifications.
   * @param {number} val
   * @param {string} currency - e.g. "USD", "IDR", "EUR", "GBP"
   * @param {string} expr - optional original expression for percentage/ratio detection
   * @param {string} afterSnippet - optional trailing text for unit/duration detection
   * @returns {string}
   */
  formatValue(val, currency = "USD", expr = "", afterSnippet = "") {
    // 1. Percentage / Dimensionless Ratio check
    const isRatioOrPercentage = /%|frac|ESOP|reduction|dilution|ownership|ratio/i.test(expr) || (val > 0 && val < 1 && !/months?|bulan|days?|hari|years?|tahun/i.test(afterSnippet));
    if (isRatioOrPercentage) {
      const pct = val * 100;
      const roundedPct = Math.round(pct * 100) / 100;
      return `${roundedPct}%`;
    }

    // 2. Unit duration check (e.g. runway months: <S1> / <S2> months)
    const isDuration = val < 500 && (/months?|bulan|days?|hari|years?|tahun/i.test(afterSnippet) || (expr.includes("/") && !/%|frac/i.test(expr)));
    if (isDuration) {
      const roundedDur = Math.round(val * 100) / 100;
      return `${roundedDur}`;
    }

    // 3. Currency amount
    const rounded = Math.abs(val - Math.round(val)) < 1e-4 ? Math.round(val) : Math.round(val * 100) / 100;
    if (currency === "IDR" || currency === "Rp") {
      return `Rp ${Math.round(rounded).toLocaleString("id-ID")}`;
    }
    if (currency === "USD" || currency === "$") {
      return `$${rounded.toLocaleString("en-US", { minimumFractionDigits: rounded % 1 === 0 ? 0 : 2 })}`;
    }
    if (currency === "EUR" || currency === "€") {
      return `€${rounded.toLocaleString("de-DE", { minimumFractionDigits: rounded % 1 === 0 ? 0 : 2 })}`;
    }
    if (currency === "GBP" || currency === "£") {
      return `£${rounded.toLocaleString("en-GB", { minimumFractionDigits: rounded % 1 === 0 ? 0 : 2 })}`;
    }
    return `$${rounded.toLocaleString("en-US")}`;
  }

  /**
   * Scans text from an LLM response, evaluates any symbolic formulas involving <S1>, <S2>, etc.,
   * and replaces them with formatted locally computed values.
   * 
   * Supported patterns:
   *  - "0.30 * <S1>" -> "$900" or "Rp 900.000"
   *  - "<S3> − 3 × <S2>" -> "$385,000"
   *  - "\[\text{ESOP after SAFE} = 0.15\left(1-\frac{\langle S1\rangle}{\langle S4\rangle}\right)\]" -> "\[\text{ESOP after SAFE} = 13.75\%\]"
   *  - "<S1> / <S2> months" -> "10.34 months"
   *  - "<S1>" (standalone variable) -> "$1,500,000"
   * 
   * @param {string} text
   * @param {Record<string, {value: number, currency: string, raw: string}>} vault
   * @param {boolean} htmlBadges - if true, wraps results in <span class="ss-local-compute" ...>
   * @returns {{hydratedText: string, computedCount: number, evaluations: Array<{expr: string, val: number, formatted: string}>}}
   */
  hydrateText(text, vault = {}, htmlBadges = false) {
    if (!text || Object.keys(vault).length === 0) {
      return { hydratedText: text, computedCount: 0, evaluations: [] };
    }

    const symbolTable = {};
    let defaultCurrency = "USD";
    for (const [k, obj] of Object.entries(vault)) {
      symbolTable[k] = obj.value;
      const stripped = k.replace(/[<>]/g, "");
      symbolTable[stripped] = obj.value;
      if (obj.currency) defaultCurrency = obj.currency;
    }

    const evaluations = [];
    const escapeAttr = (str) => String(str).replace(/"/g, "&quot;").replace(/'/g, "&#39;");

    let hydratedText = this.preNormalizeHtmlSymbols(text);

    // Helper to prevent nesting inside already-generated ss-local-compute spans
    const replaceOutsideSpans = (content, regex, replacer) => {
      const outerRx = new RegExp(`(<span[^>]*class="[^"]*ss-local-compute[^"]*"[\\s\\S]*?<\\/span>)|(${regex.source})`, regex.flags);
      return content.replace(outerRx, (match, span, target, ...args) => {
        if (span) return span;
        return replacer(target, ...args);
      });
    };

    // Phase 1: Process LaTeX display and inline math blocks \[ ... \], $$ ... $$, \( ... \), $ ... $
    const latexBlockRx = /(\\\[|\$\$|\\\(|\$)([\s\S]*?)(\\\]|\$\$|\\\)|\$)/g;
    hydratedText = hydratedText.replace(latexBlockRx, (fullMatch, openTag, inner, closeTag) => {
      if (!/<S\d+>|\\langle\s*S\d+\s*\\rangle|⟨S\d+⟩|&lt;S\d+&gt;|\bS\d+\b/i.test(inner)) return fullMatch;
      const eq = inner.match(/^([\s\S]*?=\s*)([\s\S]+)$/);
      if (eq) {
        const leftSide = eq[1];
        const rightSide = eq[2].trim();
        try {
          const val = this.compute(rightSide, symbolTable);
          const formatted = this.formatValue(val, defaultCurrency, rightSide).replace("%", "\\%");
          evaluations.push({ expr: rightSide, val, formatted });
          return `${openTag}${leftSide}${formatted}${closeTag}`;
        } catch (_) {
          return fullMatch;
        }
      } else if (inner.includes("<S") || inner.includes("\\langle") || inner.includes("frac")) {
        try {
          const cleanExpr = this.cleanMathString(inner);
          const val = this.compute(cleanExpr, symbolTable);
          const formatted = this.formatValue(val, defaultCurrency, cleanExpr).replace("%", "\\%");
          evaluations.push({ expr: inner.trim(), val, formatted });
          return `${openTag}${formatted}${closeTag}`;
        } catch (_) {
          return fullMatch;
        }
      }
      return fullMatch;
    });

    // Phase 2: Process multi-term arithmetic formulas (including Unicode operators and parentheses)
    const multiTermRx = /(?:\(\s*)?(?:(?:<S\d+>|\\langle\s*S\d+\s*\\rangle|⟨S\d+⟩|&lt;S\d+&gt;|\bS\d+\b|\d+(?:\.\d+)?%?)[ \t]*[-+*\/^%−–—×·][ \t]*(?:\([ \t]*)?)+(?:<S\d+>|\\langle\s*S\d+\s*\\rangle|⟨S\d+⟩|&lt;S\d+&gt;|\bS\d+\b|\d+(?:\.\d+)?%?)(?:\s*\))?(?:[ \t]*[-+*\/^%−–—×·][ \t]*(?:<S\d+>|\\langle\s*S\d+\s*\\rangle|⟨S\d+⟩|&lt;S\d+&gt;|\bS\d+\b|\d+(?:\.\d+)?%?|[()]|\s+)+)*(?:\/(?:month|mo|year|yr|bulan|thn|day|hari|week|minggu|hr|jam)\b)?/gi;

    hydratedText = replaceOutsideSpans(hydratedText, multiTermRx, (fullMatch, ...args) => {
      const offset = typeof args[args.length - 2] === "number" ? args[args.length - 2] : args[args.length - 3];
      const hasKnownSymbol = Object.keys(vault).some(k => {
        const bare = k.replace(/[<>]/g, "");
        return fullMatch.toLowerCase().includes(k.toLowerCase()) || fullMatch.toLowerCase().includes(bare.toLowerCase());
      });
      if (!hasKnownSymbol) return fullMatch;

      const timeSuffixRx = /\/(?:month|mo|year|yr|bulan|thn|day|hari|week|minggu|hr|jam)\b/i;
      let suffix = "";
      let mathExpr = fullMatch;
      const sm = fullMatch.match(timeSuffixRx);
      if (sm) {
        suffix = sm[0];
        mathExpr = fullMatch.replace(timeSuffixRx, "").trim();
      }

      const nextNl2 = hydratedText.indexOf("\n", offset + fullMatch.length);
      const limitIdx2 = nextNl2 === -1 ? offset + fullMatch.length + 30 : Math.min(nextNl2, offset + fullMatch.length + 30);
      const afterSnippet = hydratedText.substring(offset + fullMatch.length, limitIdx2);
      try {
        const val = this.compute(mathExpr, symbolTable);
        // Find currency of involved variables if any
        let itemCurrency = defaultCurrency;
        for (const [k, obj] of Object.entries(vault)) {
          if (mathExpr.includes(k) && obj.currency) {
            itemCurrency = obj.currency;
            break;
          }
        }
        const formatted = this.formatValue(val, itemCurrency, mathExpr, afterSnippet);
        evaluations.push({ expr: mathExpr.trim(), val, formatted });

        if (htmlBadges) {
          return `<span class="ss-local-compute" data-expr="${encodeURIComponent(mathExpr.trim())}" title="Locally Computed from ${escapeAttr(mathExpr.trim())}">${formatted}${suffix}</span>`;
        }
        return `${formatted}${suffix}`;
      } catch (_) {
        return fullMatch;
      }
    });

    // Phase 3: Process standalone variables
    const standaloneVarRx = /(?:<S\d+>|\\langle\s*S\d+\s*\\rangle|⟨S\d+⟩|&lt;S\d+&gt;|\bS\d+\b)(?:\/(?:month|mo|year|yr|bulan|thn|day|hari|week|minggu|hr|jam)\b)?/gi;

    hydratedText = replaceOutsideSpans(hydratedText, standaloneVarRx, (fullMatch, ...args) => {
      const offset = typeof args[args.length - 2] === "number" ? args[args.length - 2] : args[args.length - 3];
      const symbolKey = Object.keys(vault).find(k => {
        const bare = k.replace(/[<>]/g, "");
        return fullMatch.toLowerCase().includes(k.toLowerCase()) || fullMatch.toLowerCase().includes(bare.toLowerCase());
      });
      if (!symbolKey) return fullMatch;

      const item = vault[symbolKey];
      const timeSuffixRx = /\/(?:month|mo|year|yr|bulan|thn|day|hari|week|minggu|hr|jam)\b/i;
      let suffix = "";
      let mathExpr = fullMatch;
      const sm = fullMatch.match(timeSuffixRx);
      if (sm) {
        suffix = sm[0];
        mathExpr = fullMatch.replace(timeSuffixRx, "").trim();
      }

      const nextNl3 = hydratedText.indexOf("\n", offset + fullMatch.length);
      const limitIdx3 = nextNl3 === -1 ? offset + fullMatch.length + 30 : Math.min(nextNl3, offset + fullMatch.length + 30);
      const afterSnippet = hydratedText.substring(offset + fullMatch.length, limitIdx3);
      const val = item.value;
      const formatted = this.formatValue(val, item.currency || defaultCurrency, mathExpr, afterSnippet);
      evaluations.push({ expr: mathExpr.trim(), val, formatted });

      if (htmlBadges) {
        return `<span class="ss-local-compute" data-expr="${encodeURIComponent(mathExpr.trim())}" title="Locally Computed from ${escapeAttr(mathExpr.trim())}">${formatted}${suffix}</span>`;
      }
      return `${formatted}${suffix}`;
    });

    return {
      hydratedText,
      computedCount: evaluations.length,
      evaluations
    };
  }
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = SafeShareLocalCompute;
}
