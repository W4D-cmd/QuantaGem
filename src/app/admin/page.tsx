"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LayoutDashboard, Users, ArrowLeft } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import ThemeToggleButton from "@/components/ThemeToggleButton";
import AdminDashboard from "@/components/admin/AdminDashboard";
import AdminUsers from "@/components/admin/AdminUsers";

type AdminTab = "dashboard" | "users";

export default function AdminPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<AdminTab>("dashboard");
  const [isVerified, setIsVerified] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<number | null>(null);

  const getAuthHeaders = useCallback((): HeadersInit => {
    const token = localStorage.getItem("__session");
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, []);

  useEffect(() => {
    const verifyAdmin = async () => {
      try {
        const res = await fetch("/api/admin/check", { headers: getAuthHeaders(), cache: "no-store" });
        if (!res.ok) {
          router.replace("/");
          return;
        }
        const data = await res.json();
        if (!data.isAdmin) {
          router.replace("/");
          return;
        }
        setCurrentUserId(data.userId ?? null);
        setIsVerified(true);
      } catch {
        router.replace("/");
      }
    };
    verifyAdmin();
  }, [router, getAuthHeaders]);

  if (!isVerified) {
    return (
      <div className="flex h-screen items-center justify-center bg-white dark:bg-zinc-800">
        <div className="size-8 border-2 border-neutral-300 border-t-neutral-500 dark:border-zinc-600 dark:border-t-zinc-400 rounded-full animate-spin" />
      </div>
    );
  }

  const tabs: { id: AdminTab; label: string; icon: React.ElementType }[] = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "users", label: "Users", icon: Users },
  ];

  return (
    <div className="flex h-screen overflow-hidden bg-white dark:bg-zinc-800">
      <div
        className="w-[13%] min-w-[200px] h-full bg-neutral-100 dark:bg-zinc-900 border-r border-neutral-200
          dark:border-zinc-800 flex flex-col transition-colors duration-300 ease-in-out"
      >
        <div className="flex-none px-4 py-4 border-b border-neutral-200 dark:border-zinc-800">
          <h1 className="text-xs font-semibold text-neutral-500 dark:text-zinc-500 uppercase tracking-wider">
            QuantaGem Admin
          </h1>
        </div>

        <nav className="flex-1 px-2 py-3 space-y-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`cursor-pointer w-full text-sm text-left p-2 py-1.5 rounded-lg flex items-center gap-2
                transition-colors duration-200 ease-in-out
                ${
                  activeTab === tab.id
                    ? "font-semibold bg-neutral-300 dark:bg-zinc-700 text-neutral-900 dark:text-zinc-50"
                    : "text-neutral-700 dark:text-zinc-300 hover:bg-neutral-200 dark:hover:bg-zinc-800"
                }`}
            >
              <tab.icon className="size-4" />
              {tab.label}
            </button>
          ))}
        </nav>

        <div className="flex-none px-2 pb-4 space-y-2">
          <div className="px-2">
            <ThemeToggleButton />
          </div>
          <button
            onClick={() => router.push("/")}
            className="cursor-pointer w-full text-sm text-left p-2 py-1.5 rounded-lg flex items-center gap-2
              text-neutral-500 dark:text-zinc-400 hover:bg-neutral-200 dark:hover:bg-zinc-800
              transition-colors duration-200 ease-in-out"
          >
            <ArrowLeft className="size-4" />
            Exit to Chat
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <AnimatePresence mode="wait">
          {activeTab === "dashboard" && (
            <motion.div
              key="dashboard"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="p-6"
            >
              <AdminDashboard getAuthHeaders={getAuthHeaders} />
            </motion.div>
          )}
          {activeTab === "users" && (
            <motion.div
              key="users"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="p-6"
            >
              <AdminUsers getAuthHeaders={getAuthHeaders} currentUserId={currentUserId} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
