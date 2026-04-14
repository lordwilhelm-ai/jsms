import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from("subjects")
      .select("*")
      .order("subject_order", { ascending: true });

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json({
      subjects: data || [],
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
