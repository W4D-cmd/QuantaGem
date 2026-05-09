"use client";

import React, { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Tooltip from "@/components/Tooltip";
import { Search, X, ChevronDown, User } from "lucide-react";

interface AdminDashboardProps {
  getAuthHeaders: () => HeadersInit;
}

interface Metrics {
  totalUsers: number;
  totalAdmins: number;
  totalChats: number;
  totalMessages: number;
  totalUserMessages: number;
  totalModelMessages: number;
  totalCost: number;
  totalTokens: number;
  totalProjects: number;
  totalProjectFiles: number;
  totalStorageBytes: number;
  totalTempFiles: number;
  avgMessagesPerChat: number;
  avgCostPerChat: number;
  modelUsage: { model: string; count: number }[];
  newUsers7d: number;
  newUsers30d: number;
  activeUsers7d: number;
  activeUsers30d: number;
  chats7d: number;
  chats30d: number;
  messages7d: number;
  messages30d: number;
  cost7d: number;
  cost30d: number;
}

interface UserOption {
  id: number;
  email: string;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

function formatCost(cost: number): string {
  return "$" + cost.toFixed(2);
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.05 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3 } },
};

function MetricCard({
  label,
  value,
  subtitle,
}: {
  label: string;
  value: string;
  subtitle?: string;
}) {
  return (
    <motion.div
      variants={itemVariants}
      className="p-5 rounded-2xl border border-neutral-100 dark:border-zinc-800 bg-white dark:bg-zinc-900
        transition-colors duration-300 shadow-sm"
    >
      <div className="text-[10px] font-bold text-neutral-400 dark:text-zinc-500 uppercase tracking-widest">
        {label}
      </div>
      <div className="text-2xl font-semibold text-neutral-900 dark:text-zinc-100 mt-2 tracking-tight">{value}</div>
      {subtitle && (
        <div className="text-[11px] text-neutral-400 dark:text-zinc-600 mt-1.5 flex items-center gap-1">
          <span className="w-1 h-1 rounded-full bg-neutral-200 dark:bg-zinc-800" />
          {subtitle}
        </div>
      )}
    </motion.div>
  );
}

