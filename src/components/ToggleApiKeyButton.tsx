"use client";
import { CurrencyDollarIcon as OutlineDollar } from "@heroicons/react/24/outline";
import { CurrencyDollarIcon as SolidDollar } from "@heroicons/react/24/solid";
import React from "react";

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
      className={`cursor-pointer h-9 flex justify-center items-center gap-2 px-4 rounded-full text-sm font-medium transition-colors duration-200
        ${
          isPaid
            ? "bg-[#171717] text-white border"
            : "bg-white text-[#5d5d5d] border border-gray-300"
        }`}
    >
      {isPaid ? (
        <SolidDollar className="h-5 w-5" />
      ) : (
        <OutlineDollar className="h-5 w-5" />
      )}
      <span>Paid</span>
    </button>
  );
}
