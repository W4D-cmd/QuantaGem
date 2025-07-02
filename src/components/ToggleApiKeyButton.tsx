"use client";
import React from "react";
import { CurrencyDollarIcon as OutlineCurrencyDollarIcon } from "@heroicons/react/24/outline";
import { CurrencyDollarIcon as SolidCurrencyDollarIcon } from "@heroicons/react/24/solid";

interface Props {
  selectedKey: "free" | "paid";
  onToggleAction: () => void;
}

export default function ToggleApiKeyButton({ selectedKey, onToggleAction }: Props) {
  const isPaid = selectedKey === "paid";

  return (
    <button
      onClick={onToggleAction}
      className={`cursor-pointer h-9 flex justify-center items-center gap-2 px-4 rounded-full text-sm font-medium
        transition-colors duration-300 ease-in-out ${
          isPaid
            ? `bg-black text-white border hover:bg-neutral-600 dark:bg-white dark:text-neutral-900
              dark:border-neutral-200 dark:hover:bg-neutral-400 dark:hover:border-neutral-400`
            : `bg-white border border-neutral-300 hover:bg-neutral-100 text-neutral-500 dark:bg-neutral-950
              dark:border-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-700`
        }`}
    >
      {isPaid ? (
        <SolidCurrencyDollarIcon
          className="size-5 text-white dark:text-neutral-900 transition-colors duration-300 ease-in-out"
        />
      ) : (
        <OutlineCurrencyDollarIcon
          className="size-5 text-neutral-500 dark:text-neutral-300 transition-colors duration-300 ease-in-out"
        />
      )}
      <span>{isPaid ? "Paid" : "Free"}</span>
    </button>
  );
}
