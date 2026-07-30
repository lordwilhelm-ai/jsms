import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireStaffRole, unauthorizedResponse } from "@/lib/apiAuth";
import { logActivity, actorName } from "@/lib/activityLog";

// Staff-only: changes the admission form price used to charge every future
// applicant. Previously called via supabase.rpc(...) straight from the
// browser with no server-side role check at all.
export async function POST(request: Request) {
  try {
    const auth = await requireStaffRole(request, ["owner", "admin", "headmaster"]);
    if (!auth.ok) return unauthorizedResponse(auth);

    const body = await request.json();
    const formPrice = Number(body.form_price);

    if (!Number.isFinite(formPrice) || formPrice < 0) {
      return NextResponse.json({ error: "Enter a valid form price." }, { status: 400 });
    }

    const { error } = await supabaseAdmin.rpc("update_admission_form_price", {
      p_form_price: formPrice,
    });

    if (error) throw new Error(error.message);

    void logActivity({
      userName: actorName(auth.teacher),
      role: auth.role,
      action: "ADMISSION_UPDATE_PRICE",
      details: `Set admission form price to GHS ${formPrice}.`,
    });

    return NextResponse.json({ message: "Admission form price saved." });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Something went wrong." },
      { status: 500 }
    );
  }
}
