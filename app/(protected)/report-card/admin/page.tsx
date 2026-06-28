"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  FiBookOpen,
  FiCreditCard,
  FiFileText,
  FiGrid,
  FiHome,
  FiMessageSquare,
  FiRefreshCw,
  FiSettings,
  FiUsers,
  FiUserCheck,
  FiX,
} from "react-icons/fi";
import { supabase } from "@/lib/supabase";
import { useReportCardAccess } from "@/hooks/useReportCardAccess";

function AdminPaymentGate({
  amountDue,
  onClose,
  onPayNow,
}: {
  amountDue?: number;
  onClose: () => void;
  onPayNow: () => void;
}) {
  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/40">
      <div className="relative max-w-md rounded-xl bg-white p-6 text-center shadow-lg">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 text-slate-400 hover:text-slate-600"
        >
          <FiX size={20} />
        </button>
        <h3 className="text-lg font-black text-slate-900">Payment Required</h3>
        <p className="mt-3 text-sm text-slate-600">
          Please settle the report-card fee to enable access to this feature.
        </p>
        {amountDue !== undefined && (
          <p className="mt-4 text-xl font-black text-emerald-700">{formatMoney(amountDue)}</p>
        )}
        <button
          type="button"
          onClick={onPayNow}
          className="mt-6 w-full rounded-xl bg-sky-600 px-4 py-3 text-sm font-black text-white hover:bg-sky-700 transition"
        >
          Pay Now
        </button>
      </div>
    </div>
  );
}

const CLASS_ORDER = [
  "Playroom 1", "Playroom 2", "KG 1", "KG 2",
  "Class 1", "Class 2", "Class 3", "Class 4", "Class 5", "Class 6",
  "JHS 1", "JHS 2", "JHS 3",
];

const QUICK_ACTIONS = [
  { title: "Students", subtitle: "Open main JSMS students", icon: FiUsers, path: "/students", gated: false },
  { title: "Teachers", subtitle: "Open main JSMS teachers", icon: FiUserCheck, path: "/teachers", gated: false },
  { title: "Classes", subtitle: "Open main JSMS classes", icon: FiBookOpen, path: "/classes", gated: false },
  { title: "Report Cards", subtitle: "Preview and print reports", icon: FiFileText, path: "/report-card/admin/reports", gated: true },
  { title: "Bills", subtitle: "Report-card payment area", icon: FiCreditCard, path: "/report-card/admin/billing", gated: false },
  { title: "Send Messages", subtitle: "Open JSMS messages", icon: FiMessageSquare, path: "/dashboard/admin", gated: false },
  { title: "Settings", subtitle: "Open main JSMS settings", icon: FiSettings, path: "/settings", gated: false },
  { title: "JSMS Dashboard", subtitle: "Back to main admin", icon: FiGrid, path: "/dashboard/admin", gated: false },
];

type StudentRow = {
  id: string;
  student_id?: string | null;
  jvs_id?: string | null;
  class_name?: string | null;
  is_active?: boolean | null;
  active?: boolean | null;
  left_school?: boolean | null;
  status?: string | null;
};

type TeacherRow = { id: string; full_name?: string | null; role?: string | null };
type ClassRow = { id: string; name?: string | null; class_name?: string | null; class_order?: number | null };
type SettingsRow = { school_name?: string | null; current_academic_year?: string | null; academic_year?: string | null; current_term?: string | null };
type ScoreRow = { student_id?: string | null; class_name?: string | null; subject_name?: string | null; academic_year?: string | null; term?: string | null };
type AttendanceRow = { student_id?: string | null; class_name?: string | null; academic_year?: string | null; term?: string | null };
type RemarkRow = { student_id?: string | null; class_name?: string | null; academic_year?: string | null; term?: string | null };
type AssignmentRow = { teacher_id?: string | null; class_id?: string | null };

function cleanText(value: unknown) { return String(value || "").trim(); }
function cleanLower(value: unknown) { return cleanText(value).toLowerCase(); }
function getAcademicYear(settings: SettingsRow | null) { return cleanText(settings?.current_academic_year || settings?.academic_year); }
function getClassName(row: ClassRow) { return cleanText(row.class_name || row.name); }
function getStudentReportId(student: StudentRow) { return cleanText(student.student_id || student.jvs_id || student.id); }

