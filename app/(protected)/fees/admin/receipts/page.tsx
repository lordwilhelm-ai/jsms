"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type AnyRow = Record<string, any>;
type ModuleType = "Fees" | "Books" | "Uniforms";

type UniversalReceipt = {
  id: string;
  module: ModuleType;
  receipt_number: string;
  student_id: string;
  student_name: string;
  class_name: string;
  item_name: string;
  total_amount: number;
  amount_paid: number;
  balance: number;
  payment_method: string;
  received_by: string;
  note: string;
  term: string;
  academic_year: string;
  payment_date: string;
  created_at: string;
  raw: AnyRow;
};

const COLORS = {
  bg: "#f7f4ec",
  sidebar: "#0f172a",
  sidebarSoft: "#111827",
  gold: "#d4a017",
  goldSoft: "#fff7cc",
  card: "#ffffff",
  text: "#111827",
  muted: "#6b7280",
  border: "#e5e7eb",
  success: "#166534",
  successBg: "#dcfce7",
  danger: "#991b1b",
  dangerBg: "#fee2e2",
  blue: "#1d4ed8",
  blueBg: "#dbeafe",
};

function getRole(row: AnyRow | null) {
  const raw = String(row?.role || "").trim().toLowerCase();
  if (raw === "owner" || raw === "admin" || raw === "headmaster") return raw;
  return "teacher";
}

function text(value: unknown) {
  return String(value || "").trim();
}

function numberValue(value: unknown) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

function money(value: number) {
  return `GHS ${Number(value || 0).toFixed(2)}`;
}

function formatDate(value: string) {
  if (!value) return "-";
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

function dateOnly(value: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  return date.toISOString().slice(0, 10);
}

function getRealJvsId(row: AnyRow) {
  const direct =
    row.student_id ||
    row.jvs_id ||
    row.jsms_id ||
    row.jvs_student_id ||
    row.student_code ||
    row.admission_number ||
    row.studentId ||
    "";

  if (String(direct).toUpperCase().startsWith("JVS")) return text(direct).toUpperCase();

  for (const value of Object.values(row)) {
    const match = String(value || "").match(/JVS\s*\d{4,}/i);
    if (match) return match[0].replace(/\s+/g, "").toUpperCase();
  }

  return text(direct);
}

function normalizeFeePayment(row: AnyRow): UniversalReceipt {
  return {
    id: text(row.id || row.receipt_no),
    module: "Fees",
    receipt_number: text(row.receipt_no || row.receipt_number || row.reference || row.id),
    student_id: getRealJvsId(row),
    student_name: text(row.student_name || row.full_name || row.name),
    class_name: text(row.class_name || row.className || row.class),
    item_name: text(row.payment_type || "School Fees"),
    total_amount: numberValue(row.total_amount || row.total_owed || row.expected_amount),
    amount_paid: numberValue(row.amount_paid || row.amount || row.paid),
    balance: numberValue(row.balance || row.balance_after_payment),
    payment_method: text(row.method || row.payment_method || "-"),
    received_by: text(row.recorded_by || row.received_by || row.receipt_issued_by || "Admin"),
    note: text(row.notes || row.note || row.payment_note),
    term: text(row.term),
    academic_year: text(row.academic_year),
    payment_date: text(row.payment_date || row.created_at),
    created_at: text(row.created_at || row.payment_date),
    raw: row,
  };
}

function normalizeBookPayment(row: AnyRow): UniversalReceipt {
  return {
    id: text(row.id || row.receipt_number),
    module: "Books",
    receipt_number: text(row.receipt_number || row.receipt_no || row.reference || row.id),
    student_id: getRealJvsId(row),
    student_name: text(row.student_name || row.full_name || row.name),
    class_name: text(row.class_name || row.className || row.class),
    item_name: text(row.paid_for || row.item_name || row.payment_type || "Books"),
    total_amount: numberValue(row.total_amount),
    amount_paid: numberValue(row.amount_paid || row.amount || row.paid),
    balance: numberValue(row.balance),
    payment_method: text(row.method || row.payment_method || "-"),
    received_by: text(row.received_by || row.receipt_issued_by || row.recorded_by || "Admin"),
    note: text(row.payment_note || row.notes || row.note),
    term: text(row.term),
    academic_year: text(row.academic_year),
    payment_date: text(row.payment_date || row.created_at),
    created_at: text(row.created_at || row.payment_date),
    raw: row,
  };
}

function normalizeUniformPayment(row: AnyRow): UniversalReceipt {
  return {
    id: text(row.id || row.receipt_number),
    module: "Uniforms",
    receipt_number: text(row.receipt_number || row.receipt_no || row.reference || row.id),
    student_id: getRealJvsId(row),
    student_name: text(row.student_name || row.full_name || row.name),
    class_name: text(row.class_name || row.className || row.class),
    item_name: text(row.paid_for || row.item_name || row.uniform_name || row.payment_type || "Uniforms"),
    total_amount: numberValue(row.total_amount),
    amount_paid: numberValue(row.amount_paid || row.amount || row.paid),
    balance: numberValue(row.balance),
    payment_method: text(row.method || row.payment_method || "-"),
    received_by: text(row.received_by || row.receipt_issued_by || row.recorded_by || "Admin"),
    note: text(row.payment_note || row.notes || row.note),
    term: text(row.term),
    academic_year: text(row.academic_year),
    payment_date: text(row.payment_date || row.created_at),
    created_at: text(row.created_at || row.payment_date),
    raw: row,
  };
}

async function safeSelect(table: string) {
  const { data, error } = await supabase
    .from(table)
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.warn(`${table} not loaded:`, error.message);
    return [] as AnyRow[];
  }

  return (data || []) as AnyRow[];
}

