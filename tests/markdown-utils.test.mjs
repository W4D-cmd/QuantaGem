import { test } from "node:test";
import assert from "node:assert/strict";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkMath from "remark-math";
import remarkGfm from "remark-gfm";
import katex from "katex";
import { preprocessMarkdown } from "../src/lib/markdown-utils.ts";

const processor = unified().use(remarkParse).use(remarkMath).use(remarkGfm);

const KATEX_OPTIONS = { macros: { "\\dollar": "\\$" } };

function collectMathNodes(root) {
  const nodes = [];
  const walk = (node) => {
    if (node.type === "math" || node.type === "inlineMath") nodes.push(node);
    if (Array.isArray(node.children)) for (const child of node.children) walk(child);
  };
  walk(root);
  return nodes;
}

function collectHeadingTexts(root) {
  const texts = [];
  const walk = (node) => {
    if (node.type === "heading") {
      texts.push((node.children ?? []).filter((child) => child.type === "text").map((child) => child.value).join(""));
    }
    if (Array.isArray(node.children)) for (const child of node.children) walk(child);
  };
  walk(root);
  return texts;
}

function collectOutsideMathText(root) {
  const texts = [];
  const walk = (node) => {
    if (node.type === "math" || node.type === "inlineMath") return;
    if (node.type === "text") texts.push(node.value);
    if (Array.isArray(node.children)) for (const child of node.children) walk(child);
  };
  walk(root);
  return texts;
}

const FMR_EQ =
  "\\mathrm{FMR}_g(\\tau) = \\frac{\\sum_{(i,j) \\in \\mathcal{P}_{\\text{neg}}^g} \\mathbb{I}(\\mathcal{S}_{\\text{sim}}(\\mathbf{z}_i, \\mathbf{z}_j) \\geq \\tau)}{|\\mathcal{P}_{\\text{neg}}^g|}, \\tag{13}";
const D4_EQ =
  "\\hat{y}_\\tau(\\mathbf{x}_q, \\mathbf{x}_e) = \\mathbb{I}(\\mathcal{S}_{\\mathrm{sim}}(\\mathbf{z}_q, \\mathbf{z}_e) \\geq \\tau) \\in \\{0, 1\\}, \\tag{2}";
const D5_EQ =
  "\\mathcal{L}_{\\text{reweight}}(\\theta) = \\sum_{g=1}^{|\\mathcal{G}|} \\frac{|\\mathcal{D}|}{|\\mathcal{G}| \\cdot N_g} \\sum_{\\mathbf{x}_i \\in \\mathcal{D}_g} \\ell(f_\\theta(\\mathbf{x}_i), y_i), \\tag{22}";

const L1_INPUT = [
  "1. First item with math $\\bar{p}_{b,e} = \\frac{1}{O}\\sum_{i=1}^{O} p_{i,b,e}$",
  "2. Nested item with display math:",
  "   $$\\Delta_{\\mathrm{FMRD}}(\\tau) = \\max_{g, g'} \\left| \\log_{10} \\mathrm{FMR}_g - \\log_{10} \\mathrm{FMR}_{g'} \\right|$$",
  "3. Item with inline math $\\theta$.",
  "",
  "## After the list",
].join("\n");

const L2_INPUT = ["- Parent bullet", "  $$x = 1$$", "- Sibling bullet"].join("\n");

