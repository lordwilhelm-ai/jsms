import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireStaffRole, unauthorizedResponse } from "@/lib/apiAuth";

export async function GET(request: Request) {
  try {
    const auth = await requireStaffRole(request, ["owner", "admin", "headmaster", "teacher"]);
    if (!auth.ok) return unauthorizedResponse(auth);

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
