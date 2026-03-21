"use client";

import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { ConvexReactClient } from "convex/react";
import { Component, ReactNode } from "react";

const convex = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

const AUTH_KEYS = [
  "__convexAuthJWT",
  "__convexAuthRefreshToken",
  "__convexAuthOAuthVerifier",
  "__convexAuthServerStateFetchTime",
];

function clearAuthStorage() {
  AUTH_KEYS.forEach((k) => localStorage.removeItem(k));
}

class AuthErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch() {
    clearAuthStorage();
    window.location.replace("/signin");
  }

  render() {
    if (this.state.hasError) return null;
    return this.props.children;
  }
}

export function ConvexClientProvider({ children }: { children: ReactNode }) {
  return (
    <AuthErrorBoundary>
      <ConvexAuthProvider client={convex}>{children}</ConvexAuthProvider>
    </AuthErrorBoundary>
  );
}
