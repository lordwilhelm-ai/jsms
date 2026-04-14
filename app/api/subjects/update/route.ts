import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const id = String(body.id || "").trim();
    const subjectName = String(body.subject_name || "").trim();
    const subjectOrder = Number(body.subject_order);

    if (!id) {
      return NextResponse.json({ error: "Subject ID is required." }, { status: 400 });
    }

    if (!subjectName) {
      return NextResponse.json({ error: "Subject name is required." }, { status: 400 });
    }

    if (!Number.isFinite(subjectOrder) || subjectOrder < 1) {
      return NextResponse.json({ error: "Subject order must be valid." }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from("subjects")
      .update({
        subject_name: subjectName,
        subject_order: subjectOrder,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json({
      message: "Subject updated successfully.",
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Something went wrong.",
      },
      { status: 500 }
    );
  }
}