function matchSearch(row: UniversalReceipt, query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return true;

  const body = [
    row.receipt_number,
    row.student_id,
    row.student_name,
    row.class_name,
    row.module,
    row.item_name,
    row.term,
    row.academic_year,
  ]
    .join(" ")
    .toLowerCase();

  return body.includes(q);
}

function getModuleBadgeStyle(module: ModuleType) {
  if (module === "Fees") return { background: COLORS.successBg, color: COLORS.success };
  if (module === "Books") return { background: COLORS.blueBg, color: COLORS.blue };
  return { background: COLORS.goldSoft, color: "#92400e" };
}

export default function UniversalReceiptsPage() {
  const router = useRouter();

  const [checkingUser, setCheckingUser] = useState(true);
  const [loading, setLoading] = useState(true);
  const [settingsRow, setSettingsRow] = useState<AnyRow | null>(null);
  const [receipts, setReceipts] = useState<UniversalReceipt[]>([]);
  const [search, setSearch] = useState("");
  const [moduleFilter, setModuleFilter] = useState<"All" | ModuleType>("All");
  const [classFilter, setClassFilter] = useState("All");
  const [termFilter, setTermFilter] = useState("Current Term");
  const [dateFilter, setDateFilter] = useState("All");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [selectedReceipt, setSelectedReceipt] = useState<UniversalReceipt | null>(null);
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

      const teachersRes = await supabase.from("teachers").select("*");

      if (!active) return;

      if (teachersRes.error || !teachersRes.data?.length) {
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

      if (getRole(userRow) === "teacher") {
        router.replace("/fees/teacher");
        return;
      }

      const settingsRes = await supabase
        .from("school_settings")
        .select("*")
        .limit(1)
        .maybeSingle();

      if (!active) return;

      setSettingsRow(settingsRes.data || null);
      setCheckingUser(false);
      await loadReceipts();
    }

    void checkAndLoad();

    return () => {
      active = false;
    };
  }, [router]);

  async function loadReceipts() {
    setLoading(true);
    setMessage("");

    try {
      const [feeRows, bookRows, uniformRows] = await Promise.all([
        safeSelect("fee_payments"),
        safeSelect("jsms_book_payments"),
        safeSelect("jsms_uniform_payments"),
      ]);

      const allRows = [
        ...feeRows.map(normalizeFeePayment),
        ...bookRows.map(normalizeBookPayment),
        ...uniformRows.map(normalizeUniformPayment),
      ]
        .filter((row) => row.receipt_number)
        .sort((a, b) => {
          const aDate = new Date(a.created_at || a.payment_date).getTime();
          const bDate = new Date(b.created_at || b.payment_date).getTime();
          return bDate - aDate;
        });

      setReceipts(allRows);
    } catch (error) {
      console.error(error);
      setMessage(error instanceof Error ? error.message : "Failed to load receipts.");
    } finally {
      setLoading(false);
    }
  }

  const schoolName = text(settingsRow?.school_name || "JEFSEM VISION SCHOOL");
  const motto = text(settingsRow?.motto || "Success in Excellence");
  const academicYear = text(settingsRow?.academic_year || "");
  const currentTerm = text(settingsRow?.current_term || "");

  const classOptions = useMemo(() => {
    const set = new Set<string>();
    receipts.forEach((row) => {
      if (row.class_name) set.add(row.class_name);
    });
    return ["All", ...Array.from(set).sort((a, b) => a.localeCompare(b))];
  }, [receipts]);

  const filteredReceipts = useMemo(() => {
    const today = new Date();
    const todayIso = today.toISOString().slice(0, 10);

    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - 7);

    const monthStart = new Date(today);
    monthStart.setMonth(today.getMonth() - 1);

    return receipts.filter((row) => {
      if (!matchSearch(row, search)) return false;
      if (moduleFilter !== "All" && row.module !== moduleFilter) return false;
      if (classFilter !== "All" && row.class_name !== classFilter) return false;

      if (termFilter === "Current Term") {
        if (academicYear && row.academic_year && row.academic_year !== academicYear) return false;
        if (currentTerm && row.term && row.term !== currentTerm) return false;
      }

      const rowDateOnly = dateOnly(row.payment_date || row.created_at);
      const rowDate = new Date(row.payment_date || row.created_at);

      if (dateFilter === "Today" && rowDateOnly !== todayIso) return false;
      if (dateFilter === "Last 7 Days" && rowDate < weekStart) return false;
      if (dateFilter === "Last 1 Month" && rowDate < monthStart) return false;

      if (dateFilter === "Custom") {
        if (customStart && rowDateOnly < customStart) return false;
        if (customEnd && rowDateOnly > customEnd) return false;
      }

      return true;
    });
  }, [receipts, search, moduleFilter, classFilter, termFilter, dateFilter, customStart, customEnd, academicYear, currentTerm]);

  const stats = useMemo(() => {
    const fees = filteredReceipts.filter((row) => row.module === "Fees");
    const books = filteredReceipts.filter((row) => row.module === "Books");
    const uniforms = filteredReceipts.filter((row) => row.module === "Uniforms");

    return {
      totalReceipts: filteredReceipts.length,
      totalAmount: filteredReceipts.reduce((sum, row) => sum + row.amount_paid, 0),
      feesAmount: fees.reduce((sum, row) => sum + row.amount_paid, 0),
      booksAmount: books.reduce((sum, row) => sum + row.amount_paid, 0),
      uniformsAmount: uniforms.reduce((sum, row) => sum + row.amount_paid, 0),
    };
  }, [filteredReceipts]);

  function printSelectedReceipt() {
    window.print();
  }

  if (checkingUser || loading) {
    return <div style={{ padding: "24px" }}>Loading universal receipts...</div>;
  }

  return (
    <main
      style={{
        height: "100vh",
        background: COLORS.bg,
        fontFamily: "Arial, sans-serif",
        color: COLORS.text,
        overflow: "hidden",
      }}
    >
      <style jsx global>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(14px); }
          to { opacity: 1; transform: translateY(0); }
        }

        @media print {
          body * { visibility: hidden !important; }
          .print-area, .print-area * { visibility: visible !important; }
          .print-area {
            position: fixed !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            background: white !important;
            box-shadow: none !important;
          }
          .no-print { display: none !important; }
        }
      `}</style>

      <div style={{ display: "flex", height: "100%" }}>
        <aside
          className="no-print"
          style={{
            width: "280px",
            background: `linear-gradient(180deg, ${COLORS.sidebar} 0%, ${COLORS.sidebarSoft} 100%)`,
            color: "#fff",
            padding: "20px 16px",
            borderRight: `4px solid ${COLORS.gold}`,
            overflowY: "auto",
            flexShrink: 0,
          }}
        >
          <div style={{ marginBottom: "24px" }}>
            <p style={{ margin: 0, fontSize: "12px", opacity: 0.8 }}>Finance Module</p>
            <h1 style={{ margin: "6px 0 0", fontSize: "22px", lineHeight: 1.1 }}>Universal Receipts</h1>
            <p style={{ margin: "8px 0 0", fontSize: "13px", color: COLORS.goldSoft }}>{schoolName}</p>
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
            <ActionLink href="/fees/admin/receipts" label="Receipts" active />
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
            <p style={{ margin: 0, fontSize: "12px", color: COLORS.goldSoft }}>Receipt Scope</p>
            <p style={{ margin: "8px 0 0", fontSize: "13px", lineHeight: 1.5 }}>
              This page searches fees, books, and uniforms separately. No feeding, no net balance.
            </p>
          </div>
        </aside>

        <section className="no-print" style={{ flex: 1, height: "100%", overflowY: "auto", padding: "24px" }}>
          <div
            style={{
              background: `linear-gradient(135deg, ${COLORS.sidebar} 0%, #1f2937 100%)`,
              color: "#fff",
              padding: "24px",
              borderRadius: "22px",
              marginBottom: "22px",
              border: `2px solid ${COLORS.gold}`,
              boxShadow: "0 18px 35px rgba(0,0,0,0.08)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: "16px", flexWrap: "wrap", alignItems: "center" }}>
              <div>
                <h2 style={{ margin: 0, fontSize: "30px" }}>Universal Receipt Search</h2>
                <p style={{ margin: "8px 0 0", color: "#d1d5db" }}>{motto}</p>
              </div>

              <button onClick={() => void loadReceipts()} style={topButtonStyle}>Refresh</button>
            </div>
          </div>

          {message && (
            <div style={{ background: COLORS.dangerBg, color: COLORS.danger, borderRadius: "14px", padding: "14px", marginBottom: "16px", fontWeight: "bold" }}>
              {message}
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: "16px", marginBottom: "22px" }}>
            <SummaryCard title="Receipts Found" value={stats.totalReceipts} />
            <SummaryCard title="Total Received" value={money(stats.totalAmount)} />
            <SummaryCard title="Fees Received" value={money(stats.feesAmount)} />
            <SummaryCard title="Books Received" value={money(stats.booksAmount)} />
            <SummaryCard title="Uniforms Received" value={money(stats.uniformsAmount)} />
          </div>

          <Section title="Search and Filters">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: "12px" }}>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search receipt, name, JVS ID, class..."
                style={inputStyle}
              />

              <Select value={moduleFilter} onChange={(value) => setModuleFilter(value as "All" | ModuleType)} options={["All", "Fees", "Books", "Uniforms"]} />
              <Select value={classFilter} onChange={setClassFilter} options={classOptions} />
              <Select value={termFilter} onChange={setTermFilter} options={["Current Term", "All History"]} />
              <Select value={dateFilter} onChange={setDateFilter} options={["All", "Today", "Last 7 Days", "Last 1 Month", "Custom"]} />

              {dateFilter === "Custom" && (
                <>
                  <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} style={inputStyle} />
                  <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} style={inputStyle} />
                </>
              )}
            </div>
          </Section>

          <Section title="Receipt Records">
            {filteredReceipts.length === 0 ? (
              <p style={{ color: COLORS.muted, margin: 0 }}>No receipt found.</p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                  <thead>
                    <tr style={{ background: COLORS.goldSoft }}>
                      <th style={thStyle}>Module</th>
                      <th style={thStyle}>Receipt No.</th>
                      <th style={thStyle}>Student</th>
                      <th style={thStyle}>JVS ID</th>
                      <th style={thStyle}>Class</th>
                      <th style={thStyle}>Amount</th>
                      <th style={thStyle}>Term</th>
                      <th style={thStyle}>Date</th>
                      <th style={thStyle}>Action</th>
                    </tr>
                  </thead>

                  <tbody>
                    {filteredReceipts.map((receipt) => (
                      <tr key={`${receipt.module}-${receipt.id}-${receipt.receipt_number}`}>
                        <td style={tdStyle}>
                          <span style={{ ...badgeStyle, ...getModuleBadgeStyle(receipt.module) }}>{receipt.module}</span>
                        </td>
                        <td style={tdStyle}><strong>{receipt.receipt_number}</strong></td>
                        <td style={tdStyle}>{receipt.student_name || "-"}</td>
                        <td style={tdStyle}>{receipt.student_id || "-"}</td>
                        <td style={tdStyle}>{receipt.class_name || "-"}</td>
                        <td style={tdStyle}>{money(receipt.amount_paid)}</td>
                        <td style={tdStyle}>{receipt.term || "-"}</td>
                        <td style={tdStyle}>{formatDate(receipt.created_at || receipt.payment_date)}</td>
                        <td style={tdStyle}>
                          <button onClick={() => setSelectedReceipt(receipt)} style={smallButtonStyle}>View</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>
        </section>
      </div>

      {selectedReceipt && (
        <ReceiptModal
          receipt={selectedReceipt}
          schoolName={schoolName}
          motto={motto}
          onClose={() => setSelectedReceipt(null)}
          onPrint={printSelectedReceipt}
        />
      )}
    </main>
  );
}

function ReceiptModal({
  receipt,
  schoolName,
  motto,
  onClose,
  onPrint,
}: {
  receipt: UniversalReceipt;
  schoolName: string;
  motto: string;
  onClose: () => void;
  onPrint: () => void;
}) {
  return (
    <div onClick={onClose} style={overlayStyle}>
      <div onClick={(e) => e.stopPropagation()} style={modalCardStyle}>
        <div className="print-area" style={{ background: "#fff", borderRadius: "18px", padding: "22px" }}>
          <div style={{ textAlign: "center", borderBottom: `2px solid ${COLORS.gold}`, paddingBottom: "14px", marginBottom: "18px" }}>
            <h2 style={{ margin: 0, color: COLORS.sidebar }}>{schoolName}</h2>
            <p style={{ margin: "6px 0 0", color: COLORS.muted }}>{motto}</p>
            <p style={{ margin: "8px 0 0", fontWeight: "bold", color: COLORS.gold }}>Official Payment Receipt</p>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", marginBottom: "18px" }}>
            <div>
              <p style={{ margin: 0, color: COLORS.muted, fontSize: "12px" }}>Receipt Number</p>
              <h3 style={{ margin: "4px 0 0", color: COLORS.sidebar }}>{receipt.receipt_number}</h3>
            </div>
            <span style={{ ...badgeStyle, ...getModuleBadgeStyle(receipt.module), alignSelf: "start" }}>{receipt.module}</span>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "12px", marginBottom: "18px" }}>
            <MiniInfo label="Student" value={receipt.student_name || "-"} />
            <MiniInfo label="JVS ID" value={receipt.student_id || "-"} />
            <MiniInfo label="Class" value={receipt.class_name || "-"} />
            <MiniInfo label="Item / Purpose" value={receipt.item_name || "-"} />
            <MiniInfo label="Amount Paid" value={money(receipt.amount_paid)} />
            <MiniInfo label="Balance On This Receipt" value={money(receipt.balance)} />
            <MiniInfo label="Payment Method" value={receipt.payment_method || "-"} />
            <MiniInfo label="Received By" value={receipt.received_by || "-"} />
            <MiniInfo label="Academic Year" value={receipt.academic_year || "-"} />
            <MiniInfo label="Term" value={receipt.term || "-"} />
            <MiniInfo label="Date" value={formatDate(receipt.created_at || receipt.payment_date)} />
            <MiniInfo label="Note" value={receipt.note || "-"} />
          </div>

          <div style={{ borderTop: `1px solid ${COLORS.border}`, paddingTop: "14px", display: "flex", justifyContent: "space-between", gap: "16px", fontSize: "13px", color: COLORS.muted }}>
            <span>Generated from JSMS Universal Receipt Search</span>
            <span>Signature: __________________</span>
          </div>
        </div>

        <div className="no-print" style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "16px" }}>
          <button onClick={onClose} style={secondaryButtonStyle}>Close</button>
          <button onClick={onPrint} style={primaryButtonStyle}>Print Receipt</button>
        </div>
      </div>
    </div>
  );
}

