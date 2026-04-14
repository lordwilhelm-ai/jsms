"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type EntryRow = Record<string, any>;
type ReceivedRow = Record<string, any>;
type SettingsRow = Record<string, any>;
type ClassRow = Record<string, any>;

type ReportMode = "today" | "single" | "range";

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

function getTeacherName(row: Record<string, any>) {
  return String(row.assigned_teacher_name || row.assignedTeacherName || "").trim();
}

function getStudentName(row: Record<string, any>) {
  return String(row.student_name || row.studentName || "").trim();
}

function getStudentIdValue(row: Record<string, any>) {
  return String(row.student_id || row.studentId || "").trim();
}

function getAmountPaid(row: Record<string, any>) {
  return Number(row.amount_paid_today || row.amountPaidToday || 0);
}

function getPreviousBalance(row: Record<string, any>) {
  return Number(row.previous_balance || row.previousBalance || 0);
}

function getAvailableBeforeMeal(row: Record<string, any>) {
  return Number(row.available_before_meal || row.availableBeforeMeal || 0);
}

function getAteToday(row: Record<string, any>) {
  return Boolean(row.ate_today ?? row.ateToday);
}

function getNewBalance(row: Record<string, any>) {
  return Number(row.new_balance || row.newBalance || 0);
}

function getReceivedAmount(row: Record<string, any>) {
  return Number(row.amount_received || row.amountReceived || 0);
}

function getReceivedTeachers(row: Record<string, any>) {
  return String(row.teacher_names || row.teacherNames || "").trim();
}

function getReceivedBy(row: Record<string, any>) {
  return String(row.received_by || row.receivedBy || "Admin").trim();
}

