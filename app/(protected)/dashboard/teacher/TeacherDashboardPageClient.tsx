"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import LogoutButton from "@/app/components/LogoutButton";
import useSchoolSettings from "@/app/components/useSchoolSettings";
import { supabase } from "@/lib/supabase";

type TeacherInfo = {
  full_name: string;
  photo_url: string | null;
  role: string;
  teacher_id: string;
  username: string;
  phone: string;
};

const teacherCards = [
  {
    title: "Teacher Attendance",
    description: "Check in, check out, and view your attendance records.",
    href: "/teacher-attendance",
    emoji: "📊",
  },
  {
    title: "Feeding",
    description: "Record feeding and student attendance.",
    href: "/feeding/teacher",
    emoji: "🍽️",
  },
  {
    title: "Students Database",
    description: "View student details and records.",
    href: "/sds",
    emoji: "🎓",
  },
  {
    title: "Report Card",
    description: "Upload results and manage reports.",
    href: "/report-card",
    emoji: "📘",
  },
  {
    title: "Fees",
    description: "View class fee information.",
    href: "/fees/teacher",
    emoji: "💳",
  },
  {
    title: "Books",
    description: "View books given or sold to students in your class.",
    href: "/books/teacher",
    emoji: "📚",
  },
  {
    title: "Uniforms",
    description: "View uniforms given or sold to students in your class.",
    href: "/uniforms/teacher",
    emoji: "👕",
  },
];

const teacherMenuItems = [
  { label: "Dashboard", href: "/dashboard/teacher", emoji: "🏠" },
  { label: "About Me", href: "/about-me", emoji: "👤" },
  { label: "Change Password", href: "/change-password", emoji: "🔐" },
];

