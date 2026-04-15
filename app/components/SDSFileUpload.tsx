"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type SDSFileUploadProps = {
  label: string;
  value: string;
  folder?: string;
  accept?: string;
  onUploaded: (url: string) => void;
};

function isImageUrl(url: string) {
  return /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(url);
}

function isImageAccept(accept: string) {
  return accept.includes("image/");
}

export default function SDSFileUpload({
  label,
  value,
  folder = "jsms/sds",
  accept = "*/*",
  onUploaded,
}: SDSFileUploadProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");

  const [cameraOpen, setCameraOpen] = useState(false);
  const [startingCamera, setStartingCamera] = useState(false);
  const [cameraSupported, setCameraSupported] = useState(false);

  const canUseCamera = useMemo(() => {
    return (
      typeof window !== "undefined" &&
      typeof navigator !== "undefined" &&
      !!navigator.mediaDevices &&
      !!navigator.mediaDevices.getUserMedia &&
      isImageAccept(accept)
    );
  }, [accept]);

  useEffect(() => {
    setCameraSupported(canUseCamera);
  }, [canUseCamera]);

  useEffect(() => {
    return () => {
      stopCamera();
      if (previewUrl && previewUrl.startsWith("blob:")) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  function resetSelectedFile(nextFile: File | null) {
    if (previewUrl && previewUrl.startsWith("blob:")) {
      URL.revokeObjectURL(previewUrl);
    }

    setSelectedFile(nextFile);

    if (nextFile && nextFile.type.startsWith("image/")) {
      setPreviewUrl(URL.createObjectURL(nextFile));
    } else {
      setPreviewUrl("");
    }
  }

  function handleChooseFile(file: File | null) {
    setMessage("");
    resetSelectedFile(file);
  }

  async function handleUpload() {
    if (!selectedFile) {
      setMessage("Select or capture a file first.");
      return;
    }

    try {
      setUploading(true);
      setMessage("");

      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("folder", folder);

      const res = await fetch("/api/sds-upload", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || "Upload failed.");
      }

      const url = String(data.secure_url || "");
      onUploaded(url);
      setMessage("Uploaded successfully.");

      resetSelectedFile(null);

      if (fileInputRef.current) fileInputRef.current.value = "";
      if (cameraInputRef.current) cameraInputRef.current.value = "";
    } catch (error) {
      console.error(error);
      setMessage(
        error instanceof Error ? `Error: ${error.message}` : "Error uploading file."
      );
    } finally {
      setUploading(false);
    }
  }

  async function openCamera() {
    if (!canUseCamera) {
      setMessage("Camera is not supported on this device/browser.");
      return;
    }

    try {
      setStartingCamera(true);
      setMessage("");

      stopCamera();

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false,
      });

      streamRef.current = stream;
      setCameraOpen(true);

      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play();
        }
      }, 0);
    } catch (error) {
      console.error(error);
      setMessage(
        "Error: Could not open camera. Use Choose File or Take Photo instead."
      );
      setCameraOpen(false);
    } finally {
      setStartingCamera(false);
    }
  }

  function stopCamera() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setCameraOpen(false);
  }

  async function takeSnapshot() {
    try {
      const video = videoRef.current;
      const canvas = canvasRef.current;

      if (!video || !canvas) {
        setMessage("Error: Camera is not ready.");
        return;
      }

      const width = video.videoWidth;
      const height = video.videoHeight;

      if (!width || !height) {
        setMessage("Error: Camera preview is not ready.");
        return;
      }

      canvas.width = width;
      canvas.height = height;

      const context = canvas.getContext("2d");
      if (!context) {
        setMessage("Error: Could not access camera canvas.");
        return;
      }

      context.drawImage(video, 0, 0, width, height);

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((result) => resolve(result), "image/jpeg", 0.92)
      );

      if (!blob) {
        setMessage("Error: Failed to capture image.");
        return;
      }

      const file = new File([blob], `${label.toLowerCase().replace(/\s+/g, "-")}.jpg`, {
        type: "image/jpeg",
      });

      resetSelectedFile(file);
      setMessage("Photo captured. Upload it when ready.");
      stopCamera();
    } catch (error) {
      console.error(error);
      setMessage("Error: Failed to capture photo.");
    }
  }

  const currentPreview = selectedFile ? previewUrl : value;

  return (
    <div
      style={{
        border: "1px solid #e5e7eb",
        borderRadius: "14px",
        padding: "14px",
        background: "#fafafa",
      }}
    >
      <label
        style={{
          display: "block",
          fontWeight: 700,
          fontSize: "14px",
          marginBottom: "10px",
          color: "#111827",
        }}
      >
        {label}
      </label>

      {currentPreview ? (
        <div style={{ marginBottom: "12px" }}>
          {isImageUrl(currentPreview) || (selectedFile && selectedFile.type.startsWith("image/")) ? (
            <img
              src={currentPreview}
              alt={label}
              style={{
                width: "100%",
                maxWidth: "220px",
                height: "160px",
                objectFit: "cover",
                borderRadius: "12px",
                border: "1px solid #ddd",
                display: "block",
                marginBottom: "8px",
              }}
            />
          ) : (
            <a
              href={currentPreview}
              target="_blank"
              rel="noreferrer"
              style={{
                color: "#b45309",
                fontWeight: 700,
                textDecoration: "none",
                wordBreak: "break-all",
              }}
            >
              View current file
            </a>
          )}
        </div>
      ) : (
        <p style={{ margin: "0 0 12px", color: "#6b7280", fontSize: "13px" }}>
          No file uploaded yet.
        </p>
      )}

      {cameraOpen && (
        <div
          style={{
            marginBottom: "12px",
            border: "1px solid #e5e7eb",
            borderRadius: "12px",
            padding: "10px",
            background: "#ffffff",
          }}
        >
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            style={{
              width: "100%",
              maxWidth: "320px",
              borderRadius: "10px",
              background: "#000000",
              display: "block",
              marginBottom: "10px",
            }}
          />

          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={takeSnapshot}
              style={darkButtonStyle}
            >
              Take Snapshot
            </button>

            <button
              type="button"
              onClick={stopCamera}
              style={lightButtonStyle}
            >
              Close Camera
            </button>
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginBottom: "10px" }}>
        {cameraSupported && (
          <button
            type="button"
            onClick={openCamera}
            disabled={startingCamera || cameraOpen}
            style={darkButtonStyle}
          >
            {startingCamera ? "Opening Camera..." : "Open Camera"}
          </button>
        )}

        {isImageAccept(accept) && (
          <>
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(e) => handleChooseFile(e.target.files?.[0] || null)}
              style={{ display: "none" }}
            />

            <button
              type="button"
              onClick={() => cameraInputRef.current?.click()}
              style={lightButtonStyle}
            >
              Take Photo
            </button>
          </>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept={accept}
          onChange={(e) => handleChooseFile(e.target.files?.[0] || null)}
          style={{ display: "none" }}
        />

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          style={lightButtonStyle}
        >
          Choose File
        </button>

        <button
          type="button"
          onClick={handleUpload}
          disabled={uploading}
          style={uploadButtonStyle}
        >
          {uploading ? "Uploading..." : "Upload"}
        </button>
      </div>

      {selectedFile && (
        <p
          style={{
            margin: "10px 0 0",
            fontSize: "12px",
            color: "#374151",
            wordBreak: "break-word",
          }}
        >
          Selected: {selectedFile.name}
        </p>
      )}

      {message && (
        <p
          style={{
            margin: "10px 0 0",
            fontSize: "12px",
            color: message.startsWith("Error:") ? "#b91c1c" : "#065f46",
            fontWeight: 700,
          }}
        >
          {message}
        </p>
      )}

      <canvas ref={canvasRef} style={{ display: "none" }} />
    </div>
  );
}

const darkButtonStyle: React.CSSProperties = {
  border: "none",
  background: "#111827",
  color: "#ffffff",
  borderRadius: "12px",
  padding: "10px 14px",
  fontWeight: 700,
  fontSize: "13px",
  cursor: "pointer",
};

const lightButtonStyle: React.CSSProperties = {
  border: "1px solid #d1d5db",
  background: "#ffffff",
  color: "#111827",
  borderRadius: "12px",
  padding: "10px 14px",
  fontWeight: 700,
  fontSize: "13px",
  cursor: "pointer",
};

const uploadButtonStyle: React.CSSProperties = {
  border: "none",
  background: "#f59e0b",
  color: "#111827",
  borderRadius: "12px",
  padding: "10px 14px",
  fontWeight: 700,
  fontSize: "13px",
  cursor: "pointer",
};
