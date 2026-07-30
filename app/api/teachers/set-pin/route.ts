import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireStaffRole, unauthorizedResponse } from "@/lib/apiAuth";
import { hashPin, isValidPin } from "@/lib/kiosk/pin";
import { logActivity, actorName } from "@/lib/activityLog";

// Teacher creation never sets a kiosk PIN, and there was previously no way
// for an admin to set/reset one at all (hashPin() existed but was never
// called anywhere) — this is the missing piece. Only ever stores the
// bcrypt hash; the plaintext PIN is never persisted or logged.
const ALLOWED_ROLES = ["owner", "admin", "headmaster"] as const;

export async function POST(request: Request) {
  try {
    const auth = await requireStaffRole(request, [...ALLOWED_ROLES]);
    if (!auth.ok) return unauthorizedResponse(auth);

    const body = await request.json();
    const teacherId = String(body?.teacherId || "").trim();
    const pin = String(body?.pin || "").trim();

    if (!teacherId) {
      return NextResponse.json({ error: "Teacher is required." }, { status: 400 });
    }

    if (!isValidPin(pin)) {
      return NextResponse.json({ error: "PIN must be exactly 4 digits." }, { status: 400 });
    }

    const pinHash = await hashPin(pin);

    const { data: teacher, error } = await supabaseAdmin
      .from("teachers")
      .update({ pin_hash: pinHash })
      .eq("id", teacherId)
      .select("full_name, username")
      .maybeSingle();

    if (error) throw new Error(error.message);

    void logActivity({
      userName: actorName(auth.teacher),
      role: auth.role,
      action: "STAFF_SET_PIN",
      details: `Set kiosk PIN for "${teacher?.full_name || teacher?.username || teacherId}".`,
    });

    return NextResponse.json({ message: "Kiosk PIN set successfully." });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
