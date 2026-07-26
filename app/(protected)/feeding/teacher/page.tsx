"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { notifyFeedingSubmitted } from "@/lib/jsmsNotify";
import { authedFetch } from "@/lib/apiClient";
import { getGhanaDateString } from "@/lib/ghanaTime";

type Attendance = "present" | "absent";
type BalanceMap = Record<string, number>;
type TeacherRow = Record<string, any>;
type StudentRow = Record<string, any>;
type ClosureRow = Record<string, any>;
type SettingsRow = Record<string, any>;
type DailyEntryRow = Record<string, any>;
type CarryForwardInfo = Record<
  string,
  {
    lastDate: string;
    missedDays: string[];
    originalBalance: number;
    carriedBalance: number;
  }
>;

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

function getTeacherName(row: TeacherRow | null) {
  return String(
    row?.full_name || row?.name || row?.teacher_name || row?.username || "Teacher"
  ).trim();
}

function getTeacherId(row: TeacherRow | null) {
  return String(
    row?.teacher_id || row?.teacherId || row?.id || row?.auth_user_id || ""
  ).trim();
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
  // Feeding account must use one permanent key. Prefer the UUID `students.id`.
  // Display-only JVS IDs can be blank, so do not use them as the first choice for feeding balance.
  return String(row.id || row.student_id || row.studentId || "").trim();
}

function getClassName(row: Record<string, any>) {
  return String(row.class_name || row.className || row.name || "").trim();
}

function getAssignedClassesFromTeacherRow(row: Record<string, any>): string[] {
  const raw = row.assigned_classes ?? row.assignedClasses ?? row.assigned_class ?? row.assignedClass ?? null;

  if (Array.isArray(raw)) {
    return raw.map((item) => String(item).trim()).filter(Boolean);
  }

  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return [];

    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed.map((item) => String(item).trim()).filter(Boolean);
      }
    } catch {
      // Keep comma fallback below.
    }

    return trimmed
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

function isActiveStudent(row: StudentRow) {
  const active = row.active;
  const isActive = row.is_active;
  const status = String(row.status || row.student_status || row.enrollment_status || "")
    .trim()
    .toLowerCase();

  if (active === false || isActive === false) return false;
  if (status === "inactive" || status === "withdrawn" || status === "deleted" || status === "archived") {
    return false;
  }

  return true;
}

function isWeekend(dateString: string) {
  const day = new Date(`${dateString}T12:00:00`).getDay();
  return day === 0 || day === 6;
}

function isDateWithinRange(dateString: string, startDate: string, endDate: string) {
  return dateString >= startDate && dateString <= endDate;
}

