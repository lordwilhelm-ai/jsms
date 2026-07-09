import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function POST(req: Request) {
  const { licenseId, invoiceId, amount } = await req.json();
  const { error } = await supabase
    .from("rc_licenses")
    .update({ invoice_id: invoiceId, amount, payment_status: 'pending' })
    .eq("id", licenseId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}