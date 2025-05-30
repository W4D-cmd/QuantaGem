"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Toast from "@/components/Toast";

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
    <div className="flex min-h-screen items-center justify-center bg-neutral-50 p-4">
      {error && <Toast message={error} onClose={() => setError(null)} />}
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-lg">
        <h2 className="mb-6 text-center text-3xl font-bold text-neutral-900">
          Sign in to QuantaGem
        </h2>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-neutral-700"
            >
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
                className="w-full appearance-none rounded-xl border border-neutral-300 px-3 py-2 placeholder-neutral-400 shadow-sm
                           focus:border-blue-500 focus:outline-none focus:ring-blue-500 disabled:bg-neutral-100 disabled:text-neutral-500"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium text-neutral-700"
            >
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
                className="w-full appearance-none rounded-xl border border-neutral-300 px-3 py-2 placeholder-neutral-400 shadow-sm
                           focus:border-blue-500 focus:outline-none focus:ring-blue-500 disabled:bg-neutral-100 disabled:text-neutral-500"
              />
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={isLoading}
              className="flex w-full justify-center rounded-xl border border-transparent bg-black px-4 py-2 text-sm font-medium text-white shadow-sm
                         hover:bg-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
                         disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-neutral-400"
            >
              {isLoading ? "Signing in..." : "Sign In"}
            </button>
          </div>
        </form>

        <p className="mt-8 text-center text-sm text-neutral-600">
          Or{" "}
          <Link
            href="/signup"
            className="font-medium text-blue-600 hover:text-blue-500"
          >
            create a new account
          </Link>
        </p>
      </div>
    </div>
  );
}
