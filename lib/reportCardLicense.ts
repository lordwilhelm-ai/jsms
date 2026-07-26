import { supabaseAdmin } from "@/lib/supabase-admin";

export const REPORT_CARD_BILL_RATE = 2;

function cleanLower(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

type StudentRow = Record<string, any>;

export function isActiveStudent(student: StudentRow) {
  const status = cleanLower(student.status);
  if (student.left_school === true) return false;
  if (student.is_active === false) return false;
  if (student.active === false) return false;
  if (status === "inactive" || status === "left" || status === "withdrawn") return false;
  return true;
}

export async function computeReportCardLicenseAmount() {
  const { data: allStudents, error } = await supabaseAdmin
    .from("students")
    .select("id,student_id,jvs_id,class_name,is_active,active,left_school,status");

  if (error) throw error;

  const activeStudents = (allStudents || []).filter(isActiveStudent);
  const studentsPaid = activeStudents.length;
  const totalAmount = studentsPaid * REPORT_CARD_BILL_RATE;

  return { studentsPaid, totalAmount };
}

const LICENSE_BILL_WINDOW_DAYS = 90; // 1 term = 90 days — same window hooks/useReportCardAccess.ts uses.

export type LicenseCheckResult = { ok: true } | { ok: false; reason: string };

// Server-side mirror of hooks/useReportCardAccess.ts's `canAccess` computation.
// The report-card dashboards only hide the Upload Results / Attendance /
// Remarks buttons behind a "Payment Required" gate client-side — nothing
// stopped a locked-out account from calling the save-* API routes directly
// and writing data anyway. This re-derives the same paid/unpaid decision
// (license row, term match, 90-day cycle, per-student billing) so the save
// routes can reject writes for a school that hasn't paid.
//
// If the license/settings/students lookup itself fails (infra issue, not
// "unpaid"), this fails OPEN rather than blocking every save in production —
// an unreachable license table is not evidence the school hasn't paid, and
// this is a billing gate, not a data-security boundary.
export async function checkReportCardLicense(): Promise<LicenseCheckResult> {
  try {
    const [studentsRes, settingsRes, licenseRes] = await Promise.all([
      supabaseAdmin
        .from("students")
        .select("id,is_active,active,left_school,status"),
      supabaseAdmin
        .from("school_settings")
        .select("current_academic_year,current_term")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabaseAdmin
        .from("rc_licenses")
        .select("*")
        .eq("client_name", "Jefsem Vision School")
        .eq("system_name", "Report Card System")
        .maybeSingle(),
    ]);

    if (studentsRes.error || settingsRes.error || licenseRes.error) {
      return { ok: true };
    }

    const activeCount = ((studentsRes.data || []) as StudentRow[]).filter(isActiveStudent).length;
    const academicYear = settingsRes.data?.current_academic_year;
    const term = settingsRes.data?.current_term;
    const lic = licenseRes.data as Record<string, any> | null;

    if (!lic) {
      return { ok: false, reason: "Report-card access has not been paid for yet." };
    }

    const termChanged = lic.academic_year !== academicYear || lic.term !== term;
    const cycleStart = lic.cycle_start_at ? new Date(lic.cycle_start_at).getTime() : 0;
    const cycleExpired =
      cycleStart > 0 && Date.now() - cycleStart > LICENSE_BILL_WINDOW_DAYS * 24 * 60 * 60 * 1000;

    if (termChanged || cycleExpired || lic.payment_status !== "paid") {
      return { ok: false, reason: "Report-card access payment is due for this term." };
    }

    const paidCount = lic.paid_student_count || 0;
    const extra = Math.max(0, activeCount - paidCount);

    if (extra > 0) {
      return {
        ok: false,
        reason: "New students have been added since payment — additional payment is due.",
      };
    }

    return { ok: true };
  } catch {
    return { ok: true };
  }
}
