"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  FiArrowLeft,
  FiBarChart2,
  FiBookOpen,
  FiClipboard,
  FiEdit3,
  FiFileText,
  FiGrid,
  FiRefreshCw,
  FiUsers,
} from "react-icons/fi";
import { supabase } from "@/lib/supabase";

const CLASS_OPTIONS = [
  "Playroom 1",
  "Playroom 2",
  "KG 1",
  "KG 2",
  "Class 1",
  "Class 2",
  "Class 3",
  "Class 4",
  "Class 5",
  "Class 6",
  "JHS 1",
  "JHS 2",
  "JHS 3",
];

type StudentRow = {
  id: string;
  student_id?: string | null;
  jvs_id?: string | null;
  full_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  class_name?: string | null;
  is_active?: boolean | null;
  active?: boolean | null;
  left_school?: boolean | null;
};

type TeacherRow = {
  id: string;
  teacher_id?: string | null;
  full_name?: string | null;
  role?: string | null;
};

type ClassRow = {
  id: string;
  name?: string | null;
  class_name?: string | null;
  class_order?: number | null;
};

type ScoreRow = {
  student_id?: string | null;
  class_name?: string | null;
  subject_name?: string | null;
  academic_year?: string | null;
  term?: string | null;
  total_score?: number | string | null;
  grade?: string | null;
  playroom_mark?: string | null;
};

type ReportCardRow = {
  student_id?: string | null;
  class_name?: string | null;
  academic_year?: string | null;
  term?: string | null;
};

type AttendanceRow = {
  student_id?: string | null;
  class_name?: string | null;
  academic_year?: string | null;
  term?: string | null;
  days_present?: number | null;
  attendance_present?: number | null;
};

type SettingsRow = {
  school_name?: string | null;
  current_academic_year?: string | null;
  academic_year?: string | null;
  current_term?: string | null;
  term_begins?: string | null;
  term_ends?: string | null;
};

type ClassOverviewRow = {
  className: string;
  students: number;
  teacher: string;
  resultEntries: number;
  attendanceEntries: number;
  remarkEntries: number;
  readyReports: number;
};

function cleanText(value: unknown) {
  return String(value || "").trim();
}

function cleanLower(value: unknown) {
  return cleanText(value).toLowerCase();
}

function getAcademicYear(settings: SettingsRow | null) {
  return cleanText(settings?.current_academic_year || settings?.academic_year);
}

function getClassName(row: ClassRow) {
  return cleanText(row.class_name || row.name);
}

function getStudentReportId(student: StudentRow) {
  return cleanText(student.student_id || student.jvs_id || student.id);
}

function isActiveStudent(student: StudentRow) {
  if (student.left_school === true) return false;
  if (student.is_active === false) return false;
  if (student.active === false) return false;
  return true;
}

function normalizeSubjectName(score: ScoreRow) {
  return cleanLower(score.subject_name);
}

function getClassOrder(className: string, classes: ClassRow[]) {
  const found = classes.find((item) => getClassName(item) === className);
  if (found?.class_order !== null && found?.class_order !== undefined) {
    return Number(found.class_order);
  }

  const fallback = CLASS_OPTIONS.indexOf(className);
  return fallback === -1 ? 999 : fallback;
}

export default function ReportCardAdminDashboardPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<SettingsRow | null>(null);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [teachers, setTeachers] = useState<TeacherRow[]>([]);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [scores, setScores] = useState<ScoreRow[]>([]);
  const [reportCards, setReportCards] = useState<ReportCardRow[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRow[]>([]);
  const [teacherAssignments, setTeacherAssignments] = useState<Record<string, string[]>>({});

  const academicYear = getAcademicYear(settings);
  const currentTerm = cleanText(settings?.current_term);
  const schoolName = cleanText(settings?.school_name) || "JEFSEM VISION SCHOOL";

  async function loadDashboardData() {
    setLoading(true);

    const [
      settingsRes,
      studentsRes,
      teachersRes,
      classesRes,
      scoresRes,
      cardsRes,
      attendanceRes,
      assignmentsRes,
    ] = await Promise.all([
      supabase
        .from("school_settings")
        .select("school_name,current_academic_year,academic_year,current_term,term_begins,term_ends")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("students")
        .select("id,student_id,jvs_id,full_name,first_name,last_name,class_name,is_active,active,left_school"),
      supabase.from("teachers").select("id,teacher_id,full_name,role"),
      supabase.from("classes").select("id,name,class_name,class_order").order("class_order", { ascending: true }),
      supabase.from("jsms_report_scores").select("student_id,class_name,subject_name,academic_year,term,total_score,grade,playroom_mark"),
      supabase.from("jsms_report_cards").select("student_id,class_name,academic_year,term"),
      supabase.from("jsms_report_attendance").select("student_id,class_name,academic_year,term,days_present,attendance_present"),
      supabase.from("teacher_class_assignments").select("teacher_id,class_id"),
    ]);

    if (!settingsRes.error) setSettings(settingsRes.data || null);
    if (!studentsRes.error) setStudents((studentsRes.data || []).filter(isActiveStudent));
    if (!teachersRes.error) setTeachers(teachersRes.data || []);
    if (!classesRes.error) setClasses(classesRes.data || []);
    if (!scoresRes.error) setScores(scoresRes.data || []);
    if (!cardsRes.error) setReportCards(cardsRes.data || []);
    if (!attendanceRes.error) setAttendance(attendanceRes.data || []);

    if (!assignmentsRes.error && assignmentsRes.data && classesRes.data) {
      const classNameById = new Map<string, string>();
      (classesRes.data || []).forEach((cls: ClassRow) => {
        classNameById.set(cls.id, getClassName(cls));
      });

      const assignmentMap: Record<string, string[]> = {};

      (assignmentsRes.data || []).forEach((row: any) => {
        const className = classNameById.get(cleanText(row.class_id));
        const teacherId = cleanText(row.teacher_id);

        if (!className || !teacherId) return;

        if (!assignmentMap[className]) assignmentMap[className] = [];
        assignmentMap[className].push(teacherId);
      });

      setTeacherAssignments(assignmentMap);
    }

    setLoading(false);
  }

  useEffect(() => {
    loadDashboardData();
  }, []);

  const currentScores = useMemo(() => {
    return scores.filter(
      (row) =>
        cleanText(row.academic_year) === academicYear &&
        cleanText(row.term) === currentTerm
    );
  }, [scores, academicYear, currentTerm]);

  const currentCards = useMemo(() => {
    return reportCards.filter(
      (row) =>
        cleanText(row.academic_year) === academicYear &&
        cleanText(row.term) === currentTerm
    );
  }, [reportCards, academicYear, currentTerm]);

  const currentAttendance = useMemo(() => {
    return attendance.filter(
      (row) =>
        cleanText(row.academic_year) === academicYear &&
        cleanText(row.term) === currentTerm
    );
  }, [attendance, academicYear, currentTerm]);

  const classNames = useMemo(() => {
    const fromClasses = classes.map(getClassName).filter(Boolean);
    const fromStudents = students.map((student) => cleanText(student.class_name)).filter(Boolean);

    return Array.from(new Set([...fromClasses, ...fromStudents])).sort(
      (a, b) => getClassOrder(a, classes) - getClassOrder(b, classes)
    );
  }, [classes, students]);

  const classOverview = useMemo<ClassOverviewRow[]>(() => {
    return classNames.map((className) => {
      const classStudents = students.filter((student) => student.class_name === className);
      const classStudentIds = new Set(classStudents.map(getStudentReportId).filter(Boolean));

      const classScores = currentScores.filter((score) => score.class_name === className);
      const classCards = currentCards.filter((row) => row.class_name === className);
      const classAttendance = currentAttendance.filter((row) => row.class_name === className);

      const subjects = Array.from(
        new Set(classScores.map(normalizeSubjectName).filter(Boolean))
      );

      const scoreStudentMap = new Map<string, Set<string>>();

      classScores.forEach((score) => {
        const studentId = cleanText(score.student_id);
        const subjectName = normalizeSubjectName(score);

        if (!studentId || !subjectName) return;

        if (!scoreStudentMap.has(studentId)) {
          scoreStudentMap.set(studentId, new Set<string>());
        }

        scoreStudentMap.get(studentId)?.add(subjectName);
      });

      const remarkStudentSet = new Set(
        classCards.map((row) => cleanText(row.student_id)).filter(Boolean)
      );

      const attendanceStudentSet = new Set(
        classAttendance.map((row) => cleanText(row.student_id)).filter(Boolean)
      );

      let readyReports = 0;

      classStudentIds.forEach((studentId) => {
        const studentSubjects = scoreStudentMap.get(studentId) || new Set<string>();
        const hasResults =
          subjects.length > 0 && subjects.every((subject) => studentSubjects.has(subject));

        const hasAttendance = attendanceStudentSet.has(studentId);
        const hasRemarks = remarkStudentSet.has(studentId);

        if (hasResults && hasAttendance && hasRemarks) {
          readyReports += 1;
        }
      });

      const teacherIds = teacherAssignments[className] || [];
      const classTeachers = teachers.filter((teacher) => teacherIds.includes(teacher.id));
      const teacherName =
        classTeachers.map((teacher) => cleanText(teacher.full_name)).filter(Boolean).join(", ") ||
        "Not assigned";

      return {
        className,
        students: classStudents.length,
        teacher: teacherName,
        resultEntries: classScores.length,
        attendanceEntries: attendanceStudentSet.size,
        remarkEntries: remarkStudentSet.size,
        readyReports,
      };
    });
  }, [
    classNames,
    students,
    currentScores,
    currentCards,
    currentAttendance,
    teacherAssignments,
    teachers,
  ]);

  const reportsReady = useMemo(() => {
    return classOverview.reduce((sum, row) => sum + row.readyReports, 0);
  }, [classOverview]);

  const stats = [
    {
      title: "Total Students",
      value: loading ? "..." : students.length,
      subtext: "Active students only",
      icon: FiUsers,
      soft: "bg-sky-50 text-sky-600",
    },
    {
      title: "Total Teachers",
      value: loading ? "..." : teachers.filter((teacher) => cleanLower(teacher.role) === "teacher").length,
      subtext: "Teacher accounts",
      icon: FiBookOpen,
      soft: "bg-emerald-50 text-emerald-600",
    },
    {
      title: "Reports Ready",
      value: loading ? "..." : reportsReady,
      subtext: "Results + attendance + remarks",
      icon: FiFileText,
      soft: "bg-violet-50 text-violet-600",
    },
    {
      title: "Score Entries",
      value: loading ? "..." : currentScores.length,
      subtext: `${currentTerm || "Current term"} entries`,
      icon: FiBarChart2,
      soft: "bg-amber-50 text-amber-600",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-[28px] border border-sky-100 bg-gradient-to-br from-white via-sky-50 to-emerald-50 p-6 shadow-sm">
        <div className="pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full bg-sky-200/40" />
        <div className="pointer-events-none absolute -bottom-14 left-8 h-36 w-36 rounded-full bg-emerald-200/40" />

        <div className="relative flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-sky-600">
              Report Card Admin
            </p>

            <h1 className="mt-2 text-2xl font-extrabold text-gray-900 md:text-3xl">
              {schoolName}
            </h1>

            <p className="mt-2 text-sm font-semibold text-slate-500">
              {academicYear || "Academic Year"} • {currentTerm || "Current Term"}
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => router.push("/dashboard/admin")}
              className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-black text-white shadow-sm hover:bg-slate-800"
            >
              <FiGrid size={18} />
              JSMS Dashboard
            </button>

            <button
              type="button"
              onClick={loadDashboardData}
              className="inline-flex items-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-black text-sky-700 shadow-sm ring-1 ring-sky-100 hover:bg-sky-50"
            >
              <FiRefreshCw size={18} />
              Refresh
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {stats.map((item) => {
          const Icon = item.icon;

          return (
            <div
              key={item.title}
              className="rounded-[24px] border border-gray-200 bg-white p-5 shadow-sm"
            >
              <div className={`mb-4 flex h-12 w-12 items-center justify-center rounded-2xl ${item.soft}`}>
                <Icon size={22} />
              </div>

              <p className="text-sm font-semibold text-gray-500">{item.title}</p>
              <h2 className="mt-2 text-3xl font-black text-gray-900">{item.value}</h2>
              <p className="mt-2 text-xs font-semibold text-gray-400">{item.subtext}</p>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <button
          type="button"
          onClick={() => router.push("/report-card/admin")}
          className="rounded-[24px] border border-gray-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
        >
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-50 text-sky-600">
            <FiBarChart2 size={22} />
          </div>
          <h3 className="font-bold text-gray-900">Overview</h3>
          <p className="mt-2 text-sm text-gray-500">Report readiness by class</p>
        </button>

        <button
          type="button"
          onClick={() => router.push("/report-card/admin/reports")}
          className="rounded-[24px] border border-gray-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
        >
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-50 text-violet-600">
            <FiFileText size={22} />
          </div>
          <h3 className="font-bold text-gray-900">View Reports</h3>
          <p className="mt-2 text-sm text-gray-500">Preview and print report cards</p>
        </button>

        <button
          type="button"
          onClick={() => router.push("/report-card/admin/attendance")}
          className="rounded-[24px] border border-gray-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
        >
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
            <FiClipboard size={22} />
          </div>
          <h3 className="font-bold text-gray-900">Attendance</h3>
          <p className="mt-2 text-sm text-gray-500">Check saved attendance</p>
        </button>

        <button
          type="button"
          onClick={() => router.push("/report-card")}
          className="rounded-[24px] border border-gray-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
        >
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
            <FiArrowLeft size={22} />
          </div>
          <h3 className="font-bold text-gray-900">Module Entry</h3>
          <p className="mt-2 text-sm text-gray-500">Open report-card redirect page</p>
        </button>
      </div>

      <div className="rounded-[28px] border border-gray-200 bg-white p-5 shadow-sm">
        <div className="mb-4">
          <h2 className="text-lg font-extrabold text-gray-900">Class Overview</h2>
          <p className="mt-1 text-sm text-gray-500">
            Student count, assigned teacher and report readiness by class.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {classOverview.map((item) => (
            <div
              key={item.className}
              className="rounded-3xl border border-gray-200 bg-gray-50 p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-base font-black text-gray-900">
                    {item.className}
                  </h3>
                  <p className="mt-1 text-xs font-semibold text-gray-500">
                    Teacher: {item.teacher}
                  </p>
                </div>

                <span className="rounded-full bg-sky-100 px-3 py-1 text-xs font-black text-sky-700">
                  {item.readyReports} Ready
                </span>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-gray-200 bg-white p-3">
                  <p className="text-xs font-semibold text-gray-500">Students</p>
                  <p className="mt-1 text-xl font-black text-gray-900">
                    {loading ? "..." : item.students}
                  </p>
                </div>

                <div className="rounded-2xl border border-gray-200 bg-white p-3">
                  <p className="text-xs font-semibold text-gray-500">Scores</p>
                  <p className="mt-1 text-xl font-black text-gray-900">
                    {loading ? "..." : item.resultEntries}
                  </p>
                </div>

                <div className="rounded-2xl border border-gray-200 bg-white p-3">
                  <p className="text-xs font-semibold text-gray-500">Attendance</p>
                  <p className="mt-1 text-xl font-black text-gray-900">
                    {loading ? "..." : item.attendanceEntries}
                  </p>
                </div>

                <div className="rounded-2xl border border-gray-200 bg-white p-3">
                  <p className="text-xs font-semibold text-gray-500">Remarks</p>
                  <p className="mt-1 text-xl font-black text-gray-900">
                    {loading ? "..." : item.remarkEntries}
                  </p>
                </div>
              </div>
            </div>
          ))}

          {classOverview.length === 0 && (
            <div className="rounded-2xl border border-dashed border-gray-300 p-6 text-sm font-semibold text-gray-500">
              No class data found.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
