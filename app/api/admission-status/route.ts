import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = String(searchParams.get("id") || "").trim();

    if (!id) {
      return NextResponse.json({ error: "Missing id." }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("admission_applications")
      .select("student_id, student_name, class_applying, form_receipt_number, form_price, form_payment_status")
      .eq("id", id)
      .maybeSingle();

    if (error) throw error;
    if (!data) {
      return NextResponse.json({ error: "Application not found." }, { status: 404 });
    }

    return NextResponse.json({ application: data });
  } catch (error) {
    console.error("Admission status error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load application status." },
      { status: 500 }
    );
  }
}
