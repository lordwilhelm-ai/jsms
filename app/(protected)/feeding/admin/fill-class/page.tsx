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
  return String(row.class_name || row.className || row.name || "").trim();
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
      return raw.split(",").map((item) => item.trim()).filter(Boolean);
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

function isActiveStudent(row: Student) {
  const status = String(
    row.status ||
      row.student_status ||
      row.studentStatus ||
      row.enrollment_status ||
      row.enrolment_status ||
      row.account_status ||
      ""
  )
    .trim()
    .toLowerCase();

  const inactiveWords = [
    "inactive", "not active", "left", "withdrawn", "transfer",
    "transferred", "deleted", "disabled", "graduated", "completed", "suspended",
  ];

  if (row.inactive === true) return false;
  if (row.is_inactive === true) return false;
  if (row.isInactive === true) return false;
  if (row.left_school === true) return false;
  if (row.leftSchool === true) return false;
  if (row.has_left === true) return false;
  if (row.hasLeft === true) return false;
  if (row.is_deleted === true) return false;
  if (row.isDeleted === true) return false;
  if (row.deleted === true) return false;
  if (row.deleted_at) return false;
  if (row.left_date) return false;
  if (row.date_left) return false;
  if (row.active === false) return false;
  if (row.is_active === false) return false;
  if (row.isActive === false) return false;
  if (status && inactiveWords.some((word) => status.includes(word))) return false;
  return true;
}

async function sendFeedingSubmissionPush(params: {
  className: string;
  date: string;
  academicYear: string;
  term: string;
  totalCollected: number;
  presentCount: number;
  absentCount: number;
  eatingCount: number;
  ateWithoutPayCount: number;
  enteredByName: string;
}) {
  const title = "Feeding submitted";
  const message = `${params.className} feeding entry for ${params.date} has been submitted. Present: ${params.presentCount}, Absent: ${params.absentCount}, Eating: ${params.eatingCount}.`;
  await supabase.functions.invoke("send-jsms-push", {
    body: {
      title,
      body: message,
      message,
      module: "feeding",
      type: "feeding_submission",
      recipient_roles: ["owner", "admin", "headmaster"],
      recipients: [{ role: "owner" }, { role: "admin" }, { role: "headmaster" }],
      data: {
        class_name: params.className,
        date: params.date,
        academic_year: params.academicYear,
        term: params.term,
        total_collected: params.totalCollected,
        present_count: params.presentCount,
        absent_count: params.absentCount,
        eating_count: params.eatingCount,
        ate_without_pay_count: params.ateWithoutPayCount,
        entered_by_name: params.enteredByName,
        url: "/feeding/admin/fill-class",
      },
    },
  });
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
  const { previousBalance, amountPaidToday, attendance, feedingFee, minimumToEat, ateWithoutPay } = params;
  const availableBeforeMeal = Number(previousBalance) + Number(amountPaidToday);

  if (attendance === "absent") {
    return { availableBeforeMeal, ateToday: false, newBalance: availableBeforeMeal };
  }

  const qualifiesNormally = availableBeforeMeal >= minimumToEat;
  const ateToday = ateWithoutPay || qualifiesNormally;
  const newBalance = ateToday ? availableBeforeMeal - feedingFee : availableBeforeMeal;

  return { availableBeforeMeal, ateToday, newBalance };
}

function getCreditOwedAmount(row: Record<string, any>, feedingFee: number) {
  const newBalance = Number(row.new_balance ?? row.newBalance ?? 0);
  const availableBeforeMeal = Number(row.available_before_meal ?? row.availableBeforeMeal ?? 0);
  const paidToday = Number(row.amount_paid_today ?? row.amountPaidToday ?? 0);

  if (newBalance < 0) return Math.abs(newBalance);
  const shortfall = feedingFee - availableBeforeMeal;
  if (shortfall > 0) return shortfall;
  if (paidToday <= 0) return feedingFee;
  return 0;
}

