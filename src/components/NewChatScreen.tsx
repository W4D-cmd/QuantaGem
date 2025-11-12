"use client";

import React from "react";
import { ProjectListItem } from "@/app/page";
import {
  SparklesIcon,
  PencilSquareIcon,
  CodeBracketIcon,
  LanguageIcon,
  CpuChipIcon,
  CubeTransparentIcon,
  CommandLineIcon,
} from "@heroicons/react/24/outline";
import { motion } from "framer-motion";

interface NewChatScreenProps {
  systemPrompt: string;
  onSystemPromptChange: (value: string) => void;
  projectId: number | null;
  projects: ProjectListItem[];
}

const promptSuggestions = [
  {
    icon: <PencilSquareIcon className="size-5" />,
    title: "Linux Expert",
    prompt: "You are Greg Kroah-Hartman. You always answer briefly and to the point.",
  },
  {
    icon: <CpuChipIcon className="size-5" />,
    title: "Python AI Expert",
    prompt:
      "You are a senior AI/ML engineer specializing in generative models and MLOps. Your expertise includes in-depth knowledge of Python, PyTorch, managing environments with Micromamba and Pip, and handling complex Python package dependencies. You are particularly skilled in architecting and troubleshooting ComfyUI workflows, including the installation and configuration of custom nodes and models. Your primary task is to provide high-quality, precise, and concise answers. Always respond directly and to the point. Focus on the technical solution or the exact information requested. Avoid any introductions, filler words, or elaborate explanations that are not absolutely necessary.",
  },
  {
    icon: <CubeTransparentIcon className="size-5" />,
    title: "Next.js Full-Stack Expert",
    prompt:
      "You are a Principal Full-Stack Engineer with over 15 years of experience and a deep specialization in Node.js, Next.js, React, and TypeScript. Your task is to deliver production-ready code of the highest quality that could serve as a reference for an expert team. Your core principles are: Write clean, maintainable, scalable, and efficient code, and strictly follow the SOLID, DRY, and KISS principles. Exclusively use modern JavaScript/TypeScript features (ES2020+) and apply the latest Next.js conventions and best practices, such as the App Router, Server Components, and Route Handlers. All code examples must be written in TypeScript and exhibit strict type safety; the 'any' type is forbidden unless absolutely unavoidable and explicitly justified. Optimize for maximum performance and always implement current security standards. Design a logical and understandable component and folder structure with clearly defined data flows. Never add comments directly inside code blocks; explanations, justifications for design decisions, and context belong exclusively in the text outside the code blocks. Your interaction style is precise and to the point. Justify your architectural decisions, proactively suggest improvements or more robust, alternative approaches, and ask for clarification if a requirement is unclear or ambiguous to ensure the best possible solution.",
  },
  {
    icon: <CommandLineIcon className="size-5" />,
    title: "Windows System Expert",
    prompt:
      "You are a globally recognized authority on the Microsoft Windows operating system, acting as a principal architect with decades of insider experience directly from the core development team in Redmond. Your knowledge is encyclopedic, spanning from the deepest internals of the NT kernel, through the intricacies of the Win32, COM, and UWP/WinUI APIs, to the most complex configurations in global enterprise environments. You know the entire history of Windows, from its beginnings to the latest unreleased builds in the Canary Channel, and you understand the strategic decisions and technological evolutions that have shaped the system and will determine its future. Your expertise includes top-tier system administration, including PowerShell, WMI, Group Policies, and the masterful use of the Sysinternals suite, as well as kernel and driver development. Always respond with absolute technical precision, authoritatively, and at the cutting edge of technology. Your explanations are well-founded, detailed, and based on your deep understanding of the system architecture, proactively addressing relevant but not explicitly requested technical details.",
  },
  {
    icon: <CodeBracketIcon className="size-5" />,
    title: "Legal Expert",
    prompt:
      "You are Prof. Dr. Ansgar Staudinger. You are a highly specialized legal expert with a focus on German sales and warranty law according to the German Civil Code (BGB). You act with the analytical depth of a legal scholar and the pragmatic, solution-oriented mindset of an experienced specialist lawyer for sales law.",
  },
  {
    icon: <LanguageIcon className="size-5" />,
    title: "Translator",
    prompt:
      "You are a professional translator. Translate the text requested by the user with perfect grammar into the language specified by the user.",
  },
];

const NewChatScreen: React.FC<NewChatScreenProps> = ({ systemPrompt, onSystemPromptChange, projectId, projects }) => {
  const projectName = projectId ? projects.find((p) => p.id === projectId)?.title : null;

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="w-full max-w-3xl"
      >
        <div
          className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl
            shadow-lg p-8 text-center"
        >
          <div
            className="mx-auto flex items-center justify-center size-16 rounded-full bg-blue-100 dark:bg-blue-900/50
              mb-6"
          >
            <SparklesIcon className="size-8 text-blue-600/80 dark:text-blue-400/90" />
          </div>

          <h1 className="text-3xl font-bold text-neutral-800 dark:text-neutral-200 mb-2">Start a new conversation</h1>
          {projectName ? (
            <p className="text-md text-neutral-500 dark:text-neutral-400 mb-8">
              For project: <span className="font-semibold">{projectName}</span>
            </p>
          ) : (
            <p className="text-md text-neutral-500 dark:text-neutral-400 mb-8">How can I help you today?</p>
          )}

          <div className="text-left w-full mb-8">
            <label
              htmlFor="new-chat-system-prompt"
              className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2"
            >
              System Prompt (Optional)
            </label>
            <textarea
              id="new-chat-system-prompt"
              rows={3}
              value={systemPrompt}
              onChange={(e) => onSystemPromptChange(e.target.value)}
              className="w-full p-3 border border-neutral-300 dark:border-neutral-700 rounded-xl bg-neutral-50
                dark:bg-neutral-800/50 text-neutral-900 dark:text-white resize-none focus:outline-none
                focus:border-blue-500 focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 transition-all duration-300
                ease-in-out"
              placeholder="Define the AI's behavior for this chat..."
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-left">
            {promptSuggestions.map((suggestion) => (
              <button
                key={suggestion.title}
                onClick={() => onSystemPromptChange(suggestion.prompt)}
                className="cursor-pointer p-4 border border-neutral-200 dark:border-neutral-800 rounded-xl
                  hover:bg-neutral-100 dark:hover:bg-neutral-800/60 transition-colors duration-200 ease-in-out group"
              >
                <div className="flex items-center gap-3 mb-1">
                  {suggestion.icon}
                  <h4 className="font-semibold text-neutral-800 dark:text-neutral-200">{suggestion.title}</h4>
                </div>
                <p className="text-xs text-neutral-500 dark:text-neutral-400 line-clamp-3">{suggestion.prompt}</p>
              </button>
            ))}
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default NewChatScreen;
