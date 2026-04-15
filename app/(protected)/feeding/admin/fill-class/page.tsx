"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

type Attendance = "present" | "absent";
type BalanceMap = Record<string, number>;
type OverrideMap = Record<string, boolean>;

type Student = Record<string, any>;
type Teacher = Record<string, any>;
type Closure = Record<string, any>;
type DailyEntry = Record<string, any>;
type LedgerRow = Record<string, any>;
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
  success: "#166534",
  danger: "#991b1b",
};

function getClassName(row: Record<string, any>) {
  return String(row.class_name || row.className || "").trim();
}

function getStudentName(row: Record<string, any>) {
  const fullName = String(row.full_name || row.fullName || "").trim();
  if (fullName) return fullName;

  const first = String(row.first_name || "").trim();
  const other = String(row.other_name || "").trim();
  const last = String(row.last_name || "").trim();

  return `${first} ${other} ${last}`.replace(/\s+/g, " ").trim();
}

function getStudentIdValue(row: Record<string, any>) {
  return String(row.student_id || row.studentId || row.id || "").trim();
}

function getTeacherName(row: Record<string, any>) {
  return String(
    row.full_name || row.name || row.teacher_name || row.username || "Not Assigned"
  ).trim();
}

function getAssignedClasses(row: Record<string, any>): string[] {
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

function isTeacherActive(row: Record<string, any>) {
  if (typeof row.active === "boolean") return row.active;
  if (typeof row.is_active === "boolean") return row.is_active;
  if (typeof row.status === "string") {
    return row.status.trim().toLowerCase() === "active";
  }
  return true;
}

function isDateWithinRange(dateString: string, startDate: string, endDate: string) {
  return dateString >= startDate && dateString <= endDate;
}

function calculateAdminFeeding(params: {
  previousBalance: number;
  amountPaidToday: number;
  attendance: Attendance;
  feedingFee: number;
  minimumToEat: number;
  ateWithoutPay: boolean;
}) {
  const {
    previousBalance,
    amountPaidToday,
    attendance,
    feedingFee,
    minimumToEat,
    ateWithoutPay,
  } = params;

  const availableBeforeMeal = Number(previousBalance) + Number(amountPaidToday);

  if (attendance === "absent") {
    return {
      availableBeforeMeal,
      ateToday: false,
      newBalance: availableBeforeMeal,
    };
  }

  const qualifiesNormally = availableBeforeMeal >= minimumToEat;
  const ateToday = ateWithoutPay || qualifiesNormally;

  const newBalance = ateToday ? availableBeforeMeal - feedingFee : availableBeforeMeal;

  return {
    availableBeforeMeal,
    ateToday,
    newBalance,
  };
}

async function rebuildStudentBalancesFromLedger() {
  const { data, error } = await supabase
    .from("balance_ledger")
    .select("*")
    .order("date", { ascending: true });

  if (error) throw error;

  const latestByStudent = new Map<string, LedgerRow>();

  (data || []).forEach((row) => {
    const studentId = getStudentIdValue(row);
    if (!studentId) return;
    latestByStudent.set(studentId, row);
  });

  const payload = Array.from(latestByStudent.values()).map((row) => ({
    student_id: getStudentIdValue(row),
    student_name: String(row.student_name || row.studentName || ""),
    class_name: getClassName(row),
    academic_year: String(row.academic_year || row.academicYear || ""),
    balance: Number(row.new_balance || row.newBalance || 0),
    updated_at: new Date().toISOString(),
  }));

  if (!payload.length) return;

  const { error: upsertError } = await supabase
    .from("student_balances")
    .upsert(payload, { onConflict: "student_id" });

  if (upsertError) throw upsertError;
}

export default function AdminFillClassPage() {
  const [selectedClass, setSelectedClass] = useState("");
  const [selectedDate, setSelectedDate] = useState(
    new Date().toISOString().split("T")[0]
  );

  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [closures, setClosures] = useState<Closure[]>([]);
  const [settingsRow, setSettingsRow] = useState<SettingsRow | null>(null);

  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [attendance, setAttendance] = useState<Record<string, Attendance>>({});
  const [ateWithoutPayMap, setAteWithoutPayMap] = useState<OverrideMap>({});
  const [balances, setBalances] = useState<BalanceMap>({});
  const [existingEntries, setExistingEntries] = useState<DailyEntry[]>([]);

  const [loadingPage, setLoadingPage] = useState(true);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [loadingTeachers, setLoadingTeachers] = useState(false);
  const [loadingBalances, setLoadingBalances] = useState(false);
  const [loadingExisting, setLoadingExisting] = useState(false);
  const [loadingClosures, setLoadingClosures] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void loadPageData();
  }, []);

  useEffect(() => {
    if (selectedClass) {
      void loadStudents();
      void loadExistingEntries();
    } else {
      setStudents([]);
      setExistingEntries([]);
    }
  }, [selectedClass, selectedDate]);

  useEffect(() => {
    if (students.length > 0) {
      void loadBalances();
    } else {
      setBalances({});
    }
  }, [students]);

  async function loadPageData() {
    try {
      setLoadingPage(true);
      setLoadingTeachers(true);
      setLoadingClosures(true);

      const [settingsRes, classesRes, teachersRes, closuresRes] = await Promise.all([
        supabase.from("school_settings").select("*").limit(1).maybeSingle(),
        supabase.from("classes").select("*").order("class_order", { ascending: true }),
        supabase.from("teachers").select("*"),
        supabase.from("school_closures").select("*").order("start_date", { ascending: true }),
      ]);

      if (classesRes.error) throw classesRes.error;
      if (teachersRes.error) throw teachersRes.error;
      if (closuresRes.error) throw closuresRes.error;

      setSettingsRow(settingsRes.data || null);
      setClasses(classesRes.data || []);
      setTeachers(teachersRes.data || []);
      setClosures(closuresRes.data || []);

      const firstClass =
        (classesRes.data || []).map((row) => getClassName(row)).find(Boolean) || "Playroom 1";
      setSelectedClass(firstClass);
    } catch (error) {
      console.error(error);
      alert("Failed to load page.");
    } finally {
      setLoadingTeachers(false);
      setLoadingClosures(false);
      setLoadingPage(false);
    }
  }

  async function loadStudents() {
    try {
      setLoadingStudents(true);

      const { data, error } = await supabase
        .from("students")
        .select("*")
        .eq("class_name", selectedClass);

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

  async function loadBalances() {
    try {
      setLoadingBalances(true);

      const ids = students.map((student) => getStudentIdValue(student)).filter(Boolean);

      if (!ids.length) {
        setBalances({});
        return;
      }

      const { data, error } = await supabase
        .from("student_balances")
        .select("*")
        .in("student_id", ids);

      if (error) throw error;

      const nextBalances: BalanceMap = {};
      (data || []).forEach((row) => {
        nextBalances[String(row.student_id || "")] = Number(row.balance || 0);
      });

      setBalances(nextBalances);
    } catch (error) {
      console.error(error);
    } finally {
      setLoadingBalances(false);
    }
  }

  async function loadExistingEntries() {
    try {
      setLoadingExisting(true);

      const { data, error } = await supabase
        .from("daily_entries")
        .select("*")
        .eq("date", selectedDate)
        .eq("class_name", selectedClass);

      if (error) throw error;

      const rows = (data || []) as DailyEntry[];
      setExistingEntries(rows);

      const nextAmounts: Record<string, string> = {};
      const nextAttendance: Record<string, Attendance> = {};
      const nextAteWithoutPay: OverrideMap = {};

      rows.forEach((row) => {
        const studentId = getStudentIdValue(row);
        nextAmounts[studentId] = String(row.amount_paid_today ?? row.amountPaidToday ?? "");
        nextAttendance[studentId] = (row.attendance || "present") as Attendance;
        nextAteWithoutPay[studentId] = Boolean(
          row.admin_override_ate_without_pay ?? row.adminOverrideAteWithoutPay
        );
      });

      setAmounts(nextAmounts);
      setAttendance(nextAttendance);
      setAteWithoutPayMap(nextAteWithoutPay);
    } catch (error) {
      console.error(error);
    } finally {
      setLoadingExisting(false);
    }
  }

  const assignedTeacher =
    teachers.find(
      (teacher) =>
        isTeacherActive(teacher) && getAssignedClasses(teacher).includes(selectedClass)
    ) || null;

  const matchedClosure = useMemo(() => {
    return closures.find((closure) => {
      if (!Boolean(closure.active ?? true)) return false;

      const startDate = String(closure.start_date || closure.startDate || "");
      const endDate = String(closure.end_date || closure.endDate || "");

      if (!startDate || !endDate) return false;

      return isDateWithinRange(selectedDate, startDate, endDate);
    });
  }, [closures, selectedDate]);

  const entryBlocked = Boolean(matchedClosure);
  const blockedReason = matchedClosure
    ? `${String(matchedClosure.name || "")} (${String(matchedClosure.type || "")})`
    : "";

  const feedingFee = Number(settingsRow?.feeding_fee || 6);
  const minimumToEat = Number(settingsRow?.minimum_to_eat || 5);
  const schoolName = String(settingsRow?.school_name || "JEFSEM VISION SCHOOL");
  const motto = String(settingsRow?.motto || "Success in Excellence");
  const academicYear = String(settingsRow?.academic_year || "2026/2027");
  const currentTerm = String(settingsRow?.current_term || "-");

  const previewRows = students.map((student) => {
    const studentId = getStudentIdValue(student);
    const amountPaidToday = Number(amounts[studentId] || 0);
    const studentAttendance = attendance[studentId] || "present";
    const previousBalance = Number(balances[studentId] || 0);
    const ateWithoutPay = Boolean(ateWithoutPayMap[studentId]);

    const result = calculateAdminFeeding({
      previousBalance,
      amountPaidToday,
      attendance: studentAttendance,
      feedingFee,
      minimumToEat,
      ateWithoutPay,
    });

    return {
      ...student,
      studentId,
      fullName: getStudentName(student),
      className: getClassName(student),
      amountPaidToday,
      attendance: studentAttendance,
      previousBalance,
      ateWithoutPay,
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
        if (row.ateWithoutPay) acc.ateWithoutPayCount += 1;
        return acc;
      },
      {
        totalCollected: 0,
        presentCount: 0,
        absentCount: 0,
        eatingCount: 0,
        ateWithoutPayCount: 0,
      }
    );
  }, [previewRows]);

  function handleAmountChange(studentId: string, value: string) {
    setAmounts((prev) => ({ ...prev, [studentId]: value }));
  }

  function handleAttendanceChange(studentId: string, value: Attendance) {
    setAttendance((prev) => ({ ...prev, [studentId]: value }));

    if (value === "absent") {
      setAteWithoutPayMap((prev) => ({
        ...prev,
        [studentId]: false,
      }));
    }
  }

  function handleAteWithoutPayChange(studentId: string, checked: boolean) {
    setAteWithoutPayMap((prev) => ({
      ...prev,
      [studentId]: checked,
    }));

    if (checked) {
      setAttendance((prev) => ({
        ...prev,
        [studentId]: "present",
      }));
    }
  }

  async function handleSave() {
    if (entryBlocked) {
      alert(`Cannot save entry. School is closed for: ${blockedReason}`);
      return;
    }

    try {
      setSaving(true);

      const { data: existingDailyRows, error: existingDailyError } = await supabase
        .from("daily_entries")
        .select("id")
        .eq("date", selectedDate)
        .eq("class_name", selectedClass);

      if (existingDailyError) throw existingDailyError;

      const { data: existingLedgerRows, error: existingLedgerError } = await supabase
        .from("balance_ledger")
        .select("id")
        .eq("date", selectedDate)
        .eq("class_name", selectedClass);

      if (existingLedgerError) throw existingLedgerError;

      if ((existingDailyRows || []).length > 0) {
        const { error: deleteDailyError } = await supabase
          .from("daily_entries")
          .delete()
          .in(
            "id",
            (existingDailyRows || []).map((row) => row.id)
          );

        if (deleteDailyError) throw deleteDailyError;
      }

      if ((existingLedgerRows || []).length > 0) {
        const { error: deleteLedgerError } = await supabase
          .from("balance_ledger")
          .delete()
          .in(
            "id",
            (existingLedgerRows || []).map((row) => row.id)
          );

        if (deleteLedgerError) throw deleteLedgerError;
      }

      const dailyPayload = previewRows.map((row) => ({
        date: selectedDate,
        academic_year: academicYear,
        class_name: selectedClass,
        student_id: row.studentId,
        student_name: row.fullName,
        attendance: row.attendance,
        amount_paid_today: row.amountPaidToday,
        previous_balance: row.previousBalance,
        available_before_meal: row.availableBeforeMeal,
        ate_today: row.ateToday,
        admin_override_ate_without_pay: row.ateWithoutPay,
        new_balance: row.newBalance,
        assigned_teacher_name: getTeacherName(assignedTeacher || {}),
        entered_by_name: "Admin",
        entered_by_role: "admin",
        created_at: new Date().toISOString(),
      }));

      const { error: dailyInsertError } = await supabase
        .from("daily_entries")
        .insert(dailyPayload);

      if (dailyInsertError) throw dailyInsertError;

      const ledgerPayload = previewRows.map((row) => ({
        date: selectedDate,
        academic_year: academicYear,
        student_id: row.studentId,
        student_name: row.fullName,
        class_name: row.className,
        amount_paid_today: row.amountPaidToday,
        previous_balance: row.previousBalance,
        attendance: row.attendance,
        ate_today: row.ateToday,
        admin_override_ate_without_pay: row.ateWithoutPay,
        new_balance: row.newBalance,
        assigned_teacher_name: getTeacherName(assignedTeacher || {}),
        edited_by: "Admin",
        feeding_fee: feedingFee,
        minimum_to_eat: minimumToEat,
        created_at: new Date().toISOString(),
      }));

      const { error: ledgerInsertError } = await supabase
        .from("balance_ledger")
        .insert(ledgerPayload);

      if (ledgerInsertError) throw ledgerInsertError;

      const { error: logError } = await supabase.from("activity_logs").insert([
        {
          user_name: "Admin",
          role: "admin",
          action: "ADMIN_EDITED_CLASS_ENTRY",
          class_name: selectedClass,
          date: selectedDate,
          details: `Admin edited/resubmitted ${selectedClass} for ${selectedDate}. Ate-without-pay count: ${summary.ateWithoutPayCount}`,
          created_at: new Date().toISOString(),
        },
      ]);

      if (logError) {
        console.error(logError);
      }

      await rebuildStudentBalancesFromLedger();
      await loadExistingEntries();
      await loadBalances();

      alert("Class entry saved and balances rebuilt successfully.");
    } catch (error) {
      console.error(error);
      alert("Failed to save admin class entry.");
    } finally {
      setSaving(false);
    }
  }

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
        paddingBottom: "120px",
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
            <h1 style={{ margin: 0 }}>Fill for Class</h1>
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

      <div style={{ maxWidth: "1100px", margin: "0 auto", padding: "24px" }}>
        <div
          style={{
            background: COLORS.white,
            borderRadius: "16px",
            padding: "18px",
            boxShadow: "0 8px 22px rgba(0,0,0,0.06)",
            marginBottom: "20px",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: "12px",
          }}
        >
          <div>
            <label style={labelStyle}>Class</label>
            <select
              value={selectedClass}
              onChange={(e) => setSelectedClass(e.target.value)}
              style={inputStyle}
            >
              {classes.map((classRow) => {
                const className = getClassName(classRow);
                return (
                  <option key={className} value={className}>
                    {className}
                  </option>
                );
              })}
            </select>
          </div>

          <div>
            <label style={labelStyle}>Date</label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              style={inputStyle}
            />
          </div>

          <div>
            <label style={labelStyle}>Teacher</label>
            <input
              type="text"
              value={
                loadingTeachers ? "Loading..." : getTeacherName(assignedTeacher || {})
              }
              readOnly
              style={{ ...inputStyle, background: "#f3f4f6" }}
            />
          </div>
        </div>

        {loadingClosures ? (
          <div style={infoCardStyle}>
            <p style={{ margin: 0 }}>Checking school closures...</p>
          </div>
        ) : entryBlocked ? (
          <div
            style={{
              ...infoCardStyle,
              background: "#fee2e2",
              color: "#991b1b",
              border: "1px solid #fecaca",
            }}
          >
            <p style={{ margin: "0 0 6px", fontWeight: "bold" }}>Entry Blocked</p>
            <p style={{ margin: 0 }}>
              School is closed on <strong>{selectedDate}</strong> because of{" "}
              <strong>{blockedReason}</strong>.
            </p>
          </div>
        ) : (
          <div
            style={{
              ...infoCardStyle,
              background: "#ecfdf5",
              color: "#065f46",
              border: "1px solid #a7f3d0",
            }}
          >
            <p style={{ margin: 0 }}>
              No holiday or vacation found for <strong>{selectedDate}</strong>.
              You can save this class entry.
            </p>
          </div>
        )}

        <div
          style={{
            background: COLORS.white,
            borderRadius: "16px",
            padding: "14px 18px",
            boxShadow: "0 8px 22px rgba(0,0,0,0.06)",
            marginBottom: "20px",
          }}
        >
          <p style={{ margin: "4px 0" }}>
            <strong>Existing Record:</strong>{" "}
            {loadingExisting ? "Checking..." : existingEntries.length > 0 ? "Found" : "None"}
          </p>
          <p style={{ margin: "4px 0" }}>
            <strong>Students:</strong> {loadingStudents ? "Loading..." : students.length}
          </p>
          <p style={{ margin: "4px 0" }}>
            <strong>Balances:</strong> {loadingBalances ? "Loading..." : "Ready"}
          </p>
          <p style={{ margin: "4px 0" }}>
            <strong>Feeding Fee:</strong> GHS {feedingFee}
          </p>
          <p style={{ margin: "4px 0" }}>
            <strong>Minimum To Eat:</strong> GHS {minimumToEat}
          </p>
          <p style={{ margin: "4px 0" }}>
            <strong>Ate Without Pay:</strong> {summary.ateWithoutPayCount}
          </p>
        </div>

        {!loadingStudents && students.length === 0 && (
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

        {previewRows.map((student) => (
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
              <div style={{ fontWeight: "bold", fontSize: "17px" }}>
                {student.fullName}
              </div>
              <div style={{ fontSize: "13px", color: "#555" }}>{student.studentId}</div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: "12px",
              }}
            >
              <div>
                <label style={labelStyle}>Attendance</label>
                <select
                  value={student.attendance}
                  onChange={(e) =>
                    handleAttendanceChange(student.studentId, e.target.value as Attendance)
                  }
                  style={inputStyle}
                >
                  <option value="present">Present</option>
                  <option value="absent">Absent</option>
                </select>
              </div>

              <div>
                <label style={labelStyle}>Amount Paid Today</label>
                <input
                  type="number"
                  min="0"
                  value={amounts[student.studentId] || ""}
                  onChange={(e) => handleAmountChange(student.studentId, e.target.value)}
                  disabled={student.attendance === "absent"}
                  style={{
                    ...inputStyle,
                    background: student.attendance === "absent" ? "#f3f4f6" : "#fff",
                  }}
                />
              </div>
            </div>

            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                padding: "12px",
                borderRadius: "10px",
                background: "#fafafa",
                border: "1px solid #eee",
                fontWeight: "bold",
                marginTop: "12px",
              }}
            >
              <input
                type="checkbox"
                checked={student.ateWithoutPay}
                disabled={student.attendance === "absent"}
                onChange={(e) =>
                  handleAteWithoutPayChange(student.studentId, e.target.checked)
                }
              />
              Ate Without Paying
            </label>

            <div
              style={{
                background: "#fafafa",
                borderRadius: "12px",
                padding: "12px",
                fontSize: "14px",
                marginTop: "12px",
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: "8px 16px",
              }}
            >
              <p style={{ margin: "4px 0" }}>
                <strong>Previous Balance:</strong> GHS {student.previousBalance}
              </p>
              <p style={{ margin: "4px 0" }}>
                <strong>Available Before Meal:</strong> GHS {student.availableBeforeMeal}
              </p>
              <p style={{ margin: "4px 0" }}>
                <strong>Ate Without Pay:</strong> {student.ateWithoutPay ? "Yes" : "No"}
              </p>
              <p style={{ margin: "4px 0" }}>
                <strong>Will Eat:</strong> {student.ateToday ? "Yes" : "No"}
              </p>
              <p style={{ margin: "4px 0" }}>
                <strong>New Balance:</strong> GHS {student.newBalance}
              </p>
            </div>
          </div>
        ))}
      </div>

      <div
        style={{
          position: "fixed",
          left: 0,
          right: 0,
          bottom: 0,
          background: COLORS.secondary,
          color: COLORS.white,
          padding: "14px 16px",
          boxShadow: "0 -4px 12px rgba(0,0,0,0.12)",
        }}
      >
        <div style={{ maxWidth: "1100px", margin: "0 auto", display: "grid", gap: "10px" }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, 1fr)",
              gap: "8px",
              fontSize: "14px",
            }}
          >
            <div>Total: GHS {summary.totalCollected}</div>
            <div>Eating: {summary.eatingCount}</div>
            <div>Present: {summary.presentCount}</div>
            <div>Ate No Pay: {summary.ateWithoutPayCount}</div>
          </div>

          <button
            onClick={handleSave}
            disabled={
              saving ||
              loadingBalances ||
              loadingExisting ||
              loadingStudents ||
              loadingClosures ||
              entryBlocked
            }
            style={{
              width: "100%",
              padding: "14px",
              borderRadius: "12px",
              border: "none",
              background: entryBlocked || loadingClosures ? "#9ca3af" : COLORS.primary,
              color: entryBlocked || loadingClosures ? "#ffffff" : COLORS.secondary,
              fontWeight: "bold",
              fontSize: "16px",
              cursor: entryBlocked || loadingClosures ? "not-allowed" : "pointer",
            }}
          >
            {loadingClosures
              ? "Checking Closure..."
              : entryBlocked
              ? "Blocked by Holiday / Vacation"
              : saving
              ? "Saving..."
              : "Save Admin Entry"}
          </button>

          <p style={{ margin: 0, fontSize: "12px", textAlign: "center", opacity: 0.9 }}>
            System developed by Lord Wilhelm (0593410452)
          </p>
        </div>
      </div>
    </main>
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

const infoCardStyle: React.CSSProperties = {
  background: COLORS.white,
  borderRadius: "16px",
  padding: "14px 18px",
  boxShadow: "0 8px 22px rgba(0,0,0,0.06)",
  marginBottom: "20px",
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