const battery = [
  { id: "D1", input: `$$${FMR_EQ}$$`, expected: { flow: 1, inline: 0, contains: ["\\tag{13}"] } },
  { id: "D2", input: `$$\n${FMR_EQ}\n$$`, expected: { flow: 1, inline: 0, contains: ["\\tag{13}"] } },
  { id: "D3", input: "$$B_g = B / |\\mathcal{G}|$$", expected: { flow: 1, inline: 0 } },
  { id: "D4", input: `$$${D4_EQ}$$`, expected: { flow: 1, inline: 0 } },
  { id: "D5", input: `$$${D5_EQ}$$`, expected: { flow: 1, inline: 0 } },
  {
    id: "D6",
    input: `$$${FMR_EQ}$$\n\nBetween the two equations, the estimator compares similarity scores.\n\n$$${D4_EQ}$$`,
    expected: { flow: 2, inline: 0, contains: ["Between the two equations"] },
  },
  { id: "D7", input: "$$\\begin{aligned} a &= b \\\\ c &= d \\end{aligned}$$", expected: { flow: 1, inline: 0 } },
  {
    id: "D8",
    input: "Intro\n\n$$\\mathrm{FMR}_g(\\tau) = \\frac{",
    expected: { output: "Intro\n\n$$\\mathrm{FMR}_g(\\tau) = \\frac{", outsideMath: ["Intro"] },
  },
  { id: "I1", input: "The range is $\\tau \\in [-1, 1]$ inclusive.", expected: { flow: 0, inline: 1 } },
  {
    id: "I2",
    input: "an FMR of $10^{-5}$ implies high sensitivity in $10^5$ comparisons",
    expected: { flow: 0, inline: 2 },
  },
  {
    id: "I3",
    input: "$\\mathrm{Acc}_g(\\tau) = 1 - \\frac{1}{2}(\\mathrm{FMR}_g(\\tau) + \\mathrm{FNMR}_g(\\tau))$",
    expected: { flow: 0, inline: 1 },
  },
  { id: "I4", input: "($\\sigma = 19.6\\%, 8.3\\%$)", expected: { flow: 0, inline: 1 } },
  { id: "I5", input: "Use $$x$$ and $$y$$ inline here.", expected: { flow: 0, inline: 2 } },
  { id: "I6", input: "$$a$$ $$b$$", expected: { flow: 0, inline: 2 } },
  {
    id: "C1",
    input: "US pricing runs $35 million to $100 million.",
    expected: { flow: 0, inline: 0, output: "US pricing runs \\$35 million to \\$100 million." },
  },
  { id: "C2", input: "A GPU costs $999.", expected: { flow: 0, inline: 0, output: "A GPU costs \\$999." } },
  {
    id: "C3",
    input: "Items cost $3, $4, and $7 in total.",
    expected: { flow: 0, inline: 0, output: "Items cost \\$3, \\$4, and \\$7 in total." },
  },
  {
    id: "C4",
    input: "50$ refund and 60 $ credit.",
    expected: { flow: 0, inline: 0, output: "50\\$ refund and 60 \\$ credit." },
  },
  {
    id: "C5",
    input: "The subscription costs $\\$120 - \\$130$ per month.",
    expected: { flow: 0, inline: 1, contains: ["\\dollar"] },
  },
  {
    id: "C6",
    input: "Range: $\\$10 und \\$20$ im Store.",
    expected: { flow: 0, inline: 0, output: "Range: \\$10 und \\$20 im Store." },
  },
  {
    id: "C7",
    input: "I love this $shirt and those $pants a lot.",
    expected: { flow: 0, inline: 0, output: "I love this \\$shirt and those \\$pants a lot." },
  },
  {
    id: "C8",
    input: "He said $5 is cheap, and $10 is not.",
    expected: { flow: 0, inline: 0, output: "He said \\$5 is cheap, and \\$10 is not." },
  },
  {
    id: "T1",
    input: "As shown, $$\\mathrm{SER}(\\tau) = 1.0, \\tag{15}$$ concludes the proof.",
    expected: { flow: 0, inline: 1, notContains: ["\\tag{15}"] },
  },
  {
    id: "T2",
    input: "Given $\\hat{y} = \\mathbb{I}(\\cdot), \\tag{3}$ we decide.",
    expected: { flow: 0, inline: 1, notContains: ["\\tag{3}"] },
  },
  {
    id: "P1",
    input: "```python\n$$x = 1$$\n```",
    expected: { flow: 0, inline: 0, output: "```python\n$$x = 1$$\n```" },
  },
  {
    id: "P2",
    input: "Intro text.\n\n    $$x = 1$$",
    expected: { flow: 0, inline: 0, output: "Intro text.\n\n    $$x = 1$$" },
  },
  { id: "P3", input: "$$$$", expected: { output: "$$$$" } },
  { id: "P4", input: "$$x\\$$", expected: { output: "$$x\\$$", inline: 1, katexStrict: false } },
  { id: "P5a", input: "Consider $x - y$ and compute.", expected: { flow: 0, inline: 1 } },
  { id: "P5b", input: "Evaluate $2x + 1$ now.", expected: { flow: 0, inline: 1 } },
  { id: "P5c", input: "So $P(A) = 0.8$ holds.", expected: { flow: 0, inline: 1 } },
  { id: "L1", input: L1_INPUT, expected: { output: L1_INPUT, flow: 0, inline: 3, hasHeading: "After the list" } },
  { id: "L2", input: L2_INPUT, expected: { output: L2_INPUT, flow: 0, inline: 1 } },
  {
    id: "T3",
    input: "Back-reference in text: Eq. $\\tag{1}$ (literal tag text).",
    expected: { output: "Back-reference in text: Eq. (1) (literal tag text).", flow: 0, inline: 0, notContains: ["\\tag", "$$"] },
  },
  {
    id: "T4",
    input: "Ref $$\\tag{7}$$ mid-sentence.",
    expected: { output: "Ref (7) mid-sentence.", flow: 0, inline: 0, notContains: ["\\tag", "$$"] },
  },
  {
    id: "T5",
    input: "See $\\label{eq:x}$ here.",
    expected: { output: "See  here.", flow: 0, inline: 0, notContains: ["\\label", "$"] },
  },
  {
    id: "R1",
    input: "See Eq. $\\eqref{eq:1}$ for details.",
    expected: { flow: 0, inline: 1, contains: ["\\text{(eq:1)}"], notContains: ["\\eqref"] },
  },
  {
    id: "J1",
    input: "Adjacent $\\alpha$$\\beta$ pairs here.",
    expected: { output: "Adjacent $\\alpha$$\\beta$ pairs here.", outsideMathText: ["pairs here"], katexSkip: true },
  },
  { id: "F1", input: "z. B. $13!$ Möglichkeiten, 13 Bücher zu sortieren.", expected: { flow: 0, inline: 1, output: "z. B. $13!$ Möglichkeiten, 13 Bücher zu sortieren." } },
  { id: "F2", input: "$5!$ und $10 im Angebot.", expected: { flow: 0, inline: 1, output: "$5!$ und \\$10 im Angebot." } },
  { id: "F3", input: "Der Rabatt: $20! Heute nur $10.", expected: { flow: 0, inline: 0, output: "Der Rabatt: \\$20! Heute nur \\$10." } },
  { id: "F4", input: "Der Winkel beträgt $45°$ genau.", expected: { flow: 0, inline: 1, output: "Der Winkel beträgt $45°$ genau." } },
  { id: "F5", input: "Double: $13!!$ und dezimal $4,5!$.", expected: { flow: 0, inline: 2, output: "Double: $13!!$ und dezimal $4,5!$." } },
  { id: "F6", input: "Aktion! Nur $13! heute!", expected: { flow: 0, inline: 0, output: "Aktion! Nur \\$13! heute!" } },
  // Bracket-delimited LaTeX: \(...\) inline and \[...\] display. Without conversion,
  // CommonMark unescapes \[ to literal [ and the body leaks into inline parsing,
  // where _ pairs form emphasis (raw italic leak with eaten underscores).
  {
    id: "M1",
    input: "* Da der Radius einer scharfen Kante $r \\to 0$ geht, entstünde eine Singularität:\n  \\[ |\\vec{u}_{\\text{HK}}| \\to \\infty \\]",
    expected: {
      output: "* Da der Radius einer scharfen Kante $r \\to 0$ geht, entstünde eine Singularität:\n  $$\n  |\\vec{u}_{\\text{HK}}| \\to \\infty\n  $$",
      flow: 1,
      inline: 1,
    },
  },
  {
    id: "M2",
    input: "1. Item text:\n   \\[ p_{\\text{HK, oben}} = p_{\\text{HK, unten}} \\]",
    expected: { flow: 1, inline: 0 },
  },
  { id: "M3", input: "Der Wert \\(x + 1\\) steigt.", expected: { flow: 0, inline: 1, output: "Der Wert $x + 1$ steigt." } },
  {
    id: "M4",
    input: "Siehe Anhang \\[A1\\] für Details.",
    expected: { output: "Siehe Anhang \\[A1\\] für Details.", flow: 0, inline: 0 },
  },
  {
    id: "M5",
    input: "Hinweis \\[siehe Grafik\\] im Anhang.",
    expected: { output: "Hinweis \\[siehe Grafik\\] im Anhang.", flow: 0, inline: 0 },
  },
  {
    id: "M6",
    input: "Wert \\[x = y\\] Einheit",
    expected: { output: "Wert $x = y$ Einheit", flow: 0, inline: 1 },
  },
  {
    id: "M7",
    input: "```\n\\[x = y\\]\n```",
    expected: { output: "```\n\\[x = y\\]\n```", flow: 0, inline: 0 },
  },
  {
    id: "M8",
    input: "Code `\\[x = y\\]` inline.",
    expected: { output: "Code `\\[x = y\\]` inline.", flow: 0, inline: 0 },
  },
  {
    id: "M9",
    input: "$$\\[x\\]$$",
    expected: { flow: 1, inline: 0, contains: ["\\[x\\]"], katexStrict: false },
  },
  {
    id: "M10",
    input: "Intro\n\n\\[\\mathrm{FMR}_g(\\tau) = \\frac{",
    expected: { output: "Intro\n\n\\[\\mathrm{FMR}_g(\\tau) = \\frac{", outsideMath: ["Intro"] },
  },
  {
    id: "M11",
    input: "Bad: \\[\\thisisnotacommand\\] here.",
    expected: { output: "Bad: \\[\\thisisnotacommand\\] here.", flow: 0, inline: 0 },
  },
  {
    id: "M12",
    input: "Escaped backslash \\\\[x = y\\\\] stays literal.",
    expected: { output: "Escaped backslash \\\\[x = y\\\\] stays literal.", flow: 0, inline: 0 },
  },
  {
    id: "M13",
    input: "Ref \\(\\tag{1}\\) literal.",
    expected: { output: "Ref (1) literal.", flow: 0, inline: 0, notContains: ["\\tag"] },
  },
  {
    id: "M14",
    input: "Preis \\( \\$5 \\) günstig.",
    expected: { flow: 0, inline: 1, contains: ["\\dollar"] },
  },
  {
    id: "M15",
    input: "\\[\\mathrm{X} = 1 \\tag{7}\\]",
    expected: { flow: 1, inline: 0, contains: ["\\tag{7}"] },
  },
  {
    id: "M16",
    input: "Intro\n\n\\[\nx = y\n\\]\n\nOutro",
    expected: { output: "Intro\n\n$$\nx = y\n$$\n\nOutro", flow: 1, inline: 0, outsideMathText: ["Intro", "Outro"] },
  },
  {
    id: "M17",
    input: "3. Wirbelbelegung: muss die Zirkulationsdichte dort exakt verschwinden:\n   \\[ \\gamma(TE) = 0 \\quad \\text{bzw.} \\quad \\gamma(x = l) = 0 \\]",
    expected: { flow: 1, inline: 0 },
  },
  {
    id: "M18",
    input: "### \\(\\gamma\\)-Strahlung",
    expected: { flow: 0, inline: 1, output: "### $\\gamma$-Strahlung" },
  },
  {
    id: "M19",
    input: "\\[\na = b\n$$\nc = d\n\\]",
    expected: { output: "\\[\na = b\n$$\nc = d\n\\]", katexStrict: false },
  },
  {
    id: "M20",
    input: "Intro\n\n    \\[x = y\\]",
    expected: { output: "Intro\n\n    \\[x = y\\]", flow: 0, inline: 0 },
  },
  {
    id: "M21",
    input: "*item text*\n\n  \\[ x = y \\]",
    expected: { flow: 1, inline: 0 },
  },
  // Multi-line $$ blocks with content on the fence lines: micromark parses the text after
  // an opening $$ as fence meta (the "$$asciimath" slot) and DROPS it, then swallows every
  // following line until the next bare $$ (or EOF) into one broken math node. The
  // normalization must move the fence-line fragments back into the math value.
  {
    id: "D9",
    input: "$$\\begin{array}{c|ccccc}\n & F \\,(b_1) & d \\\\\n\\hline\nM & 1 & 0 \\\\\n\\end{array}$$",
    expected: { flow: 1, inline: 0, contains: ["\\begin{array}{c|ccccc}", "\\end{array}"] },
  },
  {
    id: "D10",
    input: "$$\n\\begin{array}{c}\na\n\\end{array}$$\n\nProse after.",
    expected: { flow: 1, inline: 0, contains: ["\\end{array}"], outsideMath: ["Prose after."] },
  },
  {
    id: "D11",
    input: "$$\\begin{array}{c}\na\n\\end{array}$$\n\nProse after.",
    expected: { flow: 1, inline: 0, outsideMath: ["Prose after."] },
  },
  {
    // No closing line anywhere (mid-stream): keeps the verbatim per-line handling.
    id: "D12",
    input: "Intro\n\n$$\\begin{array}{c}\na\n",
    expected: { output: "Intro\n\n$$\\begin{array}{c}\na\n" },
  },
  {
    // A $ in the opening-line fragment makes micromark reject the flow opening — the line
    // is same-line/inline territory and must not be paired into a display block.
    id: "D13",
    input: "$$\\Pi = $x\nbody\nend$$\n\nProse.",
    expected: { output: "$$\\Pi = $x\nbody\nend$$\n\nProse.", katexStrict: false },
  },
  {
    id: "D14",
    input: "$$\\begin{array}{c}\na\nend$x$$\n\nProse.",
    expected: { output: "$$\\begin{array}{c}\na\nend$x$$\n\nProse.", katexStrict: false },
  },
  // Matrix/vector environments in the fence-line shapes (the reported bug was an array
  // matrix). The normalization is shape-based, so every environment gets it.
  {
    id: "D15",
    input: "$$\\vec{v} = \\begin{pmatrix}\nv_1 \\\\\nv_2 \\\\\nv_3\n\\end{pmatrix}$$",
    expected: { flow: 1, inline: 0, contains: ["\\begin{pmatrix}"] },
  },
  {
    id: "D16",
    input: "$$A = \\begin{bmatrix}\n1 & 2 \\\\\n3 & 4\n\\end{bmatrix} \\cdot \\vec{x}$$",
    expected: { flow: 1, inline: 0, contains: ["\\begin{bmatrix}", "\\vec{x}"] },
  },
  {
    id: "D17",
    input: "$$f(x) = \\begin{cases}\nx^2 & \\text{if } x \\geq 0 \\\\\n0 & \\text{otherwise}\n\\end{cases}$$",
    expected: { flow: 1, inline: 0, contains: ["\\begin{cases}"] },
  },
  // Bare-fence matrix block (already-working path) must stay untouched.
  {
    id: "D18",
    input: "$$\n\\begin{vmatrix}\na & b \\\\\nc & d\n\\end{vmatrix} = ad - bc\n$$",
    expected: { flow: 1, inline: 0 },
  },
  {
    id: "D19",
    input: "$$\\vec{u} = \\begin{pmatrix}\n1 \\\\\n2\n\\end{pmatrix}$$\n\nThe vector $\\vec{u}$ has norm $\\|\\vec{u}\\| = \\sqrt{5}$.",
    expected: { flow: 1, inline: 2, outsideMath: ["The vector"] },
  },
];

