"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  FiUpload,
  FiClipboard,
  FiFileText,
  FiEdit3,
  FiMenu,
  FiX,
  FiGrid,
  FiHome,
  FiLogOut,
} from "react-icons/fi";
import { supabase } from "@/lib/supabase";
import { useReportCardAccess } from "@/hooks/useReportCardAccess";

const cards = [
  { title: "Upload Results", subtitle: "Enter scores and grades", icon: FiUpload, path: "/report-card/teacher/upload-results", color: "from-sky-500 to-blue-600", soft: "bg-sky-50 text-sky-600" },
  { title: "Attendance", subtitle: "Review and edit attendance", icon: FiClipboard, path: "/report-card/teacher/attendance", color: "from-emerald-500 to-green-600", soft: "bg-emerald-50 text-emerald-600" },
  { title: "Remarks", subtitle: "Add conduct and comments", icon: FiEdit3, path: "/report-card/teacher/remarks", color: "from-amber-400 to-orange-500", soft: "bg-amber-50 text-amber-600" },
  { title: "View Reports", subtitle: "Preview report cards", icon: FiFileText, path: "/report-card/teacher/view-reports", color: "from-violet-500 to-purple-600", soft: "bg-violet-50 text-violet-600" },
];

type SchoolSettings = {
  school_name?: string | null;
  current_academic_year?: string | null;
  academic_year?: string | null;
  current_term?: string | null;
  term_begins?: string | null;
  term_ends?: string | null;
};

type TeacherRow = {
  id?: string;
  teacher_id?: string;
  full_name?: string;
  name?: string;
  teacher_name?: string;
  username?: string;
  email?: string;
  role?: string;
};

function formatToday() {
  return new Date().toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short", year: "numeric" });
}

function cleanText(value: unknown) { return String(value || "").trim(); }
function getTeacherName(teacher: TeacherRow | null) { return cleanText(teacher?.full_name || teacher?.teacher_name || teacher?.name || teacher?.username || "Teacher"); }
function getAcademicYear(settings: SchoolSettings | null) { return cleanText(settings?.current_academic_year || settings?.academic_year); }

