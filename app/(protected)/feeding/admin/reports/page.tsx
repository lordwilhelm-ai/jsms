"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import { fetchWithCache } from "@/lib/offline/cachedQuery";

const OFFLINE_MODULE = "feeding";

type EntryRow = Record<string, any>;
type ReceivedRow = Record<string, any>;
type SettingsRow = Record<string, any>;
type ClassRow = Record<string, any>;
type ReportSummary = {
  totalMoney: number;
  totalReceived: number;
  outstandingNotCollected: number;
  eatingCount: number;
  creditCount: number;
  creditOwed: number;
  presentCount: number;
  absentCount: number;
  owingCount: number;
  advanceCount: number;
};

type ReportMode = "today" | "single" | "range";
type ModalView =
  | "class"
  | "money"
  | "received"
  | "eating"
  | "absent"
  | "owing"
  | "advance"
  | "credit"
  | "ledger";

const COLORS = {
  background:
    "linear-gradient(135deg, #fffdf2 0%, #fff9db 25%, #fef3c7 55%, #fde68a 100%)",
  primary: "#f59e0b",
  secondary: "#111827",
  white: "#ffffff",
  text: "#111827",
  muted: "#6b7280",
  green: "#047857",
  red: "#b91c1c",
};

function getClassName(row: Record<string, any>) {
  return String(row.class_name || row.className || "").trim();
}

