"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { fetchWithCache } from "@/lib/offline/cachedQuery";
import { fetchAllRows } from "@/lib/supabasePagination";
import { isStudentActive } from "@/lib/studentStatus";

const OFFLINE_MODULE = "fees";

type AnyRow = Record<string, any>;
type ActiveTab = "fees" | "books" | "uniforms";
type Scope = "current" | "all";

type FeeDebtor = {
  studentDbId: string;
  studentId: string;
  studentName: string;
  className: string;
  studentType: string;
  scholarshipLabel: string;
  expected: number;
  paid: number;
  balance: number;
  arrears: number;
  payments: AnyRow[];
};

type PaymentDebtor = {
  studentId: string;
  studentName: string;
  className: string;
  expected: number;
  paid: number;
  balance: number;
  payments: AnyRow[];
};

const CLASS_ORDER = [
  "Playroom 1",
  "Playroom 2",
  "KG 1",
  "KG 2",
  "Class 1",
  "Class 2",
  "Class 3",
  "Class 4",
  "Class 5",
  "Class 6",
  "JHS 1",
  "JHS 2",
  "JHS 3",
];

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
  dangerBg: "#fee2e2",
  dangerText: "#991b1b",
  warningBg: "#fef3c7",
  warningText: "#92400e",
  successBg: "#dcfce7",
  successText: "#166534",
  blueBg: "#dbeafe",
  blueText: "#1d4ed8",
};

function getRole(row: AnyRow | null) {
  const raw = String(row?.role || "").trim().toLowerCase();
  if (raw === "owner" || raw === "admin" || raw === "headmaster" || raw === "super_admin" || raw === "superadmin") return raw;
  return "teacher";
}

function numberValue(value: unknown) {
  const num = Number(value || 0);
  return Number.isFinite(num) ? num : 0;
}

function money(value: number) {
  return `GHS ${Number(value || 0).toFixed(2)}`;
}

function getClassName(row: AnyRow) {
  return String(
    row.class_name ||
      row.className ||
      row.class ||
      row.current_class ||
      row.student_class ||
      row.grade ||
      row.name ||
      ""
  ).trim();
}

function getStudentName(row: AnyRow) {
  return String(
    row.full_name ||
      row.student_name ||
      row.studentName ||
      row.fullName ||
      row.name ||
      `${row.first_name || ""} ${row.last_name || ""}`.trim() ||
      "-"
  ).trim();
}

function findRealJvsId(row: AnyRow) {
  const direct =
    row.jvs_id ||
    row.student_id ||
    row.jsms_id ||
    row.jvs_student_id ||
    row.jvs_code ||
    row.student_code ||
    row.student_number ||
    row.admission_number ||
    row.index_number ||
    row.jvsId ||
    row.studentId ||
    row.id_number ||
    "";

  if (String(direct || "").toUpperCase().startsWith("JVS")) {
    return String(direct).trim().toUpperCase().replace(/\s+/g, "");
  }

  for (const value of Object.values(row)) {
    const text = String(value || "");
    const match = text.match(/JVS\s*\d{4,}/i);
    if (match) return match[0].replace(/\s+/g, "").toUpperCase();
  }

  return String(direct || "").trim();
}

function getLevelGroupFromClassName(className: string) {
  const name = className.trim().toLowerCase();
  if (name.includes("playroom")) return "Playroom";
  if (name.startsWith("kg")) return "KG";
  if (["class 1", "class 2", "class 3"].includes(name)) return "Lower Primary";
  if (["class 4", "class 5", "class 6"].includes(name)) return "Upper Primary";
  if (name.startsWith("jhs")) return "JHS";
  return "Other";
}

function getLevelGroup(classRow: AnyRow | null, className: string) {
  return String(classRow?.fee_level_group || "").trim() || getLevelGroupFromClassName(className);
}

function nameClassKey(name: string, className: string) {
  return `${name}|${className}`;
}

