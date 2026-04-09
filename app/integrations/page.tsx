"use client";

import { useConvexAuth, useQuery, useMutation } from "convex/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, Suspense } from "react";
import { api } from "@/convex/_generated/api";
import Link from "next/link";
import { SignOutButton } from "@/components/SignOutButton";
import { PushNotificationButton } from "@/components/PushNotificationButton";

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days = Math.floor(diff / 86_400_000);
  if (mins < 2) return "à l'instant";
  if (mins < 60) return `il y a ${mins} min`;
  if (hours < 24) return `il y a ${hours} h`;
  return `il y a ${days} j`;
}

function buildGoogleOAuthUrl(userId: string, email: string): string {
  // Encode both userId and LifeLup email in state — avoids needing userinfo scope
  const state = btoa(JSON.stringify({ userId, email }));
  const params = new URLSearchParams({
    client_id: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID!,
    redirect_uri: process.env.NEXT_PUBLIC_GOOGLE_REDIRECT_URI!,
    scope: "https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/tasks",
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

function IntegrationsContent() {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = useQuery(api.googleCalendar.getMyToken);
  const meQuery = useQuery(api.users.getMe);
  const disconnect = useMutation(api.googleCalendar.disconnect);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);

  const connected = searchParams.get("connected") === "true";
  const oauthError = searchParams.get("error");

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

  const userId = meQuery?._id;
  const userEmail = meQuery?.email ?? "";

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
          <Link href="/quests" className="text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors whitespace-nowrap">
            Quests
          </Link>
          <span className="text-gray-300 dark:text-gray-600 flex-shrink-0">·</span>
          <Link href="/calendar" className="text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors whitespace-nowrap">
            Calendrier
          </Link>
          <span className="text-gray-300 dark:text-gray-600 flex-shrink-0">·</span>
          <Link href="/todos-board" className="text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors whitespace-nowrap">
            Todos Board
          </Link>
          <span className="text-gray-300 dark:text-gray-600 flex-shrink-0">·</span>
          <Link href="/dashboard" className="text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors whitespace-nowrap">
            Dashboard
          </Link>
          <span className="text-gray-300 dark:text-gray-600 flex-shrink-0">·</span>
          <Link href="/screen-time" className="text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors whitespace-nowrap">
            Screen Time
          </Link>
          <span className="text-gray-300 dark:text-gray-600 flex-shrink-0">·</span>
          <Link href="/ballejaune" className="text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors whitespace-nowrap">
            Padel
          </Link>
          <span className="text-gray-300 dark:text-gray-600 flex-shrink-0">·</span>
          <Link href="/agents" className="text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors whitespace-nowrap">
            Agents
          </Link>
          <span className="text-gray-300 dark:text-gray-600 flex-shrink-0">·</span>
          <span className="text-blue-600 dark:text-blue-400 font-medium whitespace-nowrap">Intégrations</span>
          <span className="text-gray-300 dark:text-gray-600 flex-shrink-0">·</span>
          <Link href="/profile" className="text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors whitespace-nowrap">
            Profile
          </Link>
        </nav>
        <div className="flex items-center gap-2 flex-shrink-0">
          <PushNotificationButton />
          <SignOutButton />
        </div>
      </header>

      <div className="flex flex-1 flex-col max-w-2xl w-full mx-auto p-4 sm:p-8 pt-6 sm:pt-10 gap-6 sm:gap-8">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Intégrations</h2>
          <p className="text-sm text-gray-400 dark:text-gray-500 mt-0.5">
            Connectez vos services externes à LifeLup.
          </p>
        </div>

        {connected && (
          <div className="rounded-xl bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 px-4 py-3 text-sm text-green-700 dark:text-green-300">
            Google Agenda connecté avec succès.
          </div>
        )}
        {oauthError && (
          <div className="rounded-xl bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 px-4 py-3 text-sm text-red-700 dark:text-red-300">
            {oauthError === "oauth_denied"
              ? "Connexion refusée. Veuillez réessayer."
              : oauthError === "save_failed"
              ? "Connexion Google OK mais la sauvegarde a échoué. Veuillez réessayer."
              : "Erreur lors de la connexion. Veuillez réessayer."}
          </div>
        )}

        {/* Integration cards */}
        {/* Google Calendar card */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-5 space-y-4">
          <div className="flex items-center gap-3">
            {/* Google Calendar icon */}
            <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950 flex items-center justify-center flex-shrink-0">
              <svg viewBox="0 0 24 24" className="w-6 h-6 text-blue-500" fill="currentColor">
                <path d="M19 3h-1V1h-2v2H8V1H6v2H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11zM7 10h5v5H7z"/>
              </svg>
            </div>
            <div>
              <h3 className="font-medium text-gray-900 dark:text-white">Google Agenda</h3>
              <p className="text-xs text-gray-400 dark:text-gray-500">
                Synchronisez vos todos avec échéance dans Google Calendar.
              </p>
            </div>
          </div>

          {token ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
                  Connecté
                </span>
                <span className="text-xs text-gray-500 dark:text-gray-400">{token.googleEmail}</span>
              </div>
              <p className="text-xs text-gray-400 dark:text-gray-500">
                Dernière sync:{" "}
                {token.lastSyncAt ? relativeTime(token.lastSyncAt) : "Jamais"}
              </p>
              {syncResult && (
                <p className="text-xs text-gray-500 dark:text-gray-400">{syncResult}</p>
              )}
              <div className="flex gap-2">
                <button
                  disabled={syncing}
                  className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
                  onClick={async () => {
                    setSyncing(true);
                    setSyncResult(null);
                    try {
                      const res = await fetch("/api/gcal/sync", { method: "POST" });
                      const data = await res.json();
                      setSyncResult(data.ok ? "Synchronisation terminée." : `Erreur : ${data.error}`);
                    } catch {
                      setSyncResult("Erreur réseau.");
                    } finally {
                      setSyncing(false);
                    }
                  }}
                >
                  {syncing ? "Synchronisation..." : "Synchroniser maintenant"}
                </button>
                <button
                  className="text-xs px-3 py-1.5 rounded-lg border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950 transition-colors"
                  onClick={async () => {
                    if (confirm("Déconnecter Google Agenda ? Les todos importés depuis Google seront supprimés.")) {
                      await disconnect();
                      router.replace("/integrations");
                    }
                  }}
                >
                  Déconnecter
                </button>
              </div>
            </div>
          ) : (
            <button
              disabled={!userId}
              className="w-full py-2 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors disabled:opacity-50"
              onClick={() => {
                if (!userId) return;
                window.location.href = buildGoogleOAuthUrl(userId, userEmail);
              }}
            >
              Connecter Google Agenda
            </button>
          )}
        </div>

        {/* Google Tasks card */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-5 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950 flex items-center justify-center flex-shrink-0">
              {/* Checkmark/Tasks icon */}
              <svg viewBox="0 0 24 24" className="w-6 h-6 text-blue-500" fill="currentColor">
                <path d="M22 5.18L10.59 16.6l-4.24-4.24 1.41-1.41 2.83 2.83 10-10L22 5.18zm-2.21 5.04c.13.57.21 1.17.21 1.78 0 4.42-3.58 8-8 8s-8-3.58-8-8 3.58-8 8-8c1.58 0 3.04.46 4.28 1.25l1.44-1.44A9.9 9.9 0 0 0 12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10c0-1.19-.22-2.33-.6-3.39l-1.61 1.61z"/>
              </svg>
            </div>
            <div>
              <h3 className="font-medium text-gray-900 dark:text-white">Google Tasks</h3>
              <p className="text-xs text-gray-400 dark:text-gray-500">
                Synchronisez vos todos avec Google Tasks (bidirectionnel).
              </p>
            </div>
          </div>

          {!token ? (
            <p className="text-xs text-gray-400 dark:text-gray-500">
              Connectez d&apos;abord Google Agenda pour activer Google Tasks.
            </p>
          ) : !token.tasksScope ? (
            <div className="space-y-3">
              <div className="rounded-lg bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 px-3 py-2 text-xs text-yellow-700 dark:text-yellow-300">
                Reconnectez votre compte Google pour activer la synchronisation Google Tasks.
              </div>
              <button
                disabled={!userId}
                className="text-xs px-3 py-1.5 rounded-lg border border-blue-200 dark:border-blue-700 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950 transition-colors disabled:opacity-50"
                onClick={() => {
                  if (!userId) return;
                  window.location.href = buildGoogleOAuthUrl(userId, userEmail);
                }}
              >
                Reconnecter Google
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
                  Connecté
                </span>
                <span className="text-xs text-gray-500 dark:text-gray-400">{token.googleEmail}</span>
              </div>
              <p className="text-xs text-gray-400 dark:text-gray-500">
                Dernière sync Tasks:{" "}
                {token.lastTasksSyncAt ? relativeTime(token.lastTasksSyncAt) : "Jamais"}
              </p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

export default function IntegrationsPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
      </div>
    }>
      <IntegrationsContent />
    </Suspense>
  );
}
