import katex from "katex";

/**
 * Preprocesses markdown text to distinguish between LaTeX math and currency symbols.
 *
 * This utility addresses the issue where currency values like "$10" or model-generated
 * LaTeX currency like "$\$120 - \$130$" are misinterpreted by remark-math / rehype-katex.
 *
 * It uses a placeholder-based strategy to protect legitimate math and code blocks
 * while escaping or unwrapping currency-related dollar signs.
 *
 * Processing phases:
 * 1. Protect fenced code blocks (```...```) with placeholders.
 * 1b. Normalize single-line display math ($$...$$ alone on a line) to the multiline fence
 *     form remark-math parses as flow (display) math, so \tag{...} renders; skipped for ANY
 *     leading indentation (the line must start at column 0), empty bodies, nested $$,
 *     trailing backslashes, and bare unescaped $. List-item continuation fences are indented
 *     2–3 spaces; converting them produces a column-0 body line that micromark's math flow
 *     rejects as a lazy line, aborting the flow and letting orphan $$ fences swallow the
 *     remainder of the document.
 * 2. Protect block math ($$...$$) with placeholders — line-anchored: complete $$ fence
 *     blocks verbatim; same-line $$...$$ pairs (display-only commands \tag/\label stripped,
 *     since they render in inline context); an unclosed fence or unpaired same-line $$ is
 *     protected verbatim for its own line only, never swallowing following prose.
 * 3. Protect inline code (`...`) with placeholders.
 * 3b. Convert bracket-delimited LaTeX (\[...\] display, \(...\) inline) to $/$$ math.
 *     remark-math only knows $/$$, and CommonMark unescapes \[ to a literal [, so without
 *     this phase the body leaks into inline parsing where _ pairs form emphasis (raw italic
 *     leak with eaten underscores). Runs after the Phase 1–3 protections, so fenced code,
 *     inline code, and existing $$ math are never scanned. Three gates before any emission;
 *     a failed gate leaves the pair verbatim, which is exactly the pre-phase rendering:
 *     (a) no placeholder tokens inside (their restored content is not what the KaTeX gate
 *     would validate), (b) LaTeX signal — command/escaped-dollar/brace/sub/superscript/=/
 *     \\ or a spaced +/- — so literal bracket escapes (\[A1\]), prose (\[siehe Grafik\]),
 *     \[C++\] and \[2024-01-15\] stay text, (c) strict KaTeX
 *     render of the exact emission string, display mode per emission — this blocks the
 *     KaTeX-error-span regression class entirely. Emissions: own-line \[...\] with 0–3
 *     spaces of indent becomes a $$ fence at that indent (flow math, \tag preserved;
 *     interior lines are re-indented to the fence because micromark's math flow rejects
 *     body lines indented less than the fence); mid-line \[...\] becomes inline $...$
 *     (mirroring Phase 4's inline emission: \tag/\label stripped, \eqref rewritten,
 *     \$ → \dollar); \(...\) always becomes inline $...$. A ≥4-space indented \[...\] is
 *     left alone (a fence there would be an indented code block). The katex import adds
 *     no bundle weight — rehype-katex already ships it in the same client chunks.
 * 4. Evaluate inline math pairs ($...$):
 *    a. Unwrap currency amounts that the model wrapped in LaTeX math mode ($\$120 - \$130$).
 *    b. Protect expressions containing LaTeX commands (\text, \frac, etc.).
 *    c. Unwrap non-dollar currency symbols (€, £, ¥, etc.) that cause KaTeX failures.
   *    d. Protect weaker math indicators (operators, braces) and digit-led
   *       factorial/degree tokens ($13!$, $45°$) when no currency signal present.
 *    e. Escape pure currency pairs ($100$, $10 and $20, etc.).
 *    f. Escape prose-like pairs ("$shirt and those $pants") by escaping both delimiters.
 *    Every emission strips display-only commands (\tag, \label), which KaTeX rejects
 *    outside display mode; pairs whose content is ONLY tag/label commands unwrap to literal
 *    reference text (\tag{N} → (N), \label{X} → removed) instead of emitting a bare $$ artifact,
 *    and \eqref{X} is rewritten to \text{(X)} at inline emissions (KaTeX 0.16 has no \eqref;
 *    verbatim $$ display blocks keep it — documented limitation).
 *    hasMathIndicators (4d) is deliberately left as-is: dropping
 *    - * / from the indicator set was evaluated and rejected because it regresses
 *    $x - y$-style math; the prose guard covers the damaging multi-word cases at
 *    higher precision.
 * 5. Escape remaining isolated currency dollar signs ($10, 30$); the suffix rule preserves
 *     the whitespace before the $.
 * 6. Restore all placeholders.
 *
 * Known limitation: display math inside blockquotes ("> $$x$$") or list-item
 * continuations (indented $$...$$) stays inline.
 */
