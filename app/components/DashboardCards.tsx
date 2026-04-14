"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import type { DashboardCard } from "@/lib/dashboard-data";

export default function DashboardCards({ cards }: { cards: DashboardCard[] }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
        gap: "18px",
      }}
    >
      {cards.map((card, index) => (
        <motion.div
          key={card.title}
          initial={{ opacity: 0, y: 22 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: index * 0.06 }}
        >
          <Link
            href={card.href}
            style={{
              textDecoration: "none",
              color: "inherit",
              display: "block",
            }}
          >
            <motion.div
              whileHover={{ y: -6, scale: 1.01 }}
              whileTap={{ scale: 0.98 }}
              transition={{ type: "spring", stiffness: 260, damping: 18 }}
              style={{
                minHeight: "210px",
                borderRadius: "24px",
                padding: "20px",
                background:
                  "linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(240,253,244,0.95) 100%)",
                border: "1px solid rgba(16,185,129,0.14)",
                boxShadow: "0 14px 35px rgba(0,0,0,0.08)",
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
                    background:
                      "linear-gradient(135deg, #dcfce7 0%, #bbf7d0 100%)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "27px",
                    boxShadow: "0 8px 18px rgba(16,185,129,0.14)",
                    marginBottom: "16px",
                  }}
                >
                  {card.emoji}
                </div>

                <h2
                  style={{
                    margin: 0,
                    fontSize: "18px",
                    color: "#111827",
                    lineHeight: 1.25,
                  }}
                >
                  {card.title}
                </h2>

                <p
                  style={{
                    marginTop: "10px",
                    color: "#6b7280",
                    lineHeight: 1.6,
                    fontSize: "13px",
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
                    color: "#065f46",
                    fontWeight: 700,
                    fontSize: "13px",
                  }}
                >
                  Open Module
                </span>

                <div
                  style={{
                    width: "40px",
                    height: "40px",
                    borderRadius: "14px",
                    background: "#064e3b",
                    color: "#fff",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "18px",
                    flexShrink: 0,
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
  );
}