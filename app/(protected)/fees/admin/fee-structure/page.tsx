"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type AnyRow = Record<string, any>;

const COLORS = {
  bg: "#f8f5ee",
  sidebar: "#0f172a",
  sidebarSoft: "#111827",
  gold: "#d4a017",
  goldSoft: "#f5e7b7",
  card: "#ffffff",
  text: "#111827",
  muted: "#6b7280",
  border: "#e5e7eb",
  success: "#166534",
  danger: "#991b1b",
};

function getRole(row: AnyRow | null) {
  const raw = String(row?.role || "").trim().toLowerCase();
  if (raw === "owner" || raw === "admin" || raw === "headmaster") return raw;
  return "teacher";
}

function getClassName(row: AnyRow) {
  return String(row.class_name || row.className || row.name || "").trim();
}

function numberValue(value: unknown) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

function formatMoney(value: number) {
  return `GHS ${value.toFixed(2)}`;
}

export default function FeesStructurePage() {
  const router = useRouter();

  const [checkingUser, setCheckingUser] = useState(true);
  const [loading, setLoading] = useState(true);
  const [savingClass, setSavingClass] = useState("");
  const [settingsRow, setSettingsRow] = useState<AnyRow | null>(null);
  const [classes, setClasses] = useState<AnyRow[]>([]);
  const [formRows, setFormRows] = useState<Record<string, AnyRow>>({});
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;

    async function checkAndLoad() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!active) return;

      if (!session?.user) {
        router.replace("/");
        return;
      }

      const [teachersRes, settingsRes, classesRes] = await Promise.all([
        supabase.from("teachers").select("*"),
        supabase.from("school_settings").select("*").limit(1).maybeSingle(),
        supabase.from("classes").select("*"),
      ]);

      if (!active) return;

      if (teachersRes.error || !teachersRes.data || teachersRes.data.length === 0) {
        router.replace("/");
        return;
      }

      const userRow =
        teachersRes.data.find((item) => item.auth_user_id === session.user.id) ||
        teachersRes.data.find(
          (item) =>
            String(item.email || "").trim().toLowerCase() ===
            String(session.user.email || "").trim().toLowerCase()
        ) ||
        null;

      if (!userRow) {
        router.replace("/");
        return;
      }

      const role = getRole(userRow);

      if (role === "teacher") {
        router.replace("/fees/teacher");
        return;
      }

      const classRows = classesRes.data || [];
      const nextForms: Record<string, AnyRow> = {};

      classRows.forEach((row) => {
        const className = getClassName(row);
        nextForms[className] = {
          fee_returning: String(numberValue(row.fee_returning)),
          fee_new: String(numberValue(row.fee_new)),
          fee_lacoste: String(numberValue(row.fee_lacoste)),
          fee_monwed: String(numberValue(row.fee_monwed)),
          fee_friday: String(numberValue(row.fee_friday)),
        };
      });

      setSettingsRow(settingsRes.data || null);
      setClasses(classRows);
      setFormRows(nextForms);
      setCheckingUser(false);
      setLoading(false);
    }

    void checkAndLoad();

    return () => {
      active = false;
    };
  }, [router]);

  const schoolName = String(settingsRow?.school_name || "JEFSEM VISION SCHOOL");
  const academicYear = String(settingsRow?.academic_year || "");
  const currentTerm = String(settingsRow?.current_term || "");

  const sortedClasses = useMemo(() => {
    return [...classes].sort((a, b) => getClassName(a).localeCompare(getClassName(b)));
  }, [classes]);

  function updateField(className: string, field: string, value: string) {
    setFormRows((prev) => ({
      ...prev,
      [className]: {
        ...(prev[className] || {}),
        [field]: value,
      },
    }));
  }

  async function saveClassFees(row: AnyRow) {
    const className = getClassName(row);
    const form = formRows[className];
    if (!form) return;

    try {
      setSavingClass(className);
      setMessage("");

      const payload = {
        fee_returning: numberValue(form.fee_returning),
        fee_new: numberValue(form.fee_new),
        fee_lacoste: numberValue(form.fee_lacoste),
        fee_monwed: numberValue(form.fee_monwed),
        fee_friday: numberValue(form.fee_friday),
      };

      const { error } = await supabase.from("classes").update(payload).eq("id", row.id);

      if (error) throw error;

      setClasses((prev) =>
        prev.map((item) =>
          item.id === row.id
            ? {
                ...item,
                ...payload,
              }
            : item
        )
      );

      setMessage(`${className} fee structure updated successfully.`);
    } catch (error) {
      console.error(error);
      setMessage(
        error instanceof Error ? `Error: ${error.message}` : "Error: Failed to save fee structure."
      );
    } finally {
      setSavingClass("");
    }
  }

  async function saveAllClasses() {
    try {
      setMessage("");

      for (const row of sortedClasses) {
        const className = getClassName(row);
        const form = formRows[className];

        if (!form) continue;

        setSavingClass(className);

        const payload = {
          fee_returning: numberValue(form.fee_returning),
          fee_new: numberValue(form.fee_new),
          fee_lacoste: numberValue(form.fee_lacoste),
          fee_monwed: numberValue(form.fee_monwed),
          fee_friday: numberValue(form.fee_friday),
        };

        const { error } = await supabase.from("classes").update(payload).eq("id", row.id);
        if (error) throw error;
      }

      setClasses((prev) =>
        prev.map((row) => {
          const className = getClassName(row);
          const form = formRows[className] || {};
          return {
            ...row,
            fee_returning: numberValue(form.fee_returning),
            fee_new: numberValue(form.fee_new),
            fee_lacoste: numberValue(form.fee_lacoste),
            fee_monwed: numberValue(form.fee_monwed),
            fee_friday: numberValue(form.fee_friday),
          };
        })
      );

      setMessage("All class fee structures updated successfully.");
    } catch (error) {
      console.error(error);
      setMessage(
        error instanceof Error ? `Error: ${error.message}` : "Error: Failed to save all classes."
      );
    } finally {
      setSavingClass("");
    }
  }

  if (checkingUser || loading) {
    return <div style={{ padding: "24px" }}>Loading fee structure...</div>;
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        background: COLORS.bg,
        fontFamily: "Arial, sans-serif",
        color: COLORS.text,
      }}
    >
      <div style={{ display: "flex", minHeight: "100vh" }}>
        <aside
          style={{
            width: "290px",
            background: `linear-gradient(180deg, ${COLORS.sidebar} 0%, ${COLORS.sidebarSoft} 100%)`,
            color: "#fff",
            padding: "24px 18px",
            borderRight: `4px solid ${COLORS.gold}`,
            position: "sticky",
            top: 0,
            alignSelf: "flex-start",
            minHeight: "100vh",
          }}
        >
          <div style={{ marginBottom: "24px" }}>
            <p style={{ margin: 0, fontSize: "12px", opacity: 0.8 }}>Fees Module</p>
            <h1 style={{ margin: "6px 0 0", fontSize: "24px", lineHeight: 1.2 }}>
              Fee Structure
            </h1>
            <p style={{ margin: "10px 0 0", fontSize: "13px", opacity: 0.85 }}>
              {schoolName}
            </p>
            <p style={{ margin: "4px 0 0", fontSize: "12px", color: COLORS.goldSoft }}>
              {academicYear || "-"} • {currentTerm || "-"}
            </p>
          </div>

          <div style={{ display: "grid", gap: "10px" }}>
            <ActionLink href="/fees/admin" label="Dashboard" />
            <ActionLink href="/fees/admin/record-payment" label="Record Payment" />
            <ActionLink href="/fees/admin/fee-structure" label="Fee Structure" />
            <ActionLink href="/fees/admin/student-accounts" label="Student Accounts" />
            <ActionLink href="/fees/admin/debtors" label="Debtors" />
            <ActionLink href="/fees/admin/receipts" label="Receipts" />
            <ActionLink href="/fees/admin/reports" label="Reports" />
            <ActionLink href="/fees/admin/fee-reminder" label="Fee Reminder" />
          </div>

          <div
            style={{
              marginTop: "28px",
              padding: "14px",
              borderRadius: "14px",
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.1)",
            }}
          >
            <p style={{ margin: 0, fontSize: "12px", color: COLORS.goldSoft }}>
              Important
            </p>
            <p style={{ margin: "8px 0 0", fontSize: "13px", lineHeight: 1.5 }}>
              Returning Fee is the normal fees for old students. New Fee is only for newly admitted students.
            </p>
          </div>
        </aside>

        <section style={{ flex: 1, padding: "24px" }}>
          <div
            style={{
              background: `linear-gradient(135deg, ${COLORS.sidebar} 0%, #1f2937 100%)`,
              color: "#fff",
              padding: "24px",
              borderRadius: "22px",
              marginBottom: "24px",
              border: `2px solid ${COLORS.gold}`,
              boxShadow: "0 18px 35px rgba(0,0,0,0.08)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: "16px",
                flexWrap: "wrap",
                alignItems: "center",
              }}
            >
              <div>
                <h2 style={{ margin: 0, fontSize: "30px" }}>Fee Structure Setup</h2>
                <p style={{ margin: "8px 0 0", color: "#d1d5db" }}>
                  Set school fees and school wear prices for each class.
                </p>
              </div>

              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                <Link href="/fees/admin" style={topButtonStyle()}>
                  Back to Dashboard
                </Link>
                <button
                  onClick={saveAllClasses}
                  disabled={Boolean(savingClass)}
                  style={primaryButtonStyle}
                >
                  {savingClass ? "Saving..." : "Save All"}
                </button>
              </div>
            </div>
          </div>

          {message && (
            <div
              style={{
                background: message.startsWith("Error:") ? "#fee2e2" : "#dcfce7",
                color: message.startsWith("Error:") ? COLORS.danger : COLORS.success,
                borderRadius: "14px",
                padding: "14px 16px",
                marginBottom: "20px",
                fontWeight: "bold",
              }}
            >
              {message}
            </div>
          )}

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
              gap: "18px",
            }}
          >
            {sortedClasses.map((row) => {
              const className = getClassName(row);
              const form = formRows[className] || {};

              const returningOnly = numberValue(form.fee_returning);
              const newOnly = numberValue(form.fee_new);

              const schoolWearTotal =
                numberValue(form.fee_lacoste) +
                numberValue(form.fee_monwed) +
                numberValue(form.fee_friday);

              return (
                <div
                  key={String(row.id)}
                  style={{
                    background: COLORS.card,
                    borderRadius: "20px",
                    border: `1px solid ${COLORS.border}`,
                    boxShadow: "0 10px 25px rgba(0,0,0,0.06)",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      padding: "18px 18px 14px",
                      background: "#fffaf0",
                      borderBottom: `1px solid ${COLORS.border}`,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: "12px",
                        alignItems: "start",
                        flexWrap: "wrap",
                      }}
                    >
                      <div>
                        <h3 style={{ margin: 0, color: COLORS.sidebar }}>{className}</h3>
                        <p style={{ margin: "6px 0 0", color: COLORS.muted, fontSize: "13px" }}>
                          Returning: {formatMoney(returningOnly)} • New: {formatMoney(newOnly)}
                        </p>
                        <p style={{ margin: "4px 0 0", color: COLORS.muted, fontSize: "13px" }}>
                          School wear total: {formatMoney(schoolWearTotal)}
                        </p>
                      </div>

                      <button
                        onClick={() => saveClassFees(row)}
                        disabled={savingClass === className}
                        style={primaryButtonStyle}
                      >
                        {savingClass === className ? "Saving..." : "Save"}
                      </button>
                    </div>
                  </div>

                  <div style={{ padding: "18px" }}>
                    <div
                      style={{
                        marginBottom: "16px",
                        padding: "14px",
                        borderRadius: "14px",
                        background: "#f9fafb",
                        border: `1px solid ${COLORS.border}`,
                      }}
                    >
                      <p style={{ margin: "0 0 10px", fontWeight: "bold", color: COLORS.sidebar }}>
                        School Fees
                      </p>

                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                          gap: "12px",
                        }}
                      >
                        <FieldBox
                          label="Returning Student Fee"
                          value={form.fee_returning || ""}
                          onChange={(value) => updateField(className, "fee_returning", value)}
                        />
                        <FieldBox
                          label="New Student Fee"
                          value={form.fee_new || ""}
                          onChange={(value) => updateField(className, "fee_new", value)}
                        />
                      </div>
                    </div>

                    <div
                      style={{
                        padding: "14px",
                        borderRadius: "14px",
                        background: "#f9fafb",
                        border: `1px solid ${COLORS.border}`,
                      }}
                    >
                      <p style={{ margin: "0 0 10px", fontWeight: "bold", color: COLORS.sidebar }}>
                        School Wear Prices
                      </p>

                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                          gap: "12px",
                        }}
                      >
                        <FieldBox
                          label="Lacoste"
                          value={form.fee_lacoste || ""}
                          onChange={(value) => updateField(className, "fee_lacoste", value)}
                        />
                        <FieldBox
                          label="Mon-Wed"
                          value={form.fee_monwed || ""}
                          onChange={(value) => updateField(className, "fee_monwed", value)}
                        />
                        <FieldBox
                          label="Friday"
                          value={form.fee_friday || ""}
                          onChange={(value) => updateField(className, "fee_friday", value)}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </main>
  );
}