export function preprocessMarkdown(text: string): string {
  if (!text) return text;

  const protectionMap: Map<string, string> = new Map();
  let placeholderCount = 0;

  function addPlaceholder(original: string): string {
    const placeholder = `__MARKDOWN_PROTECTED_${placeholderCount++}__`;
    protectionMap.set(placeholder, original);
    return placeholder;
  }

  function stripDisplayOnlyCommands(content: string): string {
    return content.replace(/[ \t]*\\(?:tag|label)\{[^{}]*\}/g, "");
  }

  function tagReferenceText(content: string): string {
    return content.replace(/\\tag\{([^{}]*)\}/g, "($1)").replace(/[ \t]*\\label\{[^{}]*\}/g, "").trim();
  }

  function rewriteEqref(content: string): string {
    return content.replace(/\\eqref\{([^{}]*)\}/g, "\\text{($1)}");
  }

  function findDoubleDollar(line: string, from: number): number {
    for (let i = from; i <= line.length - 2; i++) {
      if (line[i] === "$" && line[i + 1] === "$" && line[i - 1] !== "\\") return i;
    }
    return -1;
  }

  function protectSameLineMathPairs(line: string): string {
    if (!line.includes("$$")) return line;
    let result = "";
    let cursor = 0;
    while (cursor < line.length) {
      const open = findDoubleDollar(line, cursor);
      if (open === -1) break;
      const close = findDoubleDollar(line, open + 2);
      if (close === -1) {
        result += line.slice(cursor, open) + addPlaceholder(line.slice(open));
        cursor = line.length;
        break;
      }
      const rawBody = line.slice(open + 2, close);
      const stripped = stripDisplayOnlyCommands(rawBody);
      if (stripped.trim() === "" && /\\(?:tag|label)\{/.test(rawBody)) {
        result += line.slice(cursor, open) + tagReferenceText(rawBody);
      } else {
        result += line.slice(cursor, open) + addPlaceholder(`$$${rewriteEqref(stripped)}$$`);
      }
      cursor = close + 2;
    }
    return result + line.slice(cursor);
  }

  // Phase 1: Protect Fenced Code Blocks (```...```)
  let processed = text.replace(/```[\s\S]*?```/g, (match) => addPlaceholder(match));

  // Phase 1b: Normalize single-line display math ($$...$$ alone on a line) to the multiline
  // fence form. remark-math v6 parses a single-line $$...$$ paragraph as INLINE math, which
  // makes rehype-katex render \tag{...} equations as raw error spans; flow math requires the
  // $$ fences to sit on their own lines.
  processed = processed
    .split("\n")
    .map((line) => {
      const match = /^([ \t]*)\$\$(.*?)\$\$([ \t]*)\r?$/.exec(line);
      if (!match) return line;
      const [, leading, body, trailing] = match;
      if (body.length === 0 || body.includes("$$") || body.endsWith("\\") || /(?<!\\)\$/.test(body)) {
        return line;
      }
      if (leading.length !== 0) return line;
      return `${leading}$$\n${body}\n$$${trailing}`;
    })
    .join("\n");

  // Phase 2: Protect Block Math ($$...$$) — line-anchored. Complete $$ fence blocks are
  // protected verbatim; on other lines each same-line $$...$$ pair is protected (and stripped
  // of display-only commands, since it renders in inline context). An unclosed fence or an
  // unpaired same-line $$ is protected verbatim for its own line only, so partial/streaming
  // output can never swallow unrelated prose — the old document-wide lazy pairing did exactly
  // that — and never leaks into the inline-pair heuristics below.
  const fenceLine = /^[ \t]*\$\$[ \t]*\r?$/;
  const mathLines = processed.split("\n");
  const protectedLines: string[] = [];
  let lineIndex = 0;
  while (lineIndex < mathLines.length) {
    const line = mathLines[lineIndex];
    if (fenceLine.test(line)) {
      let close = -1;
      for (let j = lineIndex + 1; j < mathLines.length; j++) {
        if (fenceLine.test(mathLines[j])) {
          close = j;
          break;
        }
      }
      if (close !== -1) {
        protectedLines.push(addPlaceholder(mathLines.slice(lineIndex, close + 1).join("\n")));
        lineIndex = close + 1;
      } else {
        protectedLines.push(addPlaceholder(line));
        lineIndex += 1;
      }
      continue;
    }
    protectedLines.push(protectSameLineMathPairs(line));
    lineIndex += 1;
  }
  processed = protectedLines.join("\n");

  // Phase 3: Protect Inline Code (`...`)
  processed = processed.replace(/`[^`\n]*?`/g, (match) => addPlaceholder(match));

  // Phase 3b: Convert bracket-delimited LaTeX (\[...\] display, \(...\) inline) to $/$$.
  // See the phase list in the header doc for the gates and emission shapes.
  const KATEX_RENDER_OPTIONS = { macros: { "\\dollar": "\\$" } };

  // LaTeX signal: a command (2+ letters), an escaped dollar, a line-break \\, braces,
  // sub/superscripts, =, or a spaced +/- . Operators stay spaced-qualified so refs like
  // \[C++\] and dates like \[2024-01-15\] keep their literal rendering.
  const looksLikeLatexMath = (content: string): boolean =>
    /(?:\\[a-zA-Z]{2,}|\\\$|\\\\|[{}_^]|=| \+ | - )/.test(content);

  const isKatexRenderable = (value: string, displayMode: boolean): boolean => {
    try {
      katex.renderToString(value, { displayMode, throwOnError: true, ...KATEX_RENDER_OPTIONS });
      return true;
    } catch {
      return false;
    }
  };

  // Mirrors Phase 4's inline emission exactly: display-only commands stripped, \eqref
  // rewritten, \$ rewritten to the \dollar macro (avoids the \$-adjacent-to-delimiter
  // ambiguity). A pair consisting only of \tag/\label becomes plain reference text.
  const inlineLatexEmission = (content: string): string => {
    const stripped = stripDisplayOnlyCommands(content);
    if (stripped.trim() === "" && /\\(?:tag|label)\{/.test(content)) {
      return tagReferenceText(content);
    }
    return `$${rewriteEqref(stripped).replace(/\\\$/g, "\\dollar ").trim()}$`;
  };

  const convertInlineLatexPair = (match: string, content: string): string => {
    const body = content.trim();
    if (body === "" || /__MARKDOWN_PROTECTED_\d+__/.test(content) || !looksLikeLatexMath(content)) {
      return match;
    }
    const emission = inlineLatexEmission(body);
    if (!emission.startsWith("$")) return emission;
    if (!isKatexRenderable(emission.slice(1, -1), false)) return match;
    return addPlaceholder(emission);
  };

  processed = processed
    .replace(/(?<!\\)\\\[([\s\S]*?)(?<!\\)\\\]/g, (match: string, content: string, offset: number, full: string) => {
      const body = content.trim();
      if (body === "" || /__MARKDOWN_PROTECTED_\d+__/.test(content) || !looksLikeLatexMath(content)) {
        return match;
      }
      const lineStart = full.lastIndexOf("\n", offset - 1) + 1;
      const before = full.slice(lineStart, offset);
      const ownLineStart = /^[ \t]*$/.test(before);
      const lead = ownLineStart ? before : "";
      // ≥4 spaces = indented-code territory; emitting a fence there would create a
      // code block instead of math.
      if (ownLineStart && lead.length >= 4) return match;
      const endIdx = offset + match.length;
      const nlAfter = full.indexOf("\n", endIdx);
      const lineTail = full.slice(endIdx, nlAfter === -1 ? full.length : nlAfter);
      const ownLineEnd = /^[ \t]*\r?$/.test(lineTail);

      if (!body.includes("\n")) {
        if (ownLineStart && ownLineEnd) {
          if (body.includes("$$") || !isKatexRenderable(body, true)) return match;
          // The first fence line inherits the working text's own indent, so the
          // emission starts bare; interior lines carry the indent explicitly.
          return addPlaceholder(`$$\n${lead}${body}\n${lead}$$`);
        }
        return convertInlineLatexPair(match, body);
      }

      const lines = body.split("\n");
      if (lines.some((line) => fenceLine.test(line))) return match;
      if (!isKatexRenderable(body, true)) return match;
      // Interior lines indented below the fence make micromark's math flow abort as a
      // lazy line; re-indent them to the fence level (leading spaces are meaningless in
      // math mode). Blank lines stay blank. At column 0 lines are already at the fence
      // level and keep their relative indentation verbatim.
      const reindented = (
        lead === "" ? lines : lines.map((line) => (/^[ \t]*\r?$/.test(line) ? "" : `${lead}${line.trimStart()}`))
      ).join("\n");
      return addPlaceholder(
        `${ownLineStart ? "" : "\n"}$$\n${reindented}\n${lead}$$${ownLineEnd ? "" : "\n"}`,
      );
    })
    .replace(/(?<!\\)\\\(([\s\S]*?)(?<!\\)\\\)/g, convertInlineLatexPair);

  // Phase 4: Process potential Inline Math pairs ($...$)
  processed = processed.replace(/(?<!\\)\$(?!\$)(.+?)(?<!\\)\$/g, (match, content, offset, fullString) => {
    // Fake math detection: check if match is adjacent to digits
    const nextChars = fullString.slice(offset + match.length, offset + match.length + 2);
    const prevChars = fullString.slice(Math.max(0, offset - 2), offset);
    if (/^[.,]?\d/.test(nextChars) || /\d[.,]?$/.test(prevChars)) {
      return match;
    }

    // 4a. Detect currency amounts wrapped in LaTeX math mode by the AI model.
    // Pattern: Content consists exclusively of \$ followed by digits, with optional
    // range separators (-, –, —) or natural language connectors (and, bis, to, etc.).
    // Examples: "\$120 - \$130", "\$50", "\$10 und \$20"
    // This fixes the remark-math bug where $\$ resolves to $$ (block math delimiter).
    const isCurrencyInLatex =
      /^\s*\\\$\s*[\d.,]+(\s*[-–—]\s*\\\$\s*[\d.,]+|\s+(and|or|to|bis|und|oder)\s+\\\$\s*[\d.,]+)*\s*$/i.test(
        content,
      );
    if (isCurrencyInLatex) {
      const hasTextSeparator = /\s+(and|or|to|bis|und|oder)\s+/i.test(content);
      if (hasTextSeparator) {
        // Text separators ("und", "bis") cannot be rendered in math mode without
        // appearing as italic variables. Fallback: unwrap to plain text.
        return stripDisplayOnlyCommands(content);
      }
      // Single prices or dash-separated ranges: replace \$ with \dollar (a custom
      // KaTeX macro) and keep the math block intact for proper math-font rendering.
      // \dollar is NOT a markdown escape sequence, so remark-math parses it correctly.
      const transformed = stripDisplayOnlyCommands(content).replace(/\\\$/g, "\\dollar ");
      return addPlaceholder(`$${transformed}$`);
    }

    // 4b. Detect LaTeX commands — a strong signal for legitimate math.
    // Matches \text, \frac, \alpha, \sqrt, etc. (two or more letters after \).
    // Single-char escapes like \$ are excluded by requiring 2+ letters.
    const hasLatexCommands = /\\[a-zA-Z]{2,}/.test(content);

    // 4c. Detect currency amounts with non-dollar symbols (€, £, ¥, etc.).
    // These are not meaningful in math mode and bare currency symbols cause KaTeX
    // parse errors. Unwrap to plain text by stripping the $ delimiters.
    const isCurrencyValue =
      /[€£¥₹₽₩₪₫₴₦¢₿]/.test(content) &&
      /^[\s€£¥₹₽₩₪₫₴₦¢₿\d,.\-–—\s]+$/.test(content);
    if (isCurrencyValue) {
      return stripDisplayOnlyCommands(content);
    }

    // 4d. Detect other math indicators: operators, braces, sub/superscript, trig/log.
    const hasMathIndicators = /[\_=^\\{}<>+\-*/]|sin|cos|tan|log|exp|sqrt/i.test(content);

    // 4e. Detect currency patterns that should be escaped.
    const isPureNumber = /^\s*\d+([.,]\d+)*\s*$/.test(content);
    const isRange = /^\s*\d+([.,]\d+)*\s*[-–—]\s*\d+([.,]\d+)*\s*$/.test(content);
    const hasCurrencyText = /\s+(and|or|to|bis|und|oder)\s+/i.test(content);

    // Digit-led tokens whose ONLY trailing symbol is a factorial bang or degree
    // sign ("$13!$", "$45°$") fire no operator/brace indicator and fail the
    // prose guard (no whitespace) — they would reach Phase 5, whose currency
    // escape eats the OPENING dollar while the closing survives, rendering the
    // pair literally with a dangling $. The token must END with the marker, so
    // prose pairs like "$20! Heute nur $" keep their currency handling. KaTeX
    // renders all covered forms cleanly (13!, 13!!, 4,5!, 45°); % is excluded
    // because KaTeX treats it as a comment start.
    const isFactorialOrDegree = /^\s*\d+(?:[.,]\d+)*\s*(?:!+|°)\s*$/.test(content);

    // LaTeX commands are a definitive math signal — they override currency-text
    // heuristics because words like "und" or "and" can appear inside \text{...}.
    // Display-only commands (\tag, \label) are removed on every inline emission:
    // KaTeX rejects them outside display mode, which would discard the whole equation.
    if (hasLatexCommands) {
      const stripped = stripDisplayOnlyCommands(content);
      if (stripped.trim() === "") {
        return tagReferenceText(content);
      }
      const safeContent = rewriteEqref(stripped).replace(/\\\$/g, "\\dollar ");
      return addPlaceholder(`$${safeContent}$`);
    }

    // Weaker math indicators (operators, braces) count as math only when no
    // currency signals (range, or connector words) are present. Pure numbers are protected.
    if (isPureNumber || isFactorialOrDegree || (hasMathIndicators && !isRange && !hasCurrencyText)) {
      const safeContent = stripDisplayOnlyCommands(content).replace(/\\\$/g, "\\dollar ");
      return addPlaceholder(`$${safeContent}$`);
    }

    // 4f. Prose guard: a pair spanning prose between two currency dollars (e.g.
    // "$shirt and those $pants") is not math. Requires a 3+ letter word and whitespace,
    // excludes any operator/brace/backslash character, then escapes BOTH delimiters so the
    // sentence renders as literal text.
    const isProseLike =
      !hasLatexCommands &&
      /^[a-zA-Z0-9 .,;:!?'’"()-]+$/.test(content) &&
      /\s/.test(content) &&
      /[a-zA-Z]{3,}/.test(content) &&
      !/[_=^\\{}<>+*/]/.test(content);
    if (isProseLike) {
      return `\\$${content}\\$`;
    }

    // Default: leave as-is for Phase 5 to handle isolated dollar signs.
    return match;
  });

  // Phase 5: Escape isolated $ signs that are likely currency (not already escaped)
  // Prefix: $10, $ 10 (dollar sign followed by digits)
  processed = processed.replace(/(?<![\w\\$])\$(?=\s*\d)/g, "\\$");

  // Suffix: 10$, 10 $ (dollar sign after digits; the whitespace before it is preserved)
  processed = processed.replace(/(?<=\d)(\s*)\$(?![\w$])/g, (_match, whitespace) => `${whitespace}\\$`);

  // Phase 6: Restore all placeholders in reverse order
  for (let i = placeholderCount - 1; i >= 0; i--) {
    const placeholder = `__MARKDOWN_PROTECTED_${i}__`;
    const original = protectionMap.get(placeholder);
    if (original !== undefined) {
      processed = processed.replace(placeholder, () => original);
    }
  }

  return processed;
}
