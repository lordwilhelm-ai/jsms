"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { authedFetch } from "@/lib/apiClient";

type TermRecord = {
  academicYear: string;
  term: string;
  className: string;
  scores: {
    subject_name: string;
    class_score: number | null;
    exam_score: number | null;
    total_score: number | null;
    grade: string | null;
    position: string | null;
    remark: string | null;
  }[];
  attendance: {
    days_present: number | null;
    days_absent: number | null;
    total_school_days: number | null;
  } | null;
  remark: {
    conduct: string | null;
    attitude: string | null;
    interest: string | null;
    teacher_remark: string | null;
    promoted_to: string | null;
    teacher_name: string | null;
  } | null;
};

type DetailResponse = {
  student: Record<string, any>;
  reportCardTerms: TermRecord[];
  feePayments: Record<string, any>[];
  uniformPayments: Record<string, any>[];
  uniformsGiven: Record<string, any>[];
  booksGiven: Record<string, any>[];
  feedingSummary: {
    totalEntries: number;
    totalPaid: number;
    daysAte: number;
    firstDate: string | null;
    lastDate: string | null;
  };
};

const COLORS = {
  bg: "#fffdf2",
  card: "#ffffff",
  border: "#e5e7eb",
  text: "#111827",
  muted: "#6b7280",
  gold: "#d4a017",
};

function money(value: unknown) {
  const num = Number(value ?? 0);
  if (!Number.isFinite(num)) return "GHS 0.00";
  return `GHS ${num.toFixed(2)}`;
}

function sectionCard(children: React.ReactNode, key?: string) {
  return (
    <div
      key={key}
      style={{
        background: COLORS.card,
        border: `1px solid ${COLORS.border}`,
        borderRadius: "16px",
        padding: "18px",
        marginBottom: "16px",
      }}
    >
      {children}
    </div>
  );
}

