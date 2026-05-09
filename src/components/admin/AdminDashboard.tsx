"use client";

import React, { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import Tooltip from "@/components/Tooltip";

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
  return "$" + cost.toFixed(4);
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
      className="p-4 rounded-xl border border-neutral-200 dark:border-zinc-800 bg-white dark:bg-zinc-900
        transition-colors duration-300"
    >
      <div className="text-xs font-medium text-neutral-500 dark:text-zinc-500 uppercase tracking-wide">
        {label}
      </div>
      <div className="text-2xl font-bold text-neutral-900 dark:text-zinc-100 mt-1">{value}</div>
      {subtitle && (
        <div className="text-xs text-neutral-400 dark:text-zinc-600 mt-1">{subtitle}</div>
      )}
    </motion.div>
  );
}

export default function AdminDashboard({ getAuthHeaders }: AdminDashboardProps) {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>("");

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

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const res = await fetch("/api/admin/users", { headers: getAuthHeaders(), cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        setUsers(data.map((u: { id: number; email: string }) => ({ id: u.id, email: u.email })));
      } catch {
        // Silently handle
      }
    };
    fetchUsers();
  }, [getAuthHeaders]);

  const handleUserFilterChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    setSelectedUserId(val);
    fetchMetrics(val ? parseInt(val, 10) : undefined);
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
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-neutral-900 dark:text-zinc-100">Dashboard Overview</h2>
        <select
          value={selectedUserId}
          onChange={handleUserFilterChange}
          className="p-2 border border-neutral-300 dark:border-zinc-700 rounded-xl text-sm bg-white dark:bg-zinc-950
            text-neutral-700 dark:text-zinc-300 focus:outline-none focus:border-blue-500 focus:ring-2
            focus:ring-blue-500 focus:ring-opacity-50"
        >
          <option value="">All Users</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.email}
            </option>
          ))}
        </select>
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
            className="p-4 rounded-xl border border-neutral-200 dark:border-zinc-800 bg-white dark:bg-zinc-900
              space-y-2"
            variants={containerVariants}
            initial="hidden"
            animate="visible"
          >
            {metrics.modelUsage.map((m) => (
              <motion.div key={m.model} variants={itemVariants} className="flex items-center gap-3">
                <div className="w-40 text-sm text-neutral-700 dark:text-zinc-300 truncate font-medium">
                  {m.model}
                </div>
                <div className="flex-1 h-6 bg-neutral-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500 dark:bg-blue-600 rounded-full transition-all duration-500"
                    style={{ width: `${(m.count / maxModelCount) * 100}%` }}
                  />
                </div>
                <div className="w-16 text-sm text-neutral-500 dark:text-zinc-400 text-right">
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
