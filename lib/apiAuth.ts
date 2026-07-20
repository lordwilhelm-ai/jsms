import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export type StaffRole = "owner" | "admin" | "headmaster" | "teacher";

type TeacherRow = Record<string, any>;

type AuthResult =
  | { ok: true; teacher: TeacherRow; role: StaffRole }
  | { ok: false; status: 401 | 403; error: string };

function getRole(row: TeacherRow | null): StaffRole {
  const raw = String(row?.role || "").trim().toLowerCase();
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
