"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { supabase } from "@/lib/supabase";
import LogoutButton from "@/app/components/LogoutButton";

type TeacherInfo = {
  full_name: string;
  photo_url: string | null;
  role: string;
  teacher_id: string;
  username: string;
  phone: string;
};

const softwareCards = [
  {
    title: "Student Management",
    description: "View student details and records",
    href: "/students",
    emoji: "🎓",
  },
  {
    title: "Feeding",
    description: "Record feeding and attendance",
    href: "/feeding",
    emoji: "🍽️",
  },
  {
    title: "Report Card",
    description: "Upload results and manage reports",
    href: "/report-card",
    emoji: "📘",
  },
  {
    title: "Fees",
    description: "View class fee information",
    href: "/fees",
    emoji: "💳",
  },
];

export default function TeacherDashboardPageClient() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [showAbout, setShowAbout] = useState(false);

  const [schoolName, setSchoolName] = useState("School");
  const [teacherInfo, setTeacherInfo] = useState<TeacherInfo>({
    full_name: "Teacher",
    photo_url: null,
    role: "teacher",
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

      const { data: settings } = await supabase
        .from("school_settings")
        .select("school_name")
        .limit(1)
        .single();

      if (settings?.school_name) {
        setSchoolName(settings.school_name);
      }

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
    }

    loadDashboardData();
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
          height: "72px",
          background: "#ffffff",
          borderBottom: "1px solid #e5e7eb",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 16px",
          position: "sticky",
          top: 0,
          zIndex: 30,
        }}
      >
        <div
          style={{
            minWidth: 0,
            display: "flex",
            alignItems: "center",
            gap: "12px",
          }}
        >
          <div
            style={{
              width: "42px",
              height: "42px",
              borderRadius: "14px",
              overflow: "hidden",
              background: "#eef7fd",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
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
            ) : (
              <span style={{ fontSize: "18px" }}>👤</span>
            )}
          </div>

          <div style={{ minWidth: 0 }}>
            <h1
              style={{
                margin: 0,
                fontSize: "17px",
                fontWeight: 800,
                color: "#111827",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {schoolName}
            </h1>
            <p
              style={{
                margin: "3px 0 0",
                fontSize: "11px",
                color: "#6b7280",
              }}
            >
              Teacher Dashboard
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setMenuOpen(true)}
          aria-label="Open menu"
          style={{
            border: "none",
            background: "transparent",
            padding: 0,
            width: "40px",
            height: "40px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            flexShrink: 0,
          }}
        >
          <div style={{ display: "grid", gap: "4px" }}>
            <span
              style={{
                display: "block",
                width: "23px",
                height: "2.5px",
                background: "#111827",
                borderRadius: "999px",
              }}
            />
            <span
              style={{
                display: "block",
                width: "23px",
                height: "2.5px",
                background: "#111827",
                borderRadius: "999px",
              }}
            />
            <span
              style={{
                display: "block",
                width: "23px",
                height: "2.5px",
                background: "#111827",
                borderRadius: "999px",
              }}
            />
          </div>
        </button>
      </header>

      <AnimatePresence>
        {menuOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => {
                setMenuOpen(false);
                setShowAbout(false);
              }}
              style={{
                position: "fixed",
                inset: 0,
                background: "rgba(0,0,0,0.28)",
                zIndex: 40,
              }}
            />

            <motion.aside
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "tween", duration: 0.22 }}
              style={{
                position: "fixed",
                top: 0,
                right: 0,
                width: "76%",
                maxWidth: "285px",
                height: "100vh",
                background: "#ffffff",
                zIndex: 50,
                boxShadow: "-10px 0 30px rgba(0,0,0,0.16)",
                display: "flex",
                flexDirection: "column",
              }}
            >
              <div
                style={{
                  height: "72px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "0 16px",
                  borderBottom: "1px solid #e5e7eb",
                }}
              >
                <h2
                  style={{
                    margin: 0,
                    fontSize: "15px",
                    color: "#111827",
                    fontWeight: 700,
                  }}
                >
                  Menu
                </h2>

                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    setShowAbout(false);
                  }}
                  aria-label="Close menu"
                  style={{
                    border: "none",
                    background: "transparent",
                    fontSize: "26px",
                    lineHeight: 1,
                    cursor: "pointer",
                    color: "#111827",
                  }}
                >
                  ×
                </button>
              </div>

              <div
                style={{
                  padding: "14px",
                  display: "flex",
                  flexDirection: "column",
                  height: "100%",
                }}
              >
                <div style={{ display: "grid", gap: "8px" }}>
                  <LinkItem
                    href="/dashboard/teacher"
                    label="Dashboard"
                    onClick={() => setMenuOpen(false)}
                  />
                  <LinkItem
                    href="/students"
                    label="Student Management"
                    onClick={() => setMenuOpen(false)}
                  />
                  <LinkItem
                    href="/feeding"
                    label="Feeding"
                    onClick={() => setMenuOpen(false)}
                  />
                  <LinkItem
                    href="/report-card"
                    label="Report Card"
                    onClick={() => setMenuOpen(false)}
                  />
                  <LinkItem
                    href="/fees"
                    label="Fees"
                    onClick={() => setMenuOpen(false)}
                  />

                  <button
                    type="button"
                    onClick={() => setShowAbout((prev) => !prev)}
                    style={menuButtonStyle}
                  >
                    About Me
                  </button>

                  <AnimatePresence>
                    {showAbout && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.2 }}
                        style={{ overflow: "hidden" }}
                      >
                        <div
                          style={{
                            background: "#f8fafc",
                            border: "1px solid #e5e7eb",
                            borderRadius: "14px",
                            padding: "12px",
                            display: "grid",
                            gap: "8px",
                            marginTop: "4px",
                          }}
                        >
                          <InfoRow label="Full Name" value={teacherInfo.full_name} />
                          <InfoRow label="Teacher ID" value={teacherInfo.teacher_id} />
                          <InfoRow label="Username" value={teacherInfo.username} />
                          <InfoRow label="Phone" value={teacherInfo.phone} />
                          <InfoRow label="Role" value={teacherInfo.role} />
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                <div style={{ marginTop: "auto", paddingTop: "18px" }}>
                  <div style={{ display: "grid", gap: "8px" }}>
                    <LinkItem
                      href="/change-password"
                      label="Change Password"
                      onClick={() => setMenuOpen(false)}
                    />

                    <LogoutButton
                      onDone={() => {
                        setMenuOpen(false);
                        setShowAbout(false);
                      }}
                    />
                  </div>
                </div>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <div
        style={{
          maxWidth: "760px",
          margin: "0 auto",
          padding: "22px 16px 30px",
        }}
      >
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          style={{
            background: "#ffffff",
            borderRadius: "30px",
            padding: "28px 24px",
            boxShadow: "0 4px 14px rgba(0,0,0,0.08)",
            marginBottom: "24px",
          }}
        >
          <h2
            style={{
              margin: 0,
              fontSize: "28px",
              lineHeight: 1.2,
              fontWeight: 800,
              color: "#111827",
            }}
          >
            Hello,{" "}
            <span style={{ color: "#1d9bf0" }}>
              {teacherInfo.full_name}
            </span>
          </h2>

          <p
            style={{
              margin: "14px 0 0",
              fontSize: "16px",
              lineHeight: 1.55,
              color: "#6b7280",
              maxWidth: "420px",
            }}
          >
            Welcome back. Choose the software you want to continue to.
          </p>
        </motion.div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
            gap: "18px",
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
                  whileHover={{ y: -4 }}
                  transition={{ type: "spring", stiffness: 260, damping: 18 }}
                  style={{
                    background: "#ffffff",
                    borderRadius: "28px",
                    padding: "22px",
                    minHeight: "220px",
                    boxShadow: "0 4px 14px rgba(0,0,0,0.08)",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                  }}
                >
                  <div>
                    <div
                      style={{
                        width: "64px",
                        height: "64px",
                        borderRadius: "18px",
                        background: "#eef7fd",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "28px",
                        marginBottom: "18px",
                      }}
                    >
                      {card.emoji}
                    </div>

                    <h3
                      style={{
                        margin: 0,
                        fontSize: "20px",
                        lineHeight: 1.25,
                        color: "#111827",
                        fontWeight: 800,
                      }}
                    >
                      {card.title}
                    </h3>

                    <p
                      style={{
                        margin: "14px 0 0",
                        fontSize: "14px",
                        lineHeight: 1.7,
                        color: "#6b7280",
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
      </div>
    </main>
  );
}

function LinkItem({
  href,
  label,
  onClick,
}: {
  href: string;
  label: string;
  onClick?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      style={{
        textDecoration: "none",
        color: "#111827",
        background: "#f9fafb",
        border: "1px solid #e5e7eb",
        borderRadius: "14px",
        padding: "11px 13px",
        fontWeight: 600,
        fontSize: "12px",
        lineHeight: 1.35,
      }}
    >
      {label}
    </Link>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p
        style={{
          margin: 0,
          fontSize: "10px",
          color: "#6b7280",
          marginBottom: "3px",
        }}
      >
        {label}
      </p>
      <p
        style={{
          margin: 0,
          fontSize: "12px",
          color: "#111827",
          fontWeight: 600,
          textTransform: label === "Role" ? "capitalize" : "none",
        }}
      >
        {value || "-"}
      </p>
    </div>
  );
}

const menuButtonStyle: React.CSSProperties = {
  border: "1px solid #e5e7eb",
  background: "#f9fafb",
  color: "#111827",
  borderRadius: "14px",
  padding: "11px 13px",
  fontWeight: 600,
  fontSize: "12px",
  cursor: "pointer",
  textAlign: "left",
};
