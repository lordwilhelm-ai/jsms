"use client";

import AddTeacherForm from "../AddTeacherForm";
import Link from "next/link";

export default function AddTeacherPage() {
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
      <div style={{ maxWidth: "1000px", margin: "0 auto" }}>
        <div
          style={{
            background: "linear-gradient(135deg, #111827 0%, #1f2937 100%)",
            borderRadius: "30px",
            color: "#fff",
            padding: "26px 24px",
            marginBottom: "22px",
            boxShadow: "0 18px 40px rgba(0,0,0,0.14)",
          }}
        >
          <p
            style={{
              margin: 0,
              fontSize: "11px",
              textTransform: "uppercase",
              letterSpacing: "1px",
              color: "rgba(255,255,255,0.72)",
            }}
          >
            Teacher Management
          </p>

          <h1
            style={{
              margin: "10px 0 10px",
              fontSize: "28px",
              lineHeight: 1.15,
            }}
          >
            Add Teacher
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
            Create teacher, admin, or headmaster accounts in the central system.
          </p>
        </div>

        <div
          style={{
            background: "rgba(255,255,255,0.96)",
            borderRadius: "30px",
            padding: "24px",
            boxShadow: "0 10px 28px rgba(0,0,0,0.08)",
            border: "1px solid rgba(245,158,11,0.12)",
          }}
        >
          <div style={{ marginBottom: "18px" }}>
            <Link
              href="/teachers"
              style={{
                textDecoration: "none",
                color: "#b45309",
                fontWeight: 700,
                fontSize: "13px",
              }}
            >
              ← Back to Teachers
            </Link>
          </div>

          <AddTeacherForm />
        </div>
      </div>
    </main>
  );
}
