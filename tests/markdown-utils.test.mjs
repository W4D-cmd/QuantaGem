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
