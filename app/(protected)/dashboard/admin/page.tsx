"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { supabase } from "@/lib/supabase";
import LogoutButton from "@/app/components/LogoutButton";
import useSchoolSettings from "@/app/components/useSchoolSettings";

type AdminInfo = {
  full_name: string;
  photo_url: string | null;
  role: string;
  teacher_id: string;
  username: string;
  phone: string;
};

type SearchResult = {
  id: string;
  type: "Student" | "Teacher" | "Receipt" | "Module";
  title: string;
  subtitle: string;
  badge: string;
  href?: string;
  details: Record<string, string | number | null | undefined>;
};

const softwareCards = [
  {
    title: "Feeding",
    description: "Daily feeding, balances, class submissions, and payments.",
    href: "/feeding",
    emoji: "🍽️",
    glow: "#16a34a",
  },
  {
    title: "Fees",
    description: "Payments, accounts, debtors, receipts, and reports.",
    href: "/fees/admin",
    emoji: "💳",
    glow: "#fbbf24",
  },
  {
    title: "Students Database",
    description: "Student records, guardians, classes, and status.",
    href: "/sds",
    emoji: "🎓",
    glow: "#f59e0b",
  },
  {
    title: "Income & Expenditure",
    description: "Income, expenses, balances, and financial reports.",
    href: "/income-expenditure",
    emoji: "💰",
    glow: "#f97316",
  },
  {
    title: "Report Card",
    description: "Scores, remarks, attendance, and report views.",
    href: "/report-card",
    emoji: "📘",
    glow: "#38bdf8",
  },
  {
    title: "Teacher Attendance",
    description: "Sign-in, checkout, duty, and staff movement.",
    href: "/teacher-attendance",
    emoji: "📊",
    glow: "#facc15",
  },
  {
    title: "Admission",
    description: "Forms, applications, receipts, and admits.",
    href: "/admission",
    emoji: "📝",
    glow: "#eab308",
  },
  {
    title: "Books",
    description: "Book sales, stock, class issues, and payments.",
    href: "/books",
    emoji: "📚",
    glow: "#22c55e",
  },
  {
    title: "Uniforms",
    description: "Uniform sales, payments, stock, and balances.",
    href: "/uniforms",
    emoji: "👕",
    glow: "#a855f7",
  },
];

const sideMenuItems = [
  { label: "Dashboard", href: "/dashboard/admin", emoji: "🏠" },
  { label: "Staff", href: "/teachers", emoji: "👨‍🏫" },
  { label: "Students", href: "/students", emoji: "🎓" },
  { label: "Classes", href: "/classes", emoji: "🏫" },
  { label: "Subjects", href: "/subjects", emoji: "📚" },
  { label: "Settings", href: "/settings", emoji: "⚙️" },
  { label: "Activity Logs", href: "/activity-logs", emoji: "🗒️" },
];

function cleanSearch(value: string) {
  return value.trim().replace(/[%_]/g, "");
}

function money(value: unknown) {
  const num = Number(value ?? 0);
  if (!Number.isFinite(num)) return "GHS 0.00";
  return `GHS ${num.toFixed(2)}`;
}

function readableDate(value: unknown) {
  if (!value) return "-";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString();
}

export default function AdminDashboardPage() {
  return <AdminDashboardPageClient />;
}

