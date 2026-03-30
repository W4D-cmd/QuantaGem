/**
 * Preprocesses markdown text to distinguish between LaTeX math and currency symbols.
 *
 * This utility addresses the issue where currency values are misinterpreted
 * as LaTeX math delimiters ($). It uses a placeholder-based strategy to protect
 * legitimate math and code blocks while escaping currency-related dollar signs.
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
  processed = processed.replace(/(?<!\\)\$(?!\$)(.+?)(?<!\\)\$/g, (match, content) => {
    // 1. Check for "Hard Math" (features that are definitely LaTeX and not currency)
    // Indicators: =, _, ^, {, }, <, >, or specific math commands not used in currency
    const hasHardMath = /[\_=^{}<>]|\\(?!text|[\$€£¥\s])|sin|cos|tan|log|exp|sqrt/i.test(content);
    
    // 2. Check for "Currency" (numbers, symbols, and conjunctions)
    // We include patterns like \text{€}, \$, etc.
    const isCurrencyLike = /^[\s\d.,$€£¥\\/|+-–—]+$/i.test(content) || 
                          /\\text\{[€£¥$]|USD|EUR|GBP\}/.test(content) ||
                          /\s+(and|or|to|bis|und|oder|bis)\s+/i.test(content);

    // If it's hard math, protect it as a LaTeX block
    if (hasHardMath) {
      return addPlaceholder(match);
    }
    
    // If it looks like currency (even with pseudo-LaTeX formatting), normalize it to plain text
    if (isCurrencyLike) {
      // Escape all unescaped dollar signs in the entire match to render them as plain text
      return match.replace(/(?<!\\)\$/g, '\\$');
    }

    // Default: protect as math if we're not sure (to avoid breaking legit $x$ notation)
    return addPlaceholder(match);
  });

  // Phase 5: Escape isolated $ signs (Prefix/Suffix) that are not already escaped
  processed = processed.replace(/(?<![\w\\$])\$(?=\s*\d)/g, "\\$");
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
