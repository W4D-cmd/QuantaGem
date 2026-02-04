import React from "react";

const MessageSkeleton: React.FC = () => {
  return (
    <div className="flex items-start max-w-xl w-full ps-4" role="status">
      <div className="w-full space-y-3 animate-pulse">
        <div className="h-2 bg-neutral-200 dark:bg-zinc-700 rounded-full w-5/6"></div>
        <div className="h-2 bg-neutral-200 dark:bg-zinc-700 rounded-full w-full"></div>
        <div className="h-2 bg-neutral-200 dark:bg-zinc-700 rounded-full w-3/4"></div>
        <div className="h-2 bg-neutral-200 dark:bg-zinc-700 rounded-full w-4/6"></div>
        <span className="sr-only">Loading...</span>
      </div>
    </div>
  );
};

export default MessageSkeleton;