function SummaryCard({ title, value }: { title: string; value: string | number }) {
  return (
    <div
      style={{
        background: COLORS.card,
        border: `1px solid ${COLORS.border}`,
        borderRadius: "20px",
        padding: "18px",
        boxShadow: "0 14px 32px rgba(15,23,42,0.08)",
        animation: "fadeUp 0.45s ease both",
      }}
    >
      <p style={{ margin: 0, color: COLORS.muted, fontSize: "13px", fontWeight: "bold" }}>{title}</p>
      <h3 style={{ margin: "8px 0 0", color: COLORS.sidebar, fontSize: "22px" }}>{value}</h3>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: "22px", padding: "18px", marginBottom: "20px", boxShadow: "0 14px 32px rgba(15,23,42,0.06)" }}>
      <h3 style={{ margin: "0 0 14px", color: COLORS.sidebar }}>{title}</h3>
      {children}
    </section>
  );
}

function Select({ value, onChange, options }: { value: string; onChange: (value: string) => void; options: string[] }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} style={inputStyle}>
      {options.map((option) => (
        <option key={option} value={option}>{option}</option>
      ))}
    </select>
  );
}

function MiniInfo({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ border: `1px solid ${COLORS.border}`, borderRadius: "14px", padding: "12px", background: "#fafafa" }}>
      <p style={{ margin: 0, fontSize: "11px", color: COLORS.muted, fontWeight: "bold", textTransform: "uppercase" }}>{label}</p>
      <p style={{ margin: "6px 0 0", color: COLORS.text, fontWeight: "bold", wordBreak: "break-word" }}>{value}</p>
    </div>
  );
}

