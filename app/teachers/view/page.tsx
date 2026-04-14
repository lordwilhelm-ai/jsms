"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import TeacherImageUpload from "../TeacherImageUpload";

type Teacher = {
  id: string;
  teacher_id: string;
  full_name: string;
  username: string;
  phone: string;
  role: string;
  photo_url: string | null;
  signature_url: string | null;
};

export default function ViewTeachersPage() {
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadTeachers() {
    setLoading(true);
    setError("");

    const { data, error } = await supabase
      .from("teachers")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      setError(error.message);
    } else {
      setTeachers((data as Teacher[]) || []);
    }

    setLoading(false);
  }

  useEffect(() => {
    loadTeachers();
  }, []);

  return (
    <main
      style={{
        minHeight: "100vh",
        background:
          "linear-gradient(135deg, #fffdf2 0%, #fff9db 25%, #fef3c7 55%, #fde68a 100%)",
        fontFamily: "Arial, sans-serif",
        padding: "18px",
      }}
    >
      <div style={{ maxWidth: "1300px", margin: "0 auto" }}>
        <div
          style={{
            background: "linear-gradient(135deg, #111827 0%, #1f2937 100%)",
            borderRadius: "30px",
            color: "#fff",
            padding: "26px 24px",
            marginBottom: "22px",
            boxShadow: "0 18px 40px rgba(0,0,0,0.14)",
          }}
        >
          <p
            style={{
              margin: 0,
              fontSize: "11px",
              textTransform: "uppercase",
              letterSpacing: "1px",
              color: "rgba(255,255,255,0.72)",
            }}
          >
            Teacher Management
          </p>

          <h1
            style={{
              margin: "10px 0 10px",
              fontSize: "28px",
              lineHeight: 1.15,
            }}
          >
            View Teachers
          </h1>

          <p
            style={{
              margin: 0,
              maxWidth: "700px",
              color: "rgba(255,255,255,0.85)",
              lineHeight: 1.7,
              fontSize: "13px",
            }}
          >
            Edit teacher details, reset passwords, and delete teachers from the
            central system.
          </p>
        </div>

        <div style={{ marginBottom: "18px" }}>
          <Link
            href="/teachers"
            style={{
              textDecoration: "none",
              color: "#b45309",
              fontWeight: 700,
              fontSize: "13px",
            }}
          >
            ← Back to Teachers
          </Link>
        </div>

        {loading && (
          <div
            style={{
              background: "#fff",
              borderRadius: "20px",
              padding: "20px",
              boxShadow: "0 12px 30px rgba(0,0,0,0.08)",
            }}
          >
            Loading teachers...
          </div>
        )}

        {error && (
          <div
            style={{
              background: "#fff",
              borderRadius: "20px",
              padding: "20px",
              boxShadow: "0 12px 30px rgba(0,0,0,0.08)",
              color: "#b91c1c",
              border: "1px solid #fecaca",
            }}
          >
            {error}
          </div>
        )}

        {!loading && !error && teachers.length === 0 && (
          <div
            style={{
              background: "#fff",
              borderRadius: "20px",
              padding: "20px",
              boxShadow: "0 12px 30px rgba(0,0,0,0.08)",
            }}
          >
            No teachers found.
          </div>
        )}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(290px, 1fr))",
            gap: "20px",
          }}
        >
          {teachers.map((teacher, index) => (
            <EditableTeacherCard
              key={teacher.id}
              teacher={teacher}
              index={index}
              onUpdated={loadTeachers}
            />
          ))}
        </div>
      </div>
    </main>
  );
}

