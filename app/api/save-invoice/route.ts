import { NextResponse } from "next/server";
import crypto from "crypto";
import { supabase } from "@/lib/supabase";
import { computeReportCardLicenseAmount } from "@/lib/reportCardLicense";
import { requireStaffRole, unauthorizedResponse } from "@/lib/apiAuth";

export async function POST(req: Request) {
  const auth = await requireStaffRole(req, ["owner", "admin", "headmaster"]);
  if (!auth.ok) return unauthorizedResponse(auth);

  const { licenseId } = await req.json();
  if (!licenseId) {
    return NextResponse.json({ error: "Missing licenseId" }, { status: 400 });
  }

  try {
    // invoiceId and amount are both generated/computed server-side — never trust
    // client input here, since this value is what the Hubtel webhook later uses
    // to find and mark a license paid.
    const { totalAmount } = await computeReportCardLicenseAmount();
    const invoiceId = `JVS-RC-${crypto.randomBytes(16).toString("base64url")}`;

    const { error } = await supabase
      .from("rc_licenses")
      .update({ invoice_id: invoiceId, amount: totalAmount, payment_status: 'pending' })
      .eq("id", licenseId);

    if (error) throw error;

    return NextResponse.json({ invoiceId, amount: totalAmount });
  } catch (error) {
    console.error("Save invoice error:", error);
    return NextResponse.json({ error: "Failed to save invoice." }, { status: 500 });
  }
}