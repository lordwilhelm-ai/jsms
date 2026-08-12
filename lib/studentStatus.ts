// Single source of truth for "is this student currently enrolled and
// operationally active" — used to decide whether a student should be
// selectable in fees/feeding/books pickers, appear in debtor/balance lists,
// receive fee-reminder messages, etc.
//
// This consolidates several copy-pasted, inconsistent checks that existed
// across the app: some only checked the `active`/`is_active` boolean
// columns (which stayed `true` even on students whose `status` was
// "inactive"/"Completed" — the exact gap that let a graduated student leak
// through the `active_students` DB view), and some short-circuited on the
// boolean before ever consulting `status`. A student now counts as
// INACTIVE if ANY of status/active/is_active says so — no single field is
// trusted alone, and none of them can override another into "active".
const INACTIVE_STATUS_VALUES = new Set([
  "inactive",
  "completed",
  "graduated",
  "withdrawn",
  "left",
  "left_school",
  "dropped",
  "dropped out",
  "suspended",
  "expelled",
]);

export function isStudentActive(student: Record<string, any> | null | undefined): boolean {
  if (!student) return false;

  const status = String(student.status ?? "").trim().toLowerCase();
  if (status && INACTIVE_STATUS_VALUES.has(status)) return false;

  if (student.is_active === false) return false;
  if (student.active === false) return false;
  if (student.left_school === true) return false;

  return true;
}
