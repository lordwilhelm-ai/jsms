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
