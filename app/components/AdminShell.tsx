"use client";

import Link from "next/link";
import { ReactNode } from "react";
import { motion } from "framer-motion";

type NavItem = {
  label: string;
  href: string;
  emoji: string;
};

type AdminShellProps = {
  title: string;
  subtitle?: string;
  sectionLabel?: string;
  children: ReactNode;
  showSidebar?: boolean;
  navItems?: NavItem[];
};

const defaultNavItems: NavItem[] = [
  { label: "Dashboard", href: "/dashboard/admin", emoji: "🏠" },
  { label: "Students", href: "/students", emoji: "🎓" },
  { label: "Teachers", href: "/teachers", emoji: "👨‍🏫" },
  { label: "Classes", href: "/classes", emoji: "🏫" },
  { label: "Subjects", href: "/subjects", emoji: "📚" },
  { label: "Settings", href: "/settings", emoji: "⚙️" },
];

export default function AdminShell({
  title,
  subtitle,
  sectionLabel = "JSMS",
  children,
  showSidebar = true,
  navItems = defaultNavItems,
}: AdminShellProps) {
  return (
    <main
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(circle at top left, #dcfce7 0%, #f8fafc 35%, #ecfdf5 100%)",
        fontFamily: "Arial, sans-serif",
      }}
    >
      <div
        style={{
          maxWidth: "1380px",
          margin: "0 auto",
          padding: "20px 14px",
          display: "grid",
          gridTemplateColumns: showSidebar ? "280px 1fr" : "1fr",
          gap: "20px",
        }}
      >
        {showSidebar && (
          <aside
            style={{
              position: "sticky",
              top: "20px",
              alignSelf: "start",
              borderRadius: "28px",
              overflow: "hidden",
              background: "linear-gradient(180deg, #064e3b 0%, #022c22 100%)",
              color: "#fff",
              boxShadow: "0 20px 45px rgba(0,0,0,0.18)",
              minHeight: "calc(100vh - 40px)",
            }}
          >
            <div
              style={{
                padding: "24px 20px 18px",
                borderBottom: "1px solid rgba(255,255,255,0.08)",
              }}
            >
              <div
                style={{
                  width: "56px",
                  height: "56px",
                  borderRadius: "18px",
                  background: "rgba(255,255,255,0.10)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "24px",
                  marginBottom: "14px",
                }}
              >
                🏛️
              </div>

              <h2
                style={{
                  margin: 0,
                  fontSize: "22px",
                  lineHeight: 1.2,
                }}
              >
                JSMS
              </h2>

              <p
                style={{
                  margin: "8px 0 0",
                  fontSize: "13px",
                  lineHeight: 1.6,
                  color: "rgba(255,255,255,0.78)",
                }}
              >
                Jefsem Student Management System
              </p>
            </div>

            <div style={{ padding: "18px 14px" }}>
              <p
                style={{
                  margin: "0 8px 12px",
                  fontSize: "12px",
                  textTransform: "uppercase",
                  letterSpacing: "1px",
                  color: "rgba(255,255,255,0.65)",
                }}
              >
                Main Menu
              </p>

              <div style={{ display: "grid", gap: "8px" }}>
                {navItems.map((item) => (
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
                        padding: "14px 14px",
                        borderRadius: "18px",
                        background: "rgba(255,255,255,0.06)",
                        border: "1px solid rgba(255,255,255,0.06)",
                      }}
                    >
                      <span style={{ fontSize: "18px" }}>{item.emoji}</span>
                      <span style={{ fontSize: "14px", fontWeight: 600 }}>
                        {item.label}
                      </span>
                    </motion.div>
                  </Link>
                ))}
              </div>
            </div>
          </aside>
        )}

        <section style={{ minWidth: 0 }}>
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35 }}
            style={{
              position: "relative",
              overflow: "hidden",
              background: "linear-gradient(135deg, #064e3b 0%, #022c22 100%)",
              color: "#fff",
              borderRadius: "30px",
              padding: "30px 24px",
              boxShadow: "0 20px 45px rgba(0,0,0,0.18)",
              marginBottom: "20px",
            }}
          >
            <div
              style={{
                position: "absolute",
                top: "-40px",
                right: "-20px",
                width: "180px",
                height: "180px",
                borderRadius: "999px",
                background: "rgba(255,255,255,0.08)",
              }}
            />
            <div
              style={{
                position: "absolute",
                bottom: "-60px",
                left: "-10px",
                width: "180px",
                height: "180px",
                borderRadius: "999px",
                background: "rgba(255,255,255,0.06)",
              }}
            />

            <div style={{ position: "relative", zIndex: 1 }}>
              <p
                style={{
                  margin: 0,
                  fontSize: "12px",
                  letterSpacing: "1px",
                  textTransform: "uppercase",
                  color: "rgba(255,255,255,0.78)",
                }}
              >
                {sectionLabel}
              </p>

              <h1
                style={{
                  margin: "10px 0 10px",
                  fontSize: "32px",
                  lineHeight: 1.15,
                }}
              >
                {title}
              </h1>

              {subtitle && (
                <p
                  style={{
                    margin: 0,
                    maxWidth: "760px",
                    color: "rgba(255,255,255,0.86)",
                    lineHeight: 1.7,
                    fontSize: "15px",
                  }}
                >
                  {subtitle}
                </p>
              )}
            </div>
          </motion.div>

          <div>{children}</div>
        </section>
      </div>

      <style jsx>{`
        @media (max-width: 980px) {
          main > div {
            grid-template-columns: 1fr !important;
          }
          aside {
            min-height: auto !important;
            position: static !important;
          }
        }
      `}</style>
    </main>
  );
}