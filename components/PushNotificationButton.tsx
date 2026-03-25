"use client";

import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useState } from "react";

// VAPID public key — must match the private key used in notification-sender.mjs
const VAPID_PUBLIC_KEY = "BAzih9TuwwfIjpGjXqht2TrJY7GcY4847p52i_d_oHbmB2nQqbpPJgGNBfu0EJtYpJKC62FHbj9tUtIi7ZRTtkw";

function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const buffer = new ArrayBuffer(rawData.length);
  const view = new Uint8Array(buffer);
  for (let i = 0; i < rawData.length; i++) view[i] = rawData.charCodeAt(i);
  return buffer;
}

export function PushNotificationButton() {
  const saveSubscription = useMutation(api.todos.savePushSubscription);
  const [status, setStatus] = useState<"idle" | "subscribed" | "denied" | "unsupported">(() => {
    // Run only on client — SSR returns "idle", real state detected on first render
    if (typeof window === "undefined") return "idle";
    if (!("Notification" in window) || !("serviceWorker" in navigator)) return "unsupported";
    if (Notification.permission === "granted") return "subscribed";
    if (Notification.permission === "denied") return "denied";
    return "idle";
  });

  async function handleEnable() {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;

    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      setStatus("denied");
      return;
    }

    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });

    const json = sub.toJSON();
    await saveSubscription({
      endpoint: sub.endpoint,
      p256dh: json.keys?.p256dh ?? "",
      auth: json.keys?.auth ?? "",
    });

    setStatus("subscribed");
  }

  if (status === "unsupported" || status === "subscribed") return null;

  return (
    <button
      onClick={handleEnable}
      title={status === "denied" ? "Notifications blocked — enable in browser settings" : "Enable push notifications"}
      className={`text-xs px-2 py-1 rounded-md transition-colors ${
        status === "denied"
          ? "text-gray-300 dark:text-gray-600 cursor-not-allowed"
          : "text-gray-400 hover:text-blue-500 dark:hover:text-blue-400"
      }`}
    >
      🔔
    </button>
  );
}
