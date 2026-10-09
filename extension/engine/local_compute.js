/**
 * SafeShare-AI — Client-Side Local Compute Engine (Zero-Eval Shunting-Yard AST)
 * Evaluates symbolic mathematical expressions from LLM responses in local RAM
 * without ever executing eval() or new Function().
 * 
 * Guarantees:
 * 1. Absolute security: Pure Dijkstra Shunting-Yard RPN parser (XSS/Injection immune).
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
   * Tokenizes a mathematical expression string containing numbers, operators, parentheses, and variables.
   * @param {string} expr - e.g. "12 * 0.30 * <S1>" or "(S1 * 1.15) - 500000"
   * @returns {Array<{type: string, value: string|number}>}
   */
  tokenize(expr) {
    const tokens = [];
    let i = 0;
    const clean = expr.trim();

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
   * Formats a raw number according to currency specifications.
   * @param {number} val
   * @param {string} currency - e.g. "IDR", "USD", "EUR", "GBP"
   * @returns {string}
   */
  formatValue(val, currency = "IDR") {
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
    return `${rounded.toLocaleString()}`;
  }

  /**
   * Scans text from an LLM response, evaluates any symbolic formulas involving <S1>, <S2>, etc.,
   * and replaces them with formatted locally computed values.
   * 
   * Supported patterns:
   *  - "0.30 * <S1>" -> "Rp 900.000"
   *  - "12 * 0.30 * <S1>" -> "Rp 10.800.000"
   *  - "<S1> * 15%" -> "Rp 450.000"
   *  - "<S1> + <S2>" -> "Rp 3.450.000"
   *  - "<S1>" (standalone variable) -> "Rp 3.000.000"
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
    let defaultCurrency = "IDR";
    for (const [k, obj] of Object.entries(vault)) {
      symbolTable[k] = obj.value;
      const stripped = k.replace(/[<>]/g, "");
      symbolTable[stripped] = obj.value;
      if (obj.currency) defaultCurrency = obj.currency;
    }

    const evaluations = [];

    // Regex matching symbolic mathematical expressions containing variables e.g. <S1> or S1
    // Matches single-line mathematical phrases without crossing newlines
    const formulaRx = /(?:\(\s*)?(?:(?:\d+(?:\.\d+)?%?|[A-Za-z0-9_]+|<[A-Za-z0-9_]+>)[ \t]*[-+*\/^%][ \t]*)+(?:<[A-Za-z0-9_]+>|[A-Za-z0-9_]+|\d+(?:\.\d+)?%?)(?:\s*\))?(?:\/(?:month|mo|year|yr|bulan|thn|day|hari|week|minggu|hr|jam)\b)?|<S\d+>(?:\/(?:month|mo|year|yr|bulan|thn|day|hari|week|minggu|hr|jam)\b)?|\bS\d+\b(?:\/(?:month|mo|year|yr|bulan|thn|day|hari|week|minggu|hr|jam)\b)?/gi;

    let hydratedText = text.replace(formulaRx, (fullMatch) => {
      // Must contain at least one known symbol from vault
      const hasKnownSymbol = Object.keys(vault).some(k => {
        const bare = k.replace(/[<>]/g, "");
        return fullMatch.includes(k) || fullMatch.includes(bare);
      });

      if (!hasKnownSymbol) return fullMatch;

      // Extract time period suffix if attached (e.g. 0.30 * <S1>/month -> expr: "0.30 * <S1>", suffix: "/month")
      const timeSuffixRx = /\/(?:month|mo|year|yr|bulan|thn|day|hari|week|minggu|hr|jam)\b/i;
      let suffix = "";
      let mathExpr = fullMatch;
      const sm = fullMatch.match(timeSuffixRx);
      if (sm) {
        suffix = sm[0];
        mathExpr = fullMatch.replace(timeSuffixRx, "").trim();
      }

      try {
        const val = this.compute(mathExpr, symbolTable);
        const formatted = this.formatValue(val, defaultCurrency);
        evaluations.push({ expr: mathExpr.trim(), val, formatted });

        if (htmlBadges) {
          return `<span class="ss-local-compute" data-expr="${encodeURIComponent(mathExpr.trim())}" title="Locally Computed from ${mathExpr.trim()}">${formatted}${suffix}<span class="ss-compute-tag">⚡ local</span></span>`;
        }
        return `${formatted}${suffix}`;
      } catch (_) {
        return fullMatch;
      }
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
