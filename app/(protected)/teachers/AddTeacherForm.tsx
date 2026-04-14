"use client";

import { useState } from "react";
import TeacherImageUpload from "./TeacherImageUpload";

export default function AddTeacherForm() {
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState("teacher");
  const [password, setPassword] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");
  const [signatureUrl, setSignatureUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setMessage("");

    try {
      const response = await fetch("/api/teachers/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fullName,
          username,
          phone,
          role,
          password,
          photoUrl: photoUrl || null,
          signatureUrl: role === "headmaster" ? signatureUrl || null : null,
        }),
      });

      const rawText = await response.text();

      let data: {
        message?: string;
        teacherId?: string;
        error?: string;
      } = {};

      try {
        data = JSON.parse(rawText);
      } catch {
        throw new Error(rawText || "Server returned an invalid response.");
      }

      if (!response.ok) {
        throw new Error(data.error || "Failed to add teacher.");
      }

      setMessage(`${data.message} Teacher ID: ${data.teacherId}`);
      setFullName("");
      setUsername("");
      setPhone("");
      setRole("teacher");
      setPassword("");
      setPhotoUrl("");
      setSignatureUrl("");
    } catch (error) {
      setMessage(
        error instanceof Error ? `Error: ${error.message}` : "Error saving teacher."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: "16px",
        marginTop: "24px",
      }}
    >
      <div>
        <label>Full Name</label>
        <input
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          style={inputStyle}
          required
        />
      </div>

      <div>
        <label>Username</label>
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          style={inputStyle}
          required
        />
      </div>

      <div>
        <label>Phone</label>
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          style={inputStyle}
          required
        />
      </div>

      <div>
        <label>Role</label>
        <select
          value={role}
          onChange={(e) => setRole(e.target.value)}
          style={inputStyle}
        >
          <option value="teacher">Teacher</option>
          <option value="headmaster">Headmaster</option>
          <option value="admin">Admin</option>
        </select>
      </div>

      <div style={{ gridColumn: "1 / -1" }}>
        <label>Password</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={inputStyle}
          required
        />
      </div>

      <div style={{ gridColumn: "1 / -1" }}>
        <TeacherImageUpload
          label="Teacher Photo (Optional)"
          currentUrl={photoUrl}
          onUploadComplete={setPhotoUrl}
        />
      </div>

      {role === "headmaster" && (
        <div style={{ gridColumn: "1 / -1" }}>
          <TeacherImageUpload
            label="Headmaster Signature (Optional)"
            currentUrl={signatureUrl}
            onUploadComplete={setSignatureUrl}
          />
        </div>
      )}

      <div style={{ gridColumn: "1 / -1" }}>
        <button
          type="submit"
          disabled={saving}
          style={{
            background: "#111827",
            color: "#fff",
            border: "none",
            padding: "12px 20px",
            borderRadius: "10px",
            cursor: saving ? "not-allowed" : "pointer",
            opacity: saving ? 0.7 : 1,
          }}
        >
          {saving ? "Saving..." : "Add Teacher"}
        </button>
      </div>

      {message && (
        <div style={{ gridColumn: "1 / -1" }}>
          <p style={{ color: message.startsWith("Error:") ? "red" : "green" }}>
            {message}
          </p>
        </div>
      )}
    </form>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "12px",
  marginTop: "6px",
  borderRadius: "10px",
  border: "1px solid #d1d5db",
  outline: "none",
  fontSize: "14px",
};