for (const { id, input, expected } of battery) {
  test(`battery ${id}`, () => {
    const output = preprocessMarkdown(input);
    if (expected.output !== undefined) {
      assert.equal(output, expected.output, `${id}: preprocess output mismatch`);
    }
    for (const fragment of expected.contains ?? []) {
      assert.ok(output.includes(fragment), `${id}: output should contain ${JSON.stringify(fragment)}, got ${JSON.stringify(output)}`);
    }
    for (const fragment of expected.notContains ?? []) {
      assert.ok(!output.includes(fragment), `${id}: output should not contain ${JSON.stringify(fragment)}, got ${JSON.stringify(output)}`);
    }
    const tree = processor.parse(output);
    const nodes = collectMathNodes(tree);
    if (expected.flow !== undefined) {
      assert.equal(
        nodes.filter((node) => node.type === "math").length,
        expected.flow,
        `${id}: flow math node count (nodes: ${nodes.map((n) => `${n.type}:${JSON.stringify(n.value.slice(0, 40))}`).join(", ")})`,
      );
    }
    if (expected.inline !== undefined) {
      assert.equal(
        nodes.filter((node) => node.type === "inlineMath").length,
        expected.inline,
        `${id}: inlineMath node count (nodes: ${nodes.map((n) => `${n.type}:${JSON.stringify(n.value.slice(0, 40))}`).join(", ")})`,
      );
    }
    for (const fragment of expected.outsideMath ?? []) {
      for (const node of nodes) {
        assert.ok(
          !node.value.includes(fragment),
          `${id}: ${JSON.stringify(fragment)} must remain outside math nodes (found in ${node.type} ${JSON.stringify(node.value.slice(0, 40))})`,
        );
      }
    }
    if (expected.hasHeading !== undefined) {
      const headings = collectHeadingTexts(tree);
      assert.ok(
        headings.some((text) => text.includes(expected.hasHeading)),
        `${id}: heading containing ${JSON.stringify(expected.hasHeading)} must survive (headings: ${JSON.stringify(headings)})`,
      );
    }
    if (expected.outsideMathText !== undefined) {
      const outsideTexts = collectOutsideMathText(tree);
      for (const fragment of expected.outsideMathText) {
        assert.ok(
          outsideTexts.some((text) => text.includes(fragment)),
          `${id}: text ${JSON.stringify(fragment)} must survive outside math subtrees (texts: ${JSON.stringify(outsideTexts)})`,
        );
      }
    }
    if (!expected.katexSkip) {
      const throwOnError = expected.katexStrict === false ? false : true;
      for (const node of nodes) {
        try {
          katex.renderToString(node.value, {
            displayMode: node.type === "math",
            throwOnError,
            ...KATEX_OPTIONS,
          });
        } catch (error) {
          assert.fail(`${id}: KaTeX rejected ${node.type} ${JSON.stringify(node.value)} — ${error.message}`);
        }
      }
    }
  });
}

