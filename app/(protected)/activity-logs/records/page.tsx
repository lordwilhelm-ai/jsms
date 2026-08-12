"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { authedFetch } from "@/lib/apiClient";
import { supabase } from "@/lib/supabase";

type RecordField = { key: string; label: string; type: "text" | "number" | "date"; editable: boolean };
type RecordRow = Record<string, any>;

const RECORD_TYPE_OPTIONS = [
  { value: "fees", label: "Fee Payments" },
  { value: "feeding", label: "Feeding Money Received" },
  { value: "uniforms", label: "Uniform Payments" },
  { value: "books", label: "Book Payments" },
  { value: "finance", label: "Income & Expenditure" },
];

const PAGE_SIZE = 25;

const COLORS = {
  bg: "#fffdf2",
  card: "#ffffff",
  border: "#e5e7eb",
  text: "#111827",
  muted: "#6b7280",
  gold: "#d4a017",
};

function formatValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  return String(value);
}

function labelFor(key: string) {
  return key
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export default function ManageRecordsPage() {
  const [type, setType] = useState("fees");
  const [rows, setRows] = useState<RecordRow[]>([]);
  const [fields, setFields] = useState<RecordField[]>([]);
  const [listFields, setListFields] = useState<string[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  const [modalMode, setModalMode] = useState<"edit" | "delete" | null>(null);
  const [modalRow, setModalRow] = useState<RecordRow | null>(null);
  const [editValues, setEditValues] = useState<Record<string, string>>({});
  const [pin, setPin] = useState("");
  const [modalError, setModalError] = useState("");
  const [modalBusy, setModalBusy] = useState(false);
  const [needsPinSetup, setNeedsPinSetup] = useState(false);
  const [newPin, setNewPin] = useState("");
  const [newPinConfirm, setNewPinConfirm] = useState("");
  const [myTeacherId, setMyTeacherId] = useState("");

  async function loadRows(targetType: string, targetPage: number, targetSearch: string) {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ page: String(targetPage), pageSize: String(PAGE_SIZE) });
      if (targetSearch.trim()) params.set("search", targetSearch.trim());

      const response = await authedFetch(`/api/records/${targetType}/list?${params.toString()}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to load records.");

      setRows(data.rows || []);
      setTotal(data.total || 0);
      setFields(data.fields || []);
      setListFields(Object.keys(data.rows?.[0] || {}));
      setPage(targetPage);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load records.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadRows(type, 0, search);

    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const authUserId = session?.user?.id;
      if (!authUserId) return;
      const { data } = await supabase.from("teachers").select("id").eq("auth_user_id", authUserId).limit(1).maybeSingle();
      if (data?.id) setMyTeacherId(data.id);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type]);

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    void loadRows(type, 0, search);
  }

  function openEdit(row: RecordRow) {
    setModalRow(row);
    setModalMode("edit");
    const initial: Record<string, string> = {};
    for (const field of fields) {
      if (field.editable) initial[field.key] = row[field.key] ?? "";
    }
    setEditValues(initial);
    resetModalExtras();
  }

  function openDelete(row: RecordRow) {
    setModalRow(row);
    setModalMode("delete");
    resetModalExtras();
  }

  function resetModalExtras() {
    setPin("");
    setModalError("");
    setNeedsPinSetup(false);
    setNewPin("");
    setNewPinConfirm("");
  }

  function closeModal() {
    setModalMode(null);
    setModalRow(null);
    resetModalExtras();
  }

  async function submitSetPin() {
    setModalError("");
    if (!/^\d{4}$/.test(newPin)) {
      setModalError("PIN must be exactly 4 digits.");
      return;
    }
    if (newPin !== newPinConfirm) {
      setModalError("PINs don't match.");
      return;
    }
    if (!myTeacherId) {
      setModalError("Could not resolve your staff record — try reloading the page.");
      return;
    }

    setModalBusy(true);
    try {
      const response = await authedFetch("/api/teachers/set-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teacherId: myTeacherId, pin: newPin }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Failed to set PIN.");

      setNeedsPinSetup(false);
      setPin(newPin);
      setNewPin("");
      setNewPinConfirm("");
    } catch (err) {
      setModalError(err instanceof Error ? err.message : "Failed to set PIN.");
    } finally {
      setModalBusy(false);
    }
  }

  async function submitEdit() {
    if (!modalRow) return;
    setModalError("");
    if (!/^\d{4}$/.test(pin)) {
      setModalError("Enter your 4-digit PIN.");
      return;
    }

    setModalBusy(true);
    try {
      const response = await authedFetch(`/api/records/${type}/${modalRow.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin, changes: editValues }),
      });
      const result = await response.json();

      if (!response.ok) {
        if (result.code === "NO_PIN_SET") {
          setNeedsPinSetup(true);
          setModalError("You haven't set a PIN yet — set one below to continue.");
          return;
        }
        throw new Error(result.error || "Failed to save changes.");
      }

      closeModal();
      void loadRows(type, page, search);
    } catch (err) {
      setModalError(err instanceof Error ? err.message : "Failed to save changes.");
    } finally {
      setModalBusy(false);
    }
  }

  async function submitDelete() {
    if (!modalRow) return;
    setModalError("");
    if (!/^\d{4}$/.test(pin)) {
      setModalError("Enter your 4-digit PIN.");
      return;
    }

    setModalBusy(true);
    try {
      const response = await authedFetch(`/api/records/${type}/${modalRow.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      const result = await response.json();

      if (!response.ok) {
        if (result.code === "NO_PIN_SET") {
          setNeedsPinSetup(true);
          setModalError("You haven't set a PIN yet — set one below to continue.");
          return;
        }
        throw new Error(result.error || "Failed to delete record.");
      }

      closeModal();
      void loadRows(type, page, search);
    } catch (err) {
      setModalError(err instanceof Error ? err.message : "Failed to delete record.");
    } finally {
      setModalBusy(false);
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <main style={{ minHeight: "100vh", background: COLORS.bg, fontFamily: "Arial, sans-serif", color: COLORS.text, padding: "24px" }}>
      <div style={{ maxWidth: "1300px", margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px", marginBottom: "20px" }}>
          <div>
            <h1 style={{ margin: 0, fontSize: "26px" }}>Manage Records</h1>
            <p style={{ margin: "6px 0 0", fontSize: "13px", color: COLORS.muted }}>
              Find and correct any fee, feeding, uniform, book, or finance entry — {total} record{total === 1 ? "" : "s"}.
            </p>
          </div>
          <Link
            href="/activity-logs"
            style={{ padding: "10px 16px", borderRadius: "10px", background: "#111827", color: "#fff", textDecoration: "none", fontSize: "13px", fontWeight: 700 }}
          >
            Back to Activity Logs
          </Link>
        </div>

        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "16px" }}>
          {RECORD_TYPE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setType(opt.value)}
              style={{
                padding: "9px 14px",
                borderRadius: "999px",
                border: `1px solid ${type === opt.value ? COLORS.gold : COLORS.border}`,
                background: type === opt.value ? "#fef3c7" : "#fff",
                color: type === opt.value ? "#92400e" : COLORS.text,
                fontWeight: 700,
                fontSize: "13px",
                cursor: "pointer",
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <form onSubmit={handleSearchSubmit} style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, ID, receipt, class..."
            style={{ flex: 1, padding: "10px 12px", borderRadius: "10px", border: `1px solid ${COLORS.border}`, fontSize: "13px", background: COLORS.card }}
          />
          <button
            type="submit"
            style={{ padding: "10px 16px", borderRadius: "8px", border: "none", background: COLORS.gold, color: "#111827", fontWeight: 700, fontSize: "13px", cursor: "pointer" }}
          >
            Search
          </button>
        </form>

        {error && (
          <div style={{ background: "#fee2e2", color: "#991b1b", borderRadius: "10px", padding: "12px 14px", marginBottom: "16px", fontSize: "13px", fontWeight: 600 }}>
            {error}
          </div>
        )}

        <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: "16px", overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
              <thead>
                <tr style={{ background: "#f9fafb", textAlign: "left" }}>
                  {listFields.map((key) => (
                    <th key={key} style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>
                      {labelFor(key)}
                    </th>
                  ))}
                  <th style={{ padding: "10px 12px" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={listFields.length + 1} style={{ padding: "24px", textAlign: "center", color: COLORS.muted }}>
                      Loading...
                    </td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={listFields.length + 1} style={{ padding: "24px", textAlign: "center", color: COLORS.muted }}>
                      No records found.
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => (
                    <tr key={row.id} style={{ borderTop: `1px solid ${COLORS.border}` }}>
                      {listFields.map((key) => (
                        <td key={key} style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>
                          {formatValue(row[key])}
                        </td>
                      ))}
                      <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>
                        <button
                          type="button"
                          onClick={() => openEdit(row)}
                          style={{ padding: "6px 10px", borderRadius: "8px", border: `1px solid ${COLORS.border}`, background: "#fff", color: COLORS.text, fontSize: "12px", fontWeight: 700, cursor: "pointer", marginRight: "6px" }}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => openDelete(row)}
                          style={{ padding: "6px 10px", borderRadius: "8px", border: "1px solid #fecaca", background: "#fef2f2", color: "#b91c1c", fontSize: "12px", fontWeight: 700, cursor: "pointer" }}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 14px", borderTop: `1px solid ${COLORS.border}`, fontSize: "12px", color: COLORS.muted }}>
            <span>
              Page {page + 1} of {totalPages}
            </span>
            <div style={{ display: "flex", gap: "8px" }}>
              <button
                type="button"
                onClick={() => void loadRows(type, page - 1, search)}
                disabled={page <= 0 || loading}
                style={{ padding: "7px 12px", borderRadius: "8px", border: `1px solid ${COLORS.border}`, background: page <= 0 ? "#f3f4f6" : "#fff", cursor: page <= 0 ? "not-allowed" : "pointer", fontSize: "12px", fontWeight: 700 }}
              >
                Previous
              </button>
              <button
                type="button"
                onClick={() => void loadRows(type, page + 1, search)}
                disabled={page + 1 >= totalPages || loading}
                style={{ padding: "7px 12px", borderRadius: "8px", border: `1px solid ${COLORS.border}`, background: page + 1 >= totalPages ? "#f3f4f6" : "#fff", cursor: page + 1 >= totalPages ? "not-allowed" : "pointer", fontSize: "12px", fontWeight: 700 }}
              >
                Next
              </button>
            </div>
          </div>
        </div>
      </div>

      {modalMode && modalRow && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(17,24,39,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: "16px", zIndex: 50 }}>
          <div style={{ background: COLORS.card, borderRadius: "16px", padding: "22px", width: "100%", maxWidth: "460px", maxHeight: "90vh", overflowY: "auto", boxShadow: "0 20px 50px rgba(0,0,0,0.25)" }}>
            <h2 style={{ margin: "0 0 16px", fontSize: "18px" }}>
              {modalMode === "edit" ? "Edit Record" : "Delete this record?"}
            </h2>

            {modalMode === "edit" &&
              !needsPinSetup &&
              fields
                .filter((f) => f.editable)
                .map((field) => (
                  <div key={field.key} style={{ marginBottom: "10px" }}>
                    <label style={{ display: "block", fontSize: "12px", fontWeight: 700, marginBottom: "4px" }}>{field.label}</label>
                    <input
                      type={field.type === "number" ? "number" : field.type === "date" ? "date" : "text"}
                      value={editValues[field.key] ?? ""}
                      onChange={(e) => setEditValues((prev) => ({ ...prev, [field.key]: e.target.value }))}
                      style={{ width: "100%", padding: "9px 10px", borderRadius: "8px", border: `1px solid ${COLORS.border}`, fontSize: "13px" }}
                    />
                  </div>
                ))}

            {modalMode === "delete" && !needsPinSetup && (
              <p style={{ margin: "0 0 16px", fontSize: "13px", background: "#f9fafb", border: `1px solid ${COLORS.border}`, borderRadius: "10px", padding: "10px 12px" }}>
                {modalRow.student_name || modalRow.class_name || modalRow.item_name || "This record"} — GHS{" "}
                {modalRow.amount_paid ?? modalRow.amount_received ?? modalRow.amount ?? "0"} will be permanently deleted.
              </p>
            )}

            {needsPinSetup ? (
              <>
                <p style={{ margin: "0 0 10px", fontSize: "12px", fontWeight: 700 }}>Set a 4-digit PIN to confirm sensitive actions like this.</p>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  value={newPin}
                  onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ""))}
                  placeholder="New PIN"
                  style={{ width: "100%", padding: "10px 12px", borderRadius: "8px", border: `1px solid ${COLORS.border}`, fontSize: "14px", marginBottom: "8px", letterSpacing: "4px" }}
                />
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  value={newPinConfirm}
                  onChange={(e) => setNewPinConfirm(e.target.value.replace(/\D/g, ""))}
                  placeholder="Confirm PIN"
                  style={{ width: "100%", padding: "10px 12px", borderRadius: "8px", border: `1px solid ${COLORS.border}`, fontSize: "14px", marginBottom: "12px", letterSpacing: "4px" }}
                />
              </>
            ) : (
              <>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 700, margin: "12px 0 6px" }}>Enter your PIN to confirm</label>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                  placeholder="PIN"
                  autoFocus
                  style={{ width: "100%", padding: "10px 12px", borderRadius: "8px", border: `1px solid ${COLORS.border}`, fontSize: "14px", marginBottom: "12px", letterSpacing: "4px" }}
                />
              </>
            )}

            {modalError && (
              <div style={{ background: "#fee2e2", color: "#991b1b", borderRadius: "8px", padding: "8px 10px", marginBottom: "12px", fontSize: "12px", fontWeight: 600 }}>
                {modalError}
              </div>
            )}

            <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={closeModal}
                disabled={modalBusy}
                style={{ padding: "10px 16px", borderRadius: "8px", border: `1px solid ${COLORS.border}`, background: "#fff", color: COLORS.text, fontWeight: 700, fontSize: "13px", cursor: modalBusy ? "not-allowed" : "pointer" }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={needsPinSetup ? submitSetPin : modalMode === "edit" ? submitEdit : submitDelete}
                disabled={modalBusy}
                style={{
                  padding: "10px 16px",
                  borderRadius: "8px",
                  border: "none",
                  background: modalMode === "delete" && !needsPinSetup ? "#dc2626" : COLORS.gold,
                  color: modalMode === "delete" && !needsPinSetup ? "#fff" : "#111827",
                  fontWeight: 700,
                  fontSize: "13px",
                  cursor: modalBusy ? "not-allowed" : "pointer",
                }}
              >
                {modalBusy ? "Working..." : needsPinSetup ? "Set PIN & Continue" : modalMode === "edit" ? "Save Changes" : "Confirm Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
