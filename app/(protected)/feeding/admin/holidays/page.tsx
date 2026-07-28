"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { authedFetch } from "@/lib/apiClient";
import { fetchWithCache } from "@/lib/offline/cachedQuery";
import { queueOfflineAction, cancelPendingAction } from "@/lib/offline/sync";

const OFFLINE_MODULE = "feeding";

type Closure = {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  type: "holiday" | "vacation";
  active?: boolean;
  // Set only for an entry added while offline that hasn't synced yet — a
  // delete before it syncs just drops it from the local queue instead of
  // calling the delete API for a row that was never actually created.
  pendingOfflineId?: string;
};

type SettingsRow = {
  school_name?: string;
  motto?: string;
  academic_year?: string;
  current_term?: string;
};

const COLORS = {
  background:
    "linear-gradient(135deg, #fffdf2 0%, #fff9db 25%, #fef3c7 55%, #fde68a 100%)",
  primary: "#f59e0b",
  secondary: "#111827",
  white: "#ffffff",
  text: "#111827",
  muted: "#6b7280",
};

export default function FeedingHolidaysPage() {
  const [closures, setClosures] = useState<Closure[]>([]);
  const [loading, setLoading] = useState(false);
  const [showingCachedData, setShowingCachedData] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState("");
  const [settingsRow, setSettingsRow] = useState<SettingsRow | null>(null);

  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<"holiday" | "vacation">("holiday");
  const [newStartDate, setNewStartDate] = useState("");
  const [newEndDate, setNewEndDate] = useState("");

  useEffect(() => {
    void loadPageData();
  }, []);

  async function loadPageData() {
    try {
      setLoading(true);

      const [closuresRes, settingsRes] = await Promise.all([
        fetchWithCache(OFFLINE_MODULE, "school_closures", () => supabase.from("school_closures").select("*").order("start_date", { ascending: true }), [] as Closure[]),
        fetchWithCache(OFFLINE_MODULE, "school_settings", () => supabase.from("school_settings").select("*").limit(1).maybeSingle(), null as any),
      ]);

      setClosures((closuresRes.data || []) as Closure[]);
      setSettingsRow((settingsRes.data || null) as SettingsRow | null);
      setShowingCachedData(closuresRes.fromCache || settingsRes.fromCache);
    } catch (error) {
      console.error(error);
      alert("Failed to load holidays page.");
    } finally {
      setLoading(false);
    }
  }

  async function addClosure() {
    if (!newName.trim()) {
      alert("Enter name.");
      return;
    }

    if (!newStartDate) {
      alert("Select start date.");
      return;
    }

    const finalEndDate =
      newType === "holiday" ? newStartDate : newEndDate || newStartDate;

    if (newType === "vacation" && !newEndDate) {
      alert("Select end date for vacation.");
      return;
    }

    if (finalEndDate < newStartDate) {
      alert("End date cannot be before start date.");
      return;
    }

    const payload = {
      name: newName.trim(),
      type: newType,
      start_date: newStartDate,
      end_date: finalEndDate,
    };

    try {
      setSaving(true);

      try {
        const res = await authedFetch("/api/feeding/holidays/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body?.error || "Failed to add closure.");

        setClosures((prev) =>
          [...prev, body.closure as Closure].sort((a, b) => a.start_date.localeCompare(b.start_date))
        );
        alert("Added successfully.");
      } catch (error) {
        const isOffline = typeof navigator !== "undefined" && navigator.onLine === false;
        if (!isOffline) throw error;

        const offlineId = await queueOfflineAction(OFFLINE_MODULE, "add-holiday", "/api/feeding/holidays/create", payload);
        setClosures((prev) =>
          [
            ...prev,
            { id: offlineId, active: true, pendingOfflineId: offlineId, ...payload } as Closure,
          ].sort((a, b) => a.start_date.localeCompare(b.start_date))
        );
        alert("Saved offline — will sync automatically.");
      }

      setNewName("");
      setNewType("holiday");
      setNewStartDate("");
      setNewEndDate("");
    } catch (error) {
      console.error(error);
      alert("Failed to add closure.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteClosure(closure: Closure) {
    const confirmed = window.confirm(`Delete "${closure.name}"?`);
    if (!confirmed) return;

    const id = closure.id;

    try {
      setDeletingId(id);

      // Still just sitting in the offline queue, never actually created
      // server-side — drop it locally instead of calling delete on a row
      // that doesn't exist yet.
      if (closure.pendingOfflineId) {
        await cancelPendingAction(closure.pendingOfflineId);
        setClosures((prev) => prev.filter((item) => item.id !== id));
        return;
      }

      try {
        const res = await authedFetch("/api/feeding/holidays/delete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id }),
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body?.error || "Failed to delete closure.");
        setClosures((prev) => prev.filter((item) => item.id !== id));
      } catch (error) {
        const isOffline = typeof navigator !== "undefined" && navigator.onLine === false;
        if (!isOffline) throw error;
        await queueOfflineAction(OFFLINE_MODULE, "delete-holiday", "/api/feeding/holidays/delete", { id });
        setClosures((prev) => prev.filter((item) => item.id !== id));
      }
    } catch (error) {
      console.error(error);
      alert("Failed to delete closure.");
    } finally {
      setDeletingId("");
    }
  }

  const schoolName = String(settingsRow?.school_name || "JEFSEM VISION SCHOOL");
  const motto = String(settingsRow?.motto || "Success in Excellence");
  const academicYear = String(settingsRow?.academic_year || "-");
  const currentTerm = String(settingsRow?.current_term || "-");

  return (
    <main
      style={{
        minHeight: "100vh",
        background: COLORS.background,
        fontFamily: "Arial, sans-serif",
        color: COLORS.text,
      }}
    >
      <div
        style={{
          background: COLORS.secondary,
          color: COLORS.white,
          padding: "20px 24px",
          borderBottom: `6px solid ${COLORS.primary}`,
        }}
      >
        <div
          style={{
            maxWidth: "1100px",
            margin: "0 auto",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "start",
            gap: "12px",
            flexWrap: "wrap",
          }}
        >
          <div>
            <h1 style={{ margin: 0 }}>Feeding Holidays</h1>
            <p style={{ margin: "6px 0 0", fontWeight: "bold" }}>{schoolName}</p>
            <p style={{ margin: "4px 0 0", opacity: 0.9 }}>{motto}</p>
            {showingCachedData && (
              <p style={{ margin: "6px 0 0", fontSize: "12px", opacity: 0.85 }}>Showing last synced data</p>
            )}
            <p style={{ margin: "6px 0 0", fontSize: "13px", opacity: 0.9 }}>
              <strong>{academicYear}</strong> • <strong>{currentTerm}</strong>
            </p>
          </div>

          <Link href="/feeding/admin" style={backButtonStyle}>
            Back to Feeding Admin
          </Link>
        </div>
      </div>

      <div style={{ maxWidth: "1100px", margin: "auto", padding: "24px" }}>
        <div
          style={{
            background: COLORS.white,
            padding: "18px",
            borderRadius: "16px",
            marginBottom: "20px",
            boxShadow: "0 8px 22px rgba(0,0,0,0.06)",
          }}
        >
          <h3 style={{ marginTop: 0, color: COLORS.secondary }}>Add Holiday / Vacation</h3>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))",
              gap: "10px",
            }}
          >
            <input
              type="text"
              placeholder="Name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              style={inputStyle}
            />

            <select
              value={newType}
              onChange={(e) => setNewType(e.target.value as "holiday" | "vacation")}
              style={inputStyle}
            >
              <option value="holiday">Holiday</option>
              <option value="vacation">Vacation</option>
            </select>

            <input
              type="date"
              value={newStartDate}
              onChange={(e) => setNewStartDate(e.target.value)}
              style={inputStyle}
            />

            <input
              type="date"
              value={newType === "holiday" ? newStartDate : newEndDate}
              onChange={(e) => setNewEndDate(e.target.value)}
              style={{
                ...inputStyle,
                background: newType === "holiday" ? "#f3f4f6" : COLORS.white,
              }}
              disabled={newType === "holiday"}
            />

            <button onClick={addClosure} style={buttonStyle} disabled={saving}>
              {saving ? "Saving..." : "Add"}
            </button>
          </div>

          <p style={{ marginTop: "10px", fontSize: "13px", color: COLORS.muted }}>
            For holiday, end date will be the same as start date.
          </p>
        </div>

        <div
          style={{
            background: COLORS.white,
            borderRadius: "16px",
            padding: "18px",
            overflowX: "auto",
            boxShadow: "0 8px 22px rgba(0,0,0,0.06)",
          }}
        >
          {loading ? (
            <p>Loading closures...</p>
          ) : closures.length === 0 ? (
            <p>No holidays or vacations found.</p>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#fff7cc" }}>
                  <th style={thStyle}>Name</th>
                  <th style={thStyle}>Type</th>
                  <th style={thStyle}>Start Date</th>
                  <th style={thStyle}>End Date</th>
                  <th style={thStyle}>Status</th>
                  <th style={thStyle}>Delete</th>
                </tr>
              </thead>

              <tbody>
                {closures.map((item) => (
                  <tr key={item.id}>
                    <td style={{ ...tdStyle, textTransform: "capitalize" }}>{item.name}</td>
                    <td style={tdStyle}>{item.type}</td>
                    <td style={tdStyle}>{item.start_date}</td>
                    <td style={tdStyle}>{item.end_date}</td>
                    <td style={tdStyle}>{item.active === false ? "Inactive" : "Active"}</td>
                    <td style={tdStyle}>
                      <button
                        onClick={() => deleteClosure(item)}
                        style={deleteButtonStyle}
                        disabled={deletingId === item.id}
                      >
                        {deletingId === item.id ? "Deleting..." : "Delete"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <p
          style={{
            textAlign: "center",
            marginTop: "20px",
            fontSize: "12px",
            color: "#666",
          }}
        >
          System developed by Lord Wilhelm (0593410452)
        </p>
      </div>
    </main>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px",
  borderRadius: "8px",
  border: "1px solid #ddd",
};

const buttonStyle: React.CSSProperties = {
  background: COLORS.primary,
  border: "none",
  padding: "10px 14px",
  borderRadius: "8px",
  fontWeight: "bold",
  cursor: "pointer",
  color: COLORS.secondary,
};

const deleteButtonStyle: React.CSSProperties = {
  background: "#dc2626",
  color: "#ffffff",
  border: "none",
  padding: "8px 12px",
  borderRadius: "8px",
  cursor: "pointer",
};

const backButtonStyle: React.CSSProperties = {
  textDecoration: "none",
  border: "none",
  borderRadius: "10px",
  padding: "10px 14px",
  background: "#1f2937",
  color: "#ffffff",
  cursor: "pointer",
  fontWeight: "bold",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
};

const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "10px",
  borderBottom: "1px solid #ddd",
};

const tdStyle: React.CSSProperties = {
  padding: "10px",
  borderBottom: "1px solid #eee",
};
