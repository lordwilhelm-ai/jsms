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
  parentPhone: string;
};

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

  return {
    totalOwed,
    totalPaid,
    balance,
  };
}

export default function FeeReminderPage() {
  const router = useRouter();

  const [checkingUser, setCheckingUser] = useState(true);
  const [loading, setLoading] = useState(true);

  const [settingsRow, setSettingsRow] = useState<AnyRow | null>(null);
  const [classes, setClasses] = useState<AnyRow[]>([]);
  const [students, setStudents] = useState<AnyRow[]>([]);
  const [payments, setPayments] = useState<AnyRow[]>([]);

  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [messageText, setMessageText] = useState("");

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

  const owingStudents = useMemo<StudentFinanceRow[]>(() => {
    return students
      .filter((student) => {
        if (typeof student.active === "boolean") return student.active;
        return true;
      })
      .map((student) => {
        const className = getClassName(student);
        const studentId = getStudentIdValue(student);
        const classRow = classMap.get(className) || null;
        const studentPayments = currentTermPayments.filter(
          (row) => String(row.student_id || "") === studentId
        );
        const finance = calcStudentFinancials(student, classRow, studentPayments);

        return {
          ...student,
          className,
          studentId,
          parentPhone: String(student.parent_phone || student.father_phone || student.mother_phone || student.guardian_phone || ""),
          ...finance,
        } as StudentFinanceRow;
      })
      .filter((student) => student.balance > 0)
      .sort((a, b) => b.balance - a.balance);
  }, [students, classMap, currentTermPayments]);

  const selectedStudent = useMemo(() => {
    return owingStudents.find((row) => row.studentId === selectedStudentId) || null;
  }, [owingStudents, selectedStudentId]);

  useEffect(() => {
    if (!selectedStudent) {
      setMessageText("");
      return;
    }

    setMessageText(
      `Dear Parent/Guardian, this is a reminder that ${selectedStudent.full_name} of ${selectedStudent.className} has an outstanding school fees balance of ${formatMoney(
        selectedStudent.balance
      )} for ${currentTerm || "the current term"}. Kindly make payment promptly. Thank you. - ${schoolName}`
    );
  }, [selectedStudent, currentTerm, schoolName]);

  if (checkingUser || loading) {
    return <div style={{ padding: "24px" }}>Loading fee reminders...</div>;
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
              Fee Reminder
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
                <h2 style={{ margin: 0, fontSize: "30px" }}>Fee Reminder</h2>
                <p style={{ margin: "8px 0 0", color: "#d1d5db" }}>
                  Prepare reminder messages for parents of students owing fees.
                </p>
              </div>

              <Link href="/fees/admin" style={topButtonStyle()}>
                Back to Dashboard
              </Link>
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1.1fr 1fr",
              gap: "20px",
            }}
          >
            <div
              style={{
                background: COLORS.card,
                borderRadius: "20px",
                padding: "20px",
                border: `1px solid ${COLORS.border}`,
                boxShadow: "0 10px 25px rgba(0,0,0,0.06)",
              }}
            >
              <h3 style={{ marginTop: 0, color: COLORS.sidebar }}>Students Owing</h3>

              {owingStudents.length === 0 ? (
                <p style={{ color: COLORS.muted, marginBottom: 0 }}>
                  No student owing fees right now.
                </p>
              ) : (
                <div style={{ display: "grid", gap: "10px", maxHeight: "70vh", overflowY: "auto" }}>
                  {owingStudents.map((student) => (
                    <button
                      key={student.studentId}
                      onClick={() => setSelectedStudentId(student.studentId)}
                      style={{
                        textAlign: "left",
                        border: `1px solid ${
                          selectedStudentId === student.studentId ? COLORS.gold : COLORS.border
                        }`,
                        background: selectedStudentId === student.studentId ? "#fff7e6" : "#fff",
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
                          flexWrap: "wrap",
                        }}
                      >
                        <div>
                          <strong>{String(student.full_name || "-")}</strong>
                          <p style={{ margin: "6px 0 0", color: COLORS.muted, fontSize: "13px" }}>
                            {student.className} • {student.studentId}
                          </p>
                        </div>
                        <div style={{ color: COLORS.danger, fontWeight: "bold" }}>
                          {formatMoney(student.balance)}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div
              style={{
                background: COLORS.card,
                borderRadius: "20px",
                padding: "20px",
                border: `1px solid ${COLORS.border}`,
                boxShadow: "0 10px 25px rgba(0,0,0,0.06)",
              }}
            >
              <h3 style={{ marginTop: 0, color: COLORS.sidebar }}>Reminder Message</h3>

              {!selectedStudent ? (
                <p style={{ color: COLORS.muted, marginBottom: 0 }}>
                  Select a student from the left side to prepare the reminder message.
                </p>
              ) : (
                <>
                  <div
                    style={{
                      background: "#fffaf0",
                      border: `1px solid ${COLORS.goldSoft}`,
                      borderRadius: "14px",
                      padding: "14px",
                      marginBottom: "14px",
                    }}
                  >
                    <p style={{ margin: "0 0 6px", fontWeight: "bold" }}>
                      {String(selectedStudent.full_name || "-")}
                    </p>
                    <p style={{ margin: "0 0 4px", color: COLORS.muted, fontSize: "13px" }}>
                      Class: {selectedStudent.className}
                    </p>
                    <p style={{ margin: "0 0 4px", color: COLORS.muted, fontSize: "13px" }}>
                      Parent Phone: {selectedStudent.parentPhone || "-"}
                    </p>
                    <p style={{ margin: 0, color: COLORS.danger, fontWeight: "bold", fontSize: "14px" }}>
                      Outstanding: {formatMoney(selectedStudent.balance)}
                    </p>
                  </div>

                  <label
                    style={{
                      display: "block",
                      marginBottom: "6px",
                      fontWeight: "bold",
                      fontSize: "13px",
                      color: COLORS.muted,
                    }}
                  >
                    Message Preview
                  </label>
                  <textarea
                    value={messageText}
                    onChange={(e) => setMessageText(e.target.value)}
                    style={{
                      width: "100%",
                      minHeight: "220px",
                      padding: "14px",
                      borderRadius: "14px",
                      border: `1px solid ${COLORS.border}`,
                      resize: "vertical",
                      fontSize: "14px",
                      outline: "none",
                    }}
                  />

                  <div
                    style={{
                      marginTop: "14px",
                      padding: "14px",
                      borderRadius: "14px",
                      background: "#f9fafb",
                      border: `1px solid ${COLORS.border}`,
                    }}
                  >
                    <p style={{ margin: "0 0 6px", fontWeight: "bold", color: COLORS.sidebar }}>
                      For now
                    </p>
                    <p style={{ margin: 0, color: COLORS.muted, lineHeight: 1.6, fontSize: "14px" }}>
                      This page prepares the fee reminder. Actual SMS sending can be connected later.
                    </p>
                  </div>
                </>
              )}
            </div>
          </div>
        </section>
      </div>
    </main>
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
