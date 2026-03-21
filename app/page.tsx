"use client";

import { useConvexAuth, useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { api } from "@/convex/_generated/api";
import { SignOutButton } from "@/components/SignOutButton";

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
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">
          LifeLup
        </h1>
        <SignOutButton />
      </header>

      <div className="flex flex-1 flex-col items-center justify-center gap-6 p-8">
        <div className="rounded-2xl bg-white dark:bg-gray-900 shadow-sm border border-gray-200 dark:border-gray-800 p-8 text-center max-w-md w-full">
          <div className="text-5xl mb-4">🎮</div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            Welcome to LifeLup
          </h2>
          {me && (
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              Signed in as <span className="font-medium">{me.email}</span>
            </p>
          )}
          <p className="text-gray-500 dark:text-gray-500 text-sm">
            Your gamified family task manager. More features coming soon.
          </p>
        </div>
      </div>
    </main>
  );
}
