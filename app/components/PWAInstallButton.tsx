"use client";

import { useEffect, useMemo, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
};

function isStandaloneMode() {
  if (typeof window === "undefined") return false;

  const standaloneMedia = window.matchMedia("(display-mode: standalone)").matches;
  const iosStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone === true;

  return standaloneMedia || iosStandalone;
}

function isIosDevice() {
  if (typeof window === "undefined") return false;

  const ua = window.navigator.userAgent.toLowerCase();
  const iPadOS = /macintosh/.test(ua) && "ontouchend" in document;

  return /iphone|ipad|ipod/.test(ua) || iPadOS;
}

export default function PWAInstallButton() {
  const [mounted, setMounted] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosHelp, setShowIosHelp] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const ios = useMemo(() => mounted && isIosDevice(), [mounted]);

  useEffect(() => {
    setMounted(true);
    setInstalled(isStandaloneMode());

    const dismissedValue = localStorage.getItem("jsms_install_button_dismissed");
    setDismissed(dismissedValue === "yes");

    async function registerServiceWorker() {
      if (!("serviceWorker" in navigator)) return;

      try {
        await navigator.serviceWorker.register("/sw.js");
      } catch (error) {
        console.warn("JSMS service worker registration failed:", error);
      }
    }

    void registerServiceWorker();

    const beforeInstallPromptHandler = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
      setDismissed(false);
      localStorage.removeItem("jsms_install_button_dismissed");
    };

    const appInstalledHandler = () => {
      setInstalled(true);
      setDeferredPrompt(null);
      setShowIosHelp(false);
    };

    window.addEventListener("beforeinstallprompt", beforeInstallPromptHandler);
    window.addEventListener("appinstalled", appInstalledHandler);

    return () => {
      window.removeEventListener("beforeinstallprompt", beforeInstallPromptHandler);
      window.removeEventListener("appinstalled", appInstalledHandler);
    };
  }, []);

  async function installApp() {
    if (installed) return;

    if (ios) {
      setShowIosHelp(true);
      return;
    }

    if (!deferredPrompt) {
      setShowIosHelp(true);
      return;
    }

    await deferredPrompt.prompt();

    const choice = await deferredPrompt.userChoice;

    if (choice.outcome === "accepted") {
      setInstalled(true);
      setDeferredPrompt(null);
    }
  }

  function closeButton() {
    setDismissed(true);
    localStorage.setItem("jsms_install_button_dismissed", "yes");
  }

  if (!mounted || installed || dismissed) return null;

  return (
    <>
      <div className="fixed bottom-4 left-3 right-3 z-[9998] mx-auto max-w-md rounded-[1.5rem] border border-emerald-200 bg-white/95 p-3 shadow-2xl backdrop-blur print:hidden">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-yellow-200 bg-white">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/jsms-logo.png"
              alt="JSMS"
              className="h-full w-full object-contain"
              onError={(event) => {
                event.currentTarget.style.display = "none";
              }}
            />
          </div>

          <div className="min-w-0 flex-1">
            <p className="text-sm font-black text-slate-950">Install JSMS</p>
            <p className="truncate text-xs font-bold text-slate-500">
              Add it to your phone or laptop like an app.
            </p>
          </div>

          <button
            type="button"
            onClick={installApp}
            className="shrink-0 rounded-2xl bg-emerald-700 px-4 py-2 text-xs font-black text-white active:scale-[0.98]"
          >
            Install
          </button>

          <button
            type="button"
            onClick={closeButton}
            className="shrink-0 rounded-full bg-slate-100 px-2 py-1 text-xs font-black text-slate-600"
            aria-label="Hide install button"
          >
            ×
          </button>
        </div>
      </div>

      {showIosHelp ? (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/70 px-4 print:hidden">
          <section className="w-full max-w-sm rounded-[2rem] bg-white p-5 shadow-2xl">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-yellow-100 text-2xl">
              📱
            </div>

            <h2 className="text-center text-xl font-black text-slate-950">
              Install JSMS
            </h2>

            <div className="mt-4 space-y-3 text-sm font-bold text-slate-600">
              {ios ? (
                <>
                  <p>On iPhone/iPad:</p>
                  <p>1. Open this site in Safari.</p>
                  <p>2. Tap the Share button.</p>
                  <p>3. Tap “Add to Home Screen”.</p>
                  <p>4. Tap “Add”.</p>
                </>
              ) : (
                <>
                  <p>Use your browser menu and choose:</p>
                  <p>“Install App” or “Add to Home Screen”.</p>
                  <p>If you do not see it, refresh the page and try again.</p>
                </>
              )}
            </div>

            <button
              type="button"
              onClick={() => setShowIosHelp(false)}
              className="mt-5 h-11 w-full rounded-2xl bg-slate-950 text-sm font-black text-white"
            >
              Got it
            </button>
          </section>
        </div>
      ) : null}
    </>
  );
}
