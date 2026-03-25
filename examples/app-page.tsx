/**
 * PATTERN: Protected Next.js page
 *
 * Extracted from app/goals/page.tsx — the canonical template for all LifeLup pages.
 * Copy this structure for any new protected page. Replace TODO comments with real content.
 *
 * Key rules:
 * - "use client" is required — all LifeLup pages use Convex hooks
 * - Always check isAuthenticated before rendering any content
 * - Navigation header must be IDENTICAL across all pages (copy verbatim)
 * - Active nav item: change from text-gray-500 to text-blue-600 for the current page
 * - Import Convex API from @/convex/_generated/api — never from convex/ directly
 */

"use client";

import { useConvexAuth, useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { api } from "@/convex/_generated/api";
// TODO: import Doc type if you need typed data: import { Doc } from "@/convex/_generated/dataModel";
import Link from "next/link";
import { SignOutButton } from "@/components/SignOutButton";

// TODO: Replace with your page component
export default function ExamplePage() {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const router = useRouter();

  // TODO: Replace api.goals.list with your module's query
  const data = useQuery(api.goals.list);

  // Auth guard — redirect unauthenticated users to /signin
  // useEffect because router.push() cannot run during SSR
  useEffect(() => {
    if (!isLoading && !isAuthenticated) router.push("/signin");
  }, [isLoading, isAuthenticated, router]);

  // Show spinner while auth state resolves
  // IMPORTANT: Return null (not content) when not authenticated — prevents flash of content
  if (isLoading || !isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <main className="flex min-h-screen flex-col">
      {/*
       * Navigation header — copy this VERBATIM across all pages.
       * Only change: the active page link uses `text-blue-600 font-medium` instead of
       * `text-gray-500 hover:text-gray-900` — and is a <span> not a <Link>.
       */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">LifeLup</h1>
          <nav className="flex gap-2 text-sm">
            <Link href="/" className="text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors">
              My todos
            </Link>
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
            {/* TODO: Change this to the active page — use span + text-blue-600, not a Link */}
            <span className="text-blue-600 dark:text-blue-400 font-medium">TODO: Page Name</span>
            {/* If adding to the nav (new page), add a separator and link here, and update all other pages */}
          </nav>
        </div>
        <SignOutButton />
      </header>

      {/* Page content */}
      <div className="flex flex-1 flex-col max-w-2xl w-full mx-auto p-8 pt-10 gap-8">

        {/* Page heading */}
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            {/* TODO: Page title */}
          </h2>
          <p className="text-sm text-gray-400 dark:text-gray-500 mt-0.5">
            {/* TODO: Subtitle / description */}
          </p>
        </div>

        {/* Loading state — shown while useQuery is fetching (undefined = loading) */}
        {data === undefined && (
          <div className="flex justify-center py-12">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
          </div>
        )}

        {/* Empty state — shown when authenticated and data loaded but empty */}
        {data !== undefined && data.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
            {/* TODO: Empty state icon and message */}
            <p className="text-gray-900 dark:text-white font-medium">Nothing here yet</p>
            <p className="text-gray-500 dark:text-gray-400 text-sm max-w-xs">
              {/* TODO: Explain how to populate this page */}
            </p>
          </div>
        )}

        {/* Data display */}
        {data !== undefined && data.length > 0 && (
          <div className="space-y-3">
            {data.map((item) => (
              <div
                key={item._id}
                className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-5"
              >
                {/* TODO: Render item fields */}
              </div>
            ))}
          </div>
        )}

      </div>
    </main>
  );
}
