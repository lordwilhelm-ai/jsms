import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function POST(request: Request) {
  try {
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
      .select("id, role, auth_user_id")
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
