"use client";

import React, { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import Tooltip from "@/components/Tooltip";

interface AdminUsersProps {
  getAuthHeaders: () => HeadersInit;
  currentUserId: number | null;
}

interface UserRow {
  id: number;
  email: string;
  role: string;
  created_at: string;
  chat_count: string;
  message_count: string;
  total_cost: string;
  total_tokens: string;
  project_count: string;
  last_message_at: string | null;
  last_chat_activity: string | null;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatRelative(dateStr: string | null): string {
  if (!dateStr) return "Never";
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);
  if (diffSec < 60) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 30) return `${diffDay}d ago`;
  return formatDate(dateStr);
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.03 } },
};

const rowVariants = {
  hidden: { opacity: 0, y: 5 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.2 } },
};

export default function AdminUsers({ getAuthHeaders, currentUserId }: AdminUsersProps) {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [togglingId, setTogglingId] = useState<number | null>(null);

  const fetchUsers = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/admin/users", { headers: getAuthHeaders(), cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      setUsers(data);
    } catch {
      // Silently handle
    } finally {
      setIsLoading(false);
    }
  }, [getAuthHeaders]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleToggleAdmin = async (user: UserRow) => {
    const newRole = user.role === "admin" ? "user" : "admin";
    setTogglingId(user.id);
    try {
      const res = await fetch(`/api/admin/users/${user.id}/role`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ role: newRole }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: "Failed to update role" }));
        alert(errData.error || "Failed to update role");
        return;
      }
      setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, role: newRole } : u)));
    } catch {
      alert("Failed to update role");
    } finally {
      setTogglingId(null);
    }
  };

  const filteredUsers = users.filter((u) =>
    u.email.toLowerCase().includes(filter.toLowerCase())
  );

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-10 w-64 bg-neutral-100 dark:bg-zinc-900 rounded-xl animate-pulse" />
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-12 bg-neutral-100 dark:bg-zinc-900 rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-neutral-900 dark:text-zinc-100">User Management</h2>
        <input
          type="text"
          placeholder="Filter users by email..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="w-full max-w-md p-2 border border-neutral-300 dark:border-zinc-700 rounded-xl text-sm
            bg-white dark:bg-zinc-950 text-neutral-700 dark:text-zinc-300 placeholder-neutral-400
            dark:placeholder-zinc-500 focus:outline-none focus:border-blue-500 focus:ring-2
            focus:ring-blue-500 focus:ring-opacity-50"
        />
      </div>

      <div className="overflow-x-auto rounded-xl border border-neutral-200 dark:border-zinc-800">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs font-semibold text-neutral-500 dark:text-zinc-500 uppercase bg-neutral-50 dark:bg-zinc-900">
              <th className="px-4 py-3 text-left">Email</th>
              <th className="px-4 py-3 text-left">Role</th>
              <th className="px-4 py-3 text-left">Created</th>
              <th className="px-4 py-3 text-right">Chats</th>
              <th className="px-4 py-3 text-right">Messages</th>
              <th className="px-4 py-3 text-right">Est. Cost</th>
              <th className="px-4 py-3 text-right">Tokens</th>
              <th className="px-4 py-3 text-right">Projects</th>
              <th className="px-4 py-3 text-left">Last Activity</th>
              <th className="px-4 py-3 text-center">Admin</th>
            </tr>
          </thead>
          <motion.tbody variants={containerVariants} initial="hidden" animate="visible">
            {filteredUsers.map((user) => {
              const isSelf = user.id === currentUserId;
              return (
                <motion.tr
                  key={user.id}
                  variants={rowVariants}
                  className="border-b border-neutral-200 dark:border-zinc-800 last:border-b-0
                    hover:bg-neutral-50 dark:hover:bg-zinc-900/50 transition-colors"
                >
                  <td className="px-4 py-3 text-neutral-700 dark:text-zinc-300 font-medium">{user.email}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full ${
                        user.role === "admin"
                          ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                          : "bg-neutral-100 text-neutral-600 dark:bg-zinc-800 dark:text-zinc-400"
                      }`}
                    >
                      {user.role}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-neutral-700 dark:text-zinc-300">
                    {formatDate(user.created_at)}
                  </td>
                  <td className="px-4 py-3 text-neutral-700 dark:text-zinc-300 text-right">
                    {Number(user.chat_count).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-neutral-700 dark:text-zinc-300 text-right">
                    {Number(user.message_count).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-neutral-700 dark:text-zinc-300 text-right">
                    {"$" + Number(user.total_cost).toFixed(4)}
                  </td>
                  <td className="px-4 py-3 text-neutral-700 dark:text-zinc-300 text-right">
                    {Number(user.total_tokens).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-neutral-700 dark:text-zinc-300 text-right">
                    {Number(user.project_count).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-neutral-700 dark:text-zinc-300">
                    {formatRelative(user.last_message_at || user.last_chat_activity)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <Tooltip text={isSelf ? "Cannot remove your own admin role" : "Toggle admin role"}>
                      <input
                        type="checkbox"
                        checked={user.role === "admin"}
                        onChange={() => handleToggleAdmin(user)}
                        disabled={isSelf || togglingId === user.id}
                        className={`size-4 rounded border-neutral-300 dark:border-zinc-600 text-blue-600
                          focus:ring-blue-500 focus:ring-2 cursor-pointer
                          ${isSelf ? "opacity-50 cursor-not-allowed" : ""}`}
                      />
                    </Tooltip>
                  </td>
                </motion.tr>
              );
            })}
          </motion.tbody>
        </table>
      </div>

      <div className="text-xs text-neutral-400 dark:text-zinc-600">
        {filteredUsers.length} of {users.length} users shown
      </div>
    </div>
  );
}
