/**
 * PASTE THIS FILE AT:
 *   hooks/useReportCardAccess.ts
 *
 * You need to CREATE the "hooks" folder first if it does not exist.
 * It should sit at the same level as "lib", "components", "app".
 */

"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { canAccessReportCard, AccessResult } from "@/lib/reportCardAccess";

type HookState = AccessResult & { checking: boolean };

const INITIAL: HookState = {
  checking: true,
  canAccess: false,
  amountDue: 0,
  record: null,
  reason: null,
};

export function useReportCardAccess(): HookState {
  const [state, setState] = useState<HookState>(INITIAL);

  useEffect(() => {
    let cancelled = false;

    canAccessReportCard(supabase).then((result) => {
      if (!cancelled) setState({ checking: false, ...result });
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
