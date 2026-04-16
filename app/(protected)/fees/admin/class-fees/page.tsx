"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import Link from "next/link";

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  borderRadius: "8px",
  border: "1px solid #ddd",
  fontSize: "14px",
};

export default function ClassFeesPage() {
  const [loading, setLoading] = useState(true);
  const [classes, setClasses] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      const { data, error } = await supabase.from("classes").select("*").order("class_order", { ascending: true });
      if (!active) return;
      if (error) {
        setError(error.message);
        setLoading(false);
        return;
      }
      setClasses(
        (data || []).map((c: any) => ({
          id: c.id,
          class_name: c.class_name || c.name || "",
          fee_returning: Number(c.fee_returning || 0),
          fee_new: Number(c.fee_new || 0),
          fee_lacoste: Number(c.fee_lacoste || 0),
          fee_monwed: Number(c.fee_monwed || 0),
          fee_friday: Number(c.fee_friday || 0),
        }))
      );
      setLoading(false);
    }
    void load();
    return () => {
      active = false;
    };
  }, []);

  async function saveClassFees(id: string) {
    setSaving(true);
    setError(null);
    try {
      const cls = classes.find((c) => c.id === id);
      if (!cls) throw new Error("Class not found");
      const res = await fetch("/api/classes/update-fees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          fee_returning: Number(cls.fee_returning || 0),
          fee_new: Number(cls.fee_new || 0),
          fee_lacoste: Number(cls.fee_lacoste || 0),
          fee_monwed: Number(cls.fee_monwed || 0),
          fee_friday: Number(cls.fee_friday || 0),
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || "Save failed");
    } catch (err: any) {
      setError(err?.message || String(err));
    } finally {
      setSaving(false);
    }
  }

  async function saveAll() {
    setSaving(true);
    setError(null);
    try {
      for (const cls of classes) {
        const res = await fetch("/api/classes/update-fees", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: cls.id,
            fee_returning: Number(cls.fee_returning || 0),
            fee_new: Number(cls.fee_new || 0),
            fee_lacoste: Number(cls.fee_lacoste || 0),
            fee_monwed: Number(cls.fee_monwed || 0),
            fee_friday: Number(cls.fee_friday || 0),
          }),
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body?.error || "Save failed");
      }
    } catch (err: any) {
      setError(err?.message || String(err));
    } finally {
      setSaving(false);
    }
  }

  function updateField(id: string, field: string, value: any) {
    setClasses((prev) => prev.map((c) => (c.id === id ? { ...c, [field]: value } : c)));
  }

  return (
    <main style={{ padding: 24 }}>
      <div style={{ maxWidth: 1000, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h1 style={{ margin: 0 }}>Class Fees</h1>
          <div style={{ display: "flex", gap: 8 }}>
            <Link href="/fees/admin" style={{ textDecoration: "none", padding: "8px 12px", background: "#f3f4f6", borderRadius: 8 }}>
              Back
            </Link>
            <button onClick={saveAll} disabled={saving} style={{ padding: "8px 12px", borderRadius: 8, background: "#f59e0b", color: "#fff", border: "none" }}>
              {saving ? "Saving..." : "Save All"}
            </button>
          </div>
        </div>

        {loading ? (
          <p>Loading classes...</p>
        ) : error ? (
          <p style={{ color: "red" }}>{error}</p>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {classes.map((c) => (
              <div key={c.id} style={{ background: "#fff", padding: 12, borderRadius: 10, boxShadow: "0 6px 18px rgba(0,0,0,0.04)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <strong>{c.class_name}</strong>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => saveClassFees(c.id)} disabled={saving} style={{ padding: "6px 10px", borderRadius: 8, background: "#10b981", color: "#fff", border: "none" }}>
                      Save
                    </button>
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 8 }}>
                  <div>
                    <label style={{ display: "block", fontSize: 12, color: "#4b5563", marginBottom: 6 }}>Returning Fee</label>
                    <input type="number" value={c.fee_returning} onChange={(e) => updateField(c.id, "fee_returning", Number(e.target.value))} style={inputStyle} />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: 12, color: "#4b5563", marginBottom: 6 }}>New Fee</label>
                    <input type="number" value={c.fee_new} onChange={(e) => updateField(c.id, "fee_new", Number(e.target.value))} style={inputStyle} />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: 12, color: "#4b5563", marginBottom: 6 }}>Lacoste</label>
                    <input type="number" value={c.fee_lacoste} onChange={(e) => updateField(c.id, "fee_lacoste", Number(e.target.value))} style={inputStyle} />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: 12, color: "#4b5563", marginBottom: 6 }}>Mon-Wed</label>
                    <input type="number" value={c.fee_monwed} onChange={(e) => updateField(c.id, "fee_monwed", Number(e.target.value))} style={inputStyle} />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: 12, color: "#4b5563", marginBottom: 6 }}>Friday</label>
                    <input type="number" value={c.fee_friday} onChange={(e) => updateField(c.id, "fee_friday", Number(e.target.value))} style={inputStyle} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
