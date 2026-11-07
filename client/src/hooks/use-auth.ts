import { useState, useEffect, useCallback } from "react";
import type { AuthUser } from "@shared/types";
import { setSchoolStage } from "@/lib/deployment";

export type { AuthUser };

interface AuthState {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  loadError: boolean;
  retry: () => void;
  login: () => void;
  logout: () => void;
}

export function useAuth(): AuthState {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setLoadError(false);
    const loadUser = async () => {
      const retryDelays = [500, 1500];
      let lastError: unknown;

      for (let attempt = 0; attempt <= retryDelays.length; attempt++) {
        if (cancelled) return;
        try {
          const res = await fetch("/api/auth/user", { credentials: "include", cache: "no-store" });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = await res.json() as { user: AuthUser | null };
          if (!cancelled) {
            if (data.user?.schoolStage) setSchoolStage(data.user.schoolStage);
            setUser(data.user ?? null);
            setIsLoading(false);
          }
          return;
        } catch (error) {
          lastError = error;
          if (attempt === retryDelays.length) break;
          await new Promise((resolve) => setTimeout(resolve, retryDelays[attempt]));
        }
      }

      console.error("Unable to check the current sign-in session:", lastError);
      if (!cancelled) {
        setUser(null);
        setLoadError(true);
        setIsLoading(false);
      }
    };

    void loadUser();
    return () => { cancelled = true; };
  }, [retryCount]);

  const retry = useCallback(() => {
    setRetryCount((count) => count + 1);
  }, []);

  const login = useCallback(() => {
    window.location.href = `/api/login?returnTo=${encodeURIComponent(window.location.pathname)}`;
  }, []);

  const logout = useCallback(() => {
    window.location.href = "/api/logout";
  }, []);

  return { user, isLoading, isAuthenticated: !!user, loadError, retry, login, logout };
}
