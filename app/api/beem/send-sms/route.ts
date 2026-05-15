import { NextRequest, NextResponse } from "next/server";

type SmsMessage = {
  phone: string;
  message: string;
  studentName?: string;
  studentId?: string;
};

function cleanPhoneForBeem(phone: string) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("233")) return digits;
  if (digits.startsWith("0") && digits.length === 10) return `233${digits.slice(1)}`;
  if (digits.length === 9) return `233${digits}`;
  return digits;
}

function chunkArray<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.BEEM_API_KEY;
    const secretKey = process.env.BEEM_SECRET_KEY;
    const sourceAddr = process.env.BEEM_SOURCE_ADDR || "JEFSEM";
    const smsUrl = process.env.BEEM_SMS_URL || "https://apisms.beem.africa/v1/send";

    if (!apiKey || !secretKey) {
      return NextResponse.json(
        { ok: false, error: "Missing BEEM_API_KEY or BEEM_SECRET_KEY in environment variables." },
        { status: 500 }
      );
    }

    const body = await req.json();
    const messages: SmsMessage[] = Array.isArray(body?.messages) ? body.messages : [];

    const cleaned = messages
      .map((item, index) => ({
        ...item,
        id: String(index + 1),
        dest_addr: cleanPhoneForBeem(item.phone),
        message: String(item.message || "").trim(),
      }))
      .filter((item) => item.dest_addr && item.message);

    if (!cleaned.length) {
      return NextResponse.json({ ok: false, error: "No valid recipients/messages found." }, { status: 400 });
    }

    const auth = Buffer.from(`${apiKey}:${secretKey}`).toString("base64");
    const results: any[] = [];

    /*
      Beem accepts one message body per request. Since school fee reminders are personalised
      per student, we group recipients with identical messages and send each group in batches.
    */
    const grouped = new Map<string, typeof cleaned>();
    cleaned.forEach((item) => {
      const list = grouped.get(item.message) || [];
      list.push(item);
      grouped.set(item.message, list);
    });

    for (const [message, group] of grouped.entries()) {
      const chunks = chunkArray(group, 100);

      for (const chunk of chunks) {
        const payload = {
          source_addr: sourceAddr,
          schedule_time: "",
          encoding: 0,
          message,
          recipients: chunk.map((item, index) => ({
            recipient_id: item.studentId || item.id || String(index + 1),
            dest_addr: item.dest_addr,
          })),
        };

        const response = await fetch(smsUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Basic ${auth}`,
          },
          body: JSON.stringify(payload),
        });

        const text = await response.text();
        let data: any = null;
        try {
          data = text ? JSON.parse(text) : null;
        } catch {
          data = { raw: text };
        }

        results.push({
          ok: response.ok,
          status: response.status,
          count: chunk.length,
          recipients: chunk.map((item) => ({
            phone: item.phone,
            dest_addr: item.dest_addr,
            studentName: item.studentName,
            studentId: item.studentId,
          })),
          response: data,
        });
      }
    }

    const sent = results.filter((item) => item.ok).reduce((sum, item) => sum + item.count, 0);
    const failed = cleaned.length - sent;

    return NextResponse.json({
      ok: failed === 0,
      total: cleaned.length,
      sent,
      failed,
      results,
    });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message || "Failed to send SMS." },
      { status: 500 }
    );
  }
}
