"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence, Variants } from "framer-motion";
import { MagnifyingGlassIcon, XMarkIcon, FolderIcon, ClockIcon } from "@heroicons/react/24/outline";
import { SearchResult } from "@/app/api/search/route";

interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectChat: (chatId: number) => void;
  getAuthHeaders: () => HeadersInit;
}

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);
  const diffWeeks = Math.floor(diffDays / 7);
  const diffMonths = Math.floor(diffDays / 30);
  const diffYears = Math.floor(diffDays / 365);

  if (diffSeconds < 60) return "just now";
  if (diffMinutes < 60) return `${diffMinutes} minute${diffMinutes === 1 ? "" : "s"} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? "" : "s"} ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`;
  if (diffWeeks < 4) return `${diffWeeks} week${diffWeeks === 1 ? "" : "s"} ago`;
  if (diffMonths < 12) return `${diffMonths} month${diffMonths === 1 ? "" : "s"} ago`;
  return `${diffYears} year${diffYears === 1 ? "" : "s"} ago`;
}

function HighlightedHeadline({ html }: { html: string }): React.ReactElement {
  // Replace <mark> tags with styled spans
  const processedHtml = html
    .replace(/<mark>/g, '<span class="search-highlight">')
    .replace(/<\/mark>/g, "</span>");

  return (
    <span
      className="text-sm text-neutral-600 dark:text-zinc-500 line-clamp-2 [&_.search-highlight]:bg-amber-200
        [&_.search-highlight]:dark:bg-amber-500/40 [&_.search-highlight]:text-amber-900
        [&_.search-highlight]:dark:text-amber-200 [&_.search-highlight]:px-0.5 [&_.search-highlight]:rounded
        [&_.search-highlight]:font-medium"
      dangerouslySetInnerHTML={{ __html: processedHtml }}
    />
  );
}

function SearchResultSkeleton(): React.ReactElement {
  return (
    <div className="px-4 py-3 animate-pulse">
      <div className="flex items-center gap-2 mb-2">
        <div className="h-4 bg-neutral-200 dark:bg-zinc-700 rounded w-1/3" />
        <div className="h-3 bg-neutral-200 dark:bg-zinc-700 rounded w-16" />
      </div>
      <div className="h-3 bg-neutral-200 dark:bg-zinc-700 rounded w-full mb-1" />
      <div className="h-3 bg-neutral-200 dark:bg-zinc-700 rounded w-2/3" />
    </div>
  );
}

