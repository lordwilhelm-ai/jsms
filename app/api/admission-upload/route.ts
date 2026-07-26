import { NextResponse } from "next/server";
import crypto from "crypto";
import { supabaseAdmin } from "@/lib/supabase-admin";

const BUCKET = "admission-documents";

const ALLOWED_FIELDS = new Set([
  "photo_url",
  "nhis_card_url",
  "weighing_card_url",
  "birth_certificate_url",
  "document_1_url",
  "document_2_url",
  "document_3_url",
]);

// This endpoint is intentionally public (no session), so it's a target for
// storage-abuse: unlimited size and "trust the filename extension" both let
// anyone dump arbitrary large/arbitrary-type files into paid storage. Cap the
// size and sniff the real file type from its magic bytes instead of trusting
// the client-supplied name/content-type — matches what the admission form
// actually asks applicants for (photos + scanned documents).
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

const ALLOWED_SIGNATURES: { mime: string; ext: string; check: (buf: Buffer) => boolean }[] = [
  {
    mime: "image/jpeg",
    ext: "jpg",
    check: (buf) => buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff,
  },
  {
    mime: "image/png",
    ext: "png",
    check: (buf) =>
      buf.length >= 8 &&
      buf[0] === 0x89 &&
      buf[1] === 0x50 &&
      buf[2] === 0x4e &&
      buf[3] === 0x47 &&
      buf[4] === 0x0d &&
      buf[5] === 0x0a &&
      buf[6] === 0x1a &&
      buf[7] === 0x0a,
  },
  {
    mime: "image/gif",
    ext: "gif",
    check: (buf) =>
      buf.length >= 6 &&
      (buf.toString("ascii", 0, 6) === "GIF87a" || buf.toString("ascii", 0, 6) === "GIF89a"),
  },
  {
    mime: "image/webp",
    ext: "webp",
    check: (buf) =>
      buf.length >= 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP",
  },
  {
    mime: "application/pdf",
    ext: "pdf",
    check: (buf) => buf.length >= 4 && buf.toString("ascii", 0, 4) === "%PDF",
  },
];

function detectFileType(buffer: Buffer) {
  return ALLOWED_SIGNATURES.find((sig) => sig.check(buffer)) || null;
}

// Public applicants have no Supabase session, so they can't satisfy this
// bucket's storage RLS policy directly from the browser. Upload here instead,
// server-side with the service role key, which bypasses that RLS entirely.
export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get("file");
    const field = String(formData.get("field") || "");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file uploaded." }, { status: 400 });
    }

    if (!ALLOWED_FIELDS.has(field)) {
      return NextResponse.json({ error: "Invalid upload field." }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json({ error: "File is too large. Maximum size is 10MB." }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const detected = detectFileType(buffer);

    if (!detected) {
      return NextResponse.json(
        { error: "Unsupported file type. Upload a JPG, PNG, GIF, WEBP image or a PDF." },
        { status: 400 }
      );
    }

    const tempId = crypto.randomBytes(12).toString("hex");
    const path = `online-temp/${tempId}/${field}.${detected.ext}`;

    const { error: uploadError } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(path, buffer, { upsert: true, contentType: detected.mime });

    if (uploadError) throw uploadError;

    const { data } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(path);

    return NextResponse.json({ url: data.publicUrl });
  } catch (error) {
    console.error("Admission upload error:", error);
    const message =
      error instanceof Error
        ? error.message
        : String((error as Record<string, any>)?.message || "Upload failed.");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
