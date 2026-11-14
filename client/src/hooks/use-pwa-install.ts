/**
 * Shared PWA install hook — module-level singleton so any component
 * can trigger the native browser install prompt from one captured event.
 */
import { useState, useEffect } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

// Module-level deferred event & subscriber list
let _deferred: BeforeInstallPromptEvent | null = null;
const _subs = new Set<() => void>();
const _notify = () => _subs.forEach(fn => fn());

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    _deferred = e as BeforeInstallPromptEvent;
    _notify();
  });
  window.addEventListener("appinstalled", () => {
    _deferred = null;
    _notify();
  });
}

function isStandaloneMode() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as any).standalone === true
  );
}

export function usePwaInstall() {
  const [canInstall, setCanInstall]   = useState(() => !!_deferred && !isStandaloneMode());
  const [justInstalled, setJustInstalled] = useState(false);

  useEffect(() => {
    const update = () => setCanInstall(!!_deferred && !isStandaloneMode());
    _subs.add(update);
    return () => { _subs.delete(update); };
  }, []);

  const install = async () => {
    if (!_deferred) return;
    try {
      await _deferred.prompt();
      const { outcome } = await _deferred.userChoice;
      if (outcome === "accepted") {
        _deferred = null;
        setCanInstall(false);
        setJustInstalled(true);
        setTimeout(() => setJustInstalled(false), 4000);
        _notify();
      }
    } catch {
      // user cancelled or prompt already used
    }
  };

  return { canInstall, install, justInstalled };
}