function FieldBox({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label
        style={{
          display: "block",
          marginBottom: "6px",
          fontWeight: "bold",
          fontSize: "13px",
          color: COLORS.muted,
        }}
      >
        {label}
      </label>
      <input
        type="number"
        min="0"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: "100%",
          padding: "12px",
          borderRadius: "12px",
          border: `1px solid ${COLORS.border}`,
          fontSize: "14px",
          outline: "none",
          background: "#fff",
        }}
      />
    </div>
  );
}

function ActionLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      style={{
        textDecoration: "none",
        background: "rgba(255,255,255,0.06)",
        color: "#fff",
        padding: "14px 16px",
        borderRadius: "14px",
        fontWeight: "bold",
        border: "1px solid rgba(255,255,255,0.08)",
        display: "block",
      }}
    >
      {label}
    </Link>
  );
}

function topButtonStyle(): React.CSSProperties {
  return {
    textDecoration: "none",
    border: `1px solid rgba(255,255,255,0.15)`,
    borderRadius: "10px",
    padding: "10px 12px",
    background: "rgba(255,255,255,0.06)",
    color: "#fff",
    cursor: "pointer",
    fontWeight: "bold",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
  };
}

const primaryButtonStyle: React.CSSProperties = {
  border: "none",
  background: COLORS.gold,
  color: COLORS.sidebar,
  borderRadius: "12px",
  padding: "12px 16px",
  fontWeight: "bold",
  cursor: "pointer",
};
