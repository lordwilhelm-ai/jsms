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

    const ext = (file.name.split(".").pop() || "file").replace(/[^a-zA-Z0-9]/g, "");
    const tempId = crypto.randomBytes(12).toString("hex");
    const path = `online-temp/${tempId}/${field}.${ext}`;

    const { error: uploadError } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(path, file, { upsert: true, contentType: file.type || undefined });

    if (uploadError) throw uploadError;

    const { data } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(path);

    return NextResponse.json({ url: data.publicUrl });
  } catch (error) {
    console.error("Admission upload error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Upload failed." },
      { status: 500 }
    );
  }
}
