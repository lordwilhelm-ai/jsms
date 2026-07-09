import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

const BILL_RATE = 2;

function cleanLower(value: unknown) { 
  return String(value || "").trim().toLowerCase(); 
}

function isActiveStudent(student: any) {
  const status = cleanLower(student.status);
  if (student.left_school === true) return false;
  if (student.is_active === false) return false;
  if (student.active === false) return false;
  if (status === "inactive" || status === "left" || status === "withdrawn") return false;
  return true;
}

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
    const { data: existingLicense } = await supabase
      .from("rc_licenses")
      .select("id, payment_status")
      .eq("invoice_id", invoiceId)
      .single();

    if (existingLicense?.payment_status === 'paid') {
      console.log("License already paid:", invoiceId);
      return NextResponse.json({ received: true, already_paid: true });
    }

    // 2. Count active students
    const { data: allStudents, error: studentError } = await supabase
      .from("students")
      .select("id,student_id,jvs_id,class_name,is_active,active,left_school,status");

    if (studentError) throw studentError;

    const activeStudents = (allStudents || []).filter(isActiveStudent);
    const studentsPaid = activeStudents.length;
    const totalAmount = studentsPaid * BILL_RATE;

    // 3. Get current academic settings
    const { data: settings } = await supabase
      .from("school_settings")
      .select("current_academic_year, current_term")
      .order("updated_at", { ascending: false })
      .limit(1)
      .single();

    // 4. Update license
    const { error: updateError } = await supabase.from("rc_licenses").update({
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