// Regression: the Buckingham-Pi message. Its dimensions matrix is a multi-line
// $$\begin{array}{c|ccccc}...\end{array}$$ block; before the fence-line-content
// normalization the opening line's content was eaten as micromark fence meta and the
// flow swallowed prose, lists, headers and thematic breaks until the next bare $$,
// whose fences then alternately closed/opened new broken flows down to EOF (red raw-TeX
// error spans interleaved with dollar-stripped plain text in the chat UI).
test("bug: multi-line array $$ block no longer cascades through the document", () => {
  const input = [
    "Intro with inline $\\Pi$ math.",
    "",
    "### 3. Die Dimensionsmatrix und das Gleichungssystem",
    "",
    "Wir tragen die Potenzen spaltenweise ein:",
    "",
    "$$\\begin{array}{c|ccccc}",
    " & F \\,(b_1) & d \\,(b_2) & v \\,(b_3) & \\rho \\,(b_4) & \\mu \\,(b_5) \\\\",
    "\\hline",
    "M & 1 & 0 & 0 & 1 & 1 \\\\",
    "L & 1 & 1 & 1 & -3 & -1 \\\\",
    "T & -2 & 0 & -1 & 0 & -1",
    "\\end{array}$$",
    "",
    "Damit $\\Pi$ dimensionslos wird, muss die Summe der Exponenten genau **$0$** ergeben:",
    "1. **(Masse $M$):** $1\\cdot b_1 + 1\\cdot b_4 + 1\\cdot b_5 = 0$",
    "2. **(Länge $L$):** $b_1 + b_2 + b_3 - 3b_4 - b_5 = 0$",
    "",
    "---",
    "",
    "### 4. Wie kommt man jetzt auf $\\Pi_1$ und $\\Pi_2$? (Der entscheidende Schritt!)",
    "",
    "Das Buckingham-Theorem sagt:",
    "$$\\text{Anzahl der Kennzahlen} = n - r = 5 - 3 = \\mathbf{2}$$",
    "Es gibt also **2 frei wählbare Variablen** in unserem Gleichungssystem!",
    "",
    "Jetzt haben wir unseren ersten Satz an $b$-Werten:",
    "$$(b_1, b_2, b_3, b_4, b_5) = (1, -2, -2, -1, 0)$$",
    "",
    "Man setzt diese 5 Zahlen in die Produktformel $\\Pi = F^{b_1} \\cdot d^{b_2}$ ein!",
    "$$\\Pi_1 = F^{\\mathbf{1}} \\cdot d^{\\mathbf{-2}} \\cdot v^{\\mathbf{-2}} \\cdot \\rho^{\\mathbf{-1}} \\cdot \\mu^{\\mathbf{0}}$$",
    "",
    "Da negative Hochzahlen in den Nenner wandern und $\\mu^0 = 1$ ist, steht da:",
    "$$\\mathbf{\\Pi_1 = \\frac{F}{d^2 \\cdot v^2 \\cdot \\rho}}$$",
    "",
    "Damit lautet unser zweiter Satz an $b$-Werten:",
    "$$(b_1, b_2, b_3, b_4, b_5) = (0, -1, -1, -1, 1)$$",
    "",
    "Wieder stur in die Produktformel einsetzen:",
    "$$\\Pi_2 = F^{\\mathbf{0}} \\cdot d^{\\mathbf{-1}} \\cdot v^{\\mathbf{-1}} \\cdot \\rho^{\\mathbf{-1}} \\cdot \\mu^{\\mathbf{1}}$$",
    "",
    "Negative Exponenten in den Nenner schreiben ($F^0 = 1$ fällt weg):",
    "$$\\mathbf{\\Pi_2 = \\frac{\\mu}{d \\cdot v \\cdot \\rho}}$$",
    "",
    "### Zusammenfassung des Kochrezepts (SOP)",
    "1. **Einheiten aufschreiben** und als Potenzen von $M, L, T$ ausdrücken.",
    "2. **Hochzahlen ablesen:** Positive $b_j$ kommen in den **Zähler**, negative in den **Nenner**. Fertig!",
  ].join("\n");

  const output = preprocessMarkdown(input);
  const tree = processor.parse(output);
  const nodes = collectMathNodes(tree);
  const flowNodes = nodes.filter((node) => node.type === "math");

  // Eight display blocks, each its own node — none may contain document prose.
  assert.equal(flowNodes.length, 8, `flow math count (values: ${flowNodes.map((n) => JSON.stringify(n.value.slice(0, 40))).join(", ")})`);
  // The matrix opener must be part of the math value, not dropped as fence meta.
  assert.ok(
    flowNodes[0].value.startsWith("\\begin{array}{c|ccccc}"),
    `array content must survive in the math value (got ${JSON.stringify(flowNodes[0].value.slice(0, 60))})`,
  );
  for (const fragment of [
    "Damit $\\Pi$ dimensionslos",
    "Das Buckingham-Theorem sagt",
    "Es gibt also",
    "Man setzt diese 5 Zahlen",
    "Da negative Hochzahlen",
    "Wieder stur in die Produktformel",
    "Negative Exponenten in den Nenner",
  ]) {
    assert.ok(
      !flowNodes.some((node) => node.value.includes(fragment)),
      `${JSON.stringify(fragment)} must stay outside math nodes`,
    );
  }
  const headings = collectHeadingTexts(tree);
  for (const heading of ["3. Die Dimensionsmatrix und das Gleichungssystem", "4. Wie kommt man jetzt auf", "Zusammenfassung des Kochrezepts (SOP)"]) {
    assert.ok(headings.some((text) => text.includes(heading)), `heading ${JSON.stringify(heading)} must survive (headings: ${JSON.stringify(headings)})`);
  }
  assert.ok(collectOutsideMathText(tree).some((text) => text.includes("Zusammenfassung des Kochrezepts (SOP)")), "summary heading text must exist outside math");
  // Every node renders — no KaTeX error spans (the red raw-TeX blocks from the bug).
  for (const node of nodes) {
    try {
      katex.renderToString(node.value, {
        displayMode: node.type === "math",
        throwOnError: true,
        ...KATEX_OPTIONS,
      });
    } catch (error) {
      assert.fail(`KaTeX rejected ${node.type} ${JSON.stringify(node.value.slice(0, 60))} — ${error.message}`);
    }
  }
});
