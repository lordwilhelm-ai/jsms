"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type AnyRow = Record<string, any>;
type ScholarshipType = "regular" | "full" | "half" | "custom";
type StudentType = "returning" | "new";

type DraftRow = {
  studentType: StudentType;
  scholarshipType: ScholarshipType;
  customScholarshipAmount: string;
  arrears: string;
};

type StudentViewRow = AnyRow & {
  studentIdValue: string;
  classNameValue: string;
  draft: DraftRow;
  totalPaid: number;
  totalOwed: number;
  balance: number;
  status: "paid" | "part" | "unpaid";
  paymentHistory: AnyRow[];
};

type PaymentModalState = {
  studentDbId: string;
  studentIdValue: string;
  studentName: string;
  classNameValue: string;
  totalOwed: number;
  totalPaid: number;
  balance: number;
};

const CLASS_ORDER = [
  "Playroom 1",
  "Playroom 2",
  "KG 1",
  "KG 2",
  "Class 1",
  "Class 2",
  "Class 3",
  "Class 4",
  "Class 5",
  "Class 6",
  "JHS 1",
  "JHS 2",
  "JHS 3",
];

const STORAGE_KEY = "jvs_fees_record_payment_drafts_v5";

const COLORS = {
  bg: "#f7f4ec",
  sidebar: "#0f172a",
  sidebarSoft: "#111827",
  gold: "#d4a017",
  card: "#ffffff",
  text: "#111827",
  muted: "#6b7280",
  border: "#e5e7eb",
  successBg: "#dcfce7",
  successText: "#166534",
  warningBg: "#fef3c7",
  warningText: "#a16207",
  dangerBg: "#fee2e2",
  dangerText: "#991b1b",
};

function getRole(row: AnyRow | null) {
  const raw = String(row?.role || "").trim().toLowerCase();
  if (raw === "owner" || raw === "admin" || raw === "headmaster") return raw;
  return "teacher";
}

function getClassName(row: AnyRow) {
  return String(row.class_name || row.className || row.name || "").trim();
}

function getStudentIdValue(row: AnyRow) {
  return String(row.student_id || row.studentId || row.id || "").trim();
}

function numberValue(value: unknown) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

function formatMoney(value: number) {
  return `GHS ${value.toFixed(2)}`;
}

function getPaymentStatus(balance: number, totalPaid: number): "paid" | "part" | "unpaid" {
  if (balance <= 0) return "paid";
  if (totalPaid > 0) return "part";
  return "unpaid";
}

function getStatusStyle(status: "paid" | "part" | "unpaid") {
  if (status === "paid") {
    return { bg: COLORS.successBg, color: COLORS.successText, label: "Paid" };
  }
  if (status === "part") {
    return { bg: COLORS.warningBg, color: COLORS.warningText, label: "Part Payment" };
  }
  return { bg: COLORS.dangerBg, color: COLORS.dangerText, label: "Not Paid" };
}

function getDefaultDraft(student: AnyRow): DraftRow {
  const scholarshipRaw = String(student.scholarship_type || "none").trim().toLowerCase();

  let scholarshipType: ScholarshipType = "regular";
  if (scholarshipRaw === "full") scholarshipType = "full";
  else if (scholarshipRaw === "half") scholarshipType = "half";
  else if (scholarshipRaw === "custom") scholarshipType = "custom";

  return {
    studentType: student.is_new === true ? "new" : "returning",
    scholarshipType,
    customScholarshipAmount: String(numberValue(student.scholarship_amount) || ""),
    arrears: String(numberValue(student.arrears) || ""),
  };
}

function computeTotals(params: {
  draft: DraftRow;
  classRow: AnyRow | null;
  totalPaid: number;
}) {
  const { draft, classRow, totalPaid } = params;

  const returningFee = numberValue(classRow?.fee_returning);
  const newFee = numberValue(classRow?.fee_new);

  let baseFee = draft.studentType === "new" ? newFee : returningFee;

  if (draft.scholarshipType === "full") baseFee = 0;
  if (draft.scholarshipType === "half") baseFee = baseFee / 2;
  if (draft.scholarshipType === "custom") baseFee = numberValue(draft.customScholarshipAmount);

  const arrears = numberValue(draft.arrears);
  const totalOwed = baseFee + arrears;
  const balance = totalOwed - totalPaid;
  const status = getPaymentStatus(balance, totalPaid);

  return { totalOwed, balance, status };
}

