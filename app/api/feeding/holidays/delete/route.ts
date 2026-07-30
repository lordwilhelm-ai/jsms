import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireStaffRole, unauthorizedResponse } from "@/lib/apiAuth";
import { logActivity, actorName } from "@/lib/activityLog";

const ALLOWED_ROLES = ["owner", "admin", "headmaster"] as const;

export async function POST(request: Request) {
  try {
    const auth = await requireStaffRole(request, [...ALLOWED_ROLES]);
    if (!auth.ok) return unauthorizedResponse(auth);

    const body = await request.json();
    const id = String(body.id || "").trim();

    if (!id) {
      return NextResponse.json({ error: "Missing closure id." }, { status: 400 });
    }

    const { data: removed } = await supabaseAdmin
      .from("school_closures")
      .select("name, start_date, end_date")
      .eq("id", id)
      .maybeSingle();

    const { error } = await supabaseAdmin.from("school_closures").delete().eq("id", id);
    if (error) throw new Error(error.message);

    void logActivity({
      userName: actorName(auth.teacher),
      role: auth.role,
      action: "FEEDING_DELETE_HOLIDAY",
      details: `Removed closure "${removed?.name || id}"${removed?.start_date ? ` (${removed.start_date} to ${removed.end_date})` : ""}.`,
    });

    return NextResponse.json({ message: "Deleted successfully." });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete closure." },
      { status: 500 }
    );
  }
}
