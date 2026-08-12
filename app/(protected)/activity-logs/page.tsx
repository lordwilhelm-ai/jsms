"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { authedFetch } from "@/lib/apiClient";
import { supabase } from "@/lib/supabase";

type LogRow = {
  id: string;
  user_name: string | null;
  role: string | null;
  action: string | null;
  class_name: string | null;
  date: string | null;
  details: string | null;
  created_at: string;
  undo_type: string | null;
  undone_at: string | null;
  undone_by: string | null;
};

const PAGE_SIZE = 50;

const COLORS = {
  bg: "#fffdf2",
  card: "#ffffff",
  border: "#e5e7eb",
  text: "#111827",
  muted: "#6b7280",
  gold: "#d4a017",
};

function formatActionLabel(action: string | null) {
  const raw = String(action || "").trim();
  if (!raw) return "Activity";
  return raw
    .split("_")
    .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
    .join(" ");
}

function formatWhen(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function ActivityLogsPage() {
  const [rows, setRows] = useState<LogRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const [undoTarget, setUndoTarget] = useState<LogRow | null>(null);
  const [undoPin, setUndoPin] = useState("");
  const [undoError, setUndoError] = useState("");
  const [undoBusy, setUndoBusy] = useState(false);
  const [needsPinSetup, setNeedsPinSetup] = useState(false);
  const [newPin, setNewPin] = useState("");
  const [newPinConfirm, setNewPinConfirm] = useState("");
  const [myTeacherId, setMyTeacherId] = useState("");

  async function loadLogs(targetPage: number) {
    setLoading(true);
    setError("");

    try {
      const params = new URLSearchParams({
        page: String(targetPage),
        pageSize: String(PAGE_SIZE),
      });
      if (search.trim()) params.set("search", search.trim());
      if (roleFilter) params.set("role", roleFilter);
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);

      const response = await authedFetch(`/api/activity-logs/list?${params.toString()}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to load activity logs.");
      }

      setRows(data.rows || []);
      setTotal(data.total || 0);
      setPage(targetPage);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load activity logs.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadLogs(0);

    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const authUserId = session?.user?.id;
      if (!authUserId) return;

      const { data } = await supabase
        .from("teachers")
        .select("id")
        .eq("auth_user_id", authUserId)
        .limit(1)
        .maybeSingle();

      if (data?.id) setMyTeacherId(data.id);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openUndoModal(row: LogRow) {
    setUndoTarget(row);
    setUndoPin("");
    setUndoError("");
    setNeedsPinSetup(false);
    setNewPin("");
    setNewPinConfirm("");
  }

  function closeUndoModal() {
    setUndoTarget(null);
    setUndoPin("");
    setUndoError("");
    setNeedsPinSetup(false);
    setNewPin("");
    setNewPinConfirm("");
  }

  async function submitSetPin() {
    setUndoError("");

    if (!/^\d{4}$/.test(newPin)) {
      setUndoError("PIN must be exactly 4 digits.");
      return;
    }
    if (newPin !== newPinConfirm) {
      setUndoError("PINs don't match.");
      return;
    }
    if (!myTeacherId) {
      setUndoError("Could not resolve your staff record — try reloading the page.");
      return;
    }

    setUndoBusy(true);
    try {
      const response = await authedFetch("/api/teachers/set-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teacherId: myTeacherId, pin: newPin }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Failed to set PIN.");

      setNeedsPinSetup(false);
      setUndoPin(newPin);
      setNewPin("");
      setNewPinConfirm("");
    } catch (err) {
      setUndoError(err instanceof Error ? err.message : "Failed to set PIN.");
    } finally {
      setUndoBusy(false);
    }
  }

  async function submitUndo() {
    if (!undoTarget) return;
    setUndoError("");

    if (!/^\d{4}$/.test(undoPin)) {
      setUndoError("Enter your 4-digit PIN.");
      return;
    }

    setUndoBusy(true);
    try {
      const response = await authedFetch("/api/activity-logs/undo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ logId: undoTarget.id, pin: undoPin }),
      });
      const result = await response.json();

      if (!response.ok) {
        if (result.code === "NO_PIN_SET") {
          setNeedsPinSetup(true);
          setUndoError("You haven't set a PIN yet — set one below to continue.");
          return;
        }
        throw new Error(result.error || "Failed to undo.");
      }

      closeUndoModal();
      void loadLogs(page);
    } catch (err) {
      setUndoError(err instanceof Error ? err.message : "Failed to undo.");
    } finally {
      setUndoBusy(false);
    }
  }

  function handleFilterSubmit(e: React.FormEvent) {
    e.preventDefault();
    void loadLogs(0);
  }

  function clearFilters() {
    setSearch("");
    setRoleFilter("");
    setStartDate("");
    setEndDate("");
    setTimeout(() => void loadLogs(0), 0);
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <main
      style={{
        minHeight: "100vh",
        background: COLORS.bg,
        fontFamily: "Arial, sans-serif",
        color: COLORS.text,
        padding: "24px",
      }}
    >
      <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "12px",
            marginBottom: "20px",
          }}
        >
          <div>
            <h1 style={{ margin: 0, fontSize: "26px" }}>Activity Logs</h1>
            <p style={{ margin: "6px 0 0", fontSize: "13px", color: COLORS.muted }}>
              Who did what, and when — {total} record{total === 1 ? "" : "s"} total.
            </p>
          </div>

          <div style={{ display: "flex", gap: "8px" }}>
            <Link
              href="/activity-logs/records"
              style={{
                padding: "10px 16px",
                borderRadius: "10px",
                background: COLORS.gold,
                color: "#111827",
                textDecoration: "none",
                fontSize: "13px",
                fontWeight: 700,
              }}
            >
              Manage Records
            </Link>
            <Link
              href="/dashboard/admin"
              style={{
                padding: "10px 16px",
                borderRadius: "10px",
                background: "#111827",
                color: "#fff",
                textDecoration: "none",
                fontSize: "13px",
                fontWeight: 700,
              }}
            >
              Back to Dashboard
            </Link>
          </div>
        </div>

        <form
          onSubmit={handleFilterSubmit}
          style={{
            background: COLORS.card,
            border: `1px solid ${COLORS.border}`,
            borderRadius: "16px",
            padding: "16px",
            marginBottom: "20px",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
            gap: "12px",
            alignItems: "end",
          }}
        >
          <div>
            <label style={{ display: "block", fontSize: "12px", fontWeight: 700, marginBottom: "6px" }}>
              Search
            </label>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Name, action, class, details..."
              style={{
                width: "100%",
                padding: "9px 10px",
                borderRadius: "8px",
                border: `1px solid ${COLORS.border}`,
                fontSize: "13px",
              }}
            />
          </div>

          <div>
            <label style={{ display: "block", fontSize: "12px", fontWeight: 700, marginBottom: "6px" }}>
              Role
            </label>
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              style={{
                width: "100%",
                padding: "9px 10px",
                borderRadius: "8px",
                border: `1px solid ${COLORS.border}`,
                fontSize: "13px",
              }}
            >
              <option value="">All roles</option>
              <option value="owner">Owner</option>
              <option value="admin">Admin</option>
              <option value="headmaster">Headmaster</option>
              <option value="teacher">Teacher</option>
            </select>
          </div>

          <div>
            <label style={{ display: "block", fontSize: "12px", fontWeight: 700, marginBottom: "6px" }}>
              From
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              style={{
                width: "100%",
                padding: "9px 10px",
                borderRadius: "8px",
                border: `1px solid ${COLORS.border}`,
                fontSize: "13px",
              }}
            />
          </div>

          <div>
            <label style={{ display: "block", fontSize: "12px", fontWeight: 700, marginBottom: "6px" }}>
              To
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              style={{
                width: "100%",
                padding: "9px 10px",
                borderRadius: "8px",
                border: `1px solid ${COLORS.border}`,
                fontSize: "13px",
              }}
            />
          </div>

          <div style={{ display: "flex", gap: "8px" }}>
            <button
              type="submit"
              style={{
                padding: "10px 16px",
                borderRadius: "8px",
                border: "none",
                background: COLORS.gold,
                color: "#111827",
                fontWeight: 700,
                fontSize: "13px",
                cursor: "pointer",
              }}
            >
              Filter
            </button>
            <button
              type="button"
              onClick={clearFilters}
              style={{
                padding: "10px 16px",
                borderRadius: "8px",
                border: `1px solid ${COLORS.border}`,
                background: "#fff",
                color: COLORS.text,
                fontWeight: 700,
                fontSize: "13px",
                cursor: "pointer",
              }}
            >
              Clear
            </button>
          </div>
        </form>

        {error && (
          <div
            style={{
              background: "#fee2e2",
              color: "#991b1b",
              borderRadius: "10px",
              padding: "12px 14px",
              marginBottom: "16px",
              fontSize: "13px",
              fontWeight: 600,
            }}
          >
            {error}
          </div>
        )}

        <div
          style={{
            background: COLORS.card,
            border: `1px solid ${COLORS.border}`,
            borderRadius: "16px",
            overflow: "hidden",
          }}
        >
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
              <thead>
                <tr style={{ background: "#f9fafb", textAlign: "left" }}>
                  <th style={{ padding: "12px 14px", whiteSpace: "nowrap" }}>When</th>
                  <th style={{ padding: "12px 14px" }}>Who</th>
                  <th style={{ padding: "12px 14px" }}>Action</th>
                  <th style={{ padding: "12px 14px" }}>Details</th>
                  <th style={{ padding: "12px 14px" }}>Undo</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={5} style={{ padding: "24px", textAlign: "center", color: COLORS.muted }}>
                      Loading...
                    </td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ padding: "24px", textAlign: "center", color: COLORS.muted }}>
                      No activity found.
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => (
                    <tr key={row.id} style={{ borderTop: `1px solid ${COLORS.border}` }}>
                      <td style={{ padding: "12px 14px", whiteSpace: "nowrap", color: COLORS.muted }}>
                        {formatWhen(row.created_at)}
                      </td>
                      <td style={{ padding: "12px 14px" }}>
                        <div style={{ fontWeight: 700 }}>{row.user_name || "Unknown"}</div>
                        <div style={{ fontSize: "11px", color: COLORS.muted, textTransform: "capitalize" }}>
                          {row.role || ""}
                        </div>
                      </td>
                      <td style={{ padding: "12px 14px" }}>
                        <span
                          style={{
                            display: "inline-block",
                            padding: "4px 10px",
                            borderRadius: "999px",
                            background: "#fef3c7",
                            color: "#92400e",
                            fontSize: "11px",
                            fontWeight: 700,
                          }}
                        >
                          {formatActionLabel(row.action)}
                        </span>
                        {row.class_name && (
                          <div style={{ fontSize: "11px", color: COLORS.muted, marginTop: "4px" }}>
                            {row.class_name}
                            {row.date ? ` • ${row.date}` : ""}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: "12px 14px", color: COLORS.text }}>{row.details || "—"}</td>
                      <td style={{ padding: "12px 14px", whiteSpace: "nowrap" }}>
                        {row.undone_at ? (
                          <span style={{ fontSize: "11px", color: COLORS.muted }}>
                            Undone by {row.undone_by || "—"}
                            <br />
                            {formatWhen(row.undone_at)}
                          </span>
                        ) : row.undo_type ? (
                          <button
                            type="button"
                            onClick={() => openUndoModal(row)}
                            style={{
                              padding: "6px 12px",
                              borderRadius: "8px",
                              border: "1px solid #fecaca",
                              background: "#fef2f2",
                              color: "#b91c1c",
                              fontSize: "12px",
                              fontWeight: 700,
                              cursor: "pointer",
                            }}
                          >
                            Undo
                          </button>
                        ) : (
                          <span style={{ fontSize: "11px", color: COLORS.muted }}>—</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "12px 14px",
              borderTop: `1px solid ${COLORS.border}`,
              fontSize: "12px",
              color: COLORS.muted,
            }}
          >
            <span>
              Page {page + 1} of {totalPages}
            </span>
            <div style={{ display: "flex", gap: "8px" }}>
              <button
                type="button"
                onClick={() => void loadLogs(page - 1)}
                disabled={page <= 0 || loading}
                style={{
                  padding: "7px 12px",
                  borderRadius: "8px",
                  border: `1px solid ${COLORS.border}`,
                  background: page <= 0 ? "#f3f4f6" : "#fff",
                  cursor: page <= 0 ? "not-allowed" : "pointer",
                  fontSize: "12px",
                  fontWeight: 700,
                }}
              >
                Previous
              </button>
              <button
                type="button"
                onClick={() => void loadLogs(page + 1)}
                disabled={page + 1 >= totalPages || loading}
                style={{
                  padding: "7px 12px",
                  borderRadius: "8px",
                  border: `1px solid ${COLORS.border}`,
                  background: page + 1 >= totalPages ? "#f3f4f6" : "#fff",
                  cursor: page + 1 >= totalPages ? "not-allowed" : "pointer",
                  fontSize: "12px",
                  fontWeight: 700,
                }}
              >
                Next
              </button>
            </div>
          </div>
        </div>
      </div>

      {undoTarget && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(17,24,39,0.55)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "16px",
            zIndex: 50,
          }}
        >
          <div
            style={{
              background: COLORS.card,
              borderRadius: "16px",
              padding: "22px",
              width: "100%",
              maxWidth: "420px",
              boxShadow: "0 20px 50px rgba(0,0,0,0.25)",
            }}
          >
            <h2 style={{ margin: "0 0 6px", fontSize: "18px" }}>Undo this action?</h2>
            <p style={{ margin: "0 0 4px", fontSize: "12px", color: COLORS.muted }}>
              {formatActionLabel(undoTarget.action)} by {undoTarget.user_name || "Unknown"}
            </p>
            <p
              style={{
                margin: "0 0 16px",
                fontSize: "13px",
                background: "#f9fafb",
                border: `1px solid ${COLORS.border}`,
                borderRadius: "10px",
                padding: "10px 12px",
              }}
            >
              {undoTarget.details}
            </p>

            {needsPinSetup ? (
              <>
                <p style={{ margin: "0 0 10px", fontSize: "12px", fontWeight: 700 }}>
                  Set a 4-digit PIN to confirm sensitive actions like this.
                </p>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  value={newPin}
                  onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ""))}
                  placeholder="New PIN"
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: "8px",
                    border: `1px solid ${COLORS.border}`,
                    fontSize: "14px",
                    marginBottom: "8px",
                    letterSpacing: "4px",
                  }}
                />
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  value={newPinConfirm}
                  onChange={(e) => setNewPinConfirm(e.target.value.replace(/\D/g, ""))}
                  placeholder="Confirm PIN"
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: "8px",
                    border: `1px solid ${COLORS.border}`,
                    fontSize: "14px",
                    marginBottom: "12px",
                    letterSpacing: "4px",
                  }}
                />
              </>
            ) : (
              <>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 700, marginBottom: "6px" }}>
                  Enter your PIN to confirm
                </label>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  value={undoPin}
                  onChange={(e) => setUndoPin(e.target.value.replace(/\D/g, ""))}
                  placeholder="PIN"
                  autoFocus
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: "8px",
                    border: `1px solid ${COLORS.border}`,
                    fontSize: "14px",
                    marginBottom: "12px",
                    letterSpacing: "4px",
                  }}
                />
              </>
            )}

            {undoError && (
              <div
                style={{
                  background: "#fee2e2",
                  color: "#991b1b",
                  borderRadius: "8px",
                  padding: "8px 10px",
                  marginBottom: "12px",
                  fontSize: "12px",
                  fontWeight: 600,
                }}
              >
                {undoError}
              </div>
            )}

            <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={closeUndoModal}
                disabled={undoBusy}
                style={{
                  padding: "10px 16px",
                  borderRadius: "8px",
                  border: `1px solid ${COLORS.border}`,
                  background: "#fff",
                  color: COLORS.text,
                  fontWeight: 700,
                  fontSize: "13px",
                  cursor: undoBusy ? "not-allowed" : "pointer",
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={needsPinSetup ? submitSetPin : submitUndo}
                disabled={undoBusy}
                style={{
                  padding: "10px 16px",
                  borderRadius: "8px",
                  border: "none",
                  background: "#dc2626",
                  color: "#fff",
                  fontWeight: 700,
                  fontSize: "13px",
                  cursor: undoBusy ? "not-allowed" : "pointer",
                }}
              >
                {undoBusy ? "Working..." : needsPinSetup ? "Set PIN & Continue" : "Confirm Undo"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
