/**
 * Preprocesses markdown text to distinguish between LaTeX math and currency symbols.
 * 
 * This utility addresses the issue where currency values like "$10" are misinterpreted 
 * as LaTeX math delimiters ($). It uses heuristics based on the content inside 
 * potential math blocks and surrounding context to make an informed decision.
 */
export function preprocessMarkdown(text: string): string {
  if (!text) return text;

  // 1. Identify balanced pairs of $...$ on the same line that are likely NOT math
  // We use a non-greedy match to find pairs.
  // We explicitly check for common indicators of currency versus mathematics.
  let processed = text.replace(/(?<!\\)\$(?!\$)(.+?)(?<!\\)\$/g, (match, content) => {
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
    // Example: "$10 and $20" matches "$10 and $" - content "10 and ".
    // Result: "\$10 and \$" (which eventually becomes \$10 and \$20).
    if (isPureNumber || (hasCurrencyText && !hasMathIndicators)) {
      return `\\$${content}\\$`;
    }

    // Otherwise, assume it's legitimate LaTeX (e.g., "$x=30$", "$5=x+2$")
    return match;
  });

  // 2. Handle isolated $ signs that are likely currency (prefix or suffix)
  // Prefix: $10, $ 10 (not preceded by alphanumeric/backslashes)
  processed = processed.replace(/(?<![\w\\$])\$(?=\s*\d)/g, '\\$');
  
  // Suffix: 10$, 10 $ (not followed by alphanumeric/backslashes)
  processed = processed.replace(/(?<=\d)\s*\$(?![\w$])/g, '\\$');

  return processed;
}
