"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type Student = Record<string, any>;
type LedgerRow = Record<string, any>;
type SettingsRow = Record<string, any>;

const COLORS = {
  background:
    "linear-gradient(135deg, #fffdf2 0%, #fff9db 25%, #fef3c7 55%, #fde68a 100%)",
  primary: "#f59e0b",
  secondary: "#111827",
  white: "#ffffff",
  text: "#111827",
  muted: "#6b7280",
};

function getStudentName(row: Record<string, any>) {
  const fullName = String(row.full_name || "").trim();
  if (fullName) return fullName;

  const first = String(row.first_name || "").trim();
  const other = String(row.other_name || "").trim();
  const last = String(row.last_name || "").trim();

  return `${first} ${other} ${last}`.replace(/\s+/g, " ").trim();
}

function getStudentIdValue(row: Record<string, any>) {
  return String(row.student_id || row.studentId || row.id || "").trim();
}

function getClassName(row: Record<string, any>) {
  return String(row.class_name || row.className || "").trim();
}

function getTeacherName(row: Record<string, any>) {
  return String(row.assigned_teacher_name || row.assignedTeacherName || "").trim();
}

function getAmountPaid(row: Record<string, any>) {
  return Number(row.amount_paid_today || row.amountPaidToday || 0);
}

function getPreviousBalance(row: Record<string, any>) {
  return Number(row.previous_balance || row.previousBalance || 0);
}

function getAteToday(row: Record<string, any>) {
  return Boolean(row.ate_today ?? row.ateToday);
}

function getNewBalance(row: Record<string, any>) {
  return Number(row.new_balance || row.newBalance || 0);
}

