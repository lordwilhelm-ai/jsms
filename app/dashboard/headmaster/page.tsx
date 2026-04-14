"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { supabase } from "@/lib/supabase";
import ProtectedRoute from "@/app/components/ProtectedRoute";
import LogoutButton from "@/app/components/LogoutButton";
import useSchoolSettings from "@/app/components/useSchoolSettings";

type HeadmasterInfo = {
  full_name: string;
  photo_url: string | null;
  role: string;
  teacher_id: string;
  username: string;
  phone: string;
};

const softwareCards = [
  {
    title: "Student Management System",
    description: "Open student records and student details.",
    href: "/students",
    emoji: "🎓",
  },
  {
    title: "Feeding",
    description: "Open feeding, attendance, and related records.",
    href: "/feeding",
    emoji: "🍽️",
  },
  {
    title: "Report Card",
    description: "Open report cards, scores, and result management.",
    href: "/report-card",
    emoji: "📘",
  },
  {
    title: "Fees",
    description: "Open fees tracking, payments, and arrears.",
    href: "/fees",
    emoji: "💳",
  },
];

const sideMenuItems = [
  { label: "Dashboard", href: "/dashboard/headmaster", emoji: "🏠" },
  { label: "Teachers", href: "/teachers/view", emoji: "👨‍🏫" },
  { label: "Students", href: "/students", emoji: "🎓" },
  { label: "Classes", href: "/classes", emoji: "🏫" },
  { label: "Subjects", href: "/subjects", emoji: "📚" },
  { label: "Settings", href: "/settings", emoji: "⚙️" },
];

export default function HeadmasterDashboardPage() {
  return (
    <ProtectedRoute>
      <HeadmasterDashboardPageClient />
    </ProtectedRoute>
  );
}

