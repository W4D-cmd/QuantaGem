import React, { useState } from "react";
import ReactMarkdown, { Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import remarkMath from "remark-math";
import rehypeKatex, { Options as KatexOptions } from "rehype-katex";
import rehypeRaw from "rehype-raw";
import { preprocessMarkdown } from "@/lib/markdown-utils";

const KATEX_OPTIONS: KatexOptions = { macros: { "\\dollar": "\\$" } };

interface LazyMarkdownRendererProps {
  content: string;
  components: Components;
}

const MAX_INITIAL_RENDER_LENGTH = 5000;

const LazyMarkdownRenderer: React.FC<LazyMarkdownRendererProps> = ({ content, components }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const needsTruncation = content.length > MAX_INITIAL_RENDER_LENGTH;

  const toggleExpand = () => {
    setIsExpanded(!isExpanded);
  };

  let displayContent = content;

  if (needsTruncation && !isExpanded) {
    displayContent = content.substring(0, MAX_INITIAL_RENDER_LENGTH) + "...";
  }

  return (
    <>
      <ReactMarkdown
        remarkPlugins={[remarkMath, remarkGfm]}
        rehypePlugins={[rehypeRaw, [rehypeKatex, KATEX_OPTIONS], [rehypeHighlight, { detect: true }]]}
        components={components}
      >
        {preprocessMarkdown(displayContent)}
      </ReactMarkdown>

      {needsTruncation && (
        <button
          onClick={toggleExpand}
          className="cursor-pointer mt-2 text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400
            dark:hover:text-blue-600 font-medium focus:outline-none"
        >
          {isExpanded ? "Show less" : "Show more"}
        </button>
      )}
    </>
  );
};

export default LazyMarkdownRenderer;
