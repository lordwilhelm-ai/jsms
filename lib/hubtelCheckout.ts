import { createHmac, timingSafeEqual } from "crypto";

const HUBTEL_CLIENT_ID = process.env.HUBTEL_CLIENT_ID!;
const HUBTEL_CLIENT_SECRET = process.env.HUBTEL_CLIENT_SECRET!;
const HUBTEL_MERCHANT_ACCOUNT = process.env.HUBTEL_MERCHANT_ACCOUNT!;

// Hubtel's hosted checkout does not sign its webhook callbacks, so anyone who
// learns/guesses a clientReference could otherwise POST a fake "Success"
// payload straight to our webhook and get something marked paid for free.
// Since callbackUrl is set by US at checkout-initiation time and Hubtel just
// echoes it back verbatim, we embed an HMAC of the reference (keyed on our
// already-server-only Hubtel client secret) as a query param, then require
// the webhook to present the matching signature before trusting its body.
export function signHubtelReference(reference: string) {
  return createHmac("sha256", HUBTEL_CLIENT_SECRET).update(reference).digest("hex");
}

export function appendWebhookSignature(callbackUrl: string, reference: string) {
  const sig = signHubtelReference(reference);
  const separator = callbackUrl.includes("?") ? "&" : "?";
  return `${callbackUrl}${separator}sig=${sig}`;
}

export function verifyHubtelWebhookSignature(reference: string, providedSig: string | null) {
  if (!providedSig) return false;

  const expected = signHubtelReference(reference);
  const expectedBuf = Buffer.from(expected, "hex");
  const providedBuf = Buffer.from(providedSig, "hex");

  if (expectedBuf.length !== providedBuf.length) return false;
  return timingSafeEqual(expectedBuf, providedBuf);
}

type InitiateCheckoutParams = {
  amount: number;
  description: string;
  callbackUrl: string;
  returnUrl: string;
  cancellationUrl: string;
  clientReference: string;
};

// Starts a Hubtel hosted-checkout session and returns the URL to redirect the
// browser to. clientReference must be <= 32 chars (Hubtel's own limit).
export async function initiateHubtelCheckout(params: InitiateCheckoutParams) {
  const hubtelAuth = Buffer.from(`${HUBTEL_CLIENT_ID}:${HUBTEL_CLIENT_SECRET}`).toString("base64");

  const payload = {
    totalAmount: Number(params.amount.toFixed(2)),
    description: params.description,
    callbackUrl: params.callbackUrl,
    returnUrl: params.returnUrl,
    cancellationUrl: params.cancellationUrl,
    merchantAccountNumber: HUBTEL_MERCHANT_ACCOUNT,
    clientReference: params.clientReference,
  };

  const res = await fetch("https://payproxyapi.hubtel.com/items/initiate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${hubtelAuth}`,
      "Cache-Control": "no-cache",
    },
    body: JSON.stringify(payload),
  });

  const data = await res.json();

  if (data.responseCode !== "0000") {
    throw new Error(data.message || "Failed to start payment with Hubtel.");
  }

  return data.data.checkoutUrl as string;
}
