"use client";

import { useState } from "react";

type TeacherImageUploadProps = {
  label: string;
  currentUrl?: string;
  onUploadComplete: (url: string) => void;
};

export default function TeacherImageUpload({
  label,
  currentUrl = "",
  onUploadComplete,
}: TeacherImageUploadProps) {
  const [previewUrl, setPreviewUrl] = useState(currentUrl);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setError("");

    if (!file.type.startsWith("image/")) {
      setError("Please choose an image file.");
      return;
    }

    setPreviewUrl(URL.createObjectURL(file));
    setUploading(true);

    try {
      const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
      const uploadPreset = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET;

      if (!cloudName || !uploadPreset) {
        throw new Error("Cloudinary environment variables are missing.");
      }

      const formData = new FormData();
      formData.append("file", file);
      formData.append("upload_preset", uploadPreset);

      const response = await fetch(
        `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
        {
          method: "POST",
          body: formData,
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error?.message || "Upload failed.");
      }

      const uploadedUrl = data.secure_url;
      setPreviewUrl(uploadedUrl);
      onUploadComplete(uploadedUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div style={{ marginTop: "6px" }}>
      <label style={{ display: "block", marginBottom: "8px", fontWeight: 600 }}>
        {label}
      </label>

      <div
        style={{
          width: "120px",
          height: "120px",
          borderRadius: "14px",
          border: "1px solid #d1d5db",
          background: "#f9fafb",
          overflow: "hidden",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: "12px",
        }}
      >
        {previewUrl ? (
          <img
            src={previewUrl}
            alt={`${label} preview`}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : (
          <span style={{ fontSize: "12px", color: "#666" }}>No Image</span>
        )}
      </div>

      <input type="file" accept="image/*" onChange={handleFileChange} />

      {uploading && (
        <p style={{ marginTop: "8px", color: "#2563eb" }}>Uploading...</p>
      )}

      {error && <p style={{ marginTop: "8px", color: "red" }}>{error}</p>}
    </div>
  );
}
