import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireStaffRole, unauthorizedResponse } from "@/lib/apiAuth";
import { logActivity, actorName } from "@/lib/activityLog";

export async function POST(request: Request) {
  try {
    const auth = await requireStaffRole(request, ["owner", "admin", "headmaster"]);
    if (!auth.ok) return unauthorizedResponse(auth);

    const body = await request.json();
    const id = String(body.id || "").trim();

    if (!id) {
      return NextResponse.json(
        { error: "Teacher record ID is required." },
        { status: 400 }
      );
    }

    const { data: teacher, error: teacherError } = await supabaseAdmin
      .from("teachers")
      .select("id, role, auth_user_id, full_name, username")
      .eq("id", id)
      .limit(1)
      .single();

    if (teacherError || !teacher) {
      return NextResponse.json(
        { error: "Teacher not found." },
        { status: 404 }
      );
    }

    if (teacher.role === "super_admin") {
      return NextResponse.json(
        { error: "Super admin cannot be deleted here." },
        { status: 403 }
      );
    }

    // Same rank rule as create/update: a headmaster may manage teacher/
    // headmaster accounts, but only owner/admin can touch an admin-tier one.
    if (auth.role === "headmaster" && (teacher.role === "admin" || teacher.role === "owner")) {
      return NextResponse.json(
        { error: "You don't have permission to delete this account." },
        { status: 403 }
      );
    }

    if (teacher.auth_user_id) {
      const { error: deleteAuthError } =
        await supabaseAdmin.auth.admin.deleteUser(teacher.auth_user_id);

      if (deleteAuthError) {
        throw new Error(deleteAuthError.message);
      }
    }

    const { error: deleteTeacherError } = await supabaseAdmin
      .from("teachers")
      .delete()
      .eq("id", id);

    if (deleteTeacherError) {
      throw new Error(deleteTeacherError.message);
    }

    void logActivity({
      userName: actorName(auth.teacher),
      role: auth.role,
      action: "STAFF_DELETE",
      details: `Deleted staff member "${teacher.full_name || teacher.username || id}" (${teacher.role}).`,
    });

    return NextResponse.json({
      message: "Teacher deleted permanently.",
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Something went wrong.",
      },
      { status: 500 }
    );
  }
}
