import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireStaffRole, unauthorizedResponse } from "@/lib/apiAuth";

const ALLOWED_ROLES = ["owner", "admin", "headmaster"] as const;

// Proxies Feeding Control's feeding_fee/minimum_to_eat update through an
// authorized route (rather than a direct Supabase write from the browser)
// so it can also be replayed later from the offline write queue — the
// queue only ever POSTs to an API endpoint, it can't repeat a raw client
// insert/update.
export async function POST(request: Request) {
  try {
    const auth = await requireStaffRole(request, [...ALLOWED_ROLES]);
    if (!auth.ok) return unauthorizedResponse(auth);

    const body = await request.json();

    const id = body.id ? String(body.id) : null;
    const feedingFee = Number(body.feeding_fee);
    const minimumToEat = Number(body.minimum_to_eat);

    if (!Number.isFinite(feedingFee) || !Number.isFinite(minimumToEat)) {
      return NextResponse.json({ error: "Enter both values." }, { status: 400 });
    }

    if (id) {
      const { error } = await supabaseAdmin
        .from("school_settings")
        .update({ feeding_fee: feedingFee, minimum_to_eat: minimumToEat })
        .eq("id", id);

      if (error) throw new Error(error.message);

      return NextResponse.json({ message: "Feeding control saved successfully.", id });
    }

    const { data, error } = await supabaseAdmin
      .from("school_settings")
      .insert([{ feeding_fee: feedingFee, minimum_to_eat: minimumToEat }])
      .select("id")
      .single();

    if (error) throw new Error(error.message);

    return NextResponse.json({ message: "Feeding control saved successfully.", id: data.id });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Something went wrong." },
      { status: 500 }
    );
  }
}
