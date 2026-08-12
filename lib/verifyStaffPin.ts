import { supabaseAdmin } from "@/lib/supabase-admin";
import { comparePin, isValidPin } from "@/lib/kiosk/pin";

export type PinCheckResult = { ok: true } | { ok: false; status: number; error: string; code?: string };

// Shared by every sensitive-action route (Activity Log undo, Manage
// Records edit/delete) — verifies the CALLER's own PIN against their own
// teachers.pin_hash, reusing the same kiosk PIN infrastructure teachers
// already use to check in.
export async function verifyStaffPin(teacherId: string, pin: string): Promise<PinCheckResult> {
  if (!isValidPin(pin)) {
    return { ok: false, status: 400, error: "Enter your 4-digit PIN." };
  }

  const { data: caller, error } = await supabaseAdmin
    .from("teachers")
    .select("pin_hash")
    .eq("id", teacherId)
    .maybeSingle();
  if (error) throw new Error(error.message);

  if (!caller?.pin_hash) {
    return { ok: false, status: 400, error: "You haven't set a PIN yet.", code: "NO_PIN_SET" };
  }

  const pinOk = await comparePin(pin, caller.pin_hash);
  if (!pinOk) {
    return { ok: false, status: 403, error: "Incorrect PIN." };
  }

  return { ok: true };
}
