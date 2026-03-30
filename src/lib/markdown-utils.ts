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
    // 1. Check for "Hard Math" (definite LaTeX features)
    const hasHardMath = /[\_=^{}<>]|\\(?!text|[\$€£¥\s])|sin|cos|tan|log|exp|sqrt/i.test(content);
    
    // 2. Check for "Currency" patterns
    const isCurrencyLike = /^[\s\d.,$€£¥\\/|+-–—]+$/i.test(content) || 
                          /\\text\{[€£¥$]|USD|EUR|GBP\}/.test(content) ||
                          /\s+(and|or|to|bis|und|oder|bis)\s+/i.test(content);

    if (hasHardMath) {
      return addPlaceholder(match);
    }
    
    if (isCurrencyLike) {
      // Escape ALL dollars in the match to treat as plain text.
      // We use a function replacement to prevent $n backreference issues.
      return match.replace(/\$/g, () => '\\$');
    }

    // Default: protect as math if we're not sure
    return addPlaceholder(match);
  });

  // Phase 5: Escape remaining isolated $ signs (Prefix/Suffix)
  // We MUST use functions for replacements to avoid $n interpolation bugs.
  processed = processed.replace(/(?<![\w\\$])\$(?=\s*\d)/g, () => "\\$");
  processed = processed.replace(/(?<=\d)\s*\$(?![\w$])/g, () => "\\$");

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
