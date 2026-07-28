import { supabase } from "@/lib/supabase";
import { fetchWithCache } from "@/lib/offline/cachedQuery";

const OFFLINE_MODULE = "fees";

// Every unique table/key any Fees sub-page reads on its own initial load
// (record-payment, debtors, receipts, reports, fee-structure,
// student-accounts, class-fees, fee-reminder), run together as soon as the
// Fees dashboard opens — so opening the module once online is enough for
// every one of those pages, and every class/student they let you pick, to
// be browsable and fillable fully offline afterward.
export function buildFeesPrefetchTasks() {
  const tasks: Array<() => Promise<unknown>> = [
    () => fetchWithCache(OFFLINE_MODULE, "teachers", () => supabase.from("teachers").select("*"), []),
    () => fetchWithCache(OFFLINE_MODULE, "school_settings", () => supabase.from("school_settings").select("*").limit(1).maybeSingle(), null),
    () => fetchWithCache(OFFLINE_MODULE, "classes", () => supabase.from("classes").select("*"), []),
    () => fetchWithCache(OFFLINE_MODULE, "active_students", () => supabase.from("active_students").select("*"), []),
    () => fetchWithCache(OFFLINE_MODULE, "students", () => supabase.from("students").select("*"), []),
    () => fetchWithCache(OFFLINE_MODULE, "fee_payments", () => supabase.from("fee_payments").select("*").order("created_at", { ascending: false }), []),
    () => fetchWithCache(OFFLINE_MODULE, "jsms_book_payments", () => supabase.from("jsms_book_payments").select("*").order("created_at", { ascending: false }), []),
    () => fetchWithCache(OFFLINE_MODULE, "jsms_uniform_payments", () => supabase.from("jsms_uniform_payments").select("*").order("created_at", { ascending: false }), []),
    () =>
      fetchWithCache(
        OFFLINE_MODULE,
        "new_student_fee_items",
        () =>
          supabase
            .from("new_student_fee_items")
            .select("*")
            .eq("is_active", true)
            .order("level_group", { ascending: true })
            .order("sort_order", { ascending: true }),
        []
      ),
    () => fetchWithCache(OFFLINE_MODULE, "universal_receipts", () => supabase.from("universal_receipts").select("*").order("created_at", { ascending: false }), []),
    () => fetchWithCache(OFFLINE_MODULE, "admission_payments", () => supabase.from("admission_payments").select("*").order("created_at", { ascending: false }), []),
    () => fetchWithCache(OFFLINE_MODULE, "jsms_book_sales", () => supabase.from("jsms_book_sales").select("*").order("created_at", { ascending: false }), []),
    () => fetchWithCache(OFFLINE_MODULE, "jsms_uniform_sales", () => supabase.from("jsms_uniform_sales").select("*").order("created_at", { ascending: false }), []),
  ];

  return tasks;
}
