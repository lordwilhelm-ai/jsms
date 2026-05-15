import { NextResponse } from "next/server";

type SmsRecipient = {
  phone?: string;
  dest_addr?: string;
  message?: string;
  studentName?: string;
  studentId?: string;
};

function cleanPhone(phone: string) {
  let value = String(phone || "").trim();

  value = value.replace(/\s+/g, "");
  value = value.replace(/-/g, "");
  value = value.replace(/\(/g, "");
  value = value.replace(/\)/g, "");

  if (value.startsWith("+")) value = value.slice(1);

  if (value.startsWith("0") && value.length === 10) {
    value = `233${value.slice(1)}`;
  }

  if (value.length === 9 && !value.startsWith("233")) {
    value = `233${value}`;
  }

  return value;
}

async function readJsonSafe(response: Response) {
  const text = await response.text();

  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

export async function POST(request: Request) {
  try {
    const apiKey = process.env.BEEM_API_KEY;
    const secretKey = process.env.BEEM_SECRET_KEY;
    const sourceAddr = process.env.BEEM_SOURCE_ADDR || "Froove";
    const smsUrl =
      process.env.BEEM_SMS_URL || "https://apisms.beem.africa/v1/send";

    if (!apiKey || !secretKey) {
      return NextResponse.json(
        {
          ok: false,
          message: "Missing BEEM_API_KEY or BEEM_SECRET_KEY.",
        },
        { status: 500 }
      );
    }

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
      .map((recipient) => {
        const phone = cleanPhone(
          String(recipient.phone || recipient.dest_addr || "")
        );

        const message = String(recipient.message || defaultMessage || "").trim();

        return {
          phone,
          message,
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
          message: "No valid recipients found.",
        },
        { status: 400 }
      );
    }

    const auth = Buffer.from(`${apiKey}:${secretKey}`).toString("base64");

    const results = [];

    for (const recipient of cleanedRecipients) {
      const payload = {
        source_addr: sourceAddr,
        encoding: 0,
        schedule_time: "",
        message: recipient.message,
        recipients: [
          {
            recipient_id: 1,
            dest_addr: recipient.phone,
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

      const data = await readJsonSafe(response);

      results.push({
        ok: response.ok,
        status: response.status,
        count: 1,
        recipients: [
          {
            phone: recipient.phone,
            dest_addr: recipient.phone,
            studentName: recipient.studentName,
            studentId: recipient.studentId,
          },
        ],
        response: data,
      });
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