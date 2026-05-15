import { NextResponse } from "next/server";

type SmsRecipient = {
  phone?: string;
  dest_addr?: string;
  message?: string;
  recipientId?: string;
  recipient_id?: string;
  referenceId?: string;
  reference_id?: string;
  studentName?: string;
  studentId?: string;
};

function cleanPhone(phone: string) {
  if (!phone) return "";

  let value = String(phone).trim();

  value = value.replace(/\s+/g, "");
  value = value.replace(/-/g, "");
  value = value.replace(/\(/g, "");
  value = value.replace(/\)/g, "");

  if (value.startsWith("+")) {
    value = value.slice(1);
  }

  // Ghana local: 024XXXXXXX -> 23324XXXXXXX
  if (value.startsWith("0") && value.length === 10) {
    value = `233${value.slice(1)}`;
  }

  // Ghana without 0: 24XXXXXXX -> 23324XXXXXXX
  if (value.length === 9 && !value.startsWith("233")) {
    value = `233${value}`;
  }

  return value;
}

function makeReferenceId(index: number, recipient?: SmsRecipient) {
  const base =
    recipient?.reference_id ||
    recipient?.referenceId ||
    recipient?.recipient_id ||
    recipient?.recipientId ||
    recipient?.studentId ||
    `JSMS-${Date.now()}-${index + 1}`;

  return String(base)
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .slice(0, 50);
}

async function sendOneBeemSms(params: {
  phone: string;
  message: string;
  recipientId: string;
  referenceId: string;
  studentName?: string;
  studentId?: string;
}) {
  const apiKey = process.env.BEEM_API_KEY;
  const secretKey = process.env.BEEM_SECRET_KEY;
  const sourceAddr = process.env.BEEM_SOURCE_ADDR || "Froove";
  const smsUrl =
    process.env.BEEM_SMS_URL || "https://apisms.beem.africa/v1/send";

  if (!apiKey || !secretKey) {
    throw new Error("Missing BEEM_API_KEY or BEEM_SECRET_KEY.");
  }

  const cleanedPhone = cleanPhone(params.phone);

  if (!cleanedPhone) {
    return {
      ok: false,
      status: 400,
      count: 1,
      recipients: [
        {
          phone: params.phone,
          dest_addr: cleanedPhone,
          studentName: params.studentName || "",
          studentId: params.studentId || "",
        },
      ],
      response: {
        message: "Invalid phone number.",
      },
    };
  }

  const auth = Buffer.from(`${apiKey}:${secretKey}`).toString("base64");

  const payload = {
    source_addr: sourceAddr,
    encoding: 0,
    schedule_time: "",
    message: params.message,
    recipients: [
      {
        recipient_id: params.recipientId,
        reference_id: params.referenceId,
        dest_addr: cleanedPhone,
      },
    ],
  };

  const response = await fetch(smsUrl, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
  });

  const text = await response.text();

  let data: any;

  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }

  return {
    ok: response.ok,
    status: response.status,
    count: 1,
    recipients: [
      {
        phone: cleanedPhone,
        dest_addr: cleanedPhone,
        studentName: params.studentName || "",
        studentId: params.studentId || "",
      },
    ],
    response: data,
  };
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const defaultMessage = String(body?.message || "").trim();

    const recipients: SmsRecipient[] = Array.isArray(body?.recipients)
      ? body.recipients
      : [];

    if (!recipients.length) {
      return NextResponse.json(
        {
          ok: false,
          total: 0,
          sent: 0,
          failed: 0,
          message: "No recipients provided.",
        },
        { status: 400 }
      );
    }

    const cleanedRecipients = recipients
      .map((recipient, index) => {
        const phone = cleanPhone(
          String(recipient.phone || recipient.dest_addr || "")
        );

        const message = String(recipient.message || defaultMessage || "").trim();

        const referenceId = makeReferenceId(index, recipient);

        return {
          phone,
          message,
          recipientId: String(
            recipient.recipient_id ||
              recipient.recipientId ||
              referenceId ||
              index + 1
          ),
          referenceId,
          studentName: String(recipient.studentName || ""),
          studentId: String(recipient.studentId || ""),
        };
      })
      .filter((item) => item.phone && item.message);

    if (!cleanedRecipients.length) {
      return NextResponse.json(
        {
          ok: false,
          total: 0,
          sent: 0,
          failed: 0,
          message: "No valid phone numbers or messages found.",
        },
        { status: 400 }
      );
    }

    const results = [];

    for (let i = 0; i < cleanedRecipients.length; i++) {
      const recipient = cleanedRecipients[i];

      const result = await sendOneBeemSms({
        phone: recipient.phone,
        message: recipient.message,
        recipientId: recipient.recipientId,
        referenceId: recipient.referenceId,
        studentName: recipient.studentName,
        studentId: recipient.studentId,
      });

      results.push(result);
    }

    const sent = results.filter((item) => item.ok).length;
    const failed = results.length - sent;

    return NextResponse.json({
      ok: failed === 0,
      total: results.length,
      sent,
      failed,
      results,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        ok: false,
        total: 0,
        sent: 0,
        failed: 0,
        message: error?.message || "Failed to send SMS.",
      },
      { status: 500 }
    );
  }
}