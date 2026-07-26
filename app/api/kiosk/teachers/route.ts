import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireStaffRole, unauthorizedResponse } from "@/lib/apiAuth";

// The kiosk's offline PIN check needs each teacher's bcrypt pin_hash cached
// locally (IndexedDB) so check-in/out works with no connectivity. The old
// code fetched that straight from the browser via the anon-key `supabase`
// client — since anon-key queries aren't gated by app login at all, ANYONE
// who knows the table/column names could pull every teacher's PIN hash and
// offline-brute-force the 4-digit PIN space in seconds. Proxying the same
// read through here means it now requires a real logged-in staff session.
export async function GET(request: Request) {
  try {
    const auth = await requireStaffRole(request, ["owner", "admin", "headmaster", "teacher"]);
    if (!auth.ok) return unauthorizedResponse(auth);

    const { data, error } = await supabaseAdmin
      .from("teachers")
      .select("teacher_id,full_name,username,pin_hash,photo_url,assigned_classes,is_active,is_visible")
      .eq("is_active", true)
      .eq("is_visible", true)
      .order("full_name");

    if (error) throw error;

    return NextResponse.json({ teachers: data || [] });
  } catch (error) {
    console.error("Kiosk teacher cache error:", error);
    const message =
      error instanceof Error
        ? error.message
        : String((error as Record<string, any>)?.message || "Failed to load teachers.");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