const SearchModal: React.FC<SearchModalProps> = ({ isOpen, onClose, onSelectChat, getAuthHeaders }) => {
  const [isMounted, setIsMounted] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [hasSearched, setHasSearched] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const resultsContainerRef = useRef<HTMLDivElement>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Reset state when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setResults([]);
      setSelectedIndex(0);
      setHasSearched(false);
      // Auto-focus input when modal opens
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.body.style.overflow = "auto";
    };
  }, [isOpen]);

  // Debounced search function
  const performSearch = useCallback(
    async (searchQuery: string) => {
      if (!searchQuery.trim()) {
        setResults([]);
        setHasSearched(false);
        return;
      }

      setIsLoading(true);
      setHasSearched(true);

      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(searchQuery)}`, {
          headers: getAuthHeaders(),
        });

        if (!res.ok) {
          console.error("Search failed:", res.statusText);
          setResults([]);
          return;
        }

        const data = await res.json();
        setResults(data.results || []);
        setSelectedIndex(0);
      } catch (error) {
        console.error("Search error:", error);
        setResults([]);
      } finally {
        setIsLoading(false);
      }
    },
    [getAuthHeaders]
  );

  // Handle input change with debouncing
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newQuery = e.target.value;
    setQuery(newQuery);

    // Clear existing timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // Set new debounce timer (300ms)
    debounceTimerRef.current = setTimeout(() => {
      performSearch(newQuery);
    }, 300);
  };

  // Clean up debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  // Handle keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => Math.min(prev + 1, results.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === "Enter" && results.length > 0) {
        e.preventDefault();
        const selectedResult = results[selectedIndex];
        if (selectedResult) {
          onSelectChat(selectedResult.chatId);
          onClose();
        }
      }
    },
    [results, selectedIndex, onSelectChat, onClose]
  );

  // Scroll selected item into view
  useEffect(() => {
    if (resultsContainerRef.current && results.length > 0) {
      const container = resultsContainerRef.current;
      const selectedElement = container.children[selectedIndex] as HTMLElement;
      if (selectedElement) {
        selectedElement.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
    }
  }, [selectedIndex, results.length]);

  // Handle result click
  const handleResultClick = (chatId: number) => {
    onSelectChat(chatId);
    onClose();
  };

  const backdropVariants: Variants = {
    visible: { opacity: 1 },
    hidden: { opacity: 0 },
  };

  const modalVariants: Variants = {
    hidden: {
      y: "-20px",
      opacity: 0,
      scale: 0.95,
      transition: {
        duration: 0.15,
        ease: [0.42, 0, 1, 1],
      },
    },
    visible: {
      y: "0",
      opacity: 1,
      scale: 1,
      transition: {
        duration: 0.2,
        ease: [0, 0, 0.58, 1],
      },
    },
  };

  const listItemVariants: Variants = {
    hidden: { opacity: 0, x: -10 },
    visible: (i: number) => ({
      opacity: 1,
      x: 0,
      transition: {
        delay: i * 0.03,
        duration: 0.15,
      },
    }),
  };

  if (!isMounted) {
    return null;
  }

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial="hidden"
          animate="visible"
          exit="hidden"
          variants={backdropVariants}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-[9999] flex items-start justify-center pt-[15vh] bg-black/40 backdrop-blur-md p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Search chats"
          onClick={onClose}
        >
          <motion.div
            variants={modalVariants}
            className="w-full max-w-2xl bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl
              border border-neutral-200 dark:border-zinc-800 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={handleKeyDown}
          >
            {/* Search Input */}
            <div className="flex items-center gap-3 px-4 py-4 border-b border-neutral-200 dark:border-zinc-800">
              <MagnifyingGlassIcon className="size-5 text-neutral-400 dark:text-zinc-500 flex-shrink-0" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={handleInputChange}
                placeholder="Search chats..."
                className="flex-1 bg-transparent text-base text-neutral-900 dark:text-zinc-100
                  placeholder-neutral-400 dark:placeholder-zinc-500 outline-none"
                autoComplete="off"
                spellCheck={false}
              />
              <div className="flex items-center gap-2 text-xs text-neutral-400 dark:text-zinc-500">
                <kbd className="px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-zinc-800 font-mono">Esc</kbd>
                <span>to close</span>
              </div>
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg text-neutral-400 dark:text-zinc-400 hover:bg-neutral-100
                  dark:hover:bg-zinc-800 transition-colors"
                aria-label="Close search"
              >
                <XMarkIcon className="size-5" />
              </button>
            </div>

            {/* Results Area */}
            <div
              ref={resultsContainerRef}
              className="max-h-[50vh] overflow-y-auto scrollbar-thin scrollbar-thumb-neutral-200 dark:scrollbar-thumb-zinc-700"
            >
              {/* Loading State */}
              {isLoading && (
                <div>
                  <SearchResultSkeleton />
                  <SearchResultSkeleton />
                  <SearchResultSkeleton />
                </div>
              )}

              {/* Results */}
              {!isLoading && results.length > 0 && (
                <div className="py-2">
                  {results.map((result, index) => (
                    <motion.div
                      key={result.chatId}
                      custom={index}
                      initial="hidden"
                      animate="visible"
                      variants={listItemVariants}
                      className={`px-4 py-3 cursor-pointer transition-colors duration-100
                        ${
                          index === selectedIndex
                            ? "bg-neutral-100 dark:bg-zinc-800"
                            : "hover:bg-neutral-50 dark:hover:bg-zinc-800/50"
                        }`}
                      onClick={() => handleResultClick(result.chatId)}
                      onMouseEnter={() => setSelectedIndex(index)}
                    >
                      {/* Title and Project Badge */}
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-medium text-neutral-900 dark:text-zinc-100 truncate">
                          {result.chatTitle}
                        </h4>
                        {result.projectTitle && (
                          <span
                            className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full
                              bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 flex-shrink-0"
                          >
                            <FolderIcon className="size-3" />
                            {result.projectTitle}
                          </span>
                        )}
                      </div>

                      {/* Headline with highlighted matches */}
                      <HighlightedHeadline html={result.headline} />

                      {/* Timestamp */}
                      <div className="flex items-center gap-1 mt-1.5 text-xs text-neutral-400 dark:text-zinc-500">
                        <ClockIcon className="size-3" />
                        <span>{formatRelativeTime(result.updatedAt)}</span>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}

              {/* Empty State */}
              {!isLoading && hasSearched && results.length === 0 && (
                <div className="py-12 text-center">
                  <MagnifyingGlassIcon className="size-12 mx-auto text-neutral-300 dark:text-zinc-600 mb-3" />
                  <p className="text-neutral-500 dark:text-zinc-500">No results found</p>
                  <p className="text-sm text-neutral-400 dark:text-zinc-500 mt-1">
                    Try different keywords or check spelling
                  </p>
                </div>
              )}

              {/* Initial State */}
              {!isLoading && !hasSearched && (
                <div className="py-12 text-center">
                  <MagnifyingGlassIcon className="size-12 mx-auto text-neutral-300 dark:text-zinc-600 mb-3" />
                  <p className="text-neutral-500 dark:text-zinc-500">Search your chats</p>
                  <p className="text-sm text-neutral-400 dark:text-zinc-500 mt-1">
                    Search by title or message content
                  </p>
                </div>
              )}
            </div>

            {/* Footer with keyboard hints */}
            {results.length > 0 && (
              <div
                className="flex items-center justify-between px-4 py-2.5 border-t border-neutral-200
                  dark:border-zinc-800 text-xs text-neutral-400 dark:text-zinc-500"
              >
                <div className="flex items-center gap-4">
                  <span className="flex items-center gap-1">
                    <kbd className="px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-zinc-800 font-mono">
                      <span className="text-[10px]">&#8593;&#8595;</span>
                    </kbd>
                    navigate
                  </span>
                  <span className="flex items-center gap-1">
                    <kbd className="px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-zinc-800 font-mono">
                      Enter
                    </kbd>
                    select
                  </span>
                </div>
                <span>{results.length} result{results.length === 1 ? "" : "s"}</span>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
};

export default SearchModal;
