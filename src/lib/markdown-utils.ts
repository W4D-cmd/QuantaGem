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
 * 1. Protect fenced code blocks with placeholders.
 * 2. Protect block math ($$...$$) with placeholders.
 * 3. Protect inline code (`...`) with placeholders.
 * 4. Evaluate inline math pairs ($...$):
 *    a. Unwrap currency amounts that the model wrapped in LaTeX math mode ($\$120 - \$130$).
 *    b. Protect legitimate math expressions (operators, LaTeX commands, variables).
 *    c. Escape pure currency pairs ($100$, $10 and $20, etc.).
 * 5. Escape remaining isolated currency dollar signs ($10, 30$).
 * 6. Restore all placeholders.
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

  // Phase 1: Protect Fenced Code Blocks (```...```)
  let processed = text.replace(/```[\s\S]*?```/g, (match) => addPlaceholder(match));

  // Phase 2: Protect Block Math ($$...$$)
  processed = processed.replace(/\$\$[\s\S]*?\$\$/g, (match) => addPlaceholder(match));

  // Phase 3: Protect Inline Code (`...`)
  processed = processed.replace(/`[^`\n]*?`/g, (match) => addPlaceholder(match));

  // Phase 4: Process potential Inline Math pairs ($...$)
  processed = processed.replace(/(?<!\\)\$(?!\$)(.+?)(?<!\\)\$/g, (match, content) => {
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
        return content;
      }
      // Single prices or dash-separated ranges: replace \$ with \dollar (a custom
      // KaTeX macro) and keep the math block intact for proper math-font rendering.
      // \dollar is NOT a markdown escape sequence, so remark-math parses it correctly.
      const transformed = content.replace(/\\\$/g, "\\dollar ");
      return addPlaceholder(`$${transformed}$`);
    }

    // 4b. Detect legitimate math expressions and protect them with placeholders.
    // Math indicators: LaTeX commands (\frac, \alpha), operators (=, ^, _, +, etc.),
    // braces ({, }), comparison operators (<, >), or trig/log functions.
    const hasMathIndicators = /[\_=^\\{}<>+\-*/]|sin|cos|tan|log|exp|sqrt/i.test(content);

    // 4c. Detect currency patterns that should be escaped.
    const isPureNumber = /^\s*\d+([.,]\d+)?\s*$/.test(content);
    const isRange = /^\s*\d+([.,]\d+)?\s*[-–—]\s*\d+([.,]\d+)?\s*$/.test(content);
    const hasCurrencyText = /\s+(and|or|to|bis|und|oder)\s+/i.test(content);

    // If it has math indicators and is NOT a simple number, range, or currency text,
    // it is legitimate math (e.g., "$115 \, \text{€}$", "$x=5$", "$a^2 + b^2$").
    if (hasMathIndicators && !isPureNumber && !isRange && !hasCurrencyText) {
      const safeContent = content.replace(/\\\$/g, "\\dollar ");
      return addPlaceholder(`$${safeContent}$`);
    }

    // If it's clearly currency, escape the dollar signs.
    if (isPureNumber || isRange || hasCurrencyText) {
      return `\\$${content}\\$`;
    }

    // Default: leave as-is for Phase 5 to handle isolated dollar signs.
    return match;
  });

  // Phase 5: Escape isolated $ signs that are likely currency (not already escaped)
  // Prefix: $10, $ 10 (dollar sign followed by digits)
  processed = processed.replace(/(?<![\w\\$])\$(?=\s*\d)/g, "\\$");

  // Suffix: 10$, 10 $ (dollar sign after digits)
  processed = processed.replace(/(?<=\d)\s*\$(?![\w$])/g, "\\$");

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
