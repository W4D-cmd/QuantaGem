/**
 * Preprocesses markdown text to distinguish between LaTeX math and currency symbols.
 *
 * This utility addresses the issue where currency values like "$10" are misinterpreted
 * as LaTeX math delimiters ($). It uses a placeholder-based strategy to protect
 * legitimate math and code blocks while escaping currency-related dollar signs.
 *
 * The processing follows these steps:
 * 1. Protect code blocks and block math with placeholders.
 * 2. Identify and protect valid inline math pairs.
 * 3. Escape remaining isolated or currency-like dollar signs.
 * 4. Restore protected content from placeholders.
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

  // Phase 4: Process potential Inline Math / Balanced Currency pairs ($...$)
  // We use a non-greedy match on a single line.
  processed = processed.replace(/(?<!\\)\$(?!\$)(.+?)(?<!\\)\$/g, (match, content) => {
    // Math indicators: LaTeX commands, operators, or variables-like patterns
    // We include \, and \text{ which are often used for currency formatting in LaTeX
    const hasMathIndicators = /[\_=^\\{}<>+\-*/]|sin|cos|tan|log|exp|sqrt/i.test(content);
    
    // Currency indicators: Price ranges or just numbers
    const isPureNumber = /^\s*\d+([.,]\d+)?\s*$/.test(content);
    const isRange = /^\s*\d+([.,]\d+)?\s*[-–—]\s*\d+([.,]\d+)?\s*$/.test(content);
    const hasCurrencyText = /\s+(and|or|to|bis|und|oder|bis)\s+/i.test(content);

    // If it's math-y (like "$115 \, \text{€}$" or "$x=5$"), protect it
    if (hasMathIndicators && !isPureNumber && !isRange && !hasCurrencyText) {
      return addPlaceholder(match);
    }
    
    // If it's clearly currency text between $, escape the $
    if (isPureNumber || isRange || hasCurrencyText) {
      return `\\$${content}\\$`;
    }

    // Default: If it's not clearly math, we don't protect it yet,
    // allowing Phase 5 to handle isolated dollar signs.
    return match;
  });

  // Phase 5: Escape isolated $ signs (Prefix/Suffix) that are not already escaped
  // Prefix: $10 or $ 10
  processed = processed.replace(/(?<![\w\\$])\$(?=\s*\d)/g, "\\$");
  
  // Suffix: 10$ or 10 $
  processed = processed.replace(/(?<=\d)\s*\$(?![\w$])/g, "\\$");

  // Phase 6: Restore all placeholders in reverse order
  for (let i = placeholderCount - 1; i >= 0; i--) {
    const placeholder = `__MARKDOWN_PROTECTED_${i}__`;
    const original = protectionMap.get(placeholder);
    if (original !== undefined) {
      // Use function replacement to avoid interpreting special characters in original text
      processed = processed.replace(placeholder, () => original);
    }
  }

  return processed;
}
