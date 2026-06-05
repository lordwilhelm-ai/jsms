"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { notifyFeedingMoneyReceived } from "@/lib/jsmsNotify";

type TeacherRow = Record<string, any>;
type StudentRow = Record<string, any>;
type ClassRow = Record<string, any>;
type EntryRow = Record<string, any>;
type ReceivedRow = Record<string, any>;
type SettingsRow = Record<string, any>;
type ClosureRow = Record<string, any>;
type AssignmentRow = Record<string, any>;

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

function getTeacherId(row: TeacherRow) {
  return String(row.teacher_id || row.teacherId || row.staff_id || row.id || row.auth_user_id || "").trim();
}

function getClassName(row: Record<string, any>) {
  return String(row.class_name || row.className || row.name || "").trim();
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

function normalizeKey(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function uniqueClean(values: unknown[]) {
  return Array.from(
    new Set(
      values
        .map((value) => String(value || "").trim())
        .filter(Boolean)
    )
  );
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

function isCreditFeedingEntry(row: EntryRow) {
  return Boolean(
    row.admin_override_ate_without_pay ??
      row.ate_without_pay ??
      row.ate_without_paying ??
      row.ate_on_credit ??
      row.ateOnCredit ??
      row.credit_eating ??
      row.creditEating ??
      false
  );
}

function getCreditOwedAmount(row: EntryRow, feedingFee: number) {
  const savedCreditAmount = Number(
    row.credit_amount ??
      row.creditAmount ??
      row.amount_owed ??
      row.amountOwed ??
      0
  );

  if (savedCreditAmount > 0) return savedCreditAmount;

  const amountPaidToday = Number(row.amount_paid_today || row.amountPaidToday || 0);
  const mealFee = Number(feedingFee || 0);

  return Math.max(mealFee - amountPaidToday, 0);
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

function toDateOnly(value: unknown) {
  if (!value) return "";

  const raw = String(value).trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return "";

  return date.toISOString().split("T")[0];
}

function isHoliday(date: string, closures: ClosureRow[]) {
  return closures.some((row) => {
    if (!Boolean(row.active ?? true)) return false;

    const singleDate = toDateOnly(row.date || row.holiday_date || row.holidayDate);
    if (singleDate && singleDate === date) return true;

    const start = toDateOnly(row.start_date || row.startDate || row.date);
    const end = toDateOnly(row.end_date || row.endDate || row.date);

    if (!start || !end) return false;

    return date >= start && date <= end;
  });
}

async function sendFeedingAdminPush(params: {
  title: string;
  message: string;
  type: string;
  className?: string;
  amount?: number;
  date: string;
}) {
  await supabase.functions.invoke("send-jsms-push", {
    body: {
      title: params.title,
      body: params.message,
      message: params.message,
      module: "feeding",
      type: params.type,
      recipient_roles: ["owner", "admin", "headmaster"],
      recipients: [
        { role: "owner" },
        { role: "admin" },
        { role: "headmaster" },
      ],
      data: {
        class_name: params.className || "",
        amount: params.amount || 0,
        date: params.date,
        url: "/feeding/admin",
      },
    },
  });
}

function getTeacherMatchKeys(row: TeacherRow) {
  return [
    row.id,
    row.teacher_id,
    row.teacherId,
    row.staff_id,
    row.auth_user_id,
    row.email,
    row.phone,
    row.username,
  ]
    .map((value) => String(value || "").trim())
    .filter(Boolean);
}

function getClassMatchKeys(row: ClassRow | null, className: string) {
  return [
    row?.id,
    row?.class_id,
    row?.classId,
    row?.uuid,
    row?.name,
    row?.class_name,
    row?.className,
    className,
  ]
    .map((value) => normalizeKey(value))
    .filter(Boolean);
}

function assignmentMatchesClass(assignment: AssignmentRow, classKeys: Set<string>) {
  const nestedClass = assignment.classes || assignment.class || assignment.classRow || {};

  const assignmentClassValues = [
    assignment.class_id,
    assignment.classId,
    assignment.class_uuid,
    assignment.classUuid,
    assignment.class_name,
    assignment.className,
    assignment.name,
    nestedClass.id,
    nestedClass.class_id,
    nestedClass.classId,
    nestedClass.uuid,
    nestedClass.name,
    nestedClass.class_name,
    nestedClass.className,
  ]
    .map((value) => normalizeKey(value))
    .filter(Boolean);

  return assignmentClassValues.some((value) => classKeys.has(value));
}

function assignmentMatchesTeacher(assignment: AssignmentRow, teacherKeys: Set<string>) {
  const nestedTeacher = assignment.teachers || assignment.teacher || assignment.teacherRow || {};

  const assignmentTeacherValues = [
    assignment.teacher_id,
    assignment.teacherId,
    assignment.teacher_uuid,
    assignment.teacherUuid,
    assignment.staff_id,
    assignment.staffId,
    assignment.email,
    assignment.phone,
    assignment.username,
    nestedTeacher.id,
    nestedTeacher.teacher_id,
    nestedTeacher.teacherId,
    nestedTeacher.staff_id,
    nestedTeacher.staffId,
    nestedTeacher.auth_user_id,
    nestedTeacher.email,
    nestedTeacher.phone,
    nestedTeacher.username,
  ]
    .map((value) => normalizeKey(value))
    .filter(Boolean);

  return assignmentTeacherValues.some((value) => teacherKeys.has(value));
}

function getClassTeachersForClass(
  classRow: ClassRow | null,
  className: string,
  teachers: TeacherRow[],
  assignments: AssignmentRow[]
) {
  const classKeys = new Set(getClassMatchKeys(classRow, className));

  return teachers.filter((teacher) => {
    if (!isTeacherActive(teacher)) return false;

    const assignedClasses = getAssignedClasses(teacher);

    if (assignedClasses.some((assignedClass) => classKeys.has(normalizeKey(assignedClass)))) {
      return true;
    }

    const teacherKeys = new Set(getTeacherMatchKeys(teacher).map((value) => normalizeKey(value)));

    return assignments.some(
      (assignment) =>
        assignmentMatchesClass(assignment, classKeys) &&
        assignmentMatchesTeacher(assignment, teacherKeys)
    );
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
  const [assignments, setAssignments] = useState<AssignmentRow[]>([]);

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
        feedingHolidaysRes,
        ghanaHolidaysRes,
        assignmentsRes,
      ] = await Promise.all([
        supabase.from("classes").select("*").order("class_order", { ascending: true }),
        supabase.from("active_students").select("*"),
        supabase.from("teachers").select("*"),
        supabase.from("daily_entries").select("*").eq("date", today),
        supabase.from("received_money").select("*").eq("date", today),
        supabase.from("school_settings").select("*").limit(1).maybeSingle(),
        supabase.from("school_closures").select("*").order("start_date", { ascending: true }),
        supabase.from("feeding_holidays").select("*"),
        supabase.from("ghana_public_holidays").select("*"),
        supabase.from("teacher_class_assignments").select("*"),
      ]);

      setClasses(classesRes.data || []);
      setStudents(studentsRes.data || []);
      setTeachers(teachersRes.data || []);
      setTodayEntries(entriesRes.data || []);
      setReceivedRecords(receivedRes.data || []);
      setSettingsRow(settingsRes.data || null);
      setClosures([
        ...(closuresRes.data || []),
        ...(!feedingHolidaysRes.error ? feedingHolidaysRes.data || [] : []),
        ...(!ghanaHolidaysRes.error ? ghanaHolidaysRes.data || [] : []),
      ]);
      setAssignments(!assignmentsRes.error ? assignmentsRes.data || [] : []);
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

      const classRow =
        classes.find((item) => getClassName(item) === className) || null;

      const classTeachers = getClassTeachersForClass(
        classRow,
        className,
        teachers,
        assignments
      );

      await Promise.all(
        classTeachers.map((teacher) =>
          notifyFeedingMoneyReceived({
            teacherId: getTeacherId(teacher),
            teacherName: getTeacherName(teacher),
            className,
            amount: amountReceived,
            date: today,
          }).catch((notifyError) => {
            console.error("Feeding received notification failed:", notifyError);
          })
        )
      );

      try {
        await sendFeedingAdminPush({
          title: "Feeding money received",
          message: `${className} feeding money has been marked as received. Amount: GHS ${amountReceived}.`,
          type: "feeding_money_received",
          className,
          amount: amountReceived,
          date: today,
        });
      } catch (pushError) {
        console.error("Feeding admin received push failed:", pushError);
      }

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

      try {
        await sendFeedingAdminPush({
          title: "Report attendance synced",
          message: `Feeding attendance has been synced to report card for ${currentTerm}. School days: ${schoolDays.length}.`,
          type: "feeding_attendance_synced",
          date: today,
        });
      } catch (pushError) {
        console.error("Attendance sync push failed:", pushError);
      }

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

    const creditRows = todayEntries.filter((entry) => isCreditFeedingEntry(entry));
    const ateOnCredit = creditRows.length;
    const creditOwed = creditRows.reduce(
      (sum, entry) => sum + getCreditOwedAmount(entry, feedingFee),
      0
    );

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
      ateOnCredit,
      creditOwed,
      studentsOwing,
      studentsAdvance,
      classesSubmitted,
    };
  }, [todayEntries, receivedRecords, feedingFee]);

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
      const classTeachers = getClassTeachersForClass(
        classRow,
        className,
        teachers,
        assignments
      );

      const money = classEntries.reduce(
        (sum, entry) => sum + Number(entry.amount_paid_today || entry.amountPaidToday || 0),
        0
      );

      const received = receivedRecords.find((item) => getClassName(item) === className);
      const classCreditRows = classEntries.filter((entry) => isCreditFeedingEntry(entry));
      const creditOwed = classCreditRows.reduce(
        (sum, entry) => sum + getCreditOwedAmount(entry, feedingFee),
        0
      );

      const entryTeacherNames = uniqueClean(
        classEntries.map(
          (entry) =>
            entry.entered_by_name ||
            entry.enteredByName ||
            entry.teacher_name ||
            entry.teacherName ||
            entry.entered_by ||
            entry.enteredBy
        )
      );

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
        ateOnCredit: classCreditRows.length,
        creditOwed,
        money,
        submitted: classEntries.length > 0,
        teacherNames:
          classTeachers.length > 0
            ? classTeachers.map((teacher) => getTeacherName(teacher)).join(", ")
            : entryTeacherNames.length > 0
              ? entryTeacherNames.join(", ")
              : "Not Assigned",
        received: Boolean(received),
      };
    });
  }, [classes, students, todayEntries, teachers, receivedRecords, assignments, feedingFee]);

  const eatingRows = useMemo(() => {
    return todayEntries.filter((entry) => Boolean(entry.ate_today ?? entry.ateToday));
  }, [todayEntries]);

  const absentRows = useMemo(() => {
    return todayEntries.filter(
      (entry) => String(entry.attendance || "").toLowerCase() === "absent"
    );
  }, [todayEntries]);

  const creditRows = useMemo(() => {
    return todayEntries.filter((entry) => isCreditFeedingEntry(entry));
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
      href: "/feeding/admin/reports",
    },
    {
      title: "Money Received",
      value: `GHS ${dashboardSummary.moneyReceived}`,
      note: "Collected by admin",
      href: "/feeding/admin",
    },
    {
      title: "Eating Today",
      value: dashboardSummary.eatingToday,
      note: "Students eating",
      href: "/feeding/admin/reports",
    },
    {
      title: "Ate On Credit",
      value: dashboardSummary.ateOnCredit,
      note: "Teacher credit ticks",
      href: "/feeding/admin/reports?status=credit",
    },
    {
      title: "Credit Owed",
      value: `GHS ${dashboardSummary.creditOwed}`,
      note: "Amount owed from credit meals",
      href: "/feeding/admin/debtors",
    },
    {
      title: "Absent Today",
      value: dashboardSummary.absentToday,
      note: "Absent count",
      href: "/feeding/admin/reports?status=absent",
    },
    {
      title: "Students Owing",
      value: dashboardSummary.studentsOwing,
      note: "Balances below zero",
      href: "/feeding/admin/debtors",
    },
    {
      title: "Students Advance",
      value: dashboardSummary.studentsAdvance,
      note: "Positive balances",
      href: "/feeding/admin/student-ledger",
    },
    {
      title: "Total Students",
      value: students.length,
      note: "Active student records",
      href: "/students",
    },
    {
      title: "Active Teachers",
      value: activeTeachersCount,
      note: "Teachers in system",
      href: "/teachers",
    },
    {
      title: "Active Classes",
      value: classSummary.length,
      note: "Feeding class summary",
      href: "/feeding/admin/fill-class",
    },
    {
      title: "School Days This Term",
      value: totalSchoolDays,
      note: `${currentTerm} attendance base`,
      href: "/feeding/admin/reports",
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
            gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
            gap: "12px",
            marginBottom: "18px",
          }}
        >
          {summaryCards.map((card) => (
            <Link
              key={card.title}
              href={card.href}
              style={{ color: "inherit", textDecoration: "none" }}
            >
              <div
                style={{
                  background: COLORS.white,
                  borderRadius: "14px",
                  padding: "12px",
                  minHeight: "118px",
                  boxShadow: "0 6px 16px rgba(0,0,0,0.05)",
                  borderTop: `4px solid ${COLORS.primary}`,
                  cursor: "pointer",
                  transition: "transform 0.18s ease, box-shadow 0.18s ease",
                }}
                onMouseEnter={(event) => {
                  event.currentTarget.style.transform = "translateY(-4px)";
                  event.currentTarget.style.boxShadow = "0 10px 22px rgba(0,0,0,0.10)";
                }}
                onMouseLeave={(event) => {
                  event.currentTarget.style.transform = "translateY(0)";
                  event.currentTarget.style.boxShadow = "0 6px 16px rgba(0,0,0,0.05)";
                }}
              >
                <p style={{ margin: 0, fontSize: "13px", color: COLORS.muted }}>{card.title}</p>
                <h2
                  style={{
                    margin: "6px 0 5px",
                    color: COLORS.secondary,
                    fontSize: "23px",
                  }}
                >
                  {card.value}
                </h2>
                <p style={{ margin: 0, fontSize: "12px", color: "#777" }}>{card.note}</p>
              </div>
            </Link>
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
                    <th style={thStyle}>Ate Credit</th>
                    <th style={thStyle}>Credit Owed</th>
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
                      <td style={tdStyle}>{row.ateOnCredit}</td>
                      <td style={tdStyle}>GHS {row.creditOwed}</td>
                      <td style={tdStyle}>GHS {row.money}</td>
                      <td style={tdStyle}>{row.submitted ? "Yes" : "No"}</td>
                      <td style={tdStyle}>{row.received ? "Yes" : "No"}</td>
                      <td style={tdStyle}>
                        {!row.submitted ? (
                          <span style={{ color: COLORS.muted, fontWeight: 700 }}>
                            Not submitted
                          </span>
                        ) : (
                          <button
                            onClick={() =>
                              markClassAsReceived(row.className, row.money, row.teacherNames)
                            }
                            disabled={row.received || receivingClass === row.className}
                            style={{
                              ...receiveButtonStyle,
                              opacity: row.received ? 0.6 : 1,
                            }}
                          >
                            {row.received
                              ? "Received"
                              : receivingClass === row.className
                                ? "Saving..."
                                : "Mark Received"}
                          </button>
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
            display: "grid",
            gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
            gap: "20px",
            marginBottom: "24px",
          }}
        >
          <DashboardSection
            title="Eating Today"
            loading={loading}
            emptyText="No eating records today."
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
            title="Ate On Credit"
            loading={loading}
            emptyText="No credit feeding records today."
            headers={["Student", "ID", "Class", "Teacher", "Credit Owed"]}
            rows={creditRows.slice(0, 8).map((row: any) => [
              String(row.student_name || row.studentName || "-"),
              String(row.student_id || row.studentId || "-"),
              getClassName(row),
              String(row.assigned_teacher_name || row.assignedTeacherName || "-"),
              `GHS ${getCreditOwedAmount(row, feedingFee)}`,
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

function topButtonStyle(): CSSProperties {
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

const quickLinkStyle: CSSProperties = {
  textDecoration: "none",
  background: COLORS.primary,
  color: COLORS.secondary,
  padding: "12px 14px",
  borderRadius: "10px",
  fontWeight: "bold",
};

const tableStyle: CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: "14px",
};

const thStyle: CSSProperties = {
  textAlign: "left",
  padding: "12px",
  borderBottom: "1px solid #e5e7eb",
};

const tdStyle: CSSProperties = {
  padding: "12px",
  borderBottom: "1px solid #f0f0f0",
};

const receiveButtonStyle: CSSProperties = {
  background: COLORS.primary,
  color: COLORS.secondary,
  border: "none",
  borderRadius: "10px",
  padding: "10px 12px",
  fontWeight: "bold",
  cursor: "pointer",
  whiteSpace: "nowrap",
};
