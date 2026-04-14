import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const id = String(body.id || "").trim();
    const className = String(body.class_name || "").trim();
    const classOrder = Number(body.class_order);
    const level = String(body.level || "").trim();

    if (!id) {
      return NextResponse.json({ error: "Class ID is required." }, { status: 400 });
    }

    if (!className) {
      return NextResponse.json({ error: "Class name is required." }, { status: 400 });
    }

    if (!Number.isFinite(classOrder) || classOrder < 1) {
      return NextResponse.json({ error: "Class order must be valid." }, { status: 400 });
    }

    if (!["Pre-School", "KG", "Primary", "JHS"].includes(level)) {
      return NextResponse.json({ error: "Select a valid level." }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from("classes")
      .update({
        name: className,
        class_name: className,
        class_order: classOrder,
        level,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json({
      message: "Class updated successfully.",
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
