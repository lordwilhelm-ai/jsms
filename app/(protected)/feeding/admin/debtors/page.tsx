"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type StudentBalance = Record<string, any>;
type SettingsRow = Record<string, any>;
type ClassRow = Record<string, any>;

const COLORS = {
  background:
    "linear-gradient(135deg, #fffdf2 0%, #fff9db 25%, #fef3c7 55%, #fde68a 100%)",
  primary: "#f59e0b",
  secondary: "#111827",
  white: "#ffffff",
  text: "#111827",
  muted: "#6b7280",
};

function getClassName(row: Record<string, any>) {
  return String(row.class_name || row.className || "").trim();
}

function getStudentName(row: Record<string, any>) {
  return String(row.student_name || row.studentName || "").trim();
}

function getStudentIdValue(row: Record<string, any>) {
  return String(row.student_id || row.studentId || row.id || "").trim();
}

function getBalance(row: Record<string, any>) {
  return Number(row.balance || 0);
}

export default function AdminDebtorsPage() {
  const [loading, setLoading] = useState(false);
  const [balances, setBalances] = useState<StudentBalance[]>([]);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [settingsRow, setSettingsRow] = useState<SettingsRow | null>(null);

  const [classFilter, setClassFilter] = useState("All");
  const [search, setSearch] = useState("");

  useEffect(() => {
    void loadPageData();
  }, []);

  async function loadPageData() {
    try {
      setLoading(true);

      const [balancesRes, settingsRes, classesRes] = await Promise.all([
        supabase.from("student_balances").select("*"),
        supabase.from("school_settings").select("*").limit(1).maybeSingle(),
        supabase.from("classes").select("*").order("class_order", { ascending: true }),
      ]);

      if (balancesRes.error) throw balancesRes.error;
      if (classesRes.error) throw classesRes.error;

      setBalances(balancesRes.data || []);
      setSettingsRow(settingsRes.data || null);
      setClasses(classesRes.data || []);
    } catch (error) {
      console.error(error);
      alert("Failed to load debtor balances.");
    } finally {
      setLoading(false);
    }
  }

  const classOptions = useMemo(() => {
    const fromClasses = (classes || []).map((row) => getClassName(row)).filter(Boolean);
    const fromBalances = (balances || []).map((row) => getClassName(row)).filter(Boolean);
    return Array.from(new Set([...fromClasses, ...fromBalances]));
  }, [classes, balances]);

  const filteredBalances = useMemo(() => {
    return balances.filter((row) => {
      const matchesClass = classFilter === "All" ? true : getClassName(row) === classFilter;

      const text = search.trim().toLowerCase();
      const matchesSearch =
        !text ||
        getStudentName(row).toLowerCase().includes(text) ||
        getStudentIdValue(row).toLowerCase().includes(text) ||
        getClassName(row).toLowerCase().includes(text);

      return matchesClass && matchesSearch;
    });
  }, [balances, classFilter, search]);

  const feedingFee = Number(settingsRow?.feeding_fee || 6);

  const debtRows = useMemo(() => {
    return filteredBalances
      .filter((row) => getBalance(row) < 0)
      .sort((a, b) => getBalance(a) - getBalance(b));
  }, [filteredBalances]);

  const advanceRows = useMemo(() => {
    return filteredBalances
      .filter((row) => getBalance(row) > 0)
      .sort((a, b) => getBalance(b) - getBalance(a))
      .map((row) => ({
        ...row,
        daysLeft: Math.floor(getBalance(row) / feedingFee),
      }));
  }, [filteredBalances, feedingFee]);

  const summary = useMemo(() => {
    const totalDebt = debtRows.reduce((sum, row) => sum + Math.abs(getBalance(row)), 0);
    const totalAdvance = advanceRows.reduce((sum, row) => sum + getBalance(row), 0);

    return {
      totalDebt,
      totalAdvance,
      studentsOwing: debtRows.length,
      studentsWithAdvance: advanceRows.length,
    };
  }, [debtRows, advanceRows]);

  const classDebtSummary = useMemo(() => {
    return classOptions
      .map((className) => {
        const classDebtors = debtRows.filter((row) => getClassName(row) === className);
        const classAdvance = advanceRows.filter((row) => getClassName(row) === className);

        return {
          className,
          owingCount: classDebtors.length,
          totalDebt: classDebtors.reduce((sum, row) => sum + Math.abs(getBalance(row)), 0),
          advanceCount: classAdvance.length,
          totalAdvance: classAdvance.reduce((sum, row) => sum + getBalance(row), 0),
        };
      })
      .filter((row) => row.owingCount > 0 || row.advanceCount > 0);
  }, [classOptions, debtRows, advanceRows]);

  const topDebtors = debtRows.slice(0, 10);

  const schoolName = String(settingsRow?.school_name || "JEFSEM VISION SCHOOL");
  const motto = String(settingsRow?.motto || "Success in Excellence");
  const academicYear = String(settingsRow?.academic_year || "-");
  const currentTerm = String(settingsRow?.current_term || "-");

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
            <h1 style={{ margin: 0 }}>Debtors</h1>
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

      <div style={{ maxWidth: "1400px", margin: "0 auto", padding: "24px" }}>
        <div
          style={{
            background: COLORS.white,
            borderRadius: "16px",
            padding: "18px",
            boxShadow: "0 8px 22px rgba(0,0,0,0.06)",
            marginBottom: "20px",
          }}
        >
          <h3 style={{ marginTop: 0, color: COLORS.secondary }}>Filters</h3>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: "12px",
            }}
          >
            <div>
              <label style={labelStyle}>Class</label>
              <select
                value={classFilter}
                onChange={(e) => setClassFilter(e.target.value)}
                style={inputStyle}
              >
                <option value="All">All</option>
                {classOptions.map((className) => (
                  <option key={className} value={className}>
                    {className}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={labelStyle}>Search</label>
              <input
                type="text"
                placeholder="Student name, ID, class"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={inputStyle}
              />
            </div>
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: "16px",
            marginBottom: "20px",
          }}
        >
          <SummaryCard title="Total School Debt" value={`GHS ${summary.totalDebt}`} />
          <SummaryCard title="Students Owing" value={summary.studentsOwing} />
          <SummaryCard title="Total Advance" value={`GHS ${summary.totalAdvance}`} />
          <SummaryCard title="Students With Advance" value={summary.studentsWithAdvance} />
        </div>

        <Section title="Top Debtors">
          {loading ? (
            <p>Loading...</p>
          ) : (
            <ReportTable
              headers={["Student", "ID", "Class", "Debt"]}
              rows={topDebtors.map((row) => [
                getStudentName(row),
                getStudentIdValue(row),
                getClassName(row),
                `GHS ${Math.abs(getBalance(row))}`,
              ])}
            />
          )}
        </Section>

        <Section title="Class Debt Summary">
          {loading ? (
            <p>Loading...</p>
          ) : (
            <ReportTable
              headers={[
                "Class",
                "Students Owing",
                "Total Debt",
                "Students With Advance",
                "Total Advance",
              ]}
              rows={classDebtSummary.map((row) => [
                row.className,
                row.owingCount,
                `GHS ${row.totalDebt}`,
                row.advanceCount,
                `GHS ${row.totalAdvance}`,
              ])}
            />
          )}
        </Section>

        <Section title="Students Owing">
          {loading ? (
            <p>Loading...</p>
          ) : (
            <ReportTable
              headers={["Student", "ID", "Class", "Debt"]}
              rows={debtRows.map((row) => [
                getStudentName(row),
                getStudentIdValue(row),
                getClassName(row),
                `GHS ${Math.abs(getBalance(row))}`,
              ])}
            />
          )}
        </Section>

        <Section title="Students With Advance">
          {loading ? (
            <p>Loading...</p>
          ) : (
            <ReportTable
              headers={["Student", "ID", "Class", "Advance", "Days Left"]}
              rows={advanceRows.map((row: any) => [
                getStudentName(row),
                getStudentIdValue(row),
                getClassName(row),
                `GHS ${getBalance(row)}`,
                Number(row.daysLeft || 0),
              ])}
            />
          )}
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

function SummaryCard({ title, value }: { title: string; value: string | number }) {
  return (
    <div
      style={{
        background: COLORS.white,
        borderRadius: "16px",
        padding: "18px",
        boxShadow: "0 8px 22px rgba(0,0,0,0.06)",
        borderTop: `6px solid ${COLORS.primary}`,
      }}
    >
      <p style={{ margin: 0, fontSize: "14px", color: "#666" }}>{title}</p>
      <h2 style={{ margin: "8px 0 0", color: COLORS.secondary, fontSize: "28px" }}>
        {value}
      </h2>
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
    <p style={{ color: "#666", marginBottom: 0 }}>No data found.</p>
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

const labelStyle: React.CSSProperties = {
  display: "block",
  marginBottom: "6px",
  fontWeight: "bold",
  fontSize: "14px",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "12px",
  borderRadius: "10px",
  border: "1px solid #ddd",
  fontSize: "14px",
};

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
  padding: "12px",
  borderBottom: "1px solid #e5e7eb",
};

const tdStyle: React.CSSProperties = {
  padding: "12px",
  borderBottom: "1px solid #f0f0f0",
};
