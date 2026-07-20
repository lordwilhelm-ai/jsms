const HUBTEL_CLIENT_ID = process.env.HUBTEL_CLIENT_ID!;
const HUBTEL_CLIENT_SECRET = process.env.HUBTEL_CLIENT_SECRET!;
const HUBTEL_MERCHANT_ACCOUNT = process.env.HUBTEL_MERCHANT_ACCOUNT!;

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