function sameStudentPayment(
  payment: AnyRow,
  student: AnyRow,
  studentId: string,
  studentName: string,
  className: string,
  allowNameFallback: boolean
) {
  const paymentStudentId = String(payment.student_id || payment.studentId || "").trim();
  const paymentName = String(payment.student_name || payment.full_name || payment.name || "").trim().toLowerCase();
  const paymentClass = String(payment.class_name || payment.className || payment.class || "").trim().toLowerCase();
  const uuid = String(student.id || "").trim();

  if (studentId && paymentStudentId === studentId) return true;
  if (uuid && paymentStudentId === uuid) return true;

  // Fallback for older rows that saved only name + class instead of a
  // student ID -- only trust it when exactly one student shares this
  // name+class, otherwise leave it unmatched rather than risk crediting the
  // wrong student.
  if (!allowNameFallback) return false;

  return (
    Boolean(paymentName) &&
    Boolean(studentName) &&
    paymentName === studentName.toLowerCase() &&
    (!paymentClass || !className || paymentClass === className.toLowerCase())
  );
}

function paymentDate(row: AnyRow) {
  return String(row.created_at || row.payment_date || row.date || "");
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function getScholarshipLabel(student: AnyRow) {
  const raw = String(student.scholarship_type || "none").trim().toLowerCase();
  if (raw === "full") return "Full scholarship";
  if (raw === "half") return "Half scholarship";
  if (raw === "custom") return `Custom fee: ${money(numberValue(student.scholarship_amount))}`;
  return "Regular";
}

function calculateExpectedFee(params: {
  student: AnyRow;
  classRow: AnyRow | null;
  newStudentItems: AnyRow[];
}) {
  const { student, classRow, newStudentItems } = params;
  const className = getClassName(student);
  const levelGroup = getLevelGroup(classRow, className);
  const isNew = student.is_new === true || String(student.student_type || "").toLowerCase() === "new";
  const returningFee = numberValue(classRow?.fee_returning);
  const newItemsTotal = newStudentItems
    .filter((item) => String(item.level_group || "").trim() === levelGroup && item.is_active !== false)
    .reduce((sum, item) => sum + numberValue(item.amount), 0);
  const fallbackNewFee = numberValue(classRow?.fee_new);

  let baseFee = isNew ? newItemsTotal || fallbackNewFee : returningFee;

  const scholarship = String(student.scholarship_type || "none").trim().toLowerCase();
  if (scholarship === "full") baseFee = 0;
  if (scholarship === "half") baseFee = baseFee / 2;
  if (scholarship === "custom") baseFee = numberValue(student.scholarship_amount);

  const arrears = numberValue(student.arrears);
  return {
    baseFee,
    arrears,
    totalExpected: baseFee + arrears,
    studentType: isNew ? "New Student" : "Continuing",
    levelGroup,
  };
}

function matchScope(row: AnyRow, scope: Scope, currentTerm: string, academicYear: string) {
  if (scope === "all") return true;

  // A payment row must be tagged with the *same* term/year as the school's
  // current settings to count as "current term". Previously a row with a
  // blank term/year silently matched every term forever (once recorded, it
  // would keep reducing a debtor's balance in every future term). This now
  // matches the standard used on the main Fees Dashboard.
  const rowTerm = String(row.term || row.current_term || "").trim().toLowerCase();
  const rowYear = String(row.academic_year || row.year || "").trim().toLowerCase();

  const termOk = !currentTerm || rowTerm === currentTerm.toLowerCase();
  const yearOk = !academicYear || rowYear === academicYear.toLowerCase();

  return termOk && yearOk;
}

function safeReceipt(row: AnyRow) {
  return String(row.receipt_no || row.receipt_number || row.receipt || "-");
}

function primaryButtonStyle(active = false): React.CSSProperties {
  return {
    border: active ? `1px solid ${COLORS.gold}` : `1px solid ${COLORS.border}`,
    background: active ? COLORS.gold : "#fff",
    color: active ? "#111827" : COLORS.text,
    borderRadius: "999px",
    padding: "10px 14px",
    fontWeight: 900,
    cursor: "pointer",
    boxShadow: active ? "0 12px 25px rgba(212,160,23,0.22)" : "none",
  };
}

function ActionLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      style={{
        display: "block",
        textDecoration: "none",
        color: "#fff",
        padding: "12px 14px",
        borderRadius: "14px",
        background: href.endsWith("/debtors") ? "rgba(212,160,23,0.24)" : "rgba(255,255,255,0.07)",
        border: href.endsWith("/debtors") ? `1px solid ${COLORS.gold}` : "1px solid rgba(255,255,255,0.1)",
        fontWeight: 800,
        fontSize: "14px",
      }}
    >
      {label}
    </Link>
  );
}

