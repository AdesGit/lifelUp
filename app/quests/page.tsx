"use client";

import { useConvexAuth, useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { api } from "@/convex/_generated/api";
import Link from "next/link";
import { SignOutButton } from "@/components/SignOutButton";
import { PushNotificationButton } from "@/components/PushNotificationButton";

export default function QuestsPage() {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const router = useRouter();
  const quests = useQuery(api.quests.list);
  const me = useQuery(api.users.getMe);

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

  return (
    <main className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
        <div className="flex items-center gap-2 flex-shrink-0">
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">LifeLup</h1>
        </div>
        <nav className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm overflow-x-auto mx-2 min-w-0">
          <Link href="/" className="text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors whitespace-nowrap">
            My todos
          </Link>
          <span className="text-gray-300 dark:text-gray-600 flex-shrink-0">·</span>
          <Link href="/family" className="text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors whitespace-nowrap">
            Family
          </Link>
          <span className="text-gray-300 dark:text-gray-600 flex-shrink-0">·</span>
          <Link href="/coach" className="text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors whitespace-nowrap">
            Coach
          </Link>
          <span className="text-gray-300 dark:text-gray-600 flex-shrink-0">·</span>
          <Link href="/goals" className="text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors whitespace-nowrap">
            Goals
          </Link>
          <span className="text-gray-300 dark:text-gray-600 flex-shrink-0">·</span>
          <Link href="/context" className="text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors whitespace-nowrap">
            Context
          </Link>
          <span className="text-gray-300 dark:text-gray-600 flex-shrink-0">·</span>
          <Link href="/todos/recurring" className="text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors whitespace-nowrap">
            Recurring
          </Link>
          <span className="text-gray-300 dark:text-gray-600 flex-shrink-0">·</span>
          <Link href="/fichiers" className="text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors whitespace-nowrap">
            Fichiers
          </Link>
          <span className="text-gray-300 dark:text-gray-600 flex-shrink-0">·</span>
          <span className="text-blue-600 dark:text-blue-400 font-medium whitespace-nowrap">Quests</span>
          <span className="text-gray-300 dark:text-gray-600 flex-shrink-0">·</span>
          <Link href="/agents" className="text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors whitespace-nowrap">Agents</Link>
        </nav>
        <div className="flex items-center gap-2 flex-shrink-0">
          {me?.totalStars != null && (
            <span className="text-sm font-medium text-yellow-500">⭐{me.totalStars}</span>
          )}
          <PushNotificationButton />
          <SignOutButton />
        </div>
      </header>

      <div className="flex flex-1 flex-col max-w-2xl w-full mx-auto p-4 sm:p-8 pt-6 sm:pt-10 gap-4 sm:gap-6">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">This week&apos;s quests</h2>
          <p className="text-sm text-gray-400 dark:text-gray-500 mt-0.5">
            Complete quests to earn bonus stars · generated every Monday
          </p>
        </div>

        {quests === undefined && (
          <div className="flex justify-center py-12">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
          </div>
        )}

        {quests !== null && quests?.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
            <div className="text-5xl">🗺️</div>
            <p className="text-gray-900 dark:text-white font-medium">No quests this week yet</p>
            <p className="text-gray-500 dark:text-gray-400 text-sm max-w-xs">
              Quests are generated every Monday based on your recurring tasks. Add some recurring tasks to get started.
            </p>
            <Link
              href="/todos/recurring"
              className="mt-2 text-sm text-blue-600 dark:text-blue-400 hover:underline"
            >
              Manage recurring tasks →
            </Link>
          </div>
        )}

        {quests !== null && (
          <div className="space-y-4">
            {quests?.map((quest) => {
              const totalTasks = quest.tasks.length;
              const doneTasks = quest.tasks.filter((t) => t.completed).length;
              const isCompleted = quest.status === "completed";
              const progressPct = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

              return (
                <div
                  key={quest._id}
                  className={`bg-white dark:bg-gray-900 rounded-2xl border p-3 sm:p-5 space-y-4 ${
                    isCompleted
                      ? "border-green-200 dark:border-green-800"
                      : "border-gray-200 dark:border-gray-800"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        {isCompleted && (
                          <svg className="w-4 h-4 text-green-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                        <h3 className="font-medium text-gray-900 dark:text-white">{quest.title}</h3>
                      </div>
                      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{quest.description}</p>
                    </div>
                    <span className="flex-shrink-0 text-sm font-medium text-yellow-500">⭐{quest.bonusStars}</span>
                  </div>

                  {/* Progress bar */}
                  <div>
                    <div className="h-1.5 w-full rounded-full bg-gray-100 dark:bg-gray-800">
                      <div
                        className={`h-1.5 rounded-full transition-all ${isCompleted ? "bg-green-500" : "bg-blue-500"}`}
                        style={{ width: `${progressPct}%` }}
                      />
                    </div>
                    <p className="text-xs text-gray-400 mt-1">
                      {isCompleted ? (
                        <span className="text-green-600 dark:text-green-400 font-medium">Bonus earned: ⭐{quest.bonusStars}</span>
                      ) : (
                        `${doneTasks}/${totalTasks} tasks done`
                      )}
                    </p>
                  </div>

                  {/* Task list */}
                  {totalTasks > 0 && (
                    <ul className="space-y-1.5">
                      {quest.tasks.map((task) => (
                        <li key={task._id} className="flex items-center gap-2 text-sm">
                          <div className={`flex-shrink-0 w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                            task.completed ? "bg-green-500 border-green-500" : "border-gray-300 dark:border-gray-600"
                          }`}>
                            {task.completed && (
                              <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                          </div>
                          <span className={task.completed ? "line-through text-gray-400" : "text-gray-700 dark:text-gray-300"}>
                            Complete a recurring task
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
