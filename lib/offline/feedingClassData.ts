import { supabase } from "@/lib/supabase";
import { fetchWithCache } from "@/lib/offline/cachedQuery";

const OFFLINE_MODULE = "feeding";

// Shared by feeding/admin/fill-class's own per-class load AND the Feeding
// module's background prefetch (triggered from feeding/admin/page.tsx) so
// both write to/read from the exact same cache keys — prefetching every
// class for today means fill-class can switch between any of them offline
// afterward, not just whichever class happens to already be selected.
export async function fetchClassFeedingSnapshot(params: {
  className: string;
  date: string;
  academicYear: string;
}) {
  const { className, date, academicYear } = params;

  const [studentsRes, entriesRes, creditRes] = await Promise.all([
    fetchWithCache(
      OFFLINE_MODULE,
      `students:${className}`,
      () => supabase.from("students").select("*").eq("class_name", className),
      [] as any[]
    ),
    fetchWithCache(
      OFFLINE_MODULE,
      `daily_entries:${date}:${className}`,
      () => supabase.from("daily_entries").select("*").eq("date", date).eq("class_name", className),
      [] as any[]
    ),
    fetchWithCache(
      OFFLINE_MODULE,
      `daily_entries_teacher_credit:${date}:${className}`,
      () =>
        supabase
          .from("daily_entries")
          .select("*")
          .eq("date", date)
          .eq("class_name", className)
          .eq("entered_by_role", "teacher")
          .eq("admin_override_ate_without_pay", true)
          .order("student_name", { ascending: true }),
      [] as any[]
    ),
  ]);

  const studentIds = (studentsRes.data || [])
    .map((s: any) => String(s.student_id || s.studentId || s.id || "").trim())
    .filter(Boolean);

  const ledgerRes = studentIds.length
    ? await fetchWithCache(
        OFFLINE_MODULE,
        `balance_ledger:${date}:${className}`,
        () =>
          supabase
            .from("balance_ledger")
            .select("student_id, date, new_balance, academic_year")
            .in("student_id", studentIds)
            .eq("academic_year", academicYear)
            .lt("date", date)
            .order("date", { ascending: true }),
        [] as any[]
      )
    : { data: [] as any[], fromCache: false };

  return {
    students: studentsRes.data || [],
    entries: entriesRes.data || [],
    teacherCredits: creditRes.data || [],
    priorLedgerRows: ledgerRes.data || [],
    fromCache: [studentsRes, entriesRes, creditRes, ledgerRes].some((r) => r.fromCache),
  };
}