function ActionLink({ href, label, active = false }: { href: string; label: string; active?: boolean }) {
  return (
    <Link
      href={href}
      style={{
        textDecoration: "none",
        background: active ? "rgba(212,160,23,0.16)" : "rgba(255,255,255,0.06)",
        color: "#fff",
        padding: "14px 16px",
        borderRadius: "14px",
        fontWeight: "bold",
        border: active ? `2px solid ${COLORS.gold}` : "1px solid rgba(255,255,255,0.1)",
      }}
    >
      {label}
    </Link>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  border: `1px solid ${COLORS.border}`,
  borderRadius: "14px",
  padding: "13px 14px",
  outline: "none",
  background: "#fff",
  color: COLORS.text,
  fontSize: "14px",
};

const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "12px",
  borderBottom: `1px solid ${COLORS.border}`,
  color: COLORS.sidebar,
};

const tdStyle: React.CSSProperties = {
  padding: "12px",
  borderBottom: `1px solid ${COLORS.border}`,
  color: COLORS.text,
  verticalAlign: "top",
};

const badgeStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  borderRadius: "999px",
  padding: "6px 10px",
  fontSize: "12px",
  fontWeight: "bold",
};

const topButtonStyle: React.CSSProperties = {
  border: `1px solid ${COLORS.gold}`,
  borderRadius: "14px",
  background: "rgba(255,255,255,0.08)",
  color: "#fff",
  padding: "12px 16px",
  fontWeight: "bold",
  cursor: "pointer",
};

const smallButtonStyle: React.CSSProperties = {
  border: "none",
  borderRadius: "12px",
  background: COLORS.sidebar,
  color: "#fff",
  padding: "9px 12px",
  fontWeight: "bold",
  cursor: "pointer",
};

const primaryButtonStyle: React.CSSProperties = {
  border: "none",
  borderRadius: "14px",
  background: COLORS.sidebar,
  color: "#fff",
  padding: "12px 16px",
  fontWeight: "bold",
  cursor: "pointer",
};

const secondaryButtonStyle: React.CSSProperties = {
  border: `1px solid ${COLORS.border}`,
  borderRadius: "14px",
  background: "#fff",
  color: COLORS.text,
  padding: "12px 16px",
  fontWeight: "bold",
  cursor: "pointer",
};

const overlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(15,23,42,0.62)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "18px",
  zIndex: 100,
};

const modalCardStyle: React.CSSProperties = {
  width: "min(860px, 96vw)",
  maxHeight: "92vh",
  overflowY: "auto",
  background: "#fff",
  borderRadius: "22px",
  padding: "18px",
  boxShadow: "0 30px 90px rgba(0,0,0,0.28)",
};
