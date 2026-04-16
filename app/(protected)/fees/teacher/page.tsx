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
  background:
    "linear-gradient(135deg, #fffdf2 0%, #fff9db 25%, #fef3c7 55%, #fde68a 100%)",
  primary: "#f59e0b",
  secondary: "#111827",
  white: "#ffffff",
  text: "#111827",
  muted: "#6b7280",
};

function getRole(row: AnyRow | null) {
  const raw = String(row?.role || "").trim().toLowerCase();
  if (raw === "owner" || raw === "admin" || raw === "headmaster") return raw;
  return "teacher";
}

function getAssignedClasses(row: AnyRow): string[] {
  if (Array.isArray(row.assigned_classes)) {
    return row.assigned_classes.map((item: unknown) => String(item).trim()).filter(Boolean);
  }

  if (typeof row.assigned_classes === "string") {
    const raw = row.assigned_classes.trim();
    if (!raw) return [];

    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.map((item) => String(item).trim()).filter(Boolean);
      }
    } catch {
      return raw
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
    }
  }

  if (typeof row.assigned_class === "string" && row.assigned_class.trim()) {
    return [row.assigned_class.trim()];
  }

  if (typeof row.class_name === "string" && row.class_name.trim()) {
    return [row.class_name.trim()];
  }

  return [];
}