function getLast4FromStudentId(studentId: string) {
  const digits = studentId.replace(/\D/g, "");
  if (digits.length >= 4) return digits.slice(-4);
  return studentId.slice(-4).padStart(4, "0");
}

function buildReceiptNo(studentId: string, existingPayments: AnyRow[]) {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const dd = String(now.getDate()).padStart(2, "0");
  const last4 = getLast4FromStudentId(studentId);

  const prefix = `JVSF/${yy}${dd}/${last4}`;
  const samePrefixCount = existingPayments.filter((row) =>
    String(row.receipt_no || "").startsWith(prefix)
  ).length;

  const counter = String(samePrefixCount + 1).padStart(2, "0");
  return `${prefix}/${counter}`;
}

export default function RecordPaymentPage() {
  const router = useRouter();

  const [checkingUser, setCheckingUser] = useState(true);
  const [loading, setLoading] = useState(true);

  const [settingsRow, setSettingsRow] = useState<AnyRow | null>(null);
  const [classes, setClasses] = useState<AnyRow[]>([]);
  const [students, setStudents] = useState<AnyRow[]>([]);
  const [payments, setPayments] = useState<AnyRow[]>([]);

  const [selectedClass, setSelectedClass] = useState(CLASS_ORDER[0]);
  const [studentSearch, setStudentSearch] = useState("");
  const [drafts, setDrafts] = useState<Record<string, DraftRow>>({});

  const [savingStudentId, setSavingStudentId] = useState("");
  const [savingPayment, setSavingPayment] = useState(false);
  const [message, setMessage] = useState("");

  const [paymentModal, setPaymentModal] = useState<PaymentModalState | null>(null);
  const [historyModal, setHistoryModal] = useState<StudentViewRow | null>(null);

  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [paymentNotes, setPaymentNotes] = useState("");

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setDrafts(JSON.parse(raw));
    } catch {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(drafts));
    } catch {}
  }, [drafts]);

  useEffect(() => {
    let active = true;

    async function loadPage() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!active) return;

      if (!session?.user) {
        router.replace("/");
        return;
      }

      const [teachersRes, settingsRes, classesRes, studentsRes, paymentsRes] = await Promise.all([
        supabase.from("teachers").select("*"),
        supabase.from("school_settings").select("*").limit(1).maybeSingle(),
        supabase.from("classes").select("*"),
        supabase.from("students").select("*"),
        supabase.from("fee_payments").select("*").order("created_at", { ascending: false }),
      ]);

      if (!active) return;

      if (teachersRes.error || !teachersRes.data || teachersRes.data.length === 0) {
        router.replace("/");
        return;
      }

      const userRow =
        teachersRes.data.find((item) => item.auth_user_id === session.user.id) ||
        teachersRes.data.find(
          (item) =>
            String(item.email || "").trim().toLowerCase() ===
            String(session.user.email || "").trim().toLowerCase()
        ) ||
        null;

      if (!userRow) {
        router.replace("/");
        return;
      }

      if (getRole(userRow) === "teacher") {
        router.replace("/fees/teacher");
        return;
      }

      const classRows = classesRes.data || [];
      const firstAvailableClass =
        CLASS_ORDER.find((name) => classRows.some((row) => getClassName(row) === name)) ||
        getClassName(classRows[0] || {}) ||
        CLASS_ORDER[0];

      setSettingsRow(settingsRes.data || null);
      setClasses(classRows);
      setStudents(studentsRes.data || []);
      setPayments(paymentsRes.data || []);
      setSelectedClass(firstAvailableClass);
      setCheckingUser(false);
      setLoading(false);
    }

    void loadPage();

    return () => {
      active = false;
    };
  }, [router]);

  const academicYear = String(settingsRow?.academic_year || "");
  const currentTerm = String(settingsRow?.current_term || "");

  const classButtons = useMemo(() => {
    const availableNames = classes.map((row) => getClassName(row));
    const ordered = CLASS_ORDER.filter((name) => availableNames.includes(name));
    const extras = availableNames.filter((name) => !ordered.includes(name)).sort();
    return [...ordered, ...extras];
  }, [classes]);

  const classMap = useMemo(() => {
    const map = new Map<string, AnyRow>();
    classes.forEach((row) => map.set(getClassName(row), row));
    return map;
  }, [classes]);

  const currentTermPayments = useMemo(() => {
    return payments.filter(
      (row) =>
        String(row.academic_year || "") === academicYear &&
        String(row.term || "") === currentTerm
    );
  }, [payments, academicYear, currentTerm]);

  const visibleStudents = useMemo<StudentViewRow[]>(() => {
    const search = studentSearch.trim().toLowerCase();

    return students
      .filter((student) => {
        const classNameValue = getClassName(student);
        if (classNameValue !== selectedClass) return false;
        if (typeof student.active === "boolean" && !student.active) return false;

        if (!search) return true;

        const name = String(student.full_name || "").toLowerCase();
        const id = getStudentIdValue(student).toLowerCase();
        return name.includes(search) || id.includes(search);
      })
      .map((student) => {
        const studentIdValue = getStudentIdValue(student);
        const paymentHistory = currentTermPayments
          .filter((row) => String(row.student_id || "") === studentIdValue)
          .sort((a, b) => {
            const aTime = new Date(String(a.created_at || a.payment_date || "")).getTime();
            const bTime = new Date(String(b.created_at || b.payment_date || "")).getTime();
            return bTime - aTime;
          });

        const totalPaid = paymentHistory.reduce(
          (sum, row) => sum + numberValue(row.amount_paid),
          0
        );

        const draft = drafts[studentIdValue] || getDefaultDraft(student);
        const totals = computeTotals({
          draft,
          classRow: classMap.get(selectedClass) || null,
          totalPaid,
        });

        return {
          ...student,
          studentIdValue,
          classNameValue: selectedClass,
          draft,
          totalPaid,
          totalOwed: totals.totalOwed,
          balance: totals.balance,
          status: totals.status,
          paymentHistory,
        };
      })
      .sort((a, b) => String(a.full_name || "").localeCompare(String(b.full_name || "")));
  }, [students, studentSearch, selectedClass, currentTermPayments, drafts, classMap]);

  function updateDraft(student: AnyRow, patch: Partial<DraftRow>) {
    const studentIdValue = getStudentIdValue(student);
    setDrafts((prev) => ({
      ...prev,
      [studentIdValue]: {
        ...(prev[studentIdValue] || getDefaultDraft(student)),
        ...patch,
      },
    }));
  }

  async function saveStudentSetup(student: AnyRow) {
    const studentIdValue = getStudentIdValue(student);
    const draft = drafts[studentIdValue] || getDefaultDraft(student);

    try {
      setSavingStudentId(studentIdValue);
      setMessage("");

      const scholarshipTypeMap: Record<ScholarshipType, string> = {
        regular: "none",
        full: "full",
        half: "half",
        custom: "custom",
      };

      const payload = {
        is_new: draft.studentType === "new",
        scholarship_type: scholarshipTypeMap[draft.scholarshipType],
        scholarship_amount:
          draft.scholarshipType === "custom" ? numberValue(draft.customScholarshipAmount) : 0,
        arrears: numberValue(draft.arrears),
      };

      const { error } = await supabase.from("students").update(payload).eq("id", student.id);
      if (error) throw error;

      setStudents((prev) =>
        prev.map((row) => (row.id === student.id ? { ...row, ...payload } : row))
      );

      setMessage(`${String(student.full_name || "Student")} setup saved.`);
    } catch (error) {
      console.error(error);
      setMessage(error instanceof Error ? `Error: ${error.message}` : "Error: Failed to save.");
    } finally {
      setSavingStudentId("");
    }
  }

  function openPayment(student: StudentViewRow) {
    setPaymentModal({
      studentDbId: String(student.id || ""),
      studentIdValue: student.studentIdValue,
      studentName: String(student.full_name || "-"),
      classNameValue: student.classNameValue,
      totalOwed: student.totalOwed,
      totalPaid: student.totalPaid,
      balance: student.balance,
    });
    setPaymentAmount("");
    setPaymentMethod("cash");
    setPaymentNotes("");
  }

  async function savePayment() {
    if (!paymentModal) return;

    const amount = numberValue(paymentAmount);
    if (amount <= 0) {
      setMessage("Error: Enter a valid payment amount.");
      return;
    }

    try {
      setSavingPayment(true);
      setMessage("");

      const now = new Date();
      const receiptNo = buildReceiptNo(paymentModal.studentIdValue, payments);
      const paymentDate = now.toISOString().slice(0, 10);

      const payload = {
        receipt_no: receiptNo,
        student_id: paymentModal.studentIdValue,
        student_name: paymentModal.studentName,
        class_name: paymentModal.classNameValue,
        academic_year: academicYear,
        term: currentTerm,
        payment_type: "fees",
        amount_paid: amount,
        method: paymentMethod,
        payment_date: paymentDate,
        recorded_by: "Admin",
        notes: paymentNotes || null,
        created_at: now.toISOString(),
      };

      const { error } = await supabase.from("fee_payments").insert([payload]);
      if (error) throw error;

      setPayments((prev) => [payload, ...prev]);
      setPaymentModal(null);
      setPaymentAmount("");
      setPaymentNotes("");
      setMessage(`Payment recorded successfully. Receipt: ${receiptNo}`);
    } catch (error) {
      console.error(error);
      setMessage(
        error instanceof Error ? `Error: ${error.message}` : "Error: Failed to record payment."
      );
    } finally {
      setSavingPayment(false);
    }
  }

  if (checkingUser || loading) {
    return <div style={{ padding: "24px" }}>Loading record payment page...</div>;
  }

  return (
    <main
      style={{
        height: "100vh",
        background: COLORS.bg,
        fontFamily: "Arial, sans-serif",
        color: COLORS.text,
        overflow: "hidden",
      }}
    >
      <div style={{ display: "flex", height: "100%" }}>
        <aside
          style={{
            width: "280px",
            background: `linear-gradient(180deg, ${COLORS.sidebar} 0%, ${COLORS.sidebarSoft} 100%)`,
            color: "#fff",
            padding: "20px 16px",
            borderRight: `4px solid ${COLORS.gold}`,
            overflowY: "auto",
            flexShrink: 0,
          }}
        >
          <h2 style={{ margin: 0, fontSize: "22px" }}>Record Payment</h2>
          <div style={{ marginTop: "18px", display: "grid", gap: "10px" }}>
            {classButtons.map((className) => {
              const selected = selectedClass === className;
              return (
                <button
                  key={className}
                  onClick={() => setSelectedClass(className)}
                  style={{
                    textAlign: "left",
                    border: selected ? `2px solid ${COLORS.gold}` : "1px solid rgba(255,255,255,0.08)",
                    background: selected ? "rgba(212,160,23,0.16)" : "rgba(255,255,255,0.06)",
                    color: "#fff",
                    padding: "13px 14px",
                    borderRadius: "12px",
                    fontWeight: selected ? "bold" : 600,
                    cursor: "pointer",
                    transition: "all 0.2s ease",
                    transform: selected ? "translateX(4px)" : "translateX(0px)",
                  }}
                >
                  {className}
                </button>
              );
            })}
          </div>
        </aside>

        <section
          style={{
            flex: 1,
            height: "100%",
            overflowY: "auto",
            padding: "24px",
          }}
        >
          <div
            style={{
              background: `linear-gradient(135deg, ${COLORS.sidebar} 0%, #1f2937 100%)`,
              color: "#fff",
              padding: "22px",
              borderRadius: "22px",
              marginBottom: "20px",
              border: `2px solid ${COLORS.gold}`,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: "16px",
                flexWrap: "wrap",
                alignItems: "center",
              }}
            >
              <div>
                <h2 style={{ margin: 0, fontSize: "30px" }}>Record Fees</h2>
                <p style={{ margin: "8px 0 0", color: "#d1d5db" }}>{selectedClass}</p>
              </div>

              <Link href="/fees/admin" style={topButtonStyle}>
                Back to Dashboard
              </Link>
            </div>
          </div>

          {message && (
            <div
              style={{
                background: message.startsWith("Error:") ? COLORS.dangerBg : COLORS.successBg,
                color: message.startsWith("Error:") ? COLORS.dangerText : COLORS.successText,
                borderRadius: "14px",
                padding: "14px 16px",
                marginBottom: "20px",
                fontWeight: "bold",
              }}
            >
              {message}
            </div>
          )}

          <div
            style={{
              background: COLORS.card,
              borderRadius: "18px",
              border: `1px solid ${COLORS.border}`,
              boxShadow: "0 10px 25px rgba(0,0,0,0.06)",
              padding: "14px",
              marginBottom: "20px",
            }}
          >
            <input
              type="text"
              placeholder={`Search student in ${selectedClass}`}
              value={studentSearch}
              onChange={(e) => setStudentSearch(e.target.value)}
              style={searchInputStyle}
            />
          </div>

          <div style={{ display: "grid", gap: "14px", paddingBottom: "24px" }}>
            {visibleStudents.length === 0 ? (
              <div
                style={{
                  background: COLORS.card,
                  borderRadius: "18px",
                  padding: "18px",
                  border: `1px solid ${COLORS.border}`,
                }}
              >
                No students found.
              </div>
            ) : (
              visibleStudents.map((student) => {
                const statusStyle = getStatusStyle(student.status);

                return (
                  <div
                    key={student.studentIdValue}
                    style={{
                      background: COLORS.card,
                      borderRadius: "20px",
                      border: `1px solid ${COLORS.border}`,
                      boxShadow: "0 8px 18px rgba(0,0,0,0.05)",
                      padding: "16px",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: "12px",
                        flexWrap: "wrap",
                        alignItems: "center",
                        marginBottom: "12px",
                      }}
                    >
                      <div>
                        <h3 style={{ margin: 0, color: COLORS.sidebar, fontSize: "18px" }}>
                          {String(student.full_name || "-")}
                        </h3>
                        <p style={{ margin: "4px 0 0", color: COLORS.muted, fontSize: "13px" }}>
                          ID: {student.studentIdValue}
                        </p>
                      </div>

                      <span
                        style={{
                          background: statusStyle.bg,
                          color: statusStyle.color,
                          padding: "7px 11px",
                          borderRadius: "999px",
                          fontWeight: "bold",
                          fontSize: "12px",
                        }}
                      >
                        {statusStyle.label}
                      </span>
                    </div>

                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
                        gap: "10px",
                        marginBottom: "12px",
                      }}
                    >
                      <FieldSelect
                        label="Student Type"
                        value={student.draft.studentType}
                        onChange={(value) =>
                          updateDraft(student, { studentType: value as StudentType })
                        }
                        options={[
                          { value: "returning", label: "Returning Student" },
                          { value: "new", label: "New Student" },
                        ]}
                      />

                      <FieldSelect
                        label="Scholarship"
                        value={student.draft.scholarshipType}
                        onChange={(value) =>
                          updateDraft(student, { scholarshipType: value as ScholarshipType })
                        }
                        options={[
                          { value: "regular", label: "Regular Fee" },
                          { value: "full", label: "Full Scholarship" },
                          { value: "half", label: "Half Scholarship" },
                          { value: "custom", label: "Custom Scholarship" },
                        ]}
                      />

                      {student.draft.scholarshipType === "custom" && (
                        <FieldInput
                          label="Scholarship Amount"
                          value={student.draft.customScholarshipAmount}
                          onChange={(value) =>
                            updateDraft(student, { customScholarshipAmount: value })
                          }
                        />
                      )}

                      <FieldInput
                        label="Arrears"
                        value={student.draft.arrears}
                        onChange={(value) => updateDraft(student, { arrears: value })}
                      />
                    </div>

                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
                        gap: "10px",
                        marginBottom: "12px",
                      }}
                    >
                      <MiniInfo label="Total" value={formatMoney(student.totalOwed)} />
                      <MiniInfo label="Paid" value={formatMoney(student.totalPaid)} />
                      <MiniInfo label="Balance" value={formatMoney(student.balance)} />
                    </div>

                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                      <button
                        onClick={() => saveStudentSetup(student)}
                        disabled={savingStudentId === student.studentIdValue}
                        style={primaryButtonStyle}
                      >
                        {savingStudentId === student.studentIdValue ? "Saving..." : "Save Setup"}
                      </button>

                      <button onClick={() => openPayment(student)} style={secondaryButtonStyle}>
                        Record Payment
                      </button>

                      <button onClick={() => setHistoryModal(student)} style={secondaryButtonStyle}>
                        History
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>
      </div>

      {paymentModal && (
        <div
          onClick={() => setPaymentModal(null)}
          style={overlayStyle}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={modalCardStyle}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: "12px",
                alignItems: "start",
                marginBottom: "18px",
              }}
            >
              <div>
                <p style={{ margin: 0, color: COLORS.gold, fontWeight: "bold" }}>Record Payment</p>
                <h3 style={{ margin: "6px 0 0", color: COLORS.sidebar }}>
                  {paymentModal.studentName}
                </h3>
                <p style={{ margin: "6px 0 0", color: COLORS.muted, fontSize: "13px" }}>
                  {paymentModal.classNameValue} • {paymentModal.studentIdValue}
                </p>
              </div>

              <button onClick={() => setPaymentModal(null)} style={closeButtonStyle}>
                Close
              </button>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                gap: "12px",
                marginBottom: "16px",
              }}
            >
              <MiniInfo label="Total Owed" value={formatMoney(paymentModal.totalOwed)} />
              <MiniInfo label="Paid So Far" value={formatMoney(paymentModal.totalPaid)} />
              <MiniInfo label="Balance" value={formatMoney(paymentModal.balance)} />
              <MiniInfo
                label="Next Receipt"
                value={buildReceiptNo(paymentModal.studentIdValue, payments)}
              />
            </div>

            <div style={{ display: "grid", gap: "12px" }}>
              <FieldInput label="Amount Paying Now" value={paymentAmount} onChange={setPaymentAmount} />
              <FieldSelect
                label="Payment Method"
                value={paymentMethod}
                onChange={setPaymentMethod}
                options={[
                  { value: "cash", label: "Cash" },
                  { value: "momo", label: "MoMo" },
                  { value: "bank", label: "Bank" },
                ]}
              />
              <FieldTextarea label="Notes" value={paymentNotes} onChange={setPaymentNotes} />
            </div>

            <div style={{ marginTop: "18px", display: "flex", gap: "10px", flexWrap: "wrap" }}>
              <button onClick={savePayment} disabled={savingPayment} style={primaryButtonStyle}>
                {savingPayment ? "Saving..." : "Save Payment"}
              </button>
            </div>
          </div>
        </div>
      )}

      {historyModal && (
        <div onClick={() => setHistoryModal(null)} style={overlayStyle}>
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ ...modalCardStyle, maxWidth: "760px" }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: "12px",
                alignItems: "start",
                marginBottom: "18px",
              }}
            >
              <div>
                <p style={{ margin: 0, color: COLORS.gold, fontWeight: "bold" }}>Payment History</p>
                <h3 style={{ margin: "6px 0 0", color: COLORS.sidebar }}>
                  {String(historyModal.full_name || "-")}
                </h3>
                <p style={{ margin: "6px 0 0", color: COLORS.muted, fontSize: "13px" }}>
                  {historyModal.classNameValue} • {historyModal.studentIdValue}
                </p>
              </div>

              <button onClick={() => setHistoryModal(null)} style={closeButtonStyle}>
                Close
              </button>
            </div>

            {historyModal.paymentHistory.length === 0 ? (
              <p style={{ color: COLORS.muted, marginBottom: 0 }}>No payment has been recorded yet.</p>
            ) : (
              <div style={{ display: "grid", gap: "10px", maxHeight: "60vh", overflowY: "auto" }}>
                {historyModal.paymentHistory.map((payment) => (
                  <div
                    key={String(payment.receipt_no || payment.id)}
                    style={{
                      border: `1px solid ${COLORS.border}`,
                      borderRadius: "14px",
                      padding: "14px",
                      background: "#fff",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: "12px",
                        flexWrap: "wrap",
                      }}
                    >
                      <div>
                        <strong>{String(payment.receipt_no || "-")}</strong>
                        <p style={{ margin: "6px 0 0", color: COLORS.muted, fontSize: "13px" }}>
                          {String(payment.payment_date || "-")} • {String(payment.method || "-")}
                        </p>
                        <p style={{ margin: "4px 0 0", color: COLORS.muted, fontSize: "13px" }}>
                          {String(payment.notes || "")}
                        </p>
                      </div>

                      <div style={{ fontWeight: "bold", color: COLORS.sidebar }}>
                        {formatMoney(numberValue(payment.amount_paid))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}

function FieldInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <input
        type="number"
        min="0"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={inputStyle}
      />
    </div>
  );
}

function FieldSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)} style={inputStyle}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function FieldTextarea({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ ...inputStyle, minHeight: "100px", resize: "vertical" }}
      />
    </div>
  );
}