export default function DebtorsPage() {
  const router = useRouter();

  const [checkingUser, setCheckingUser] = useState(true);
  const [loading, setLoading] = useState(true);
  const [showingCachedData, setShowingCachedData] = useState(false);
  const [message, setMessage] = useState("");
  const [settingsRow, setSettingsRow] = useState<AnyRow | null>(null);
  const [classes, setClasses] = useState<AnyRow[]>([]);
  const [students, setStudents] = useState<AnyRow[]>([]);
  const [feePayments, setFeePayments] = useState<AnyRow[]>([]);
  const [bookPayments, setBookPayments] = useState<AnyRow[]>([]);
  const [uniformPayments, setUniformPayments] = useState<AnyRow[]>([]);
  const [newStudentItems, setNewStudentItems] = useState<AnyRow[]>([]);
  const [uniformWarning, setUniformWarning] = useState("");

  const [activeTab, setActiveTab] = useState<ActiveTab>("fees");
  const [scope, setScope] = useState<Scope>("current");
  const [search, setSearch] = useState("");
  const [classFilter, setClassFilter] = useState("All Classes");

  useEffect(() => {
    let active = true;

    async function loadPage() {
      try {
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

        const [teachersRes, settingsRes, classesRes, studentsRes, feePaymentsRes, newItemsRes, bookPaymentsRes, uniformPaymentsRes] =
          await Promise.all([
            fetchWithCache(OFFLINE_MODULE, "teachers", () => supabase.from("teachers").select("*"), [] as AnyRow[]),
            fetchWithCache(OFFLINE_MODULE, "school_settings", () => supabase.from("school_settings").select("*").limit(1).maybeSingle(), null),
            fetchWithCache(OFFLINE_MODULE, "classes", () => supabase.from("classes").select("*"), [] as AnyRow[]),
            fetchWithCache(OFFLINE_MODULE, "students", () => supabase.from("students").select("*"), [] as AnyRow[]),
            fetchWithCache(
              OFFLINE_MODULE,
              "fee_payments",
              () =>
                fetchAllRows((from, to) =>
                  supabase.from("fee_payments").select("*").order("created_at", { ascending: false }).range(from, to)
                ),
              [] as AnyRow[]
            ),
            fetchWithCache(
              OFFLINE_MODULE,
              "new_student_fee_items",
              () =>
                supabase
                  .from("new_student_fee_items")
                  .select("*")
                  .eq("is_active", true)
                  .order("level_group", { ascending: true })
                  .order("sort_order", { ascending: true }),
              [] as AnyRow[]
            ),
            fetchWithCache(
              OFFLINE_MODULE,
              "jsms_book_payments",
              () =>
                fetchAllRows((from, to) =>
                  supabase.from("jsms_book_payments").select("*").order("created_at", { ascending: false }).range(from, to)
                ),
              [] as AnyRow[]
            ),
            fetchWithCache(
              OFFLINE_MODULE,
              "jsms_uniform_payments",
              () =>
                fetchAllRows((from, to) =>
                  supabase.from("jsms_uniform_payments").select("*").order("created_at", { ascending: false }).range(from, to)
                ),
              [] as AnyRow[]
            ),
          ]);

        if (!active) return;

        setShowingCachedData(
          [teachersRes, settingsRes, classesRes, studentsRes, feePaymentsRes, newItemsRes, bookPaymentsRes, uniformPaymentsRes].some(
            (r) => r.fromCache
          )
        );

        if (!teachersRes.data || teachersRes.data.length === 0) {
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

        setSettingsRow(settingsRes.data || null);
        setClasses(classesRes.data || []);
        setStudents((studentsRes.data || []).filter(isStudentActive));
        setFeePayments(feePaymentsRes.data || []);
        setNewStudentItems(newItemsRes.data || []);
        setBookPayments(bookPaymentsRes.data || []);
        setUniformPayments(uniformPaymentsRes.data || []);
        setUniformWarning("");
      } catch (error) {
        console.error(error);
        const errorMessage =
          error instanceof Error
            ? error.message
            : String((error as Record<string, any>)?.message || "Failed to load debtors.");
        setMessage(`Error: ${errorMessage}`);
      } finally {
        if (active) {
          setCheckingUser(false);
          setLoading(false);
        }
      }
    }

    void loadPage();

    return () => {
      active = false;
    };
  }, [router]);

  const schoolName = String(settingsRow?.school_name || "JEFSEM VISION SCHOOL");
  const academicYear = String(settingsRow?.academic_year || "").trim();
  const currentTerm = String(settingsRow?.current_term || "").trim();

  const classMap = useMemo(() => {
    const map = new Map<string, AnyRow>();
    classes.forEach((row) => map.set(getClassName(row), row));
    return map;
  }, [classes]);

  const classOptions = useMemo(() => {
    const found = new Set<string>();
    students.forEach((student) => {
      const className = getClassName(student);
      if (className) found.add(className);
    });

    return [
      "All Classes",
      ...CLASS_ORDER.filter((name) => found.has(name)),
      ...Array.from(found).filter((name) => !CLASS_ORDER.includes(name)).sort(),
    ];
  }, [students]);

  // Counts how many students share the same normalized name+class, so the
  // name/class payment-matching fallback (for legacy rows with no student
  // ID) can be restricted to only the unambiguous cases below.
  const nameClassCounts = useMemo(() => {
    const map = new Map<string, number>();
    students.forEach((student) => {
      const key = nameClassKey(getStudentName(student).toLowerCase(), getClassName(student).toLowerCase());
      map.set(key, (map.get(key) || 0) + 1);
    });
    return map;
  }, [students]);

  const feeDebtors = useMemo(() => {
    const rows: FeeDebtor[] = [];

    students.forEach((student) => {
      const studentId = findRealJvsId(student);
      const studentName = getStudentName(student);
      const className = getClassName(student);
      const classRow = classMap.get(className) || null;
      const allowNameFallback =
        (nameClassCounts.get(nameClassKey(studentName.toLowerCase(), className.toLowerCase())) || 0) === 1;

      const payments = feePayments
        .filter((payment) => matchScope(payment, scope, currentTerm, academicYear))
        .filter((payment) => sameStudentPayment(payment, student, studentId, studentName, className, allowNameFallback))
        .sort((a, b) => new Date(paymentDate(b)).getTime() - new Date(paymentDate(a)).getTime());

      const paid = payments.reduce((sum, payment) => sum + numberValue(payment.amount_paid), 0);
      const calc = calculateExpectedFee({ student, classRow, newStudentItems });
      const balance = calc.totalExpected - paid;

      if (balance > 0.009) {
        rows.push({
          studentDbId: String(student.id || ""),
          studentId: studentId || "No JVS ID",
          studentName,
          className,
          studentType: calc.studentType,
          scholarshipLabel: getScholarshipLabel(student),
          expected: calc.totalExpected,
          paid,
          balance,
          arrears: calc.arrears,
          payments,
        });
      }
    });

    return rows.sort((a, b) => b.balance - a.balance);
  }, [students, feePayments, classMap, newStudentItems, scope, currentTerm, academicYear, nameClassCounts]);

  function buildPaymentDebtors(payments: AnyRow[]) {
    const grouped = new Map<string, PaymentDebtor>();

    payments
      .filter((payment) => matchScope(payment, scope, currentTerm, academicYear))
      .filter((payment) => numberValue(payment.balance) > 0.009)
      .forEach((payment) => {
        const studentId = String(payment.student_id || payment.studentId || "No JVS ID").trim();
        const studentName = String(payment.student_name || payment.full_name || payment.name || "-").trim();
        const className = String(payment.class_name || payment.className || payment.class || "-").trim();
        const key = `${studentId}|${studentName}|${className}`;
        const total = numberValue(payment.total_amount || payment.expected_amount || payment.amount || 0);
        const paid = numberValue(payment.amount_paid || payment.paid || 0);
        const balance = numberValue(payment.balance || Math.max(total - paid, 0));

        const existing = grouped.get(key) || {
          studentId,
          studentName,
          className,
          expected: 0,
          paid: 0,
          balance: 0,
          payments: [],
        };

        existing.expected += total;
        existing.paid += paid;
        existing.balance += balance;
        existing.payments.push(payment);
        grouped.set(key, existing);
      });

    return Array.from(grouped.values()).sort((a, b) => b.balance - a.balance);
  }

  const bookDebtors = useMemo(
    () => buildPaymentDebtors(bookPayments),
    [bookPayments, scope, currentTerm, academicYear]
  );

  const uniformDebtors = useMemo(
    () => buildPaymentDebtors(uniformPayments),
    [uniformPayments, scope, currentTerm, academicYear]
  );

  const activeRows = activeTab === "fees" ? feeDebtors : activeTab === "books" ? bookDebtors : uniformDebtors;

  const filteredRows = useMemo(() => {
    const text = search.trim().toLowerCase();

    return activeRows.filter((row) => {
      const classOk = classFilter === "All Classes" || row.className === classFilter;
      const searchOk =
        !text ||
        row.studentName.toLowerCase().includes(text) ||
        row.studentId.toLowerCase().includes(text) ||
        row.className.toLowerCase().includes(text);

      return classOk && searchOk;
    });
  }, [activeRows, search, classFilter]);

  const totalExpected = filteredRows.reduce((sum, row) => sum + numberValue(row.expected), 0);
  const totalPaid = filteredRows.reduce((sum, row) => sum + numberValue(row.paid), 0);
  const totalBalance = filteredRows.reduce((sum, row) => sum + numberValue(row.balance), 0);

  const tabLabel = activeTab === "fees" ? "Fee Debtors" : activeTab === "books" ? "Book Debtors" : "Uniform Debtors";

  if (checkingUser || loading) {
    return <div style={{ padding: "24px" }}>Loading debtors...</div>;
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
      <style jsx global>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }

        input:focus, select:focus {
          border-color: ${COLORS.gold} !important;
          box-shadow: 0 0 0 4px rgba(212, 160, 23, 0.16);
        }

        button, a {
          transition: transform 0.2s ease, box-shadow 0.2s ease, filter 0.2s ease;
        }

        button:hover, a:hover {
          filter: brightness(0.98);
        }

        @media print {
          .no-print { display: none !important; }
          .debtors-shell { display: block !important; }
          .debtors-main { padding: 0 !important; max-width: none !important; }
          .print-card { box-shadow: none !important; border: 1px solid #ddd !important; }
          body { background: #fff !important; }
        }

        @media (max-width: 900px) {
          .debtors-shell { flex-direction: column; }
          .debtors-sidebar {
            width: auto !important;
            position: relative !important;
            min-height: auto !important;
          }
          .debtors-main { padding: 16px !important; }
          .debtors-summary { grid-template-columns: 1fr !important; }
          .debtors-filters { grid-template-columns: 1fr !important; }
          .debtors-table-wrap { overflow-x: auto; }
          .debtors-table { min-width: 980px; }
        }
      `}</style>

      <div className="debtors-shell" style={{ display: "flex", minHeight: "100vh" }}>
        <aside
          className="debtors-sidebar no-print"
          style={{
            width: "clamp(220px, 22vw, 270px)",
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
            <h1 style={{ margin: "6px 0 0", fontSize: "24px", lineHeight: 1.2 }}>Debtors</h1>
            <p style={{ margin: "10px 0 0", fontSize: "13px", opacity: 0.85 }}>{schoolName}</p>
            <p style={{ margin: "4px 0 0", fontSize: "12px", color: COLORS.goldSoft }}>
              {academicYear || "-"} • {currentTerm || "-"}
            </p>
            {showingCachedData && (
              <p style={{ margin: "8px 0 0", fontSize: "12px", opacity: 0.85, color: COLORS.goldSoft }}>
                Showing last synced data
              </p>
            )}
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
            <p style={{ margin: 0, fontSize: "12px", color: COLORS.goldSoft }}>Important</p>
            <p style={{ margin: "8px 0 0", fontSize: "13px", lineHeight: 1.5 }}>
              Fees, books and uniforms are shown separately. Nothing is combined into one balance.
            </p>
          </div>
        </aside>

        <section className="debtors-main" style={{ flex: 1, padding: "28px", maxWidth: "1500px" }}>
          <div
            className="print-card"
            style={{
              background: `linear-gradient(135deg, ${COLORS.sidebar} 0%, #1f2937 100%)`,
              color: "#fff",
              padding: "24px",
              borderRadius: "22px",
              marginBottom: "24px",
              border: `2px solid ${COLORS.gold}`,
              boxShadow: "0 18px 35px rgba(0,0,0,0.08)",
              animation: "fadeUp 0.35s ease both",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: "16px", flexWrap: "wrap", alignItems: "center" }}>
              <div>
                <h2 style={{ margin: 0, fontSize: "30px" }}>{tabLabel}</h2>
                <p style={{ margin: "8px 0 0", color: "#d1d5db" }}>
                  Students owing are listed separately by Fees, Books and Uniforms.
                </p>
              </div>

              <div className="no-print" style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                <button onClick={() => window.print()} style={primaryButtonStyle(true)}>
                  Print List
                </button>
                <Link href="/fees/admin" style={{ ...primaryButtonStyle(false), textDecoration: "none" }}>
                  Back
                </Link>
              </div>
            </div>
          </div>

          {message && (
            <div
              style={{
                background: message.startsWith("Error:") ? COLORS.dangerBg : COLORS.successBg,
                color: message.startsWith("Error:") ? COLORS.dangerText : COLORS.successText,
                borderRadius: "14px",
                padding: "14px 16px",
                marginBottom: "20px",
                fontWeight: 900,
              }}
            >
              {message}
            </div>
          )}

          {uniformWarning && activeTab === "uniforms" && (
            <div
              style={{
                background: COLORS.warningBg,
                color: COLORS.warningText,
                borderRadius: "14px",
                padding: "14px 16px",
                marginBottom: "20px",
                fontWeight: 800,
              }}
            >
              {uniformWarning}
            </div>
          )}

          <div className="no-print" style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginBottom: "18px" }}>
            <button onClick={() => setActiveTab("fees")} style={primaryButtonStyle(activeTab === "fees")}>
              Fees ({feeDebtors.length})
            </button>
            <button onClick={() => setActiveTab("books")} style={primaryButtonStyle(activeTab === "books")}>
              Books ({bookDebtors.length})
            </button>
            <button onClick={() => setActiveTab("uniforms")} style={primaryButtonStyle(activeTab === "uniforms")}>
              Uniforms ({uniformDebtors.length})
            </button>
          </div>

          <div
            className="debtors-summary"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
              gap: "16px",
              marginBottom: "20px",
            }}
          >
            <SummaryCard label="Debtors" value={String(filteredRows.length)} tone="blue" />
            <SummaryCard label="Expected" value={money(totalExpected)} tone="neutral" />
            <SummaryCard label="Paid" value={money(totalPaid)} tone="success" />
            <SummaryCard label="Balance Owing" value={money(totalBalance)} tone="danger" />
          </div>

          <div
            className="debtors-filters no-print"
            style={{
              display: "grid",
              gridTemplateColumns: "1.5fr 260px 220px",
              gap: "12px",
              marginBottom: "18px",
              background: COLORS.card,
              padding: "16px",
              borderRadius: "18px",
              border: `1px solid ${COLORS.border}`,
              boxShadow: "0 14px 30px rgba(15,23,42,0.06)",
            }}
          >
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, JVS ID or class..."
              style={{
                height: "46px",
                borderRadius: "14px",
                border: `1px solid ${COLORS.border}`,
                padding: "0 14px",
                outline: "none",
                fontWeight: 700,
              }}
            />

            <select
              value={classFilter}
              onChange={(e) => setClassFilter(e.target.value)}
              style={{
                height: "46px",
                borderRadius: "14px",
                border: `1px solid ${COLORS.border}`,
                padding: "0 14px",
                outline: "none",
                fontWeight: 800,
                background: "#fff",
              }}
            >
              {classOptions.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>

            <select
              value={scope}
              onChange={(e) => setScope(e.target.value as Scope)}
              style={{
                height: "46px",
                borderRadius: "14px",
                border: `1px solid ${COLORS.border}`,
                padding: "0 14px",
                outline: "none",
                fontWeight: 800,
                background: "#fff",
              }}
            >
              <option value="current">Current Term</option>
              <option value="all">All History</option>
            </select>
          </div>

          <div
            className="print-card debtors-table-wrap"
            style={{
              background: COLORS.card,
              borderRadius: "22px",
              border: `1px solid ${COLORS.border}`,
              boxShadow: "0 18px 38px rgba(15,23,42,0.08)",
              overflow: "hidden",
              animation: "fadeUp 0.45s ease both",
            }}
          >
            <table className="debtors-table" style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#f9fafb" }}>
                  <Th>#</Th>
                  <Th>Student</Th>
                  <Th>JVS ID</Th>
                  <Th>Class</Th>
                  {activeTab === "fees" && <Th>Setup</Th>}
                  <Th>Expected</Th>
                  <Th>Paid</Th>
                  <Th>Owing</Th>
                  <Th>Last Payment</Th>
                  <Th>Action</Th>
                </tr>
              </thead>

              <tbody>
                {filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={activeTab === "fees" ? 10 : 9} style={{ padding: "30px", textAlign: "center", color: COLORS.muted, fontWeight: 800 }}>
                      No debtors found for this filter.
                    </td>
                  </tr>
                ) : (
                  filteredRows.map((row, index) => {
                    const lastPayment = row.payments[0];
                    const accountHref = `/fees/admin/student-accounts?student=${encodeURIComponent(row.studentId)}`;

                    return (
                      <tr key={`${row.studentId}-${row.studentName}-${index}`} style={{ borderTop: `1px solid ${COLORS.border}` }}>
                        <Td>{index + 1}</Td>
                        <Td>
                          <b>{row.studentName}</b>
                        </Td>
                        <Td>
                          <span style={{ fontWeight: 900, color: COLORS.blueText }}>{row.studentId}</span>
                        </Td>
                        <Td>{row.className || "-"}</Td>
                        {activeTab === "fees" && (
                          <Td>
                            <div style={{ fontWeight: 800 }}>{(row as FeeDebtor).studentType}</div>
                            <div style={{ marginTop: "4px", fontSize: "12px", color: COLORS.muted }}>
                              {(row as FeeDebtor).scholarshipLabel}
                            </div>
                            {(row as FeeDebtor).arrears > 0 && (
                              <div style={{ marginTop: "4px", fontSize: "12px", color: COLORS.dangerText, fontWeight: 800 }}>
                                Arrears: {money((row as FeeDebtor).arrears)}
                              </div>
                            )}
                          </Td>
                        )}
                        <Td>{money(row.expected)}</Td>
                        <Td>{money(row.paid)}</Td>
                        <Td>
                          <span
                            style={{
                              display: "inline-block",
                              background: COLORS.dangerBg,
                              color: COLORS.dangerText,
                              padding: "7px 10px",
                              borderRadius: "999px",
                              fontWeight: 900,
                            }}
                          >
                            {money(row.balance)}
                          </span>
                        </Td>
                        <Td>
                          {lastPayment ? (
                            <div>
                              <div>{formatDate(paymentDate(lastPayment))}</div>
                              <div style={{ color: COLORS.muted, fontSize: "12px", marginTop: "4px" }}>{safeReceipt(lastPayment)}</div>
                            </div>
                          ) : (
                            "No payment"
                          )}
                        </Td>
                        <Td>
                          <Link
                            href={accountHref}
                            className="no-print"
                            style={{
                              display: "inline-block",
                              textDecoration: "none",
                              background: COLORS.sidebar,
                              color: "#fff",
                              padding: "9px 12px",
                              borderRadius: "12px",
                              fontWeight: 900,
                              fontSize: "13px",
                            }}
                          >
                            View Account
                          </Link>
                        </Td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}

function SummaryCard({ label, value, tone }: { label: string; value: string; tone: "danger" | "success" | "blue" | "neutral" }) {
  const bg = tone === "danger" ? COLORS.dangerBg : tone === "success" ? COLORS.successBg : tone === "blue" ? COLORS.blueBg : "#fff";
  const color = tone === "danger" ? COLORS.dangerText : tone === "success" ? COLORS.successText : tone === "blue" ? COLORS.blueText : COLORS.text;

  return (
    <div
      className="print-card"
      style={{
        background: bg,
        border: `1px solid ${COLORS.border}`,
        borderRadius: "20px",
        padding: "18px",
        boxShadow: "0 14px 30px rgba(15,23,42,0.06)",
        animation: "fadeUp 0.35s ease both",
      }}
    >
      <p style={{ margin: 0, color: COLORS.muted, fontWeight: 900, fontSize: "13px" }}>{label}</p>
      <h3 style={{ margin: "8px 0 0", fontSize: "24px", color }}>{value}</h3>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th
      style={{
        textAlign: "left",
        padding: "14px",
        fontSize: "13px",
        color: COLORS.muted,
        textTransform: "uppercase",
        letterSpacing: "0.04em",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </th>
  );
}

function Td({ children }: { children: React.ReactNode }) {
  return (
    <td
      style={{
        padding: "14px",
        fontSize: "14px",
        verticalAlign: "top",
      }}
    >
      {children}
    </td>
  );
}