function isActiveStudent(student: StudentRow) {
  const status = cleanLower(student.status);
  if (student.left_school === true) return false;
  if (student.is_active === false) return false;
  if (student.active === false) return false;
  if (status === "inactive" || status === "left" || status === "withdrawn") return false;
  return true;
}

function getClassOrder(className: string, classes: ClassRow[]) {
  const found = classes.find((item) => getClassName(item) === className);
  if (found?.class_order !== null && found?.class_order !== undefined) return Number(found.class_order);
  const fallback = CLASS_ORDER.indexOf(className);
  return fallback === -1 ? 999 : fallback;
}

function formatMoney(value: number) { return `₵${value.toFixed(2)}`; }

export default function ReportCardAdminDashboardPage() {
  const router = useRouter();
  const access = useReportCardAccess();

  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<SettingsRow | null>(null);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [teachers, setTeachers] = useState<TeacherRow[]>([]);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [scores, setScores] = useState<ScoreRow[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRow[]>([]);
  const [remarks, setRemarks] = useState<RemarkRow[]>([]);
  const [assignments, setAssignments] = useState<AssignmentRow[]>([]);
  const [showGate, setShowGate] = useState(false);

  const academicYear = getAcademicYear(settings);
  const currentTerm = cleanText(settings?.current_term);
  const schoolName = cleanText(settings?.school_name) || "Jefsem Vision School";

  async function loadDashboardData() {
    setLoading(true);
    const [
      settingsRes, studentsRes, teachersRes, classesRes,
      scoresRes, attendanceRes, remarksRes, assignmentsRes,
    ] = await Promise.all([
      supabase.from("school_settings").select("school_name,current_academic_year,academic_year,current_term").order("updated_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("students").select("id,student_id,jvs_id,class_name,is_active,active,left_school,status"),
      supabase.from("teachers").select("id,full_name,role"),
      supabase.from("classes").select("id,name,class_name,class_order").order("class_order", { ascending: true }),
      supabase.from("jsms_report_scores").select("student_id,class_name,subject_name,academic_year,term"),
      supabase.from("jsms_report_attendance").select("student_id,class_name,academic_year,term"),
      supabase.from("jsms_report_cards").select("student_id,class_name,academic_year,term"),
      supabase.from("teacher_class_assignments").select("teacher_id,class_id"),
    ]);

    if (!settingsRes.error) setSettings(settingsRes.data || null);
    if (!studentsRes.error) setStudents((studentsRes.data || []).filter(isActiveStudent));
    if (!teachersRes.error) setTeachers(teachersRes.data || []);
    if (!classesRes.error) setClasses(classesRes.data || []);
    if (!scoresRes.error) setScores(scoresRes.data || []);
    if (!attendanceRes.error) setAttendance(attendanceRes.data || []);
    if (!remarksRes.error) setRemarks(remarksRes.data || []);
    if (!assignmentsRes.error) setAssignments(assignmentsRes.data || []);
    setLoading(false);
  }

  useEffect(() => { loadDashboardData(); }, []);

  const currentScores = useMemo(() => scores.filter((row) => cleanText(row.academic_year) === academicYear && cleanText(row.term) === currentTerm), [scores, academicYear, currentTerm]);
  const currentAttendance = useMemo(() => attendance.filter((row) => cleanText(row.academic_year) === academicYear && cleanText(row.term) === currentTerm), [attendance, academicYear, currentTerm]);
  const currentRemarks = useMemo(() => remarks.filter((row) => cleanText(row.academic_year) === academicYear && cleanText(row.term) === currentTerm), [remarks, academicYear, currentTerm]);

  const classNames = useMemo(() => {
    const fromClasses = classes.map(getClassName).filter(Boolean);
    const fromStudents = students.map((s) => cleanText(s.class_name)).filter(Boolean);
    return Array.from(new Set([...fromClasses, ...fromStudents])).sort((a, b) => getClassOrder(a, classes) - getClassOrder(b, classes));
  }, [classes, students]);

  const teacherById = useMemo(() => { const map = new Map<string, TeacherRow>(); teachers.forEach((t) => map.set(t.id, t)); return map; }, [teachers]);
  const classIdToName = useMemo(() => { const map = new Map<string, string>(); classes.forEach((c) => map.set(c.id, getClassName(c))); return map; }, [classes]);

  const classTeacherMap = useMemo(() => {
    const map = new Map<string, string[]>();
    assignments.forEach((a) => {
      const className = classIdToName.get(cleanText(a.class_id));
      const teacher = teacherById.get(cleanText(a.teacher_id));
      const teacherName = cleanText(teacher?.full_name);
      if (!className || !teacherName) return;
      if (!map.has(className)) map.set(className, []);
      map.get(className)?.push(teacherName);
    });
    return map;
  }, [assignments, classIdToName, teacherById]);

  const classOverview = useMemo(() => classNames.map((className) => {
    const classStudents = students.filter((s) => s.class_name === className);
    const scoreSet = new Set(currentScores.filter((r) => r.class_name === className).map((r) => cleanText(r.student_id)).filter(Boolean));
    const attendSet = new Set(currentAttendance.filter((r) => r.class_name === className).map((r) => cleanText(r.student_id)).filter(Boolean));
    const remarkSet = new Set(currentRemarks.filter((r) => r.class_name === className).map((r) => cleanText(r.student_id)).filter(Boolean));
    let readyCount = 0;
    classStudents.forEach((s) => { const id = getStudentReportId(s); if (scoreSet.has(id) && attendSet.has(id) && remarkSet.has(id)) readyCount += 1; });
    const teacherNames = classTeacherMap.get(className) || [];
    return { className, teacher: teacherNames.join(", ") || "Not assigned", totalStudents: classStudents.length, readyCount };
  }), [classNames, students, currentScores, currentAttendance, currentRemarks, classTeacherMap]);

  const reportsReady = useMemo(() => classOverview.reduce((sum, item) => sum + item.readyCount, 0), [classOverview]);
  const teacherCount = useMemo(() => teachers.filter((t) => cleanLower(t.role) === "teacher").length, [teachers]);
  const amountDue = students.length * 2;

  function navigate(path: string, gated?: boolean) {
    if (gated && !access.canAccess && !access.checking) {
      setShowGate(true);
      return;
    }
    router.push(path);
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">

      {/* Payment gate — only shows when user clicked something gated */}
      {showGate && (
        <AdminPaymentGate
          amountDue={access.amountDue}
          onClose={() => setShowGate(false)}
          onPayNow={() => { setShowGate(false); router.push("/report-card/admin/checkout"); }}
        />
      )}

      {/* Sidebar */}
      <aside className="fixed left-0 top-0 z-20 hidden h-screen w-[275px] border-r border-slate-200 bg-white lg:block">
        <div className="flex h-[92px] items-center gap-3 border-b border-slate-200 px-6">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-sky-100 text-sm font-black text-sky-700">JVS</div>
          <div>
            <h2 className="text-lg font-black leading-tight text-slate-900">{schoolName}</h2>
            <p className="text-sm text-slate-500">Admin Portal</p>
          </div>
        </div>

        <nav className="space-y-2 px-4 py-5">
          <button type="button" onClick={() => router.push("/report-card/admin")} className="flex w-full items-center gap-3 rounded-2xl bg-sky-500 px-4 py-4 text-left text-sm font-bold text-white">
            <FiHome size={19} />
            Dashboard
          </button>
          {QUICK_ACTIONS.map((item) => {
            const Icon = item.icon;
            return (
              <button key={item.title} type="button" onClick={() => navigate(item.path, item.gated)} className="flex w-full items-center gap-3 rounded-2xl px-4 py-4 text-left text-sm font-bold text-slate-700 transition hover:bg-sky-50 hover:text-sky-700">
                <Icon size={19} />
                {item.title}
              </button>
            );
          })}
        </nav>

        <div className="absolute bottom-5 left-4 right-4 rounded-2xl bg-slate-50 p-4">
          <p className="text-sm font-bold text-slate-600">JVS Report Card System</p>
          {!access.checking && access.canAccess ? (
            <p className="mt-2 text-sm font-black text-emerald-600">Access Active</p>
          ) : (
            <p className="mt-2 text-sm font-black text-rose-500">Payment Required</p>
          )}
        </div>
      </aside>

      {/* Main content */}
      <main className="lg:ml-[275px]">
        <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-5 py-5 backdrop-blur">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-black text-slate-900">Admin Dashboard</h1>
              <p className="mt-1 text-sm text-slate-500">Manage students, teachers, classes, report cards, bills, messages and settings</p>
            </div>
            <div className="text-left sm:text-right">
              <p className="font-bold text-slate-900">Admin</p>
              <p className="text-sm text-slate-500">{schoolName}</p>
            </div>
          </div>
        </header>

        <div className="space-y-6 p-5 md:p-8">
          {/* Welcome */}
          <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-2xl font-black text-slate-900">Welcome to {schoolName}</h2>
            <p className="mt-3 text-slate-500">Manage students, teachers, classes, report cards and billing from one place.</p>
            <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
              <span className="rounded-full bg-sky-50 px-3 py-2 font-bold text-sky-700">{academicYear || "Academic Year"}</span>
              <span className="rounded-full bg-emerald-50 px-3 py-2 font-bold text-emerald-700">{currentTerm || "Current Term"}</span>
              <button type="button" onClick={loadDashboardData} className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-2 font-bold text-slate-700 hover:bg-slate-200">
                <FiRefreshCw size={15} />
                Refresh
              </button>
            </div>
          </section>

          {/* Stats */}
          <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            {[
              { label: "Total Students", value: loading ? "..." : students.length, sub: "Active students only" },
              { label: "Total Teachers", value: loading ? "..." : teacherCount, sub: "Teachers added" },
              { label: "Reports Ready", value: loading ? "..." : reportsReady, sub: "Fully ready report cards" },
              { label: "Amount Due", value: loading ? "..." : formatMoney(amountDue), sub: "Active students × ₵2" },
            ].map((stat) => (
              <div key={stat.label} className="rounded-[24px] border border-slate-200 bg-white p-6 shadow-sm">
                <p className="text-sm font-bold text-slate-500">{stat.label}</p>
                <h3 className="mt-4 text-4xl font-black tracking-[0.2em] text-slate-900">{stat.value}</h3>
                <p className="mt-3 text-sm text-slate-400">{stat.sub}</p>
              </div>
            ))}
          </section>

          {/* Quick actions */}
          <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-5">
              <h2 className="text-xl font-black text-slate-900">Quick Actions</h2>
              <p className="mt-2 text-sm text-slate-500">Open the main areas of the report-card module.</p>
            </div>
            <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
              {QUICK_ACTIONS.map((item) => {
                const Icon = item.icon;
                const locked = item.gated && !access.canAccess && !access.checking;
                return (
                  <button key={item.title} type="button" onClick={() => navigate(item.path, item.gated)} className={`relative rounded-[22px] border border-slate-200 bg-slate-50 p-4 text-left transition hover:-translate-y-0.5 hover:bg-sky-50 hover:shadow-sm ${locked ? "opacity-60" : ""}`}>
                    {locked && <span className="absolute right-3 top-3 rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-black text-rose-600">Locked</span>}
                    <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-sky-600 shadow-sm"><Icon size={22} /></div>
                    <h3 className="font-black text-slate-900">{item.title}</h3>
                    <p className="mt-2 text-sm leading-5 text-slate-500">{item.subtitle}</p>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Class overview */}
          <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-5">
              <h2 className="text-xl font-black text-slate-900">Class Overview</h2>
              <p className="mt-2 text-sm text-slate-500">Student count, class teacher and report readiness by class</p>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3">
              {classOverview.map((item) => (
                <div key={item.className} className="rounded-[20px] border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-lg font-black text-slate-900">{item.className}</h3>
                      <p className="mt-2 text-sm text-slate-500">Class Teacher: {item.teacher}</p>
                    </div>
                    <span className="rounded-full bg-sky-100 px-3 py-2 text-xs font-black text-sky-700">{item.readyCount} Ready</span>
                  </div>
                  <div className="mt-5 grid grid-cols-2 gap-3">
                    <div className="rounded-2xl border border-slate-200 bg-white p-4">
                      <p className="text-sm text-slate-500">Students</p>
                      <p className="mt-3 text-2xl font-black text-slate-900">{loading ? "..." : item.totalStudents}</p>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-white p-4">
                      <p className="text-sm text-slate-500">Reports</p>
                      <p className="mt-3 text-2xl font-black text-slate-900">{loading ? "..." : item.readyCount}</p>
                    </div>
                  </div>
                </div>
              ))}
              {classOverview.length === 0 && (
                <div className="rounded-2xl border border-dashed border-slate-300 p-6 text-sm font-semibold text-slate-500">No class data found.</div>
              )}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
