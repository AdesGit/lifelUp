"use client";

import { useConvexAuth, useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { api } from "@/convex/_generated/api";
import { Doc } from "@/convex/_generated/dataModel";
import Link from "next/link";
import { SignOutButton } from "@/components/SignOutButton";

type Goal = Doc<"goals">;

const CATEGORY_LABELS: Record<Goal["category"], string> = {
  health:   "Health",
  career:   "Career",
  learning: "Learning",
  family:   "Family",
  finance:  "Finance",
  personal: "Personal",
};

const CATEGORY_COLORS: Record<Goal["category"], string> = {
  health:   "text-green-700  bg-green-50  dark:text-green-400 dark:bg-green-950",
  career:   "text-blue-700   bg-blue-50   dark:text-blue-400  dark:bg-blue-950",
  learning: "text-purple-700 bg-purple-50 dark:text-purple-400 dark:bg-purple-950",
  family:   "text-orange-700 bg-orange-50 dark:text-orange-400 dark:bg-orange-950",
  finance:  "text-yellow-700 bg-yellow-50 dark:text-yellow-400 dark:bg-yellow-950",
  personal: "text-pink-700   bg-pink-50   dark:text-pink-400  dark:bg-pink-950",
};

const CATEGORY_ORDER: Goal["category"][] = [
  "career", "health", "learning", "family", "finance", "personal",
];

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days = Math.floor(diff / 86_400_000);
  if (mins < 2) return "just now";
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

function GoalCard({ goal }: { goal: Goal }) {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <h4 className="font-medium text-gray-900 dark:text-white leading-snug">{goal.title}</h4>
        <span className={`flex-shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${
          goal.horizon === "long" ? "text-gray-600 bg-gray-100 dark:text-gray-400 dark:bg-gray-800" : "text-indigo-600 bg-indigo-50 dark:text-indigo-400 dark:bg-indigo-950"
        }`}>
          {goal.horizon === "long" ? "Long-term" : "Mid-term"}
        </span>
      </div>

      {/* Progress bar */}
      <div>
        <div className="h-1.5 w-full rounded-full bg-gray-100 dark:bg-gray-800">
          <div
            className="h-1.5 rounded-full bg-blue-500 transition-all"
            style={{ width: `${Math.min(100, Math.max(0, goal.progress))}%` }}
          />
        </div>
        <p className="text-xs text-gray-400 mt-1">{goal.progress}% progress</p>
      </div>

      {/* Evidence */}
      {goal.evidence.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400">From your conversations</p>
          {goal.evidence.map((e, i) => (
            <p key={i} className="text-xs text-gray-500 dark:text-gray-400 italic border-l-2 border-gray-200 dark:border-gray-700 pl-2.5">
              &ldquo;{e}&rdquo;
            </p>
          ))}
        </div>
      )}

      {/* Next actions */}
      {goal.nextActions.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Suggested next steps</p>
          <ul className="space-y-1">
            {goal.nextActions.map((action, i) => (
              <li key={i} className="flex items-start gap-1.5 text-xs text-gray-600 dark:text-gray-300">
                <span className="text-blue-400 mt-px flex-shrink-0">→</span>
                {action}
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-xs text-gray-300 dark:text-gray-600">
        Updated {relativeTime(goal.extractedAt)}
      </p>
    </div>
  );
}

export default function GoalsPage() {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const router = useRouter();
  const goals = useQuery(api.goals.list);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) router.push("/signin");
  }, [isLoading, isAuthenticated, router]);

  if (isLoading || !isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  const activeGoals = goals?.filter((g) => g.status === "active") ?? [];

  return (
    <main className="flex min-h-screen flex-col">
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
            <span className="text-blue-600 dark:text-blue-400 font-medium">Goals</span>
          </nav>
        </div>
        <SignOutButton />
      </header>

      <div className="flex flex-1 flex-col max-w-2xl w-full mx-auto p-8 pt-10 gap-8">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Your goals</h2>
          <p className="text-sm text-gray-400 dark:text-gray-500 mt-0.5">
            Detected from your coaching conversations · updated daily
          </p>
        </div>

        {goals === undefined && (
          <div className="flex justify-center py-12">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
          </div>
        )}

        {goals !== undefined && activeGoals.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
            <div className="text-5xl">🎯</div>
            <p className="text-gray-900 dark:text-white font-medium">No goals detected yet</p>
            <p className="text-gray-500 dark:text-gray-400 text-sm max-w-xs">
              Chat with your coach about what you want to achieve — goals will appear here automatically.
            </p>
            <Link
              href="/coach"
              className="mt-2 text-sm text-blue-600 dark:text-blue-400 hover:underline"
            >
              Start a conversation →
            </Link>
          </div>
        )}

        {CATEGORY_ORDER.map((category) => {
          const categoryGoals = activeGoals.filter((g) => g.category === category);
          if (categoryGoals.length === 0) return null;
          return (
            <section key={category} className="space-y-3">
              <div className="flex items-center gap-2">
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${CATEGORY_COLORS[category]}`}>
                  {CATEGORY_LABELS[category]}
                </span>
                <span className="text-xs text-gray-400">{categoryGoals.length} goal{categoryGoals.length !== 1 ? "s" : ""}</span>
              </div>
              {categoryGoals.map((goal) => (
                <GoalCard key={goal._id} goal={goal} />
              ))}
            </section>
          );
        })}
      </div>
    </main>
  );
}
