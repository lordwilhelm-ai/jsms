"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type TeacherRow = Record<string, any>;
type StudentRow = Record<string, any>;
type ClassRow = Record<string, any>;
type EntryRow = Record<string, any>;
type ReceivedRow = Record<string, any>;
type SettingsRow = Record<string, any>;
type ClosureRow = Record<string, any>;

const COLORS = {
  background:
    "linear-gradient(135deg, #fffdf2 0%, #fff9db 25%, #fef3c7 55%, #fde68a 100%)",
  primary: "#f59e0b",
  secondary: "#111827",
  white: "#ffffff",
  text: "#111827",
  muted: "#6b7280",
  success: "#166534",
  successBg: "#dcfce7",
  danger: "#991b1b",
  dangerBg: "#fee2e2",
};

function getRole(row: TeacherRow | null) {
  const raw = String(row?.role || "").trim().toLowerCase();
  if (raw === "owner" || raw === "admin" || raw === "headmaster") return raw;
  return "teacher";
}

function getTeacherName(row: TeacherRow) {
  return String(
    row.full_name || row.name || row.teacher_name || row.username || "Teacher"
  ).trim();
}

function getClassName(row: Record<string, any>) {
  return String(row.class_name || row.className || "").trim();
}

function getStudentName(row: StudentRow) {
  const fullName = String(row.full_name || "").trim();
  if (fullName) return fullName;

  const first = String(row.first_name || "").trim();
  const other = String(row.other_name || "").trim();
  const last = String(row.last_name || "").trim();

  return `${first} ${other} ${last}`.replace(/\s+/g, " ").trim();
}

function getStudentIdValue(row: StudentRow) {
  return String(row.student_id || row.studentId || row.id || "").trim();
}

function getAssignedClasses(row: TeacherRow): string[] {
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

  return [];
}

function isTeacherActive(row: TeacherRow) {
  if (typeof row.active === "boolean") return row.active;
  if (typeof row.is_active === "boolean") return row.is_active;
  if (typeof row.status === "string") {
    return row.status.trim().toLowerCase() === "active";
  }
  return true;
}

function isWeekend(dateString: string) {
  const day = new Date(`${dateString}T12:00:00`).getDay();
  return day === 0 || day === 6;
}

function dateRange(start: string, end: string) {
  const rows: string[] = [];
  const current = new Date(`${start}T12:00:00`);
  const endDate = new Date(`${end}T12:00:00`);

  while (current <= endDate) {
    rows.push(current.toISOString().split("T")[0]);
    current.setDate(current.getDate() + 1);
  }

  return rows;
}

function isHoliday(date: string, closures: ClosureRow[]) {
  return closures.some((row) => {
    if (!Boolean(row.active ?? true)) return false;
    const start = String(row.start_date || row.startDate || "");
    const end = String(row.end_date || row.endDate || "");
    if (!start || !end) return false;
    return date >= start && date <= end;
  });
}

