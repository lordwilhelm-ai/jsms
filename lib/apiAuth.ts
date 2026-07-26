import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export type StaffRole = "owner" | "admin" | "headmaster" | "teacher";

type TeacherRow = Record<string, any>;

type AuthResult =
  | { ok: true; teacher: TeacherRow; role: StaffRole }
  | { ok: false; status: 401 | 403; error: string };

// Any `teachers.role` value other than owner/admin/headmaster (including
// blank/null/garbage) resolves to "teacher" — the least-privileged role in
// this app, and the one every report-card route currently allows. This
// mirrors the identical fallback used client-side in every teacher/admin
// page's own `getRole()` (upload-results, attendance, remarks, etc.), so a
// `teachers` row with no role set still works as a plain teacher instead of
// silently losing access. IMPORTANT: if a future route restricts access to
// only owner/admin/headmaster (i.e. omits "teacher" from allowedRoles),
// this fallback means an unset/garbage role is NOT automatically excluded
// from it — such a route must reject based on the resolved role, not assume
// unknown roles are filtered out here.
function getRole(row: TeacherRow | null): StaffRole {
  const raw = String(row?.role || "").trim().toLowerCase();
  // "super_admin"/"superadmin" is a real, distinct role value used elsewhere
  // in this app's own login redirect (app/page.tsx, TeacherLoginModal.tsx)
  // but StaffRole only has four literal values — normalize it to "owner"
  // (the top tier) rather than passing the raw string through, since
  // `raw as StaffRole` would just be a type-lie: every allowedRoles array
  // this app passes to requireStaffRole only ever lists "owner"/"admin"/
  // "headmaster"/"teacher" literally, never "super_admin", so a caller
  // resolved to that raw string would still fail every `.includes()` check.
  if (raw === "super_admin" || raw === "superadmin") return "owner";
  if (raw === "owner" || raw === "admin" || raw === "headmaster") return raw as StaffRole;
  return "teacher";
}

// Verifies the caller's Supabase session and resolves their staff role from the
// `teachers` table (same lookup/role rule used client-side across the app), so
// API routes can reject requests that don't come from a logged-in, permitted user.
export async function requireStaffRole(
  request: Request,
  allowedRoles: StaffRole[]
): Promise<AuthResult> {
  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";

  if (!token) {
    return { ok: false, status: 401, error: "Not authenticated." };
  }

  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
  if (userError || !userData?.user) {
    return { ok: false, status: 401, error: "Invalid or expired session." };
  }

  const { data: teachers, error: teachersError } = await supabaseAdmin
    .from("teachers")
    .select("*");

  if (teachersError) {
    return { ok: false, status: 401, error: "Could not verify staff account." };
  }

  const user = userData.user;
  const teacher =
    (teachers || []).find((item) => item.auth_user_id === user.id) ||
    (teachers || []).find(
      (item) =>
        String(item.email || "").trim().toLowerCase() ===
        String(user.email || "").trim().toLowerCase()
    ) ||
    null;

  if (!teacher) {
    return { ok: false, status: 401, error: "Staff account not found." };
  }

  const role = getRole(teacher);
  if (!allowedRoles.includes(role)) {
    return { ok: false, status: 403, error: "You don't have permission to do this." };
  }

  return { ok: true, teacher, role };
}

export function unauthorizedResponse(result: { status: 401 | 403; error: string }) {
  return NextResponse.json({ error: result.error }, { status: result.status });
}