export default function FeedingReportsPage() {
  const today = new Date().toISOString().split("T")[0];

  const [loading, setLoading] = useState(false);
  const [entries, setEntries] = useState<EntryRow[]>([]);
  const [receivedMoney, setReceivedMoney] = useState<ReceivedRow[]>([]);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [settingsRow, setSettingsRow] = useState<SettingsRow | null>(null);

  const [reportMode, setReportMode] = useState<ReportMode>("today");
  const [singleDate, setSingleDate] = useState(today);
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);

  const [classFilter, setClassFilter] = useState("All");
  const [teacherFilter, setTeacherFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [search, setSearch] = useState("");

  useEffect(() => {
    void loadReports();
  }, [reportMode, singleDate, startDate, endDate]);

  async function loadReports() {
    try {
      setLoading(true);

      const [settingsRes, classesRes] = await Promise.all([
        supabase.from("school_settings").select("*").limit(1).maybeSingle(),
        supabase.from("classes").select("*").order("class_order", { ascending: true }),
      ]);

      setSettingsRow(settingsRes.data || null);
      setClasses(classesRes.data || []);

      let entriesQuery = supabase.from("daily_entries").select("*");
      let receivedQuery = supabase.from("received_money").select("*");

      if (reportMode === "today") {
        entriesQuery = entriesQuery.eq("date", today);
        receivedQuery = receivedQuery.eq("date", today);
      } else if (reportMode === "single") {
        entriesQuery = entriesQuery.eq("date", singleDate);
        receivedQuery = receivedQuery.eq("date", singleDate);
      } else {
        entriesQuery = entriesQuery.gte("date", startDate).lte("date", endDate);
        receivedQuery = receivedQuery.gte("date", startDate).lte("date", endDate);
      }

      const [entriesRes, receivedRes] = await Promise.all([entriesQuery, receivedQuery]);

      if (entriesRes.error) throw entriesRes.error;
      if (receivedRes.error) throw receivedRes.error;

      setEntries(entriesRes.data || []);
      setReceivedMoney(receivedRes.data || []);
    } catch (error) {
      console.error(error);
      alert("Failed to load reports.");
    } finally {
      setLoading(false);
    }
  }

  const classOptions = useMemo(() => {
    const fromClasses = (classes || []).map((row) => getClassName(row)).filter(Boolean);
    const fromEntries = (entries || []).map((row) => getClassName(row)).filter(Boolean);
    return Array.from(new Set([...fromClasses, ...fromEntries]));
  }, [classes, entries]);

  const teacherOptions = useMemo(() => {
    return Array.from(new Set(entries.map((item) => getTeacherName(item)).filter(Boolean))).sort();
  }, [entries]);

  const filteredEntries = useMemo(() => {
    return entries.filter((entry) => {
      const matchesClass = classFilter === "All" ? true : getClassName(entry) === classFilter;

      const matchesTeacher =
        teacherFilter === "All" ? true : getTeacherName(entry) === teacherFilter;

      const matchesStatus =
        statusFilter === "All"
          ? true
          : statusFilter === "Eating"
          ? getAteToday(entry)
          : statusFilter === "Absent"
          ? String(entry.attendance || "").toLowerCase() === "absent"
          : statusFilter === "Owing"
          ? getNewBalance(entry) < 0
          : statusFilter === "Advance"
          ? getNewBalance(entry) > 0
          : true;

      const text = search.trim().toLowerCase();
      const matchesSearch =
        !text ||
        getStudentName(entry).toLowerCase().includes(text) ||
        getStudentIdValue(entry).toLowerCase().includes(text) ||
        getClassName(entry).toLowerCase().includes(text) ||
        getTeacherName(entry).toLowerCase().includes(text);

      return matchesClass && matchesTeacher && matchesStatus && matchesSearch;
    });
  }, [entries, classFilter, teacherFilter, statusFilter, search]);

  const filteredReceivedMoney = useMemo(() => {
    return receivedMoney.filter((item) => {
      const matchesClass = classFilter === "All" ? true : getClassName(item) === classFilter;

      const text = search.trim().toLowerCase();
      const matchesSearch =
        !text ||
        getClassName(item).toLowerCase().includes(text) ||
        getReceivedTeachers(item).toLowerCase().includes(text);

      return matchesClass && matchesSearch;
    });
  }, [receivedMoney, classFilter, search]);

  const feedingFee = Number(settingsRow?.feeding_fee || 6);

  type SummaryData = {
    totalMoney: number;
    presentCount: number;
    absentCount: number;
    eatingCount: number;
    owingCount: number;
    advanceCount: number;
    totalReceived: number;
    outstandingNotCollected: number;
  };

  const summary = useMemo<SummaryData>(() => {
    const totalReceived = filteredReceivedMoney.reduce(
      (sum, item) => sum + getReceivedAmount(item),
      0
    );

    const base = filteredEntries.reduce<{
      totalMoney: number;
      presentCount: number;
      absentCount: number;
      eatingCount: number;
      owingCount: number;
      advanceCount: number;
    }>(
      (acc, entry) => {
        acc.totalMoney += getAmountPaid(entry);

        if (String(entry.attendance || "").toLowerCase() === "present") acc.presentCount += 1;
        if (String(entry.attendance || "").toLowerCase() === "absent") acc.absentCount += 1;
        if (getAteToday(entry)) acc.eatingCount += 1;
        if (getNewBalance(entry) < 0) acc.owingCount += 1;
        if (getNewBalance(entry) > 0) acc.advanceCount += 1;

        return acc;
      },
      {
        totalMoney: 0,
        presentCount: 0,
        absentCount: 0,
        eatingCount: 0,
        owingCount: 0,
        advanceCount: 0,
      }
    );

    return {
      totalMoney: base.totalMoney,
      presentCount: base.presentCount,
      absentCount: base.absentCount,
      eatingCount: base.eatingCount,
      owingCount: base.owingCount,
      advanceCount: base.advanceCount,
      totalReceived,
      outstandingNotCollected: base.totalMoney - totalReceived,
    };
  }, [filteredEntries, filteredReceivedMoney]);

  const byClassSummary = useMemo(() => {
    return classOptions
      .map((className) => {
        const classRows = filteredEntries.filter((entry) => getClassName(entry) === className);
        const classReceivedRows = filteredReceivedMoney.filter(
          (item) => getClassName(item) === className
        );

        const moneyEntered = classRows.reduce((sum, row) => sum + getAmountPaid(row), 0);
        const moneyReceivedValue = classReceivedRows.reduce(
          (sum, row) => sum + getReceivedAmount(row),
          0
        );

        return {
          className,
          records: classRows.length,
          moneyEntered,
          moneyReceived: moneyReceivedValue,
          outstanding: moneyEntered - moneyReceivedValue,
          eating: classRows.filter((row) => getAteToday(row)).length,
          absent: classRows.filter(
            (row) => String(row.attendance || "").toLowerCase() === "absent"
          ).length,
          owing: classRows.filter((row) => getNewBalance(row) < 0).length,
        };
      })
      .filter((row) => row.records > 0 || row.moneyReceived > 0);
  }, [classOptions, filteredEntries, filteredReceivedMoney]);

  const owingRows = useMemo(() => {
    return filteredEntries.filter((entry) => getNewBalance(entry) < 0);
  }, [filteredEntries]);

  const advanceRows = useMemo(() => {
    return filteredEntries
      .filter((entry) => getNewBalance(entry) > 0)
      .map((entry) => ({
        ...entry,
        daysLeft: Math.floor(getNewBalance(entry) / feedingFee),
      }));
  }, [filteredEntries, feedingFee]);

  const eatingRows = useMemo(() => {
    return filteredEntries.filter((entry) => getAteToday(entry));
  }, [filteredEntries]);

  const absentRows = useMemo(() => {
    return filteredEntries.filter(
      (entry) => String(entry.attendance || "").toLowerCase() === "absent"
    );
  }, [filteredEntries]);

  function getReportLabel() {
    if (reportMode === "today") return today;
    if (reportMode === "single") return singleDate;
    return `${startDate}_to_${endDate}`;
  }

  function escapeCsv(value: string | number | boolean | null | undefined) {
    const text = String(value ?? "");
    if (text.includes(",") || text.includes('"') || text.includes("\n")) {
      return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
  }

  function downloadCsv(
    filename: string,
    headers: string[],
    rows: (string | number | boolean)[][]
  ) {
    const csvContent = [
      headers.map(escapeCsv).join(","),
      ...rows.map((row) => row.map(escapeCsv).join(",")),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    URL.revokeObjectURL(url);
  }

  function exportMoneyBreakdown() {
    const rows = filteredEntries.map((row) => [
      String(row.date || ""),
      getStudentName(row),
      getStudentIdValue(row),
      getClassName(row),
      getTeacherName(row),
      String(row.attendance || ""),
      getAmountPaid(row),
      getPreviousBalance(row),
      getAvailableBeforeMeal(row),
      getAteToday(row) ? "Yes" : "No",
      getNewBalance(row),
      String(row.entered_by_name || row.enteredByName || ""),
      String(row.entered_by_role || row.enteredByRole || ""),
    ]);

    downloadCsv(
      `money-breakdown-${getReportLabel()}.csv`,
      [
        "Date",
        "Student Name",
        "Student ID",
        "Class",
        "Teacher",
        "Attendance",
        "Amount Paid",
        "Previous Balance",
        "Available Before Meal",
        "Ate Today",
        "New Balance",
        "Entered By",
        "Entered By Role",
      ],
      rows
    );
  }

  function exportClassBreakdown() {
    const rows = byClassSummary.map((row) => [
      row.className,
      row.records,
      row.moneyEntered,
      row.moneyReceived,
      row.outstanding,
      row.eating,
      row.absent,
      row.owing,
    ]);

    downloadCsv(
      `class-breakdown-${getReportLabel()}.csv`,
      [
        "Class",
        "Records",
        "Money Entered",
        "Money Received",
        "Outstanding",
        "Eating",
        "Absent",
        "Owing",
      ],
      rows
    );
  }

  function exportReceivedMoney() {
    const rows = filteredReceivedMoney.map((row) => [
      String(row.date || ""),
      getClassName(row),
      getReceivedTeachers(row),
      getReceivedAmount(row),
      getReceivedBy(row),
    ]);

    downloadCsv(
      `received-money-${getReportLabel()}.csv`,
      ["Date", "Class", "Teachers", "Amount Received", "Received By"],
      rows
    );
  }

  function exportFullFilteredReport() {
    const rows = filteredEntries.map((row) => [
      String(row.date || ""),
      getStudentName(row),
      getStudentIdValue(row),
      getClassName(row),
      getTeacherName(row),
      String(row.attendance || ""),
      getAmountPaid(row),
      getAteToday(row) ? "Yes" : "No",
      getNewBalance(row),
      getNewBalance(row) < 0
        ? "Owing"
        : getNewBalance(row) > 0
        ? "Advance"
        : "Cleared",
    ]);

    downloadCsv(
      `feeding-report-${getReportLabel()}.csv`,
      [
        "Date",
        "Student Name",
        "Student ID",
        "Class",
        "Teacher",
        "Attendance",
        "Amount Paid",
        "Ate Today",
        "Balance",
        "Balance Status",
      ],
      rows
    );
  }

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
            <h1 style={{ margin: 0 }}>Feeding Reports</h1>
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
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: "12px",
            }}
          >
            <div>
              <label style={labelStyle}>Report Mode</label>
              <select
                value={reportMode}
                onChange={(e) => setReportMode(e.target.value as ReportMode)}
                style={inputStyle}
              >
                <option value="today">Today</option>
                <option value="single">Single Date</option>
                <option value="range">Date Range</option>
              </select>
            </div>

            {reportMode === "single" && (
              <div>
                <label style={labelStyle}>Date</label>
                <input
                  type="date"
                  value={singleDate}
                  onChange={(e) => setSingleDate(e.target.value)}
                  style={inputStyle}
                />
              </div>
            )}

            {reportMode === "range" && (
              <>
                <div>
                  <label style={labelStyle}>Start Date</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    style={inputStyle}
                  />
                </div>

                <div>
                  <label style={labelStyle}>End Date</label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    style={inputStyle}
                  />
                </div>
              </>
            )}

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
              <label style={labelStyle}>Teacher</label>
              <select
                value={teacherFilter}
                onChange={(e) => setTeacherFilter(e.target.value)}
                style={inputStyle}
              >
                <option value="All">All</option>
                {teacherOptions.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={labelStyle}>Status</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                style={inputStyle}
              >
                <option value="All">All</option>
                <option value="Eating">Eating</option>
                <option value="Absent">Absent</option>
                <option value="Owing">Owing</option>
                <option value="Advance">Advance</option>
              </select>
            </div>

            <div>
              <label style={labelStyle}>Search</label>
              <input
                type="text"
                placeholder="Student, ID, class, teacher"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={inputStyle}
              />
            </div>
          </div>

          <div
            style={{
              marginTop: "14px",
              display: "flex",
              gap: "10px",
              flexWrap: "wrap",
            }}
          >
            <button onClick={loadReports} style={buttonStyle}>
              {loading ? "Loading..." : "Refresh Report"}
            </button>

            <button onClick={exportFullFilteredReport} style={buttonStyle}>
              Export Full Report
            </button>

            <button onClick={exportMoneyBreakdown} style={buttonStyle}>
              Export Money Breakdown
            </button>

            <button onClick={exportClassBreakdown} style={buttonStyle}>
              Export Class Breakdown
            </button>

            <button onClick={exportReceivedMoney} style={buttonStyle}>
              Export Received Money
            </button>
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
          <SummaryCard title="Money Entered" value={`GHS ${summary.totalMoney}`} />
          <SummaryCard title="Money Received" value={`GHS ${summary.totalReceived}`} />
          <SummaryCard
            title="Not Yet Collected"
            value={`GHS ${summary.outstandingNotCollected}`}
          />
          <SummaryCard title="Eating" value={summary.eatingCount} />
          <SummaryCard title="Present" value={summary.presentCount} />
          <SummaryCard title="Absent" value={summary.absentCount} />
          <SummaryCard title="Owing" value={summary.owingCount} />
          <SummaryCard title="Advance" value={summary.advanceCount} />
        </div>

        <Section title="Class Breakdown">
          <ReportTable
            headers={[
              "Class",
              "Records",
              "Money Entered",
              "Money Received",
              "Outstanding",
              "Eating",
              "Absent",
              "Owing",
            ]}
            rows={byClassSummary.map((row) => [
              row.className,
              row.records,
              `GHS ${row.moneyEntered}`,
              `GHS ${row.moneyReceived}`,
              `GHS ${row.outstanding}`,
              row.eating,
              row.absent,
              row.owing,
            ])}
          />
        </Section>

        <Section title="Money Breakdown">
          <ReportTable
            headers={[
              "Date",
              "Student",
              "ID",
              "Class",
              "Teacher",
              "Amount Paid",
              "Ate",
              "Balance",
            ]}
            rows={filteredEntries.map((row) => [
              String(row.date || ""),
              getStudentName(row),
              getStudentIdValue(row),
              getClassName(row),
              getTeacherName(row),
              `GHS ${getAmountPaid(row)}`,
              getAteToday(row) ? "Yes" : "No",
              `GHS ${getNewBalance(row)}`,
            ])}
          />
        </Section>

        <Section title="Money Received Breakdown">
          <ReportTable
            headers={["Date", "Class", "Teacher(s)", "Amount Received", "Received By"]}
            rows={filteredReceivedMoney.map((row) => [
              String(row.date || ""),
              getClassName(row),
              getReceivedTeachers(row),
              `GHS ${getReceivedAmount(row)}`,
              getReceivedBy(row),
            ])}
          />
        </Section>

        <Section title="Students Eating">
          <ReportTable
            headers={["Date", "Student", "ID", "Class", "Teacher", "Amount Paid", "New Balance"]}
            rows={eatingRows.map((row) => [
              String(row.date || ""),
              getStudentName(row),
              getStudentIdValue(row),
              getClassName(row),
              getTeacherName(row),
              `GHS ${getAmountPaid(row)}`,
              `GHS ${getNewBalance(row)}`,
            ])}
          />
        </Section>

        <Section title="Absent Students">
          <ReportTable
            headers={["Date", "Student", "ID", "Class", "Teacher"]}
            rows={absentRows.map((row) => [
              String(row.date || ""),
              getStudentName(row),
              getStudentIdValue(row),
              getClassName(row),
              getTeacherName(row),
            ])}
          />
        </Section>

        <Section title="Students Owing">
          <ReportTable
            headers={["Date", "Student", "ID", "Class", "Teacher", "Debt"]}
            rows={owingRows.map((row) => [
              String(row.date || ""),
              getStudentName(row),
              getStudentIdValue(row),
              getClassName(row),
              getTeacherName(row),
              `GHS ${Math.abs(getNewBalance(row))}`,
            ])}
          />
        </Section>

        <Section title="Students With Advance">
          <ReportTable
            headers={["Date", "Student", "ID", "Class", "Teacher", "Advance", "Days Left"]}
            rows={advanceRows.map((row: any) => [
              String(row.date || ""),
              getStudentName(row),
              getStudentIdValue(row),
              getClassName(row),
              getTeacherName(row),
              `GHS ${getNewBalance(row)}`,
              Number(row.daysLeft || 0),
            ])}
          />
        </Section>

        <Section title="Balance Ledger History">
          <ReportTable
            headers={[
              "Date",
              "Student",
              "ID",
              "Class",
              "Attendance",
              "Paid",
              "Previous Balance",
              "Ate",
              "New Balance",
            ]}
            rows={filteredEntries.map((row) => [
              String(row.date || ""),
              getStudentName(row),
              getStudentIdValue(row),
              getClassName(row),
              String(row.attendance || ""),
              `GHS ${getAmountPaid(row)}`,
              `GHS ${getPreviousBalance(row)}`,
              getAteToday(row) ? "Yes" : "No",
              `GHS ${getNewBalance(row)}`,
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

const buttonStyle: React.CSSProperties = {
  background: COLORS.primary,
  color: COLORS.secondary,
  border: "none",
  borderRadius: "10px",
  padding: "12px 16px",
  fontWeight: "bold",
  cursor: "pointer",
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
