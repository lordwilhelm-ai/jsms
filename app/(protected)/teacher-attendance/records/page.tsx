"use client";

import type React from "react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type AnyRow = Record<string, any>;
type FilterMode = "today" | "week" | "month" | "term" | "year" | "custom";

const COLORS = {
  bg: "#f7f4ec",
  dark: "#0f172a",
  darkSoft: "#111827",
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
  infoBg: "#eff6ff",
  infoText: "#1d4ed8",
};

function getRole(row: AnyRow | null) {
  return String(row?.role || "").trim().toLowerCase();
}

function isAdminRole(role: string) {
  return role === "admin" || role === "super_admin" || role === "superadmin";
}

function isTeacherRole(role: string) {
  return role === "teacher";
}

function toIsoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString([], {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatTime(value?: string | null) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString();
}

function getTeacherName(row: AnyRow | null) {
  return String(row?.full_name || row?.name || row?.teacher_name || "Teacher");
}

function getTeacherId(row: AnyRow | null) {
  if (!row) return "";
  return String(row.teacher_id || "").trim() || String(row.id || "").trim();
}

function getTeacherClass(row: AnyRow | null) {
  if (!row) return "-";

  const possible =
    row.assigned_classes ||
    row.classes ||
    row.class_names ||
    row.class_name ||
    row.class ||
    row.assigned_class ||
    row.teacher_class ||
    row.level;

  if (Array.isArray(possible)) return possible.join(", ");
  return String(possible || "-");
}

function startOfWeekMonday(date: Date) {
  const copy = new Date(date);
  const day = copy.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  copy.setDate(copy.getDate() + diff);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function endOfWeekSunday(date: Date) {
  const start = startOfWeekMonday(date);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return end;
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function startOfYear(date: Date) {
  return new Date(date.getFullYear(), 0, 1);
}

function endOfYear(date: Date) {
  return new Date(date.getFullYear(), 11, 31);
}

function getSettingDate(settings: AnyRow | null, names: string[]) {
  for (const name of names) {
    const value = settings?.[name];
    if (value) return String(value).slice(0, 10);
  }
  return "";
}

function statusBadge(status?: string | null) {
  const s = String(status || "").trim().toLowerCase();

  if (s === "present" || s === "checked out") {
    return { bg: COLORS.successBg, color: COLORS.successText, label: status || "Present" };
  }

  if (s === "late") {
    return { bg: COLORS.warningBg, color: COLORS.warningText, label: "Late" };
  }

  if (s === "absent" || s === "missing checkout" || s === "not marked") {
    return { bg: COLORS.dangerBg, color: COLORS.dangerText, label: status || "Absent" };
  }

  return { bg: COLORS.infoBg, color: COLORS.infoText, label: status || "Marked" };
}

function getDateRange(mode: FilterMode, settings: AnyRow | null) {
  const now = new Date();

  if (mode === "today") {
    const today = toIsoDate(now);
    return { start: today, end: today };
  }

  if (mode === "week") {
    return {
      start: toIsoDate(startOfWeekMonday(now)),
      end: toIsoDate(endOfWeekSunday(now)),
    };
  }

  if (mode === "month") {
    return {
      start: toIsoDate(startOfMonth(now)),
      end: toIsoDate(endOfMonth(now)),
    };
  }

  if (mode === "term") {
    const start =
      getSettingDate(settings, [
        "current_term_start_date",
        "term_start_date",
        "current_term_start",
        "term_start",
      ]) || toIsoDate(startOfMonth(now));

    const end =
      getSettingDate(settings, [
        "current_term_end_date",
        "term_end_date",
        "current_term_end",
        "term_end",
      ]) || toIsoDate(endOfMonth(now));

    return { start, end };
  }

  if (mode === "year") {
    const start =
      getSettingDate(settings, [
        "academic_year_start_date",
        "year_start_date",
        "academic_start_date",
        "academic_year_start",
      ]) || toIsoDate(startOfYear(now));

    const end =
      getSettingDate(settings, [
        "academic_year_end_date",
        "year_end_date",
        "academic_end_date",
        "academic_year_end",
      ]) || toIsoDate(endOfYear(now));

    return { start, end };
  }

  return {
    start: toIsoDate(startOfWeekMonday(now)),
    end: toIsoDate(endOfWeekSunday(now)),
  };
}

export default function TeacherAttendanceRecordsPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [recordsLoading, setRecordsLoading] = useState(false);

  const [settingsRow, setSettingsRow] = useState<AnyRow | null>(null);
  const [teachers, setTeachers] = useState<AnyRow[]>([]);
  const [records, setRecords] = useState<AnyRow[]>([]);

  const [mode, setMode] = useState<FilterMode>("today");
  const [startDate, setStartDate] = useState(toIsoDate(new Date()));
  const [endDate, setEndDate] = useState(toIsoDate(new Date()));
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error" | "info">("info");

  useEffect(() => {
    let active = true;

    async function loadPage() {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!active) return;

        if (!session?.user) {
          router.replace("/");
          return;
        }

        const [teachersRes, settingsRes] = await Promise.all([
          supabase.from("teachers").select("*"),
          supabase.from("school_settings").select("*").limit(1).maybeSingle(),
        ]);

        if (!active) return;

        if (teachersRes.error) throw teachersRes.error;

        const allUsers = teachersRes.data || [];

        const matchedUser =
          allUsers.find((item) => item.auth_user_id === session.user.id) ||
          allUsers.find(
            (item) =>
              String(item.email || "").trim().toLowerCase() ===
              String(session.user.email || "").trim().toLowerCase()
          ) ||
          null;

        const fallbackAdminUser = {
          id: session.user.id,
          auth_user_id: session.user.id,
          email: session.user.email || "",
          full_name: "Admin",
          role: "admin",
        };

        const finalUser = matchedUser || fallbackAdminUser;

        if (!isAdminRole(getRole(finalUser))) {
          router.replace("/teacher-attendance");
          return;
        }

        const realTeachers = allUsers.filter((item) => isTeacherRole(getRole(item)));

        const settings = settingsRes.data || null;
        const range = getDateRange("today", settings);

        setSettingsRow(settings);
        setTeachers(realTeachers);
        setStartDate(range.start);
        setEndDate(range.end);

        await loadRecords(range.start, range.end);
      } catch (error: any) {
        console.error(error);
        setMessage(error?.message || "Failed to load records page.");
        setMessageType("error");
      } finally {
        if (active) setLoading(false);
      }
    }

    async function loadRecords(start: string, end: string) {
      const { data, error } = await supabase
        .from("teacher_attendance")
        .select("*")
        .gte("attendance_date", start)
        .lte("attendance_date", end)
        .order("attendance_date", { ascending: false })
        .order("teacher_name", { ascending: true });

      if (error) throw error;
      if (active) setRecords(data || []);
    }

    void loadPage();

    return () => {
      active = false;
    };
  }, [router]);

  async function reloadRecords(nextStart = startDate, nextEnd = endDate) {
    try {
      setRecordsLoading(true);
      setMessage("");

      if (!nextStart || !nextEnd) {
        setMessage("Select start and end date.");
        setMessageType("error");
        return;
      }

      const { data, error } = await supabase
        .from("teacher_attendance")
        .select("*")
        .gte("attendance_date", nextStart)
        .lte("attendance_date", nextEnd)
        .order("attendance_date", { ascending: false })
        .order("teacher_name", { ascending: true });

      if (error) throw error;

      setRecords(data || []);
    } catch (error: any) {
      console.error(error);
      setMessage(error?.message || "Failed to load attendance records.");
      setMessageType("error");
    } finally {
      setRecordsLoading(false);
    }
  }

  function handleModeChange(nextMode: FilterMode) {
    setMode(nextMode);

    if (nextMode === "custom") return;

    const range = getDateRange(nextMode, settingsRow);
    setStartDate(range.start);
    setEndDate(range.end);
    void reloadRecords(range.start, range.end);
  }

  const teacherById = useMemo(() => {
    const map = new Map<string, AnyRow>();

    teachers.forEach((teacher) => {
      const id = getTeacherId(teacher);
      if (id) map.set(id, teacher);
    });

    return map;
  }, [teachers]);

  const filteredRecords = useMemo(() => {
    const q = search.trim().toLowerCase();

    if (!q) return records;

    return records.filter((row) => {
      const teacher = teacherById.get(String(row.teacher_id || "")) || null;
      const teacherName = String(row.teacher_name || getTeacherName(teacher)).toLowerCase();
      const teacherClass = getTeacherClass(teacher).toLowerCase();
      const status = String(row.check_in_status || "").toLowerCase();
      const date = String(row.attendance_date || "").toLowerCase();

      return (
        teacherName.includes(q) ||
        teacherClass.includes(q) ||
        status.includes(q) ||
        date.includes(q) ||
        String(row.teacher_id || "").toLowerCase().includes(q)
      );
    });
  }, [records, search, teacherById]);

  const summary = useMemo(() => {
    const checkedIn = filteredRecords.filter((row) => row.check_in_time).length;
    const checkedOut = filteredRecords.filter((row) => row.check_out_time).length;
    const late = filteredRecords.filter(
      (row) => String(row.check_in_status || "").toLowerCase() === "late"
    ).length;
    const onDuty = filteredRecords.filter((row) => Boolean(row.is_on_duty)).length;
    const missingCheckout = filteredRecords.filter(
      (row) => row.check_in_time && !row.check_out_time
    ).length;

    return {
      total: filteredRecords.length,
      checkedIn,
      checkedOut,
      late,
      onDuty,
      missingCheckout,
    };
  }, [filteredRecords]);

  const periodLabel = useMemo(() => {
    const labels: Record<FilterMode, string> = {
      today: "Today",
      week: "This Week",
      month: "This Month",
      term: "Current Term",
      year: "Academic Year",
      custom: "Custom Range",
    };

    return labels[mode];
  }, [mode]);

  if (loading) {
    return (
      <main style={loadingPageStyle}>
        <div style={loadingCardStyle}>Loading attendance records...</div>
      </main>
    );
  }

  return (
    <main style={pageStyle}>
      <style jsx global>{`
        @media print {
          body {
            background: #fff !important;
          }

          .no-print {
            display: none !important;
          }

          .print-card {
            box-shadow: none !important;
            border: 1px solid #ddd !important;
          }

          table {
            font-size: 11px !important;
          }

          main {
            padding: 0 !important;
            background: #fff !important;
          }
        }
      `}</style>

      <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
        <div style={headerStyle} className="no-print">
          <div style={headerFlexStyle}>
            <div>
              <p style={eyebrowStyle}>Admin Panel</p>
              <h1 style={{ margin: "4px 0 0", fontSize: "24px", lineHeight: 1.1 }}>
                Attendance Records
              </h1>
              <p style={headerNameStyle}>
                Print records by today, week, month, term, year, or custom range
              </p>
            </div>

            <div style={headerRightStyle}>
              <Link href="/teacher-attendance" style={topButtonStyle}>
                Back
              </Link>
              <Link href="/teacher-attendance/duty-roster" style={topButtonStyle}>
                Duty Roster
              </Link>
              <Link href="/teacher-attendance/location-settings" style={topButtonStyle}>
                Location
              </Link>
              <button onClick={() => window.print()} style={topButtonStyle}>
                Print
              </button>
            </div>
          </div>
        </div>

        <section style={printHeaderStyle}>
          <h2 style={{ margin: 0, color: COLORS.dark }}>Teacher Attendance Report</h2>
          <p style={{ margin: "6px 0 0", color: COLORS.muted, fontSize: "13px" }}>
            {periodLabel}: {formatDate(startDate)} to {formatDate(endDate)}
          </p>
          <p style={{ margin: "4px 0 0", color: COLORS.muted, fontSize: "12px" }}>
            Academic Year: {String(settingsRow?.academic_year || "-")} | Term:{" "}
            {String(settingsRow?.current_term || "-")}
          </p>
        </section>

        {message && (
          <div className="no-print">
            <MessageBox message={message} messageType={messageType} />
          </div>
        )}

        <section style={sectionCardStyle} className="no-print print-card">
          <h3 style={sectionTitleStyle}>Filters</h3>

          <div style={filterGridStyle}>
            <label style={labelStyle}>
              Print Range
              <select
                value={mode}
                onChange={(e) => handleModeChange(e.target.value as FilterMode)}
                style={inputStyle}
              >
                <option value="today">Today</option>
                <option value="week">This Week</option>
                <option value="month">This Month</option>
                <option value="term">Current Term</option>
                <option value="year">Academic Year</option>
                <option value="custom">Custom Date Range</option>
              </select>
            </label>

            <label style={labelStyle}>
              Start Date
              <input
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  setMode("custom");
                }}
                style={inputStyle}
              />
            </label>

            <label style={labelStyle}>
              End Date
              <input
                type="date"
                value={endDate}
                onChange={(e) => {
                  setEndDate(e.target.value);
                  setMode("custom");
                }}
                style={inputStyle}
              />
            </label>

            <label style={labelStyle}>
              Search
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Teacher, class, status..."
                style={inputStyle}
              />
            </label>
          </div>

          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "12px" }}>
            <button
              onClick={() => reloadRecords()}
              disabled={recordsLoading}
              style={{
                ...primaryButtonStyle,
                opacity: recordsLoading ? 0.65 : 1,
                cursor: recordsLoading ? "not-allowed" : "pointer",
              }}
            >
              {recordsLoading ? "Loading..." : "Apply Filter"}
            </button>

            <button onClick={() => window.print()} style={secondaryButtonStyle}>
              Print Report
            </button>
          </div>
        </section>

        <div style={{ height: "12px" }} className="no-print" />

        <div style={statsGridStyle}>
          <StatCard label="Records" value={String(summary.total)} tone="info" />
          <StatCard label="Checked In" value={String(summary.checkedIn)} tone="success" />
          <StatCard label="Checked Out" value={String(summary.checkedOut)} tone="success" />
          <StatCard label="Late" value={String(summary.late)} tone="warning" />
          <StatCard label="On Duty" value={String(summary.onDuty)} tone="info" />
          <StatCard
            label="Missing Checkout"
            value={String(summary.missingCheckout)}
            tone="danger"
          />
        </div>

        <div style={{ height: "12px" }} />

        <section style={sectionCardStyle} className="print-card">
          <div style={sectionTopStyle}>
            <div>
              <h3 style={sectionTitleStyle}>Records List</h3>
              <p style={smallTextStyle}>
                Showing {filteredRecords.length} record(s) from {formatDate(startDate)} to{" "}
                {formatDate(endDate)}.
              </p>
            </div>
          </div>

          <div style={tableWrapStyle}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>Date</th>
                  <th style={thStyle}>Teacher</th>
                  <th style={thStyle}>Class</th>
                  <th style={thStyle}>Duty</th>
                  <th style={thStyle}>Check In</th>
                  <th style={thStyle}>Check Out</th>
                  <th style={thStyle}>Status</th>
                </tr>
              </thead>

              <tbody>
                {filteredRecords.length === 0 ? (
                  <tr>
                    <td style={tdStyle} colSpan={7}>
                      No attendance records found.
                    </td>
                  </tr>
                ) : (
                  filteredRecords.map((row) => {
                    const teacher = teacherById.get(String(row.teacher_id || "")) || null;
                    const badge = statusBadge(row.check_in_status);

                    return (
                      <tr key={String(row.id)}>
                        <td style={tdStyle}>{formatDate(row.attendance_date)}</td>
                        <td style={tdStyle}>
                          <strong>{String(row.teacher_name || getTeacherName(teacher))}</strong>
                          <div style={tinyMutedStyle}>{String(row.teacher_id || "-")}</div>
                        </td>
                        <td style={tdStyle}>{getTeacherClass(teacher)}</td>
                        <td style={tdStyle}>{row.is_on_duty ? "Yes" : "No"}</td>
                        <td style={tdStyle}>
                          {formatTime(row.check_in_time)}
                          <div style={tinyMutedStyle}>{formatDateTime(row.check_in_time)}</div>
                        </td>
                        <td style={tdStyle}>
                          {formatTime(row.check_out_time)}
                          <div style={tinyMutedStyle}>{formatDateTime(row.check_out_time)}</div>
                        </td>
                        <td style={tdStyle}>
                          <span
                            style={{
                              background: badge.bg,
                              color: badge.color,
                              padding: "5px 8px",
                              borderRadius: "999px",
                              fontSize: "11px",
                              fontWeight: 900,
                              display: "inline-flex",
                            }}
                          >
                            {badge.label}
                          </span>
                        </td>
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

function MessageBox({
  message,
  messageType,
}: {
  message: string;
  messageType: "success" | "error" | "info";
}) {
  return (
    <div
      style={{
        background:
          messageType === "success"
            ? COLORS.successBg
            : messageType === "error"
            ? COLORS.dangerBg
            : COLORS.infoBg,
        color:
          messageType === "success"
            ? COLORS.successText
            : messageType === "error"
            ? COLORS.dangerText
            : COLORS.infoText,
        borderRadius: "12px",
        padding: "12px 14px",
        marginBottom: "12px",
        fontWeight: 800,
        fontSize: "13px",
      }}
    >
      {message}
    </div>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "success" | "warning" | "danger" | "info";
}) {
  const color =
    tone === "success"
      ? COLORS.successText
      : tone === "warning"
      ? COLORS.warningText
      : tone === "danger"
      ? COLORS.dangerText
      : COLORS.infoText;

  const bg =
    tone === "success"
      ? COLORS.successBg
      : tone === "warning"
      ? COLORS.warningBg
      : tone === "danger"
      ? COLORS.dangerBg
      : COLORS.infoBg;

  return (
    <div style={statCardStyle} className="print-card">
      <div
        style={{
          width: "34px",
          height: "34px",
          borderRadius: "12px",
          background: bg,
          color,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontWeight: 900,
        }}
      >
        •
      </div>

      <div>
        <p style={{ margin: 0, color: COLORS.muted, fontSize: "12px" }}>{label}</p>
        <h2 style={{ margin: "3px 0 0", color: COLORS.dark, fontSize: "22px" }}>{value}</h2>
      </div>
    </div>
  );
}

const pageStyle: React.CSSProperties = {
  minHeight: "100vh",
  background: COLORS.bg,
  fontFamily: "Arial, sans-serif",
  color: COLORS.text,
  padding: "12px",
};

const loadingPageStyle: React.CSSProperties = {
  ...pageStyle,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const loadingCardStyle: React.CSSProperties = {
  background: COLORS.card,
  borderRadius: "18px",
  padding: "18px 22px",
  border: `1px solid ${COLORS.border}`,
  boxShadow: "0 10px 24px rgba(0,0,0,0.06)",
  fontWeight: 700,
};

const headerStyle: React.CSSProperties = {
  background: `linear-gradient(135deg, ${COLORS.dark} 0%, ${COLORS.darkSoft} 100%)`,
  color: "#fff",
  borderRadius: "18px",
  padding: "16px",
  border: `2px solid ${COLORS.gold}`,
  boxShadow: "0 12px 24px rgba(0,0,0,0.10)",
  marginBottom: "12px",
};

const headerFlexStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: "10px",
  alignItems: "flex-start",
  flexWrap: "wrap",
};

const eyebrowStyle: React.CSSProperties = {
  margin: 0,
  fontSize: "10px",
  textTransform: "uppercase",
  letterSpacing: "1px",
  color: "rgba(255,255,255,0.72)",
};

const headerNameStyle: React.CSSProperties = {
  margin: "5px 0 0",
  color: "rgba(255,255,255,0.88)",
  fontSize: "13px",
  fontWeight: 700,
};

const headerRightStyle: React.CSSProperties = {
  display: "flex",
  gap: "8px",
  alignItems: "center",
  flexWrap: "wrap",
  justifyContent: "flex-end",
};

const topButtonStyle: React.CSSProperties = {
  textDecoration: "none",
  border: "1px solid rgba(255,255,255,0.15)",
  borderRadius: "9px",
  padding: "8px 11px",
  background: "rgba(255,255,255,0.06)",
  color: "#fff",
  fontWeight: 800,
  fontSize: "12px",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
};

const printHeaderStyle: React.CSSProperties = {
  background: COLORS.card,
  borderRadius: "14px",
  border: `1px solid ${COLORS.border}`,
  padding: "14px",
  marginBottom: "12px",
};

const sectionCardStyle: React.CSSProperties = {
  background: COLORS.card,
  borderRadius: "15px",
  border: `1px solid ${COLORS.border}`,
  boxShadow: "0 6px 16px rgba(0,0,0,0.04)",
  padding: "14px",
};

const sectionTitleStyle: React.CSSProperties = {
  marginTop: 0,
  marginBottom: "9px",
  color: COLORS.dark,
  fontSize: "17px",
};

const filterGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
  gap: "10px",
};

const labelStyle: React.CSSProperties = {
  display: "grid",
  gap: "5px",
  color: COLORS.dark,
  fontWeight: 800,
  fontSize: "12px",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  border: `1px solid ${COLORS.border}`,
  borderRadius: "11px",
  padding: "11px 12px",
  outline: "none",
  fontSize: "13px",
  background: "#fff",
  color: COLORS.dark,
};

const primaryButtonStyle: React.CSSProperties = {
  border: "none",
  background: COLORS.gold,
  color: COLORS.dark,
  borderRadius: "11px",
  padding: "11px 14px",
  fontWeight: 900,
  fontSize: "13px",
};

const secondaryButtonStyle: React.CSSProperties = {
  border: `1px solid ${COLORS.border}`,
  background: "#fff",
  color: COLORS.dark,
  borderRadius: "11px",
  padding: "11px 14px",
  fontWeight: 900,
  fontSize: "13px",
  cursor: "pointer",
};

const statsGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
  gap: "10px",
};

const statCardStyle: React.CSSProperties = {
  background: COLORS.card,
  border: `1px solid ${COLORS.border}`,
  borderRadius: "14px",
  padding: "12px",
  display: "flex",
  alignItems: "center",
  gap: "10px",
  boxShadow: "0 6px 16px rgba(0,0,0,0.04)",
};

const sectionTopStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: "12px",
  alignItems: "flex-start",
  flexWrap: "wrap",
};

const smallTextStyle: React.CSSProperties = {
  margin: "-3px 0 8px",
  color: COLORS.muted,
  fontSize: "12px",
};

const tableWrapStyle: React.CSSProperties = {
  width: "100%",
  overflowX: "auto",
};

const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  minWidth: "880px",
};

const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "10px",
  borderBottom: `1px solid ${COLORS.border}`,
  color: COLORS.muted,
  fontSize: "12px",
  background: "#fafafa",
};

const tdStyle: React.CSSProperties = {
  padding: "10px",
  borderBottom: `1px solid ${COLORS.border}`,
  fontSize: "13px",
  verticalAlign: "top",
};

const tinyMutedStyle: React.CSSProperties = {
  color: COLORS.muted,
  fontSize: "11px",
  marginTop: "2px",
};
