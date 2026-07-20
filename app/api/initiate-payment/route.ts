import { NextResponse } from "next/server";
import { computeReportCardLicenseAmount } from "@/lib/reportCardLicense";
import { requireStaffRole, unauthorizedResponse } from "@/lib/apiAuth";
import { initiateHubtelCheckout } from "@/lib/hubtelCheckout";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL!; // use this one everywhere

export async function POST(req: Request) {
  try {
    const staffAuth = await requireStaffRole(req, ["owner", "admin", "headmaster"]);
    if (!staffAuth.ok) return unauthorizedResponse(staffAuth);

    const { invoiceId } = await req.json();
    const origin = req.headers.get('origin') || APP_URL;

    // Never trust a client-supplied amount for what gets charged — recompute
    // the same way the webhook later verifies it (active student count x rate).
    const { totalAmount } = await computeReportCardLicenseAmount();

    const checkoutUrl = await initiateHubtelCheckout({
      amount: totalAmount,
      description: "Jefsem Vision School - Report Card Access",
      callbackUrl: `${origin}/api/hubtel-webhook`,
      returnUrl: `${origin}/report-card/admin/checkout?paid=1`,
      cancellationUrl: `${origin}/report-card/admin/checkout?cancelled=1`,
      clientReference: invoiceId.slice(0, 32), // Hubtel max 32 chars
    });

    return NextResponse.json({ checkoutUrl });
  } catch (e: any) {
    console.error("INITIATE ERROR:", e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}