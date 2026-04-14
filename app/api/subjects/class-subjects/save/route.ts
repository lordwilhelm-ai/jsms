import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const classId = String(body.class_id || "").trim();
    const subjectIds: string[] = Array.isArray(body.subject_ids)
      ? body.subject_ids.map((id: string) => String(id))
      : [];

    if (!classId) {
      return NextResponse.json(
        { error: "Class ID is required." },
        { status: 400 }
      );
    }

    const { error: deleteError } = await supabaseAdmin
      .from("class_subjects")
      .delete()
      .eq("class_id", classId);

    if (deleteError) {
      throw new Error(deleteError.message);
    }

    if (subjectIds.length > 0) {
      const rows = subjectIds.map((subjectId: string) => ({
        class_id: classId,
        subject_id: subjectId,
      }));

      const { error: insertError } = await supabaseAdmin
        .from("class_subjects")
        .insert(rows);

      if (insertError) {
        throw new Error(insertError.message);
      }
    }

    return NextResponse.json({
      message: "Class subjects saved successfully.",
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
