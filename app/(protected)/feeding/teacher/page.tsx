"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Attendance = "present" | "absent";
type BalanceMap = Record<string, number>;
type TeacherRow = Record<string, any>;
type StudentRow = Record<string, any>;
type ClosureRow = Record<string, any>;
type SettingsRow = Record<string, any>;

const COLORS = {
  background:
    "linear-gradient(135deg, #fffdf2 0%, #fff9db 25%, #fef3c7 55%, #fde68a 100%)",
  primary: "#f59e0b",
  secondary: "#111827",
  white: "#ffffff",
  text: "#111827",
  muted: "#6b7280",
  success: "#166534",
  danger: "#991b1b",
};

function getRole(row: TeacherRow | null) {
  const raw = String(row?.role || "").trim().toLowerCase();
  if (raw === "owner" || raw === "admin" || raw === "headmaster") return raw;
  return "teacher";
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

function getClassName(row: Record<string, any>) {
  return String(row.class_name || row.className || "").trim();
}

function isWeekend(dateString: string) {
  const day = new Date(`${dateString}T12:00:00`).getDay();
  return day === 0 || day === 6;
}

function isDateWithinRange(dateString: string, startDate: string, endDate: string) {
  return dateString >= startDate && dateString <= endDate;
}

function calculateFeeding(args: {
  previousBalance: number;
  amountPaidToday: number;
  attendance: Attendance;
  feedingFee: number;
  minimumToEat: number;
}) {
  const previousBalance = Number(args.previousBalance || 0);
  const amountPaidToday = Number(args.amountPaidToday || 0);
  const feedingFee = Number(args.feedingFee || 6);
  const minimumToEat = Number(args.minimumToEat || 5);

  const availableBeforeMeal = previousBalance + amountPaidToday;

  if (args.attendance === "absent") {
    return {
      availableBeforeMeal,
      ateToday: false,
      newBalance: availableBeforeMeal,
    };
  }

  const ateToday = availableBeforeMeal >= minimumToEat;
  const newBalance = ateToday ? availableBeforeMeal - feedingFee : availableBeforeMeal;

  return {
    availableBeforeMeal,
    ateToday,
    newBalance,
  };
}

export default function FeedingTeacherPage() {
  const router = useRouter();

  const [checkingUser, setCheckingUser] = useState(true);
  const [teacher, setTeacher] = useState<TeacherRow | null>(null);

  const [selectedClass, setSelectedClass] = useState("");
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [loadingStudents, setLoadingStudents] = useState(false);

  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [attendance, setAttendance] = useState<Record<string, Attendance>>({});
  const [balances, setBalances] = useState<BalanceMap>({});
  const [loadingBalances, setLoadingBalances] = useState(false);

  const [submitting, setSubmitting] = useState(false);

  const [checkingCalendar, setCheckingCalendar] = useState(true);
  const [entryBlocked, setEntryBlocked] = useState(false);
  const [blockedReason, setBlockedReason] = useState("");

  const [settingsRow, setSettingsRow] = useState<SettingsRow | null>(null);

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

      const [teachersRes, settingsRes] = await Promise.all([
        supabase.from("teachers").select("*"),
        supabase.from("school_settings").select("*").limit(1).maybeSingle(),
      ]);

      if (!active) return;

      if (teachersRes.error || !teachersRes.data || teachersRes.data.length === 0) {
        router.replace("/");
        return;
      }

      const row =
        teachersRes.data.find((item) => item.auth_user_id === session.user.id) ||
        teachersRes.data.find(
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

      if (role === "owner" || role === "admin" || role === "headmaster") {
        router.replace("/feeding/admin");
        return;
      }

      const classes = getAssignedClasses(row);
      setTeacher(row);
      setSelectedClass(classes[0] || "");
      setSettingsRow(settingsRes.data || null);
      setCheckingUser(false);
    }

    void checkUser();

    return () => {
      active = false;
    };
  }, [router]);

  useEffect(() => {
    async function checkCalendarStatus() {
      try {
        setCheckingCalendar(true);

        if (isWeekend(today)) {
          setEntryBlocked(true);
          setBlockedReason("School is closed today because it is a weekend.");
          return;
        }

        const { data, error } = await supabase
          .from("school_closures")
          .select("*")
          .eq("active", true);

        if (error) throw error;

        const matched = (data || []).find((row: ClosureRow) => {
          const start = String(row.start_date || row.startDate || "");
          const end = String(row.end_date || row.endDate || "");
          if (!start || !end) return false;
          return isDateWithinRange(today, start, end);
        });

        if (matched) {
          const name = String(matched.name || "Holiday");
          setEntryBlocked(true);
          setBlockedReason(`School is closed today due to ${name}.`);
          return;
        }

        setEntryBlocked(false);
        setBlockedReason("");
      } catch (error) {
        console.error(error);
        setEntryBlocked(false);
        setBlockedReason("");
      } finally {
        setCheckingCalendar(false);
      }
    }

    if (!checkingUser) {
      void checkCalendarStatus();
    }
  }, [checkingUser, today]);

  useEffect(() => {
    if (!selectedClass || entryBlocked) {
      setStudents([]);
      setBalances({});
      return;
    }

    async function loadStudents() {
      try {
        setLoadingStudents(true);

        const { data, error } = await supabase
          .from("students")
          .select("*")
          .eq("class_name", selectedClass)
          .order("first_name", { ascending: true });

        if (error) throw error;

        const rows = (data || [])
          .filter((row) => row.active !== false)
          .sort((a, b) => getStudentName(a).localeCompare(getStudentName(b)));

        setStudents(rows);
      } catch (error) {
        console.error(error);
        alert("Failed to load students.");
      } finally {
        setLoadingStudents(false);
      }
    }

    void loadStudents();
  }, [selectedClass, entryBlocked]);

  useEffect(() => {
    if (!students.length || entryBlocked) {
      setBalances({});
      return;
    }

    async function loadBalances() {
      try {
        setLoadingBalances(true);

        const ids = students.map((student) => getStudentIdValue(student)).filter(Boolean);

        const { data, error } = await supabase
          .from("student_balances")
          .select("*")
          .in("student_id", ids);

        if (error) throw error;

        const map: BalanceMap = {};
        (data || []).forEach((row) => {
          map[String(row.student_id || "")] = Number(row.balance || 0);
        });

        setBalances(map);
      } catch (error) {
        console.error(error);
        setBalances({});
      } finally {
        setLoadingBalances(false);
      }
    }

    void loadBalances();
  }, [students, entryBlocked]);

  const feedingFee = Number(settingsRow?.feeding_fee || 6);
  const minimumToEat = Number(settingsRow?.minimum_to_eat || 5);
  const schoolName = String(settingsRow?.school_name || "JEFSEM VISION SCHOOL");
  const motto = String(settingsRow?.motto || "Success in Excellence");
  const systemName = "JVS Feeding";
  const academicYear = String(settingsRow?.academic_year || "2026/2027");

  const previewRows = students.map((student) => {
    const studentId = getStudentIdValue(student);
    const amountPaidToday = Number(amounts[studentId] || 0);
    const studentAttendance = attendance[studentId] || "present";
    const previousBalance = Number(balances[studentId] || 0);

    const result = calculateFeeding({
      previousBalance,
      amountPaidToday,
      attendance: studentAttendance,
      feedingFee,
      minimumToEat,
    });

    return {
      id: student.id,
      studentId,
      fullName: getStudentName(student),
      className: getClassName(student),
      amountPaidToday,
      attendance: studentAttendance,
      previousBalance,
      availableBeforeMeal: result.availableBeforeMeal,
      ateToday: result.ateToday,
      newBalance: result.newBalance,
    };
  });

  const summary = useMemo(() => {
    return previewRows.reduce(
      (acc, row) => {
        acc.totalCollected += row.amountPaidToday;
        if (row.attendance === "present") acc.presentCount += 1;
        if (row.attendance === "absent") acc.absentCount += 1;
        if (row.ateToday) acc.eatingCount += 1;
        return acc;
      },
      {
        totalCollected: 0,
        presentCount: 0,
        absentCount: 0,
        eatingCount: 0,
      }
    );
  }, [previewRows]);

  function handleAmountChange(studentId: string, value: string) {
    setAmounts((prev) => ({ ...prev, [studentId]: value }));
  }

  function handleAttendanceChange(studentId: string, value: Attendance) {
    setAttendance((prev) => ({ ...prev, [studentId]: value }));
  }

  async function handleSubmit() {
    if (!teacher) return;

    if (entryBlocked) {
      alert(blockedReason || "School is closed today.");
      return;
    }

    if (!selectedClass) {
      alert("Select a class first.");
      return;
    }

    try {
      setSubmitting(true);

      const { data: duplicates, error: duplicateError } = await supabase
        .from("daily_entries")
        .select("id")
        .eq("date", today)
        .eq("class_name", selectedClass)
        .eq("entered_by_role", "teacher")
        .limit(1);

      if (duplicateError) throw duplicateError;

      if (duplicates && duplicates.length > 0) {
        alert("This class has already been submitted today.");
        return;
      }

      const dailyPayload = previewRows.map((row) => ({
        date: today,
        academic_year: academicYear,
        class_name: selectedClass,
        student_id: row.studentId,
        student_name: row.fullName,
        attendance: row.attendance,
        amount_paid_today: row.amountPaidToday,
        previous_balance: row.previousBalance,
        available_before_meal: row.availableBeforeMeal,
        ate_today: row.ateToday,
        admin_override_ate_without_pay: false,
        new_balance: row.newBalance,
        assigned_teacher_name: String(
          teacher.full_name || teacher.name || teacher.username || "Teacher"
        ),
        entered_by_name: String(
          teacher.full_name || teacher.name || teacher.username || "Teacher"
        ),
        entered_by_role: "teacher",
      }));

      const { error: dailyError } = await supabase.from("daily_entries").insert(dailyPayload);
      if (dailyError) throw dailyError;

      const balancesPayload = previewRows.map((row) => ({
        student_id: row.studentId,
        student_name: row.fullName,
        class_name: row.className,
        academic_year: academicYear,
        balance: row.newBalance,
      }));

      const { error: balanceError } = await supabase
        .from("student_balances")
        .upsert(balancesPayload, { onConflict: "student_id" });

      if (balanceError) throw balanceError;

      const ledgerPayload = previewRows.map((row) => ({
        date: today,
        academic_year: academicYear,
        student_id: row.studentId,
        student_name: row.fullName,
        class_name: row.className,
        amount_paid_today: row.amountPaidToday,
        previous_balance: row.previousBalance,
        attendance: row.attendance,
        ate_today: row.ateToday,
        new_balance: row.newBalance,
        assigned_teacher_name: String(
          teacher.full_name || teacher.name || teacher.username || "Teacher"
        ),
        feeding_fee: feedingFee,
        minimum_to_eat: minimumToEat,
      }));

      const { error: ledgerError } = await supabase.from("balance_ledger").insert(ledgerPayload);
      if (ledgerError) throw ledgerError;

      alert("Daily entry submitted successfully.");
      setAmounts({});
      setAttendance({});

      const refreshedBalances: BalanceMap = {};
      previewRows.forEach((row) => {
        refreshedBalances[row.studentId] = row.newBalance;
      });
      setBalances(refreshedBalances);
    } catch (error) {
      console.error(error);
      alert("Failed to save daily entry.");
    } finally {
      setSubmitting(false);
    }
  }

  if (checkingUser || checkingCalendar) {
    return <PageLoader text="Checking access..." />;
  }

  const assignedClasses = getAssignedClasses(teacher || {});
  const submitDisabled =
    submitting ||
    loadingBalances ||
    loadingStudents ||
    !selectedClass ||
    entryBlocked;

  return (
    <main
      style={{
        minHeight: "100vh",
        background: COLORS.background,
        fontFamily: "Arial, sans-serif",
        color: COLORS.text,
        paddingBottom: "140px",
      }}
    >
      <div
        style={{
          background: COLORS.primary,
          color: COLORS.secondary,
          padding: "18px 16px",
          boxShadow: "0 2px 10px rgba(0,0,0,0.08)",
        }}
      >
        <div
          style={{
            maxWidth: "720px",
            margin: "0 auto",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "start",
            gap: "12px",
          }}
        >
          <div>
            <h1 style={{ margin: 0, fontSize: "20px" }}>{systemName}</h1>
            <p style={{ margin: "6px 0 0", fontWeight: "bold" }}>{schoolName}</p>
            <p style={{ margin: "2px 0 0", fontSize: "13px" }}>{motto}</p>
            <p style={{ margin: "8px 0 0", fontSize: "14px" }}>
              <strong>{dayName}</strong>, {prettyDate}
            </p>
          </div>
        </div>
      </div>

      <div style={{ padding: "16px", maxWidth: "720px", margin: "0 auto" }}>
        {entryBlocked && (
          <div
            style={{
              background: "#fee2e2",
              color: "#991b1b",
              borderRadius: "16px",
              padding: "16px",
              marginBottom: "16px",
              boxShadow: "0 6px 18px rgba(0,0,0,0.06)",
              fontWeight: "bold",
            }}
          >
            {blockedReason}
          </div>
        )}

        <div
          style={{
            background: COLORS.white,
            borderRadius: "16px",
            padding: "16px",
            marginBottom: "16px",
            boxShadow: "0 6px 18px rgba(0,0,0,0.06)",
          }}
        >
          <label style={{ display: "block", marginBottom: "8px", fontWeight: "bold" }}>
            Select Class
          </label>

          <select
            value={selectedClass}
            onChange={(e) => setSelectedClass(e.target.value)}
            style={selectStyle}
            disabled={entryBlocked}
          >
            {assignedClasses.length === 0 ? (
              <option value="">No class assigned</option>
            ) : (
              assignedClasses.map((className) => (
                <option key={className} value={className}>
                  {className}
                </option>
              ))
            )}
          </select>
        </div>

        {!loadingStudents && students.length === 0 && !entryBlocked && (
          <div
            style={{
              background: COLORS.white,
              borderRadius: "16px",
              padding: "16px",
              marginBottom: "16px",
              boxShadow: "0 6px 18px rgba(0,0,0,0.06)",
              color: "#666",
            }}
          >
            No students found in {selectedClass}.
          </div>
        )}

        {!entryBlocked &&
          previewRows.map((student) => (
            <div
              key={student.studentId}
              style={{
                background: COLORS.white,
                borderRadius: "16px",
                padding: "16px",
                marginBottom: "14px",
                boxShadow: "0 6px 18px rgba(0,0,0,0.06)",
                borderLeft: `6px solid ${student.ateToday ? COLORS.success : COLORS.danger}`,
              }}
            >
              <div style={{ marginBottom: "12px" }}>
                <div style={{ fontWeight: "bold", fontSize: "17px" }}>{student.fullName}</div>
                <div style={{ fontSize: "13px", color: "#555" }}>{student.studentId}</div>
              </div>

              <div style={{ display: "grid", gap: "10px" }}>
                <div>
                  <label style={fieldLabelStyle}>Attendance</label>
                  <select
                    value={student.attendance}
                    onChange={(e) =>
                      handleAttendanceChange(student.studentId, e.target.value as Attendance)
                    }
                    style={selectStyle}
                  >
                    <option value="present">Present</option>
                    <option value="absent">Absent</option>
                  </select>
                </div>

                <div>
                  <label style={fieldLabelStyle}>Amount Paid Today</label>
                  <input
                    type="number"
                    min="0"
                    value={amounts[student.studentId] || ""}
                    onChange={(e) => handleAmountChange(student.studentId, e.target.value)}
                    disabled={student.attendance === "absent"}
                    placeholder="Enter amount"
                    style={{
                      ...inputStyle,
                      background: student.attendance === "absent" ? "#f3f4f6" : COLORS.white,
                    }}
                  />
                </div>

                <div
                  style={{
                    background: "#fafafa",
                    borderRadius: "12px",
                    padding: "12px",
                    fontSize: "14px",
                  }}
                >
                  <p style={{ margin: "4px 0" }}>
                    <strong>Previous Balance:</strong> GHS {student.previousBalance}
                  </p>
                  <p style={{ margin: "4px 0" }}>
                    <strong>Available Before Meal:</strong> GHS {student.availableBeforeMeal}
                  </p>
                  <p style={{ margin: "4px 0" }}>
                    <strong>Will Eat:</strong>{" "}
                    <span
                      style={{
                        color: student.ateToday ? COLORS.success : COLORS.danger,
                        fontWeight: "bold",
                      }}
                    >
                      {student.ateToday ? "Yes" : "No"}
                    </span>
                  </p>
                  <p style={{ margin: "4px 0" }}>
                    <strong>New Balance:</strong> GHS {student.newBalance}
                  </p>
                </div>
              </div>
            </div>
          ))}
      </div>

      <div
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          background: COLORS.secondary,
          color: COLORS.white,
          padding: "14px 16px",
          boxShadow: "0 -4px 12px rgba(0,0,0,0.12)",
        }}
      >
        <div
          style={{
            maxWidth: "720px",
            margin: "0 auto",
            display: "grid",
            gap: "10px",
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, 1fr)",
              gap: "8px",
              fontSize: "14px",
            }}
          >
            <div>Total: GHS {summary.totalCollected}</div>
            <div>Eating: {summary.eatingCount}</div>
            <div>Present: {summary.presentCount}</div>
            <div>Absent: {summary.absentCount}</div>
          </div>

          <button
            onClick={handleSubmit}
            disabled={submitDisabled}
            style={{
              width: "100%",
              padding: "14px",
              borderRadius: "12px",
              border: "none",
              background: submitDisabled ? "#9ca3af" : COLORS.primary,
              color: submitDisabled ? "#ffffff" : COLORS.secondary,
              fontWeight: "bold",
              fontSize: "16px",
              cursor: submitDisabled ? "not-allowed" : "pointer",
            }}
          >
            {entryBlocked
              ? "Entry Closed Today"
              : submitting
              ? "Submitting..."
              : "Submit Daily Entry"}
          </button>

          <p style={{ margin: 0, fontSize: "12px", textAlign: "center", opacity: 0.9 }}>
            System developed by Lord Wilhelm (0593410452)
          </p>
        </div>
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

const fieldLabelStyle: React.CSSProperties = {
  display: "block",
  marginBottom: "6px",
  fontWeight: "bold",
};

const selectStyle: React.CSSProperties = {
  width: "100%",
  padding: "12px",
  borderRadius: "10px",
  border: "1px solid #ddd",
  fontSize: "16px",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "12px",
  borderRadius: "10px",
  border: "1px solid #ddd",
  fontSize: "16px",
};