function formatMoney(value: number) {
  return Number(value || 0).toFixed(2).replace(/\.00$/, "");
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
    new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Accra" })
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
  // FIX: teacherCreditEntries now only holds entries for the selected class
  const [teacherCreditEntries, setTeacherCreditEntries] = useState<DailyEntry[]>([]);
  const [teacherAssignmentsByClass, setTeacherAssignmentsByClass] = useState<Record<string, string[]>>({});

  // FIX: track whether the class was already submitted by a teacher so we show the banner
  const [teacherSubmittedInfo, setTeacherSubmittedInfo] = useState<{
    submittedByName: string;
    submittedAt: string;
  } | null>(null);

  const [loadingPage, setLoadingPage] = useState(true);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [loadingTeachers, setLoadingTeachers] = useState(false);
  const [loadingBalances, setLoadingBalances] = useState(false);
  const [loadingExisting, setLoadingExisting] = useState(false);
  const [loadingTeacherCredits, setLoadingTeacherCredits] = useState(false);
  const [loadingClosures, setLoadingClosures] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void loadPageData();
  }, []);

  // Single coordinated effect: load students, existing entries, balances, and
  // teacher credits all together so form state is applied only once everything
  // is ready — no more race between loadStudents and loadExistingEntries.
  useEffect(() => {
    if (selectedClass) {
      void loadClassData();
    } else {
      setStudents([]);
      setExistingEntries([]);
      setTeacherCreditEntries([]);
      setTeacherSubmittedInfo(null);
      setAmounts({});
      setAttendance({});
      setAteWithoutPayMap({});
      setBalances({});
    }
  }, [selectedClass, selectedDate]);

  // loadClassData fetches students + existing entries + balances in one shot so
  // there is no timing gap where amounts get set before students exist (or get
  // cleared after students arrive).
  async function loadClassData() {
    try {
      setLoadingStudents(true);
      setLoadingExisting(true);
      setLoadingBalances(true);
      setLoadingTeacherCredits(true);
      setTeacherSubmittedInfo(null);

      // Step 1: students + existing entries + teacher credits in parallel
      const [studentsRes, entriesRes, creditRes] = await Promise.all([
        supabase
          .from("students")
          .select("*")
          .eq("class_name", selectedClass),
        supabase
          .from("daily_entries")
          .select("*")
          .eq("date", selectedDate)
          .eq("class_name", selectedClass),
        supabase
          .from("daily_entries")
          .select("*")
          .eq("date", selectedDate)
          .eq("class_name", selectedClass)
          .eq("entered_by_role", "teacher")
          .eq("admin_override_ate_without_pay", true)
          .order("student_name", { ascending: true }),
      ]);

      if (studentsRes.error) throw studentsRes.error;
      if (entriesRes.error) throw entriesRes.error;

      const activeStudents = (studentsRes.data || [])
        .filter(isActiveStudent)
        .sort((a, b) => getStudentName(a).localeCompare(getStudentName(b)));

      const entries = (entriesRes.data || []) as DailyEntry[];

      setStudents(activeStudents);
      setExistingEntries(entries);
      setTeacherCreditEntries((creditRes.error ? [] : creditRes.data || []) as DailyEntry[]);

      // Detect teacher submission banner
      const teacherRow = entries.find(
        (row) => String(row.entered_by_role || "").toLowerCase() === "teacher"
      );
      if (teacherRow) {
        setTeacherSubmittedInfo({
          submittedByName: String(
            teacherRow.entered_by_name || teacherRow.assigned_teacher_name || "Teacher"
          ),
          submittedAt: String(teacherRow.created_at || ""),
        });
      }

      // Step 2: build form state.
      // daily_entries stores student_id as the row UUID (not the school code like JVS97163),
      // so we match primarily by student_name as a reliable cross-table key.
      const nextAmounts: Record<string, string> = {};
      const nextAttendance: Record<string, Attendance> = {};
      const nextAteWithoutPay: OverrideMap = {};

      // Index entries by normalised student name (primary) and by whatever
      // student_id value is stored (secondary, in case it ever aligns).
      const entryByName = new Map<string, DailyEntry>();
      const entryById = new Map<string, DailyEntry>();
      entries.forEach((row) => {
        const name = String(row.student_name || row.studentName || "").trim().toLowerCase();
        if (name) entryByName.set(name, row);
        const id = String(row.student_id || row.studentId || "").trim();
        if (id) entryById.set(id, row);
      });

      activeStudents.forEach((student) => {
        const sid = getStudentIdValue(student);
        const sname = getStudentName(student).trim().toLowerCase();
        const entry = entryByName.get(sname) ?? entryById.get(sid);

        if (entry) {
          const rawAmount = entry.amount_paid_today ?? entry.amountPaidToday ?? null;
          nextAmounts[sid] = rawAmount !== null ? String(rawAmount) : "0";
          nextAttendance[sid] = (
            String(entry.attendance || "present").toLowerCase() === "absent" ? "absent" : "present"
          ) as Attendance;
          nextAteWithoutPay[sid] = Boolean(
            entry.admin_override_ate_without_pay ?? entry.adminOverrideAteWithoutPay
          );
        } else {
          nextAmounts[sid] = "";
          nextAttendance[sid] = "present";
          nextAteWithoutPay[sid] = false;
        }
      });

      setAmounts(nextAmounts);
      setAttendance(nextAttendance);
      setAteWithoutPayMap(nextAteWithoutPay);

      setLoadingStudents(false);
      setLoadingExisting(false);
      setLoadingTeacherCredits(false);

      // Step 3: fetch balances for active students
      const ids = activeStudents.map((s) => getStudentIdValue(s)).filter(Boolean);
      if (!ids.length) {
        setBalances({});
        setLoadingBalances(false);
        return;
      }

      const { data: balanceData, error: balanceError } = await supabase
        .from("student_balances")
        .select("*")
        .in("student_id", ids);

      if (balanceError) throw balanceError;

      const nextBalances: BalanceMap = {};
      (balanceData || []).forEach((row) => {
        nextBalances[String(row.student_id || "")] = Number(row.balance || 0);
      });
      setBalances(nextBalances);
    } catch (error) {
      console.error(error);
      alert("Failed to load class data.");
    } finally {
      setLoadingStudents(false);
      setLoadingExisting(false);
      setLoadingBalances(false);
      setLoadingTeacherCredits(false);
    }
  }

  async function loadPageData() {
    try {
      setLoadingPage(true);
      setLoadingTeachers(true);
      setLoadingClosures(true);

      const [
        settingsRes,
        classesRes,
        teachersRes,
        closuresRes,
        teacherAssignmentsRes,
        teacherClassesRes,
      ] = await Promise.all([
        supabase.from("school_settings").select("*").limit(1).maybeSingle(),
        supabase.from("classes").select("*").order("class_order", { ascending: true }),
        supabase.from("teachers").select("*"),
        supabase.from("school_closures").select("*").order("start_date", { ascending: true }),
        supabase.from("teacher_class_assignments").select("*"),
        supabase.from("teacher_classes").select("*"),
      ]);

      if (classesRes.error) throw classesRes.error;
      if (teachersRes.error) throw teachersRes.error;
      if (closuresRes.error) throw closuresRes.error;

      const classRows = classesRes.data || [];
      const classNameById = new Map<string, string>();
      const validClassNames = new Set<string>();

      classRows.forEach((classRow: any) => {
        const classId = String(classRow.id || "").trim();
        const className = getClassName(classRow);
        if (className) validClassNames.add(className);
        if (classId && className) classNameById.set(classId, className);
      });

      const nextTeacherAssignmentsByClass: Record<string, string[]> = {};

      function addTeacherToClass(classValue: unknown, teacherValue: unknown) {
        const rawClass = String(classValue || "").trim();
        const teacherId = String(teacherValue || "").trim();
        if (!rawClass || !teacherId) return;
        const className = classNameById.get(rawClass) || (validClassNames.has(rawClass) ? rawClass : "");
        if (!className) return;
        if (!nextTeacherAssignmentsByClass[className]) {
          nextTeacherAssignmentsByClass[className] = [];
        }
        if (!nextTeacherAssignmentsByClass[className].includes(teacherId)) {
          nextTeacherAssignmentsByClass[className].push(teacherId);
        }
      }

      if (!teacherAssignmentsRes.error) {
        (teacherAssignmentsRes.data || []).forEach((assignment: any) => {
          addTeacherToClass(
            assignment.class_id || assignment.classId || assignment.class_name || assignment.className,
            assignment.teacher_id || assignment.teacherId
          );
        });
      }

      if (!teacherClassesRes.error) {
        (teacherClassesRes.data || []).forEach((assignment: any) => {
          addTeacherToClass(
            assignment.class_id || assignment.classId || assignment.class_name || assignment.className,
            assignment.teacher_id || assignment.teacherId
          );
        });
      }

      (teachersRes.data || []).forEach((teacherRow: any) => {
        const teacherUuid = String(teacherRow.id || "").trim();
        const teacherCode = String(teacherRow.teacher_id || teacherRow.teacherId || "").trim();
        const teacherKey = teacherUuid || teacherCode;
        if (!teacherKey) return;
        getAssignedClasses(teacherRow).forEach((classValue) => {
          addTeacherToClass(classValue, teacherKey);
        });
      });

      setSettingsRow(settingsRes.data || null);
      setClasses(classesRes.data || []);
      setTeachers(teachersRes.data || []);
      setClosures(closuresRes.data || []);
      setTeacherAssignmentsByClass(nextTeacherAssignmentsByClass);

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

  const assignedTeacherIds = teacherAssignmentsByClass[selectedClass] || [];
  const assignedTeachers = teachers.filter((teacher) => {
    const teacherUuid = String(teacher.id || "").trim();
    const teacherCode = String(teacher.teacher_id || teacher.teacherId || "").trim();
    return (
      getAssignedClasses(teacher).includes(selectedClass) ||
      assignedTeacherIds.includes(teacherUuid) ||
      assignedTeacherIds.includes(teacherCode)
    );
  });

  const assignedTeacherName =
    assignedTeachers.length > 0
      ? assignedTeachers.map((teacher) => getTeacherName(teacher)).filter(Boolean).join(", ")
      : "Not Assigned";

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
      // FIX: flag students that have an existing entry so we can show it in the row
      hasExistingEntry: existingEntries.some((e) => getStudentIdValue(e) === studentId),
      existingEntryRole: (() => {
        const entry = existingEntries.find((e) => getStudentIdValue(e) === studentId);
        return entry ? String(entry.entered_by_role || "") : "";
      })(),
    };
  });

  const summary = useMemo(() => {
    return previewRows.reduce(
      (acc, row) => {
        acc.totalCollected += row.amountPaidToday;
        if (row.attendance === "present") acc.presentCount += 1;
        if (row.attendance === "absent") acc.absentCount += 1;
        if (row.ateToday) acc.eatingCount += 1;
        if (row.ateWithoutPay) {
          acc.ateWithoutPayCount += 1;
          acc.creditOwed += Math.max(feedingFee - row.amountPaidToday, 0);
        }
        return acc;
      },
      { totalCollected: 0, presentCount: 0, absentCount: 0, eatingCount: 0, ateWithoutPayCount: 0, creditOwed: 0 }
    );
  }, [previewRows, feedingFee]);

  const teacherCreditSummary = useMemo(() => {
    return teacherCreditEntries.reduce(
      (acc, row) => {
        acc.totalOwed += getCreditOwedAmount(row, feedingFee);
        acc.count += 1;
        return acc;
      },
      { totalOwed: 0, count: 0 }
    );
  }, [teacherCreditEntries, feedingFee]);

  function handleAmountChange(studentId: string, value: string) {
    setAmounts((prev) => ({ ...prev, [studentId]: value }));
  }

  function handleAttendanceChange(studentId: string, value: Attendance) {
    setAttendance((prev) => ({ ...prev, [studentId]: value }));
    if (value === "absent") {
      setAteWithoutPayMap((prev) => ({ ...prev, [studentId]: false }));
    }
  }

  function handleAteWithoutPayChange(studentId: string, checked: boolean) {
    setAteWithoutPayMap((prev) => ({ ...prev, [studentId]: checked }));
    if (checked) {
      setAttendance((prev) => ({ ...prev, [studentId]: "present" }));
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
          .in("id", (existingDailyRows || []).map((row) => row.id));
        if (deleteDailyError) throw deleteDailyError;
      }

      if ((existingLedgerRows || []).length > 0) {
        const { error: deleteLedgerError } = await supabase
          .from("balance_ledger")
          .delete()
          .in("id", (existingLedgerRows || []).map((row) => row.id));
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
        assigned_teacher_name: assignedTeacherName,
        entered_by_name: "Admin",
        entered_by_role: "admin",
        created_at: new Date().toISOString(),
      }));

      const { error: dailyInsertError } = await supabase.from("daily_entries").insert(dailyPayload);
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
        assigned_teacher_name: assignedTeacherName,
        edited_by: "Admin",
        feeding_fee: feedingFee,
        minimum_to_eat: minimumToEat,
        created_at: new Date().toISOString(),
      }));

      const { error: ledgerInsertError } = await supabase.from("balance_ledger").insert(ledgerPayload);
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
      if (logError) console.error(logError);

      await rebuildStudentBalancesFromLedger();
      await loadClassData();

      try {
        await sendFeedingSubmissionPush({
          className: selectedClass,
          date: selectedDate,
          academicYear,
          term: currentTerm,
          totalCollected: summary.totalCollected,
          presentCount: summary.presentCount,
          absentCount: summary.absentCount,
          eatingCount: summary.eatingCount,
          ateWithoutPayCount: summary.ateWithoutPayCount,
          enteredByName: "Admin",
        });
      } catch (pushError) {
        console.error("Feeding push notification failed:", pushError);
      }

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
        paddingBottom: "40px",
      }}
    >
      <style>{`
        .admin-feeding-controls {
          transition: transform 180ms ease, box-shadow 180ms ease;
        }
        .admin-feeding-controls:hover {
          transform: translateY(-2px);
          box-shadow: 0 16px 34px rgba(0,0,0,0.10) !important;
        }
        .desktop-feeding-panel {
          background: #ffffff;
          border-radius: 20px;
          box-shadow: 0 12px 32px rgba(0,0,0,0.08);
          border: 1px solid rgba(17,24,39,0.08);
          overflow: hidden;
        }
        .desktop-table-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 18px;
          padding: 18px 20px;
          border-bottom: 1px solid #f3f4f6;
          background: linear-gradient(135deg, #ffffff 0%, #fffbeb 100%);
        }
        .desktop-table-header, .desktop-feeding-row {
          display: grid;
          grid-template-columns: minmax(270px, 2.2fr) 145px 135px 150px 125px 135px 120px 130px;
          gap: 12px;
          align-items: center;
        }
        .desktop-table-header {
          padding: 12px 20px;
          background: #111827;
          color: #ffffff;
          font-size: 12px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: .04em;
        }
        .desktop-feeding-row {
          padding: 12px 20px;
          border-bottom: 1px solid #f3f4f6;
          transition: transform 160ms ease, box-shadow 160ms ease, background 160ms ease;
        }
        .desktop-feeding-row:hover {
          background: #fffbeb;
          transform: translateX(4px);
          box-shadow: inset 4px 0 0 #f59e0b;
        }
        .desktop-feeding-row.teacher-submitted {
          background: #eff6ff;
        }
        .desktop-feeding-row.teacher-submitted:hover {
          background: #dbeafe;
          box-shadow: inset 4px 0 0 #3b82f6;
        }
        .desktop-feeding-row:last-child { border-bottom: 0; }
        .student-identity strong { display: block; font-size: 14px; color: #111827; }
        .student-identity span, .money-subtext { display: block; color: #6b7280; font-size: 12px; margin-top: 3px; }
        .teacher-badge {
          display: inline-block;
          font-size: 10px;
          font-weight: 800;
          background: #dbeafe;
          color: #1d4ed8;
          border: 1px solid #bfdbfe;
          border-radius: 6px;
          padding: 2px 6px;
          margin-top: 3px;
          text-transform: uppercase;
          letter-spacing: .04em;
        }
        .desktop-mini-input {
          width: 100%;
          padding: 10px 11px;
          border-radius: 10px;
          border: 1px solid #d1d5db;
          font-size: 13px;
          background: #ffffff;
        }
        .desktop-mini-input:focus {
          outline: 2px solid #f59e0b;
          border-color: #f59e0b;
        }
        .credit-pill {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          font-size: 12px;
          font-weight: 800;
          background: #fff7ed;
          border: 1px solid #fed7aa;
          color: #9a3412;
          padding: 9px 10px;
          border-radius: 999px;
          white-space: nowrap;
          cursor: pointer;
        }
        .status-pill {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 74px;
          padding: 8px 10px;
          border-radius: 999px;
          font-size: 12px;
          font-weight: 800;
        }
        .status-pill.eating { background: #dcfce7; color: #166534; }
        .status-pill.not-eating { background: #fee2e2; color: #991b1b; }
        .floating-summary {
          position: fixed;
          right: 24px;
          top: 190px;
          z-index: 60;
          width: 96px;
          max-height: 64px;
          overflow: hidden;
          border-radius: 20px;
          background: #111827;
          color: #ffffff;
          box-shadow: 0 18px 45px rgba(0,0,0,0.28);
          border: 1px solid rgba(255,255,255,0.12);
          transition: width 220ms ease, max-height 220ms ease, border-radius 220ms ease;
        }
        .floating-summary:hover, .floating-summary:focus-within {
          width: 480px;
          max-height: 560px;
          border-radius: 24px;
        }
        .summary-collapsed {
          height: 64px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 12px;
          font-weight: 900;
          color: #fbbf24;
        }
        .floating-summary:hover .summary-collapsed, .floating-summary:focus-within .summary-collapsed { display: none; }
        .summary-expanded { display: none; padding: 18px; }
        .floating-summary:hover .summary-expanded, .floating-summary:focus-within .summary-expanded { display: block; }
        .summary-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin: 14px 0; }
        .summary-stat { background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.08); border-radius: 14px; padding: 10px; }
        .summary-stat span { display: block; font-size: 11px; opacity: .75; margin-bottom: 4px; }
        .summary-stat strong { font-size: 15px; }
        .quick-summary-grid {
          display: grid;
          grid-template-columns: repeat(5, minmax(130px, 1fr));
          gap: 10px;
          align-items: stretch;
        }
        .quick-summary-card {
          border-radius: 14px;
          padding: 11px 12px;
          background: #ffffff;
          border: 1px solid #f3f4f6;
          box-shadow: 0 8px 18px rgba(0,0,0,0.04);
          transition: transform 160ms ease, box-shadow 160ms ease;
        }
        .quick-summary-card:hover { transform: translateY(-2px); box-shadow: 0 12px 26px rgba(0,0,0,0.08); }
        .quick-summary-card span { display: block; color: #6b7280; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: .04em; margin-bottom: 5px; }
        .quick-summary-card strong { color: #111827; font-size: 16px; }
        .teacher-credit-panel { transition: transform 180ms ease, box-shadow 180ms ease; }
        .teacher-credit-panel:hover { transform: translateY(-2px); box-shadow: 0 16px 34px rgba(0,0,0,0.12) !important; }
        .teacher-submitted-banner {
          display: flex;
          align-items: center;
          gap: 12px;
          background: #eff6ff;
          border: 1px solid #bfdbfe;
          border-radius: 16px;
          padding: 14px 18px;
          margin-bottom: 20px;
          box-shadow: 0 6px 16px rgba(59,130,246,0.08);
        }
        .teacher-submitted-banner .icon {
          font-size: 28px;
          flex-shrink: 0;
        }
        @media (max-width: 1100px) {
          .desktop-table-header { display: none; }
          .desktop-feeding-row { grid-template-columns: 1fr 1fr; gap: 12px; }
          .quick-summary-grid { grid-template-columns: repeat(2, minmax(130px, 1fr)); }
          .floating-summary { right: 12px; left: auto; top: auto; bottom: 90px; width: 96px; }
          .floating-summary:hover, .floating-summary:focus-within { width: calc(100vw - 24px); right: 12px; }
          .admin-feeding-controls { grid-template-columns: 1fr !important; }
          .teacher-credit-row { grid-template-columns: 1fr !important; }
          .summary-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>

      {/* Header */}
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
            maxWidth: "1680px",
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

      <div style={{ maxWidth: "1680px", margin: "0 auto", padding: "24px" }}>

        {/* Controls */}
        <div
          className="admin-feeding-controls"
          style={{
            background: COLORS.white,
            borderRadius: "18px",
            padding: "18px",
            boxShadow: "0 10px 28px rgba(0,0,0,0.07)",
            marginBottom: "20px",
            display: "grid",
            gridTemplateColumns: "1.25fr 0.8fr 1fr",
            gap: "14px",
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
              value={loadingTeachers ? "Loading..." : assignedTeacherName}
              readOnly
              style={{ ...inputStyle, background: "#f3f4f6" }}
            />
          </div>
        </div>

        {/* Blocked banner */}
        {entryBlocked && (
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
        )}

        {/* FIX: Teacher-submitted banner — tells admin this class was already filled by the teacher,
            and that the amounts below are what the teacher entered (editable) */}
        {!entryBlocked && teacherSubmittedInfo && (
          <div className="teacher-submitted-banner">
            <div className="icon">📋</div>
            <div>
              <p style={{ margin: "0 0 4px", fontWeight: "bold", color: "#1d4ed8", fontSize: "15px" }}>
                Teacher Already Submitted This Class
              </p>
              <p style={{ margin: 0, color: "#3b82f6", fontSize: "13px" }}>
                <strong>{teacherSubmittedInfo.submittedByName}</strong> submitted entries for{" "}
                <strong>{selectedClass}</strong> on <strong>{selectedDate}</strong>. The amounts and
                attendance below reflect what the teacher recorded — you can review and edit any
                values, then save to override.
              </p>
            </div>
          </div>
        )}

        {/* Teacher credit panel — FIX: now only shows selected class credits */}
        {!entryBlocked && teacherCreditSummary.count > 0 && (
          <div
            className="teacher-credit-panel"
            style={{
              background: COLORS.white,
              borderRadius: "16px",
              padding: "16px",
              boxShadow: "0 8px 22px rgba(0,0,0,0.06)",
              marginBottom: "20px",
              border: "1px solid #fed7aa",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "start",
                gap: "12px",
                flexWrap: "wrap",
                marginBottom: "12px",
              }}
            >
              <div>
                <h2 style={{ margin: "0 0 6px", fontSize: "18px" }}>
                  Credit Feeding — {selectedClass}
                </h2>
                <p style={{ margin: 0, color: COLORS.muted, fontSize: "13px" }}>
                  Students in <strong>{selectedClass}</strong> that the teacher marked as eating on
                  credit for <strong>{selectedDate}</strong>.
                </p>
              </div>
              <div
                style={{
                  background: "#fff7ed",
                  border: "1px solid #fed7aa",
                  borderRadius: "12px",
                  padding: "10px 12px",
                  minWidth: "180px",
                }}
              >
                <p style={{ margin: "0 0 4px", fontSize: "12px", color: COLORS.muted }}>Total Owed</p>
                <p style={{ margin: 0, fontWeight: "bold", fontSize: "18px" }}>
                  GHS {formatMoney(teacherCreditSummary.totalOwed)}
                </p>
                <p style={{ margin: "4px 0 0", fontSize: "12px", color: COLORS.muted }}>
                  {teacherCreditSummary.count} student(s)
                </p>
              </div>
            </div>

            <div style={{ display: "grid", gap: "10px" }}>
              {teacherCreditEntries.map((row, index) => {
                const owed = getCreditOwedAmount(row, feedingFee);
                const rowKey = String(row.id || `${getStudentIdValue(row)}-${index}`);
                return (
                  <div
                    key={rowKey}
                    className="teacher-credit-row"
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1.4fr 0.8fr 0.8fr 0.7fr",
                      gap: "10px",
                      alignItems: "center",
                      padding: "10px",
                      borderRadius: "12px",
                      background: "#fffbeb",
                      border: "1px solid #fde68a",
                      fontSize: "13px",
                    }}
                  >
                    <div>
                      <strong>{String(row.student_name || row.studentName || "Unnamed")}</strong>
                      <div style={{ color: COLORS.muted }}>{getStudentIdValue(row)}</div>
                    </div>
                    <div>
                      <strong>{getClassName(row)}</strong>
                      <div style={{ color: COLORS.muted }}>
                        {String(row.assigned_teacher_name || row.entered_by_name || "Teacher")}
                      </div>
                    </div>
                    <div>
                      Paid: GHS{" "}
                      {formatMoney(Number(row.amount_paid_today ?? row.amountPaidToday ?? 0))}
                      <div style={{ color: COLORS.muted }}>
                        New Bal: GHS{" "}
                        {formatMoney(Number(row.new_balance ?? row.newBalance ?? 0))}
                      </div>
                    </div>
                    <div style={{ fontWeight: "bold", color: COLORS.danger }}>
                      Owes GHS {formatMoney(owed)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Empty state */}
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

        {/* Main table */}
        {previewRows.length > 0 && (
          <div className="desktop-feeding-panel">
            <div className="desktop-table-top">
              <div>
                <h2 style={{ margin: 0, fontSize: "19px" }}>Class Feeding Entry</h2>
                <p style={{ margin: "5px 0 0", color: COLORS.muted, fontSize: "13px" }}>
                  Enter feeding records for <strong>{selectedClass}</strong> on{" "}
                  <strong>{selectedDate}</strong>.
                  {teacherSubmittedInfo && (
                    <span style={{ marginLeft: "8px", color: "#1d4ed8", fontWeight: "bold" }}>
                      • Pre-filled from teacher submission
                    </span>
                  )}
                </p>
              </div>

              <div className="quick-summary-grid" style={{ minWidth: "720px" }}>
                <div className="quick-summary-card">
                  <span>Total Amount</span>
                  <strong>GHS {formatMoney(summary.totalCollected)}</strong>
                </div>
                <div className="quick-summary-card">
                  <span>Present</span>
                  <strong>{summary.presentCount}</strong>
                </div>
                <div className="quick-summary-card">
                  <span>Absent</span>
                  <strong>{summary.absentCount}</strong>
                </div>
                <div className="quick-summary-card">
                  <span>Eating</span>
                  <strong>{summary.eatingCount}</strong>
                </div>
                <div className="quick-summary-card">
                  <span>Credit Owed</span>
                  <strong>GHS {formatMoney(summary.creditOwed + teacherCreditSummary.totalOwed)}</strong>
                </div>
              </div>
            </div>

            <div className="desktop-table-header">
              <div>Student</div>
              <div>Attendance</div>
              <div>Paid Today</div>
              <div>Credit Eating</div>
              <div>Previous</div>
              <div>Available</div>
              <div>Status</div>
              <div>New Balance</div>
            </div>

            <div>
              {previewRows.map((student) => (
                <div
                  key={student.studentId}
                  className={`desktop-feeding-row${student.existingEntryRole === "teacher" ? " teacher-submitted" : ""}`}
                >
                  <div className="student-identity">
                    <strong>{student.fullName}</strong>
                    <span>{student.studentId}</span>
                    {/* FIX: show badge if this student's entry was submitted by teacher */}
                    {student.existingEntryRole === "teacher" && (
                      <span className="teacher-badge">Teacher entry</span>
                    )}
                  </div>

                  <div>
                    <select
                      value={student.attendance}
                      onChange={(e) =>
                        handleAttendanceChange(student.studentId, e.target.value as Attendance)
                      }
                      className="desktop-mini-input"
                    >
                      <option value="present">Present</option>
                      <option value="absent">Absent</option>
                    </select>
                  </div>

                  <div>
                    <input
                      type="number"
                      min="0"
                      value={amounts[student.studentId] ?? ""}
                      onChange={(e) => handleAmountChange(student.studentId, e.target.value)}
                      disabled={student.attendance === "absent"}
                      className="desktop-mini-input"
                      style={{
                        background: student.attendance === "absent" ? "#f3f4f6" : "#fff",
                      }}
                    />
                    <span className="money-subtext">GHS</span>
                  </div>

                  <div>
                    <label className="credit-pill">
                      <input
                        type="checkbox"
                        checked={student.ateWithoutPay}
                        disabled={student.attendance === "absent"}
                        onChange={(e) =>
                          handleAteWithoutPayChange(student.studentId, e.target.checked)
                        }
                      />
                      Ate on credit
                    </label>
                  </div>

                  <div>
                    <strong>GHS {formatMoney(student.previousBalance)}</strong>
                  </div>

                  <div>
                    <strong>GHS {formatMoney(student.availableBeforeMeal)}</strong>
                    <span className="money-subtext">before meal</span>
                  </div>

                  <div>
                    <span className={`status-pill ${student.ateToday ? "eating" : "not-eating"}`}>
                      {student.ateToday ? "Will eat" : "No meal"}
                    </span>
                  </div>

                  <div>
                    <strong
                      style={{
                        color: student.newBalance < 0 ? COLORS.danger : COLORS.success,
                      }}
                    >
                      GHS {formatMoney(student.newBalance)}
                    </strong>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Floating save/summary */}
        <div className="floating-summary" tabIndex={0}>
          <div className="summary-collapsed">Save / Summary</div>
          <div className="summary-expanded">
            <div>
              <h2 style={{ margin: 0, fontSize: "18px", color: "#fbbf24" }}>Entry Summary</h2>
              <p style={{ margin: "5px 0 0", fontSize: "12px", opacity: 0.8 }}>
                Hover here when you need totals or want to save.
              </p>
            </div>
            <div className="summary-grid">
              <div className="summary-stat">
                <span>Total Collected</span>
                <strong>GHS {formatMoney(summary.totalCollected)}</strong>
              </div>
              <div className="summary-stat">
                <span>Eating</span>
                <strong>{summary.eatingCount}</strong>
              </div>
              <div className="summary-stat">
                <span>Present</span>
                <strong>{summary.presentCount}</strong>
              </div>
              <div className="summary-stat">
                <span>Absent</span>
                <strong>{summary.absentCount}</strong>
              </div>
              <div className="summary-stat">
                <span>Ate on Credit</span>
                <strong>{summary.ateWithoutPayCount}</strong>
              </div>
              <div className="summary-stat">
                <span>Credit Owed</span>
                <strong>GHS {formatMoney(summary.creditOwed + teacherCreditSummary.totalOwed)}</strong>
              </div>
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
                borderRadius: "14px",
                border: "none",
                background: entryBlocked || loadingClosures ? "#9ca3af" : COLORS.primary,
                color: entryBlocked || loadingClosures ? "#ffffff" : COLORS.secondary,
                fontWeight: "bold",
                fontSize: "15px",
                cursor: entryBlocked || loadingClosures ? "not-allowed" : "pointer",
              }}
            >
              {loadingClosures
                ? "Checking Closure..."
                : entryBlocked
                ? "Blocked by Holiday / Vacation"
                : saving
                ? "Saving..."
                : teacherSubmittedInfo
                ? "Save & Override Teacher Entry"
                : "Save Admin Entry"}
            </button>

            <p style={{ margin: "10px 0 0", fontSize: "11px", textAlign: "center", opacity: 0.72 }}>
              System developed by Lord Wilhelm (0593410452)
            </p>
          </div>
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
