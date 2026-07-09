import { NextResponse } from "next/server";

const HUBTEL_CLIENT_ID = process.env.HUBTEL_CLIENT_ID!;
const HUBTEL_CLIENT_SECRET = process.env.HUBTEL_CLIENT_SECRET!;
const HUBTEL_MERCHANT_ACCOUNT = process.env.HUBTEL_MERCHANT_ACCOUNT!;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL!; // use this one everywhere

export async function POST(req: Request) {
  try {
    const { amount, invoiceId } = await req.json();
    const origin = req.headers.get('origin') || APP_URL;
    const auth = Buffer.from(`${HUBTEL_CLIENT_ID}:${HUBTEL_CLIENT_SECRET}`).toString('base64');

    const payload = {
      totalAmount: Number(Number(amount).toFixed(2)), // safer
      description: "Jefsem Vision School - Report Card Access",
      callbackUrl: `${origin}/api/hubtel-webhook`,
      returnUrl: `${origin}/report-card/admin/checkout?paid=1`,
      cancellationUrl: `${origin}/report-card/admin/checkout?cancelled=1`,
      merchantAccountNumber: HUBTEL_MERCHANT_ACCOUNT,
      clientReference: invoiceId.slice(0, 32) // Hubtel max 32 chars
    };

    console.log("INITIATE PAYLOAD:", payload); // so we can see it in Vercel logs

    const res = await fetch("https://payproxyapi.hubtel.com/items/initiate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Basic ${auth}`,
        "Cache-Control": "no-cache"
      },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    console.log("HUBTEL RESPONSE:", data); // log what Hubtel returns

    if (data.responseCode !== "0000") throw new Error(data.message || JSON.stringify(data));
    
    return NextResponse.json({ checkoutUrl: data.data.checkoutUrl });
  } catch (e: any) {
    console.error("INITIATE ERROR:", e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}