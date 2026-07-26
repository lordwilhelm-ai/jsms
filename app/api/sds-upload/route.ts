import { NextResponse } from "next/server";
import crypto from "crypto";
import { requireStaffRole, unauthorizedResponse } from "@/lib/apiAuth";

function getEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return value;
}

const DEFAULT_FOLDER = "jsms/sds";

// The Cloudinary folder must not be taken verbatim from the client — any
// staff caller (including the "teacher" role, which this route accepts)
// could otherwise point uploads at an arbitrary path in the account. Only
// the folders actually used by SDS upload callers (app/(protected)/sds/...)
// are allowed; anything else falls back to the default.
const ALLOWED_FOLDERS = new Set([
  DEFAULT_FOLDER,
  "jsms/sds/student-photos",
  "jsms/sds/nhis",
  "jsms/sds/weighing-card",
  "jsms/sds/other-documents",
]);

function resolveFolder(requested: unknown) {
  const value = String(requested || "").trim();
  return ALLOWED_FOLDERS.has(value) ? value : DEFAULT_FOLDER;
}

export async function POST(req: Request) {
  try {
    const auth = await requireStaffRole(req, ["owner", "admin", "headmaster", "teacher"]);
    if (!auth.ok) return unauthorizedResponse(auth);

    const cloudName = getEnv("CLOUDINARY_CLOUD_NAME");
    const apiKey = getEnv("CLOUDINARY_API_KEY");
    const apiSecret = getEnv("CLOUDINARY_API_SECRET");

    const formData = await req.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file uploaded." }, { status: 400 });
    }

    const folder = resolveFolder(formData.get("folder"));
    const timestamp = Math.floor(Date.now() / 1000).toString();

    const paramsToSign = `folder=${folder}&timestamp=${timestamp}${apiSecret}`;
    const signature = crypto
      .createHash("sha1")
      .update(paramsToSign)
      .digest("hex");

    const cloudinaryForm = new FormData();
    cloudinaryForm.append("file", file);
    cloudinaryForm.append("api_key", apiKey);
    cloudinaryForm.append("timestamp", timestamp);
    cloudinaryForm.append("folder", folder);
    cloudinaryForm.append("signature", signature);

    const uploadRes = await fetch(
      `https://api.cloudinary.com/v1_1/${cloudName}/auto/upload`,
      {
        method: "POST",
        body: cloudinaryForm,
      }
    );

    const uploadData = await uploadRes.json();

    if (!uploadRes.ok) {
      return NextResponse.json(
        { error: uploadData?.error?.message || "Upload failed." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      secure_url: uploadData.secure_url,
      public_id: uploadData.public_id,
      resource_type: uploadData.resource_type,
      original_filename: uploadData.original_filename,
    });
  } catch (error) {
    console.error("SDS upload error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unexpected upload error.",
      },
      { status: 500 }
    );
  }
}