export default function TeacherDashboardPageClient() {
  const { settings } = useSchoolSettings();

  const [menuOpen, setMenuOpen] = useState(false);
  const [teacherInfo, setTeacherInfo] = useState<TeacherInfo>({
    full_name: "Teacher",
    photo_url: null,
    role: "teacher",
    teacher_id: "",
    username: "",
    phone: "",
  });

  useEffect(() => {
    async function loadTeacherData() {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        const authUserId = session?.user?.id;
        if (!authUserId) return;

        const { data: teacher } = await supabase
          .from("teachers")
          .select("full_name, photo_url, role, teacher_id, username, phone")
          .eq("auth_user_id", authUserId)
          .limit(1)
          .single();

        if (teacher) {
          setTeacherInfo({
            full_name: teacher.full_name ?? "Teacher",
            photo_url: teacher.photo_url ?? null,
            role: teacher.role ?? "teacher",
            teacher_id: teacher.teacher_id ?? "",
            username: teacher.username ?? "",
            phone: teacher.phone ?? "",
          });
        }
      } catch (error) {
        console.error("Teacher dashboard data load error:", error);
      }
    }

    loadTeacherData();
  }, []);

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#f3f4f6",
        fontFamily: "Arial, sans-serif",
      }}
    >
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 20,
          background: "#ffffff",
          borderBottom: "1px solid #e5e7eb",
          padding: "18px 22px",
        }}
      >
        <div
          style={{
            maxWidth: "1100px",
            margin: "0 auto",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "16px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "14px",
              minWidth: 0,
            }}
          >
            <div
              style={{
                width: "44px",
                height: "44px",
                borderRadius: "16px",
                background: "#eef2ff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                overflow: "hidden",
                flexShrink: 0,
              }}
            >
              {teacherInfo.photo_url ? (
                <img
                  src={teacherInfo.photo_url}
                  alt={teacherInfo.full_name}
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                  }}
                />
              ) : settings.logo_url ? (
                <img
                  src={settings.logo_url}
                  alt={settings.school_name || "School logo"}
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                  }}
                />
              ) : (
                <span style={{ fontSize: "20px" }}>👤</span>
              )}
            </div>

            <div style={{ minWidth: 0 }}>
              <h1
                style={{
                  margin: 0,
                  fontSize: "20px",
                  fontWeight: 900,
                  color: "#111827",
                  letterSpacing: "1px",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  maxWidth: "70vw",
                }}
              >
                {settings.school_name || "JEFSEM VISION SCHOOL"}
              </h1>

              <p
                style={{
                  margin: "6px 0 0",
                  fontSize: "12px",
                  color: "#6b7280",
                  fontWeight: 600,
                }}
              >
                Teacher Dashboard
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setMenuOpen((prev) => !prev)}
            style={{
              border: "none",
              background: "transparent",
              fontSize: "30px",
              cursor: "pointer",
              color: "#111827",
              lineHeight: 1,
              padding: "8px",
            }}
            aria-label="Open menu"
          >
            ☰
          </button>
        </div>

        {menuOpen && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            style={{
              maxWidth: "1100px",
              margin: "16px auto 0",
              background: "#ffffff",
              border: "1px solid #e5e7eb",
              borderRadius: "20px",
              padding: "12px",
              boxShadow: "0 12px 30px rgba(0,0,0,0.08)",
            }}
          >
            <div
              style={{
                display: "grid",
                gap: "8px",
              }}
            >
              {teacherMenuItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMenuOpen(false)}
                  style={{
                    textDecoration: "none",
                    color: "#111827",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                      padding: "12px 14px",
                      borderRadius: "14px",
                      background: "#f9fafb",
                      fontSize: "14px",
                      fontWeight: 800,
                    }}
                  >
                    <span>{item.emoji}</span>
                    <span>{item.label}</span>
                  </div>
                </Link>
              ))}

              <LogoutButton
                style={{
                  width: "100%",
                  background: "#b91c1c",
                  borderRadius: "14px",
                  padding: "12px 14px",
                  fontSize: "14px",
                  fontWeight: 800,
                  marginTop: "4px",
                }}
              />
            </div>
          </motion.div>
        )}
      </header>

      <section
        style={{
          maxWidth: "1100px",
          margin: "0 auto",
          padding: "28px 18px 50px",
        }}
      >
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          style={{
            background: "#ffffff",
            borderRadius: "28px",
            padding: "22px",
            marginBottom: "22px",
            boxShadow: "0 12px 30px rgba(0,0,0,0.06)",
            border: "1px solid #e5e7eb",
          }}
        >
          <p
            style={{
              margin: 0,
              fontSize: "12px",
              color: "#6b7280",
              textTransform: "uppercase",
              letterSpacing: "1px",
              fontWeight: 800,
            }}
          >
            Welcome
          </p>

          <h2
            style={{
              margin: "8px 0 0",
              fontSize: "24px",
              color: "#111827",
              fontWeight: 900,
              lineHeight: 1.2,
            }}
          >
            {teacherInfo.full_name}
          </h2>

          {(settings.academic_year || settings.current_term) && (
            <p
              style={{
                margin: "10px 0 0",
                fontSize: "13px",
                color: "#6b7280",
                fontWeight: 700,
              }}
            >
              {settings.academic_year}
              {settings.academic_year && settings.current_term ? " • " : ""}
              {settings.current_term}
            </p>
          )}
        </motion.div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            gap: "18px",
          }}
        >
          {teacherCards.map((card, index) => (
            <motion.div
              key={card.title}
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, delay: index * 0.04 }}
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
                  whileTap={{ scale: 0.98 }}
                  whileHover={{ y: -4 }}
                  transition={{ type: "spring", stiffness: 260, damping: 18 }}
                  style={{
                    background: "#ffffff",
                    borderRadius: "28px",
                    padding: "24px",
                    minHeight: "185px",
                    boxShadow: "0 12px 30px rgba(0,0,0,0.06)",
                    border: "1px solid #e5e7eb",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                  }}
                >
                  <div>
                    <div
                      style={{
                        width: "58px",
                        height: "58px",
                        borderRadius: "18px",
                        background: "#eff6ff",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "26px",
                        marginBottom: "18px",
                      }}
                    >
                      {card.emoji}
                    </div>

                    <h3
                      style={{
                        margin: 0,
                        color: "#111827",
                        fontSize: "22px",
                        lineHeight: 1.2,
                        fontWeight: 900,
                      }}
                    >
                      {card.title}
                    </h3>

                    <p
                      style={{
                        margin: "12px 0 0",
                        color: "#6b7280",
                        fontSize: "14px",
                        lineHeight: 1.6,
                        fontWeight: 500,
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
    </main>
  );
}