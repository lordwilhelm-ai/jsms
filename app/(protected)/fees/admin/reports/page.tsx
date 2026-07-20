"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type AnyRow = Record<string, any>;
type ModuleType = "Fees" | "Books" | "Uniforms";
type DateRangeType = "Today" | "This Week" | "This Month" | "Current Term" | "This Year" | "Custom" | "All";

type ReportPayment = {
  id: string;
  module: ModuleType;
  receipt_number: string;
  student_id: string;
  student_name: string;
  class_name: string;
  item_name: string;
  amount_paid: number;
  total_amount: number;
  balance: number;
  payment_method: string;
  received_by: string;
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
  purple: "#6d28d9",
  purpleBg: "#ede9fe",
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

function dateValue(value: string) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function dateOnly(value: string) {
  const date = dateValue(value);
  if (!date) return text(value).slice(0, 10);
  return date.toISOString().slice(0, 10);
}

function formatDate(value: string) {
  if (!value) return "-";
  const date = dateValue(value);
  if (!date) return value;
  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDay(value: Date) {
  return value.toISOString().slice(0, 10);
}

function startOfDay(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(date: Date) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function addMonths(date: Date, months: number) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

function getMonday(date: Date) {
  const d = startOfDay(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  return addDays(d, diff);
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

function normalizeFeePayment(row: AnyRow): ReportPayment {
  return {
    id: text(row.id || row.receipt_no),
    module: "Fees",
    receipt_number: text(row.receipt_no || row.receipt_number || row.reference || row.id),
    student_id: getRealJvsId(row),
    student_name: text(row.student_name || row.full_name || row.name),
    class_name: text(row.class_name || row.className || row.class),
    item_name: text(row.payment_type || "School Fees"),
    amount_paid: numberValue(row.amount_paid || row.amount || row.paid),
    total_amount: numberValue(row.total_amount || row.total_owed || row.expected_amount),
    balance: numberValue(row.balance || row.balance_after_payment),
    payment_method: text(row.method || row.payment_method || "-"),
    received_by: text(row.recorded_by || row.received_by || row.receipt_issued_by || "Admin"),
    term: text(row.term || row.current_term),
    academic_year: text(row.academic_year || row.year),
    payment_date: text(row.payment_date || row.created_at),
    created_at: text(row.created_at || row.payment_date),
    raw: row,
  };
}

function normalizeBookPayment(row: AnyRow): ReportPayment {
  return {
    id: text(row.id || row.receipt_number),
    module: "Books",
    receipt_number: text(row.receipt_number || row.receipt_no || row.reference || row.id),
    student_id: getRealJvsId(row),
    student_name: text(row.student_name || row.full_name || row.name),
    class_name: text(row.class_name || row.className || row.class),
    item_name: text(row.paid_for || row.item_name || row.payment_type || "Books"),
    amount_paid: numberValue(row.amount_paid || row.amount || row.paid),
    total_amount: numberValue(row.total_amount),
    balance: numberValue(row.balance),
    payment_method: text(row.method || row.payment_method || "-"),
    received_by: text(row.received_by || row.receipt_issued_by || row.recorded_by || "Admin"),
    term: text(row.term || row.current_term),
    academic_year: text(row.academic_year || row.year),
    payment_date: text(row.payment_date || row.created_at),
    created_at: text(row.created_at || row.payment_date),
    raw: row,
  };
}

function normalizeUniformPayment(row: AnyRow): ReportPayment {
  return {
    id: text(row.id || row.receipt_number),
    module: "Uniforms",
    receipt_number: text(row.receipt_number || row.receipt_no || row.reference || row.id),
    student_id: getRealJvsId(row),
    student_name: text(row.student_name || row.full_name || row.name),
    class_name: text(row.class_name || row.className || row.class),
    item_name: text(row.paid_for || row.item_name || row.uniform_name || row.payment_type || "Uniforms"),
    amount_paid: numberValue(row.amount_paid || row.amount || row.paid),
    total_amount: numberValue(row.total_amount),
    balance: numberValue(row.balance),
    payment_method: text(row.method || row.payment_method || "-"),
    received_by: text(row.received_by || row.receipt_issued_by || row.recorded_by || "Admin"),
    term: text(row.term || row.current_term),
    academic_year: text(row.academic_year || row.year),
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

function getSettingDate(settingsRow: AnyRow | null, keys: string[]) {
  for (const key of keys) {
    const raw = text(settingsRow?.[key]);
    if (!raw) continue;
    const d = dateValue(raw);
    if (d) return d;
  }
  return null;
}

function getRangeLabel(range: DateRangeType, start: Date | null, end: Date | null, currentTerm: string) {
  if (range === "Current Term") {
    if (start && end) return `${currentTerm || "Current Term"}: ${formatDay(start)} to ${formatDay(end)}`;
    return currentTerm || "Current Term";
  }
  if (range === "All") return "All history";
  if (start && end) return `${formatDay(start)} to ${formatDay(end)}`;
  return range;
}

function getDateRange(range: DateRangeType, customStart: string, customEnd: string, settingsRow: AnyRow | null) {
  const now = new Date();

  if (range === "Today") {
    return { start: startOfDay(now), end: endOfDay(now) };
  }

  if (range === "This Week") {
    const start = getMonday(now);
    return { start, end: endOfDay(now) };
  }

  if (range === "This Month") {
    const start = startOfDay(addMonths(now, -1));
    return { start, end: endOfDay(now) };
  }

  if (range === "This Year") {
    const start = new Date(now.getFullYear(), 0, 1);
    return { start: startOfDay(start), end: endOfDay(now) };
  }

  if (range === "Custom") {
    const start = customStart ? startOfDay(new Date(customStart)) : null;
    const end = customEnd ? endOfDay(new Date(customEnd)) : null;
    return { start, end };
  }

  if (range === "Current Term") {
    const start = getSettingDate(settingsRow, [
      "term_start_date",
      "current_term_start_date",
      "current_term_start",
      "term_start",
      "start_date",
    ]);
    const end = getSettingDate(settingsRow, [
      "term_end_date",
      "current_term_end_date",
      "current_term_end",
      "term_end",
      "end_date",
    ]);
    return { start: start ? startOfDay(start) : null, end: end ? endOfDay(end) : null };
  }

  return { start: null, end: null };
}

function paymentInRange(payment: ReportPayment, range: DateRangeType, start: Date | null, end: Date | null, academicYear: string, currentTerm: string) {
  if (range === "Current Term" && !start && !end) {
    if (academicYear && payment.academic_year && payment.academic_year !== academicYear) return false;
    if (currentTerm && payment.term && payment.term !== currentTerm) return false;
    return true;
  }

  if (!start && !end) return true;

  const d = dateValue(payment.payment_date || payment.created_at);
  if (!d) return false;
  if (start && d < start) return false;
  if (end && d > end) return false;
  return true;
}

function moduleBadgeStyle(module: ModuleType) {
  if (module === "Fees") return { background: COLORS.successBg, color: COLORS.success };
  if (module === "Books") return { background: COLORS.blueBg, color: COLORS.blue };
  return { background: COLORS.goldSoft, color: "#92400e" };
}

function downloadCsv(filename: string, rows: ReportPayment[]) {
  const headers = [
    "Module",
    "Receipt No",
    "Student ID",
    "Student Name",
    "Class",
    "Item",
    "Amount Paid",
    "Total Amount",
    "Balance",
    "Payment Method",
    "Received By",
    "Term",
    "Academic Year",
    "Payment Date",
  ];

  const csvRows = rows.map((row) => [
    row.module,
    row.receipt_number,
    row.student_id,
    row.student_name,
    row.class_name,
    row.item_name,
    row.amount_paid,
    row.total_amount,
    row.balance,
    row.payment_method,
    row.received_by,
    row.term,
    row.academic_year,
    formatDate(row.payment_date),
  ]);

  const escape = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  const csv = [headers, ...csvRows].map((line) => line.map(escape).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export default function FinanceReportsPage() {
  const router = useRouter();

  const [checkingUser, setCheckingUser] = useState(true);
  const [loading, setLoading] = useState(true);
  const [settingsRow, setSettingsRow] = useState<AnyRow | null>(null);
  const [payments, setPayments] = useState<ReportPayment[]>([]);
  const [search, setSearch] = useState("");
  const [moduleFilter, setModuleFilter] = useState<"All" | ModuleType>("All");
  const [classFilter, setClassFilter] = useState("All");
  const [methodFilter, setMethodFilter] = useState("All");
  const [dateRange, setDateRange] = useState<DateRangeType>("Current Term");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;

    async function checkAndLoad() {
      setLoading(true);
      setMessage("");

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!active) return;

      if (!session?.user) {
        router.replace("/");
        return;
      }

      const [teachersRes, settingsRes, feesRows, booksRows, uniformRows] = await Promise.all([
        supabase.from("teachers").select("*"),
        supabase.from("school_settings").select("*").limit(1).maybeSingle(),
        safeSelect("fee_payments"),
        safeSelect("jsms_book_payments"),
        safeSelect("jsms_uniform_payments"),
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
            text(item.email).toLowerCase() === text(session.user.email).toLowerCase()
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

      const allPayments = [
        ...feesRows.map(normalizeFeePayment),
        ...booksRows.map(normalizeBookPayment),
        ...uniformRows.map(normalizeUniformPayment),
      ].sort((a, b) => {
        const da = dateValue(a.payment_date || a.created_at)?.getTime() || 0;
        const db = dateValue(b.payment_date || b.created_at)?.getTime() || 0;
        return db - da;
      });

      setSettingsRow(settingsRes.data || null);
      setPayments(allPayments);
      setCheckingUser(false);
      setLoading(false);
    }

    void checkAndLoad();

    return () => {
      active = false;
    };
  }, [router]);

  const academicYear = text(settingsRow?.academic_year || "");
  const currentTerm = text(settingsRow?.current_term || "");
  const schoolName = text(settingsRow?.school_name || "Jefsem Vision School");

  const classes = useMemo(() => {
    const set = new Set<string>();
    payments.forEach((row) => {
      if (row.class_name) set.add(row.class_name);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [payments]);

  const methods = useMemo(() => {
    const set = new Set<string>();
    payments.forEach((row) => {
      if (row.payment_method && row.payment_method !== "-") set.add(row.payment_method);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [payments]);

  const { start, end } = getDateRange(dateRange, customStart, customEnd, settingsRow);
  const activeRangeLabel = getRangeLabel(dateRange, start, end, currentTerm);

  const filteredPayments = useMemo(() => {
    const q = search.trim().toLowerCase();

    return payments.filter((row) => {
      if (moduleFilter !== "All" && row.module !== moduleFilter) return false;
      if (classFilter !== "All" && row.class_name !== classFilter) return false;
      if (methodFilter !== "All" && row.payment_method !== methodFilter) return false;
      if (!paymentInRange(row, dateRange, start, end, academicYear, currentTerm)) return false;

      if (q) {
        const body = [
          row.module,
          row.receipt_number,
          row.student_id,
          row.student_name,
          row.class_name,
          row.item_name,
          row.payment_method,
          row.received_by,
          row.term,
          row.academic_year,
        ]
          .join(" ")
          .toLowerCase();
        if (!body.includes(q)) return false;
      }

      return true;
    });
  }, [payments, moduleFilter, classFilter, methodFilter, dateRange, start, end, academicYear, currentTerm, search]);

  const totals = useMemo(() => {
    const total = filteredPayments.reduce((sum, row) => sum + row.amount_paid, 0);
    const fees = filteredPayments.filter((row) => row.module === "Fees").reduce((sum, row) => sum + row.amount_paid, 0);
    const books = filteredPayments.filter((row) => row.module === "Books").reduce((sum, row) => sum + row.amount_paid, 0);
    const uniforms = filteredPayments.filter((row) => row.module === "Uniforms").reduce((sum, row) => sum + row.amount_paid, 0);
    const receipts = filteredPayments.length;
    const students = new Set(filteredPayments.map((row) => row.student_id || row.student_name).filter(Boolean)).size;

    return { total, fees, books, uniforms, receipts, students };
  }, [filteredPayments]);

  const moduleSummary = useMemo(() => {
    const modules: ModuleType[] = ["Fees", "Books", "Uniforms"];
    return modules.map((module) => {
      const rows = filteredPayments.filter((row) => row.module === module);
      return {
        module,
        receipts: rows.length,
        students: new Set(rows.map((row) => row.student_id || row.student_name).filter(Boolean)).size,
        amount: rows.reduce((sum, row) => sum + row.amount_paid, 0),
      };
    });
  }, [filteredPayments]);

  const classSummary = useMemo(() => {
    const map = new Map<string, { class_name: string; fees: number; books: number; uniforms: number; total: number; receipts: number }>();

    filteredPayments.forEach((row) => {
      const key = row.class_name || "Unknown Class";
      const current = map.get(key) || {
        class_name: key,
        fees: 0,
        books: 0,
        uniforms: 0,
        total: 0,
        receipts: 0,
      };

      if (row.module === "Fees") current.fees += row.amount_paid;
      if (row.module === "Books") current.books += row.amount_paid;
      if (row.module === "Uniforms") current.uniforms += row.amount_paid;
      current.total += row.amount_paid;
      current.receipts += 1;
      map.set(key, current);
    });

    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [filteredPayments]);

  const methodSummary = useMemo(() => {
    const map = new Map<string, { method: string; receipts: number; amount: number }>();

    filteredPayments.forEach((row) => {
      const key = row.payment_method || "-";
      const current = map.get(key) || { method: key, receipts: 0, amount: 0 };
      current.receipts += 1;
      current.amount += row.amount_paid;
      map.set(key, current);
    });

    return Array.from(map.values()).sort((a, b) => b.amount - a.amount);
  }, [filteredPayments]);

  function printReport() {
    window.print();
  }

  function exportReport() {
    const safeRange = activeRangeLabel.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
    downloadCsv(`finance-report-${safeRange || "all"}.csv`, filteredPayments);
  }

  if (checkingUser || loading) {
    return (
      <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: COLORS.bg }}>
        <p style={{ color: COLORS.muted, fontWeight: 800 }}>Loading reports...</p>
      </main>
    );
  }

  return (
    <main style={{ minHeight: "100vh", background: COLORS.bg, fontFamily: "Arial, sans-serif", color: COLORS.text }}>
      <style jsx global>{`
        @keyframes cardFadeUp {
          from { opacity: 0; transform: translateY(14px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .report-card {
          transition: transform 0.22s ease, box-shadow 0.22s ease, border-color 0.22s ease;
          animation: cardFadeUp 0.45s ease both;
        }

        .report-card:hover {
          transform: translateY(-5px);
          box-shadow: 0 18px 42px rgba(15, 23, 42, 0.12) !important;
          border-color: ${COLORS.gold} !important;
        }

        input:focus, select:focus {
          outline: none;
          border-color: ${COLORS.gold} !important;
          box-shadow: 0 0 0 4px rgba(212, 160, 23, 0.15);
        }

        @media print {
          .no-print { display: none !important; }
          main { background: #ffffff !important; }
          .print-area { padding: 0 !important; }
          .report-card { break-inside: avoid; box-shadow: none !important; }
          table { font-size: 11px !important; }
        }

        @media (max-width: 900px) {
          .reports-shell { flex-direction: column; }
          .reports-sidebar {
            width: auto !important;
            position: relative !important;
            height: auto !important;
          }
          .reports-main { padding: 16px !important; }
        }
      `}</style>

      <div className="reports-shell" style={{ display: "flex", minHeight: "100vh" }}>
        <aside
          className="reports-sidebar no-print"
          style={{
            width: "clamp(220px, 22vw, 250px)",
            background: COLORS.sidebar,
            color: "white",
            padding: "24px 18px",
            position: "sticky",
            top: 0,
            height: "100vh",
          }}
        >
          <div style={{ marginBottom: "28px" }}>
            <p style={{ fontSize: "12px", color: "#cbd5e1", margin: 0 }}>Fees Admin</p>
            <h2 style={{ margin: "6px 0 0", fontSize: "22px" }}>Reports</h2>
          </div>

          {[
            ["Dashboard", "/fees/admin"],
            ["Record Payment", "/fees/admin/record-payment"],
            ["Student Accounts", "/fees/admin/student-accounts"],
            ["Debtors", "/fees/admin/debtors"],
            ["Receipts", "/fees/admin/receipts"],
            ["Reports", "/fees/admin/reports"],
            ["Fee Structure", "/fees/admin/fee-structure"],
          ].map(([label, href]) => (
            <Link
              key={href}
              href={href}
              style={{
                display: "block",
                padding: "12px 14px",
                marginBottom: "8px",
                borderRadius: "14px",
                textDecoration: "none",
                color: "white",
                background: href === "/fees/admin/reports" ? COLORS.gold : COLORS.sidebarSoft,
                fontWeight: 800,
              }}
            >
              {label}
            </Link>
          ))}
        </aside>

        <section className="reports-main print-area" style={{ flex: 1, padding: "28px", maxWidth: "1500px", margin: "0 auto" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: "16px",
              alignItems: "flex-start",
              marginBottom: "20px",
              flexWrap: "wrap",
            }}
          >
            <div>
              <Link className="no-print" href="/fees/admin" style={{ color: COLORS.muted, textDecoration: "none", fontWeight: 800 }}>
                ← Back to Fees Dashboard
              </Link>
              <h1 style={{ margin: "10px 0 4px", fontSize: "32px" }}>Financial Reports</h1>
              <p style={{ margin: 0, color: COLORS.muted, fontWeight: 700 }}>
                {schoolName} • {activeRangeLabel}
              </p>
            </div>

            <div className="no-print" style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              <button
                onClick={exportReport}
                style={{
                  border: "none",
                  background: COLORS.sidebar,
                  color: "white",
                  padding: "12px 16px",
                  borderRadius: "14px",
                  fontWeight: 900,
                  cursor: "pointer",
                }}
              >
                Export CSV
              </button>
              <button
                onClick={printReport}
                style={{
                  border: "none",
                  background: COLORS.gold,
                  color: "white",
                  padding: "12px 16px",
                  borderRadius: "14px",
                  fontWeight: 900,
                  cursor: "pointer",
                }}
              >
                Print Report
              </button>
            </div>
          </div>

          {message && (
            <div
              style={{
                background: COLORS.dangerBg,
                color: COLORS.danger,
                border: `1px solid ${COLORS.dangerBg}`,
                padding: "12px 14px",
                borderRadius: "14px",
                marginBottom: "16px",
                fontWeight: 800,
              }}
            >
              {message}
            </div>
          )}

          <div
            className="no-print"
            style={{
              background: COLORS.card,
              border: `1px solid ${COLORS.border}`,
              borderRadius: "24px",
              padding: "18px",
              marginBottom: "20px",
              boxShadow: "0 12px 30px rgba(15,23,42,0.07)",
            }}
          >
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: "12px" }}>
              <div>
                <label style={labelStyle}>Search</label>
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Receipt, name, JVS ID, class..."
                  style={inputStyle}
                />
              </div>

              <div>
                <label style={labelStyle}>Report Period</label>
                <select value={dateRange} onChange={(e) => setDateRange(e.target.value as DateRangeType)} style={inputStyle}>
                  <option>Today</option>
                  <option>This Week</option>
                  <option>This Month</option>
                  <option>Current Term</option>
                  <option>This Year</option>
                  <option>Custom</option>
                  <option>All</option>
                </select>
              </div>

              <div>
                <label style={labelStyle}>Module</label>
                <select value={moduleFilter} onChange={(e) => setModuleFilter(e.target.value as "All" | ModuleType)} style={inputStyle}>
                  <option>All</option>
                  <option>Fees</option>
                  <option>Books</option>
                  <option>Uniforms</option>
                </select>
              </div>

              <div>
                <label style={labelStyle}>Class</label>
                <select value={classFilter} onChange={(e) => setClassFilter(e.target.value)} style={inputStyle}>
                  <option>All</option>
                  {classes.map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={labelStyle}>Payment Method</label>
                <select value={methodFilter} onChange={(e) => setMethodFilter(e.target.value)} style={inputStyle}>
                  <option>All</option>
                  {methods.map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </select>
              </div>

              {dateRange === "Custom" && (
                <>
                  <div>
                    <label style={labelStyle}>Start Date</label>
                    <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>End Date</label>
                    <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} style={inputStyle} />
                  </div>
                </>
              )}
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: "16px", marginBottom: "18px" }}>
            <SummaryCard title="Total Collected" value={money(totals.total)} sub={`${totals.receipts} receipt(s)`} href="/fees/admin/receipts" />
            <SummaryCard title="Fees Collected" value={money(totals.fees)} sub="School fees only" href="/fees/admin/receipts" />
            <SummaryCard title="Books Collected" value={money(totals.books)} sub="Books payments only" href="/income-expenditure/books" />
            <SummaryCard title="Uniforms Collected" value={money(totals.uniforms)} sub="Ready for uniforms page" href="/income-expenditure/uniforms" />
            <SummaryCard title="Students Paid" value={String(totals.students)} sub="Unique students in report" href="/fees/admin/student-accounts" />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "18px", marginBottom: "18px" }}>
            <Panel title="Collection by Module">
              <div style={{ overflowX: "auto" }}>
                <table style={tableStyle}>
                  <thead>
                    <tr>
                      <th style={thStyle}>Module</th>
                      <th style={thStyle}>Receipts</th>
                      <th style={thStyle}>Students</th>
                      <th style={thStyle}>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {moduleSummary.map((row) => (
                      <tr key={row.module}>
                        <td style={tdStyle}><Badge module={row.module} /></td>
                        <td style={tdStyle}>{row.receipts}</td>
                        <td style={tdStyle}>{row.students}</td>
                        <td style={tdStyle}>{money(row.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>

            <Panel title="Collection by Payment Method">
              <div style={{ overflowX: "auto" }}>
                <table style={tableStyle}>
                  <thead>
                    <tr>
                      <th style={thStyle}>Method</th>
                      <th style={thStyle}>Receipts</th>
                      <th style={thStyle}>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {methodSummary.length === 0 ? (
                      <tr><td colSpan={3} style={emptyStyle}>No payment method found.</td></tr>
                    ) : (
                      methodSummary.map((row) => (
                        <tr key={row.method}>
                          <td style={tdStyle}>{row.method || "-"}</td>
                          <td style={tdStyle}>{row.receipts}</td>
                          <td style={tdStyle}>{money(row.amount)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </Panel>
          </div>

          <Panel title="Collection by Class">
            <div style={{ overflowX: "auto" }}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={thStyle}>Class</th>
                    <th style={thStyle}>Fees</th>
                    <th style={thStyle}>Books</th>
                    <th style={thStyle}>Uniforms</th>
                    <th style={thStyle}>Total</th>
                    <th style={thStyle}>Receipts</th>
                  </tr>
                </thead>
                <tbody>
                  {classSummary.length === 0 ? (
                    <tr><td colSpan={6} style={emptyStyle}>No class report found for this filter.</td></tr>
                  ) : (
                    classSummary.map((row) => (
                      <tr key={row.class_name}>
                        <td style={tdStyle}>{row.class_name}</td>
                        <td style={tdStyle}>{money(row.fees)}</td>
                        <td style={tdStyle}>{money(row.books)}</td>
                        <td style={tdStyle}>{money(row.uniforms)}</td>
                        <td style={{ ...tdStyle, fontWeight: 900 }}>{money(row.total)}</td>
                        <td style={tdStyle}>{row.receipts}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Panel>

          <Panel title="Detailed Payment Report">
            <div style={{ overflowX: "auto" }}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={thStyle}>Date</th>
                    <th style={thStyle}>Module</th>
                    <th style={thStyle}>Receipt No.</th>
                    <th style={thStyle}>Student</th>
                    <th style={thStyle}>JVS ID</th>
                    <th style={thStyle}>Class</th>
                    <th style={thStyle}>Item</th>
                    <th style={thStyle}>Method</th>
                    <th style={thStyle}>Amount</th>
                    <th style={thStyle}>Received By</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPayments.length === 0 ? (
                    <tr><td colSpan={10} style={emptyStyle}>No payment found for this report.</td></tr>
                  ) : (
                    filteredPayments.map((row, index) => (
                      <tr key={`${row.module}-${row.id}-${index}`}>
                        <td style={tdStyle}>{formatDate(row.payment_date)}</td>
                        <td style={tdStyle}><Badge module={row.module} /></td>
                        <td style={tdStyle}>{row.receipt_number || "-"}</td>
                        <td style={tdStyle}>{row.student_name || "-"}</td>
                        <td style={tdStyle}>{row.student_id || "-"}</td>
                        <td style={tdStyle}>{row.class_name || "-"}</td>
                        <td style={tdStyle}>{row.item_name || "-"}</td>
                        <td style={tdStyle}>{row.payment_method || "-"}</td>
                        <td style={{ ...tdStyle, fontWeight: 900 }}>{money(row.amount_paid)}</td>
                        <td style={tdStyle}>{row.received_by || "-"}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Panel>
        </section>
      </div>
    </main>
  );
}

function SummaryCard({ title, value, sub, href }: { title: string; value: string; sub: string; href: string }) {
  return (
    <Link
      href={href}
      className="report-card"
      style={{
        display: "block",
        background: COLORS.card,
        border: `1px solid ${COLORS.border}`,
        borderRadius: "22px",
        padding: "18px",
        textDecoration: "none",
        color: COLORS.text,
        boxShadow: "0 12px 30px rgba(15,23,42,0.07)",
      }}
    >
      <p style={{ margin: 0, color: COLORS.muted, fontSize: "13px", fontWeight: 900 }}>{title}</p>
      <h2 style={{ margin: "8px 0 4px", fontSize: "25px" }}>{value}</h2>
      <p style={{ margin: 0, color: COLORS.muted, fontSize: "12px", fontWeight: 700 }}>{sub}</p>
    </Link>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section
      className="report-card"
      style={{
        background: COLORS.card,
        border: `1px solid ${COLORS.border}`,
        borderRadius: "24px",
        padding: "18px",
        marginBottom: "18px",
        boxShadow: "0 12px 30px rgba(15,23,42,0.07)",
      }}
    >
      <h2 style={{ margin: "0 0 14px", fontSize: "18px" }}>{title}</h2>
      {children}
    </section>
  );
}

function Badge({ module }: { module: ModuleType }) {
  return (
    <span
      style={{
        ...moduleBadgeStyle(module),
        display: "inline-block",
        padding: "6px 10px",
        borderRadius: "999px",
        fontSize: "12px",
        fontWeight: 900,
      }}
    >
      {module}
    </span>
  );
}

const labelStyle: CSSProperties = {
  display: "block",
  fontSize: "12px",
  color: COLORS.muted,
  fontWeight: 900,
  marginBottom: "6px",
};

const inputStyle: CSSProperties = {
  width: "100%",
  border: `1px solid ${COLORS.border}`,
  borderRadius: "14px",
  padding: "12px 12px",
  fontWeight: 800,
  background: "white",
  color: COLORS.text,
};

const tableStyle: CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  minWidth: "760px",
};

const thStyle: CSSProperties = {
  textAlign: "left",
  padding: "12px",
  background: "#f8fafc",
  color: COLORS.muted,
  borderBottom: `1px solid ${COLORS.border}`,
  fontSize: "12px",
  fontWeight: 900,
  whiteSpace: "nowrap",
};

const tdStyle: CSSProperties = {
  padding: "12px",
  borderBottom: `1px solid ${COLORS.border}`,
  fontSize: "13px",
  fontWeight: 700,
  verticalAlign: "top",
};

const emptyStyle: CSSProperties = {
  padding: "22px",
  color: COLORS.muted,
  textAlign: "center",
  fontWeight: 800,
};
