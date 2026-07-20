import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { computeReportCardLicenseAmount } from "@/lib/reportCardLicense";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    
    // Hubtel sends data inside body.Data
    const data = body?.Data || body;
    const status = data?.Status || data?.status;
    const invoiceId = data?.ClientReference || data?.clientReference;
    const amountPaid = Number(data?.Amount || data?.amount || 0);

    // Only process successful payments
    if (status !== "Success") {
      console.log("Webhook ignored. Status:", status);
      return NextResponse.json({ received: true, ignored: true });
    }

    if (!invoiceId) {
      throw new Error("Missing ClientReference in webhook");
    }

    // 1. Check if already processed to avoid double updates
    const { data: existingLicense } = await supabaseAdmin
      .from("rc_licenses")
      .select("id, payment_status")
      .eq("invoice_id", invoiceId)
      .single();

    if (existingLicense?.payment_status === 'paid') {
      console.log("License already paid:", invoiceId);
      return NextResponse.json({ received: true, already_paid: true });
    }

    // 2. Count active students (server-computed, never trust the webhook's Amount for the license total)
    const { studentsPaid, totalAmount } = await computeReportCardLicenseAmount();

    // 3. Get current academic settings
    const { data: settings } = await supabaseAdmin
      .from("school_settings")
      .select("current_academic_year, current_term")
      .order("updated_at", { ascending: false })
      .limit(1)
      .single();

    // 4. Update license
    const { error: updateError } = await supabaseAdmin.from("rc_licenses").update({
      payment_status: 'paid',
      is_paid: true,
      amount: totalAmount, // total amount paid, not 0
      amount_paid: amountPaid, // actual amount from Hubtel
      paid_student_count: studentsPaid,
      last_paid_at: new Date().toISOString(),
      cycle_start_at: new Date().toISOString(),
      academic_year: settings?.current_academic_year,
      term: settings?.current_term,
      hubtel_checkout_id: data?.CheckoutId,
      hubtel_transaction_id: data?.SalesInvoiceId
    }).eq("invoice_id", invoiceId);

    if (updateError) throw updateError;

    console.log(`License ${invoiceId} marked paid. Students: ${studentsPaid}, Amount: ${totalAmount}`);

    return NextResponse.json({ received: true, success: true });
  } catch (e: any) {
    console.error("Webhook error:", e);
    return NextResponse.json({ error: e.message || "failed" }, { status: 500 });
  }
}

// Hubtel sometimes does GET to verify endpoint
export async function GET() {
  return NextResponse.json({ ok: true });
}