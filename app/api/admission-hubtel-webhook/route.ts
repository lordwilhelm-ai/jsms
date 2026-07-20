import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

async function triggerPushNotifications() {
  try {
    await fetch("https://mlpbkrukkmdlkwypunqh.supabase.co/functions/v1/send-jsms-push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ limit: 25 }),
    });
  } catch (error) {
    console.warn("Admission webhook: push trigger failed", error);
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    // Hubtel sends data inside body.Data
    const data = body?.Data || body;
    const status = data?.Status || data?.status;
    const invoiceId = data?.ClientReference || data?.clientReference;

    if (status !== "Success") {
      console.log("Admission webhook ignored. Status:", status);
      return NextResponse.json({ received: true, ignored: true });
    }

    if (!invoiceId) {
      throw new Error("Missing ClientReference in webhook");
    }

    const { data: application, error: findError } = await supabaseAdmin
      .from("admission_applications")
      .select("id, form_payment_status")
      .eq("online_payment_reference", invoiceId)
      .maybeSingle();

    if (findError) throw findError;

    if (!application) {
      console.warn("Admission webhook: no application found for reference", invoiceId);
      return NextResponse.json({ received: true, ignored: true });
    }

    if (application.form_payment_status === "paid") {
      console.log("Admission application already paid:", application.id);
      return NextResponse.json({ received: true, already_paid: true });
    }

    const { error: updateError } = await supabaseAdmin
      .from("admission_applications")
      .update({ form_payment_status: "paid" })
      .eq("id", application.id);

    if (updateError) throw updateError;

    // Best-effort — the per-transaction record isn't required for the
    // applicant's status to be correct, so don't fail the webhook over it.
    const { error: paymentUpdateError } = await supabaseAdmin
      .from("admission_payments")
      .update({ payment_status: "paid", payment_date: new Date().toISOString() })
      .eq("application_id", application.id);

    if (paymentUpdateError) {
      console.warn("Admission webhook: could not update admission_payments row", paymentUpdateError);
    }

    await triggerPushNotifications();

    console.log(`Admission application ${application.id} marked paid.`);

    return NextResponse.json({ received: true, success: true });
  } catch (e: any) {
    console.error("Admission webhook error:", e);
    return NextResponse.json({ error: e.message || "failed" }, { status: 500 });
  }
}

// Hubtel sometimes does GET to verify endpoint
export async function GET() {
  return NextResponse.json({ ok: true });
}
