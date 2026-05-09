"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LayoutDashboard, Users, ArrowLeft } from "lucide-react";
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
        className="w-70 h-full bg-neutral-100 dark:bg-zinc-900 border-r border-neutral-200
          dark:border-zinc-800 flex flex-col shadow-xl z-20"
      >
        <div className="flex-none px-6 py-8">
          <h1 className="text-[10px] font-bold text-neutral-400 dark:text-zinc-500 uppercase tracking-[0.2em]">
            QuantaGem Control
          </h1>
          <div className="text-xl font-black text-neutral-900 dark:text-zinc-100 mt-1 tracking-tighter">
            Admin <span className="text-blue-500">Panel</span>
          </div>
        </div>

        <nav className="flex-1 px-3 space-y-1.5 mt-2">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`cursor-pointer w-full text-sm font-medium text-left px-4 py-2.5 rounded-lg flex items-center gap-3
                  transition-all duration-200 group focus:outline-none
                  ${
                    isActive
                      ? "bg-white dark:bg-zinc-800 text-blue-600 dark:text-blue-400 shadow-sm border border-neutral-100 dark:border-zinc-700/50"
                      : "text-neutral-500 dark:text-zinc-400 hover:bg-neutral-100 dark:hover:bg-zinc-800/50 hover:text-neutral-900 dark:hover:text-zinc-100"
                  }`}
              >
                <tab.icon className={`size-4.5 transition-colors ${isActive ? "text-blue-500" : "text-neutral-400 group-hover:text-neutral-600 dark:group-hover:text-zinc-300"}`} />
                {tab.label}
              </button>
            );
          })}
        </nav>

        <div className="flex-none px-3 pb-6">
          <button
            onClick={() => router.push("/")}
            className="cursor-pointer w-full text-sm font-semibold text-left px-4 py-2.5 rounded-lg flex items-center gap-3
              text-neutral-400 dark:text-zinc-500 hover:bg-neutral-100 dark:hover:bg-zinc-800/50 
              hover:text-red-500 transition-all group focus:outline-none"
          >
            <ArrowLeft className="size-4.5 group-hover:-translate-x-1 transition-transform" />
            Exit Admin
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar bg-neutral-50/30 dark:bg-zinc-800/50">
        <main className="max-w-7xl mx-auto">
          {activeTab === "dashboard" && (
            <div className="p-8 lg:p-12">
              <AdminDashboard getAuthHeaders={getAuthHeaders} />
            </div>
          )}
          {activeTab === "users" && (
            <div className="p-8 lg:p-12">
              <AdminUsers getAuthHeaders={getAuthHeaders} currentUserId={currentUserId} />
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