function MiniInfo({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        background: "#f9fafb",
        border: `1px solid ${COLORS.border}`,
        borderRadius: "12px",
        padding: "10px 12px",
      }}
    >
      <p style={{ margin: 0, fontSize: "11px", color: COLORS.muted }}>{label}</p>
      <p style={{ margin: "5px 0 0", fontWeight: "bold", color: COLORS.sidebar, fontSize: "14px" }}>
        {value}
      </p>
    </div>
  );
}

const topButtonStyle: React.CSSProperties = {
  textDecoration: "none",
  border: "1px solid rgba(255,255,255,0.15)",
  borderRadius: "10px",
  padding: "10px 12px",
  background: "rgba(255,255,255,0.06)",
  color: "#fff",
  cursor: "pointer",
  fontWeight: "bold",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  marginBottom: "6px",
  fontWeight: "bold",
  fontSize: "12px",
  color: COLORS.muted,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: "10px",
  border: `1px solid ${COLORS.border}`,
  fontSize: "14px",
  outline: "none",
  background: "#fff",
};

const searchInputStyle: React.CSSProperties = {
  width: "100%",
  padding: "12px 14px",
  borderRadius: "12px",
  border: `1px solid ${COLORS.border}`,
  fontSize: "14px",
  outline: "none",
  background: "#fff",
};

const primaryButtonStyle: React.CSSProperties = {
  border: "none",
  background: COLORS.gold,
  color: COLORS.sidebar,
  borderRadius: "10px",
  padding: "10px 14px",
  fontWeight: "bold",
  cursor: "pointer",
};

const secondaryButtonStyle: React.CSSProperties = {
  border: `1px solid ${COLORS.border}`,
  background: "#fff",
  color: COLORS.sidebar,
  borderRadius: "10px",
  padding: "10px 14px",
  fontWeight: "bold",
  cursor: "pointer",
};

const closeButtonStyle: React.CSSProperties = {
  border: "none",
  background: COLORS.sidebar,
  color: "#fff",
  borderRadius: "10px",
  padding: "10px 12px",
  cursor: "pointer",
  fontWeight: "bold",
};

const overlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.45)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "20px",
  zIndex: 999,
};

const modalCardStyle: React.CSSProperties = {
  width: "100%",
  maxWidth: "620px",
  background: "#fff",
  borderRadius: "24px",
  padding: "24px",
  boxShadow: "0 30px 60px rgba(0,0,0,0.18)",
};
