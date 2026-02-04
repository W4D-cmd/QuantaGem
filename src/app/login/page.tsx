"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Toast from "@/components/Toast";
import { motion, AnimatePresence } from "framer-motion";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Login failed");
      }

      const data = await response.json();
      localStorage.setItem("__session", data.token);

      router.push("/");
    } catch (err: unknown) {
      let errorMessage = "An unexpected error occurred.";
      if (err instanceof Error) {
        errorMessage = err.message;
      } else if (typeof err === "string") {
        errorMessage = err;
      }
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-50 dark:bg-zinc-950 p-4">
      <AnimatePresence>{error && <Toast message={error} onClose={() => setError(null)} />}</AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeInOut" }}
        className="w-full max-w-md rounded-2xl bg-white dark:bg-zinc-900 p-8 shadow-lg"
      >
        <h2 className="mb-6 text-center text-3xl font-bold text-neutral-900 dark:text-zinc-100">Sign in to QuantaGem</h2>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-neutral-700 dark:text-zinc-400">
              Email address
            </label>
            <div className="mt-1">
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isLoading}
                className="w-full appearance-none rounded-xl border border-neutral-300 dark:border-zinc-700 px-3 py-2
                  placeholder-neutral-400 dark:placeholder-zinc-500 shadow-sm focus:border-blue-500
                  focus:outline-none focus:ring-blue-500 bg-white dark:bg-zinc-950 text-black dark:text-zinc-100
                  disabled:bg-neutral-100 dark:disabled:bg-zinc-800 disabled:text-neutral-500
                  dark:disabled:text-zinc-500"
              />
            </div>
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-neutral-700 dark:text-zinc-400">
              Password
            </label>
            <div className="mt-1">
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isLoading}
                className="w-full appearance-none rounded-xl border border-neutral-300 dark:border-zinc-700 px-3 py-2
                  placeholder-neutral-400 dark:placeholder-zinc-500 shadow-sm focus:border-blue-500
                  focus:outline-none focus:ring-blue-500 bg-white dark:bg-zinc-950 text-black dark:text-zinc-100
                  disabled:bg-neutral-100 dark:disabled:bg-zinc-800 disabled:text-neutral-500
                  dark:disabled:text-zinc-500"
              />
            </div>
          </div>

          <div>
            <motion.button
              whileTap={{ scale: 0.97 }}
              type="submit"
              disabled={isLoading}
              className="flex w-full justify-center rounded-xl border border-transparent bg-black dark:bg-blue-600 px-4
                py-2 text-sm font-medium text-white shadow-sm hover:bg-neutral-600 dark:hover:bg-blue-700
                focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50
                disabled:cursor-not-allowed disabled:bg-neutral-400 dark:disabled:bg-blue-800"
            >
              {isLoading ? "Signing in..." : "Sign In"}
            </motion.button>
          </div>
        </form>

        <p className="mt-8 text-center text-sm text-neutral-600 dark:text-zinc-500">
          Or{" "}
          <Link href="/signup" className="font-medium text-blue-600 hover:text-blue-500">
            create a new account
          </Link>
        </p>
      </motion.div>
    </div>
  );
}
