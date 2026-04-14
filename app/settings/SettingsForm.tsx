"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import LogoUpload from "./LogoUpload";

type SettingsRecord = {
  id?: string;
  school_name?: string;
  motto?: string;
  logo_url?: string;
  academic_year?: string;
  current_term?: string;
  term_begins?: string;
  term_ends?: string;
};

export default function SettingsForm() {
  const [recordId, setRecordId] = useState("");
  const [schoolName, setSchoolName] = useState("");
  const [motto, setMotto] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [academicYear, setAcademicYear] = useState("");
  const [currentTerm, setCurrentTerm] = useState("First Term");
  const [termBegins, setTermBegins] = useState("");
  const [termEnds, setTermEnds] = useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function loadSettings() {
      setLoading(true);
      setMessage("");

      const { data, error } = await supabase
        .from("school_settings")
        .select("*")
        .limit(1)
        .single();

      if (!error && data) {
        const settings = data as SettingsRecord;
        setRecordId(settings.id || "");
        setSchoolName(settings.school_name || "");
        setMotto(settings.motto || "");
        setLogoUrl(settings.logo_url || "");
        setAcademicYear(settings.academic_year || "");
        setCurrentTerm(settings.current_term || "First Term");
        setTermBegins(settings.term_begins || "");
        setTermEnds(settings.term_ends || "");
      }

      setLoading(false);
    }

    loadSettings();
  }, []);

  async function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setMessage("");

    try {
      const response = await fetch("/api/settings/update", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: recordId || null,
          school_name: schoolName,
          motto: motto,
          logo_url: logoUrl || null,
          academic_year: academicYear,
          current_term: currentTerm,
          term_begins: termBegins || null,
          term_ends: termEnds || null,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to save settings.");
      }

      if (data.id) {
        setRecordId(data.id);
      }

      setMessage("Settings saved successfully.");
    } catch (error) {
      setMessage(
        error instanceof Error ? `Error: ${error.message}` : "Error saving settings."
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div
        style={{
          background: "#fff",
          borderRadius: "20px",
          padding: "20px",
          boxShadow: "0 12px 30px rgba(0,0,0,0.08)",
        }}
      >
        Loading settings...
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSave}
      style={{
        background: "rgba(255,255,255,0.96)",
        borderRadius: "30px",
        padding: "24px",
        boxShadow: "0 10px 28px rgba(0,0,0,0.08)",
        border: "1px solid rgba(245,158,11,0.12)",
        display: "grid",
        gap: "18px",
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "16px",
        }}
      >
        <div>
          <label style={labelStyle}>School Name</label>
          <input
            value={schoolName}
            onChange={(e) => setSchoolName(e.target.value)}
            style={inputStyle}
            placeholder="Enter school name"
          />
        </div>

        <div>
          <label style={labelStyle}>Motto</label>
          <input
            value={motto}
            onChange={(e) => setMotto(e.target.value)}
            style={inputStyle}
            placeholder="Enter school motto"
          />
        </div>
      </div>

      <div>
        <LogoUpload currentUrl={logoUrl} onUploadComplete={setLogoUrl} />
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "16px",
        }}
      >
        <div>
          <label style={labelStyle}>Academic Year</label>
          <input
            value={academicYear}
            onChange={(e) => setAcademicYear(e.target.value)}
            style={inputStyle}
            placeholder="2025/2026"
          />
        </div>

        <div>
          <label style={labelStyle}>Current Term</label>
          <select
            value={currentTerm}
            onChange={(e) => setCurrentTerm(e.target.value)}
            style={inputStyle}
          >
            <option value="First Term">First Term</option>
            <option value="Second Term">Second Term</option>
            <option value="Third Term">Third Term</option>
          </select>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "16px",
        }}
      >
        <div>
          <label style={labelStyle}>Term Begins</label>
          <input
            type="date"
            value={termBegins}
            onChange={(e) => setTermBegins(e.target.value)}
            style={inputStyle}
          />
        </div>

        <div>
          <label style={labelStyle}>Term Ends</label>
          <input
            type="date"
            value={termEnds}
            onChange={(e) => setTermEnds(e.target.value)}
            style={inputStyle}
          />
        </div>
      </div>

      <div>
        <button
          type="submit"
          disabled={saving}
          style={{
            border: "none",
            background: "#111827",
            color: "#ffffff",
            borderRadius: "16px",
            padding: "13px 18px",
            fontWeight: 700,
            fontSize: "13px",
            cursor: saving ? "not-allowed" : "pointer",
            opacity: saving ? 0.7 : 1,
          }}
        >
          {saving ? "Saving..." : "Save Settings"}
        </button>
      </div>

      {message && (
        <p
          style={{
            margin: 0,
            color: message.startsWith("Error:") ? "#b91c1c" : "#065f46",
            fontSize: "13px",
            fontWeight: 600,
          }}
        >
          {message}
        </p>
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

const labelStyle: React.CSSProperties = {
  display: "block",
  fontWeight: 600,
  fontSize: "13px",
  color: "#111827",
};
