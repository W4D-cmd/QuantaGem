"use client";

import React, { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import Tooltip from "@/components/Tooltip";

import { Plus, Trash2, Loader2, Search, UserPlus, Shield, Mail, Lock } from "lucide-react";

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
  visible: { 
    opacity: 1, 
    transition: { 
      staggerChildren: 0.04,
      delayChildren: 0.05
    } 
  },
};

const rowVariants = {
  hidden: { opacity: 0, y: 10, height: 0 },
  visible: { 
    opacity: 1, 
    y: 0, 
    height: "auto",
    transition: { 
      opacity: { duration: 0.3 },
      y: { type: "spring", stiffness: 100, damping: 15 },
      height: { duration: 0.3 }
    } 
  },
};

export default function AdminUsers({ getAuthHeaders, currentUserId }: AdminUsersProps) {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [togglingId, setTogglingId] = useState<number | null>(null);
  const [isDeletingId, setIsDeletingId] = useState<number | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [newUserData, setNewUserData] = useState({ email: "", password: "", role: "user" });

  const fetchUsers = useCallback(async (searchQuery: string = "") => {
    setIsLoading(true);
    try {
      const url = searchQuery ? `/api/admin/users?search=${encodeURIComponent(searchQuery)}` : "/api/admin/users";
      const res = await fetch(url, { headers: getAuthHeaders(), cache: "no-store" });
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
    const timer = setTimeout(() => {
      fetchUsers(filter);
    }, 300);
    return () => clearTimeout(timer);
  }, [filter, fetchUsers]);

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

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsAdding(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify(newUserData),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: "Failed to create user" }));
        alert(errData.error || "Failed to create user");
        return;
      }
      setShowAddModal(false);
      setNewUserData({ email: "", password: "", role: "user" });
      fetchUsers(filter);
    } catch {
      alert("Failed to create user");
    } finally {
      setIsAdding(false);
    }
  };

  const handleDeleteUser = async (user: UserRow) => {
    if (!confirm(`Are you sure you want to delete user ${user.email}? This action is permanent and will delete all their chats and files.`)) {
      return;
    }
    setIsDeletingId(user.id);
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: "Failed to delete user" }));
        alert(errData.error || "Failed to delete user");
        return;
      }
      setUsers((prev) => prev.filter((u) => u.id !== user.id));
    } catch {
      alert("Failed to delete user");
    } finally {
      setIsDeletingId(null);
    }
  };

  return (
    <motion.div 
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="space-y-6"
    >
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <h2 className="text-xl font-bold text-neutral-900 dark:text-zinc-100 tracking-tight">User Management</h2>
        
        <div className="flex items-center gap-3">
          <div className="relative flex-1 md:w-80">
            <input
              type="text"
              placeholder="Search by email..."
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-white dark:bg-zinc-950 border border-neutral-300 
                dark:border-zinc-900 rounded-3xl text-sm focus:border-blue-500 focus:ring-2 
                focus:ring-blue-500 focus:ring-opacity-50 transition-all shadow-lg focus:outline-none"
            />
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-neutral-400" />
          </div>
          
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white 
              text-sm font-medium rounded-2xl transition-colors shadow-lg shadow-blue-500/20 cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Add User</span>
          </button>
        </div>
      </div>

      <motion.div 
        layout
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="bg-white dark:bg-zinc-900 rounded-3xl border border-neutral-100 dark:border-zinc-800 shadow-sm overflow-hidden"
      >
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] font-bold text-neutral-400 dark:text-zinc-500 uppercase tracking-widest bg-neutral-50/50 dark:bg-zinc-900/50 border-b border-neutral-100 dark:border-zinc-800">
                <th className="px-6 py-4 text-left">Email</th>
                <th className="px-6 py-4 text-left">Role</th>
                <th className="px-6 py-4 text-left">Created</th>
                <th className="px-6 py-4 text-right">Activity</th>
                <th className="px-6 py-4 text-right">Cost/Tokens</th>
                <th className="px-6 py-4 text-center">Admin</th>
                <th className="px-6 py-4 text-center">Actions</th>
              </tr>
            </thead>
            <motion.tbody 
              variants={containerVariants} 
              initial="hidden" 
              animate="visible"
              className="divide-y divide-neutral-100 dark:divide-zinc-800"
            >
              <AnimatePresence mode="popLayout">
                {users.map((user) => {
                  const isSelf = user.id === currentUserId;
                  return (
                    <motion.tr
                      key={user.id}
                      layout
                      variants={rowVariants}
                      className="hover:bg-neutral-50/50 dark:hover:bg-zinc-800/50 transition-colors group"
                    >
                    <td className="px-6 py-4">
                      <div className="text-neutral-900 dark:text-zinc-100 font-medium">{user.email}</div>
                      <div className="text-[10px] text-neutral-400 dark:text-zinc-500 mt-0.5">ID: {user.id}</div>
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                          user.role === "admin"
                            ? "bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400"
                            : "bg-neutral-100 text-neutral-600 dark:bg-zinc-800 dark:text-zinc-400"
                        }`}
                      >
                        {user.role}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-neutral-500 dark:text-zinc-400 whitespace-nowrap">
                      {formatDate(user.created_at)}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="text-neutral-700 dark:text-zinc-300 font-medium">
                        {Number(user.chat_count).toLocaleString()} chats
                      </div>
                      <div className="text-xs text-neutral-400 dark:text-zinc-500">
                        {formatRelative(user.last_message_at || user.last_chat_activity)}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="text-blue-600 dark:text-blue-400 font-bold">
                        {"$" + Number(user.total_cost).toFixed(2)}
                      </div>
                      <div className="text-[10px] text-neutral-400 dark:text-zinc-500">
                        {Number(user.total_tokens).toLocaleString()} tokens
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <Tooltip text={isSelf ? "Cannot remove your own admin role" : "Toggle admin role"}>
                        <div className="flex justify-center">
                          {togglingId === user.id ? (
                            <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
                          ) : (
                            <input
                              type="checkbox"
                              checked={user.role === "admin"}
                              onChange={() => handleToggleAdmin(user)}
                              disabled={isSelf || togglingId === user.id}
                              className={`size-4 rounded border-neutral-300 dark:border-zinc-700 text-blue-600
                                cursor-pointer
                                ${isSelf ? "opacity-30 cursor-not-allowed" : ""}`}
                            />
                          )}
                        </div>
                      </Tooltip>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <div className="flex justify-center">
                        <Tooltip text={isSelf ? "Cannot delete yourself" : "Delete user"}>
                          <button
                            onClick={() => handleDeleteUser(user)}
                            disabled={isSelf || isDeletingId === user.id}
                            className={`p-2 text-neutral-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 
                              rounded-xl transition-all cursor-pointer ${isSelf ? 'opacity-30 cursor-not-allowed' : 'opacity-0 group-hover:opacity-100'}`}
                          >
                            {isDeletingId === user.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Trash2 className="h-4 w-4" />
                            )}
                          </button>
                        </Tooltip>
                      </div>
                    </td>
                    </motion.tr>
                  );
                })}
              </AnimatePresence>
            </motion.tbody>          </table>
        </div>
      </div>

      <div className="flex items-center justify-between text-xs font-medium text-neutral-400 dark:text-zinc-600 px-2">
        <div>{users.length} users found</div>
        {isLoading && <Loader2 className="h-3 w-3 animate-spin" />}
      </div>

      {/* Add User Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-neutral-900/40 backdrop-blur-sm"
            onClick={() => !isAdding && setShowAddModal(false)}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="relative w-full max-w-md bg-white dark:bg-zinc-900 rounded-3xl shadow-2xl overflow-hidden"
          >
            <div className="p-6 border-b border-neutral-100 dark:border-zinc-800">
              <h3 className="text-xl font-bold text-neutral-900 dark:text-zinc-100 flex items-center gap-2">
                <UserPlus className="h-5 w-5 text-blue-500" />
                Add New User
              </h3>
              <p className="text-sm text-neutral-500 dark:text-zinc-500 mt-1">
                Create a new account manually.
              </p>
            </div>

            <form onSubmit={handleAddUser} className="p-6 space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-bold text-neutral-400 dark:text-zinc-500 uppercase tracking-wider ml-1">
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-2.5 h-4 w-4 text-neutral-400" />
                  <input
                    type="email"
                    required
                    value={newUserData.email}
                    onChange={(e) => setNewUserData({ ...newUserData, email: e.target.value })}
                    className="w-full pl-9 pr-4 py-2 bg-neutral-50 dark:bg-zinc-950 border border-neutral-300 
                      dark:border-zinc-900 rounded-3xl text-sm focus:border-blue-500 focus:ring-2 
                      focus:ring-blue-500 focus:ring-opacity-50 transition-all shadow-lg focus:outline-none"
                    placeholder="user@example.com"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-neutral-400 dark:text-zinc-500 uppercase tracking-wider ml-1">
                  Initial Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-2.5 h-4 w-4 text-neutral-400" />
                  <input
                    type="password"
                    required
                    minLength={8}
                    value={newUserData.password}
                    onChange={(e) => setNewUserData({ ...newUserData, password: e.target.value })}
                    className="w-full pl-9 pr-4 py-2 bg-neutral-50 dark:bg-zinc-950 border border-neutral-300 
                      dark:border-zinc-900 rounded-3xl text-sm focus:border-blue-500 focus:ring-2 
                      focus:ring-blue-500 focus:ring-opacity-50 transition-all shadow-lg focus:outline-none"
                    placeholder="At least 8 characters"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-neutral-400 dark:text-zinc-500 uppercase tracking-wider ml-1">
                  Role
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setNewUserData({ ...newUserData, role: "user" })}
                    className={`flex-1 py-2 rounded-2xl text-xs font-bold border transition-all cursor-pointer
                      ${newUserData.role === "user" 
                        ? 'bg-blue-50 border-blue-200 text-blue-600 dark:bg-blue-900/20 dark:border-blue-800' 
                        : 'border-neutral-200 dark:border-zinc-800 text-neutral-500 hover:bg-neutral-50 dark:hover:bg-zinc-800'}`}
                  >
                    USER
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewUserData({ ...newUserData, role: "admin" })}
                    className={`flex-1 py-2 rounded-2xl text-xs font-bold border transition-all flex items-center justify-center gap-1 cursor-pointer
                      ${newUserData.role === "admin" 
                        ? 'bg-blue-50 border-blue-200 text-blue-600 dark:bg-blue-900/20 dark:border-blue-800' 
                        : 'border-neutral-200 dark:border-zinc-800 text-neutral-500 hover:bg-neutral-50 dark:hover:bg-zinc-800'}`}
                  >
                    <Shield className="h-3 w-3" />
                    ADMIN
                  </button>
                </div>
              </div>

              <div className="pt-4 flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  disabled={isAdding}
                  className="flex-1 py-2.5 rounded-2xl text-sm font-bold text-neutral-500 hover:bg-neutral-50 
                    dark:hover:bg-zinc-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isAdding}
                  className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold 
                    rounded-2xl transition-colors shadow-lg shadow-blue-500/20 flex items-center justify-center"
                >
                  {isAdding ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create User"}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </motion.div>
  );
}