export default function StudentLedgerPage() {
  const [studentId, setStudentId] = useState("");
  const [students, setStudents] = useState<Student[]>([]);
  const [ledgerRows, setLedgerRows] = useState<LedgerRow[]>([]);
  const [settingsRow, setSettingsRow] = useState<SettingsRow | null>(null);

  const [loadingStudents, setLoadingStudents] = useState(false);
  const [loadingLedger, setLoadingLedger] = useState(false);
  const [loadingPage, setLoadingPage] = useState(true);

  useEffect(() => {
    void loadPageData();
  }, []);

  useEffect(() => {
    if (!studentId) {
      setLedgerRows([]);
      return;
    }

    void loadLedger();
  }, [studentId]);

  async function loadPageData() {
    try {
      setLoadingPage(true);
      setLoadingStudents(true);

      const [studentsRes, settingsRes] = await Promise.all([
        supabase.from("students").select("*"),
        supabase.from("school_settings").select("*").limit(1).maybeSingle(),
      ]);

      const rows = (studentsRes.data || [])
        .filter((row) => row.active !== false)
        .sort((a, b) => getStudentName(a).localeCompare(getStudentName(b)));

      setStudents(rows);
      setSettingsRow(settingsRes.data || null);
    } catch (error) {
      console.error(error);
      alert("Failed to load students.");
    } finally {
      setLoadingStudents(false);
      setLoadingPage(false);
    }
  }

  async function loadLedger() {
    try {
      setLoadingLedger(true);

      const { data, error } = await supabase
        .from("balance_ledger")
        .select("*")
        .eq("student_id", studentId)
        .order("date", { ascending: true });

      if (error) throw error;

      setLedgerRows(data || []);
    } catch (error) {
      console.error(error);
      alert("Failed to load ledger.");
    } finally {
      setLoadingLedger(false);
    }
  }

  const selectedStudent = students.find((s) => getStudentIdValue(s) === studentId);

  const summary = useMemo(() => {
    return ledgerRows.reduce(
      (acc, row) => {
        acc.totalPaid += getAmountPaid(row);
        if (getAteToday(row)) acc.totalMeals += 1;
        acc.currentBalance = getNewBalance(row);
        return acc;
      },
      {
        totalPaid: 0,
        totalMeals: 0,
        currentBalance: 0,
      }
    );
  }, [ledgerRows]);

  const unpaidMeals = useMemo(() => {
    return ledgerRows
      .filter((row) => getAteToday(row) && getNewBalance(row) < 0)
      .map((row) => ({
        date: String(row.date || ""),
        debt: Math.abs(getNewBalance(row)),
      }));
  }, [ledgerRows]);

  const totalDebt = unpaidMeals.reduce((sum, row) => sum + row.debt, 0);

  const schoolName = String(settingsRow?.school_name || "JEFSEM VISION SCHOOL");
  const motto = String(settingsRow?.motto || "Success in Excellence");
  const academicYear = String(settingsRow?.academic_year || "-");
  const currentTerm = String(settingsRow?.current_term || "-");

  if (loadingPage) {
    return <div style={{ padding: "24px" }}>Loading...</div>;
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
            maxWidth: "1100px",
            margin: "0 auto",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "start",
            gap: "12px",
            flexWrap: "wrap",
          }}
        >
          <div>
            <h1 style={{ margin: 0 }}>Student Ledger</h1>
            <p style={{ margin: "6px 0 0", fontWeight: "bold" }}>{schoolName}</p>
            <p style={{ margin: "4px 0 0", opacity: 0.9 }}>{motto}</p>
            <p style={{ margin: "6px 0 0", fontSize: "13px", opacity: 0.9 }}>
              <strong>{academicYear}</strong> • <strong>{currentTerm}</strong>
            </p>
          </div>

          <Link href="/feeding/admin" style={backButtonStyle}>
            Back to Feeding Admin
          </Link>
        </div>
      </div>

      <div style={{ maxWidth: "1100px", margin: "auto", padding: "24px" }}>
        <div
          style={{
            background: COLORS.white,
            padding: "16px",
            borderRadius: "16px",
            marginBottom: "20px",
            boxShadow: "0 8px 22px rgba(0,0,0,0.06)",
          }}
        >
          <label style={{ fontWeight: "bold" }}>Select Student</label>

          <select
            value={studentId}
            onChange={(e) => setStudentId(e.target.value)}
            style={{
              width: "100%",
              padding: "12px",
              marginTop: "6px",
              borderRadius: "10px",
              border: "1px solid #ddd",
            }}
          >
            <option value="">
              {loadingStudents ? "Loading students..." : "Select student"}
            </option>

            {students.map((student) => (
              <option key={getStudentIdValue(student)} value={getStudentIdValue(student)}>
                {getStudentName(student)} — {getClassName(student)} — {getStudentIdValue(student)}
              </option>
            ))}
          </select>
        </div>

        {selectedStudent && (
          <div
            style={{
              background: COLORS.white,
              padding: "16px",
              borderRadius: "16px",
              marginBottom: "20px",
              boxShadow: "0 8px 22px rgba(0,0,0,0.06)",
            }}
          >
            <p>
              <strong>Name:</strong> {getStudentName(selectedStudent)}
            </p>

            <p>
              <strong>ID:</strong> {getStudentIdValue(selectedStudent)}
            </p>

            <p>
              <strong>Class:</strong> {getClassName(selectedStudent)}
            </p>

            <p>
              <strong>Total Paid:</strong> GHS {summary.totalPaid}
            </p>

            <p>
              <strong>Total Meals:</strong> {summary.totalMeals}
            </p>

            <p>
              <strong>Current Balance:</strong> GHS {summary.currentBalance}
            </p>
          </div>
        )}

        {unpaidMeals.length > 0 && (
          <div
            style={{
              background: "#fee2e2",
              padding: "16px",
              borderRadius: "16px",
              marginBottom: "20px",
              boxShadow: "0 8px 22px rgba(0,0,0,0.06)",
            }}
          >
            <h3 style={{ marginTop: 0 }}>Unpaid Feeding Days</h3>

            {unpaidMeals.map((item, index) => (
              <p key={index}>
                {item.date} — Owes <strong>GHS {item.debt}</strong>
              </p>
            ))}

            <p style={{ marginTop: "10px", fontWeight: "bold" }}>
              Total Debt: GHS {totalDebt}
            </p>
          </div>
        )}

        <div
          style={{
            background: COLORS.white,
            borderRadius: "16px",
            padding: "16px",
            overflowX: "auto",
            boxShadow: "0 8px 22px rgba(0,0,0,0.06)",
          }}
        >
          {loadingLedger ? (
            <p>Loading ledger...</p>
          ) : !studentId ? (
            <p>Select a student to view ledger.</p>
          ) : ledgerRows.length === 0 ? (
            <p>No ledger records found for this student.</p>
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
                  <th style={thStyle}>Date</th>
                  <th style={thStyle}>Class</th>
                  <th style={thStyle}>Teacher</th>
                  <th style={thStyle}>Attendance</th>
                  <th style={thStyle}>Paid</th>
                  <th style={thStyle}>Prev Balance</th>
                  <th style={thStyle}>Ate</th>
                  <th style={thStyle}>New Balance</th>
                </tr>
              </thead>

              <tbody>
                {ledgerRows.map((row) => (
                  <tr key={row.id}>
                    <td style={tdStyle}>{String(row.date || "")}</td>
                    <td style={tdStyle}>{getClassName(row)}</td>
                    <td style={tdStyle}>{getTeacherName(row)}</td>
                    <td style={tdStyle}>{String(row.attendance || "")}</td>
                    <td style={tdStyle}>GHS {getAmountPaid(row)}</td>
                    <td style={tdStyle}>GHS {getPreviousBalance(row)}</td>
                    <td style={tdStyle}>{getAteToday(row) ? "Yes" : "No"}</td>
                    <td style={tdStyle}>GHS {getNewBalance(row)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <p
          style={{
            textAlign: "center",
            marginTop: "20px",
            fontSize: "12px",
            color: "#666",
          }}
        >
          System developed by Lord Wilhelm (0593410452)
        </p>
      </div>
    </main>
  );
}

const backButtonStyle: React.CSSProperties = {
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
  padding: "10px",
  borderBottom: "1px solid #ddd",
};

const tdStyle: React.CSSProperties = {
  padding: "10px",
  borderBottom: "1px solid #eee",
};