function HeadmasterDashboardPageClient() {
  const { settings } = useSchoolSettings();

  const [headmasterInfo, setHeadmasterInfo] = useState<HeadmasterInfo>({
    full_name: "Headmaster",
    photo_url: null,
    role: "headmaster",
    teacher_id: "",
    username: "",
    phone: "",
  });

  useEffect(() => {
    async function loadDashboardData() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const authUserId = session?.user?.id;
      if (!authUserId) return;

      const { data: headmaster } = await supabase
        .from("teachers")
        .select("full_name, photo_url, role, teacher_id, username, phone")
        .eq("auth_user_id", authUserId)
        .limit(1)
        .single();

      if (headmaster) {
        setHeadmasterInfo({
          full_name: headmaster.full_name ?? "Headmaster",
          photo_url: headmaster.photo_url ?? null,
          role: headmaster.role ?? "headmaster",
          teacher_id: headmaster.teacher_id ?? "",
          username: headmaster.username ?? "",
          phone: headmaster.phone ?? "",
        });
      }
    }

    loadDashboardData();
  }, []);

  return (
    <main
      style={{
        minHeight: "100vh",
        background:
          "linear-gradient(135deg, #fffdf2 0%, #fff9db 25%, #fef3c7 55%, #fde68a 100%)",
        fontFamily: "Arial, sans-serif",
        padding: "18px",
      }}
    >
      <div
        style={{
          maxWidth: "1450px",
          margin: "0 auto",
          display: "grid",
          gridTemplateColumns: "280px 1fr",
          gap: "22px",
          alignItems: "start",
        }}
      >
        <aside
          style={{
            position: "sticky",
            top: "18px",
            alignSelf: "start",
            minHeight: "calc(100vh - 36px)",
            borderRadius: "30px",
            overflow: "hidden",
            background: "linear-gradient(180deg, #111827 0%, #1f2937 100%)",
            boxShadow: "0 18px 40px rgba(0,0,0,0.18)",
            border: "1px solid rgba(255,255,255,0.06)",
            color: "#ffffff",
          }}
        >
          <div
            style={{
              padding: "22px 20px 18px",
              borderBottom: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
                marginBottom: "14px",
              }}
            >
              <div
                style={{
                  width: "56px",
                  height: "56px",
                  borderRadius: "18px",
                  overflow: "hidden",
                  background: "rgba(255,255,255,0.08)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  border: "1px solid rgba(255,255,255,0.10)",
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
              </div>

              <div style={{ minWidth: 0 }}>
                <h2
                  style={{
                    margin: 0,
                    fontSize: "19px",
                    lineHeight: 1.2,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {settings.school_name || "JSMS"}
                </h2>
                <p
                  style={{
                    margin: "6px 0 0",
                    fontSize: "11px",
                    color: "rgba(255,255,255,0.72)",
                    lineHeight: 1.5,
                  }}
                >
                  {settings.motto || "School Management"}
                </p>
              </div>
            </div>

            <div
              style={{
                background: "linear-gradient(135deg, #facc15 0%, #f59e0b 100%)",
                color: "#111827",
                borderRadius: "20px",
                padding: "14px",
                boxShadow: "0 10px 22px rgba(250,204,21,0.25)",
              }}
            >
              <p
                style={{
                  margin: 0,
                  fontSize: "11px",
                  fontWeight: 700,
                  opacity: 0.8,
                }}
              >
                Logged in as
              </p>
              <p
                style={{
                  margin: "6px 0 0",
                  fontSize: "16px",
                  fontWeight: 800,
                  lineHeight: 1.25,
                }}
              >
                {headmasterInfo.full_name}
              </p>
              <p
                style={{
                  margin: "4px 0 0",
                  fontSize: "11px",
                  fontWeight: 700,
                  textTransform: "capitalize",
                }}
              >
                {headmasterInfo.role}
              </p>
              {(settings.academic_year || settings.current_term) && (
                <p
                  style={{
                    margin: "8px 0 0",
                    fontSize: "11px",
                    fontWeight: 700,
                  }}
                >
                  {settings.academic_year}
                  {settings.academic_year && settings.current_term ? " • " : ""}
                  {settings.current_term}
                </p>
              )}
            </div>
          </div>

          <div style={{ padding: "18px 14px 16px" }}>
            <p
              style={{
                margin: "0 10px 12px",
                fontSize: "11px",
                letterSpacing: "1px",
                textTransform: "uppercase",
                color: "rgba(255,255,255,0.58)",
              }}
            >
              Main Menu
            </p>

            <div style={{ display: "grid", gap: "10px" }}>
              {sideMenuItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  style={{
                    textDecoration: "none",
                    color: "inherit",
                  }}
                >
                  <motion.div
                    whileHover={{ x: 4 }}
                    transition={{ type: "spring", stiffness: 260, damping: 18 }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "12px",
                      padding: "13px 14px",
                      borderRadius: "18px",
                      background: "rgba(255,255,255,0.06)",
                      border: "1px solid rgba(255,255,255,0.06)",
                    }}
                  >
                    <span style={{ fontSize: "16px" }}>{item.emoji}</span>
                    <span
                      style={{
                        fontSize: "13px",
                        fontWeight: 700,
                      }}
                    >
                      {item.label}
                    </span>
                  </motion.div>
                </Link>
              ))}
            </div>

            <div style={{ marginTop: "18px" }}>
              <LogoutButton
                style={{
                  width: "100%",
                  background: "#b91c1c",
                  borderRadius: "18px",
                  padding: "13px 16px",
                  fontSize: "13px",
                  fontWeight: 700,
                }}
              />
            </div>
          </div>
        </aside>

        <section>
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35 }}
            style={{
              position: "relative",
              overflow: "hidden",
              background: "linear-gradient(135deg, #111827 0%, #1f2937 100%)",
              color: "#ffffff",
              borderRadius: "34px",
              padding: "28px 26px",
              boxShadow: "0 18px 40px rgba(0,0,0,0.14)",
              marginBottom: "24px",
            }}
          >
            <div
              style={{
                position: "absolute",
                top: "-50px",
                right: "-20px",
                width: "190px",
                height: "190px",
                borderRadius: "999px",
                background: "rgba(250,204,21,0.14)",
              }}
            />
            <div
              style={{
                position: "absolute",
                bottom: "-70px",
                left: "-20px",
                width: "190px",
                height: "190px",
                borderRadius: "999px",
                background: "rgba(245,158,11,0.14)",
              }}
            />

            <div style={{ position: "relative", zIndex: 1 }}>
              <p
                style={{
                  margin: 0,
                  fontSize: "11px",
                  textTransform: "uppercase",
                  letterSpacing: "1px",
                  color: "rgba(255,255,255,0.72)",
                }}
              >
                Headmaster Dashboard
              </p>

              <h1
                style={{
                  margin: "10px 0 10px",
                  fontSize: "28px",
                  lineHeight: 1.15,
                  color: "#ffffff",
                }}
              >
                Hello,{" "}
                <span style={{ color: "#facc15" }}>
                  {headmasterInfo.full_name}
                </span>
              </h1>

              <p
                style={{
                  margin: 0,
                  maxWidth: "700px",
                  color: "rgba(255,255,255,0.85)",
                  lineHeight: 1.7,
                  fontSize: "13px",
                }}
              >
                {settings.school_name
                  ? `${settings.school_name} oversight area.`
                  : "School oversight area."}{" "}
                Open the main software modules here, and use the side menu for
                teacher view, student records, classes, subjects, and settings.
              </p>
            </div>
          </motion.div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))",
              gap: "20px",
            }}
          >
            {softwareCards.map((card, index) => (
              <motion.div
                key={card.title}
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: index * 0.05 }}
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
                    whileHover={{ y: -6, scale: 1.01 }}
                    transition={{ type: "spring", stiffness: 260, damping: 18 }}
                    style={{
                      background: "rgba(255,255,255,0.96)",
                      borderRadius: "30px",
                      padding: "22px",
                      minHeight: "225px",
                      boxShadow: "0 10px 28px rgba(0,0,0,0.08)",
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "space-between",
                      border: "1px solid rgba(245,158,11,0.12)",
                    }}
                  >
                    <div>
                      <div
                        style={{
                          width: "64px",
                          height: "64px",
                          borderRadius: "20px",
                          background:
                            "linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: "28px",
                          marginBottom: "18px",
                          boxShadow: "0 10px 22px rgba(245,158,11,0.16)",
                        }}
                      >
                        {card.emoji}
                      </div>

                      <h3
                        style={{
                          margin: 0,
                          fontSize: "18px",
                          lineHeight: 1.25,
                          color: "#111827",
                          fontWeight: 800,
                        }}
                      >
                        {card.title}
                      </h3>

                      <p
                        style={{
                          margin: "12px 0 0",
                          fontSize: "13px",
                          lineHeight: 1.7,
                          color: "#6b7280",
                        }}
                      >
                        {card.description}
                      </p>
                    </div>

                    <div
                      style={{
                        marginTop: "18px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                      }}
                    >
                      <span
                        style={{
                          fontSize: "12px",
                          fontWeight: 800,
                          color: "#b45309",
                        }}
                      >
                        Open Module
                      </span>

                      <div
                        style={{
                          width: "40px",
                          height: "40px",
                          borderRadius: "14px",
                          background: "#111827",
                          color: "#ffffff",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: "16px",
                        }}
                      >
                        →
                      </div>
                    </div>
                  </motion.div>
                </Link>
              </motion.div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
