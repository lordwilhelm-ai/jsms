"use client";

import Link from "next/link";

export default function BooksFinancePage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#f7f4ec",
        fontFamily: "Arial, sans-serif",
        padding: "16px",
      }}
    >
      <div style={{ maxWidth: "900px", margin: "0 auto" }}>
        <div
          style={{
            background: "linear-gradient(135deg, #0f172a 0%, #111827 100%)",
            color: "#fff",
            borderRadius: "20px",
            padding: "18px",
            border: "2px solid #d4a017",
          }}
        >
          <p style={{ margin: 0, fontSize: "11px", textTransform: "uppercase" }}>
            JSMS Finance
          </p>
          <h1 style={{ margin: "8px 0 0" }}>Books</h1>
          <p style={{ margin: "8px 0 0", color: "rgba(255,255,255,0.82)" }}>
            Books stock, sales, cost, and profit module will be built here. Only profit will feed into main income.
          </p>

          <Link
            href="/income-expenditure"
            style={{
              display: "inline-flex",
              marginTop: "14px",
              textDecoration: "none",
              background: "#d4a017",
              color: "#111827",
              padding: "10px 13px",
              borderRadius: "11px",
              fontWeight: 800,
            }}
          >
            Back to Income & Expenditure
          </Link>
        </div>
      </div>
    </main>
  );
}
