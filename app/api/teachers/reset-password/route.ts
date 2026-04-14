import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const id = String(body.id || "").trim();
    const newPassword = String(body.newPassword || "");

    if (!id) {
      return NextResponse.json({ error: "Teacher record ID is required." }, { status: 400 });
    }

    if (!newPassword || newPassword.length < 6) {
      return NextResponse.json(
        { error: "New password must be at least 6 characters." },
        { status: 400 }
      );
    }

    const { data: teacher, error: teacherError } = await supabaseAdmin
      .from("teachers")
      .select("auth_user_id, role")
      .eq("id", id)
      .limit(1)
      .single();

    if (teacherError || !teacher) {
      return NextResponse.json({ error: "Teacher not found." }, { status: 404 });
    }

    if (!teacher.auth_user_id) {
      return NextResponse.json({ error: "This account has no auth user linked." }, { status: 400 });
    }

    if (teacher.role === "super_admin") {
      return NextResponse.json({ error: "Super admin password cannot be reset here." }, { status: 403 });
    }

    const { error: resetError } = await supabaseAdmin.auth.admin.updateUserById(
      teacher.auth_user_id,
      { password: newPassword }
    );

    if (resetError) {
      throw new Error(resetError.message);
    }

    return NextResponse.json({ message: "Password reset successfully." });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Something went wrong.",
      },
      { status: 500 }
    );
  }
}
