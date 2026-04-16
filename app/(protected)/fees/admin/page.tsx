"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type AnyRow = Record<string, any>;

type StudentFinanceRow = AnyRow & {
  className: string;
  studentId: string;
  totalOwed: number;
  totalPaid: number;
  balance: number;
  paymentStatus: "paid" | "part" | "unpaid";
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
  successBg: "#dcfce7",
  successText: "#166534",
  warningBg: "#fef3c7",
  warningText: "#a16207",
  dangerBg: "#fee2e2",
  dangerText: "#991b1b",
};

function getRole(row: AnyRow | null) {
  const raw = String(row?.role || "").trim().toLowerCase();
  if (raw === "owner" || raw === "admin" || raw === "headmaster") return raw;
  return "teacher";
}

function getClassName(row: AnyRow) {
  return String(row.class_name || row.className || row.name || "").trim();
}

function getStudentIdValue(row: AnyRow) {
  return String(row.student_id || row.studentId || row.id || "").trim();
}

function numberValue(value: unknown) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

function formatMoney(value: number) {
  return `GHS ${value.toFixed(2)}`;
}

function getPaymentStatus(balance: number, totalPaid: number): "paid" | "part" | "unpaid" {
  if (balance <= 0) return "paid";
  if (totalPaid > 0) return "part";
  return "unpaid";
}

function buildReceiptNo(payment: AnyRow) {
  if (payment.receipt_no) return String(payment.receipt_no);
  return String(payment.id || "");
}

function calcStudentFinancials(student: AnyRow, classRow: AnyRow | null, payments: AnyRow[]) {
  const isNew = Boolean(student.is_new);
  let baseFee = isNew
    ? numberValue(classRow?.fee_new)
    : numberValue(classRow?.fee_returning);

  const scholarshipType = String(student.scholarship_type || "none").trim().toLowerCase();

  if (scholarshipType === "full") baseFee = 0;
  if (scholarshipType === "half") baseFee = baseFee / 2;
  if (scholarshipType === "custom") baseFee = numberValue(student.scholarship_amount);

  const arrears = numberValue(student.arrears);
  const totalOwed = baseFee + arrears;
  const totalPaid = payments.reduce((sum, row) => sum + numberValue(row.amount_paid), 0);
  const balance = totalOwed - totalPaid;
  const paymentStatus = getPaymentStatus(balance, totalPaid);

  return {
    totalOwed,
    totalPaid,
    balance,
    paymentStatus,
  };
}

