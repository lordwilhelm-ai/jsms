import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from("classes")
      .select("id, name, class_name, class_order, level")
      .order("class_order", { ascending: true });

    if (error) {
      throw new Error(error.message);
    }

    const classes =
      data?.map((item) => ({
        id: item.id,
        class_name: item.class_name || item.name || "",
        class_order: item.class_order,
        level: item.level,
      })) || [];

    return NextResponse.json({
      classes,
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
