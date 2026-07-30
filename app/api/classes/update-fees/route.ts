import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireStaffRole, unauthorizedResponse } from "@/lib/apiAuth";
import { logActivity, actorName } from "@/lib/activityLog";

export async function POST(request: Request) {
  try {
    const auth = await requireStaffRole(request, ["owner", "admin", "headmaster"]);
    if (!auth.ok) return unauthorizedResponse(auth);

    const body = await request.json();
    const id = String(body.id || "").trim();
    if (!id) {
      return NextResponse.json({ error: "Class ID is required." }, { status: 400 });
    }

    const updates: any = {
      updated_at: new Date().toISOString(),
    };

    if (body.fee_returning !== undefined) updates.fee_returning = Number(body.fee_returning || 0);
    if (body.fee_new !== undefined) updates.fee_new = Number(body.fee_new || 0);
    if (body.fee_lacoste !== undefined) updates.fee_lacoste = Number(body.fee_lacoste || 0);
    if (body.fee_monwed !== undefined) updates.fee_monwed = Number(body.fee_monwed || 0);
    if (body.fee_friday !== undefined) updates.fee_friday = Number(body.fee_friday || 0);

    const { data: updated, error } = await supabaseAdmin
      .from("classes")
      .update(updates)
      .eq("id", id)
      .select("class_name, name")
      .maybeSingle();
    if (error) throw new Error(error.message);

    void logActivity({
      userName: actorName(auth.teacher),
      role: auth.role,
      action: "CLASSES_UPDATE_FEES",
      className: updated?.class_name || updated?.name || null,
      details: `Updated class fees for "${updated?.class_name || updated?.name || id}".`,
    });

    return NextResponse.json({ message: "Class fees updated." });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
