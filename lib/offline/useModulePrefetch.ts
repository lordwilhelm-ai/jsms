"use client";

import { useEffect, useRef, useState } from "react";

export type ModulePrefetchStatus = "idle" | "downloading" | "done";

// Fires every task (each just an existing fetchWithCache call) in parallel
// once a module's entry page is actually ready, so opening e.g. /fees/admin
// downloads every sub-page's data in the background instead of only
// caching each sub-page the first time it's individually visited. Skipped
// entirely when there's no connection — there's nothing new to fetch, and
// every sub-page already falls back to whatever was cached last time.
//
// `ready` gates the actual start: tasks often close over page state (e.g.
// academicYear) that's only correct once the page's own initial load has
// resolved, so firing on first mount would bake in an empty/placeholder
// value. Pass `ready={Boolean(settingsRow)}` (or similar) so this only
// starts once that state exists — the startedRef guard means it still
// only ever runs once, even if `ready` flips true again later.
export function useModulePrefetch(tasks: Array<() => Promise<unknown>>, ready: boolean = true) {
  const [status, setStatus] = useState<ModulePrefetchStatus>("idle");
  const startedRef = useRef(false);

  useEffect(() => {
    if (!ready || startedRef.current) return;
    if (typeof navigator !== "undefined" && navigator.onLine === false) return;

    startedRef.current = true;
    let active = true;
    setStatus("downloading");

    Promise.allSettled(tasks.map((task) => task())).then(() => {
      if (!active) return;
      setStatus("done");
      setTimeout(() => {
        if (active) setStatus("idle");
      }, 4000);
    });

    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  return status;
}

// For modules that are already a single consolidated dashboard fetching
// everything the module needs in one shot (Books, Uniforms, Income &
// Expenditure) — there's no separate sub-page data to additionally
// prefetch, so this just mirrors that page's own `loading` state into the
// same "downloading -> done -> idle" badge instead of firing a second,
// redundant fetch of data the page already loaded itself.
export function useModuleLoadBadge(loading: boolean) {
  const [status, setStatus] = useState<ModulePrefetchStatus>("idle");
  const sawLoadingRef = useRef(false);

  useEffect(() => {
    if (loading) {
      sawLoadingRef.current = true;
      setStatus("downloading");
      return;
    }

    if (!sawLoadingRef.current) return;

    setStatus("done");
    const timer = setTimeout(() => setStatus("idle"), 4000);
    return () => clearTimeout(timer);
  }, [loading]);

  return status;
}