export default function FeedingAdminPage() {
  const router = useRouter();

  const [checkingUser, setCheckingUser] = useState(true);
  const [currentUser, setCurrentUser] = useState<TeacherRow | null>(null);

  const [loading, setLoading] = useState(true);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [teachers, setTeachers] = useState<TeacherRow[]>([]);
  const [todayEntries, setTodayEntries] = useState<EntryRow[]>([]);
  const [receivedRecords, setReceivedRecords] = useState<ReceivedRow[]>([]);
  const [settingsRow, setSettingsRow] = useState<SettingsRow | null>(null);
  const [closures, setClosures] = useState<ClosureRow[]>([]);

  const [receivingClass, setReceivingClass] = useState("");
  const [syncingAttendance, setSyncingAttendance] = useState(false);

  const now = new Date();
  const today = now.toISOString().split("T")[0];
  const dayName = now.toLocaleDateString(undefined, { weekday: "long" });
  const prettyDate = now.toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  useEffect(() => {
    let active = true;

    async function checkUser() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!active) return;

      if (!session?.user) {
        router.replace("/");
        return;
      }

      const { data: teacherRows, error } = await supabase.from("teachers").select("*");

      if (!active) return;

      if (error || !teacherRows || teacherRows.length === 0) {
        router.replace("/");
        return;
      }

      const row =
        teacherRows.find((item) => item.auth_user_id === session.user.id) ||
        teacherRows.find(
          (item) =>
            String(item.email || "").trim().toLowerCase() ===
            String(session.user.email || "").trim().toLowerCase()
        ) ||
        null;

      if (!row) {
        router.replace("/");
        return;
      }

      const role = getRole(row);

      if (role === "teacher") {
        router.replace("/feeding/teacher");
        return;
      }

      setCurrentUser(row);
      setCheckingUser(false);
    }

    void checkUser();

    return () => {
      active = false;
    };
  }, [router]);

  useEffect(() => {
    if (!checkingUser) {
      void loadDashboardData();
    }
  }, [checkingUser, today]);

  async function loadDashboardData() {
    try {
      setLoading(true);

      const [
        classesRes,
        studentsRes,
        teachersRes,
        entriesRes,
        receivedRes,
        settingsRes,
        closuresRes,
      ] = await Promise.all([
        supabase.from("classes").select("*").order("class_order", { ascending: true }),
        supabase.from("students").select("*"),
        supabase.from("teachers").select("*"),
        supabase.from("daily_entries").select("*").eq("date", today),
        supabase.from("received_money").select("*").eq("date", today),
        supabase.from("school_settings").select("*").limit(1).maybeSingle(),
        supabase.from("school_closures").select("*").order("start_date", { ascending: true }),
      ]);

      setClasses(classesRes.data || []);
      setStudents(studentsRes.data || []);
      setTeachers(teachersRes.data || []);
      setTodayEntries(entriesRes.data || []);
      setReceivedRecords(receivedRes.data || []);
      setSettingsRow(settingsRes.data || null);
      setClosures(closuresRes.data || []);
    } catch (error) {
      console.error(error);
      alert("Failed to load feeding admin data.");
    } finally {
      setLoading(false);
    }
  }

  async function markClassAsReceived(
    className: string,
    amountReceived: number,
    teacherNames: string
  ) {
    try {
      setReceivingClass(className);

      const alreadyReceived = receivedRecords.some(
        (item) => getClassName(item) === className && String(item.date || "") === today
      );

      if (alreadyReceived) {
        alert("This class has already been marked as received today.");
        return;
      }

      const { error } = await supabase.from("received_money").insert([
        {
          date: today,
          class_name: className,
          amount_received: amountReceived,
          teacher_names: teacherNames,
          received_by: getTeacherName(currentUser || {}),
        },
      ]);

      if (error) throw error;

      await loadDashboardData();
      alert(`${className} money marked as received.`);
    } catch (error) {
      console.error(error);
      alert("Failed to mark money as received.");
    } finally {
      setReceivingClass("");
    }
  }

  async function handleSyncTermAttendance() {
    const termBegins = String(settingsRow?.term_begins || "");
    const termEnds = String(settingsRow?.term_ends || "");
    const academicYear = String(settingsRow?.academic_year || "");
    const currentTerm = String(settingsRow?.current_term || "");

    if (!termBegins || !termEnds || !academicYear || !currentTerm) {
      alert("Set academic year, current term, term begins, and term ends in JSMS settings first.");
      return;
    }

    try {
      setSyncingAttendance(true);

      const allDates = dateRange(termBegins, termEnds);
      const schoolDays = allDates.filter(
        (date) => !isWeekend(date) && !isHoliday(date, closures)
      );

      const { data: termEntries, error: entriesError } = await supabase
        .from("daily_entries")
        .select("*")
        .gte("date", termBegins)
        .lte("date", termEnds);

      if (entriesError) throw entriesError;

      const payload = students.map((student) => {
        const studentId = getStudentIdValue(student);
        const className = getClassName(student);
        const studentName = getStudentName(student);

        const presentCount = (termEntries || []).filter(
          (entry) =>
            String(entry.student_id || entry.studentId || "") === studentId &&
            String(entry.attendance || "").toLowerCase() === "present"
        ).length;

        return {
          academic_year: academicYear,
          term: currentTerm,
          student_id: studentId,
          student_name: studentName,
          class_name: className,
          attendance_present: presentCount,
          total_school_days: schoolDays.length,
          updated_at: new Date().toISOString(),
        };
      });

      const { error: upsertError } = await supabase
        .from("report_card_attendance_summary")
        .upsert(payload, {
          onConflict: "academic_year,term,student_id",
        });

      if (upsertError) throw upsertError;

      alert("Term attendance synced successfully.");
    } catch (error) {
      console.error(error);
      alert("Failed to sync term attendance.");
    } finally {
      setSyncingAttendance(false);
    }
  }

  const schoolName = String(settingsRow?.school_name || "JEFSEM VISION SCHOOL");
  const motto = String(settingsRow?.motto || "Success in Excellence");
  const academicYear = String(settingsRow?.academic_year || "-");
  const currentTerm = String(settingsRow?.current_term || "-");
  const termBegins = String(settingsRow?.term_begins || "");
  const termEnds = String(settingsRow?.term_ends || "");
  const feedingFee = Number(settingsRow?.feeding_fee || 6);
  const minimumToEat = Number(settingsRow?.minimum_to_eat || 5);
  const systemName = "JVS Feeding";

  const totalSchoolDays = useMemo(() => {
    if (!termBegins || !termEnds) return 0;
    return dateRange(termBegins, termEnds).filter(
      (date) => !isWeekend(date) && !isHoliday(date, closures)
    ).length;
  }, [termBegins, termEnds, closures]);

  const dashboardSummary = useMemo(() => {
    const moneyToday = todayEntries.reduce(
      (sum, entry) => sum + Number(entry.amount_paid_today || entry.amountPaidToday || 0),
      0
    );

    const moneyReceived = receivedRecords.reduce(
      (sum, item) => sum + Number(item.amount_received || item.amountReceived || 0),
      0
    );

    const eatingToday = todayEntries.filter((entry) => Boolean(entry.ate_today ?? entry.ateToday))
      .length;

    const absentToday = todayEntries.filter(
      (entry) => String(entry.attendance || "").toLowerCase() === "absent"
    ).length;

    const studentsOwing = todayEntries.filter(
      (entry) => Number(entry.new_balance ?? entry.newBalance ?? 0) < 0
    ).length;

    const studentsAdvance = todayEntries.filter(
      (entry) => Number(entry.new_balance ?? entry.newBalance ?? 0) > 0
    ).length;

    const classesSubmitted = new Set(
      todayEntries.map((entry) => getClassName(entry)).filter(Boolean)
    ).size;

    return {
      moneyToday,
      moneyReceived,
      eatingToday,
      absentToday,
      studentsOwing,
      studentsAdvance,
      classesSubmitted,
    };
  }, [todayEntries, receivedRecords]);

  const activeTeachersCount = useMemo(() => {
    return teachers.filter((teacher) => isTeacherActive(teacher)).length;
  }, [teachers]);

  const classSummary = useMemo(() => {
    let classRows = classes;

    if (!classRows.length) {
      const fallbackNames = Array.from(
        new Set(
          [
            ...students.map((row) => getClassName(row)),
            ...todayEntries.map((row) => getClassName(row)),
          ].filter(Boolean)
        )
      );

      classRows = fallbackNames.map((name, index) => ({
        id: `${index}-${name}`,
        class_name: name,
        class_order: index + 1,
      }));
    }

    return classRows.map((classRow) => {
      const className = getClassName(classRow);
      const classStudents = students.filter((student) => getClassName(student) === className);
      const classEntries = todayEntries.filter((entry) => getClassName(entry) === className);
      const classTeachers = teachers.filter(
        (teacher) =>
          isTeacherActive(teacher) && getAssignedClasses(teacher).includes(className)
      );

      const money = classEntries.reduce(
        (sum, entry) => sum + Number(entry.amount_paid_today || entry.amountPaidToday || 0),
        0
      );

      const received = receivedRecords.find((item) => getClassName(item) === className);

      return {
        className,
        totalStudents: classStudents.length,
        present: classEntries.filter(
          (entry) => String(entry.attendance || "").toLowerCase() === "present"
        ).length,
        absent: classEntries.filter(
          (entry) => String(entry.attendance || "").toLowerCase() === "absent"
        ).length,
        eating: classEntries.filter((entry) => Boolean(entry.ate_today ?? entry.ateToday)).length,
        money,
        submitted: classEntries.length > 0,
        teacherNames:
          classTeachers.length > 0
            ? classTeachers.map((teacher) => getTeacherName(teacher)).join(", ")
            : "Not Assigned",
        received: Boolean(received),
      };
    });
  }, [classes, students, todayEntries, teachers, receivedRecords]);

  const eatingRows = useMemo(() => {
    return todayEntries.filter((entry) => Boolean(entry.ate_today ?? entry.ateToday));
  }, [todayEntries]);

  const absentRows = useMemo(() => {
    return todayEntries.filter(
      (entry) => String(entry.attendance || "").toLowerCase() === "absent"
    );
  }, [todayEntries]);

  const owingRows = useMemo(() => {
    return todayEntries.filter(
      (entry) => Number(entry.new_balance ?? entry.newBalance ?? 0) < 0
    );
  }, [todayEntries]);

  const advanceRows = useMemo(() => {
    return todayEntries
      .filter((entry) => Number(entry.new_balance ?? entry.newBalance ?? 0) > 0)
      .map((entry) => ({
        ...entry,
        daysLeft: Math.floor(
          Number(entry.new_balance ?? entry.newBalance ?? 0) / (feedingFee || 6)
        ),
      })) as (EntryRow & { daysLeft: number })[];
  }, [todayEntries, feedingFee]);

  const summaryCards = [
    {
      title: "Money Today",
      value: `GHS ${dashboardSummary.moneyToday}`,
      note: "Daily entry totals",
    },
    {
      title: "Money Received",
      value: `GHS ${dashboardSummary.moneyReceived}`,
      note: "Collected by admin",
    },
    {
      title: "Eating Today",
      value: dashboardSummary.eatingToday,
      note: "Students eating",
    },
    {
      title: "Absent Today",
      value: dashboardSummary.absentToday,
      note: "Absent count",
    },
    {
      title: "Students Owing",
      value: dashboardSummary.studentsOwing,
      note: "Balances below zero",
    },
    {
      title: "Students Advance",
      value: dashboardSummary.studentsAdvance,
      note: "Positive balances",
    },
    {
      title: "Total Students",
      value: students.length,
      note: "All student records",
    },
    {
      title: "Active Teachers",
      value: activeTeachersCount,
      note: "Teachers in system",
    },
    {
      title: "Active Classes",
      value: classSummary.length,
      note: "Feeding class summary",
    },
    {
      title: "School Days This Term",
      value: totalSchoolDays,
      note: `${currentTerm} attendance base`,
    },
  ];

  if (checkingUser) {
    return <PageLoader text="Checking access..." />;
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
          }}
        >
          <div>
            <h1 style={{ margin: 0 }}>{systemName}</h1>
            <p style={{ margin: "6px 0 0", fontWeight: "bold" }}>{schoolName}</p>
            <p style={{ margin: "4px 0 0", opacity: 0.9 }}>{motto}</p>
            <p style={{ margin: "8px 0 0", fontSize: "14px" }}>
              <strong>{dayName}</strong>, {prettyDate}
            </p>
            <p style={{ margin: "6px 0 0", fontSize: "14px" }}>
              <strong>{academicYear}</strong> • <strong>{currentTerm}</strong>
            </p>
            <p style={{ margin: "4px 0 0", fontSize: "13px", opacity: 0.9 }}>
              {termBegins || "-"} to {termEnds || "-"}
            </p>
          </div>

          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <Link href="/dashboard/admin" style={topButtonStyle()}>
              JSMS Dashboard
            </Link>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: "1400px", margin: "0 auto", padding: "24px" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: "16px",
            marginBottom: "24px",
          }}
        >
          {summaryCards.map((card) => (
            <div
              key={card.title}
              style={{
                background: COLORS.white,
                borderRadius: "16px",
                padding: "18px",
                boxShadow: "0 8px 22px rgba(0,0,0,0.06)",
                borderTop: `6px solid ${COLORS.primary}`,
              }}
            >
              <p style={{ margin: 0, fontSize: "14px", color: COLORS.muted }}>{card.title}</p>
              <h2
                style={{
                  margin: "8px 0 6px",
                  color: COLORS.secondary,
                  fontSize: "28px",
                }}
              >
                {card.value}
              </h2>
              <p style={{ margin: 0, fontSize: "13px", color: "#777" }}>{card.note}</p>
            </div>
          ))}
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "280px 1fr",
            gap: "20px",
            alignItems: "start",
            marginBottom: "24px",
          }}
        >
          <div
            style={{
              background: COLORS.white,
              borderRadius: "16px",
              padding: "18px",
              boxShadow: "0 8px 22px rgba(0,0,0,0.06)",
            }}
          >
            <h3 style={{ marginTop: 0, color: COLORS.secondary }}>Quick Actions</h3>

            <div style={{ display: "grid", gap: "10px" }}>
              <Link href="/feeding/admin/reports" style={quickLinkStyle}>
                Reports
              </Link>
              <Link href="/feeding/admin/fill-class" style={quickLinkStyle}>
                Fill for Class
              </Link>
              <Link href="/feeding/admin/student-ledger" style={quickLinkStyle}>
                Student Ledger
              </Link>
              <Link href="/feeding/admin/debtors" style={quickLinkStyle}>
                Debtors
              </Link>
              <Link href="/feeding/admin/holidays" style={quickLinkStyle}>
                Holidays
              </Link>
              <Link href="/feeding/admin/control" style={quickLinkStyle}>
                Feeding Control
              </Link>
            </div>

            <div
              style={{
                marginTop: "18px",
                background: "#f9fafb",
                border: "1px solid #e5e7eb",
                borderRadius: "14px",
                padding: "14px",
              }}
            >
              <p style={{ margin: "0 0 6px", fontWeight: 800, color: COLORS.secondary }}>
                Feeding Setup
              </p>
              <p style={{ margin: "0 0 4px", fontSize: "13px" }}>
                Fee: <strong>GHS {feedingFee}</strong>
              </p>
              <p style={{ margin: "0", fontSize: "13px" }}>
                Minimum To Eat: <strong>GHS {minimumToEat}</strong>
              </p>
            </div>

            <div
              style={{
                marginTop: "18px",
                background: "#f9fafb",
                border: "1px solid #e5e7eb",
                borderRadius: "14px",
                padding: "14px",
              }}
            >
              <p style={{ margin: "0 0 8px", fontWeight: 800, color: COLORS.secondary }}>
                Report Card Attendance
              </p>
              <p style={{ margin: "0 0 6px", fontSize: "13px" }}>
                Term: <strong>{currentTerm}</strong>
              </p>
              <p style={{ margin: "0 0 6px", fontSize: "13px" }}>
                School Days: <strong>{totalSchoolDays}</strong>
              </p>
              <button
                onClick={handleSyncTermAttendance}
                disabled={syncingAttendance}
                style={{
                  ...receiveButtonStyle,
                  width: "100%",
                  marginTop: "8px",
                }}
              >
                {syncingAttendance ? "Syncing..." : "Sync Attendance To Report Card"}
              </button>
            </div>
          </div>

          <div
            style={{
              background: COLORS.white,
              borderRadius: "16px",
              padding: "18px",
              boxShadow: "0 8px 22px rgba(0,0,0,0.06)",
              overflowX: "auto",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: "12px",
                marginBottom: "12px",
                flexWrap: "wrap",
              }}
            >
              <h3 style={{ margin: 0, color: COLORS.secondary }}>
                Today&apos;s Class Feeding Summary
              </h3>
            </div>

            {loading ? (
              <p>Loading today&apos;s class summary...</p>
            ) : (
              <table style={tableStyle}>
                <thead>
                  <tr style={{ background: "#fff7cc" }}>
                    <th style={thStyle}>Class</th>
                    <th style={thStyle}>Teacher(s)</th>
                    <th style={thStyle}>Students</th>
                    <th style={thStyle}>Present</th>
                    <th style={thStyle}>Absent</th>
                    <th style={thStyle}>Eating</th>
                    <th style={thStyle}>Money</th>
                    <th style={thStyle}>Submitted</th>
                    <th style={thStyle}>Received</th>
                    <th style={thStyle}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {classSummary.map((row) => (
                    <tr key={row.className}>
                      <td style={tdStyle}>{row.className}</td>
                      <td style={tdStyle}>{row.teacherNames}</td>
                      <td style={tdStyle}>{row.totalStudents}</td>
                      <td style={tdStyle}>{row.present}</td>
                      <td style={tdStyle}>{row.absent}</td>
                      <td style={tdStyle}>{row.eating}</td>
                      <td style={tdStyle}>GHS {row.money}</td>
                      <td style={tdStyle}>
                        <StatusPill ok={row.submitted} okText="Yes" badText="No" />
                      </td>
                      <td style={tdStyle}>
                        <StatusPill ok={row.received} okText="Yes" badText="No" />
                      </td>
                      <td style={tdStyle}>
                        {row.submitted ? (
                          row.received ? (
                            <span style={{ color: COLORS.success, fontWeight: "bold" }}>
                              Received
                            </span>
                          ) : (
                            <button
                              onClick={() =>
                                markClassAsReceived(row.className, row.money, row.teacherNames)
                              }
                              disabled={receivingClass === row.className}
                              style={receiveButtonStyle}
                            >
                              {receivingClass === row.className
                                ? "Saving..."
                                : "Mark as Received"}
                            </button>
                          )
                        ) : (
                          <span style={{ color: "#777" }}>No Entry Yet</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div
          style={{
            background: COLORS.white,
            borderRadius: "16px",
            padding: "18px",
            boxShadow: "0 8px 22px rgba(0,0,0,0.06)",
            overflowX: "auto",
            marginBottom: "24px",
          }}
        >
          <h3 style={{ marginTop: 0, color: COLORS.secondary }}>Received Today</h3>

          {loading ? (
            <p>Loading received records...</p>
          ) : receivedRecords.length === 0 ? (
            <p style={{ color: "#666", marginBottom: 0 }}>
              No class money has been marked as received today.
            </p>
          ) : (
            <table style={tableStyle}>
              <thead>
                <tr style={{ background: "#fff7cc" }}>
                  <th style={thStyle}>Class</th>
                  <th style={thStyle}>Teacher(s)</th>
                  <th style={thStyle}>Amount Received</th>
                  <th style={thStyle}>Date</th>
                </tr>
              </thead>
              <tbody>
                {receivedRecords.map((row, index) => (
                  <tr key={row.id || index}>
                    <td style={tdStyle}>{getClassName(row)}</td>
                    <td style={tdStyle}>{String(row.teacher_names || row.teacherNames || "-")}</td>
                    <td style={tdStyle}>
                      GHS {Number(row.amount_received || row.amountReceived || 0)}
                    </td>
                    <td style={tdStyle}>{String(row.date || "-")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
            gap: "20px",
            marginBottom: "24px",
          }}
        >
          <DashboardSection
            title="Students Eating Today"
            loading={loading}
            emptyText="No students marked to eat today."
            headers={["Student", "ID", "Class", "Teacher", "Paid", "Balance"]}
            rows={eatingRows.slice(0, 8).map((row: any) => [
              String(row.student_name || row.studentName || "-"),
              String(row.student_id || row.studentId || "-"),
              getClassName(row),
              String(row.assigned_teacher_name || row.assignedTeacherName || "-"),
              `GHS ${Number(row.amount_paid_today || row.amountPaidToday || 0)}`,
              `GHS ${Number(row.new_balance || row.newBalance || 0)}`,
            ])}
          />

          <DashboardSection
            title="Absent Today"
            loading={loading}
            emptyText="No absent records today."
            headers={["Student", "ID", "Class", "Teacher"]}
            rows={absentRows.slice(0, 8).map((row: any) => [
              String(row.student_name || row.studentName || "-"),
              String(row.student_id || row.studentId || "-"),
              getClassName(row),
              String(row.assigned_teacher_name || row.assignedTeacherName || "-"),
            ])}
          />
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
            gap: "20px",
            marginBottom: "24px",
          }}
        >
          <DashboardSection
            title="Students Owing"
            loading={loading}
            emptyText="No students owing today."
            headers={["Student", "ID", "Class", "Teacher", "Debt"]}
            rows={owingRows.slice(0, 8).map((row: any) => [
              String(row.student_name || row.studentName || "-"),
              String(row.student_id || row.studentId || "-"),
              getClassName(row),
              String(row.assigned_teacher_name || row.assignedTeacherName || "-"),
              `GHS ${Math.abs(Number(row.new_balance || row.newBalance || 0))}`,
            ])}
          />

          <DashboardSection
            title="Students With Advance"
            loading={loading}
            emptyText="No advance balances today."
            headers={["Student", "ID", "Class", "Teacher", "Advance", "Days Left"]}
            rows={advanceRows.slice(0, 8).map((row: any) => [
              String(row.student_name || row.studentName || "-"),
              String(row.student_id || row.studentId || "-"),
              getClassName(row),
              String(row.assigned_teacher_name || row.assignedTeacherName || "-"),
              `GHS ${Number(row.new_balance || row.newBalance || 0)}`,
              Number(row.daysLeft || 0),
            ])}
          />
        </div>

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

function PageLoader({ text }: { text: string }) {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: COLORS.background,
        fontFamily: "Arial, sans-serif",
        color: COLORS.text,
      }}
    >
      {text}
    </main>
  );
}

function StatusPill({
  ok,
  okText,
  badText,
}: {
  ok: boolean;
  okText: string;
  badText: string;
}) {
  return (
    <span
      style={{
        padding: "6px 10px",
        borderRadius: "999px",
        background: ok ? COLORS.successBg : COLORS.dangerBg,
        color: ok ? COLORS.success : COLORS.danger,
        fontSize: "12px",
        fontWeight: "bold",
      }}
    >
      {ok ? okText : badText}
    </span>
  );
}

function DashboardSection({
  title,
  loading,
  emptyText,
  headers,
  rows,
}: {
  title: string;
  loading: boolean;
  emptyText: string;
  headers: string[];
  rows: (string | number)[][];
}) {
  return (
    <div
      style={{
        background: COLORS.white,
        borderRadius: "16px",
        padding: "18px",
        boxShadow: "0 8px 22px rgba(0,0,0,0.06)",
        overflowX: "auto",
      }}
    >
      <h3 style={{ marginTop: 0, color: COLORS.secondary }}>{title}</h3>

      {loading ? (
        <p>Loading...</p>
      ) : rows.length === 0 ? (
        <p style={{ color: "#666", marginBottom: 0 }}>{emptyText}</p>
      ) : (
        <table style={tableStyle}>
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
      )}
    </div>
  );
}

function topButtonStyle(): React.CSSProperties {
  return {
    border: "none",
    borderRadius: "8px",
    padding: "10px 12px",
    background: "#1f2937",
    color: COLORS.white,
    textDecoration: "none",
    cursor: "pointer",
    fontWeight: "bold",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
  };
}

const quickLinkStyle: React.CSSProperties = {
  textDecoration: "none",
  background: COLORS.primary,
  color: COLORS.secondary,
  padding: "12px 14px",
  borderRadius: "10px",
  fontWeight: "bold",
};

const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: "14px",
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

const receiveButtonStyle: React.CSSProperties = {
  background: COLORS.primary,
  color: COLORS.secondary,
  border: "none",
  borderRadius: "10px",
  padding: "10px 12px",
  fontWeight: "bold",
  cursor: "pointer",
  whiteSpace: "nowrap",
};
