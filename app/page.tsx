"use client";

import { useConvexAuth, useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { api } from "@/convex/_generated/api";
import { SignOutButton } from "@/components/SignOutButton";
import { TodoList } from "@/components/TodoList";
import Link from "next/link";

export default function HomePage() {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const router = useRouter();
  const me = useQuery(api.users.getMe);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push("/signin");
    }
  }, [isLoading, isAuthenticated, router]);

  if (isLoading || !isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <main className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">LifeLup</h1>
          <nav className="flex gap-2 text-sm">
            <span className="text-blue-600 dark:text-blue-400 font-medium">My todos</span>
            <span className="text-gray-300 dark:text-gray-600">·</span>
            <Link href="/family" className="text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors">
              Family
            </Link>
            <span className="text-gray-300 dark:text-gray-600">·</span>
            <Link href="/coach" className="text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors">
              Coach
            </Link>
            <span className="text-gray-300 dark:text-gray-600">·</span>
            <Link href="/goals" className="text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors">
              Goals
            </Link>
            <span className="text-gray-300 dark:text-gray-600">·</span>
            <Link href="/context" className="text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors">
              Context
            </Link>
            <span className="text-gray-300 dark:text-gray-600">·</span>
            <Link href="/todos/recurring" className="text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors">
              Recurring
            </Link>
            <span className="text-gray-300 dark:text-gray-600">·</span>
            <Link href="/quests" className="text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors">
              Quests
            </Link>
          </nav>
        </div>
        <div className="flex items-center gap-3">
          {me?.totalStars != null && (
            <span className="text-sm font-medium text-yellow-500">⭐{me.totalStars}</span>
          )}
          <SignOutButton />
        </div>
      </header>

      <div className="flex flex-1 flex-col items-center gap-6 p-8 pt-10">
        {me && (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            👋 {me.email}
          </p>
        )}
        <TodoList />
      </div>
    </main>
  );
}
