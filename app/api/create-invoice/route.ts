import { NextResponse } from "next/server";
import crypto from "crypto";
import { supabase } from "@/lib/supabase";
import { requireStaffRole, unauthorizedResponse } from "@/lib/apiAuth";

export async function POST(req: Request) {
  try {
    const auth = await requireStaffRole(req, ["owner", "admin", "headmaster"]);
    if (!auth.ok) return unauthorizedResponse(auth);

    const { licenseId, amount } = await req.json();
    if (!licenseId || amount === undefined) {
      return NextResponse.json({ error: "Missing licenseId or amount" }, { status: 400 });
    }

    // Hubtel's clientReference caps at 32 chars, so keep this short while still
    // giving it full 128-bit entropy (unguessable, unlike the old Date.now() id).
    const invoiceId = `JVS-RC-${crypto.randomBytes(16).toString("base64url")}`;

    const { error } = await supabase.from("rc_licenses").update({ 
      invoice_id: invoiceId,
      payment_status: 'pending',
      amount: amount
    }).eq("id", licenseId);

    if (error) throw error;

    return NextResponse.json({ invoiceId });
  } catch (e) {
    console.error("Create invoice error:", e);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}