"use client";
import React from "react";
import { CurrencyDollarIcon as OutlineCurrencyDollarIcon } from "@heroicons/react/24/outline";
import { CurrencyDollarIcon as SolidCurrencyDollarIcon } from "@heroicons/react/24/solid";

interface Props {
  selectedKey: "free" | "paid";
  onToggleAction: () => void;
}

export default function ToggleApiKeyButton({
  selectedKey,
  onToggleAction,
}: Props) {
  const isPaid = selectedKey === "paid";

  return (
    <button
      onClick={onToggleAction}
      className={`cursor-pointer h-9 flex justify-center items-center gap-2 px-4 rounded-full text-sm font-medium transition-colors duration-150
        ${
          isPaid
            ? "bg-[#171717] text-white border hover:bg-[#5d5d5d]"
            : "bg-white text-primary border border-gray-300 hover:bg-gray-100"
        }`}
    >
      {isPaid ? (
        <SolidCurrencyDollarIcon className="size-5" />
      ) : (
        <OutlineCurrencyDollarIcon className="size-5" />
      )}
      <span>{isPaid ? "Paid" : "Free"}</span>
    </button>
  );
}
