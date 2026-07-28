import { supabase } from "@/lib/supabase";
import { authedFetch } from "@/lib/apiClient";
import { fetchWithCache } from "@/lib/offline/cachedQuery";

const OFFLINE_MODULE = "report-card";

function fetchJsonRows(url: string) {
  return authedFetch(url).then(async (response) => {
    const body = await response.json();
    if (!response.ok) return { data: null, error: body.error || "Request failed." };
    return { data: body.rows || [], error: null };
  });
}

// Every unique table/key any Report Card sub-page reads on its own initial
// load (the dashboard, reports, billing), run together as soon as the
// Report Card dashboard opens. Uses the widest column set any one
// sub-page selects for a given table (e.g. `select("*")` over the
// dashboard's narrower column list) since they all share the same cache
// key/module and whichever page loads last would otherwise win.
export function buildReportCardPrefetchTasks() {
  const tasks: Array<() => Promise<unknown>> = [
    () =>
      fetchWithCache(
        OFFLINE_MODULE,
        "school_settings",
        () => supabase.from("school_settings").select("*").order("updated_at", { ascending: false }).limit(1).maybeSingle(),
        null
      ),
    () => fetchWithCache(OFFLINE_MODULE, "students", () => supabase.from("students").select("*").order("class_name", { ascending: true }).order("full_name", { ascending: true }), []),
    () => fetchWithCache(OFFLINE_MODULE, "teachers", () => supabase.from("teachers").select("*"), []),
    () => fetchWithCache(OFFLINE_MODULE, "classes", () => supabase.from("classes").select("*").order("class_order", { ascending: true }), []),
    () => fetchWithCache(OFFLINE_MODULE, "scores", () => fetchJsonRows("/api/report-card/scores"), []),
    () => fetchWithCache(OFFLINE_MODULE, "attendance", () => fetchJsonRows("/api/report-card/attendance"), []),
    () => fetchWithCache(OFFLINE_MODULE, "cards", () => fetchJsonRows("/api/report-card/cards"), []),
    () => fetchWithCache(OFFLINE_MODULE, "teacher_class_assignments", () => supabase.from("teacher_class_assignments").select("*"), []),
    () => fetchWithCache(OFFLINE_MODULE, "jsms_report_fee_live_view", () => supabase.from("jsms_report_fee_live_view").select("*"), []),
    () => fetchWithCache(OFFLINE_MODULE, "fee_payments", () => supabase.from("fee_payments").select("*"), []),
    () => fetchWithCache(OFFLINE_MODULE, "fee_structure", () => supabase.from("fee_structure").select("*"), []),
    () => fetchWithCache(OFFLINE_MODULE, "ghana_public_holidays", () => supabase.from("ghana_public_holidays").select("*"), []),
    () => fetchWithCache(OFFLINE_MODULE, "school_closures", () => supabase.from("school_closures").select("*"), []),
  ];

  return tasks;
}
