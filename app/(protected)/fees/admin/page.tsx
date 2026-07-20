"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import {
  getUniversalReceiptSuggestions,
  searchUniversalReceipt,
  type UniversalPayment,
  type UniversalReceiptResult,
} from "@/lib/universalReceiptSearch";

type AnyRow = Record<string, any>;

type PaymentStatus = "paid" | "part" | "unpaid";

type StudentFinanceRow = AnyRow & {
  className: string;
  studentId: string;
  internalId: string;
  totalOwed: number;
  totalPaid: number;
  balance: number;
  paymentStatus: PaymentStatus;
  setupLabel: string;
};

const COLORS = {
  bg: "#f7f4ec",
  sidebar: "#0f172a",
  sidebarSoft: "#111827",
  gold: "#d4a017",
  card: "#ffffff",
  text: "#111827",
  muted: "#6b7280",
  border: "#e5e7eb",
  dangerBg: "#fee2e2",
  dangerText: "#991b1b",
  successBg: "#dcfce7",
  successText: "#166534",
};

function getRole(row: AnyRow | null) {
  const raw = String(row?.role || "").trim().toLowerCase();
  if (raw === "owner" || raw === "admin" || raw === "headmaster") return raw;
  return "teacher";
}

function cleanText(value: unknown) {
  return String(value || "").trim();
}

function normalizeText(value: unknown) {
  return cleanText(value).toLowerCase();
}

function getClassName(row: AnyRow) {
  return cleanText(row.class_name || row.className || row.class || row.name);
}

function findRealJvsId(row: AnyRow) {
  const possible = [
    row.jvs_id,
    row.student_id,
    row.studentId,
    row.jsms_id,
    row.jvs_student_id,
    row.jvs_code,
    row.student_code,
    row.student_number,
    row.admission_number,
    row.index_number,
    row.id_number,
  ];

  for (const value of possible) {
    const text = cleanText(value).replace(/\s+/g, "").toUpperCase();
    if (text.startsWith("JVS")) return text;
  }

  for (const value of Object.values(row)) {
    const match = cleanText(value).match(/JVS\s*\d{4,}/i);
    if (match) return match[0].replace(/\s+/g, "").toUpperCase();
  }

  return "";
}

function getStudentDisplayId(row: AnyRow) {
  return findRealJvsId(row) || cleanText(row.student_id || row.studentId || "-");
}

function numberValue(value: unknown) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

function formatMoney(value: number) {
  return `GHS ${Number(value || 0).toFixed(2)}`;
}

function getPaymentAmount(row: AnyRow) {
  return numberValue(row.amount_paid || row.paid_amount || row.amount || row.payment_amount);
}

function getPaymentStatus(balance: number, totalPaid: number): PaymentStatus {
  if (balance <= 0) return "paid";
  if (totalPaid > 0) return "part";
  return "unpaid";
}

function getPaymentStatusLabel(status: PaymentStatus) {
  if (status === "paid") return "Paid";
  if (status === "part") return "Part Paid";
  return "Unpaid";
}

function buildReceiptNo(payment: AnyRow) {
  return cleanText(
    payment.receipt_no ||
      payment.receipt_number ||
      payment.receipt ||
      payment.reference ||
      payment.id
  );
}

function getPaymentDate(payment: AnyRow) {
  return cleanText(payment.payment_date || payment.created_at || "-");
}