export default function GraduatedStudentDetailPage() {
  const params = useParams<{ id: string }>();
  const studentRowId = params?.id;

  const [data, setData] = useState<DetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!studentRowId) return;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const response = await authedFetch(`/api/students/graduated/${studentRowId}`);
        const json = await response.json();
        if (!response.ok) throw new Error(json.error || "Failed to load student record.");
        setData(json);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load student record.");
      } finally {
        setLoading(false);
      }
    })();
  }, [studentRowId]);

  return (
    <main
      style={{
        minHeight: "100vh",
        background: COLORS.bg,
        fontFamily: "Arial, sans-serif",
        color: COLORS.text,
        padding: "24px",
      }}
    >
      <div style={{ maxWidth: "900px", margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
          <h1 style={{ margin: 0, fontSize: "22px" }}>Graduated Student Record</h1>
          <Link
            href="/students/graduated"
            style={{
              padding: "10px 16px",
              borderRadius: "10px",
              background: "#111827",
              color: "#fff",
              textDecoration: "none",
              fontSize: "13px",
              fontWeight: 700,
            }}
          >
            Back to Graduated Students
          </Link>
        </div>

        {loading && <div style={{ textAlign: "center", padding: "40px", color: COLORS.muted }}>Loading...</div>}

        {error && (
          <div
            style={{
              background: "#fee2e2",
              color: "#991b1b",
              borderRadius: "10px",
              padding: "12px 14px",
              marginBottom: "16px",
              fontSize: "13px",
              fontWeight: 600,
            }}
          >
            {error}
          </div>
        )}

        {data && (
          <>
            {sectionCard(
              <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                {data.student.photo_url ? (
                  <img
                    src={data.student.photo_url}
                    alt=""
                    style={{ width: "64px", height: "64px", borderRadius: "50%", objectFit: "cover" }}
                  />
                ) : (
                  <div
                    style={{
                      width: "64px",
                      height: "64px",
                      borderRadius: "50%",
                      background: "#fef3c7",
                      color: "#92400e",
                      display: "grid",
                      placeItems: "center",
                      fontWeight: 800,
                      fontSize: "22px",
                    }}
                  >
                    {String(data.student.full_name || "?").charAt(0)}
                  </div>
                )}
                <div>
                  <div style={{ fontSize: "18px", fontWeight: 800 }}>{data.student.full_name}</div>
                  <div style={{ fontSize: "13px", color: COLORS.muted }}>
                    {data.student.student_id} • {data.student.gender || "—"} •{" "}
                    {data.reportCardTerms.length > 0
                      ? `Graduated ${data.reportCardTerms[data.reportCardTerms.length - 1].academicYear}`
                      : "Graduation year unknown"}
                  </div>
                </div>
              </div>
            )}

            {sectionCard(
              <>
                <h2 style={{ margin: "0 0 12px", fontSize: "16px" }}>Report Cards — All Terms</h2>
                {data.reportCardTerms.length === 0 ? (
                  <p style={{ color: COLORS.muted, fontSize: "13px" }}>No report card records found.</p>
                ) : (
                  data.reportCardTerms.map((term, idx) => (
                    <div
                      key={`${term.academicYear}-${term.term}`}
                      style={{
                        marginBottom: idx === data.reportCardTerms.length - 1 ? 0 : "18px",
                        paddingBottom: idx === data.reportCardTerms.length - 1 ? 0 : "18px",
                        borderBottom: idx === data.reportCardTerms.length - 1 ? "none" : `1px solid ${COLORS.border}`,
                      }}
                    >
                      <div style={{ fontWeight: 700, fontSize: "14px", marginBottom: "8px" }}>
                        {term.academicYear} — {term.term} ({term.className})
                      </div>

                      {term.attendance && (
                        <div style={{ fontSize: "12px", color: COLORS.muted, marginBottom: "8px" }}>
                          Attendance: {term.attendance.days_present ?? "—"} present /{" "}
                          {term.attendance.total_school_days ?? "—"} school days
                        </div>
                      )}

                      {term.scores.length > 0 && (
                        <div style={{ overflowX: "auto", marginBottom: "8px" }}>
                          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
                            <thead>
                              <tr style={{ background: "#f9fafb", textAlign: "left" }}>
                                <th style={{ padding: "6px 8px" }}>Subject</th>
                                <th style={{ padding: "6px 8px" }}>Class</th>
                                <th style={{ padding: "6px 8px" }}>Exam</th>
                                <th style={{ padding: "6px 8px" }}>Total</th>
                                <th style={{ padding: "6px 8px" }}>Grade</th>
                                <th style={{ padding: "6px 8px" }}>Position</th>
                              </tr>
                            </thead>
                            <tbody>
                              {term.scores.map((s, i) => (
                                <tr key={i} style={{ borderTop: `1px solid ${COLORS.border}` }}>
                                  <td style={{ padding: "6px 8px" }}>{s.subject_name}</td>
                                  <td style={{ padding: "6px 8px" }}>{s.class_score ?? "—"}</td>
                                  <td style={{ padding: "6px 8px" }}>{s.exam_score ?? "—"}</td>
                                  <td style={{ padding: "6px 8px", fontWeight: 700 }}>{s.total_score ?? "—"}</td>
                                  <td style={{ padding: "6px 8px" }}>{s.grade || "—"}</td>
                                  <td style={{ padding: "6px 8px" }}>{s.position || "—"}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}

                      {term.remark && (
                        <div style={{ fontSize: "12px", color: COLORS.text }}>
                          {term.remark.teacher_remark && <div>Remark: {term.remark.teacher_remark}</div>}
                          {term.remark.conduct && <div>Conduct: {term.remark.conduct}</div>}
                          {term.remark.promoted_to && <div>Promoted To: {term.remark.promoted_to}</div>}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </>
            )}

            {sectionCard(
              <>
                <h2 style={{ margin: "0 0 12px", fontSize: "16px" }}>Fee Payments</h2>
                {data.feePayments.length === 0 ? (
                  <p style={{ color: COLORS.muted, fontSize: "13px" }}>No fee payment records found.</p>
                ) : (
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
                      <thead>
                        <tr style={{ background: "#f9fafb", textAlign: "left" }}>
                          <th style={{ padding: "6px 8px" }}>Date</th>
                          <th style={{ padding: "6px 8px" }}>Term</th>
                          <th style={{ padding: "6px 8px" }}>Receipt</th>
                          <th style={{ padding: "6px 8px" }}>Amount Paid</th>
                          <th style={{ padding: "6px 8px" }}>Balance After</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.feePayments.map((p, i) => (
                          <tr key={i} style={{ borderTop: `1px solid ${COLORS.border}` }}>
                            <td style={{ padding: "6px 8px" }}>{p.payment_date || "—"}</td>
                            <td style={{ padding: "6px 8px" }}>
                              {p.academic_year} {p.term}
                            </td>
                            <td style={{ padding: "6px 8px" }}>{p.receipt_no || "—"}</td>
                            <td style={{ padding: "6px 8px", fontWeight: 700 }}>{money(p.amount_paid)}</td>
                            <td style={{ padding: "6px 8px" }}>{money(p.balance_after_payment)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}

            {sectionCard(
              <>
                <h2 style={{ margin: "0 0 12px", fontSize: "16px" }}>Feeding</h2>
                <div style={{ fontSize: "13px", color: COLORS.text }}>
                  {data.feedingSummary.totalEntries} feeding record{data.feedingSummary.totalEntries === 1 ? "" : "s"}
                  {data.feedingSummary.firstDate
                    ? ` from ${data.feedingSummary.firstDate} to ${data.feedingSummary.lastDate}`
                    : ""}
                  , {data.feedingSummary.daysAte} day(s) ate, total paid {money(data.feedingSummary.totalPaid)}.
                </div>
              </>
            )}

            {sectionCard(
              <>
                <h2 style={{ margin: "0 0 12px", fontSize: "16px" }}>Uniforms</h2>
                <div style={{ fontSize: "13px", color: COLORS.text, marginBottom: "6px" }}>
                  Payments: {data.uniformPayments.length} totaling{" "}
                  {money(data.uniformPayments.reduce((sum, p) => sum + Number(p.amount_paid || 0), 0))}
                </div>
                <div style={{ fontSize: "13px", color: COLORS.text }}>
                  Items given: {data.uniformsGiven.length}
                  {data.uniformsGiven.length > 0
                    ? ` (${data.uniformsGiven.map((u) => `${u.item_name} x${u.quantity_given}`).join(", ")})`
                    : ""}
                </div>
              </>
            )}

            {sectionCard(
              <>
                <h2 style={{ margin: "0 0 12px", fontSize: "16px" }}>Books</h2>
                <div style={{ fontSize: "13px", color: COLORS.text }}>
                  Issued: {data.booksGiven.length}
                  {data.booksGiven.length > 0
                    ? ` (${data.booksGiven.map((b) => `${b.book_name} x${b.quantity_given}`).join(", ")})`
                    : ""}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </main>
  );
}
