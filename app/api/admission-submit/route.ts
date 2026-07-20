import { NextResponse } from "next/server";
import crypto from "crypto";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { initiateHubtelCheckout } from "@/lib/hubtelCheckout";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL!;

function text(value: unknown) {
  const clean = String(value || "").trim();
  return clean || null;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const origin = req.headers.get("origin") || APP_URL;

    const studentName = text(body.student_name);
    const classApplying = text(body.class_applying);
    const payerName = text(body.payer_name);
    const payerPhone = text(body.payer_phone);

    if (!studentName || !classApplying) {
      return NextResponse.json({ error: "Student name and class applying for are required." }, { status: 400 });
    }
    if (!payerName || !payerPhone) {
      return NextResponse.json({ error: "Payer name and phone are required." }, { status: 400 });
    }

    // Never trust a client-supplied price — this is what gets charged.
    const { data: settings, error: settingsError } = await supabaseAdmin
      .from("admission_settings")
      .select("form_price, online_admission_open")
      .limit(1)
      .maybeSingle();

    if (settingsError) throw settingsError;

    if (settings && settings.online_admission_open === false) {
      return NextResponse.json({ error: "Online admissions are currently closed." }, { status: 400 });
    }

    const formPrice = Number(settings?.form_price || 0);

    const { data: rpcData, error: rpcError } = await supabaseAdmin.rpc(
      "create_online_admission_application",
      {
        p_student_name: studentName,
        p_class_applying: classApplying,

        p_gender: text(body.gender),
        p_date_of_birth: text(body.date_of_birth),
        p_address: text(body.address),

        p_father_name: text(body.father_name),
        p_father_address: text(body.father_address),
        p_father_phone: text(body.father_phone),

        p_mother_name: text(body.mother_name),
        p_mother_address: text(body.mother_address),
        p_mother_phone: text(body.mother_phone),

        p_stays_with: text(body.stays_with),

        p_guardian_name: text(body.guardian_name),
        p_guardian_address: text(body.guardian_address),
        p_guardian_phone: text(body.guardian_phone),
        p_guardian_relationship: text(body.guardian_relationship),

        p_nhis_number: text(body.nhis_number),

        p_photo_url: text(body.photo_url),
        p_nhis_card_url: text(body.nhis_card_url),
        p_weighing_card_url: text(body.weighing_card_url),
        p_birth_certificate_url: text(body.birth_certificate_url),
        p_document_1_url: text(body.document_1_url),
        p_document_2_url: text(body.document_2_url),
        p_document_3_url: text(body.document_3_url),

        p_amount: formPrice,
        p_payment_method: "hubtel",
        p_payment_status: "pending",
        p_payer_name: payerName,
        p_payer_phone: payerPhone,
        p_payment_reference: null,
        p_paystack_reference: null,
      }
    );

    if (rpcError) throw rpcError;

    const row = Array.isArray(rpcData) ? rpcData[0] : rpcData;
    const applicationId = row?.application_id;

    if (!applicationId) {
      throw new Error("Application was not created.");
    }

    if (formPrice <= 0) {
      // Nothing to charge — treat as already paid so the flow doesn't try to
      // start a GHS 0 Hubtel checkout.
      await supabaseAdmin
        .from("admission_applications")
        .update({ form_payment_status: "paid" })
        .eq("id", applicationId);

      return NextResponse.json({
        applicationId,
        checkoutUrl: null,
        studentId: row.student_id,
        receiptNumber: row.receipt_number,
        amount: formPrice,
      });
    }

    const invoiceId = `JVS-ADM-${crypto.randomBytes(16).toString("base64url")}`;

    const { error: refError } = await supabaseAdmin
      .from("admission_applications")
      .update({ online_payment_reference: invoiceId })
      .eq("id", applicationId);

    if (refError) throw refError;

    const checkoutUrl = await initiateHubtelCheckout({
      amount: formPrice,
      description: `Jefsem Vision School - Admission Form (${studentName})`,
      callbackUrl: `${origin}/api/admission-hubtel-webhook`,
      returnUrl: `${origin}/website/admission?paid=1&app=${applicationId}`,
      cancellationUrl: `${origin}/website/admission?cancelled=1&app=${applicationId}`,
      clientReference: invoiceId,
    });

    return NextResponse.json({ applicationId, checkoutUrl });
  } catch (error) {
    console.error("Admission submit error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to submit admission form." },
      { status: 500 }
    );
  }
}
