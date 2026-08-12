import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireStaffRole, unauthorizedResponse } from "@/lib/apiAuth";
import { logActivity } from "@/lib/activityLog";

const ALLOWED_ROLES = ["owner", "admin", "headmaster"] as const;

function cleanText(value: unknown) {
  return String(value ?? "").trim();
}

function roundMoney(value: number) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function getStaffDisplayName(teacher: Record<string, any> | null) {
  return (
    String(
      teacher?.full_name || teacher?.name || teacher?.teacher_name || teacher?.username || teacher?.email || "Admin"
    ).trim() || "Admin"
  );
}

export async function POST(request: Request) {
  try {
    const auth = await requireStaffRole(request, [...ALLOWED_ROLES]);
    if (!auth.ok) return unauthorizedResponse(auth);

    const body = await request.json();
    const date = cleanText(body?.date);
    const className = cleanText(body?.className);
    const amountReceived = roundMoney(Number(body?.amountReceived) || 0);
    const teacherNames = cleanText(body?.teacherNames);

    if (!date || !className) {
      return NextResponse.json({ error: "Date and class are required." }, { status: 400 });
    }

    // Re-validate the idempotency check server-side — a device that queued
    // this offline shouldn't double-mark a class already received by
    // someone else in the meantime.
    const { data: existing, error: existingError } = await supabaseAdmin
      .from("received_money")
      .select("id")
      .eq("date", date)
      .eq("class_name", className)
      .maybeSingle();

    if (existingError) throw new Error(existingError.message);

    if (existing) {
      return NextResponse.json(
        { error: "This class has already been marked as received today." },
        { status: 409 }
      );
    }

    const staffName = getStaffDisplayName(auth.teacher);

    const { data: inserted, error } = await supabaseAdmin
      .from("received_money")
      .insert([
        {
          date,
          class_name: className,
          amount_received: amountReceived,
          teacher_names: teacherNames,
          received_by: staffName,
        },
      ])
      .select("id")
      .single();

    if (error) throw new Error(error.message);

    void logActivity({
      userName: staffName,
      role: auth.role,
      action: "FEEDING_MARK_RECEIVED",
      className,
      date,
      details: `Marked ${className} feeding money as received for ${date} — GHS ${amountReceived.toFixed(2)} (${teacherNames || "no teacher name given"}).`,
      undoType: "DELETE_ROW",
      undoPayload: { table: "received_money", id: inserted.id },
    });

    return NextResponse.json({ message: `${className} money marked as received.` });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
