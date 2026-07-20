import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireStaffRole, unauthorizedResponse } from "@/lib/apiAuth";

export async function GET(request: Request) {
  try {
    const auth = await requireStaffRole(request, ["owner", "admin", "headmaster", "teacher"]);
    if (!auth.ok) return unauthorizedResponse(auth);

    const { searchParams } = new URL(request.url);
    const classId = String(searchParams.get("class_id") || "").trim();

    if (!classId) {
      return NextResponse.json(
        { error: "Class ID is required." },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("class_subjects")
      .select("subject_id")
      .eq("class_id", classId);

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json({
      subject_ids: (data || []).map((item) => item.subject_id),
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
