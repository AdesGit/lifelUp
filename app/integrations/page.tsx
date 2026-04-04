"use client";

import { useConvexAuth, useQuery, useMutation } from "convex/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, Suspense } from "react";
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

function buildGoogleOAuthUrl(userId: string): string {
  const params = new URLSearchParams({
    client_id: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID!,
    redirect_uri: process.env.NEXT_PUBLIC_GOOGLE_REDIRECT_URI!,
    scope: "https://www.googleapis.com/auth/calendar",
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    state: btoa(userId),
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
          <Link href="/agents" className="text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors whitespace-nowrap">
            Agents
          </Link>
          <span className="text-gray-300 dark:text-gray-600 flex-shrink-0">·</span>
          <span className="text-blue-600 dark:text-blue-400 font-medium whitespace-nowrap">Intégrations</span>
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
              <div className="flex gap-2">
                <button
                  className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                  onClick={() => alert("Lancez le script manuellement : pm2 restart lifelup-calendar-sync")}
                >
                  Synchroniser maintenant
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
                window.location.href = buildGoogleOAuthUrl(userId);
              }}
            >
              Connecter Google Agenda
            </button>
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
