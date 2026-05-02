"use client";

import Link from "next/link";

export default function IncomeExpenditurePage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#f7f4ec",
        fontFamily: "Arial, sans-serif",
        padding: "18px",
      }}
    >
      <div style={{ maxWidth: "1000px", margin: "0 auto" }}>
        <div
          style={{
            background: "linear-gradient(135deg, #111827 0%, #1f2937 100%)",
            color: "#fff",
            borderRadius: "24px",
            padding: "24px",
            border: "2px solid #d4a017",
            marginBottom: "18px",
          }}
        >
          <p
            style={{
              margin: 0,
              fontSize: "11px",
              letterSpacing: "1px",
              textTransform: "uppercase",
              color: "rgba(255,255,255,0.72)",
            }}
          >
            JSMS Finance
          </p>

          <h1 style={{ margin: "8px 0 0", fontSize: "28px" }}>
            Income & Expenditure
          </h1>

          <p style={{ margin: "8px 0 0", color: "rgba(255,255,255,0.82)" }}>
            This module will handle school income, expenses, balances, and financial reports.
          </p>

          <Link
            href="/dashboard/admin"
            style={{
              display: "inline-flex",
              marginTop: "16px",
              textDecoration: "none",
              color: "#111827",
              background: "#d4a017",
              padding: "10px 14px",
              borderRadius: "12px",
              fontWeight: 800,
            }}
          >
            Back to Dashboard
          </Link>
        </div>
      </div>
    </main>
  );
}
