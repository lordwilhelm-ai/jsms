"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getPendingByModule } from "@/lib/offline/db";
import { syncPendingActions } from "@/lib/offline/sync";

// One shared hook backing every offline-capable module page: tracks
// online/offline, how many of THIS module's actions are still queued, and
// whether a sync attempt is in flight — and owns the same trigger set the
// kiosk page wires up by hand (mount, `online` event, ~30s poll). Pass
// onAfterSync to re-load the page's own "current data" after every sync
// attempt, synced or not — mirrors how teacher-attendance/kiosk/page.tsx's
// runSync() always calls refreshTodayCache() afterward.
export function useOfflineStatus(module: string, onAfterSync?: () => void | Promise<void>) {
  const [online, setOnline] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const onAfterSyncRef = useRef(onAfterSync);
  onAfterSyncRef.current = onAfterSync;

  const refreshPendingCount = useCallback(async () => {
    const rows = await getPendingByModule(module);
    setPendingCount(rows.length);
  }, [module]);

  const runSync = useCallback(async () => {
    setSyncing(true);

    try {
      await syncPendingActions(module);
      await refreshPendingCount();

      if (onAfterSyncRef.current) {
        await onAfterSyncRef.current();
      }
    } finally {
      setSyncing(false);
    }
  }, [module, refreshPendingCount]);

  useEffect(() => {
    setOnline(navigator.onLine);
    void refreshPendingCount();
    void runSync();

    function goOnline() {
      setOnline(true);
      void runSync();
    }

    function goOffline() {
      setOnline(false);
    }

    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);

    const interval = setInterval(() => void runSync(), 30000);

    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
      clearInterval(interval);
    };
  }, [runSync, refreshPendingCount]);

  return { online, pendingCount, syncing, runSync, refreshPendingCount };
}
