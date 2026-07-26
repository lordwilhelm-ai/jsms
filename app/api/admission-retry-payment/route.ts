import { NextResponse } from "next/server";
import crypto from "crypto";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { appendWebhookSignature, initiateHubtelCheckout } from "@/lib/hubtelCheckout";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL!;

export async function POST(req: Request) {
  try {
    const { applicationId } = await req.json();
    const origin = req.headers.get("origin") || APP_URL;

    if (!applicationId) {
      return NextResponse.json({ error: "Missing applicationId." }, { status: 400 });
    }

    const { data: application, error: fetchError } = await supabaseAdmin
      .from("admission_applications")
      .select("id, student_name, form_price, form_payment_status")
      .eq("id", applicationId)
      .maybeSingle();

    if (fetchError) throw fetchError;
    if (!application) {
      return NextResponse.json({ error: "Application not found." }, { status: 404 });
    }

    if (application.form_payment_status === "paid") {
      return NextResponse.json({ error: "This application has already been paid for." }, { status: 400 });
    }

    const formPrice = Number(application.form_price || 0);
    if (formPrice <= 0) {
      return NextResponse.json({ error: "Nothing to pay for this application." }, { status: 400 });
    }

    const invoiceId = `JVS-ADM-${crypto.randomBytes(16).toString("base64url")}`;

    const { error: refError } = await supabaseAdmin
      .from("admission_applications")
      .update({ online_payment_reference: invoiceId })
      .eq("id", applicationId);

    if (refError) throw refError;

    const checkoutUrl = await initiateHubtelCheckout({
      amount: formPrice,
      description: `Jefsem Vision School - Admission Form (${application.student_name || ""})`,
      callbackUrl: appendWebhookSignature(`${origin}/api/admission-hubtel-webhook`, invoiceId),
      returnUrl: `${origin}/website/admission?paid=1&app=${applicationId}`,
      cancellationUrl: `${origin}/website/admission?cancelled=1&app=${applicationId}`,
      clientReference: invoiceId,
    });

    return NextResponse.json({ checkoutUrl });
  } catch (error) {
    console.error("Admission retry payment error:", error);
    const message =
      error instanceof Error
        ? error.message
        : String((error as Record<string, any>)?.message || "Failed to start payment.");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