function EditableTeacherCard({
  teacher,
  index,
  onUpdated,
}: {
  teacher: Teacher;
  index: number;
  onUpdated: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);

  const [fullName, setFullName] = useState(teacher.full_name);
  const [username, setUsername] = useState(teacher.username);
  const [phone, setPhone] = useState(teacher.phone);
  const [role, setRole] = useState(teacher.role);
  const [photoUrl, setPhotoUrl] = useState<string>(teacher.photo_url || "");
  const [signatureUrl, setSignatureUrl] = useState<string>(
    teacher.signature_url || ""
  );
  const [newPassword, setNewPassword] = useState("");

  const [saving, setSaving] = useState(false);
  const [resettingPassword, setResettingPassword] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState("");

  function resetForm() {
    setFullName(teacher.full_name);
    setUsername(teacher.username);
    setPhone(teacher.phone);
    setRole(teacher.role);
    setPhotoUrl(teacher.photo_url || "");
    setSignatureUrl(teacher.signature_url || "");
    setNewPassword("");
    setMessage("");
    setEditing(false);
  }

  async function handleSave() {
    setSaving(true);
    setMessage("");

    try {
      const response = await fetch("/api/teachers/update", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: teacher.id,
          fullName,
          username,
          phone,
          role,
          photoUrl: photoUrl || null,
          signatureUrl: role === "headmaster" ? signatureUrl || null : null,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to update teacher.");
      }

      setMessage("Teacher updated successfully.");
      setEditing(false);
      await onUpdated();
    } catch (error) {
      setMessage(
        error instanceof Error ? `Error: ${error.message}` : "Error updating teacher."
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleResetPassword() {
    setResettingPassword(true);
    setMessage("");

    try {
      const response = await fetch("/api/teachers/reset-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: teacher.id,
          newPassword,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to reset password.");
      }

      setMessage("Password reset successfully.");
      setNewPassword("");
    } catch (error) {
      setMessage(
        error instanceof Error ? `Error: ${error.message}` : "Error resetting password."
      );
    } finally {
      setResettingPassword(false);
    }
  }

  async function handleDelete() {
    const confirmed = window.confirm(
      `Delete ${teacher.full_name} permanently? This cannot be undone.`
    );

    if (!confirmed) return;

    setDeleting(true);
    setMessage("");

    try {
      const response = await fetch("/api/teachers/delete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: teacher.id,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to delete teacher.");
      }

      setMessage("Teacher deleted permanently.");
      await onUpdated();
    } catch (error) {
      setMessage(
        error instanceof Error ? `Error: ${error.message}` : "Error deleting teacher."
      );
    } finally {
      setDeleting(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: index * 0.05 }}
      style={{
        background:
          "linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(240,253,244,0.95) 100%)",
        borderRadius: "24px",
        padding: "22px",
        boxShadow: "0 14px 35px rgba(0,0,0,0.08)",
        border: "1px solid rgba(16,185,129,0.14)",
      }}
    >
      {!editing ? (
        <>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "14px",
              marginBottom: "18px",
            }}
          >
            <div
              style={{
                width: "64px",
                height: "64px",
                borderRadius: "18px",
                overflow: "hidden",
                background: "linear-gradient(135deg, #dcfce7 0%, #bbf7d0 100%)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                boxShadow: "0 8px 18px rgba(16,185,129,0.14)",
              }}
            >
              {teacher.photo_url ? (
                <img
                  src={teacher.photo_url}
                  alt={teacher.full_name}
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                  }}
                />
              ) : (
                <span style={{ fontSize: "24px" }}>👤</span>
              )}
            </div>

            <div>
              <h2
                style={{
                  margin: 0,
                  fontSize: "19px",
                  lineHeight: 1.25,
                  color: "#111827",
                }}
              >
                {teacher.full_name}
              </h2>

              <p
                style={{
                  margin: "6px 0 0",
                  color: "#065f46",
                  fontSize: "13px",
                  fontWeight: 700,
                  textTransform: "capitalize",
                }}
              >
                {teacher.role}
              </p>
            </div>
          </div>

          <div style={{ display: "grid", gap: "10px", marginBottom: "16px" }}>
            <InfoRow label="Teacher ID" value={teacher.teacher_id} />
            <InfoRow label="Username" value={teacher.username} />
            <InfoRow label="Phone" value={teacher.phone} />
          </div>

          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <button type="button" onClick={() => setEditing(true)} style={actionButtonStyle}>
              Edit
            </button>

            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              style={{
                ...dangerButtonStyle,
                opacity: deleting ? 0.7 : 1,
                cursor: deleting ? "not-allowed" : "pointer",
              }}
            >
              {deleting ? "Deleting..." : "Delete"}
            </button>
          </div>
        </>
      ) : (
        <>
          <div style={{ display: "grid", gap: "14px" }}>
            <div>
              <label>Full Name</label>
              <input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                style={inputStyle}
              />
            </div>

            <div>
              <label>Username</label>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                style={inputStyle}
              />
            </div>

            <div>
              <label>Phone</label>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                style={inputStyle}
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

            <div>
              <TeacherImageUpload
                label="Teacher Photo"
                currentUrl={photoUrl}
                onUploadComplete={setPhotoUrl}
              />
            </div>

            {role === "headmaster" && (
              <div>
                <TeacherImageUpload
                  label="Headmaster Signature"
                  currentUrl={signatureUrl}
                  onUploadComplete={setSignatureUrl}
                />
              </div>
            )}

            <div
              style={{
                background: "#f8fafc",
                border: "1px solid #e5e7eb",
                borderRadius: "16px",
                padding: "14px",
              }}
            >
              <p style={{ margin: "0 0 10px", fontWeight: 700, color: "#111827" }}>
                Reset Password
              </p>
              <input
                type="password"
                placeholder="Enter new password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                style={inputStyle}
              />
              <button
                type="button"
                onClick={handleResetPassword}
                disabled={resettingPassword || !newPassword}
                style={{
                  ...actionButtonStyle,
                  marginTop: "10px",
                  opacity: resettingPassword || !newPassword ? 0.7 : 1,
                  cursor:
                    resettingPassword || !newPassword ? "not-allowed" : "pointer",
                }}
              >
                {resettingPassword ? "Resetting..." : "Reset Password"}
              </button>
            </div>

            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                style={{
                  ...actionButtonStyle,
                  opacity: saving ? 0.7 : 1,
                  cursor: saving ? "not-allowed" : "pointer",
                }}
              >
                {saving ? "Saving..." : "Save"}
              </button>

              <button type="button" onClick={resetForm} style={secondaryButtonStyle}>
                Cancel
              </button>

              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                style={{
                  ...dangerButtonStyle,
                  opacity: deleting ? 0.7 : 1,
                  cursor: deleting ? "not-allowed" : "pointer",
                }}
              >
                {deleting ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </>
      )}

      {message && (
        <p
          style={{
            marginTop: "14px",
            color: message.startsWith("Error:") ? "#b91c1c" : "#065f46",
            fontSize: "13px",
            fontWeight: 600,
          }}
        >
          {message}
        </p>
      )}
    </motion.div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        background: "rgba(255,255,255,0.72)",
        borderRadius: "14px",
        padding: "12px 14px",
        border: "1px solid rgba(16,185,129,0.08)",
      }}
    >
      <p
        style={{
          margin: 0,
          fontSize: "12px",
          color: "#6b7280",
          marginBottom: "4px",
        }}
      >
        {label}
      </p>
      <p
        style={{
          margin: 0,
          fontSize: "14px",
          color: "#111827",
          fontWeight: 600,
        }}
      >
        {value}
      </p>
    </div>
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

const actionButtonStyle: React.CSSProperties = {
  border: "none",
  background: "#064e3b",
  color: "#ffffff",
  borderRadius: "14px",
  padding: "12px 14px",
  fontWeight: 700,
  fontSize: "13px",
  cursor: "pointer",
};

const secondaryButtonStyle: React.CSSProperties = {
  border: "1px solid #d1d5db",
  background: "#ffffff",
  color: "#111827",
  borderRadius: "14px",
  padding: "12px 14px",
  fontWeight: 700,
  fontSize: "13px",
  cursor: "pointer",
};

const dangerButtonStyle: React.CSSProperties = {
  border: "none",
  background: "#b91c1c",
  color: "#ffffff",
  borderRadius: "14px",
  padding: "12px 14px",
  fontWeight: 700,
  fontSize: "13px",
  cursor: "pointer",
};
