"use client";

import { useConvexAuth, useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { api } from "@/convex/_generated/api";
import Link from "next/link";
import { SignOutButton } from "@/components/SignOutButton";
import { PushNotificationButton } from "@/components/PushNotificationButton";

const AGENT_META: Record<string, { schedule: string; description: string; type: "vps" | "cloud" }> = {
  "coach":           { schedule: "Toutes les 5 min (VPS)", description: "Répond aux sessions de coaching en attente", type: "vps" },
  "coach-remote":    { schedule: "Toutes les heures (cloud)", description: "Répond aux sessions de coaching (agent cloud CCR)", type: "cloud" },
  "star-evaluator":  { schedule: "Toutes les 5 min (VPS)", description: "Attribue des étoiles aux tâches non évaluées", type: "vps" },
  "image-agent":     { schedule: "Quotidien à 02:00 UTC (VPS)", description: "Compresse et décrit les images uploadées", type: "vps" },
  "goals-daily":     { schedule: "Quotidien à 00:00 UTC (cloud)", description: "Extrait les objectifs depuis l'historique coach", type: "cloud" },
  "context-weekly":  { schedule: "Dimanche à 02:00 UTC (cloud)", description: "Extrait les entrées de contexte famille", type: "cloud" },
};

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 1) return "À l'instant";
  if (mins < 60) return `Il y a ${mins}m`;
  if (hours < 24) return `Il y a ${hours}h`;
  return `Il y a ${days}j`;
}

function fmtDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m${Math.floor((ms % 60000) / 1000)}s`;
}

function fmtTokens(promptChars: number, outputChars: number): string {
  const est = Math.round((promptChars + outputChars) / 4);
  if (est < 1000) return `~${est}`;
  return `~${(est / 1000).toFixed(1)}k`;
}

function StatusDot({ status }: { status: string }) {
  const color = status === "ok" ? "bg-green-400" : status === "error" ? "bg-red-400" : "bg-gray-300 dark:bg-gray-600";
  return <span className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${color}`} />;
}