function getClassName(row: AnyRow) {
  return String(row.class_name || row.className || "").trim();
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

function calcStudentFinancials(student: AnyRow, classRow: AnyRow | null, payments: AnyRow[]) {
  const isNew = Boolean(student.is_new);
  let baseFee = isNew
    ? numberValue(classRow?.fee_new)
    : numberValue(classRow?.fee_returning);

  const scholarshipType = String(student.scholarship_type || "none").trim().toLowerCase();

  if (scholarshipType === "full") baseFee = 0;
  if (scholarshipType === "half") baseFee = baseFee / 2;
  if (scholarshipType === "custom") baseFee = numberValue(student.scholarship_amount);

  const feeLacoste = numberValue(classRow?.fee_lacoste);
  const feeMonWed = numberValue(classRow?.fee_monwed);
  const feeFriday = numberValue(classRow?.fee_friday);
  const arrears = numberValue(student.arrears);

  const totalFees = baseFee + feeLacoste + feeMonWed + feeFriday;
  const totalOwed = totalFees + arrears;
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

function buildReceiptNo(payment: AnyRow) {
  if (payment.receipt_no) return String(payment.receipt_no);
  return String(payment.id || "");
}

export default function FeesTeacherPage() {
  const router = useRouter();

  const [checkingUser, setCheckingUser] = useState(true);
  const [loading, setLoading] = useState(true);

  const [settingsRow, setSettingsRow] = useState<AnyRow | null>(null);
  const [classes, setClasses] = useState<AnyRow[]>([]);
  const [students, setStudents] = useState<AnyRow[]>([]);
  const [payments, setPayments] = useState<AnyRow[]>([]);
  const [assignedClasses, setAssignedClasses] = useState<string[]>([]);

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

      if (role !== "teacher") {
        router.replace("/fees/admin");
        return;
      }

      setAssignedClasses(getAssignedClasses(userRow));
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
    classes.forEach((row) => map.set(getClassName(row), row));
    return map;
  }, [classes]);

  const filteredStudents = useMemo<StudentFinanceRow[]>(() => {
    return students
      .filter((student) => {
        const className = getClassName(student);
        if (!assignedClasses.includes(className)) return false;
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
          studentId,
          className,
          ...finance,
        } as StudentFinanceRow;
      })
      .sort((a, b) =>
        String(a.full_name || "").localeCompare(String(b.full_name || ""))
      );
  }, [students, assignedClasses, classMap, currentTermPayments]);

  const classSummary = useMemo(() => {
    return assignedClasses.map((className) => {
      const classStudents = filteredStudents.filter((row) => row.className === className);
      const classRow = classMap.get(className);

      return {
        className,
        feeReturning: numberValue(classRow?.fee_returning),
        feeNew: numberValue(classRow?.fee_new),
        feeLacoste: numberValue(classRow?.fee_lacoste),
        feeMonWed: numberValue(classRow?.fee_monwed),
        feeFriday: numberValue(classRow?.fee_friday),
        students: classStudents.length,
        totalPaid: classStudents.reduce((sum, row) => sum + row.totalPaid, 0),
        totalOutstanding: classStudents.reduce((sum, row) => sum + Math.max(row.balance, 0), 0),
      };
    });
  }, [assignedClasses, filteredStudents, classMap]);

  const recentPayments = useMemo(() => {
    return currentTermPayments
      .filter((row) => assignedClasses.includes(String(row.class_name || "")))
      .sort((a, b) => {
        const aDate = new Date(String(a.created_at || a.payment_date || "")).getTime();
        const bDate = new Date(String(b.created_at || b.payment_date || "")).getTime();
        return bDate - aDate;
      })
      .slice(0, 10);
  }, [currentTermPayments, assignedClasses]);

  if (checkingUser || loading) {
    return <div style={{ padding: "24px" }}>Loading teacher fees page...</div>;
  }

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
            maxWidth: "1400px",
            margin: "0 auto",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "start",
            gap: "12px",
            flexWrap: "wrap",
          }}
        >
          <div>
            <h1 style={{ margin: 0 }}>Fees Overview</h1>
            <p style={{ margin: "6px 0 0", fontWeight: "bold" }}>{schoolName}</p>
            <p style={{ margin: "4px 0 0", opacity: 0.9 }}>{motto}</p>
            <p style={{ margin: "6px 0 0", fontSize: "13px", opacity: 0.9 }}>
              <strong>{academicYear || "-"}</strong> • <strong>{currentTerm || "-"}</strong>
            </p>
          </div>

          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <Link href="/dashboard/teacher" style={topButtonStyle}>
              Teacher Dashboard
            </Link>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: "1400px", margin: "0 auto", padding: "24px" }}>
        <Section title="Assigned Classes">
          {classSummary.length === 0 ? (
            <p style={{ color: COLORS.muted, marginBottom: 0 }}>No assigned class found.</p>
          ) : (
            <ReportTable
              headers={[
                "Class",
                "Returning Fee",
                "New Fee",
                "Lacoste",
                "Mon-Wed",
                "Friday",
                "Students",
                "Paid",
                "Outstanding",
              ]}
              rows={classSummary.map((row) => [
                row.className,
                formatMoney(row.feeReturning),
                formatMoney(row.feeNew),
                formatMoney(row.feeLacoste),
                formatMoney(row.feeMonWed),
                formatMoney(row.feeFriday),
                row.students,
                formatMoney(row.totalPaid),
                formatMoney(row.totalOutstanding),
              ])}
            />
          )}
        </Section>

        <Section title="Students in Assigned Classes">
          <ReportTable
            headers={["Student", "Student ID", "Class", "Total Owed", "Paid", "Balance", "Status"]}
            rows={filteredStudents.map((row) => [
              String(row.full_name || "-"),
              row.studentId,
              row.className,
              formatMoney(row.totalOwed),
              formatMoney(row.totalPaid),
              formatMoney(row.balance),
              row.paymentStatus,
            ])}
          />
        </Section>

        <Section title="Recent Payments">
          <ReportTable
            headers={["Receipt", "Student", "Class", "Amount", "Type", "Date"]}
            rows={recentPayments.map((row) => [
              buildReceiptNo(row),
              String(row.student_name || "-"),
              String(row.class_name || "-"),
              formatMoney(numberValue(row.amount_paid)),
              String(row.payment_type || "-"),
              String(row.payment_date || "-"),
            ])}
          />
        </Section>

        <p
          style={{
            marginTop: "28px",
            fontSize: "13px",
            color: "#666",
            textAlign: "center",
          }}
        >
          System developed by Lord Wilhelm (0593410452)
        </p>
      </div>
    </main>
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
        background: COLORS.white,
        borderRadius: "16px",
        padding: "18px",
        boxShadow: "0 8px 22px rgba(0,0,0,0.06)",
        overflowX: "auto",
        marginBottom: "20px",
      }}
    >
      <h3 style={{ marginTop: 0, color: COLORS.secondary }}>{title}</h3>
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
    <table
      style={{
        width: "100%",
        borderCollapse: "collapse",
        fontSize: "14px",
      }}
    >
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

const topButtonStyle: React.CSSProperties = {
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
  padding: "12px",
  borderBottom: "1px solid #e5e7eb",
};

const tdStyle: React.CSSProperties = {
  padding: "12px",
  borderBottom: "1px solid #f0f0f0",
};