export default function AdminDashboard({ getAuthHeaders }: AdminDashboardProps) {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);

  const fetchMetrics = useCallback(
    async (userId?: number) => {
      setIsLoading(true);
      try {
        const url = userId ? `/api/admin/metrics?userId=${userId}` : "/api/admin/metrics";
        const res = await fetch(url, { headers: getAuthHeaders(), cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        setMetrics(data);
      } catch {
        // Silently handle
      } finally {
        setIsLoading(false);
      }
    },
    [getAuthHeaders]
  );

  useEffect(() => {
    fetchMetrics();
  }, [fetchMetrics]);

  const searchUsers = useCallback(async (query: string) => {
    if (!query) {
      setUsers([]);
      return;
    }
    setIsSearching(true);
    try {
      const res = await fetch(`/api/admin/users?search=${encodeURIComponent(query)}`, {
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setUsers(data.map((u: any) => ({ id: u.id, email: u.email })));
      }
    } catch {
      // Silently handle
    } finally {
      setIsSearching(false);
    }
  }, [getAuthHeaders]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchQuery) searchUsers(searchQuery);
      else setUsers([]);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, searchUsers]);

  const handleSelectUser = (user: UserOption | null) => {
    if (user) {
      setSelectedUserId(user.id.toString());
      setSearchQuery(user.email);
      fetchMetrics(user.id);
    } else {
      setSelectedUserId("");
      setSearchQuery("");
      fetchMetrics();
    }
    setShowResults(false);
  };

  if (isLoading || !metrics) {
    return (
      <div className="space-y-6">
        <div className="h-10 w-64 bg-neutral-100 dark:bg-zinc-900 rounded-xl animate-pulse" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-24 bg-neutral-100 dark:bg-zinc-900 rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  const maxModelCount = Math.max(...metrics.modelUsage.map((m) => m.count), 1);

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h2 className="text-xl font-bold text-neutral-900 dark:text-zinc-100">Dashboard Overview</h2>
        
        <div className="relative w-full sm:w-80">
          <div className="relative">
            <input
              type="text"
              placeholder="Search user email..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setShowResults(true);
              }}
              onFocus={() => setShowResults(true)}
              className="w-full pl-9 pr-10 py-2 bg-white dark:bg-zinc-950 border border-neutral-300 
                dark:border-zinc-800 rounded-2xl text-sm focus:border-blue-500 focus:ring-2 
                focus:ring-blue-500 focus:ring-opacity-50 transition-all placeholder:text-neutral-400"
            />
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-neutral-400" />
            
            <div className="absolute right-3 top-2.5 flex items-center gap-1">
              {isSearching && (
                <div className="h-4 w-4 border-2 border-neutral-300 border-t-blue-500 rounded-full animate-spin" />
              )}
              {searchQuery && (
                <button 
                  onClick={() => handleSelectUser(null)}
                  className="p-0.5 hover:bg-neutral-100 dark:hover:bg-zinc-800 rounded-full text-neutral-400 transition-colors cursor-pointer"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
              <ChevronDown className="h-4 w-4 text-neutral-400" />
            </div>
          </div>

          <AnimatePresence>
            {showResults && (
              <>
                <div 
                  className="fixed inset-0 z-40" 
                  onClick={() => setShowResults(false)} 
                />
                <motion.div
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.95 }}
                  className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-zinc-900 border 
                    border-neutral-200 dark:border-zinc-800 rounded-2xl shadow-xl z-50 overflow-hidden"
                >
                  <div className="max-h-60 overflow-y-auto p-1.5 custom-scrollbar">
                    <button
                      onClick={() => handleSelectUser(null)}
                      className={`w-full flex items-center px-3 py-2 text-sm rounded-xl transition-colors cursor-pointer
                        ${!selectedUserId ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600' : 'hover:bg-neutral-50 dark:hover:bg-zinc-800 text-neutral-700 dark:text-zinc-300'}`}
                    >
                      <User className="h-4 w-4 mr-2 opacity-50" />
                      All Users
                    </button>
                    {users.map((u) => (
                      <button
                        key={u.id}
                        onClick={() => handleSelectUser(u)}
                        className={`w-full flex items-center px-3 py-2 text-sm rounded-xl transition-colors cursor-pointer
                          ${selectedUserId === u.id.toString() ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600' : 'hover:bg-neutral-50 dark:hover:bg-zinc-800 text-neutral-700 dark:text-zinc-300'}`}
                      >
                        <User className="h-4 w-4 mr-2 opacity-50" />
                        <span className="truncate">{u.email}</span>
                      </button>
                    ))}
                    {users.length === 0 && searchQuery && !isSearching && (
                      <div className="px-3 py-4 text-center text-xs text-neutral-400">
                        No users found
                      </div>
                    )}
                  </div>
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>
      </div>

      <section>
        <h3 className="text-lg font-semibold text-neutral-700 dark:text-zinc-300 mb-3">Users</h3>
        <motion.div
          className="grid grid-cols-2 lg:grid-cols-4 gap-4"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          <MetricCard
            label="Total Users"
            value={metrics.totalUsers.toLocaleString()}
            subtitle={`${metrics.newUsers7d} new in last 7 days`}
          />
          <MetricCard label="Admin Users" value={metrics.totalAdmins.toLocaleString()} />
          <MetricCard
            label="Active Users (7d)"
            value={metrics.activeUsers7d.toLocaleString()}
            subtitle={`${metrics.activeUsers30d} in last 30 days`}
          />
          <MetricCard
            label="New Users (30d)"
            value={metrics.newUsers30d.toLocaleString()}
            subtitle={`${metrics.newUsers7d} in last 7 days`}
          />
        </motion.div>
      </section>

      <section>
        <h3 className="text-lg font-semibold text-neutral-700 dark:text-zinc-300 mb-3">Activity</h3>
        <motion.div
          className="grid grid-cols-2 lg:grid-cols-4 gap-4"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          <MetricCard
            label="Total Chats"
            value={metrics.totalChats.toLocaleString()}
            subtitle={`${metrics.chats7d} in last 7 days`}
          />
          <MetricCard
            label="Total Messages"
            value={metrics.totalMessages.toLocaleString()}
            subtitle={`${metrics.messages7d} in last 7 days`}
          />
          <Tooltip text={`${metrics.totalUserMessages} user / ${metrics.totalModelMessages} model`}>
            <div>
              <MetricCard
                label="User / Model Messages"
                value={`${metrics.totalUserMessages.toLocaleString()} / ${metrics.totalModelMessages.toLocaleString()}`}
              />
            </div>
          </Tooltip>
          <MetricCard
            label="Avg Messages / Chat"
            value={metrics.avgMessagesPerChat.toFixed(1)}
          />
        </motion.div>
      </section>

      <section>
        <h3 className="text-lg font-semibold text-neutral-700 dark:text-zinc-300 mb-3">
          Costs &amp; Resources
        </h3>
        <motion.div
          className="grid grid-cols-2 lg:grid-cols-4 gap-4"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          <MetricCard
            label="Estimated Total Cost"
            value={formatCost(metrics.totalCost)}
            subtitle={`Last 7 days: ${formatCost(metrics.cost7d)}`}
          />
          <MetricCard
            label="Total Tokens"
            value={metrics.totalTokens.toLocaleString()}
            subtitle="Latest snapshot per session"
          />
          <MetricCard
            label="Total Projects"
            value={metrics.totalProjects.toLocaleString()}
          />
          <MetricCard
            label="Storage Used"
            value={formatBytes(metrics.totalStorageBytes)}
            subtitle={`${metrics.totalProjectFiles} project files, ${metrics.totalTempFiles} temp files`}
          />
        </motion.div>
      </section>

      {metrics.modelUsage.length > 0 && (
        <section>
          <h3 className="text-lg font-semibold text-neutral-700 dark:text-zinc-300 mb-3">Model Usage</h3>
          <motion.div
            className="p-6 rounded-2xl border border-neutral-100 dark:border-zinc-800 bg-white dark:bg-zinc-900
              space-y-4 shadow-sm"
            variants={containerVariants}
            initial="hidden"
            animate="visible"
          >
            {metrics.modelUsage.map((m) => (
              <motion.div key={m.model} variants={itemVariants} className="flex items-center gap-4">
                <Tooltip text={m.model}>
                  <div className="w-56 lg:w-64 text-sm text-neutral-600 dark:text-zinc-400 truncate font-medium">
                    {m.model}
                  </div>
                </Tooltip>
                <div className="flex-1 h-2.5 bg-neutral-50 dark:bg-zinc-800/50 rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${(m.count / maxModelCount) * 100}%` }}
                    transition={{ duration: 1, ease: "easeOut" }}
                    className="h-full bg-blue-500 dark:bg-blue-600 rounded-full"
                  />
                </div>
                <div className="w-20 text-xs font-bold text-neutral-700 dark:text-zinc-300 text-right tabular-nums">
                  {m.count.toLocaleString()}
                </div>
              </motion.div>
            ))}
          </motion.div>
        </section>
      )}
    </div>
  );
}