export default function AgentsPage() {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const router = useRouter();
  const runs = useQuery(api.agentRuns.listRecent);

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

  // Build per-agent summary from runs
  const agentSummary = new Map<string, {
    lastRun: number; lastStatus: string; runsToday: number;
    tokensToday: number; itemsToday: number;
  }>();

  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const todayTs = todayStart.getTime();

  for (const run of runs ?? []) {
    const s = agentSummary.get(run.agentName);
    const isToday = run.runAt >= todayTs;
    const tokenEst = Math.round((run.promptChars + run.outputChars) / 4);
    if (!s) {
      agentSummary.set(run.agentName, {
        lastRun: run.runAt, lastStatus: run.status,
        runsToday: isToday ? 1 : 0,
        tokensToday: isToday ? tokenEst : 0,
        itemsToday: isToday ? run.itemsProcessed : 0,
      });
    } else {
      if (isToday) {
        s.runsToday += 1;
        s.tokensToday += tokenEst;
        s.itemsToday += run.itemsProcessed;
      }
    }
  }

  const recentRuns = (runs ?? []).filter(r => r.status !== "idle").slice(0, 50);

  return (
    <main className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
        <div className="flex items-center gap-2 flex-shrink-0">
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">LifeLup</h1>
        </div>
        <nav className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm overflow-x-auto mx-2 min-w-0">
          <Link href="/" className="text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors whitespace-nowrap">My todos</Link>
          <span className="text-gray-300 dark:text-gray-600 flex-shrink-0">·</span>
          <Link href="/family" className="text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors whitespace-nowrap">Family</Link>
          <span className="text-gray-300 dark:text-gray-600 flex-shrink-0">·</span>
          <Link href="/coach" className="text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors whitespace-nowrap">Coach</Link>
          <span className="text-gray-300 dark:text-gray-600 flex-shrink-0">·</span>
          <Link href="/goals" className="text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors whitespace-nowrap">Goals</Link>
          <span className="text-gray-300 dark:text-gray-600 flex-shrink-0">·</span>
          <Link href="/context" className="text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors whitespace-nowrap">Context</Link>
          <span className="text-gray-300 dark:text-gray-600 flex-shrink-0">·</span>
          <Link href="/todos/recurring" className="text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors whitespace-nowrap">Recurring</Link>
          <span className="text-gray-300 dark:text-gray-600 flex-shrink-0">·</span>
          <Link href="/fichiers" className="text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors whitespace-nowrap">Fichiers</Link>
          <span className="text-gray-300 dark:text-gray-600 flex-shrink-0">·</span>
          <Link href="/quests" className="text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors whitespace-nowrap">Quests</Link>
          <span className="text-gray-300 dark:text-gray-600 flex-shrink-0">·</span>
          <span className="text-blue-600 dark:text-blue-400 font-medium whitespace-nowrap">Agents</span>
        </nav>
        <div className="flex items-center gap-2 flex-shrink-0">
          <PushNotificationButton />
          <SignOutButton />
        </div>
      </header>

      <div className="flex flex-1 flex-col max-w-3xl w-full mx-auto p-4 sm:p-8 pt-6 sm:pt-10 gap-6">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Agent Dashboard</h2>
          <p className="text-sm text-gray-400 dark:text-gray-500 mt-0.5">Statut et usage des agents IA · tokens estimés (chars / 4)</p>
        </div>

        {/* Agent summary cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {Object.entries(AGENT_META).map(([name, meta]) => {
            const s = agentSummary.get(name);
            return (
              <div key={name} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      {s && <StatusDot status={s.lastStatus} />}
                      {!s && <span className="inline-block w-2 h-2 rounded-full bg-gray-200 dark:bg-gray-700 flex-shrink-0" />}
                      <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{name}</p>
                      <span className={`text-xs px-1.5 py-0.5 rounded font-medium flex-shrink-0 ${meta.type === "cloud" ? "bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400" : "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400"}`}>
                        {meta.type === "cloud" ? "cloud" : "vps"}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">{meta.schedule}</p>
                  </div>
                  {s && (
                    <div className="text-right flex-shrink-0">
                      <p className="text-xs text-gray-500">{timeAgo(s.lastRun)}</p>
                    </div>
                  )}
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">{meta.description}</p>
                {s && (
                  <div className="flex items-center gap-3 pt-1 border-t border-gray-100 dark:border-gray-800">
                    <span className="text-xs text-gray-400">Aujourd&apos;hui :</span>
                    <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{s.runsToday} runs</span>
                    <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{s.itemsToday} items</span>
                    <span className="text-xs font-medium text-purple-600 dark:text-purple-400">~{Math.round(s.tokensToday / 1000)}k tokens</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Recent runs table */}
        <div>
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Derniers runs (hors idle)</h3>

          {runs === undefined && (
            <div className="flex justify-center py-8">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
            </div>
          )}

          {runs !== undefined && recentRuns.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-8">Aucun run enregistré pour l&apos;instant</p>
          )}

          {recentRuns.length > 0 && (
            <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-800">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50 dark:bg-gray-800/50 text-gray-500 dark:text-gray-400">
                    <th className="text-left px-3 py-2 font-medium">Agent</th>
                    <th className="text-left px-3 py-2 font-medium">Heure</th>
                    <th className="text-left px-3 py-2 font-medium">Statut</th>
                    <th className="text-right px-3 py-2 font-medium">Items</th>
                    <th className="text-right px-3 py-2 font-medium">Durée</th>
                    <th className="text-right px-3 py-2 font-medium">Tokens ~</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {recentRuns.map((run) => (
                    <tr key={run._id} className="bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors">
                      <td className="px-3 py-2 font-medium text-gray-800 dark:text-gray-200">{run.agentName}</td>
                      <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{timeAgo(run.runAt)}</td>
                      <td className="px-3 py-2">
                        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium ${
                          run.status === "ok" ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" :
                          run.status === "error" ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" :
                          "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400"
                        }`}>
                          {run.status}
                          {run.errorMessage && <span title={run.errorMessage}>⚠</span>}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right text-gray-600 dark:text-gray-400">{run.itemsProcessed}</td>
                      <td className="px-3 py-2 text-right text-gray-600 dark:text-gray-400">{fmtDuration(run.durationMs)}</td>
                      <td className="px-3 py-2 text-right text-purple-600 dark:text-purple-400">{fmtTokens(run.promptChars, run.outputChars)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