export default function FeesAdminPage() {
  const router = useRouter();

  const [checkingUser, setCheckingUser] = useState(true);
  const [loading, setLoading] = useState(true);

  const [settingsRow, setSettingsRow] = useState<AnyRow | null>(null);
  const [classes, setClasses] = useState<AnyRow[]>([]);
  const [students, setStudents] = useState<AnyRow[]>([]);
  const [payments, setPayments] = useState<AnyRow[]>([]);

  const [searchText, setSearchText] = useState("");
  const [selectedReceipt, setSelectedReceipt] = useState<AnyRow | null>(null);

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

      const [teachersRes, settingsRes, classesRes, studentsRes, paymentsRes] = await Promise.all([
        supabase.from("teachers").select("*"),
        supabase.from("school_settings").select("*").limit(1).maybeSingle(),
        supabase.from("classes").select("*"),
        supabase.from("students").select("*"),
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

      setSettingsRow(settingsRes.data || null);
      setClasses(classesRes.data || []);
      setStudents(studentsRes.data || []);
      setPayments(paymentsRes.data || []);

      setCheckingUser(false);
      setLoading(false);
    }

    void checkAndLoad();

    return () => {
      active = false;
    };
  }, [router]);

  const schoolName = String(settingsRow?.school_name || "JEFSEM VISION SCHOOL");
  const motto = String(settingsRow?.motto || "Success in Excellence");
  const academicYear = String(settingsRow?.academic_year || "");
  const currentTerm = String(settingsRow?.current_term || "");

  const currentTermPayments = useMemo(() => {
    return payments.filter(
      (row) =>
        String(row.academic_year || "") === academicYear &&
        String(row.term || "") === currentTerm
    );
  }, [payments, academicYear, currentTerm]);

  const classMap = useMemo(() => {
    const map = new Map<string, AnyRow>();
    classes.forEach((row) => {
      map.set(getClassName(row), row);
    });
    return map;
  }, [classes]);

  const studentRows = useMemo<StudentFinanceRow[]>(() => {
    return students
      .filter((student) => {
        if (typeof student.active === "boolean") return student.active;
        return true;
      })
      .map((student) => {
        const studentId = getStudentIdValue(student);
        const className = getClassName(student);
        const classRow = classMap.get(className) || null;
        const studentPayments = currentTermPayments.filter(
          (row) => String(row.student_id || "") === studentId
        );

        const finance = calcStudentFinancials(student, classRow, studentPayments);

        return {
          ...student,
          className,
          studentId,
          ...finance,
        } as StudentFinanceRow;
      })
      .sort((a, b) =>
        String(a.full_name || "").localeCompare(String(b.full_name || ""))
      );
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
      .filter((row) => String(row.payment_date || "").slice(0, 10) === todayIso)
      .reduce((sum, row) => sum + numberValue(row.amount_paid), 0);

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
        const aDate = new Date(String(a.created_at || a.payment_date || "")).getTime();
        const bDate = new Date(String(b.created_at || b.payment_date || "")).getTime();
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
        feeReturning: numberValue(row.fee_returning),
        feeNew: numberValue(row.fee_new),
      }))
      .filter((row) => row.className)
      .sort((a, b) => a.className.localeCompare(b.className));
  }, [classes]);

  const searchResults = useMemo(() => {
    const text = searchText.trim().toLowerCase();
    if (!text) return [];

    return currentTermPayments
      .filter((row) => buildReceiptNo(row).toLowerCase().includes(text))
      .sort((a, b) => {
        const aDate = new Date(String(a.created_at || a.payment_date || "")).getTime();
        const bDate = new Date(String(b.created_at || b.payment_date || "")).getTime();
        return bDate - aDate;
      })
      .slice(0, 10);
  }, [searchText, currentTermPayments]);

  const receiptPopupInfo = useMemo(() => {
    if (!selectedReceipt) return null;

    const studentId = String(selectedReceipt.student_id || "");
    const student = studentRows.find((row) => row.studentId === studentId) || null;

    return {
      receiptNo: buildReceiptNo(selectedReceipt),
      studentName: String(selectedReceipt.student_name || "-"),
      studentId: String(selectedReceipt.student_id || "-"),
      className: String(selectedReceipt.class_name || "-"),
      amountPaid: numberValue(selectedReceipt.amount_paid),
      method: String(selectedReceipt.method || "-"),
      paymentType: String(selectedReceipt.payment_type || "-"),
      paymentDate: String(selectedReceipt.payment_date || "-"),
      recordedBy: String(selectedReceipt.recorded_by || "-"),
      notes: String(selectedReceipt.notes || "-"),
      balanceAfter: student ? student.balance : 0,
      totalPaid: student ? student.totalPaid : numberValue(selectedReceipt.amount_paid),
      totalOwed: student ? student.totalOwed : 0,
    };
  }, [selectedReceipt, studentRows]);

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
      <div style={{ display: "flex", height: "100%" }}>
        <aside
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
            <h1 style={{ margin: "6px 0 0", fontSize: "24px", lineHeight: 1.2 }}>
              Admin Panel
            </h1>
            <p style={{ margin: "10px 0 0", fontSize: "13px", opacity: 0.85 }}>
              {schoolName}
            </p>
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
                <h2 style={{ margin: 0, fontSize: "30px" }}>Fees Dashboard</h2>
                <p style={{ margin: "8px 0 0", color: "#d1d5db" }}>{motto}</p>
              </div>

              <Link href="/dashboard/admin" style={topButtonStyle}>
                JSMS Dashboard
              </Link>
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: "16px",
              marginBottom: "24px",
            }}
          >
            <SummaryCard title="Total Fees Due" value={formatMoney(summary.totalFeesDue)} />
            <SummaryCard title="Total Collected" value={formatMoney(summary.totalCollected)} />
            <SummaryCard title="Outstanding" value={formatMoney(summary.outstanding)} />
            <SummaryCard title="Total Students" value={summary.totalStudents} />
            <SummaryCard title="Students Paid" value={summary.studentsPaid} />
            <SummaryCard title="Students Part Paid" value={summary.studentsPart} />
            <SummaryCard title="Students Unpaid" value={summary.studentsUnpaid} />
            <SummaryCard title="Today's Payments" value={formatMoney(summary.todaysPaymentsValue)} />
          </div>

          <Section title="Receipt Search">
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1.4fr 1fr",
                gap: "18px",
              }}
            >
              <div>
                <input
                  type="text"
                  placeholder="Search receipt number only"
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  style={inputStyle}
                />

                <div style={{ marginTop: "14px" }}>
                  {!searchText.trim() ? (
                    <p style={{ color: COLORS.muted, marginBottom: 0 }}>
                      Enter a receipt number and matching records will show here.
                    </p>
                  ) : searchResults.length === 0 ? (
                    <p style={{ color: COLORS.muted, marginBottom: 0 }}>No receipt found.</p>
                  ) : (
                    <div style={{ display: "grid", gap: "10px" }}>
                      {searchResults.map((row) => (
                        <button
                          key={String(row.id || row.receipt_no)}
                          onClick={() => setSelectedReceipt(row)}
                          style={{
                            textAlign: "left",
                            border: `1px solid ${COLORS.border}`,
                            background: COLORS.card,
                            borderRadius: "14px",
                            padding: "14px",
                            cursor: "pointer",
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              gap: "12px",
                              alignItems: "center",
                              flexWrap: "wrap",
                            }}
                          >
                            <div>
                              <strong>{buildReceiptNo(row)}</strong>
                              <p style={{ margin: "6px 0 0", color: COLORS.muted, fontSize: "13px" }}>
                                {String(row.student_name || "-")} • {String(row.class_name || "-")}
                              </p>
                            </div>
                            <div style={{ fontWeight: "bold", color: COLORS.sidebar }}>
                              {formatMoney(numberValue(row.amount_paid))}
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div
                style={{
                  background: "#fffaf0",
                  border: `1px solid ${COLORS.gold}`,
                  borderRadius: "18px",
                  padding: "18px",
                }}
              >
                <h4 style={{ marginTop: 0, color: COLORS.sidebar }}>Quick View</h4>
                <p style={{ margin: 0, color: COLORS.muted, lineHeight: 1.6, fontSize: "14px" }}>
                  Search any receipt number here and open the payment details instantly.
                </p>
              </div>
            </div>
          </Section>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
              gap: "20px",
              marginBottom: "20px",
            }}
          >
            <Section title="Recent Payments">
              <ReportTable
                headers={["Receipt", "Student", "Class", "Amount", "Date"]}
                rows={recentPayments.map((row) => [
                  buildReceiptNo(row),
                  String(row.student_name || "-"),
                  String(row.class_name || "-"),
                  formatMoney(numberValue(row.amount_paid)),
                  String(row.payment_date || "-"),
                ])}
              />
            </Section>

            <Section title="Top Debtors">
              <ReportTable
                headers={["Student", "ID", "Class", "Total", "Paid", "Balance", "Status"]}
                rows={topDebtors.map((row) => [
                  String(row.full_name || "-"),
                  row.studentId,
                  row.className || "-",
                  formatMoney(row.totalOwed),
                  formatMoney(row.totalPaid),
                  formatMoney(row.balance),
                  row.paymentStatus,
                ])}
              />
            </Section>
          </div>

          <Section title="Class Fee Preview">
            <ReportTable
              headers={["Class", "Returning Fee", "New Fee"]}
              rows={classFeePreview.map((row) => [
                row.className,
                formatMoney(row.feeReturning),
                formatMoney(row.feeNew),
              ])}
            />
          </Section>
        </section>
      </div>

      {receiptPopupInfo && (
        <div onClick={() => setSelectedReceipt(null)} style={overlayStyle}>
          <div onClick={(e) => e.stopPropagation()} style={modalCardStyle}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: "12px",
                alignItems: "start",
                marginBottom: "18px",
              }}
            >
              <div>
                <p style={{ margin: 0, color: COLORS.gold, fontWeight: "bold" }}>Receipt Details</p>
                <h3 style={{ margin: "6px 0 0", color: COLORS.sidebar }}>
                  {receiptPopupInfo.receiptNo}
                </h3>
              </div>

              <button onClick={() => setSelectedReceipt(null)} style={closeButtonStyle}>
                Close
              </button>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                gap: "14px",
              }}
            >
              <MiniInfo label="Student Name" value={receiptPopupInfo.studentName} />
              <MiniInfo label="Student ID" value={receiptPopupInfo.studentId} />
              <MiniInfo label="Class" value={receiptPopupInfo.className} />
              <MiniInfo label="Amount Paid" value={formatMoney(receiptPopupInfo.amountPaid)} />
              <MiniInfo label="Payment Type" value={receiptPopupInfo.paymentType} />
              <MiniInfo label="Method" value={receiptPopupInfo.method} />
              <MiniInfo label="Payment Date" value={receiptPopupInfo.paymentDate} />
              <MiniInfo label="Recorded By" value={receiptPopupInfo.recordedBy} />
              <MiniInfo label="Total Owed" value={formatMoney(receiptPopupInfo.totalOwed)} />
              <MiniInfo label="Total Paid So Far" value={formatMoney(receiptPopupInfo.totalPaid)} />
              <MiniInfo label="Balance After Payment" value={formatMoney(receiptPopupInfo.balanceAfter)} />
              <MiniInfo label="Notes" value={receiptPopupInfo.notes} />
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function ActionLink({
  href,
  label,
  active = false,
}: {
  href: string;
  label: string;
  active?: boolean;
}) {
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

function SummaryCard({ title, value }: { title: string; value: string | number }) {
  return (
    <div
      style={{
        background: COLORS.card,
        borderRadius: "18px",
        padding: "18px",
        boxShadow: "0 10px 25px rgba(0,0,0,0.06)",
        border: `1px solid ${COLORS.border}`,
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "5px",
          background: COLORS.gold,
        }}
      />
      <p style={{ margin: 0, fontSize: "14px", color: COLORS.muted }}>{title}</p>
      <h2 style={{ margin: "10px 0 0", color: COLORS.sidebar, fontSize: "28px" }}>{value}</h2>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        background: COLORS.card,
        borderRadius: "20px",
        padding: "20px",
        boxShadow: "0 10px 25px rgba(0,0,0,0.06)",
        border: `1px solid ${COLORS.border}`,
        overflowX: "auto",
        marginBottom: "20px",
      }}
    >
      <h3 style={{ marginTop: 0, color: COLORS.sidebar }}>{title}</h3>
      {children}
    </div>
  );
}

