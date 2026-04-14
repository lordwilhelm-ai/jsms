"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

export default function FeedingControlPage() {
  const [recordId, setRecordId] = useState("");
  const [feedingFee, setFeedingFee] = useState("6");
  const [minimumToEat, setMinimumToEat] = useState("5");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function loadSettings() {
      const { data } = await supabase
        .from("school_settings")
        .select("*")
        .limit(1)
        .maybeSingle();

      if (data) {
        setRecordId(String(data.id || ""));
        setFeedingFee(String(data.feeding_fee || 6));
        setMinimumToEat(String(data.minimum_to_eat || 5));
      }

      setLoading(false);
    }

    void loadSettings();
  }, []);

  async function handleSave() {
    if (!feedingFee || !minimumToEat) {
      setMessage("Error: Enter both values.");
      return;
    }

    setSaving(true);
    setMessage("");

    try {
      const payload = {
        feeding_fee: Number(feedingFee),
        minimum_to_eat: Number(minimumToEat),
      };

      if (recordId) {
        const { error } = await supabase
          .from("school_settings")
          .update(payload)
          .eq("id", recordId);

        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from("school_settings")
          .insert([payload])
          .select()
          .single();

        if (error) throw error;
        setRecordId(String(data.id || ""));
      }

      setMessage("Feeding control saved successfully.");
    } catch (error) {
      console.error(error);
      setMessage("Error: Failed to save feeding control.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div style={{ padding: 24 }}>Loading...</div>;
  }

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
      <div style={{ maxWidth: "900px", margin: "0 auto" }}>
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
          <h1 style={{ margin: 0, fontSize: "28px" }}>Feeding Control</h1>
          <p style={{ margin: "10px 0 0", fontSize: "13px", opacity: 0.9 }}>
            Change feeding amount and minimum amount to eat.
          </p>
        </div>

        <div
          style={{
            background: "#ffffff",
            borderRadius: "24px",
            padding: "20px",
            boxShadow: "0 10px 28px rgba(0,0,0,0.08)",
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "16px",
              marginBottom: "18px",
            }}
          >
            <div>
              <label style={labelStyle}>Feeding Fee</label>
              <input
                value={feedingFee}
                onChange={(e) => setFeedingFee(e.target.value)}
                style={inputStyle}
                type="number"
                min="1"
              />
            </div>

            <div>
              <label style={labelStyle}>Minimum To Eat</label>
              <input
                value={minimumToEat}
                onChange={(e) => setMinimumToEat(e.target.value)}
                style={inputStyle}
                type="number"
                min="1"
              />
            </div>
          </div>

          <div style={{ display: "flex", gap: "10px" }}>
            <button onClick={handleSave} disabled={saving} style={saveButtonStyle}>
              {saving ? "Saving..." : "Save"}
            </button>

            <Link href="/feeding/admin" style={backButtonStyle}>
              Back
            </Link>
          </div>

          {message && (
            <p
              style={{
                marginTop: "14px",
                color: message.startsWith("Error:") ? "#b91c1c" : "#065f46",
                fontWeight: 700,
                fontSize: "13px",
              }}
            >
              {message}
            </p>
          )}
        </div>
      </div>
    </main>
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
  fontWeight: 700,
  fontSize: "13px",
  color: "#111827",
};

const saveButtonStyle: React.CSSProperties = {
  border: "none",
  background: "#111827",
  color: "#ffffff",
  borderRadius: "14px",
  padding: "11px 16px",
  fontWeight: 700,
  fontSize: "13px",
  cursor: "pointer",
};

const backButtonStyle: React.CSSProperties = {
  textDecoration: "none",
  border: "1px solid #d1d5db",
  background: "#ffffff",
  color: "#111827",
  borderRadius: "14px",
  padding: "11px 16px",
  fontWeight: 700,
  fontSize: "13px",
};