function addDays(dateString: string, days: number) {
  const date = new Date(`${dateString}T12:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().split("T")[0];
}

function isClosureDate(dateString: string, closures: ClosureRow[]) {
  return closures.some((closure) => {
    if (closure.active === false) return false;

    const start = String(closure.start_date || closure.startDate || "").trim();
    const end = String(closure.end_date || closure.endDate || "").trim();

    if (!start || !end) return false;
    return isDateWithinRange(dateString, start, end);
  });
}

function getMissedFeedingDays(args: {
  lastDate: string;
  today: string;
  closures: ClosureRow[];
}) {
  const days: string[] = [];
  if (!args.lastDate || args.lastDate >= args.today) return days;

  let cursor = addDays(args.lastDate, 1);
  const yesterday = addDays(args.today, -1);

  while (cursor <= yesterday) {
    if (!isWeekend(cursor) && !isClosureDate(cursor, args.closures)) {
      days.push(cursor);
    }
    cursor = addDays(cursor, 1);
  }

  return days;
}

function applyCarryForward(args: {
  balance: number;
  missedDays: string[];
  feedingFee: number;
  minimumToEat: number;
}) {
  let nextBalance = Number(args.balance || 0);
  const feedingFee = Number(args.feedingFee || 6);
  const minimumToEat = Number(args.minimumToEat || 5);

  for (const _day of args.missedDays) {
    // Auto-deduct only when the student had enough money to eat on that missed school day.
    // Negative balances still carry forward; we do not erase them.
    if (nextBalance >= minimumToEat) {
      nextBalance -= feedingFee;
    }
  }

  return nextBalance;
}


function getEntryAttendance(row: DailyEntryRow): Attendance {
  return String(row?.attendance || "present").toLowerCase() === "absent" ? "absent" : "present";
}

function shouldDeductForEntry(args: {
  row: DailyEntryRow;
  availableBeforeMeal: number;
  attendance: Attendance;
  minimumToEat: number;
}) {
  if (args.attendance === "absent") return false;

  const ateWithoutPay = Boolean(
    args.row?.admin_override_ate_without_pay ||
      args.row?.ate_without_paying ||
      args.row?.ateWithoutPay
  );

  if (ateWithoutPay) return true;

  // Recalculate from the rebuilt running balance instead of trusting old bad saved ate_today values.
  return Number(args.availableBeforeMeal || 0) >= Number(args.minimumToEat || 5);
}

function rebuildBalanceFromHistory(args: {
  entries: DailyEntryRow[];
  fallbackBalance: number;
  today: string;
  closures: ClosureRow[];
  feedingFee: number;
  minimumToEat: number;
}) {
  const entries = [...(args.entries || [])].sort((a, b) =>
    String(a.date || "").localeCompare(String(b.date || ""))
  );

  if (!entries.length) {
    return {
      balance: Number(args.fallbackBalance || 0),
      lastDate: "",
      missedDays: [] as string[],
      originalBalance: Number(args.fallbackBalance || 0),
      usedHistory: false,
    };
  }

  // Start from the earliest known previous balance, then rebuild every saved feeding day.
  // This fixes old wrong rows that saved previous_balance/new_balance as 0.
  let runningBalance = Number(entries[0]?.previous_balance || 0);
  let lastDate = "";
  const allMissedDays: string[] = [];

  entries.forEach((entry) => {
    const entryDate = String(entry.date || "").trim();
    if (!entryDate) return;

    if (lastDate && lastDate < entryDate) {
      const missedDays = getMissedFeedingDays({
        lastDate,
        today: entryDate,
        closures: args.closures,
      });

      runningBalance = applyCarryForward({
        balance: runningBalance,
        missedDays,
        feedingFee: args.feedingFee,
        minimumToEat: args.minimumToEat,
      });

      allMissedDays.push(...missedDays);
    }

    const amountPaidToday = Number(entry.amount_paid_today || 0);
    const attendance = getEntryAttendance(entry);
    const availableBeforeMeal = runningBalance + amountPaidToday;
    const ateToday = shouldDeductForEntry({
      row: entry,
      availableBeforeMeal,
      attendance,
      minimumToEat: args.minimumToEat,
    });

    runningBalance = ateToday
      ? availableBeforeMeal - Number(args.feedingFee || 6)
      : availableBeforeMeal;

    lastDate = entryDate;
  });

  if (lastDate) {
    const missedDays = getMissedFeedingDays({
      lastDate,
      today: args.today,
      closures: args.closures,
    });

    runningBalance = applyCarryForward({
      balance: runningBalance,
      missedDays,
      feedingFee: args.feedingFee,
      minimumToEat: args.minimumToEat,
    });

    allMissedDays.push(...missedDays);
  }

  return {
    balance: runningBalance,
    lastDate,
    missedDays: allMissedDays,
    originalBalance: Number(entries[entries.length - 1]?.new_balance ?? args.fallbackBalance ?? 0),
    usedHistory: true,
  };
}

function calculateFeeding(args: {
  previousBalance: number;
  amountPaidToday: number;
  attendance: Attendance;
  feedingFee: number;
  minimumToEat: number;
  ateOnCredit?: boolean;
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

  const ateToday = Boolean(args.ateOnCredit) || availableBeforeMeal >= minimumToEat;
  const newBalance = ateToday ? availableBeforeMeal - feedingFee : availableBeforeMeal;

  return {
    availableBeforeMeal,
    ateToday,
    newBalance,
  };
}

const MISSING_UNIQUE_CONSTRAINT_CODE = "42P10";

function isMissingUniqueConstraintError(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  if (error.code === MISSING_UNIQUE_CONSTRAINT_CODE) return true;
  return /no unique or exclusion constraint/i.test(error.message || "");
}

// Prefer an upsert on the natural (date, student_id[, entered_by_role]) key so
// a race between two near-simultaneous submissions for the same class+date
// merges into one row per student instead of creating duplicate history. If
// the database doesn't have that unique constraint yet, PostgREST rejects the
// upsert's ON CONFLICT target — fall back to a plain insert so submissions
// keep working exactly as before until the constraint is added.
async function upsertOrInsert(
  table: "daily_entries" | "balance_ledger",
  rows: Record<string, any>[],
  onConflict: string
) {
  const { error } = await supabase.from(table).upsert(rows, { onConflict });

  if (error && isMissingUniqueConstraintError(error)) {
    console.warn(
      `${table} has no unique constraint on (${onConflict}); falling back to a plain insert. ` +
        "Add that constraint in the database to fully close the duplicate-submission race."
    );
    const { error: insertError } = await supabase.from(table).insert(rows);
    return insertError;
  }

  return error;
}

export default function FeedingTeacherPage() {
  const router = useRouter();

  const [checkingUser, setCheckingUser] = useState(true);
  const [teacher, setTeacher] = useState<TeacherRow | null>(null);

  const [assignedClassIds, setAssignedClassIds] = useState<string[]>([]);
  const [assignedClassNames, setAssignedClassNames] = useState<string[]>([]);
  const [selectedClass, setSelectedClass] = useState("");
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [loadingStudents, setLoadingStudents] = useState(false);

  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [attendance, setAttendance] = useState<Record<string, Attendance>>({});
  const [creditEating, setCreditEating] = useState<Record<string, boolean>>({});
  const [balances, setBalances] = useState<BalanceMap>({});
  const [carryForwardInfo, setCarryForwardInfo] = useState<CarryForwardInfo>({});
  const [loadingBalances, setLoadingBalances] = useState(false);

  const [todayEntries, setTodayEntries] = useState<DailyEntryRow[]>([]);
  const [todaySubmitted, setTodaySubmitted] = useState(false);
  const [loadingTodayEntry, setLoadingTodayEntry] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [showCreditUpdateNotice, setShowCreditUpdateNotice] = useState(false);
  const [creditUpdateNoticeStep, setCreditUpdateNoticeStep] = useState<1 | 2>(1);

  const [checkingCalendar, setCheckingCalendar] = useState(true);
  const [entryBlocked, setEntryBlocked] = useState(false);
  const [blockedReason, setBlockedReason] = useState("");
  const [closures, setClosures] = useState<ClosureRow[]>([]);

  const [settingsRow, setSettingsRow] = useState<SettingsRow | null>(null);

  const today = getGhanaDateString();
  const now = new Date();
  const dayName = now.toLocaleDateString(undefined, {
    weekday: "long",
    timeZone: "Africa/Accra",
  });
  const prettyDate = now.toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "Africa/Accra",
  });

  const feedingFee = Number(settingsRow?.feeding_fee || 6);
  const minimumToEat = Number(settingsRow?.minimum_to_eat || 5);
  const academicYear = String(settingsRow?.academic_year || "2026/2027");

  useEffect(() => {
    const noticeKey = "jsms_feeding_teacher_credit_update_notice_v3";

    try {
      const seen = window.localStorage.getItem(noticeKey);
      if (!seen) {
        setCreditUpdateNoticeStep(1);
        setCreditUpdateNoticeStep(1);
      setShowCreditUpdateNotice(true);
      }
    } catch {
      setShowCreditUpdateNotice(true);
    }
  }, []);

  function closeCreditUpdateNotice() {
    const noticeKey = "jsms_feeding_teacher_credit_update_notice_v3";

    try {
      window.localStorage.setItem(noticeKey, "seen");
    } catch {
      // localStorage may be blocked. The notice will still close for this session.
    }

    setShowCreditUpdateNotice(false);
  }

  useEffect(() => {
    let active = true;

    async function checkUser() {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!active) return;

        if (!session?.user) {
          router.replace("/");
          return;
        }

        const [teachersRes, settingsRes, classesRes, assignmentRes, teacherClassesRes] = await Promise.all([
          supabase.from("teachers").select("*"),
          supabase.from("school_settings").select("*").limit(1).maybeSingle(),
          supabase.from("classes").select("*").order("class_order", { ascending: true }),
          supabase.from("teacher_class_assignments").select("*"),
          supabase.from("teacher_classes").select("*"),
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

        const allClassRows = classesRes.data || [];
        const classNameById = new Map<string, string>();
        const validClassNames = new Set<string>();

        allClassRows.forEach((cls: any) => {
          const classId = String(cls.id || "").trim();
          const className = getClassName(cls);

          if (className) validClassNames.add(className);
          if (classId && className) classNameById.set(classId, className);
        });

        const finalClassIds = new Set<string>();
        const finalClassNames = new Set<string>();

        function addClassId(classId: unknown) {
          const normalizedId = String(classId || "").trim();
          if (!normalizedId) return;

          finalClassIds.add(normalizedId);
          const className = classNameById.get(normalizedId);
          if (className) finalClassNames.add(className);
        }

        function addClassName(className: unknown) {
          const normalizedName = String(className || "").trim();
          if (!normalizedName) return;

          // Only add real class names, so teacher IDs or random values do not enter the dropdown.
          if (validClassNames.has(normalizedName)) finalClassNames.add(normalizedName);
        }

        const teacherUuid = String(row.id || "").trim();
        const teacherCode = String(row.teacher_id || row.teacherId || "").trim();

        function assignmentBelongsToTeacher(assignment: any) {
          const assignedTeacherId = String(assignment.teacher_id || assignment.teacherId || "").trim();
          return assignedTeacherId === teacherUuid || assignedTeacherId === teacherCode;
        }

        function addAssignmentClass(assignment: any) {
          addClassId(assignment.class_id || assignment.classId);
          addClassName(assignment.class_name || assignment.className);
        }

        if (!assignmentRes.error) {
          (assignmentRes.data || []).filter(assignmentBelongsToTeacher).forEach(addAssignmentClass);
        } else {
          console.error("Failed to load teacher_class_assignments:", assignmentRes.error);
        }

        if (!teacherClassesRes.error) {
          (teacherClassesRes.data || []).filter(assignmentBelongsToTeacher).forEach(addAssignmentClass);
        } else {
          console.error("Failed to load teacher_classes:", teacherClassesRes.error);
        }

        try {
          const assignResponse = await authedFetch(`/api/teacher-assignments/get?teacher_id=${row.id}`);
          const assignData = await assignResponse.json();

          if (assignResponse.ok && !assignData.error) {
            const apiClassIds = Array.isArray(assignData.class_ids) ? assignData.class_ids : [];
            const apiClassNames = Array.isArray(assignData.class_names) ? assignData.class_names : [];
            const apiAssignments = Array.isArray(assignData.assignments) ? assignData.assignments : [];

            apiClassIds.forEach(addClassId);
            apiClassNames.forEach(addClassName);
            apiAssignments.forEach((assignment: any) => {
              addClassId(assignment.class_id || assignment.classId);
              addClassName(assignment.class_name || assignment.className);
            });
          } else {
            console.error("Failed to load teacher assignments from API:", assignData.error);
          }
        } catch (assignmentApiError) {
          console.error("Failed to call teacher assignments API:", assignmentApiError);
        }

        getAssignedClassesFromTeacherRow(row).forEach((classValue) => {
          if (classNameById.has(classValue)) {
            addClassId(classValue);
          } else {
            addClassName(classValue);
          }
        });

        const resolvedClassIds = Array.from(finalClassIds);
        const resolvedClassNames = Array.from(finalClassNames);

        setAssignedClassIds(resolvedClassIds);
        setAssignedClassNames(resolvedClassNames);

        if (resolvedClassNames.length > 0) {
          setSelectedClass(resolvedClassNames[0]);
        } else {
          setSelectedClass("");
        }

        setTeacher(row);
        setSettingsRow(settingsRes.data || null);
        setCheckingUser(false);
      } catch (error) {
        console.error("Error checking user:", error);
        router.replace("/");
      }
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

        const { data, error } = await supabase
          .from("school_closures")
          .select("*")
          .eq("active", true);

        if (error) throw error;

        const closureRows = data || [];
        setClosures(closureRows);

        if (isWeekend(today)) {
          setEntryBlocked(true);
          setBlockedReason("School is closed today because it is a weekend.");
          return;
        }

        const matched = closureRows.find((row: ClosureRow) => {
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
        setClosures([]);
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
      setCarryForwardInfo({});
      setTodayEntries([]);
      setTodaySubmitted(false);
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
          .filter(isActiveStudent)
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
    if (!selectedClass || entryBlocked) {
      setTodayEntries([]);
      setTodaySubmitted(false);
      setAmounts({});
      setAttendance({});
      setCreditEating({});
      return;
    }

    async function loadTodayEntries() {
      try {
        setLoadingTodayEntry(true);

        const { data, error } = await supabase
          .from("daily_entries")
          .select("*")
          .eq("date", today)
          .eq("class_name", selectedClass)
          .eq("entered_by_role", "teacher")
          .order("student_name", { ascending: true });

        if (error) throw error;

        const rows = data || [];
        setTodayEntries(rows);
        setTodaySubmitted(rows.length > 0);

        if (rows.length > 0) {
          const savedAmounts: Record<string, string> = {};
          const savedAttendance: Record<string, Attendance> = {};
          const savedCreditEating: Record<string, boolean> = {};

          rows.forEach((row: DailyEntryRow) => {
            const studentId = String(row.student_id || "").trim();
            if (!studentId) return;

            savedAmounts[studentId] = String(Number(row.amount_paid_today || 0));
            savedAttendance[studentId] =
              String(row.attendance || "present").toLowerCase() === "absent" ? "absent" : "present";
            savedCreditEating[studentId] = Boolean(
              row.admin_override_ate_without_pay || row.ate_without_paying || row.ateWithoutPay
            );
          });

          setAmounts(savedAmounts);
          setAttendance(savedAttendance);
          setCreditEating(savedCreditEating);
        } else {
          setAmounts({});
          setAttendance({});
          setCreditEating({});
        }
      } catch (error) {
        console.error(error);
        setTodayEntries([]);
        setTodaySubmitted(false);
      } finally {
        setLoadingTodayEntry(false);
      }
    }

    void loadTodayEntries();
  }, [selectedClass, entryBlocked, today]);

  useEffect(() => {
    if (!students.length || entryBlocked) {
      setBalances({});
      setCarryForwardInfo({});
      return;
    }

    async function loadBalances() {
      try {
        setLoadingBalances(true);

        const ids = students.map((student) => getStudentIdValue(student)).filter(Boolean);

        if (!ids.length) {
          setBalances({});
          setCarryForwardInfo({});
          return;
        }

        const [balancesRes, dailyRes] = await Promise.all([
          supabase.from("student_balances").select("*").in("student_id", ids),
          supabase
            .from("daily_entries")
            .select("*")
            .in("student_id", ids)
            .eq("academic_year", academicYear)
            .lt("date", today)
            .order("date", { ascending: true }),
        ]);

        if (balancesRes.error) throw balancesRes.error;
        if (dailyRes.error) throw dailyRes.error;

        const rawBalanceMap: BalanceMap = {};
        (balancesRes.data || []).forEach((row) => {
          // student_balances holds one row per student with no history, so a
          // stored balance from a previous academic year is stale debt/credit
          // that should not carry into the new year — only trust it when it
          // already belongs to the current academic year.
          const rowYear = String(row.academic_year || "").trim();
          if (rowYear && academicYear && rowYear !== academicYear) return;
          rawBalanceMap[String(row.student_id || "")] = Number(row.balance || 0);
        });

        const entriesByStudent: Record<string, DailyEntryRow[]> = {};
        (dailyRes.data || []).forEach((row) => {
          const studentId = String(row.student_id || "").trim();
          if (!studentId) return;
          if (!entriesByStudent[studentId]) entriesByStudent[studentId] = [];
          entriesByStudent[studentId].push(row);
        });

        const nextBalances: BalanceMap = {};
        const nextCarryForwardInfo: CarryForwardInfo = {};

        ids.forEach((studentId) => {
          const history = rebuildBalanceFromHistory({
            entries: entriesByStudent[studentId] || [],
            fallbackBalance: Number(rawBalanceMap[studentId] || 0),
            today,
            closures,
            feedingFee,
            minimumToEat,
          });

          nextBalances[studentId] = history.balance;

          if (history.usedHistory || history.missedDays.length > 0) {
            nextCarryForwardInfo[studentId] = {
              lastDate: history.lastDate,
              missedDays: history.missedDays,
              originalBalance: history.originalBalance,
              carriedBalance: history.balance,
            };
          }
        });

        setBalances(nextBalances);
        setCarryForwardInfo(nextCarryForwardInfo);
      } catch (error) {
        console.error(error);
        setBalances({});
        setCarryForwardInfo({});
      } finally {
        setLoadingBalances(false);
      }
    }

    void loadBalances();
  }, [students, entryBlocked, today, closures, feedingFee, minimumToEat, academicYear]);

  const todayEntriesMap = useMemo(() => {
    const map: Record<string, DailyEntryRow> = {};
    todayEntries.forEach((row) => {
      const studentId = String(row.student_id || "").trim();
      if (studentId) map[studentId] = row;
    });
    return map;
  }, [todayEntries]);

  const previewRows = students.map((student) => {
    const studentId = getStudentIdValue(student);
    const savedEntry = todayEntriesMap[studentId] || null;

    const amountPaidToday = savedEntry
      ? Number(savedEntry.amount_paid_today || 0)
      : Number(amounts[studentId] || 0);

    const studentAttendance = savedEntry
      ? String(savedEntry.attendance || "present").toLowerCase() === "absent"
        ? "absent"
        : "present"
      : attendance[studentId] || "present";

    // Always use the rebuilt carried-forward balance.
    // Do not trust savedEntry.previous_balance because old submitted rows may have saved 0.
    const previousBalance = Number(balances[studentId] || 0);

    const ateOnCredit = savedEntry
      ? Boolean(
          savedEntry.admin_override_ate_without_pay ||
            savedEntry.ate_without_paying ||
            savedEntry.ateWithoutPay
        )
      : Boolean(creditEating[studentId]);

    const calculated = calculateFeeding({
      previousBalance,
      amountPaidToday,
      attendance: studentAttendance,
      feedingFee,
      minimumToEat,
      ateOnCredit,
    });

    return {
      id: student.id,
      studentId,
      displayId: String(student.student_id || student.studentId || student.id || "").trim(),
      fullName: getStudentName(student),
      className: getClassName(student),
      amountPaidToday,
      attendance: studentAttendance as Attendance,
      ateOnCredit,
      previousBalance,
      carryForward: carryForwardInfo[studentId] || null,
      availableBeforeMeal: calculated.availableBeforeMeal,
      ateToday: calculated.ateToday,
      newBalance: calculated.newBalance,
    };
  });

  const summary = useMemo(() => {
    return previewRows.reduce(
      (acc, row) => {
        acc.totalCollected += row.amountPaidToday;
        if (row.attendance === "present") acc.presentCount += 1;
        if (row.attendance === "absent") acc.absentCount += 1;
        if (row.ateToday) acc.eatingCount += 1;
        if (row.ateOnCredit) {
          acc.creditCount += 1;
          acc.creditOwed += Math.max(0, Math.abs(Math.min(row.newBalance, 0)));
        }
        return acc;
      },
      {
        totalCollected: 0,
        presentCount: 0,
        absentCount: 0,
        eatingCount: 0,
        creditCount: 0,
        creditOwed: 0,
      }
    );
  }, [previewRows]);

  function handleAmountChange(studentId: string, value: string) {
    setAmounts((prev) => ({ ...prev, [studentId]: value }));
  }

  function handleAttendanceChange(studentId: string, value: Attendance) {
    setAttendance((prev) => ({ ...prev, [studentId]: value }));

    if (value === "absent") {
      setCreditEating((prev) => ({ ...prev, [studentId]: false }));
    }
  }

  function handleCreditChange(studentId: string, checked: boolean) {
    setCreditEating((prev) => ({ ...prev, [studentId]: checked }));
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

    if (todaySubmitted) {
      alert("This class has already been submitted today. You can preview it, but you cannot submit again.");
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
        admin_override_ate_without_pay: row.ateOnCredit,
        new_balance: row.newBalance,
        assigned_teacher_name: String(
          teacher.full_name || teacher.name || teacher.username || "Teacher"
        ),
        entered_by_name: String(
          teacher.full_name || teacher.name || teacher.username || "Teacher"
        ),
        entered_by_role: "teacher",
      }));

      const dailyError = await upsertOrInsert(
        "daily_entries",
        dailyPayload,
        "date,student_id,entered_by_role"
      );
      if (dailyError) throw dailyError;

      const balancesPayload = previewRows.map((row) => ({
        student_id: row.studentId,
        student_name: row.fullName,
        class_name: row.className,
        academic_year: academicYear,
        balance: row.newBalance,
        updated_at: new Date().toISOString(),
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

      const ledgerError = await upsertOrInsert("balance_ledger", ledgerPayload, "date,student_id");
      if (ledgerError) throw ledgerError;

      await notifyFeedingSubmitted({
        teacherId: getTeacherId(teacher),
        teacherName: getTeacherName(teacher),
        className: selectedClass,
        date: today,
      });

      alert("Daily entry submitted successfully.");

      setTodaySubmitted(true);
      setTodayEntries(
        previewRows.map((row) => ({
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
          admin_override_ate_without_pay: row.ateOnCredit,
          new_balance: row.newBalance,
          entered_by_role: "teacher",
        }))
      );

      const refreshedBalances: BalanceMap = {};
      previewRows.forEach((row) => {
        refreshedBalances[row.studentId] = row.newBalance;
      });
      setBalances(refreshedBalances);
      setCarryForwardInfo({});
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

  const submitDisabled =
    submitting ||
    loadingBalances ||
    loadingStudents ||
    loadingTodayEntry ||
    !selectedClass ||
    entryBlocked ||
    todaySubmitted;

  return (
    <main
      style={{
        minHeight: "100vh",
        background: COLORS.background,
        fontFamily: "Arial, sans-serif",
        color: COLORS.text,
        paddingBottom: "90px",
      }}
    >
      {showCreditUpdateNotice && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 80,
            background: "rgba(0,0,0,0.38)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "18px",
          }}
        >
          <div
            style={{
              width: "min(420px, 100%)",
              background: COLORS.white,
              borderRadius: "20px",
              padding: "20px",
              boxShadow: "0 18px 50px rgba(0,0,0,0.28)",
              borderTop: `5px solid ${COLORS.primary}`,
            }}
          >
            {creditUpdateNoticeStep === 1 ? (
              <>
                <div style={{ fontSize: "22px", fontWeight: "bold", marginBottom: "8px" }}>
                  Feeding update
                </div>
                <p style={{ margin: "0 0 16px", color: COLORS.muted, lineHeight: 1.55 }}>
                  When a student eats without paying, tick
                  <strong> Ate on credit / ate without paying</strong> before submitting.
                </p>
                <button
                  type="button"
                  onClick={() => setCreditUpdateNoticeStep(2)}
                  style={{
                    width: "100%",
                    border: "none",
                    borderRadius: "14px",
                    padding: "13px",
                    background: COLORS.secondary,
                    color: COLORS.white,
                    fontWeight: "bold",
                    fontSize: "15px",
                    cursor: "pointer",
                  }}
                >
                  Next
                </button>
              </>
            ) : (
              <>
                <div style={{ fontSize: "22px", fontWeight: "bold", marginBottom: "8px" }}>
                  How to submit feeding
                </div>
                <p style={{ margin: "0 0 16px", color: COLORS.muted, lineHeight: 1.55 }}>
                  Tap the <strong>Summary</strong> button, review the totals, then tap
                  <strong> Submit Daily Entry</strong>. Once you submit for the day, you cannot change it.
                </p>
                <button
                  type="button"
                  onClick={closeCreditUpdateNotice}
                  style={{
                    width: "100%",
                    border: "none",
                    borderRadius: "14px",
                    padding: "13px",
                    background: COLORS.secondary,
                    color: COLORS.white,
                    fontWeight: "bold",
                    fontSize: "15px",
                    cursor: "pointer",
                  }}
                >
                  I understand
                </button>
              </>
            )}
          </div>
        </div>
      )}

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
            {assignedClassNames.length === 0 ? (
              <option value="">No class assigned</option>
            ) : (
              assignedClassNames.map((className) => (
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
                <div style={{ fontSize: "13px", color: "#555" }}>{student.displayId}</div>
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
                    disabled={todaySubmitted}
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
                    disabled={todaySubmitted || student.attendance === "absent"}
                    placeholder="Enter amount"
                    style={{
                      ...inputStyle,
                      background: student.attendance === "absent" ? "#f3f4f6" : COLORS.white,
                    }}
                  />
                </div>

                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    background: student.ateOnCredit ? "#fff7ed" : "#f9fafb",
                    border: `1px solid ${student.ateOnCredit ? "#fb923c" : "#e5e7eb"}`,
                    borderRadius: "12px",
                    padding: "12px",
                    fontWeight: "bold",
                    color: student.ateOnCredit ? "#9a3412" : COLORS.text,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={student.ateOnCredit}
                    onChange={(e) => handleCreditChange(student.studentId, e.target.checked)}
                    disabled={todaySubmitted || student.attendance === "absent"}
                    style={{ width: "18px", height: "18px" }}
                  />
                  Ate on credit / ate without paying
                </label>

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
                  {student.ateOnCredit && (
                    <p style={{ margin: "4px 0", color: "#9a3412", fontWeight: "bold" }}>
                      Credit marked: feeding fee will be deducted even if no money was paid.
                    </p>
                  )}
                  <p style={{ margin: "4px 0" }}>
                    <strong>New Balance:</strong> GHS {student.newBalance}
                  </p>
                </div>
              </div>
            </div>
          ))}
      </div>

      <div
        onMouseEnter={() => setSummaryOpen(true)}
        onMouseLeave={() => setSummaryOpen(false)}
        onFocus={() => setSummaryOpen(true)}
        style={{
          position: "fixed",
          right: "14px",
          bottom: "96px",
          zIndex: 30,
          fontFamily: "Arial, sans-serif",
        }}
      >
        {summaryOpen && (
          <div
            style={{
              width: "min(330px, calc(100vw - 28px))",
              background: COLORS.secondary,
              color: COLORS.white,
              borderRadius: "18px",
              padding: "14px",
              marginBottom: "10px",
              boxShadow: "0 14px 34px rgba(0,0,0,0.24)",
            }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(2, 1fr)",
                gap: "8px",
                fontSize: "13px",
                marginBottom: "12px",
              }}
            >
              <div>Total: GHS {summary.totalCollected}</div>
              <div>Eating: {summary.eatingCount}</div>
              <div>Present: {summary.presentCount}</div>
              <div>Absent: {summary.absentCount}</div>
              <div>Credit: {summary.creditCount}</div>
              <div>Credit Owed: GHS {summary.creditOwed}</div>
            </div>

            <button
              onClick={handleSubmit}
              disabled={submitDisabled}
              style={{
                width: "100%",
                padding: "13px",
                borderRadius: "12px",
                border: "none",
                background: submitDisabled ? "#9ca3af" : COLORS.primary,
                color: submitDisabled ? "#ffffff" : COLORS.secondary,
                fontWeight: "bold",
                fontSize: "15px",
                cursor: submitDisabled ? "not-allowed" : "pointer",
              }}
            >
              {entryBlocked
                ? "Entry Closed Today"
                : todaySubmitted
                ? "Saved for Today"
                : submitting
                ? "Submitting..."
                : "Submit Daily Entry"}
            </button>

            <p style={{ margin: "10px 0 0", fontSize: "11px", textAlign: "center", opacity: 0.85 }}>
              System developed by Lord Wilhelm (0593410452)
            </p>
          </div>
        )}

        <button
          type="button"
          onClick={() => setSummaryOpen((open) => !open)}
          style={{
            border: "none",
            borderRadius: "999px",
            padding: "13px 18px",
            background: COLORS.secondary,
            color: COLORS.white,
            fontWeight: "bold",
            boxShadow: "0 10px 24px rgba(0,0,0,0.24)",
            cursor: "pointer",
          }}
        >
          Summary
        </button>
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