function AdminDashboardPageClient() {
  const { settings } = useSchoolSettings();

  const [adminInfo, setAdminInfo] = useState<AdminInfo>({
    full_name: "Admin",
    photo_url: null,
    role: "admin",
    teacher_id: "",
    username: "",
    phone: "",
  });

  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selectedResult, setSelectedResult] = useState<SearchResult | null>(
    null,
  );

  const moduleResults = useMemo<SearchResult[]>(
    () =>
      softwareCards.map((module) => ({
        id: `module-${module.href}`,
        type: "Module",
        title: module.title,
        subtitle: module.description,
        badge: "Module",
        href: module.href,
        details: {
          Module: module.title,
          Description: module.description,
          Link: module.href,
        },
      })),
    [],
  );

  useEffect(() => {
    async function loadDashboardData() {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        const authUserId = session?.user?.id;
        if (!authUserId) return;

        const { data: admin } = await supabase
          .from("teachers")
          .select("full_name, photo_url, role, teacher_id, username, phone")
          .eq("auth_user_id", authUserId)
          .limit(1)
          .single();

        if (admin) {
          setAdminInfo({
            full_name: admin.full_name ?? "Admin",
            photo_url: admin.photo_url ?? null,
            role: admin.role ?? "admin",
            teacher_id: admin.teacher_id ?? "",
            username: admin.username ?? "",
            phone: admin.phone ?? "",
          });
        }
      } catch (error) {
        console.error("Dashboard data load error:", error);
      }
    }

    loadDashboardData();
  }, []);

  useEffect(() => {
    let cancelled = false;
    const keyword = cleanSearch(query);

    if (keyword.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }

    const runSearch = async () => {
      setSearching(true);

      try {
        const lower = keyword.toLowerCase();
        const matchedModules = moduleResults.filter((item) =>
          `${item.title} ${item.subtitle} ${item.href}`
            .toLowerCase()
            .includes(lower),
        );

        const [studentsRes, teachersRes, receiptsRes] = await Promise.all([
          supabase
            .from("students")
            .select(
              "id, student_id, jvs_id, full_name, class_name, status, active, is_active, parent_name, parent_phone",
            )
            .or(
              `full_name.ilike.%${keyword}%,student_id.ilike.%${keyword}%,jvs_id.ilike.%${keyword}%,class_name.ilike.%${keyword}%`,
            )
            .limit(10),

          supabase
            .from("teachers")
            .select("id, full_name, teacher_id, role, phone, username, login_email, assigned_classes")
            .or(
              `full_name.ilike.%${keyword}%,teacher_id.ilike.%${keyword}%,role.ilike.%${keyword}%,phone.ilike.%${keyword}%,username.ilike.%${keyword}%,login_email.ilike.%${keyword}%,assigned_classes.ilike.%${keyword}%`,
            )
            .limit(10),

          supabase
            .from("v_universal_receipt_search")
            .select("*")
            .ilike("search_text", `%${keyword}%`)
            .order("created_at", { ascending: false })
            .limit(12),
        ]);

        if (studentsRes.error) console.warn("Student search skipped:", studentsRes.error);
        if (teachersRes.error) console.warn("Teacher search skipped:", teachersRes.error);
        if (receiptsRes.error) console.warn("Receipt search skipped:", receiptsRes.error);

        const studentResults: SearchResult[] = (studentsRes.data || []).map(
          (s: any) => ({
            id: `student-${s.id}`,
            type: "Student",
            title: s.full_name || "Unnamed Student",
            subtitle: `${s.student_id || s.jvs_id || "No JVS ID"} • ${s.class_name || "No class"}`,
            badge: s.status || "Student",
            href: "/sds",
            details: {
              "Student ID": s.student_id || s.jvs_id || "-",
              Class: s.class_name || "-",
              Status:
                s.status || (s.active || s.is_active ? "Active" : "Inactive"),
              Parent: s.parent_name || "-",
              "Parent Phone": s.parent_phone || "-",
            },
          }),
        );

        const teacherResults: SearchResult[] = (teachersRes.data || []).map(
          (t: any) => ({
            id: `teacher-${t.id}`,
            type: "Teacher",
            title: t.full_name || "Unnamed Teacher",
            subtitle: `${t.teacher_id || "No teacher ID"} • ${t.role || "Teacher"}`,
            badge: t.role || "Teacher",
            href: "/teachers",
            details: {
              "Teacher ID": t.teacher_id || "-",
              Role: t.role || "-",
              Phone: t.phone || "-",
              Username: t.username || "-",
              Email: t.login_email || "-",
              "Assigned Classes": t.assigned_classes || "-",
            },
          }),
        );

        const receiptResults: SearchResult[] = (receiptsRes.data || []).map(
          (r: any) => ({
            id: `receipt-${r.source_table}-${r.id}`,
            type: "Receipt",
            title: r.receipt_number || "Receipt",
            subtitle: `${r.student_name || "Unknown"} • ${r.module || "Module"} • ${money(r.amount_paid)}`,
            badge: r.module || "Receipt",
            href:
              r.module === "Fees"
                ? "/fees/admin"
                : r.module === "Admission"
                  ? "/admission"
                  : r.module === "Books"
                    ? "/books"
                    : r.module === "Uniforms"
                      ? "/uniforms"
                      : "/dashboard/admin",
            details: {
              Module: r.module || "-",
              "Receipt No": r.receipt_number || "-",
              "Student ID": r.student_id || "-",
              Student: r.student_name || "-",
              Class: r.class_name || "-",
              Item: r.item_name || "-",
              "Total Amount": money(r.total_amount),
              "Amount Paid": money(r.amount_paid),
              Balance: money(r.balance),
              Method: r.payment_method || "-",
              "Received By": r.received_by || "-",
              Term: r.term || "-",
              "Academic Year": r.academic_year || "-",
              Date: readableDate(r.payment_date || r.created_at),
            },
          }),
        );

        const allResults = [
          ...matchedModules,
          ...receiptResults,
          ...studentResults,
          ...teacherResults,
        ].slice(0, 28);

        if (!cancelled) setResults(allResults);
      } catch (error) {
        console.error("Universal dashboard search error:", error);
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    };

    const timer = window.setTimeout(runSearch, 90);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query, moduleResults]);

  const quickStats = useMemo(
    () => [
      { label: "Modules", value: softwareCards.length, icon: "✦" },
      { label: "Search", value: "All", icon: "⌕" },
      { label: "Control", value: "HQ", icon: "◆" },
    ],
    [],
  );

  return (
    <main className="jvs-page-shell">
      <style jsx global>{`
        @keyframes academySky {
          0% {
            background-position:
              0% 50%,
              80% 20%,
              0 0;
            filter: hue-rotate(0deg);
          }
          25% {
            background-position:
              60% 45%,
              62% 35%,
              70px 32px;
            filter: hue-rotate(5deg);
          }
          50% {
            background-position:
              100% 55%,
              38% 60%,
              140px 72px;
            filter: hue-rotate(-3deg);
          }
          75% {
            background-position:
              42% 48%,
              74% 42%,
              70px 112px;
            filter: hue-rotate(4deg);
          }
          100% {
            background-position:
              0% 50%,
              80% 20%,
              0 0;
            filter: hue-rotate(0deg);
          }
        }
        @keyframes auroraFlow {
          0%,
          100% {
            transform: translate3d(-6%, -3%, 0) rotate(-6deg) scale(1.05);
            opacity: 0.72;
          }
          50% {
            transform: translate3d(5%, 3%, 0) rotate(5deg) scale(1.15);
            opacity: 0.95;
          }
        }
        @keyframes floorMove {
          0% {
            background-position:
              0 0,
              0 0;
          }
          100% {
            background-position:
              0 90px,
              90px 0;
          }
        }
        @keyframes buildingPulse {
          0%,
          100% {
            transform: translateX(-50%) rotateX(14deg) rotateY(-7deg)
              translateZ(0);
          }
          50% {
            transform: translateX(-50%) rotateX(16deg) rotateY(7deg)
              translateZ(22px);
          }
        }
        @keyframes windowGlow {
          0%,
          100% {
            opacity: 0.58;
            box-shadow: 0 0 12px rgba(255, 209, 84, 0.45);
          }
          50% {
            opacity: 1;
            box-shadow: 0 0 24px rgba(255, 209, 84, 0.9);
          }
        }
        @keyframes bellFloat {
          0%,
          100% {
            transform: translate3d(0, 0, 0) rotate(-3deg);
          }
          50% {
            transform: translate3d(0, -12px, 22px) rotate(3deg);
          }
        }
        @keyframes floatSchool {
          0%,
          100% {
            transform: translate3d(0, 0, 0) rotate(0deg) scale(1);
          }
          50% {
            transform: translate3d(24px, -28px, 28px) rotate(7deg) scale(1.04);
          }
        }
        @keyframes floatSchoolReverse {
          0%,
          100% {
            transform: translate3d(0, 0, 0) rotate(0deg) scale(1);
          }
          50% {
            transform: translate3d(-28px, 20px, 20px) rotate(-8deg) scale(1.05);
          }
        }
        @keyframes jvsBrandDrift {
          0% {
            transform: translate3d(-10vw, 6vh, 0) rotate(-8deg) scale(1);
            color: rgba(255, 193, 7, 0.16);
            text-shadow: 0 0 34px rgba(255, 193, 7, 0.28);
          }
          28% {
            transform: translate3d(18vw, -2vh, 35px) rotate(5deg) scale(1.08);
            color: rgba(16, 185, 129, 0.18);
            text-shadow: 0 0 40px rgba(16, 185, 129, 0.26);
          }
          55% {
            transform: translate3d(34vw, 8vh, 10px) rotate(-3deg) scale(0.96);
            color: rgba(59, 130, 246, 0.14);
            text-shadow: 0 0 38px rgba(59, 130, 246, 0.22);
          }
          78% {
            transform: translate3d(4vw, -7vh, 50px) rotate(7deg) scale(1.12);
            color: rgba(250, 204, 21, 0.18);
            text-shadow: 0 0 44px rgba(250, 204, 21, 0.32);
          }
          100% {
            transform: translate3d(-10vw, 6vh, 0) rotate(-8deg) scale(1);
            color: rgba(255, 193, 7, 0.16);
            text-shadow: 0 0 34px rgba(255, 193, 7, 0.28);
          }
        }
        @keyframes sidePanelColorShift {
          0%, 100% {
            background-position: 0% 50%;
            filter: saturate(1.08);
          }
          50% {
            background-position: 100% 50%;
            filter: saturate(1.32);
          }
        }
        @keyframes actionGlowSlide {
          0% { transform: translateX(-120%) rotate(12deg); opacity: 0; }
          35% { opacity: .55; }
          100% { transform: translateX(145%) rotate(12deg); opacity: 0; }
        }
        @keyframes cardSheen {
          0% {
            transform: translateX(-145%) skewX(-18deg);
            opacity: 0;
          }
          32% {
            opacity: 0.72;
          }
          100% {
            transform: translateX(160%) skewX(-18deg);
            opacity: 0;
          }
        }
        @keyframes resultDrop {
          from {
            opacity: 0;
            transform: translateY(8px) scale(0.985);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        * {
          box-sizing: border-box;
        }
        .jvs-page-shell {
          min-height: 100vh;
          font-family: Arial, sans-serif;
          color: #071426;
          background:
            radial-gradient(
              circle at 8% 10%,
              rgba(255, 207, 73, 0.72),
              transparent 21%
            ),
            radial-gradient(
              circle at 90% 15%,
              rgba(28, 172, 121, 0.46),
              transparent 24%
            ),
            radial-gradient(
              circle at 48% 85%,
              rgba(64, 116, 255, 0.24),
              transparent 28%
            ),
            linear-gradient(
              125deg,
              #fff9df 0%,
              #f6fffb 26%,
              #dff7ed 48%,
              #fff0af 72%,
              #f8fbff 100%
            );
          background-size:
            180% 180%,
            150% 150%,
            170% 170%,
            240% 240%;
          animation: academySky 14s ease-in-out infinite;
          padding: clamp(8px, 1vw, 14px);
          position: relative;
          overflow-x: hidden;
        }
        .jvs-page-shell::before {
          content: "";
          position: fixed;
          inset: -12%;
          pointer-events: none;
          z-index: 0;
          background:
            linear-gradient(
              115deg,
              transparent 0%,
              rgba(255, 255, 255, 0.52) 22%,
              transparent 38%
            ),
            radial-gradient(
              ellipse at 25% 18%,
              rgba(255, 193, 40, 0.34),
              transparent 44%
            ),
            radial-gradient(
              ellipse at 78% 25%,
              rgba(21, 150, 117, 0.3),
              transparent 40%
            );
          filter: blur(12px);
          animation: auroraFlow 7.5s ease-in-out infinite;
        }
        .jvs-scene {
          position: fixed;
          inset: 0;
          pointer-events: none;
          overflow: hidden;
          perspective: 1200px;
          z-index: 0;
        }
        .jvs-scene::before {
          content: "";
          position: absolute;
          left: -15%;
          right: -15%;
          bottom: -24%;
          height: 70%;
          background:
            linear-gradient(rgba(10, 84, 67, 0.13) 1px, transparent 1px),
            linear-gradient(90deg, rgba(10, 84, 67, 0.12) 1px, transparent 1px);
          background-size: 86px 86px;
          transform: rotateX(66deg) translateY(70px) scale(1.35);
          transform-origin: center bottom;
          animation: floorMove 7s linear infinite;
          mask-image: linear-gradient(
            to top,
            #000 0%,
            rgba(0, 0, 0, 0.92) 50%,
            transparent 92%
          );
        }
        .jvs-scene::after {
          content: "";
          position: absolute;
          inset: 0;
          background:
            radial-gradient(
              circle at 50% 32%,
              rgba(255, 215, 92, 0.34),
              transparent 18%
            ),
            radial-gradient(
              circle at 45% 43%,
              rgba(255, 255, 255, 0.32),
              transparent 28%
            );
          mix-blend-mode: soft-light;
          opacity: 0.95;
        }
        .campus-stage {
          position: absolute;
          left: 54%;
          top: 38px;
          width: min(900px, 70vw);
          height: 330px;
          transform-style: preserve-3d;
          animation: buildingPulse 8s ease-in-out infinite;
          opacity: 0.92;
          filter: drop-shadow(0 42px 55px rgba(6, 49, 42, 0.28));
        }
        .campus-dome {
          position: absolute;
          left: 50%;
          top: 10px;
          width: 240px;
          height: 118px;
          transform: translateX(-50%) translateZ(70px);
          border-radius: 130px 130px 20px 20px;
          background:
            radial-gradient(
              circle at 45% 25%,
              rgba(255, 255, 255, 0.92),
              transparent 28%
            ),
            linear-gradient(
              145deg,
              rgba(255, 236, 168, 0.98),
              rgba(247, 180, 20, 0.72) 45%,
              rgba(23, 119, 91, 0.56)
            );
          border: 2px solid rgba(255, 255, 255, 0.8);
          box-shadow:
            inset 0 10px 32px rgba(255, 255, 255, 0.72),
            0 24px 55px rgba(191, 125, 0, 0.28);
        }
        .campus-dome::after {
          content: "🏫";
          position: absolute;
          left: 50%;
          top: 42%;
          transform: translate(-50%, -50%);
          font-size: 42px;
          filter: drop-shadow(0 10px 14px rgba(0, 0, 0, 0.18));
        }
        .campus-base {
          position: absolute;
          left: 50%;
          bottom: 56px;
          width: 640px;
          height: 134px;
          transform: translateX(-50%) translateZ(38px);
          border-radius: 30px 30px 18px 18px;
          background:
            linear-gradient(
              90deg,
              rgba(255, 255, 255, 0.95),
              rgba(255, 230, 148, 0.92) 28%,
              rgba(242, 255, 247, 0.95) 55%,
              rgba(255, 212, 76, 0.82)
            ),
            linear-gradient(
              145deg,
              rgba(255, 255, 255, 0.92),
              rgba(20, 118, 92, 0.18)
            );
          border: 2px solid rgba(255, 255, 255, 0.86);
          box-shadow:
            inset 0 6px 28px rgba(255, 255, 255, 0.9),
            0 32px 90px rgba(8, 74, 62, 0.24);
        }
        .campus-base::before {
          content: "";
          position: absolute;
          inset: 20px 48px;
          background: repeating-linear-gradient(
            90deg,
            transparent 0 42px,
            rgba(9, 74, 66, 0.78) 42px 63px,
            transparent 63px 93px
          );
          border-radius: 14px;
          opacity: 0.85;
          animation: windowGlow 2.4s ease-in-out infinite;
        }
        .campus-base::after {
          content: "JVS";
          position: absolute;
          left: 50%;
          bottom: 15px;
          transform: translateX(-50%);
          color: #064e3b;
          font-size: 30px;
          font-weight: 1000;
          letter-spacing: 0.18em;
          text-shadow: 0 8px 18px rgba(255, 205, 61, 0.65);
        }
        .campus-pillar {
          position: absolute;
          bottom: 64px;
          width: 30px;
          height: 126px;
          border-radius: 18px;
          background: linear-gradient(
            90deg,
            #fffdf4,
            #ffd565 43%,
            #0f8f6e 100%
          );
          border: 2px solid rgba(255, 255, 255, 0.75);
          box-shadow:
            inset 0 2px 18px rgba(255, 255, 255, 0.65),
            0 18px 34px rgba(9, 70, 60, 0.18);
          transform: translateZ(80px);
        }
        .campus-pillar.p1 {
          left: 238px;
        }
        .campus-pillar.p2 {
          left: 310px;
        }
        .campus-pillar.p3 {
          right: 310px;
        }
        .campus-pillar.p4 {
          right: 238px;
        }
        .campus-step {
          position: absolute;
          left: 50%;
          bottom: 22px;
          width: 780px;
          height: 70px;
          transform: translateX(-50%) rotateX(62deg) translateZ(15px);
          border-radius: 50%;
          background: radial-gradient(
            ellipse,
            rgba(255, 195, 42, 0.44),
            rgba(8, 122, 89, 0.14) 46%,
            transparent 70%
          );
          box-shadow: 0 22px 48px rgba(10, 85, 70, 0.22);
        }
        .floating-school-item {
          position: absolute;
          border-radius: 28px;
          background: linear-gradient(
            145deg,
            rgba(255, 255, 255, 0.72),
            rgba(255, 221, 111, 0.44),
            rgba(33, 159, 116, 0.22)
          );
          border: 1px solid rgba(255, 255, 255, 0.84);
          box-shadow:
            0 32px 64px rgba(8, 67, 58, 0.22),
            inset 0 2px 28px rgba(255, 255, 255, 0.92);
          backdrop-filter: blur(18px) saturate(1.35);
          color: rgba(64, 42, 3, 0.68);
          display: grid;
          place-items: center;
          font-size: 26px;
        }
        .floating-school-item.one {
          width: 78px;
          height: 78px;
          left: 7%;
          top: 17%;
          animation: floatSchool 5.2s ease-in-out infinite;
        }
        .floating-school-item.two {
          width: 66px;
          height: 66px;
          right: 8%;
          top: 24%;
          animation: floatSchoolReverse 5.6s ease-in-out infinite;
        }
        .floating-school-item.three {
          width: 72px;
          height: 72px;
          right: 23%;
          bottom: 11%;
          animation: floatSchool 4.8s ease-in-out infinite;
        }
        .floating-school-item.four {
          width: 60px;
          height: 60px;
          left: 17%;
          bottom: 17%;
          animation: floatSchoolReverse 6s ease-in-out infinite;
        }
        .jvs-brand-watermark {
          position: absolute;
          left: 3vw;
          top: 12vh;
          font-size: clamp(110px, 20vw, 340px);
          font-weight: 1000;
          letter-spacing: -0.08em;
          line-height: 0.85;
          transform-style: preserve-3d;
          animation: jvsBrandDrift 13s ease-in-out infinite;
          pointer-events: none;
          mix-blend-mode: multiply;
          opacity: 0.8;
          z-index: 0;
          user-select: none;
        }
        .jvs-brand-watermark.alt {
          left: auto;
          right: -4vw;
          top: 58vh;
          font-size: clamp(72px, 12vw, 210px);
          animation-duration: 17s;
          animation-delay: -5s;
          opacity: 0.55;
          letter-spacing: -0.06em;
        }
        .jvs-dashboard-grid {
          max-width: 1450px;
          margin: 0 auto;
          display: grid;
          grid-template-columns: clamp(218px, 16.5vw, 254px) 1fr;
          gap: clamp(10px, 1vw, 16px);
          align-items: start;
          position: relative;
          z-index: 1;
        }
        .jvs-glass {
          background: linear-gradient(
            145deg,
            rgba(255, 255, 255, 0.86),
            rgba(255, 250, 214, 0.52)
          );
          border: 1px solid rgba(255, 255, 255, 0.82);
          box-shadow:
            0 34px 90px rgba(5, 75, 64, 0.22),
            0 14px 34px rgba(245, 158, 11, 0.22),
            inset 0 1px 0 rgba(255, 255, 255, 1),
            inset 0 -26px 44px rgba(255, 198, 52, 0.18);
          backdrop-filter: blur(26px) saturate(1.38);
          -webkit-backdrop-filter: blur(26px) saturate(1.38);
        }
        .jvs-sidebar {
          position: sticky;
          top: 14px;
          height: calc(100vh - 28px);
          min-height: calc(100vh - 28px);
          border-radius: 30px;
          overflow: hidden;
          background:
            radial-gradient(circle at 18% 10%, rgba(255, 213, 79, 0.38), transparent 28%),
            radial-gradient(circle at 88% 36%, rgba(52, 211, 153, 0.3), transparent 26%),
            linear-gradient(140deg, rgba(5, 64, 56, 0.98), rgba(15, 118, 110, 0.86), rgba(201, 138, 4, 0.78), rgba(6, 95, 70, 0.9));
          background-size: 160% 160%, 180% 180%, 260% 260%;
          animation: sidePanelColorShift 9s ease-in-out infinite;
          color: #fffdf5;
          box-shadow:
            0 38px 80px rgba(3, 42, 36, 0.28),
            0 0 44px rgba(245, 158, 11, 0.16),
            inset 0 1px 0 rgba(255, 255, 255, 0.18);
        }
        .jvs-sidebar::before {
          content: "";
          position: absolute;
          inset: 0;
          background: linear-gradient(115deg, transparent, rgba(255,255,255,.18), transparent);
          animation: actionGlowSlide 5.5s ease-in-out infinite;
          pointer-events: none;
        }
        .jvs-sidebar > * {
          position: relative;
          z-index: 1;
        }
        .jvs-sidebar .muted-side {
          color: rgba(255, 250, 232, 0.82);
        }
        .jvs-hero-card {
          position: relative;
          overflow: visible;
          border-radius: 30px;
          padding: clamp(12px, 1.1vw, 18px);
          margin-bottom: clamp(8px, .85vw, 12px);
          transform-style: preserve-3d;
          min-height: auto;
          position: relative;
          z-index: 30;
        }
        .jvs-hero-card::before {
          content: "";
          position: absolute;
          width: 390px;
          height: 390px;
          right: -130px;
          top: -170px;
          border-radius: 999px;
          background: radial-gradient(
            circle,
            rgba(255, 199, 53, 0.56),
            rgba(19, 151, 110, 0.18) 44%,
            transparent 68%
          );
          animation: floatSchool 5.5s ease-in-out infinite;
        }
        .jvs-hero-card::after {
          content: "";
          position: absolute;
          width: 320px;
          height: 320px;
          left: -118px;
          bottom: -140px;
          border-radius: 999px;
          background: radial-gradient(
            circle,
            rgba(35, 130, 255, 0.22),
            rgba(255, 214, 87, 0.28),
            transparent 68%
          );
          animation: floatSchoolReverse 5.8s ease-in-out infinite;
        }
        .jvs-search-box {
          position: relative;
          border-radius: 20px;
          padding: 8px 11px;
          display: flex;
          align-items: center;
          gap: 9px;
          min-height: 40px;
          transition:
            box-shadow 0.2s ease,
            transform 0.2s ease;
        }
        .jvs-search-box:focus-within {
          transform: translateY(-2px) translateZ(20px);
          box-shadow:
            0 26px 62px rgba(5, 57, 49, 0.22),
            0 0 0 4px rgba(255, 203, 67, 0.24),
            inset 0 1px 0 rgba(255, 255, 255, 1);
        }
        .jvs-search-input {
          width: 100%;
          height: 28px;
          border: 0;
          outline: 0;
          background: transparent;
          color: #071426;
          font-size: 13px;
          font-weight: 900;
        }
        .jvs-search-input::placeholder {
          color: rgba(23, 44, 54, 0.52);
        }
        .jvs-results-panel {
          position: absolute;
          top: calc(100% + 9px);
          left: 0;
          right: 0;
          z-index: 9999;
          border-radius: 24px;
          max-height: min(390px, 48vh);
          overflow: hidden;
          animation: resultDrop 0.18s ease-out;
        }
        .jvs-result-list {
          max-height: min(390px, 48vh);
          overflow-y: auto;
          padding: 9px;
        }
        .jvs-result-list::-webkit-scrollbar {
          width: 8px;
        }
        .jvs-result-list::-webkit-scrollbar-thumb {
          background: rgba(24, 112, 91, 0.35);
          border-radius: 999px;
        }
        .jvs-module-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          grid-template-rows: repeat(3, minmax(0, 1fr));
          gap: clamp(9px, .85vw, 13px);
          height: clamp(390px, calc(100vh - 218px), 620px);
          align-items: stretch;
        }
        .jvs-module-shell {
          height: 100%;
        }
        .jvs-module-shell.is-feeding {
          grid-row: auto;
        }
        .jvs-module-card {
          position: relative;
          min-height: 0;
          height: 100%;
          border-radius: 25px;
          padding: clamp(12px, .9vw, 16px);
          overflow: hidden;
          transform-style: preserve-3d;
          transition:
            box-shadow 0.2s ease,
            border-color 0.2s ease,
            background 0.2s ease,
            filter 0.2s ease;
        }
        .jvs-module-shell.is-feeding .jvs-module-card {
          min-height: 0;
          background: linear-gradient(
            145deg,
            rgba(255, 255, 255, 0.9),
            rgba(220, 255, 239, 0.62)
          );
          border-color: rgba(255, 255, 255, 0.96);
        }
        .jvs-module-shell.is-feeding .jvs-module-card::after {
          content: "";
          position: absolute;
          inset: auto -55px -65px auto;
          width: 180px;
          height: 180px;
          border-radius: 999px;
          background: radial-gradient(
            circle,
            rgba(16, 185, 129, 0.42),
            rgba(245, 158, 11, 0.22),
            transparent 70%
          );
          animation: floatSchool 4.8s ease-in-out infinite;
          pointer-events: none;
        }
        .jvs-module-card::before {
          content: "";
          position: absolute;
          top: -110%;
          left: -90%;
          width: 82%;
          height: 300%;
          background: linear-gradient(
            90deg,
            transparent,
            rgba(255, 255, 255, 0.84),
            transparent
          );
          transform: rotate(17deg);
          animation: cardSheen 5.2s ease-in-out infinite;
          animation-delay: var(--delay, 0s);
          pointer-events: none;
        }
        .jvs-module-card:hover {
          border-color: rgba(255, 255, 255, 0.98);
          background: linear-gradient(
            145deg,
            rgba(255, 255, 255, 0.86),
            rgba(255, 246, 204, 0.48)
          );
          box-shadow:
            0 46px 96px rgba(5, 90, 72, 0.34),
            0 22px 42px rgba(245, 158, 11, 0.3),
            inset 0 1px 0 rgba(255, 255, 255, 1);
          filter: saturate(1.12);
        }
        .jvs-icon-3d {
          width: 41px;
          height: 41px;
          border-radius: 15px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 19px;
          background: linear-gradient(
            145deg,
            #ffffff,
            #ffd65d 50%,
            #20a77a 135%
          );
          border: 1px solid rgba(255, 255, 255, 0.86);
          box-shadow:
            0 16px 28px rgba(5, 57, 49, 0.18),
            inset 0 2px 10px rgba(255, 255, 255, 0.92),
            inset 0 -10px 20px rgba(217, 119, 6, 0.1);
        }
        .jvs-chip {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 22px;
          padding: 0 9px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.68);
          border: 1px solid rgba(255, 255, 255, 0.84);
          color: #75500b;
          font-size: 10px;
          font-weight: 950;
          box-shadow:
            inset 0 1px 0 rgba(255, 255, 255, 0.95),
            0 8px 18px rgba(191, 125, 0, 0.08);
        }
        .jvs-modal-backdrop {
          position: fixed;
          inset: 0;
          z-index: 50;
          background: rgba(3, 25, 29, 0.42);
          backdrop-filter: blur(14px);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 18px;
        }
        .jvs-modal-card {
          width: min(700px, 100%);
          border-radius: 32px;
          overflow: hidden;
        }
        @media (min-width: 981px) {
          .jvs-dashboard-grid {
            height: calc(100vh - 28px);
            overflow: hidden;
          }
          .jvs-dashboard-grid > section {
            height: 100%;
            min-height: 0;
            display: flex;
            flex-direction: column;
            position: relative;
            z-index: 5;
          }
          .jvs-sidebar {
            overflow: hidden;
          }
          .jvs-module-grid {
            flex: 1;
            min-height: 0;
          }
        }
        @media (max-width: 1320px) and (min-width: 981px) {
          .jvs-module-grid {
            height: clamp(360px, calc(100vh - 202px), 560px);
            gap: 10px;
          }
          .jvs-module-card {
            padding: 12px;
            border-radius: 22px;
          }
          .jvs-module-card h3 {
            font-size: 14px !important;
            margin-top: 8px !important;
          }
          .jvs-module-card p {
            font-size: 10.8px !important;
            line-height: 1.35 !important;
          }
          .jvs-icon-3d {
            width: 36px;
            height: 36px;
            font-size: 17px;
          }
          .jvs-chip {
            min-height: 20px;
            font-size: 9px;
            padding: 0 8px;
          }
        }
        @media (max-width: 980px) {
          .jvs-brand-watermark {
          position: absolute;
          left: 3vw;
          top: 12vh;
          font-size: clamp(110px, 20vw, 340px);
          font-weight: 1000;
          letter-spacing: -0.08em;
          line-height: 0.85;
          transform-style: preserve-3d;
          animation: jvsBrandDrift 13s ease-in-out infinite;
          pointer-events: none;
          mix-blend-mode: multiply;
          opacity: 0.8;
          z-index: 0;
          user-select: none;
        }
        .jvs-brand-watermark.alt {
          left: auto;
          right: -4vw;
          top: 58vh;
          font-size: clamp(72px, 12vw, 210px);
          animation-duration: 17s;
          animation-delay: -5s;
          opacity: 0.55;
          letter-spacing: -0.06em;
        }
        .jvs-dashboard-grid {
            grid-template-columns: 1fr;
          }
          .jvs-sidebar {
            position: relative;
            min-height: auto;
            top: 0;
          }
          .campus-stage {
            width: 94vw;
            opacity: 0.64;
            left: 50%;
          }
          .jvs-module-grid {
            grid-template-columns: repeat(3, minmax(0, 1fr));
            grid-template-rows: none;
            grid-auto-rows: minmax(146px, auto);
            height: auto;
          }
          .jvs-module-shell.is-feeding {
            grid-column: span 1;
            grid-row: span 1;
          }
          .jvs-module-shell.is-feeding .jvs-module-card {
            min-height: 146px;
          }
        }
        @media (max-width: 620px) {
          .jvs-page-shell {
            padding: 10px;
          }
          .jvs-module-grid {
            grid-template-columns: 1fr;
          }
          .jvs-module-shell.is-feeding {
            grid-column: span 1;
          }
          .jvs-module-card,
          .jvs-module-shell.is-feeding .jvs-module-card {
            min-height: 168px;
          }
          .campus-stage {
            opacity: 0.48;
          }
        }
      `}</style>

      <div className="jvs-scene" aria-hidden="true">
        <div className="jvs-brand-watermark">JVS</div>
        <div className="jvs-brand-watermark alt">JVS</div>
        <div className="campus-stage">
          <div className="campus-dome" />
          <div className="campus-base" />
          <div className="campus-pillar p1" />
          <div className="campus-pillar p2" />
          <div className="campus-pillar p3" />
          <div className="campus-pillar p4" />
          <div className="campus-step" />
        </div>
        <div className="floating-school-item one">📘</div>
        <div className="floating-school-item two">✦</div>
        <div className="floating-school-item three">🎓</div>
        <div className="floating-school-item four">✎</div>
      </div>

      <div className="jvs-dashboard-grid">
        <aside className="jvs-sidebar jvs-glass">
          <div
            style={{
              padding: "17px 15px 14px",
              borderBottom: "1px solid rgba(255,255,255,0.18)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "11px",
                marginBottom: "13px",
              }}
            >
              <motion.div
                animate={{ y: [0, -4, 0], rotateY: [0, 7, 0] }}
                transition={{
                  duration: 4,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
                style={{
                  width: "51px",
                  height: "51px",
                  borderRadius: "18px",
                  overflow: "hidden",
                  background: "linear-gradient(145deg, #ffffff, #f8d56a)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  border: "1px solid rgba(255,255,255,0.85)",
                  boxShadow:
                    "0 18px 34px rgba(0,0,0,0.18), inset 0 2px 10px rgba(255,255,255,0.8)",
                }}
              >
                {settings.logo_url ? (
                  <img
                    src={settings.logo_url}
                    alt={settings.school_name}
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                    }}
                  />
                ) : (
                  <span style={{ fontSize: "20px" }}>🏫</span>
                )}
              </motion.div>

              <div style={{ minWidth: 0 }}>
                <h2
                  style={{
                    margin: 0,
                    fontSize: "16px",
                    lineHeight: 1.2,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {settings.school_name || "JSMS"}
                </h2>
                <p
                  className="muted-side"
                  style={{
                    margin: "5px 0 0",
                    fontSize: "11.8px",
                    lineHeight: 1.5,
                    fontWeight: 800,
                  }}
                >
                  {settings.motto || "School Management"}
                </p>
              </div>
            </div>

            <motion.div
              whileHover={{ y: -4, rotateX: 4 }}
              style={{
                background:
                  "linear-gradient(145deg, rgba(255,255,255,0.2), rgba(239,196,73,0.18))",
                borderRadius: "21px",
                padding: "12px",
                boxShadow:
                  "0 18px 36px rgba(0,0,0,0.16), inset 0 1px 0 rgba(255,255,255,0.2)",
                border: "1px solid rgba(255,255,255,0.2)",
              }}
            >
              <p
                className="muted-side"
                style={{
                  margin: 0,
                  fontSize: "10px",
                  fontWeight: 900,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                }}
              >
                Logged in as
              </p>
              <p
                style={{
                  margin: "6px 0 0",
                  fontSize: "14px",
                  fontWeight: 950,
                  lineHeight: 1.25,
                }}
              >
                {adminInfo.full_name}
              </p>
              <p
                className="muted-side"
                style={{
                  margin: "4px 0 0",
                  fontSize: "11px",
                  fontWeight: 850,
                  textTransform: "capitalize",
                }}
              >
                {adminInfo.role}
              </p>
              {(settings.academic_year || settings.current_term) && (
                <p
                  style={{
                    margin: "8px 0 0",
                    fontSize: "11px",
                    fontWeight: 950,
                    color: "#ffe08a",
                  }}
                >
                  {settings.academic_year}
                  {settings.academic_year && settings.current_term ? " • " : ""}
                  {settings.current_term}
                </p>
              )}
            </motion.div>
          </div>

          <div style={{ padding: "15px 12px" }}>
            <p
              className="muted-side"
              style={{
                margin: "0 10px 10px",
                fontSize: "10px",
                letterSpacing: "1px",
                textTransform: "uppercase",
                fontWeight: 950,
              }}
            >
              Quick Actions
            </p>

            <div style={{ display: "grid", gap: "8px" }}>
              {sideMenuItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  style={{ textDecoration: "none", color: "inherit" }}
                >
                  <motion.div
                    whileHover={{ x: 6, scale: 1.025, rotateY: -4 }}
                    whileTap={{ scale: 0.985 }}
                    transition={{ type: "spring", stiffness: 280, damping: 18 }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                      padding: "11px 12px",
                      borderRadius: "17px",
                      background: "rgba(255,255,255,0.12)",
                      border: "1px solid rgba(255,255,255,0.13)",
                      boxShadow: "inset 0 1px 0 rgba(255,255,255,0.12)",
                      fontWeight: 900,
                      fontSize: "13px",
                    }}
                  >
                    <span
                      style={{
                        width: "25px",
                        height: "25px",
                        borderRadius: "10px",
                        background: "rgba(255,255,255,0.16)",
                        display: "grid",
                        placeItems: "center",
                      }}
                    >
                      {item.emoji}
                    </span>
                    {item.label}
                  </motion.div>
                </Link>
              ))}
            </div>
          </div>

          <div style={{ padding: "0 12px 15px" }}>
            <LogoutButton />
          </div>
        </aside>

        <section>
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45 }}
            className="jvs-hero-card jvs-glass"
          >
            <div style={{ position: "relative", zIndex: 1 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  justifyContent: "space-between",
                  gap: "14px",
                  flexWrap: "wrap",
                }}
              >
                <div style={{ maxWidth: "760px" }}>
                  <span className="jvs-chip">Admin Control Centre</span>
                  <div
                    style={{
                      marginTop: "10px",
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                      flexWrap: "wrap",
                    }}
                  >
                    <span
                      style={{
                        fontSize: "13px",
                        fontWeight: 950,
                        color: "#0f513f",
                      }}
                    >
                      2025/2026 • Third Term
                    </span>
                    <span
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: 999,
                        background: "#f59e0b",
                        boxShadow: "0 0 14px rgba(245,158,11,.75)",
                      }}
                    />
                    <span
                      style={{
                        fontSize: "13px",
                        fontWeight: 950,
                        color: "#8a5f08",
                      }}
                    >
                      Universal school control room
                    </span>
                  </div>
                </div>

                <div style={{ display: "flex", gap: "9px", flexWrap: "wrap" }}>
                  {quickStats.map((stat) => (
                    <motion.div
                      key={stat.label}
                      animate={{ y: [0, -5, 0] }}
                      transition={{
                        duration: 3.6,
                        repeat: Infinity,
                        ease: "easeInOut",
                      }}
                      className="jvs-glass"
                      style={{
                        minWidth: "92px",
                        borderRadius: "19px",
                        padding: "10px 11px",
                      }}
                    >
                      <div style={{ fontSize: "14px" }}>{stat.icon}</div>
                      <div
                        style={{
                          marginTop: "5px",
                          fontWeight: 950,
                          fontSize: "14px",
                        }}
                      >
                        {stat.value}
                      </div>
                      <div
                        style={{
                          marginTop: "2px",
                          fontSize: "9px",
                          fontWeight: 950,
                          color: "#7a5512",
                          textTransform: "uppercase",
                        }}
                      >
                        {stat.label}
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>

              <div style={{ position: "relative", marginTop: "16px" }}>
                <div className="jvs-search-box jvs-glass">
                  <span style={{ fontSize: "17px" }}>⌕</span>
                  <input
                    className="jvs-search-input"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") setQuery(cleanSearch(query));
                    }}
                    placeholder="Search student, ID, teacher, receipt, module..."
                  />
                  <button
                    type="button"
                    onClick={() => setQuery(cleanSearch(query))}
                    style={{
                      border: 0,
                      background: "linear-gradient(135deg, #0f513f, #f59e0b)",
                      color: "#fff",
                      borderRadius: "13px",
                      height: "28px",
                      padding: "0 13px",
                      cursor: "pointer",
                      fontWeight: 950,
                      boxShadow: "0 10px 22px rgba(15,81,63,.18)",
                      flexShrink: 0,
                    }}
                  >
                    Search
                  </button>
                  {query && (
                    <button
                      type="button"
                      onClick={() => {
                        setQuery("");
                        setResults([]);
                      }}
                      style={{
                        border: 0,
                        background: "rgba(23,32,51,0.08)",
                        borderRadius: "999px",
                        width: "27px",
                        height: "27px",
                        cursor: "pointer",
                        fontWeight: 950,
                      }}
                    >
                      ×
                    </button>
                  )}
                </div>

                <AnimatePresence>
                  {query.trim().length >= 2 && (
                    <motion.div
                      initial={{ opacity: 0, y: 10, scale: 0.985 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 8, scale: 0.985 }}
                      className="jvs-results-panel jvs-glass"
                    >
                      <div className="jvs-result-list">
                        {searching && (
                          <div
                            style={{
                              padding: "15px",
                              fontWeight: 950,
                              color: "#7a5512",
                            }}
                          >
                            Searching...
                          </div>
                        )}

                        {!searching && results.length === 0 && (
                          <div
                            style={{
                              padding: "15px",
                              fontWeight: 950,
                              color: "#7a5512",
                            }}
                          >
                            No result found.
                          </div>
                        )}

                        {!searching &&
                          results.map((result) => (
                            <motion.button
                              key={result.id}
                              type="button"
                              whileHover={{ x: 4, scale: 1.01 }}
                              onClick={() => setSelectedResult(result)}
                              style={{
                                width: "100%",
                                border: 0,
                                marginBottom: "8px",
                                borderRadius: "17px",
                                background:
                                  "linear-gradient(145deg, rgba(255,255,255,0.78), rgba(238,249,244,0.44))",
                                padding: "10px 11px",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                gap: "12px",
                                cursor: "pointer",
                                textAlign: "left",
                                boxShadow:
                                  "0 8px 20px rgba(24,72,63,0.07), inset 0 1px 0 rgba(255,255,255,0.88)",
                              }}
                            >
                              <div style={{ minWidth: 0 }}>
                                <div
                                  style={{
                                    fontSize: "12.5px",
                                    fontWeight: 950,
                                    color: "#172033",
                                    whiteSpace: "nowrap",
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                  }}
                                >
                                  {result.title}
                                </div>
                                <div
                                  style={{
                                    marginTop: "4px",
                                    fontSize: "11px",
                                    fontWeight: 780,
                                    color: "#49615d",
                                    whiteSpace: "nowrap",
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                  }}
                                >
                                  {result.subtitle}
                                </div>
                              </div>
                              <span className="jvs-chip">{result.badge}</span>
                            </motion.button>
                          ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </motion.div>

          <div className="jvs-module-grid">
            {softwareCards.map((card, index) => (
              <motion.div
                key={card.title}
                className={`jvs-module-shell ${card.title === "Feeding" ? "is-feeding" : ""}`}
                initial={{ opacity: 0, y: 18, rotateX: -5 }}
                animate={{ opacity: 1, y: 0, rotateX: 0 }}
                transition={{ duration: 0.34, delay: index * 0.045 }}
              >
                <Link
                  href={card.href}
                  style={{
                    textDecoration: "none",
                    color: "inherit",
                    display: "block",
                    height: "100%",
                  }}
                >
                  <motion.div
                    className="jvs-module-card jvs-glass"
                    whileHover={{
                      y: -9,
                      scale: 1.03,
                      rotateX: 7,
                      rotateY: index % 2 === 0 ? -5 : 5,
                    }}
                    whileTap={{ scale: 0.985 }}
                    transition={{ type: "spring", stiffness: 270, damping: 17 }}
                    style={{ ["--delay" as any]: `${index * 0.35}s` }}
                  >
                    <div
                      style={{
                        position: "absolute",
                        right: "-38px",
                        top: "-38px",
                        width: "98px",
                        height: "98px",
                        borderRadius: "999px",
                        background: `${card.glow}22`,
                        filter: "blur(1px)",
                      }}
                    />
                    <div
                      style={{
                        position: "relative",
                        zIndex: 1,
                        display: "flex",
                        flexDirection: "column",
                        height: "100%",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "flex-start",
                          justifyContent: "space-between",
                          gap: "9px",
                        }}
                      >
                        <motion.div
                          className="jvs-icon-3d"
                          animate={{ y: [0, -3, 0], rotateY: [0, 7, 0] }}
                          transition={{
                            duration: 3.4 + index * 0.12,
                            repeat: Infinity,
                            ease: "easeInOut",
                          }}
                        >
                          {card.emoji}
                        </motion.div>
                        <span className="jvs-chip">Open</span>
                      </div>

                      <h3
                        style={{
                          margin: "12px 0 0",
                          fontSize: "15.5px",
                          lineHeight: 1.2,
                          color: "#172033",
                          fontWeight: 950,
                          letterSpacing: "-0.02em",
                        }}
                      >
                        {card.title}
                      </h3>

                      <p
                        style={{
                          margin: "7px 0 0",
                          fontSize: "11.8px",
                          lineHeight: 1.5,
                          color: "#49615d",
                          fontWeight: 700,
                        }}
                      >
                        {card.description}
                      </p>
                    </div>
                  </motion.div>
                </Link>
              </motion.div>
            ))}
          </div>
        </section>
      </div>

      <AnimatePresence>
        {selectedResult && (
          <motion.div
            className="jvs-modal-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSelectedResult(null)}
          >
            <motion.div
              className="jvs-modal-card jvs-glass"
              initial={{ opacity: 0, y: 20, scale: 0.96, rotateX: -8 }}
              animate={{ opacity: 1, y: 0, scale: 1, rotateX: 0 }}
              exit={{ opacity: 0, y: 14, scale: 0.97 }}
              transition={{ type: "spring", stiffness: 240, damping: 22 }}
              onClick={(event) => event.stopPropagation()}
            >
              <div
                style={{
                  padding: "19px 19px 13px",
                  borderBottom: "1px solid rgba(24,72,63,0.1)",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  gap: "14px",
                }}
              >
                <div>
                  <span className="jvs-chip">{selectedResult.type}</span>
                  <h2
                    style={{
                      margin: "10px 0 4px",
                      fontSize: "21px",
                      lineHeight: 1.2,
                    }}
                  >
                    {selectedResult.title}
                  </h2>
                  <p
                    style={{
                      margin: 0,
                      color: "#49615d",
                      fontSize: "13px",
                      fontWeight: 800,
                    }}
                  >
                    {selectedResult.subtitle}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedResult(null)}
                  style={{
                    border: 0,
                    background: "#173d35",
                    color: "#fff",
                    borderRadius: "15px",
                    padding: "10px 14px",
                    fontWeight: 950,
                    cursor: "pointer",
                  }}
                >
                  Close
                </button>
              </div>

              <div
                style={{
                  padding: "17px 19px 20px",
                  display: "grid",
                  gap: "9px",
                }}
              >
                {Object.entries(selectedResult.details).map(([key, value]) => (
                  <div
                    key={key}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "150px 1fr",
                      gap: "10px",
                      padding: "10px 12px",
                      borderRadius: "16px",
                      background: "rgba(255,255,255,0.48)",
                      border: "1px solid rgba(255,255,255,0.58)",
                    }}
                  >
                    <strong style={{ fontSize: "12px", color: "#7a5512" }}>
                      {key}
                    </strong>
                    <span
                      style={{
                        fontSize: "12px",
                        color: "#172033",
                        fontWeight: 780,
                      }}
                    >
                      {String(value ?? "-")}
                    </span>
                  </div>
                ))}

                {selectedResult.href && (
                  <Link
                    href={selectedResult.href}
                    style={{ marginTop: "8px", textDecoration: "none" }}
                  >
                    <motion.div
                      whileHover={{ y: -2 }}
                      style={{
                        textAlign: "center",
                        padding: "12px 14px",
                        borderRadius: "17px",
                        color: "#fff",
                        background: "linear-gradient(135deg, #173d35, #0f2d28)",
                        fontWeight: 950,
                        boxShadow: "0 16px 32px rgba(23,61,53,0.22)",
                      }}
                    >
                      Open Related Page →
                    </motion.div>
                  </Link>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}
