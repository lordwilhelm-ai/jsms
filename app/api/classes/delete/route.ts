import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const id = String(body.id || "").trim();

    if (!id) {
      return NextResponse.json({ error: "Class ID is required." }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from("classes")
      .delete()
      .eq("id", id);

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json({
      message: "Class deleted successfully.",
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