function toDateText(value: unknown) {
  if (!value) return "";
  const raw = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function TeacherAccessGate({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4">
      <div className="relative w-full max-w-md rounded-[32px] bg-white p-6 text-center shadow-2xl">
        <button type="button" onClick={onClose} className="absolute right-4 top-4 text-slate-400 hover:text-slate-600">
          <FiX size={20} />
        </button>
        <p className="text-sm font-bold uppercase tracking-[0.2em] text-slate-500">Access Restricted</p>
        <h2 className="mt-4 text-2xl font-extrabold text-slate-900">Feature Unavailable</h2>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          This feature is currently unavailable. Please contact your school admin to enable access.
        </p>
      </div>
    </div>
  );
}

export default function ReportCardTeacherDashboardPage() {
  const router = useRouter();
  const access = useReportCardAccess();

  const [menuOpen, setMenuOpen] = useState(false);
  const [settings, setSettings] = useState<SchoolSettings | null>(null);
  const [teacher, setTeacher] = useState<TeacherRow | null>(null);
  const [showGate, setShowGate] = useState(false);

  const today = useMemo(() => formatToday(), []);

  useEffect(() => {
    async function loadData() {
      const { data: { session } } = await supabase.auth.getSession();

      const { data: settingsData } = await supabase
        .from("school_settings")
        .select("school_name,current_academic_year,academic_year,current_term,term_begins,term_ends")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (settingsData) setSettings(settingsData);

      if (session?.user) {
        const { data: teachers } = await supabase.from("teachers").select("*");
        const teacherRow =
          teachers?.find((item: any) => item.auth_user_id === session.user.id) ||
          teachers?.find((item: any) => cleanText(item.email).toLowerCase() === cleanText(session.user.email).toLowerCase()) ||
          null;
        if (teacherRow) setTeacher(teacherRow);
      }
    }
    loadData();
  }, []);

  function handleLogout() {
    try {
      ["jvs_user", "teacher", "jsms_user", "currentUser", "loggedInUser", "sessionUser"].forEach((k) => localStorage.removeItem(k));
    } catch { /* ignore */ }
    router.push("/");
  }

  function navigate(path: string) {
    if (!access.canAccess && !access.checking) {
      setShowGate(true);
      return;
    }
    router.push(path);
  }

  const schoolName = cleanText(settings?.school_name) || "JEFSEM VISION SCHOOL";
  const academicYear = getAcademicYear(settings) || "Academic Year";
  const currentTerm = cleanText(settings?.current_term) || "Current Term";
  const termBegins = toDateText(settings?.term_begins);
  const termEnds = toDateText(settings?.term_ends);

  return (
    <div className="space-y-5">

      {/* Gate — only shows when teacher clicks a locked card */}
      {showGate && <TeacherAccessGate onClose={() => setShowGate(false)} />}

      {/* Hero card */}
      <div className="relative overflow-hidden rounded-[28px] border border-emerald-100 bg-gradient-to-br from-white via-sky-50 to-emerald-50 p-5 shadow-sm">
        <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-sky-200/40" />
        <div className="pointer-events-none absolute -bottom-14 left-8 h-32 w-32 rounded-full bg-emerald-200/40" />

        <button type="button" onClick={() => setMenuOpen((prev) => !prev)} className="absolute right-4 top-4 z-20 flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-slate-700 shadow-sm ring-1 ring-slate-200 transition hover:bg-sky-50 hover:text-sky-600" aria-label="Open menu">
          {menuOpen ? <FiX size={22} /> : <FiMenu size={22} />}
        </button>

        {menuOpen && (
          <div className="absolute right-4 top-16 z-30 w-56 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-xl">
            <button type="button" onClick={() => { setMenuOpen(false); router.push("/dashboard/teacher"); }} className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm font-bold text-gray-700 hover:bg-sky-50 hover:text-sky-700">
              <FiGrid size={18} />JSMS Dashboard
            </button>
            <button type="button" onClick={() => { setMenuOpen(false); router.push("/report-card/teacher"); }} className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm font-bold text-gray-700 hover:bg-gray-50">
              <FiHome size={18} />Report Dashboard
            </button>
            <button type="button" onClick={() => { setMenuOpen(false); navigate("/report-card/teacher/view-reports"); }} className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm font-bold text-gray-700 hover:bg-gray-50">
              <FiFileText size={18} />View Reports
            </button>
            <button type="button" onClick={handleLogout} className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm font-bold text-red-600 hover:bg-red-50">
              <FiLogOut size={18} />Logout
            </button>
          </div>
        )}

        <div className="relative pr-12">
          <p className="text-xs font-black uppercase tracking-[0.22em] text-sky-600">Report Card System</p>
          <h1 className="mt-2 text-2xl font-extrabold leading-tight text-gray-900 md:text-3xl">{schoolName}</h1>
          <p className="mt-2 text-sm font-semibold text-slate-500">{getTeacherName(teacher)}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <span className="rounded-full bg-white px-3 py-2 text-xs font-bold text-slate-600 shadow-sm ring-1 ring-slate-200">{today}</span>
            <span className="rounded-full bg-sky-600 px-3 py-2 text-xs font-bold text-white shadow-sm">{academicYear}</span>
            <span className="rounded-full bg-emerald-600 px-3 py-2 text-xs font-bold text-white shadow-sm">{currentTerm}</span>
            {termBegins && termEnds && (
              <span className="rounded-full bg-amber-50 px-3 py-2 text-xs font-bold text-amber-700 shadow-sm ring-1 ring-amber-100">{termBegins} → {termEnds}</span>
            )}
          </div>
          <button type="button" onClick={() => router.push("/dashboard/teacher")} className="mt-4 inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-black text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-slate-800">
            <FiGrid size={18} />JSMS Dashboard
          </button>
        </div>
      </div>

      {/* Action cards */}
      <div className="grid grid-cols-2 gap-4">
        {cards.map((item) => {
          const Icon = item.icon;
          const locked = !access.canAccess && !access.checking;
          return (
            <button key={item.title} type="button" onClick={() => navigate(item.path)} className={`group relative overflow-hidden rounded-[24px] border border-gray-200 bg-white text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${locked ? "cursor-not-allowed opacity-60" : ""}`}>
              <div className={`h-1.5 bg-gradient-to-r ${item.color}`} />
              {locked && <span className="absolute right-3 top-4 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-black text-slate-500">Locked</span>}
              <div className="p-5">
                <div className={`mb-5 flex h-14 w-14 items-center justify-center rounded-2xl ${item.soft} transition group-hover:scale-105`}><Icon size={24} /></div>
                <h3 className="text-lg font-bold text-gray-900">{item.title}</h3>
                <p className="mt-2 text-sm leading-6 text-gray-500">{item.subtitle}</p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
