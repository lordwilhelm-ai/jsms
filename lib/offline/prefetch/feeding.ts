import { supabase } from "@/lib/supabase";
import { fetchWithCache } from "@/lib/offline/cachedQuery";
import { fetchClassFeedingSnapshot } from "@/lib/offline/feedingClassData";
import { isStudentActive } from "@/lib/studentStatus";

const OFFLINE_MODULE = "feeding";

function getClassName(row: Record<string, any>) {
  return String(row.class_name || row.className || row.name || "").trim();
}

// Everything every Feeding sub-page (dashboard, fill-class, debtors,
// reports, student-ledger, control, holidays) reads on its own initial
// load, run together as soon as the Feeding dashboard opens — so opening
// the module once online is enough for every class to be fillable and
// every sub-page to be browsable fully offline afterward, not just
// whichever ones happen to get visited individually.
export function buildFeedingPrefetchTasks(today: string, academicYear: string) {
  const tasks: Array<() => Promise<unknown>> = [
    () => fetchWithCache(OFFLINE_MODULE, "classes", () => supabase.from("classes").select("*").order("class_order", { ascending: true }), []),
    // The "active_students" DB view turned out not to actually filter by
    // status (it returned graduated/inactive students too), so this queries
    // the real table and applies the correct filter here instead of trusting
    // the view.
    () =>
      fetchWithCache(
        OFFLINE_MODULE,
        "active_students",
        () =>
          supabase
            .from("students")
            .select("*")
            .then(({ data, error }) => ({ data: (data || []).filter(isStudentActive), error })),
        []
      ),
    () => fetchWithCache(OFFLINE_MODULE, "students", () => supabase.from("students").select("*"), []),
    () => fetchWithCache(OFFLINE_MODULE, "teachers", () => supabase.from("teachers").select("*"), []),
    () => fetchWithCache(OFFLINE_MODULE, `daily_entries:${today}`, () => supabase.from("daily_entries").select("*").eq("date", today), []),
    () => fetchWithCache(OFFLINE_MODULE, `received_money:${today}`, () => supabase.from("received_money").select("*").eq("date", today), []),
    () => fetchWithCache(OFFLINE_MODULE, "school_settings", () => supabase.from("school_settings").select("*").limit(1).maybeSingle(), null),
    () => fetchWithCache(OFFLINE_MODULE, "school_closures", () => supabase.from("school_closures").select("*").order("start_date", { ascending: true }), []),
    () => fetchWithCache(OFFLINE_MODULE, "ghana_public_holidays", () => supabase.from("ghana_public_holidays").select("*"), []),
    () => fetchWithCache(OFFLINE_MODULE, "teacher_class_assignments", () => supabase.from("teacher_class_assignments").select("*"), []),
    () => fetchWithCache(OFFLINE_MODULE, "teacher_classes", () => supabase.from("teacher_classes").select("*"), []),
    () => fetchWithCache(OFFLINE_MODULE, "student_balances", () => supabase.from("student_balances").select("*"), []),
  ];

  // fill-class's own per-class snapshot (students/entries/teacher-credits/
  // balance-ledger for today) is fetched for EVERY class up front, using
  // the exact same cache keys fill-class itself reads — this is what
  // actually makes "switch classes and fill them separately" work offline
  // for classes the admin hasn't personally opened yet today.
  tasks.push(async () => {
    const classesResult = await fetchWithCache(OFFLINE_MODULE, "classes", () => supabase.from("classes").select("*").order("class_order", { ascending: true }), [] as any[]);
    const classNames = Array.from(new Set((classesResult.data || []).map(getClassName).filter(Boolean)));

    await Promise.allSettled(
      classNames.map((className) => fetchClassFeedingSnapshot({ className, date: today, academicYear }))
    );
  });

  return tasks;
}
