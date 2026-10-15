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
      "||": 1,
      "&&": 2,
      "==": 3,
      "!=": 3,
      "<": 4,
      "<=": 4,
      ">": 4,
      ">=": 4,
      "+": 5,
      "-": 5,
      "*": 6,
      "/": 6,
      "%": 6,
      "^": 7,
      "u-": 8,
      "u+": 8,
      "!": 8
    };
    // Fixed-point scaling factor (10^4 = 4 decimal places precision for currency & interest rates)
    // ponytail: fixed-point scaled arithmetic eliminates IEEE-754 precision side-channels; upgrade to BigInt if > 2^53.
    this.SCALE = 10000;

    this.functions = {
      IF: (args) => {
        if (args.length !== 3) throw new Error("IF() requires 3 arguments");
        return args[0] !== 0 ? args[1] : args[2];
      },
      MIN: (args) => {
        if (args.length < 1) throw new Error("MIN() requires at least 1 argument");
        return Math.min(...args);
      },
      MAX: (args) => {
        if (args.length < 1) throw new Error("MAX() requires at least 1 argument");
        return Math.max(...args);
      },
      ROUND: (args) => {
        if (args.length < 1) throw new Error("ROUND() requires at least 1 argument");
        const dec = args.length >= 2 ? Math.max(0, Math.min(10, Math.trunc(args[1]))) : 0;
        const factor = Math.pow(10, dec);
        return Math.round((args[0] + Number.EPSILON) * factor) / factor;
      },
      FLOOR: (args) => (args.length > 0 ? Math.floor(args[0]) : NaN),
      CEIL: (args) => (args.length > 0 ? Math.ceil(args[0]) : NaN),
      ABS: (args) => (args.length > 0 ? Math.abs(args[0]) : NaN)
    };
  }

  /**
   * Fixed-point decimal arithmetic helper for exact operations.
   * Eliminates floating-point rounding leakage and IEEE-754 side-channel variance.
   */
  fixedOp(op, a, b = 0) {
    switch (op) {
      case "||": return (a !== 0 || b !== 0) ? 1 : 0;
      case "&&": return (a !== 0 && b !== 0) ? 1 : 0;
      case "==": return Math.abs(a - b) < 1e-9 ? 1 : 0;
      case "!=": return Math.abs(a - b) >= 1e-9 ? 1 : 0;
      case "<":  return a < b ? 1 : 0;
      case "<=": return a <= b ? 1 : 0;
      case ">":  return a > b ? 1 : 0;
      case ">=": return a >= b ? 1 : 0;
      case "+":  return Math.round((a + b) * this.SCALE) / this.SCALE;
      case "-":  return Math.round((a - b) * this.SCALE) / this.SCALE;
      case "*":  return Math.round((a * b) * this.SCALE) / this.SCALE;
      case "/":
        if (Math.abs(b) < 1e-12) throw new Error("Division by zero in symbolic expression.");
        return Math.round((a / b) * this.SCALE) / this.SCALE;
      case "%":
        if (Math.abs(b) < 1e-12) throw new Error("Modulo by zero in symbolic expression.");
        return Math.round((a % b) * this.SCALE) / this.SCALE;
      case "^":  return Math.round(Math.pow(a, b) * this.SCALE) / this.SCALE;
      case "!":  return a === 0 ? 1 : 0;
      case "u-": return -a;
      case "u+": return +a;
      default:
        throw new Error(`Unsupported operator '${op}'.`);
    }
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
    // 0. Remove <escape> and </escape> guardrail tags from OpenAI/Anthropic
    s = s.replace(/<\/?escape>/gi, "");
    // 1. Browser HTML element tags created by browser DOM parser: <s19></s19>, <s19>, <S19></S19>
    s = s.replace(/<s(\d+)>(?:<\/s\1>)?/gi, "<S$1>");
    s = s.replace(/<s(\d+)\s*\/>/gi, "<S$1>");
    // 2. HTML entities: &lt;S19&gt;, &lt;s19&gt;
    s = s.replace(/&lt;\s*s(\d+)\s*&gt;/gi, "<S$1>");
    // 3. LaTeX angle brackets: \langle S19\rangle, \langle s19\rangle
    s = s.replace(/\\langle\s*s(\d+)\s*\\rangle/gi, "<S$1>");
    // 4. Unicode angle brackets: ⟨S19⟩, ⟨s19⟩
    s = s.replace(/⟨\s*s(\d+)\s*⟩/gi, "<S$1>");
    // 5. Strip LaTeX text wrappers: \text{<S1>}, \mathrm{<S1>}, \textbf{...}, \mathit{...}
    for (let pass = 0; pass < 2; pass++) {
      s = s.replace(/\\(?:text|textbf|mathrm|mathit|mathsf|operatorname)\s*\{([^{}]*?(?:<\s*S\d+|\[?\s*S\d+|\bS\d+)[^{}]*?)\}/gi, "$1");
    }
    // 6. Canonicalize Semantic-Role Symbols (VAL1_GAJI, S1_GAJI_POKOK, S1\_GAJI\_POKOK, <S1:GAJI>, [S1_GAJI]) to <S1>
    // Note: bare S1/s2 words without underscore or brackets are protected (e.g. "program S1", "favicon s2")
    s = s.replace(
      /(?:<\s*(?:S|VAL)(\d+)(?::[A-Za-z0-9_\\]+)?\s*>|\[\s*(?:S|VAL)(\d+)(?:[:_][A-Za-z0-9_\\]+)?\s*\]|\bS(\d+)(?:\\?_[A-Za-z0-9_\\]+)+\b|\bVAL(\d+)(?:\\?_[A-Za-z0-9_\\]+)?\b)/gi,
      (_m, g1, g2, g3, g4) => `<S${g1 || g2 || g3 || g4}>`
    );

    // 6b. Context-Guarded Canonicalization for bare S\d+ in mathematical & table contexts
    // Unwrap \boxed{...} wrappers in LaTeX
    s = s.replace(/\\boxed\s*\{([^{}]+)\}/gi, "$1");
    // In LaTeX blocks \[ ... \] or \( ... \) or $$ ... $$, bare uppercase S\d+ is a symbolic variable
    s = s.replace(/(\\\[|\\\(|\$\$)([\s\S]*?)(\\\]|\\\)|\$\$)/gi, (m, open, inner, close) => {
      return open + inner.replace(/(?<![<\w])S(\d+)(?![>\w])/g, "<S$1>") + close;
    });
    // Inside backticks or <code> if not dev code (no ://, no method dot call, no semicolons)
    s = s.replace(/(`|<code>)([\s\S]*?)(`|<\/code>)/gi, (m, open, inner, close) => {
      if (/(?::\/\/|[a-zA-Z0-9_]\.[a-zA-Z_]|[{};])/.test(inner)) return m;
      return open + inner.replace(/(?<![<\w])S(\d+)(?![>\w])/g, "<S$1>") + close;
    });
    // In math operators, numbers, or currency context: 0.20 * S1, S2 + S3, (S1 - S2), Rp S1
    s = s.replace(/(?<=(?:\d+(?:\.\d+)?%?|[+\-*^×÷·(]|\\times|\\cdot|\\div|\b(?:Rp\.?|IDR|USD|EUR|GBP|\$)\s*`?|(?<!\/)\/(?!\/))\s*)(?<![<\w])S(\d+)(?![>\w])/g, "<S$1>");
    s = s.replace(/(?<![<\w])S(\d+)(?![>\w])(?=\s*(?:[-+*^×÷·)]|\\times|\\cdot|\\div|(?<!\/)\/(?!\/)))/g, "<S$1>");
    // 7. Unescape LaTeX underscore: \_ -> _
    s = s.replace(/\\_/g, "_");
    // 8. Implicit multiplication for factors before parens containing symbols: 0.25( -> 0.25 * (, 6( -> 6 * (, 24×0.25 -> 24 * 0.25
    s = s.replace(/(\d+(?:\.\d+)?%?)\s*[×·*]?\s*\(\s*(?=[^()]*<S\d+>)/gi, "$1 * (");
    s = s.replace(/(\d+(?:\.\d+)?%?)\s*[×·]\s*(\d+(?:\.\d+)?)/gi, "$1 * $2");
    return s;
  }

  /**
   * Normalizes LaTeX notation, Unicode operators, and fractions into standard arithmetic.
   * @param {string} expr
   * @returns {string}
   */
  cleanMathString(expr) {
    if (!expr || typeof expr !== "string") return "";
    let s = expr;
    // Unwrap LaTeX display/inline delimiters and \boxed{...} wrappers
    s = s.replace(/\\boxed\s*\{([^{}]+)\}/gi, "$1");
    s = s.replace(/\\\[|\\\]|\\\(|\\\)/g, "");
    s = this.preNormalizeHtmlSymbols(s);
    // Strip LaTeX text formatting commands
    s = s.replace(/\\(?:text|textbf|mathrm|mathit|mathsf|operatorname)\s*\{([^{}]+)\}/gi, "$1");
    // Normalize LaTeX fractions \frac{a}{b} -> ((a) / (b))
    s = s.replace(/\\frac\s*\{([^{}]+)\}\s*\{([^{}]+)\}/gi, "(($1) / ($2))");
    // Normalize LaTeX parens & operators
    s = s.replace(/\\left\(/gi, "(").replace(/\\right\)/gi, ")");
    s = s.replace(/\\times\b|\\cdot\b/gi, "*");
    s = s.replace(/\\div\b/gi, "/");
    s = s.replace(/\\le\b|\\leq\b/gi, "<=");
    s = s.replace(/\\ge\b|\\geq\b/gi, ">=");
    s = s.replace(/\\ne\b|\\neq\b/gi, "!=");
    // Normalize Unicode math operators
    s = s.replace(/[−–—]/g, "-");
    s = s.replace(/[×·✕⋅]/g, "*");
    s = s.replace(/÷/g, "/");
    s = s.replace(/≤/g, "<=");
    s = s.replace(/≥/g, ">=");
    s = s.replace(/≠/g, "!=");
    // Insert multiplication for juxtaposition e.g. 0.15( -> 0.15 * (
    s = s.replace(/(\d+(?:\.\d+)?)\s*\(/g, "$1 * (");
    s = s.replace(/(\d+(?:\.\d+)?)\s*(<[A-Za-z0-9_]+>)/g, "$1 * $2");
    return s.trim();
  }

  /**
   * Tokenizes a mathematical expression string containing numbers, operators, parentheses, functions, and variables.
   * @param {string} expr - e.g. "12 * 0.30 * <S1>" or "IF(<S1> > 20000000, <S1> * 0.25, <S1> * 0.15)"
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

      // 1. Symbolic variable e.g. <S1>, <S2>
      if (ch === "<" && /^<S\d+>/i.test(clean.slice(i))) {
        const match = clean.slice(i).match(/^<(S\d+)>/i);
        tokens.push({ type: "VAR", value: `<${match[1].toUpperCase()}>` });
        i += match[0].length;
        continue;
      }

      // 2. Relational & Boolean 2-character operators (<=, >=, ==, !=, &&, ||)
      const two = clean.slice(i, i + 2);
      if (["<=", ">=", "==", "!=", "&&", "||"].includes(two)) {
        tokens.push({ type: "OP", value: two });
        i += 2;
        continue;
      }

      // 3. Comma
      if (ch === ",") {
        tokens.push({ type: "COMMA", value: "," });
        i++;
        continue;
      }

      // 4. Parentheses
      if (ch === "(" || ch === ")") {
        tokens.push({ type: "PAREN", value: ch });
        i++;
        continue;
      }

      // 5. Single-character operators (+, -, *, /, %, ^, <, >, !)
      if ("+-*/%^<>!".includes(ch)) {
        const prev = tokens[tokens.length - 1];
        const isUnary =
          ch === "!" ||
          ((ch === "-" || ch === "+") &&
            (!prev ||
              prev.type === "OP" ||
              (prev.type === "PAREN" && prev.value === "(") ||
              prev.type === "COMMA"));
        if (isUnary) {
          tokens.push({ type: "OP", value: ch === "-" ? "u-" : ch === "+" ? "u+" : "!" });
        } else {
          tokens.push({ type: "OP", value: ch });
        }
        i++;
        continue;
      }

      // 6. Numeric literal (int, float, percentage)
      if (/[0-9]/.test(ch) || (ch === "." && /[0-9]/.test(clean[i + 1] || ""))) {
        const match = clean.slice(i).match(/^(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?(%?)/i);
        if (match) {
          let val = parseFloat(match[0]);
          if (match[1] === "%") val /= 100;
          tokens.push({ type: "NUM", value: val });
          i += match[0].length;
          continue;
        }
      }

      // 7. Functions & Identifiers
      if (/[A-Za-z_]/.test(ch)) {
        const match = clean.slice(i).match(/^[A-Za-z_][A-Za-z0-9_]*/)[0];
        const upper = match.toUpperCase();
        if (this.functions[upper]) {
          tokens.push({ type: "FN", value: upper });
        } else if (/^S\d+$/i.test(upper)) {
          tokens.push({ type: "VAR", value: `<${upper}>` });
        } else {
          tokens.push({ type: "VAR", value: match });
        }
        i += match.length;
        continue;
      }

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

    for (let idx = 0; idx < tokens.length; idx++) {
      const token = tokens[idx];
      const prev = idx > 0 ? tokens[idx - 1] : null;

      if (token.type === "NUM" || token.type === "VAR") {
        outputQueue.push(token);
      } else if (token.type === "FN") {
        operatorStack.push(token);
      } else if (token.type === "PAREN" && token.value === "(") {
        operatorStack.push({
          type: "PAREN",
          value: "(",
          isFn: prev && prev.type === "FN",
          argCount: 1
        });
      } else if (token.type === "COMMA") {
        while (
          operatorStack.length > 0 &&
          !(operatorStack[operatorStack.length - 1].type === "PAREN" && operatorStack[operatorStack.length - 1].value === "(")
        ) {
          outputQueue.push(operatorStack.pop());
        }
        if (operatorStack.length > 0) {
          operatorStack[operatorStack.length - 1].argCount++;
        }
      } else if (token.type === "OP") {
        const op1 = token.value;
        const p1 = this.operatorPrecedence[op1] || 0;
        const assoc1 = (op1 === "^" || op1 === "u-" || op1 === "u+" || op1 === "!") ? "R" : "L";

        while (operatorStack.length > 0) {
          const top = operatorStack[operatorStack.length - 1];
          if (top.type !== "OP") break;
          const p2 = this.operatorPrecedence[top.value] || 0;
          if ((assoc1 === "L" && p1 <= p2) || (assoc1 === "R" && p1 < p2)) {
            outputQueue.push(operatorStack.pop());
          } else {
            break;
          }
        }
        operatorStack.push(token);
      } else if (token.type === "PAREN" && token.value === ")") {
        while (
          operatorStack.length > 0 &&
          !(operatorStack[operatorStack.length - 1].type === "PAREN" && operatorStack[operatorStack.length - 1].value === "(")
        ) {
          outputQueue.push(operatorStack.pop());
        }
        if (operatorStack.length > 0) {
          const lparen = operatorStack.pop();
          if (lparen.isFn && operatorStack.length > 0 && operatorStack[operatorStack.length - 1].type === "FN") {
            const fnTok = operatorStack.pop();
            fnTok.arity = (prev && prev.type === "PAREN" && prev.value === "(") ? 0 : lparen.argCount;
            outputQueue.push(fnTok);
          }
        }
      }
    }

    while (operatorStack.length > 0) {
      const top = operatorStack.pop();
      if (top.type !== "PAREN") {
        outputQueue.push(top);
      }
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
        const isUnary = (token.value === "!" || token.value === "u-" || token.value === "u+");
        if (isUnary) {
          if (stack.length < 1) throw new Error(`Missing operand for operator '${token.value}'.`);
          const a = stack.pop();
          stack.push(this.fixedOp(token.value, a, 0));
        } else {
          if (stack.length < 2) throw new Error(`Insufficient operands for operator '${token.value}'.`);
          const b = stack.pop();
          const a = stack.pop();
          stack.push(this.fixedOp(token.value, a, b));
        }
      } else if (token.type === "FN") {
        const arity = token.arity || 0;
        if (stack.length < arity) throw new Error(`Insufficient arguments for function '${token.value}'.`);
        const args = stack.splice(stack.length - arity, arity);
        const fn = this.functions[token.value];
        if (!fn) throw new Error(`Unsupported function '${token.value}'.`);
        stack.push(fn(args));
      }
    }

    if (stack.length !== 1) {
      throw new Error("Malformed mathematical expression.");
    }

    const rawResult = stack[0];
    // Epsilon precision stabilization (avoids 10799999.999999998 artifacts)
    return Math.abs(rawResult - Math.round(rawResult)) < 1e-4 ? Math.round(rawResult) : Number(rawResult.toFixed(4));
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
    if (currency === "SGD" || currency === "S$") {
      return `S$${rounded.toLocaleString("en-SG", { minimumFractionDigits: rounded % 1 === 0 ? 0 : 2 })}`;
    }
    if (currency === "AUD" || currency === "A$") {
      return `A$${rounded.toLocaleString("en-AU", { minimumFractionDigits: rounded % 1 === 0 ? 0 : 2 })}`;
    }
    if (currency === "CAD" || currency === "C$") {
      return `C$${rounded.toLocaleString("en-CA", { minimumFractionDigits: rounded % 1 === 0 ? 0 : 2 })}`;
    }
    if (currency === "CHF") {
      return `CHF ${rounded.toLocaleString("de-CH", { minimumFractionDigits: rounded % 1 === 0 ? 0 : 2 })}`;
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

    // Helper to prevent modifying inside existing spans, pre blocks, or HTML tag attributes
    // ponytail: inline <code> allowed if containing algebraic expressions; add AST syntax filter if false positives emerge
    const replaceOutsideSpans = (content, regex, replacer) => {
      const outerRx = new RegExp(
        `(<span[^>]*class="[^"]*(?:ss-local-compute|ss-katex-hydrated)[^"]*"[\\s\\S]*?<\\/span>)|(<pre[^>]*>[\\s\\S]*?<\\/pre>)|(<(?![\\/]?[sS]\\d+>)[^>]+>)|(${regex.source})`,
        regex.flags
      );
      return content.replace(outerRx, (match, span, preBlock, htmlTag, target, ...args) => {
        if (span || preBlock || htmlTag) return match;
        return replacer(target, ...args);
      });
    };

    // Phase 0a: Explicit [[EXPR: ...]] or {{EXPR: ...}} blocks (if LLM enveloped expression)
    hydratedText = hydratedText.replace(/(?:\{\{|\u005B\u005B|\[\[)\s*EXPR\s*:\s*([\s\S]*?)(?:\}\}|\u005D\u005D|\]\])/gi, (fullMatch, rawInner) => {
      try {
        const inner = this.cleanMathString(rawInner);
        const val = this.compute(inner, symbolTable);
        let itemCurrency = defaultCurrency;
        for (const [k, obj] of Object.entries(vault)) {
          const bare = k.replace(/[<>]/g, "");
          if ((rawInner.includes(k) || rawInner.includes(bare) || inner.includes(k)) && obj.currency) {
            itemCurrency = obj.currency;
            break;
          }
        }
        const formatted = this.formatValue(val, itemCurrency, inner);
        evaluations.push({ expr: rawInner.trim(), val, formatted });
        if (htmlBadges) {
          return `<span class="ss-local-compute" data-expr="${encodeURIComponent(rawInner.trim())}" title="Locally Computed from ${escapeAttr(rawInner.trim())}">${formatted}</span>`;
        }
        return formatted;
      } catch (_) {
        return fullMatch;
      }
    });

    // Phase 0b: Balanced piecewise function calls (IF, MIN, MAX, ROUND, etc.)
    hydratedText = this.replaceBalancedFunctions(hydratedText, vault, symbolTable, defaultCurrency, htmlBadges, evaluations, escapeAttr);

    // Phase 1: Process LaTeX display and inline math blocks \[ ... \], $$ ... $$, \( ... \), $ ... $
    const latexBlockRx = /(\\\[|\$\$|\\\(|\$)([\s\S]*?)(\\\]|\$\$|\\\)|\$)/g;
    hydratedText = hydratedText.replace(latexBlockRx, (fullMatch, openTag, rawInner, closeTag) => {
      const inner = this.preNormalizeHtmlSymbols(rawInner);
      if (!/<S\d+>|\\langle\s*s?\d+\s*\\rangle|⟨\s*s?\d+\s*⟩|&lt;s?\d+&gt;|<s\d+>/i.test(inner)) return fullMatch;

      // Handle equations (with '=' but not '==', '<=', '>=', '!=')
      const eqParts = inner.split(/(?<![<>!=])=(?!=)/);
      if (eqParts.length > 1) {
        const leftSide = eqParts.slice(0, -1).join("=").trim() + " = ";
        const rightSide = eqParts[eqParts.length - 1].trim();
        const hasSymbolsInPrefix = eqParts.slice(0, -1).some(p => /<S\d+>/i.test(p));

        try {
          const cleanRight = this.cleanMathString(rightSide);
          const val = this.compute(cleanRight, symbolTable);
          const formatted = this.formatValue(val, defaultCurrency, cleanRight).replace("%", "\\%");
          evaluations.push({ expr: rightSide, val, formatted });

          // If leftSide contains derivation with symbols (e.g. "<S1> + 0.15 * <S1> = "),
          // collapse entire equation to the calculated value.
          if (hasSymbolsInPrefix) {
            return formatted;
          }
          // If leftSide is descriptive label (e.g. "\text{ESOP after SAFE} = "), keep label
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
          return formatted;
        } catch (_) {
          return fullMatch;
        }
      }
      return fullMatch;
    });

    // Phase 1b: Resolving Chained Equations in Plain Text / Tables e.g. "A + B = C * D"
    // If both sides of '=' contain secret symbols (<S\d+>), collapse to rightmost expression!
    const plainChainRx = /((?:[\(\s]*(?:<S\d+>|\d+(?:[.,]\d+)?%?)[\)\s]*(?:\s*[\+\-\*\/\^]\s*[\(\s]*(?:<S\d+>|\d+(?:[.,]\d+)?%?)[\)\s]*)*))\s*(?<![<>!=])=(?!=)\s*((?:[\(\s]*(?:<S\d+>|\d+(?:[.,]\d+)?%?)[\)\s]*(?:\s*[\+\-\*\/\^]\s*[\(\s]*(?:<S\d+>|\d+(?:[.,]\d+)?%?)[\)\s]*)+))/gi;
    hydratedText = hydratedText.replace(plainChainRx, (full, leftExpr, rightExpr) => {
      if (/<S\d+>/i.test(leftExpr) && /<S\d+>/i.test(rightExpr)) {
        return rightExpr;
      }
      return full;
    });

    // Phase 2: Process multi-term arithmetic formulas (including Unicode operators and nested parentheses)
    const multiTermRx = /(?:\(\s*)*(?:(?:<S\d+>|\\langle\s*S\d+\s*\\rangle|⟨S\d+⟩|&lt;S\d+&gt;|<s\d+>|\d+(?:\.\d+)?%?)[ \t]*[-+*\/^%−–—×·][ \t]*(?:\([ \t]*)?)+(?:<S\d+>|\\langle\s*S\d+\s*\\rangle|⟨S\d+⟩|&lt;S\d+&gt;|<s\d+>|\d+(?:\.\d+)?%?)(?:\s*\))*(?:[ \t]*[-+*\/^%−–—×·][ \t]*(?:<S\d+>|\\langle\s*S\d+\s*\\rangle|⟨S\d+⟩|&lt;S\d+&gt;|<s\d+>|\d+(?:\.\d+)?%?|[()]|\s+)+)*(?:\/(?:month|mo|year|yr|bulan|thn|day|hari|week|minggu|hr|jam)\b)?/gi;

    hydratedText = replaceOutsideSpans(hydratedText, multiTermRx, (fullMatch, ...args) => {
      const offset = typeof args[args.length - 2] === "number" ? args[args.length - 2] : args[args.length - 3];

      // Guard: do not match if part of a hyphenated alphanumeric word/token (e.g. xoxb-<S1>-123-token)
      if (offset > 0 && /[\w-]/.test(hydratedText[offset - 1])) return fullMatch;
      const endOffset = offset + fullMatch.length;
      if (endOffset < hydratedText.length && /[\w-]/.test(hydratedText[endOffset])) return fullMatch;

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

    // Phase 3: Process standalone variables (strictly bracketed, never bare S1/S2 words)
    const standaloneVarRx = /(?:<S\d+>|\\langle\s*S\d+\s*\\rangle|⟨S\d+⟩|&lt;S\d+&gt;|<s\d+>)(?:\/(?:month|mo|year|yr|bulan|thn|day|hari|week|minggu|hr|jam)\b)?/gi;

    hydratedText = replaceOutsideSpans(hydratedText, standaloneVarRx, (fullMatch, ...args) => {
      const offset = typeof args[args.length - 2] === "number" ? args[args.length - 2] : args[args.length - 3];

      // Guard: do not match if part of a hyphenated alphanumeric word/token
      if (offset > 0 && /[\w-]/.test(hydratedText[offset - 1])) return fullMatch;
      const endOffset = offset + fullMatch.length;
      if (endOffset < hydratedText.length && /[\w-]/.test(hydratedText[endOffset])) return fullMatch;

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

    // Deduplicate adjacent currency prefixes e.g. Rp `Rp ...` or Rp <code><span...>Rp ...
    hydratedText = hydratedText
      .replace(/\b(Rp\.?|IDR|USD|EUR|GBP|\$)\s*`\s*\1\s*/gi, "`$1 ")
      .replace(/\b(Rp\.?|IDR|USD|EUR|GBP|\$)\s*(?:<code>|<span[^>]*>)?\s*\1\s*/gi, "$1 ")
      .replace(/\b(Rp\.?|IDR|USD|EUR|GBP|\$)\s+\1\b/gi, "$1 ");

    return {
      hydratedText,
      computedCount: evaluations.length,
      evaluations
    };
  }

  /**
   * Helper to evaluate balanced nested function calls IF(...), MIN(...), MAX(...), ROUND(...)
   */
  replaceBalancedFunctions(text, vault, symbolTable, defaultCurrency, htmlBadges, evaluations, escapeAttr) {
    const fnRx = /\b(IF|MIN|MAX|ROUND|FLOOR|CEIL|ABS)\s*\(/gi;
    let result = "";
    let lastIndex = 0;
    let match;

    while ((match = fnRx.exec(text)) !== null) {
      const startIdx = match.index;
      const openParenIdx = fnRx.lastIndex - 1;

      let depth = 0;
      let endIdx = -1;
      for (let i = openParenIdx; i < text.length; i++) {
        if (text[i] === "(") depth++;
        else if (text[i] === ")") {
          depth--;
          if (depth === 0) {
            endIdx = i + 1;
            break;
          }
        }
      }

      if (endIdx !== -1) {
        const fullCall = text.slice(startIdx, endIdx);
        const hasSymbol = Object.keys(vault).some(k => {
          const bare = k.replace(/[<>]/g, "");
          return fullCall.includes(k) || fullCall.includes(bare);
        });

        if (hasSymbol) {
          try {
            const val = this.compute(fullCall, symbolTable);
            let itemCurrency = defaultCurrency;
            for (const [k, obj] of Object.entries(vault)) {
              if (fullCall.includes(k) && obj.currency) {
                itemCurrency = obj.currency;
                break;
              }
            }
            const formatted = this.formatValue(val, itemCurrency, fullCall);
            evaluations.push({ expr: fullCall, val, formatted });
            const replacement = htmlBadges
              ? `<span class="ss-local-compute" data-expr="${encodeURIComponent(fullCall)}" title="Locally Computed from ${escapeAttr(fullCall)}">${formatted}</span>`
              : formatted;

            result += text.slice(lastIndex, startIdx) + replacement;
            lastIndex = endIdx;
            fnRx.lastIndex = endIdx;
            continue;
          } catch (_) {}
        }
      }
    }

    result += text.slice(lastIndex);
    return result;
  }
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = SafeShareLocalCompute;
}