function getTeacherName(row: Record<string, any>) {
  return String(
    row.assigned_teacher_name ||
      row.assignedTeacherName ||
      row.teacher_name ||
      row.teacherName ||
      row.entered_by_name ||
      row.enteredByName ||
      ""
  ).trim();
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

function isCreditMeal(row: Record<string, any>) {
  return Boolean(
    row.admin_override_ate_without_pay ??
      row.ate_without_paying ??
      row.ate_without_pay ??
      row.ate_on_credit ??
      row.credit_eating ??
      false
  );
}

function getCreditOwed(row: Record<string, any>, feedingFee: number) {
  if (!isCreditMeal(row)) return 0;
  const balanceDebt = Math.max(0, Math.abs(Math.min(getNewBalance(row), 0)));
  const mealDebt = Math.max(0, feedingFee - getAmountPaid(row));
  return balanceDebt || mealDebt || feedingFee;
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

function gh(value: number) {
  return `GHS ${Number(value || 0).toLocaleString("en-GH")}`;
}

function ghRaw(value: number) {
  return `GHS ${Number(value || 0)}`;
}

function getGhanaToday() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Accra" });
}

export default function FeedingReportsPage() {
  const today = getGhanaToday();

  const [loading, setLoading] = useState(false);
  const [entries, setEntries] = useState<EntryRow[]>([]);
  const [receivedMoney, setReceivedMoney] = useState<ReceivedRow[]>([]);
  const [showingCachedData, setShowingCachedData] = useState(false);
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
  const [activeModal, setActiveModal] = useState<ModalView | null>(null);

  useEffect(() => {
    void loadReports();
  }, [reportMode, singleDate, startDate, endDate]);

  async function loadReports() {
    try {
      setLoading(true);

      const [settingsRes, classesRes] = await Promise.all([
        fetchWithCache(OFFLINE_MODULE, "school_settings", () => supabase.from("school_settings").select("*").limit(1).maybeSingle(), null),
        fetchWithCache(OFFLINE_MODULE, "classes", () => supabase.from("classes").select("*").order("class_order", { ascending: true }), [] as ClassRow[]),
      ]);

      setSettingsRow(settingsRes.data || null);
      setClasses(classesRes.data || []);

      // Cache key must encode the mode+date(s) — otherwise switching the
      // date/filter while offline would silently serve whichever range was
      // cached last as if it were the one just requested.
      const scopeKey =
        reportMode === "today"
          ? `today:${today}`
          : reportMode === "single"
          ? `single:${singleDate}`
          : `range:${startDate}_${endDate}`;

      const [entriesRes, receivedRes] = await Promise.all([
        fetchWithCache(
          OFFLINE_MODULE,
          `daily_entries:${scopeKey}`,
          () => {
            let query = supabase.from("daily_entries").select("*");
            if (reportMode === "today") query = query.eq("date", today);
            else if (reportMode === "single") query = query.eq("date", singleDate);
            else query = query.gte("date", startDate).lte("date", endDate);
            return query;
          },
          [] as EntryRow[]
        ),
        fetchWithCache(
          OFFLINE_MODULE,
          `received_money:${scopeKey}`,
          () => {
            let query = supabase.from("received_money").select("*");
            if (reportMode === "today") query = query.eq("date", today);
            else if (reportMode === "single") query = query.eq("date", singleDate);
            else query = query.gte("date", startDate).lte("date", endDate);
            return query;
          },
          [] as ReceivedRow[]
        ),
      ]);

      setEntries(entriesRes.data || []);
      setReceivedMoney(receivedRes.data || []);
      setShowingCachedData(
        [settingsRes, classesRes, entriesRes, receivedRes].some((r) => r.fromCache)
      );
    } catch (error) {
      console.error(error);
      alert("Failed to load reports.");
    } finally {
      setLoading(false);
    }
  }

  const feedingFee = Number(settingsRow?.feeding_fee || 6);

  const classOptions = useMemo(() => {
    const fromClasses = (classes || []).map((row) => getClassName(row)).filter(Boolean);
    const fromEntries = (entries || []).map((row) => getClassName(row)).filter(Boolean);
    return Array.from(new Set([...fromClasses, ...fromEntries])).sort((a, b) => a.localeCompare(b));
  }, [classes, entries]);

  const teacherOptions = useMemo(() => {
    return Array.from(new Set(entries.map((item) => getTeacherName(item)).filter(Boolean))).sort();
  }, [entries]);

  const filteredEntries = useMemo(() => {
    return entries.filter((entry) => {
      const matchesClass = classFilter === "All" ? true : getClassName(entry) === classFilter;
      const matchesTeacher = teacherFilter === "All" ? true : getTeacherName(entry) === teacherFilter;

      const attendance = String(entry.attendance || "").toLowerCase();
      const matchesStatus =
        statusFilter === "All"
          ? true
          : statusFilter === "Eating"
          ? getAteToday(entry)
          : statusFilter === "Absent"
          ? attendance === "absent"
          : statusFilter === "Owing"
          ? getNewBalance(entry) < 0
          : statusFilter === "Advance"
          ? getNewBalance(entry) > 0
          : statusFilter === "Credit"
          ? isCreditMeal(entry)
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

  const creditRows = useMemo(() => filteredEntries.filter(isCreditMeal), [filteredEntries]);
  const owingRows = useMemo(() => filteredEntries.filter((entry) => getNewBalance(entry) < 0), [filteredEntries]);
  const eatingRows = useMemo(() => filteredEntries.filter((entry) => getAteToday(entry)), [filteredEntries]);
  const absentRows = useMemo(
    () => filteredEntries.filter((entry) => String(entry.attendance || "").toLowerCase() === "absent"),
    [filteredEntries]
  );
  const advanceRows = useMemo(
    () =>
      filteredEntries
        .filter((entry) => getNewBalance(entry) > 0)
        .map((entry) => ({ ...entry, daysLeft: Math.floor(getNewBalance(entry) / feedingFee) })),
    [filteredEntries, feedingFee]
  );

  const summary = useMemo<ReportSummary>(() => {
    const totalReceived = filteredReceivedMoney.reduce((sum, item) => sum + getReceivedAmount(item), 0);

    const base = filteredEntries.reduce(
      (acc: Omit<ReportSummary, "totalReceived" | "outstandingNotCollected">, entry) => {
        const attendance = String(entry.attendance || "").toLowerCase();
        acc.totalMoney += getAmountPaid(entry);
        if (attendance === "present") acc.presentCount += 1;
        if (attendance === "absent") acc.absentCount += 1;
        if (getAteToday(entry)) acc.eatingCount += 1;
        if (getNewBalance(entry) < 0) acc.owingCount += 1;
        if (getNewBalance(entry) > 0) acc.advanceCount += 1;
        if (isCreditMeal(entry)) {
          acc.creditCount += 1;
          acc.creditOwed += getCreditOwed(entry, feedingFee);
        }
        return acc;
      },
      {
        totalMoney: 0,
        presentCount: 0,
        absentCount: 0,
        eatingCount: 0,
        owingCount: 0,
        advanceCount: 0,
        creditCount: 0,
        creditOwed: 0,
      }
    );

    return {
      ...base,
      totalReceived,
      outstandingNotCollected: base.totalMoney - totalReceived,
    };
  }, [filteredEntries, filteredReceivedMoney, feedingFee]);

  const byClassSummary = useMemo(() => {
    return classOptions
      .map((className) => {
        const classRows = filteredEntries.filter((entry) => getClassName(entry) === className);
        const classReceivedRows = filteredReceivedMoney.filter((item) => getClassName(item) === className);
        const moneyEntered = classRows.reduce((sum, row) => sum + getAmountPaid(row), 0);
        const moneyReceivedValue = classReceivedRows.reduce((sum, row) => sum + getReceivedAmount(row), 0);
        const classCreditRows = classRows.filter(isCreditMeal);
        const teacherNames = Array.from(new Set(classRows.map(getTeacherName).filter(Boolean))).join(", ");

        return {
          className,
          teacherNames: teacherNames || "Not Assigned",
          records: classRows.length,
          moneyEntered,
          moneyReceived: moneyReceivedValue,
          outstanding: moneyEntered - moneyReceivedValue,
          eating: classRows.filter((row) => getAteToday(row)).length,
          absent: classRows.filter((row) => String(row.attendance || "").toLowerCase() === "absent").length,
          owing: classRows.filter((row) => getNewBalance(row) < 0).length,
          creditCount: classCreditRows.length,
          creditOwed: classCreditRows.reduce((sum, row) => sum + getCreditOwed(row, feedingFee), 0),
        };
      })
      .filter((row) => row.records > 0 || row.moneyReceived > 0);
  }, [classOptions, filteredEntries, filteredReceivedMoney, feedingFee]);

  function handleClassChange(value: string) {
    setClassFilter(value);
    if (value !== "All") setActiveModal("class");
  }

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

  function downloadCsv(filename: string, headers: string[], rows: (string | number | boolean)[][]) {
    const csvContent = [headers.map(escapeCsv).join(","), ...rows.map((row) => row.map(escapeCsv).join(","))].join("\n");
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
      isCreditMeal(row) ? "Yes" : "No",
      getCreditOwed(row, feedingFee),
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
        "Ate On Credit",
        "Credit Owed",
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
      row.teacherNames,
      row.records,
      row.moneyEntered,
      row.moneyReceived,
      row.outstanding,
      row.eating,
      row.absent,
      row.owing,
      row.creditCount,
      row.creditOwed,
    ]);

    downloadCsv(
      `class-breakdown-${getReportLabel()}.csv`,
      [
        "Class",
        "Teacher(s)",
        "Records",
        "Money Entered",
        "Money Received",
        "Outstanding",
        "Eating",
        "Absent",
        "Owing",
        "Ate On Credit",
        "Credit Owed",
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

    downloadCsv(`received-money-${getReportLabel()}.csv`, ["Date", "Class", "Teachers", "Amount Received", "Received By"], rows);
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
      isCreditMeal(row) ? "Yes" : "No",
      getCreditOwed(row, feedingFee),
      getNewBalance(row),
      getNewBalance(row) < 0 ? "Owing" : getNewBalance(row) > 0 ? "Advance" : "Cleared",
    ]);

    downloadCsv(
      `feeding-report-${getReportLabel()}.csv`,
      ["Date", "Student Name", "Student ID", "Class", "Teacher", "Attendance", "Amount Paid", "Ate Today", "Ate On Credit", "Credit Owed", "Balance", "Balance Status"],
      rows
    );
  }

  const schoolName = String(settingsRow?.school_name || "JEFSEM VISION SCHOOL");
  const motto = String(settingsRow?.motto || "Success in Excellence");
  const academicYear = String(settingsRow?.academic_year || "-");
  const currentTerm = String(settingsRow?.current_term || "-");

  return (
    <main style={{ minHeight: "100vh", background: COLORS.background, fontFamily: "Arial, sans-serif", color: COLORS.text }}>
      <div style={{ background: COLORS.secondary, color: COLORS.white, padding: "18px 24px", borderBottom: `6px solid ${COLORS.primary}` }}>
        <div style={{ maxWidth: "1500px", margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
          <div>
            <h1 style={{ margin: 0, fontSize: "28px" }}>Feeding Reports</h1>
            <p style={{ margin: "6px 0 0", fontWeight: "bold" }}>{schoolName}</p>
            <p style={{ margin: "4px 0 0", opacity: 0.9 }}>{motto}</p>
            {showingCachedData && (
              <p style={{ margin: "6px 0 0", fontSize: "12px", opacity: 0.85 }}>Showing last synced data</p>
            )}
            <p style={{ margin: "6px 0 0", fontSize: "13px", opacity: 0.9 }}>
              <strong>{academicYear}</strong> • <strong>{currentTerm}</strong>
            </p>
          </div>

          <Link href="/feeding/admin" style={backButtonStyle}>
            Back to Feeding Admin
          </Link>
        </div>
      </div>

      <div style={{ maxWidth: "1500px", margin: "0 auto", padding: "18px" }}>
        <div style={filterPanelStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center", flexWrap: "wrap", marginBottom: "12px" }}>
            <div>
              <h3 style={{ margin: 0, color: COLORS.secondary }}>Choose report</h3>
              <p style={{ margin: "4px 0 0", color: COLORS.muted, fontSize: "13px" }}>
                Select date/class, then open only the report you need.
              </p>
            </div>
            <button onClick={loadReports} style={buttonStyle}>
              {loading ? "Loading..." : "Refresh"}
            </button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: "10px" }}>
            <div>
              <label style={labelStyle}>Report Mode</label>
              <select value={reportMode} onChange={(e) => setReportMode(e.target.value as ReportMode)} style={inputStyle}>
                <option value="today">Today</option>
                <option value="single">Single Date</option>
                <option value="range">Date Range</option>
              </select>
            </div>

            {reportMode === "single" && (
              <div>
                <label style={labelStyle}>Date</label>
                <input type="date" value={singleDate} onChange={(e) => setSingleDate(e.target.value)} style={inputStyle} />
              </div>
            )}

            {reportMode === "range" && (
              <>
                <div>
                  <label style={labelStyle}>Start Date</label>
                  <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>End Date</label>
                  <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} style={inputStyle} />
                </div>
              </>
            )}

            <div>
              <label style={labelStyle}>Class</label>
              <select value={classFilter} onChange={(e) => handleClassChange(e.target.value)} style={inputStyle}>
                <option value="All">All Classes</option>
                {classOptions.map((className) => (
                  <option key={className} value={className}>
                    {className}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={labelStyle}>Teacher</label>
              <select value={teacherFilter} onChange={(e) => setTeacherFilter(e.target.value)} style={inputStyle}>
                <option value="All">All Teachers</option>
                {teacherOptions.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={labelStyle}>Status</label>
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={inputStyle}>
                <option value="All">All</option>
                <option value="Eating">Eating</option>
                <option value="Absent">Absent</option>
                <option value="Credit">Ate On Credit</option>
                <option value="Owing">Owing</option>
                <option value="Advance">Advance</option>
              </select>
            </div>

            <div>
              <label style={labelStyle}>Search</label>
              <input type="text" placeholder="Student, ID, class, teacher" value={search} onChange={(e) => setSearch(e.target.value)} style={inputStyle} />
            </div>
          </div>
        </div>

        <div style={summaryGridStyle}>
          <SummaryCard title="Money Entered" value={gh(summary.totalMoney)} onClick={() => setActiveModal("money")} />
          <SummaryCard title="Money Received" value={gh(summary.totalReceived)} onClick={() => setActiveModal("received")} />
          <SummaryCard title="Not Collected" value={gh(summary.outstandingNotCollected)} onClick={() => setActiveModal("class")} />
          <SummaryCard title="Eating" value={summary.eatingCount} onClick={() => setActiveModal("eating")} />
          <SummaryCard title="Ate On Credit" value={summary.creditCount} onClick={() => setActiveModal("credit")} highlight="red" />
          <SummaryCard title="Credit Owed" value={gh(summary.creditOwed)} onClick={() => setActiveModal("credit")} highlight="red" />
          <SummaryCard title="Present" value={summary.presentCount} onClick={() => setActiveModal("ledger")} />
          <SummaryCard title="Absent" value={summary.absentCount} onClick={() => setActiveModal("absent")} />
          <SummaryCard title="Owing" value={summary.owingCount} onClick={() => setActiveModal("owing")} />
          <SummaryCard title="Advance" value={summary.advanceCount} onClick={() => setActiveModal("advance")} />
        </div>

        <div style={quickPanelStyle}>
          <button onClick={() => setActiveModal("class")} style={quickButtonStyle}>Class Summary</button>
          <button onClick={() => setActiveModal("money")} style={quickButtonStyle}>Money Breakdown</button>
          <button onClick={() => setActiveModal("credit")} style={dangerButtonStyle}>Ate On Credit</button>
          <button onClick={() => setActiveModal("received")} style={quickButtonStyle}>Money Received</button>
          <button onClick={() => setActiveModal("eating")} style={quickButtonStyle}>Eating</button>
          <button onClick={() => setActiveModal("absent")} style={quickButtonStyle}>Absent</button>
          <button onClick={() => setActiveModal("owing")} style={quickButtonStyle}>Owing</button>
          <button onClick={() => setActiveModal("advance")} style={quickButtonStyle}>Advance</button>
          <button onClick={() => setActiveModal("ledger")} style={quickButtonStyle}>Ledger</button>
        </div>

        <div style={{ ...quickPanelStyle, marginTop: "14px" }}>
          <button onClick={exportFullFilteredReport} style={exportButtonStyle}>Export Full Report</button>
          <button onClick={exportMoneyBreakdown} style={exportButtonStyle}>Export Money Breakdown</button>
          <button onClick={exportClassBreakdown} style={exportButtonStyle}>Export Class Breakdown</button>
          <button onClick={exportReceivedMoney} style={exportButtonStyle}>Export Received Money</button>
        </div>

        <p style={{ marginTop: "28px", fontSize: "13px", color: "#666", textAlign: "center" }}>
          System developed by Lord Wilhelm (0593410452)
        </p>
      </div>

      {activeModal && (
        <ReportModal title={getModalTitle(activeModal, classFilter)} onClose={() => setActiveModal(null)}>
          {activeModal === "class" && (
            <ReportTable
              headers={["Class", "Teacher(s)", "Records", "Money", "Received", "Outstanding", "Eating", "Absent", "Ate Credit", "Credit Owed", "Owing"]}
              rows={byClassSummary.map((row) => [
                row.className,
                row.teacherNames,
                row.records,
                ghRaw(row.moneyEntered),
                ghRaw(row.moneyReceived),
                ghRaw(row.outstanding),
                row.eating,
                row.absent,
                row.creditCount,
                ghRaw(row.creditOwed),
                row.owing,
              ])}
            />
          )}

          {activeModal === "money" && (
            <ReportTable
              headers={["Date", "Student", "ID", "Class", "Teacher", "Paid", "Ate", "Ate Credit", "Balance"]}
              rows={filteredEntries.map((row) => [
                String(row.date || ""),
                getStudentName(row),
                getStudentIdValue(row),
                getClassName(row),
                getTeacherName(row),
                ghRaw(getAmountPaid(row)),
                getAteToday(row) ? "Yes" : "No",
                isCreditMeal(row) ? "Yes" : "No",
                ghRaw(getNewBalance(row)),
              ])}
            />
          )}

          {activeModal === "credit" && (
            <ReportTable
              headers={["Date", "Student", "ID", "Class", "Teacher", "Paid", "Credit Owed", "New Balance"]}
              rows={creditRows.map((row) => [
                String(row.date || ""),
                getStudentName(row),
                getStudentIdValue(row),
                getClassName(row),
                getTeacherName(row),
                ghRaw(getAmountPaid(row)),
                ghRaw(getCreditOwed(row, feedingFee)),
                ghRaw(getNewBalance(row)),
              ])}
            />
          )}

          {activeModal === "received" && (
            <ReportTable
              headers={["Date", "Class", "Teacher(s)", "Amount Received", "Received By"]}
              rows={filteredReceivedMoney.map((row) => [
                String(row.date || ""),
                getClassName(row),
                getReceivedTeachers(row),
                ghRaw(getReceivedAmount(row)),
                getReceivedBy(row),
              ])}
            />
          )}

          {activeModal === "eating" && (
            <ReportTable
              headers={["Date", "Student", "ID", "Class", "Teacher", "Amount Paid", "Ate Credit", "New Balance"]}
              rows={eatingRows.map((row) => [
                String(row.date || ""),
                getStudentName(row),
                getStudentIdValue(row),
                getClassName(row),
                getTeacherName(row),
                ghRaw(getAmountPaid(row)),
                isCreditMeal(row) ? "Yes" : "No",
                ghRaw(getNewBalance(row)),
              ])}
            />
          )}

          {activeModal === "absent" && (
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
          )}

          {activeModal === "owing" && (
            <ReportTable
              headers={["Date", "Student", "ID", "Class", "Teacher", "Debt"]}
              rows={owingRows.map((row) => [
                String(row.date || ""),
                getStudentName(row),
                getStudentIdValue(row),
                getClassName(row),
                getTeacherName(row),
                ghRaw(Math.abs(getNewBalance(row))),
              ])}
            />
          )}

          {activeModal === "advance" && (
            <ReportTable
              headers={["Date", "Student", "ID", "Class", "Teacher", "Advance", "Days Left"]}
              rows={advanceRows.map((row: any) => [
                String(row.date || ""),
                getStudentName(row),
                getStudentIdValue(row),
                getClassName(row),
                getTeacherName(row),
                ghRaw(getNewBalance(row)),
                Number(row.daysLeft || 0),
              ])}
            />
          )}

          {activeModal === "ledger" && (
            <ReportTable
              headers={["Date", "Student", "ID", "Class", "Attendance", "Paid", "Previous", "Ate", "Ate Credit", "New Balance"]}
              rows={filteredEntries.map((row) => [
                String(row.date || ""),
                getStudentName(row),
                getStudentIdValue(row),
                getClassName(row),
                String(row.attendance || ""),
                ghRaw(getAmountPaid(row)),
                ghRaw(getPreviousBalance(row)),
                getAteToday(row) ? "Yes" : "No",
                isCreditMeal(row) ? "Yes" : "No",
                ghRaw(getNewBalance(row)),
              ])}
            />
          )}
        </ReportModal>
      )}
    </main>
  );
}

function getModalTitle(activeModal: ModalView, classFilter: string) {
  const classPart = classFilter !== "All" ? ` — ${classFilter}` : "";
  const titles: Record<ModalView, string> = {
    class: `Class Report${classPart}`,
    money: `Money Breakdown${classPart}`,
    received: `Money Received${classPart}`,
    eating: `Students Eating${classPart}`,
    absent: `Absent Students${classPart}`,
    owing: `Students Owing${classPart}`,
    advance: `Students With Advance${classPart}`,
    credit: `Ate On Credit${classPart}`,
    ledger: `Balance Ledger${classPart}`,
  };
  return titles[activeModal];
}

function SummaryCard({
  title,
  value,
  onClick,
  highlight,
}: {
  title: string;
  value: string | number;
  onClick: () => void;
  highlight?: "red";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        background: COLORS.white,
        borderRadius: "14px",
        padding: "14px",
        boxShadow: "0 8px 22px rgba(0,0,0,0.06)",
        border: "1px solid #f1f5f9",
        borderTop: `5px solid ${highlight === "red" ? COLORS.red : COLORS.primary}`,
        textAlign: "left",
        cursor: "pointer",
        minHeight: "100px",
      }}
    >
      <p style={{ margin: 0, fontSize: "13px", color: "#666" }}>{title}</p>
      <h2 style={{ margin: "8px 0 0", color: highlight === "red" ? COLORS.red : COLORS.secondary, fontSize: "25px" }}>
        {value}
      </h2>
      <p style={{ margin: "6px 0 0", color: COLORS.muted, fontSize: "12px" }}>Tap to view</p>
    </button>
  );
}

function ReportModal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  return (
    <div style={modalOverlayStyle} onClick={onClose}>
      <div style={modalCardStyle} onClick={(event) => event.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", marginBottom: "14px" }}>
          <h2 style={{ margin: 0, color: COLORS.secondary }}>{title}</h2>
          <button onClick={onClose} style={closeButtonStyle}>Close</button>
        </div>
        <div style={{ overflowX: "auto", maxHeight: "72vh" }}>{children}</div>
      </div>
    </div>
  );
}

function ReportTable({ headers, rows }: { headers: string[]; rows: (string | number)[][] }) {
  return rows.length === 0 ? (
    <p style={{ color: "#666", marginBottom: 0 }}>No data found.</p>
  ) : (
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
  );
}

const filterPanelStyle: CSSProperties = {
  background: COLORS.white,
  borderRadius: "16px",
  padding: "16px",
  boxShadow: "0 8px 22px rgba(0,0,0,0.06)",
  marginBottom: "16px",
};

const summaryGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
  gap: "12px",
  marginBottom: "16px",
};

const quickPanelStyle: CSSProperties = {
  background: COLORS.white,
  borderRadius: "16px",
  padding: "14px",
  boxShadow: "0 8px 22px rgba(0,0,0,0.06)",
  display: "flex",
  gap: "10px",
  flexWrap: "wrap",
};

const labelStyle: CSSProperties = {
  display: "block",
  marginBottom: "6px",
  fontWeight: "bold",
  fontSize: "13px",
};

const inputStyle: CSSProperties = {
  width: "100%",
  padding: "10px",
  borderRadius: "10px",
  border: "1px solid #ddd",
  fontSize: "14px",
};

const buttonStyle: CSSProperties = {
  background: COLORS.primary,
  color: COLORS.secondary,
  border: "none",
  borderRadius: "10px",
  padding: "10px 14px",
  fontWeight: "bold",
  cursor: "pointer",
};

const quickButtonStyle: CSSProperties = {
  ...buttonStyle,
  background: "#f8fafc",
  border: "1px solid #e5e7eb",
};

const dangerButtonStyle: CSSProperties = {
  ...buttonStyle,
  background: "#fee2e2",
  color: COLORS.red,
  border: "1px solid #fecaca",
};

const exportButtonStyle: CSSProperties = {
  ...buttonStyle,
  background: "#111827",
  color: "#ffffff",
};

const backButtonStyle: CSSProperties = {
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

const modalOverlayStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 1000,
  background: "rgba(15,23,42,0.65)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "20px",
};

const modalCardStyle: CSSProperties = {
  width: "min(1300px, 96vw)",
  maxHeight: "90vh",
  background: COLORS.white,
  borderRadius: "18px",
  padding: "18px",
  boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
};

const closeButtonStyle: CSSProperties = {
  border: "none",
  borderRadius: "10px",
  background: "#111827",
  color: "white",
  padding: "10px 14px",
  cursor: "pointer",
  fontWeight: "bold",
};

const thStyle: CSSProperties = {
  textAlign: "left",
  padding: "12px",
  borderBottom: "1px solid #e5e7eb",
  whiteSpace: "nowrap",
};

const tdStyle: CSSProperties = {
  padding: "12px",
  borderBottom: "1px solid #f0f0f0",
  verticalAlign: "top",
};
