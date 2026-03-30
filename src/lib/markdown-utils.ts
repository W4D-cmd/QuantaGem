/**
 * Preprocesses markdown text to distinguish between LaTeX math and currency symbols.
 *
 * This utility addresses the issue where currency values like "$10" are misinterpreted
 * as LaTeX math delimiters ($). It uses heuristics based on the content inside
 * potential math blocks and surrounding context to make an informed decision.
 *
 * It is designed to be idempotent and avoids modifying content within code blocks
 * or block math environments.
 */
export function preprocessMarkdown(text: string): string {
  if (!text) return text;

  /**
   * We split the text into segments to protect certain areas:
   * 1. Fenced code blocks: ```...```
   * 2. Inline code: `...`
   * 3. Block math: $$...$$
   */
  const protectionPattern = /(```[\s\S]*?```|`[^`\n]*?`|\$\$[\s\S]*?\$\$)/g;
  const parts = text.split(protectionPattern);

  // Process only the non-protected parts (even indices in split result)
  for (let i = 0; i < parts.length; i++) {
    if (i % 2 === 0) {
      parts[i] = processTextSegment(parts[i]);
    }
  }

  return parts.join("");
}

/**
 * Processes a text segment that is NOT inside a code block or block math.
 */
function processTextSegment(segment: string): string {
  if (!segment) return segment;

  // 1. Identify balanced pairs of $...$ on the same line that are likely NOT math
  // We use a non-greedy match to find pairs.
  let processed = segment.replace(/(?<!\\)\$(?!\$)(.+?)(?<!\\)\$/g, (match, content) => {
    // INDICATORS FOR MATH:
    // - LaTeX commands (e.g., \frac, \alpha)
    // - Math operators and relations (=, <, >, \le, \ge, +, -, *, /, ^, _, {, })
    // - Common math function names (sin, cos, log, etc.)
    const hasMathIndicators = /[\_=^\\{}<>+\-*/]|sin|cos|tan|log|exp|sqrt/i.test(content);

    // INDICATORS FOR CURRENCY:
    // - Just a number (possibly with decimal/thousands separators like 10.00 or 1,000)
    // - Natural language conjunctions used in price ranges (and, or, to, bis, und, oder)
    const isPureNumber = /^\s*\d+([.,]\d+)?\s*$/.test(content);
    const hasCurrencyText = /\s+(and|or|to|bis|und|oder|bis)\s+/i.test(content);

    // HEURISTIC:
    // If it's a pure number or contains currency text without any math operators,
    // we escape it to prevent it from being treated as a math block.
    if (isPureNumber || (hasCurrencyText && !hasMathIndicators)) {
      return `\\$${content}\\$`;
    }

    // Otherwise, assume it's legitimate LaTeX (e.g., "$x=30$", "$5=x+2$")
    return match;
  });

  // 2. Handle isolated $ signs that are likely currency (prefix or suffix)
  // Prefix: $10, $ 10 (not preceded by alphanumeric/backslashes/already handled $)
  processed = processed.replace(/(?<![\w\\$])\$(?=\s*\d)/g, "\\$");

  // Suffix: 10$, 10 $ (not followed by alphanumeric/backslashes/already handled $)
  processed = processed.replace(/(?<=\d)\s*\$(?![\w$])/g, "\\$");

  return processed;
}
