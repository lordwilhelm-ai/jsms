import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function POST(req: Request) {
  try {
    const { licenseId, amount } = await req.json();
    if (!licenseId || amount === undefined) {
      return NextResponse.json({ error: "Missing licenseId or amount" }, { status: 400 });
    }

    const invoiceId = `JVS-RC-${Date.now()}`;

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