function formatDateTime(value: string) {
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

function isStudentActive(student: AnyRow) {
  if (typeof student.active === "boolean") return student.active;
  if (typeof student.is_active === "boolean") return student.is_active;
  if (typeof student.status === "string") {
    const status = normalizeText(student.status);
    return status !== "inactive" && status !== "deleted" && status !== "graduated";
  }
  return true;
}

function paymentBelongsToStudent(payment: AnyRow, student: AnyRow) {
  const studentInternalId = cleanText(student.id);
  const studentJvsId = findRealJvsId(student);
  const studentName = normalizeText(student.full_name || student.student_name || student.name);
  const studentClass = normalizeText(getClassName(student));

  const paymentStudentId = cleanText(payment.student_id || payment.studentId || payment.jvs_id || payment.jvs_student_id);
  const paymentStudentName = normalizeText(payment.student_name || payment.full_name || payment.name);
  const paymentClass = normalizeText(payment.class_name || payment.className || payment.class);

  if (studentJvsId && paymentStudentId.toUpperCase() === studentJvsId.toUpperCase()) return true;
  if (studentInternalId && paymentStudentId === studentInternalId) return true;

  // Old rows sometimes saved name/class only. This keeps old payments alive.
  if (studentName && paymentStudentName && studentName === paymentStudentName) {
    if (!studentClass || !paymentClass || studentClass === paymentClass) return true;
  }

  return false;
}

function getClassFee(row: AnyRow | null, isNew: boolean) {
  if (!row) return 0;

  if (isNew) {
    return numberValue(
      row.fee_new ||
        row.new_fee ||
        row.new_student_fee ||
        row.newStudentFee ||
        row.admission_fee_total
    );
  }

  return numberValue(
    row.fee_returning ||
      row.fee_continuing ||
      row.continuing_fee ||
      row.returning_fee ||
      row.normal_fee ||
      row.amount
  );
}

function getArrears(student: AnyRow) {
  return numberValue(student.arrears || student.fee_arrears || student.previous_balance || student.old_balance);
}

function getStudentSpecificFee(student: AnyRow) {
  return numberValue(
    student.custom_fee_amount ||
      student.custom_fee ||
      student.fee_amount ||
      student.special_fee_amount ||
      student.expected_fee ||
      student.term_fee
  );
}

function calcStudentFinancials(student: AnyRow, classRow: AnyRow | null, payments: AnyRow[]) {
  const isNew = Boolean(student.is_new || student.isNew || student.student_type === "new");
  let baseFee = getClassFee(classRow, isNew);
  let setupLabel = isNew ? "New Student" : "Continuous Student";

  const scholarshipType = normalizeText(student.scholarship_type || student.scholarship || student.fee_type);
  const specificFee = getStudentSpecificFee(student);

  if (scholarshipType === "full" || scholarshipType === "full scholarship") {
    baseFee = 0;
    setupLabel = "Full Scholarship";
  } else if (scholarshipType === "half" || scholarshipType === "half scholarship") {
    baseFee = baseFee / 2;
    setupLabel = "Half Scholarship";
  } else if (scholarshipType === "custom" || scholarshipType === "custom amount" || scholarshipType === "special") {
    baseFee = specificFee;
    setupLabel = "Custom Fee";
  } else if (specificFee > 0 && Boolean(student.has_custom_fee || student.custom_fee_amount || student.custom_fee)) {
    baseFee = specificFee;
    setupLabel = "Custom Fee";
  }

  const arrears = getArrears(student);
  const totalOwed = Math.max(baseFee + arrears, 0);
  const totalPaid = payments.reduce((sum, row) => sum + getPaymentAmount(row), 0);
  const balance = totalOwed - totalPaid;
  const paymentStatus = getPaymentStatus(balance, totalPaid);

  return { totalOwed, totalPaid, balance, paymentStatus, setupLabel };
}

export default function FeesAdminPage() {
  const router = useRouter();

  const [checkingUser, setCheckingUser] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [settingsRow, setSettingsRow] = useState<AnyRow | null>(null);
  const [classes, setClasses] = useState<AnyRow[]>([]);
  const [students, setStudents] = useState<AnyRow[]>([]);
  const [payments, setPayments] = useState<AnyRow[]>([]);

  const [receiptSearch, setReceiptSearch] = useState("");
  const [receiptSuggestions, setReceiptSuggestions] = useState<UniversalPayment[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [searchingReceipt, setSearchingReceipt] = useState(false);
  const [universalResult, setUniversalResult] = useState<UniversalReceiptResult | null>(null);

  useEffect(() => {
    let active = true;

    async function checkAndLoad() {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!active) return;

        if (!session?.user) {
          router.replace("/");
          return;
        }

        const [teachersRes, settingsRes, classesRes, studentsRes, paymentsRes] = await Promise.all([
          supabase.from("teachers").select("*"),
          supabase.from("school_settings").select("*").limit(1).maybeSingle(),
          supabase.from("classes").select("*"),
          supabase.from("active_students").select("*"),
          supabase.from("fee_payments").select("*").order("created_at", { ascending: false }),
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
              normalizeText(item.email) === normalizeText(session.user.email)
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

        if (settingsRes.error) throw settingsRes.error;
        if (classesRes.error) throw classesRes.error;
        if (studentsRes.error) throw studentsRes.error;
        if (paymentsRes.error) throw paymentsRes.error;

        setSettingsRow(settingsRes.data || null);
        setClasses(classesRes.data || []);
        setStudents(studentsRes.data || []);
        setPayments(paymentsRes.data || []);
        setLoadError("");
      } catch (error: any) {
        console.error(error);
        setLoadError(error?.message || "Failed to load fees dashboard.");
      } finally {
        if (active) {
          setCheckingUser(false);
          setLoading(false);
        }
      }
    }

    void checkAndLoad();

    return () => {
      active = false;
    };
  }, [router]);

  useEffect(() => {
    const timer = setTimeout(async () => {
      const value = receiptSearch.trim();

      if (!value) {
        setReceiptSuggestions([]);
        return;
      }

      const suggestions = await getUniversalReceiptSuggestions(value);
      setReceiptSuggestions(suggestions);
      setShowSuggestions(true);
    }, 250);

    return () => clearTimeout(timer);
  }, [receiptSearch]);

  const schoolName = cleanText(settingsRow?.school_name || "JEFSEM VISION SCHOOL");
  const motto = cleanText(settingsRow?.motto || "Success in Excellence");
  const academicYear = cleanText(settingsRow?.academic_year || "");
  const currentTerm = cleanText(settingsRow?.current_term || "");

  const currentTermPayments = useMemo(() => {
    return payments.filter((row) => {
      const paymentYear = cleanText(row.academic_year);
      const paymentTerm = cleanText(row.term);

      if (!academicYear && !currentTerm) return true;
      return paymentYear === academicYear && paymentTerm === currentTerm;
    });
  }, [payments, academicYear, currentTerm]);

  const classMap = useMemo(() => {
    const map = new Map<string, AnyRow>();
    classes.forEach((row) => map.set(getClassName(row), row));
    return map;
  }, [classes]);

  const studentRows = useMemo<StudentFinanceRow[]>(() => {
    return students
      .filter(isStudentActive)
      .map((student) => {
        const studentId = getStudentDisplayId(student);
        const className = getClassName(student);
        const classRow = classMap.get(className) || null;
        const studentPayments = currentTermPayments.filter((row) => paymentBelongsToStudent(row, student));
        const finance = calcStudentFinancials(student, classRow, studentPayments);

        return {
          ...student,
          className,
          studentId,
          internalId: cleanText(student.id),
          ...finance,
        } as StudentFinanceRow;
      })
      .sort((a, b) => cleanText(a.full_name || a.student_name).localeCompare(cleanText(b.full_name || b.student_name)));
  }, [students, classMap, currentTermPayments]);

  const summary = useMemo(() => {
    const totalFeesDue = studentRows.reduce((sum, row) => sum + row.totalOwed, 0);
    const totalCollected = studentRows.reduce((sum, row) => sum + row.totalPaid, 0);
    const outstanding = studentRows.reduce((sum, row) => sum + Math.max(row.balance, 0), 0);
    const studentsPaid = studentRows.filter((row) => row.paymentStatus === "paid").length;
    const studentsPart = studentRows.filter((row) => row.paymentStatus === "part").length;
    const studentsUnpaid = studentRows.filter((row) => row.paymentStatus === "unpaid").length;
    const todayIso = new Date().toISOString().split("T")[0];
    const todaysPaymentsValue = currentTermPayments
      .filter((row) => cleanText(row.payment_date || row.created_at).slice(0, 10) === todayIso)
      .reduce((sum, row) => sum + getPaymentAmount(row), 0);

    return {
      totalFeesDue,
      totalCollected,
      outstanding,
      totalStudents: studentRows.length,
      studentsPaid,
      studentsPart,
      studentsUnpaid,
      todaysPaymentsValue,
    };
  }, [studentRows, currentTermPayments]);

  const recentPayments = useMemo(() => {
    return [...currentTermPayments]
      .sort((a, b) => {
        const aDate = new Date(cleanText(a.created_at || a.payment_date)).getTime();
        const bDate = new Date(cleanText(b.created_at || b.payment_date)).getTime();
        return bDate - aDate;
      })
      .slice(0, 8);
  }, [currentTermPayments]);

  const topDebtors = useMemo(() => {
    return [...studentRows]
      .filter((row) => row.balance > 0)
      .sort((a, b) => b.balance - a.balance)
      .slice(0, 8);
  }, [studentRows]);

  const classFeePreview = useMemo(() => {
    return [...classes]
      .map((row) => ({
        className: getClassName(row),
        feeReturning: getClassFee(row, false),
        feeNew: getClassFee(row, true),
      }))
      .filter((row) => row.className)
      .sort((a, b) => a.className.localeCompare(b.className));
  }, [classes]);

  async function handleReceiptSearch(value?: string) {
    const receiptValue = cleanText(value || receiptSearch);

    if (!receiptValue) {
      alert("Enter a receipt number first.");
      return;
    }

    setSearchingReceipt(true);
    setShowSuggestions(false);

    const result = await searchUniversalReceipt(receiptValue);

    setUniversalResult(result);
    setSearchingReceipt(false);
  }

  if (checkingUser || loading) {
    return <div style={{ padding: "24px" }}>Loading fees dashboard...</div>;
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
        @keyframes feeCardIn {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .summary-card-link:hover {
          transform: translateY(-6px);
          box-shadow: 0 22px 45px rgba(15, 23, 42, 0.14) !important;
          border-color: ${COLORS.gold} !important;
        }
        .summary-card-link:active {
          transform: translateY(-2px);
        }
        input:focus {
          border-color: ${COLORS.gold} !important;
          box-shadow: 0 0 0 4px rgba(212, 160, 23, 0.16);
        }
        @media (max-width: 980px) {
          .fees-shell { flex-direction: column; height: auto !important; }
          .fees-sidebar { width: auto !important; }
          .fees-content { height: auto !important; padding: 16px !important; }
          .dashboard-two-col { grid-template-columns: 1fr !important; }
        }
      `}</style>

      <div className="fees-shell" style={{ display: "flex", height: "100%" }}>
        <aside
          className="fees-sidebar"
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
            <p style={{ margin: 0, fontSize: "12px", opacity: 0.8 }}>Fees Module</p>
            <h1 style={{ margin: "6px 0 0", fontSize: "24px", lineHeight: 1.2 }}>Admin Panel</h1>
            <p style={{ margin: "10px 0 0", fontSize: "13px", opacity: 0.85 }}>{schoolName}</p>
            <p style={{ margin: "4px 0 0", fontSize: "12px", color: "#f5e7b7" }}>
              {academicYear || "-"} • {currentTerm || "-"}
            </p>
          </div>

          <div style={{ display: "grid", gap: "10px" }}>
            <ActionLink href="/fees/admin" label="Dashboard" active />
            <ActionLink href="/fees/admin/record-payment" label="Record Payment" />
            <ActionLink href="/fees/admin/fee-structure" label="Fee Structure" />
            <ActionLink href="/fees/admin/student-accounts" label="Student Accounts" />
            <ActionLink href="/fees/admin/debtors" label="Debtors" />
            <ActionLink href="/fees/admin/receipts" label="Receipts" />
            <ActionLink href="/fees/admin/reports" label="Reports" />
            <ActionLink href="/fees/admin/fee-reminder" label="Fee Reminder" />
          </div>
        </aside>

        <section
          className="fees-content"
          style={{
            flex: 1,
            height: "100%",
            overflowY: "auto",
            padding: "24px",
          }}
        >
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
            <div style={{ display: "flex", justifyContent: "space-between", gap: "16px", flexWrap: "wrap", alignItems: "center" }}>
              <div>
                <h2 style={{ margin: 0, fontSize: "30px" }}>Fees Dashboard</h2>
                <p style={{ margin: "8px 0 0", color: "#d1d5db" }}>{motto}</p>
              </div>

              <Link href="/dashboard/admin" style={topButtonStyle}>
                JSMS Dashboard
              </Link>
            </div>
          </div>

          {loadError && (
            <div style={{ background: COLORS.dangerBg, color: COLORS.dangerText, borderRadius: "14px", padding: "14px 16px", marginBottom: "18px", fontWeight: "bold" }}>
              {loadError}
            </div>
          )}

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: "16px",
              marginBottom: "24px",
            }}
          >
            <SummaryCard title="Total Fees Due" value={formatMoney(summary.totalFeesDue)} href="/fees/admin/fee-structure" note="Open fee setup" />
            <SummaryCard title="Total Collected" value={formatMoney(summary.totalCollected)} href="/fees/admin/receipts" note="View receipts" />
            <SummaryCard title="Outstanding" value={formatMoney(summary.outstanding)} href="/fees/admin/debtors?type=fees" note="View debtors" danger />
            <SummaryCard title="Total Students" value={summary.totalStudents} href="/fees/admin/student-accounts" note="Open accounts" />
            <SummaryCard title="Students Paid" value={summary.studentsPaid} href="/fees/admin/student-accounts?status=paid" note="Paid accounts" success />
            <SummaryCard title="Students Part Paid" value={summary.studentsPart} href="/fees/admin/debtors?status=part" note="Part paid debtors" />
            <SummaryCard title="Students Unpaid" value={summary.studentsUnpaid} href="/fees/admin/debtors?status=unpaid" note="Unpaid debtors" danger />
            <SummaryCard title="Today's Payments" value={formatMoney(summary.todaysPaymentsValue)} href="/fees/admin/reports?range=today" note="Today report" success />
          </div>

          <Section title="Receipt Search">
            <div style={{ position: "relative", display: "flex", gap: "10px" }}>
              <input
                type="text"
                placeholder="Search receipt number, student ID, student name, module"
                value={receiptSearch}
                onChange={(e) => {
                  setReceiptSearch(e.target.value);
                  setShowSuggestions(true);
                }}
                onFocus={() => setShowSuggestions(true)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleReceiptSearch();
                }}
                style={inputStyle}
              />

              <button
                type="button"
                onClick={() => void handleReceiptSearch()}
                disabled={searchingReceipt}
                style={{
                  border: "none",
                  borderRadius: "12px",
                  background: COLORS.sidebar,
                  color: "#fff",
                  padding: "0 18px",
                  fontWeight: "bold",
                  cursor: searchingReceipt ? "not-allowed" : "pointer",
                  opacity: searchingReceipt ? 0.65 : 1,
                  whiteSpace: "nowrap",
                }}
              >
                {searchingReceipt ? "Searching..." : "Search"}
              </button>

              {showSuggestions && receiptSuggestions.length > 0 && (
                <div
                  style={{
                    position: "absolute",
                    top: "54px",
                    left: 0,
                    right: "110px",
                    background: "#fff",
                    border: `1px solid ${COLORS.border}`,
                    borderRadius: "14px",
                    boxShadow: "0 18px 35px rgba(0,0,0,0.12)",
                    zIndex: 20,
                    maxHeight: "260px",
                    overflowY: "auto",
                  }}
                >
                  {receiptSuggestions.map((item) => (
                    <button
                      key={`${item.module}-${item.receipt_number}-${item.id}`}
                      type="button"
                      onClick={() => {
                        setReceiptSearch(item.receipt_number);
                        setShowSuggestions(false);
                        void handleReceiptSearch(item.receipt_number);
                      }}
                      style={{
                        display: "block",
                        width: "100%",
                        textAlign: "left",
                        border: "none",
                        borderBottom: `1px solid ${COLORS.border}`,
                        background: "#fff",
                        padding: "12px 14px",
                        cursor: "pointer",
                      }}
                    >
                      <strong>{item.receipt_number}</strong>
                      <p style={{ margin: "4px 0 0", fontSize: "12px", color: COLORS.muted }}>
                        {item.module} • {item.student_name || "-"} • {formatMoney(item.amount_paid)}
                      </p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </Section>

          <div className="dashboard-two-col" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "20px", marginBottom: "20px" }}>
            <Section title="Recent Payments">
              <ReportTable
                headers={["Receipt", "Student", "Class", "Amount", "Date"]}
                rows={recentPayments.map((row) => [
                  buildReceiptNo(row),
                  cleanText(row.student_name || row.full_name || "-"),
                  cleanText(row.class_name || row.className || "-"),
                  formatMoney(getPaymentAmount(row)),
                  getPaymentDate(row),
                ])}
              />
            </Section>

            <Section title="Top Debtors">
              <ReportTable
                headers={["Student", "JVS ID", "Class", "Setup", "Expected", "Paid", "Balance", "Status"]}
                rows={topDebtors.map((row) => [
                  cleanText(row.full_name || row.student_name || row.name || "-"),
                  row.studentId || "-",
                  row.className || "-",
                  row.setupLabel,
                  formatMoney(row.totalOwed),
                  formatMoney(row.totalPaid),
                  formatMoney(row.balance),
                  getPaymentStatusLabel(row.paymentStatus),
                ])}
              />
            </Section>
          </div>

          <Section title="Class Fee Preview">
            <ReportTable
              headers={["Class", "Continuous Fee", "New Student Fee"]}
              rows={classFeePreview.map((row) => [row.className, formatMoney(row.feeReturning), formatMoney(row.feeNew)])}
            />
          </Section>
        </section>
      </div>

      {universalResult && <ReceiptModal result={universalResult} onClose={() => setUniversalResult(null)} />}
    </main>
  );
}

function ReceiptModal({ result, onClose }: { result: UniversalReceiptResult; onClose: () => void }) {
  const searchedReceipt = result.searchedReceipt;
  const payments = result.studentPayments || [];
  const totalPaid = payments.reduce((sum, payment) => sum + Number(payment.amount_paid || 0), 0);

  return (
    <div onClick={onClose} style={overlayStyle}>
      <div onClick={(e) => e.stopPropagation()} style={modalCardStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "start", marginBottom: "18px" }}>
          <div>
            <p style={{ margin: 0, color: COLORS.gold, fontWeight: "bold" }}>Receipt Details</p>
            <h3 style={{ margin: "6px 0 0", color: COLORS.sidebar }}>{searchedReceipt ? searchedReceipt.receipt_number : "Not Found"}</h3>
          </div>

          <button onClick={onClose} style={closeButtonStyle}>Close</button>
        </div>

        {result.error ? (
          <div style={{ background: COLORS.dangerBg, color: COLORS.dangerText, borderRadius: "14px", padding: "14px", fontWeight: "bold" }}>
            {result.error}
          </div>
        ) : searchedReceipt ? (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "14px", marginBottom: "18px" }}>
              <MiniInfo label="Student" value={searchedReceipt.student_name} />
              <MiniInfo label="Student ID" value={searchedReceipt.student_id} />
              <MiniInfo label="Class" value={searchedReceipt.class_name} />
              <MiniInfo label="Found In" value={searchedReceipt.module} />
              <MiniInfo label="Receipt Amount" value={formatMoney(searchedReceipt.amount_paid)} />
              <MiniInfo label="Total Paid" value={formatMoney(totalPaid)} />
            </div>

            <h4 style={{ margin: "0 0 8px", color: COLORS.sidebar }}>Searched Receipt</h4>
            <PaymentTable payments={[searchedReceipt]} />

            <h4 style={{ margin: "18px 0 8px", color: COLORS.sidebar }}>All Payments By This Student</h4>
            <PaymentTable payments={payments} />
          </>
        ) : null}
      </div>
    </div>
  );
}

function PaymentTable({ payments }: { payments: UniversalPayment[] }) {
  if (payments.length === 0) return <p style={{ color: COLORS.muted }}>No payments found.</p>;

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
        <thead>
          <tr style={{ background: "#fff7cc" }}>
            <th style={thStyle}>Module</th>
            <th style={thStyle}>Receipt</th>
            <th style={thStyle}>Item</th>
            <th style={thStyle}>Amount</th>
            <th style={thStyle}>Term</th>
            <th style={thStyle}>Date</th>
          </tr>
        </thead>

        <tbody>
          {payments.map((payment) => (
            <tr key={`${payment.module}-${payment.receipt_number}-${payment.id}`}>
              <td style={tdStyle}>{payment.module}</td>
              <td style={tdStyle}>{payment.receipt_number}</td>
              <td style={tdStyle}>{payment.item_name || "-"}</td>
              <td style={tdStyle}>{formatMoney(payment.amount_paid)}</td>
              <td style={tdStyle}>{payment.term || "-"}</td>
              <td style={tdStyle}>{formatDateTime((payment as any).payment_date || (payment as any).created_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
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
        border: active ? `2px solid ${COLORS.gold}` : "1px solid rgba(255,255,255,0.08)",
        display: "block",
      }}
    >
      {label}
    </Link>
  );
}

function SummaryCard({
  title,
  value,
  href,
  note,
  danger = false,
  success = false,
}: {
  title: string;
  value: string | number;
  href: string;
  note?: string;
  danger?: boolean;
  success?: boolean;
}) {
  const accent = danger ? "#dc2626" : success ? "#16a34a" : COLORS.gold;

  return (
    <Link
      href={href}
      className="summary-card-link"
      style={{
        textDecoration: "none",
        color: COLORS.text,
        background: danger ? "#fff7f7" : success ? "#f0fdf4" : COLORS.card,
        borderRadius: "18px",
        padding: "18px",
        boxShadow: "0 10px 25px rgba(0,0,0,0.06)",
        border: `1px solid ${COLORS.border}`,
        position: "relative",
        overflow: "hidden",
        display: "block",
        minHeight: "118px",
        animation: "feeCardIn 0.35s ease both",
        transition: "transform 0.22s ease, box-shadow 0.22s ease, border-color 0.22s ease",
      }}
    >
      <div style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "5px", background: accent }} />
      <p style={{ margin: 0, fontSize: "14px", color: COLORS.muted }}>{title}</p>
      <h2 style={{ margin: "10px 0 0", color: COLORS.sidebar, fontSize: "28px" }}>{value}</h2>
      {note && <p style={{ margin: "8px 0 0", color: COLORS.muted, fontSize: "12px", fontWeight: "bold" }}>{note} →</p>}
    </Link>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        background: COLORS.card,
        borderRadius: "20px",
        padding: "20px",
        boxShadow: "0 10px 25px rgba(0,0,0,0.06)",
        border: `1px solid ${COLORS.border}`,
        overflowX: "visible",
        marginBottom: "20px",
      }}
    >
      <h3 style={{ marginTop: 0, color: COLORS.sidebar }}>{title}</h3>
      {children}
    </div>
  );
}

function ReportTable({ headers, rows }: { headers: string[]; rows: React.ReactNode[][] }) {
  return rows.length === 0 ? (
    <p style={{ color: COLORS.muted, marginBottom: 0 }}>No data found.</p>
  ) : (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px" }}>
        <thead>
          <tr style={{ background: "#fff7cc" }}>
            {headers.map((header) => (
              <th key={header} style={thStyle}>{header}</th>
            ))}
          </tr>
        </thead>

        <tbody>
          {rows.map((row, index) => (
            <tr key={index}>
              {row.map((cell, cellIndex) => (
                <td key={cellIndex} style={tdStyle}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MiniInfo({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: "#f9fafb", border: `1px solid ${COLORS.border}`, borderRadius: "12px", padding: "10px 12px" }}>
      <p style={{ margin: 0, fontSize: "11px", color: COLORS.muted }}>{label}</p>
      <p style={{ margin: "5px 0 0", fontWeight: "bold", color: COLORS.sidebar, fontSize: "14px" }}>{value || "-"}</p>
    </div>
  );
}

const topButtonStyle: React.CSSProperties = {
  textDecoration: "none",
  border: "1px solid rgba(255,255,255,0.15)",
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

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "14px",
  borderRadius: "12px",
  border: "1px solid #d1d5db",
  fontSize: "16px",
  outline: "none",
};

const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "12px",
  borderBottom: "1px solid #e5e7eb",
  whiteSpace: "nowrap",
};

const tdStyle: React.CSSProperties = {
  padding: "12px",
  borderBottom: "1px solid #f0f0f0",
  whiteSpace: "nowrap",
};

const closeButtonStyle: React.CSSProperties = {
  border: "none",
  background: COLORS.sidebar,
  color: "#fff",
  borderRadius: "10px",
  padding: "10px 12px",
  cursor: "pointer",
  fontWeight: "bold",
};

const overlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.45)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "20px",
  zIndex: 999,
};

const modalCardStyle: React.CSSProperties = {
  width: "100%",
  maxWidth: "950px",
  maxHeight: "90vh",
  overflowY: "auto",
  background: "#fff",
  borderRadius: "24px",
  padding: "24px",
  boxShadow: "0 30px 60px rgba(0,0,0,0.18)",
};
