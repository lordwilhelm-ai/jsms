import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireStaffRole, unauthorizedResponse } from "@/lib/apiAuth";

const ALLOWED_ROLES = ["owner", "admin", "headmaster"] as const;

export async function POST(request: Request) {
  try {
    const auth = await requireStaffRole(request, [...ALLOWED_ROLES]);
    if (!auth.ok) return unauthorizedResponse(auth);

    const body = await request.json();

    const name = String(body.name || "").trim();
    const type = body.type === "vacation" ? "vacation" : "holiday";
    const startDate = String(body.start_date || "").trim();
    const endDate = String(body.end_date || startDate).trim();

    if (!name) {
      return NextResponse.json({ error: "Enter name." }, { status: 400 });
    }

    if (!startDate) {
      return NextResponse.json({ error: "Select start date." }, { status: 400 });
    }

    if (endDate < startDate) {
      return NextResponse.json({ error: "End date cannot be before start date." }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("school_closures")
      .insert([{ name, type, start_date: startDate, end_date: endDate, active: true }])
      .select()
      .single();

    if (error) throw new Error(error.message);

    return NextResponse.json({ message: "Added successfully.", closure: data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to add closure." },
      { status: 500 }
    );
  }
}