function ReportTable({
  headers,
  rows,
}: {
  headers: string[];
  rows: (string | number)[][];
}) {
  return rows.length === 0 ? (
    <p style={{ color: COLORS.muted, marginBottom: 0 }}>No data found.</p>
  ) : (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px" }}>
      <thead>
        <tr style={{ background: "#fff7cc" }}>
          {headers.map((header) => (
            <th key={header} style={thStyle}>
              {header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => (
          <tr key={index}>
            {row.map((cell, cellIndex) => (
              <td key={cellIndex} style={tdStyle}>
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function MiniInfo({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        background: "#f9fafb",
        border: `1px solid ${COLORS.border}`,
        borderRadius: "12px",
        padding: "10px 12px",
      }}
    >
      <p style={{ margin: 0, fontSize: "11px", color: COLORS.muted }}>{label}</p>
      <p style={{ margin: "5px 0 0", fontWeight: "bold", color: COLORS.sidebar, fontSize: "14px" }}>
        {value}
      </p>
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
  fontSize: "14px",
  outline: "none",
};

const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "12px",
  borderBottom: "1px solid #e5e7eb",
};

const tdStyle: React.CSSProperties = {
  padding: "12px",
  borderBottom: "1px solid #f0f0f0",
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
  maxWidth: "700px",
  background: "#fff",
  borderRadius: "24px",
  padding: "24px",
  boxShadow: "0 30px 60px rgba(0,0,0,0.18)",
};
