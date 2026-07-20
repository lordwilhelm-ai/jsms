"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { authedFetch } from "@/lib/apiClient";

type AnyRow = Record<string, any>;
type SendMode = "owing" | "all" | "class" | "level" | "individual";
type ChannelMode = "sms" | "whatsapp" | "both";
type PrintStatus = "all" | "owing" | "cleared";

type Recipient = {
  studentName: string;
  studentId: string;
  className: string;
  levelGroup: string;
  phone: string;
  cleanPhone: string;
  expected: number;
  paid: number;
  balance: number;
  lastPaymentDate: string;
  lastPaymentAmount: number;
  lastReceipt: string;
  paymentCount: number;
  parentLink: string;
  message: string;
};

const COLORS = {
  bg: "#f7f4ec",
  sidebar: "#0f172a",
  gold: "#d4a017",
  card: "#ffffff",
  text: "#111827",
  muted: "#6b7280",
  border: "#e5e7eb",
  danger: "#991b1b",
  success: "#166534",
};

const DEFAULT_MESSAGE =
  "Dear Parent/Guardian, your ward {student_name} ({student_id}) in {class_name} has an outstanding school fees balance of {balance} for {term}, {academic_year}. Kindly make payment. View account: {portal_link}. Thank you. {school_name}";

function text(value: unknown) {
  return String(value || "").trim();
}

function lower(value: unknown) {
  return text(value).toLowerCase();
}

function num(value: unknown) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

function money(value: number) {
  return `GHS ${Number(value || 0).toFixed(2)}`;
}

function formatDate(value: unknown) {
  const raw = text(value);
  if (!raw) return "";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;

  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function getStudentName(row: AnyRow) {
  const direct = text(row.full_name || row.student_name || row.studentName || row.fullName || row.name);
  if (direct) return direct;

  const first = text(row.first_name || row.firstname);
  const other = text(row.other_name || row.middle_name);
  const last = text(row.last_name || row.surname);

  return `${first} ${other} ${last}`.replace(/\s+/g, " ").trim() || "Unknown Student";
}

function getStudentId(row: AnyRow) {
  const direct =
    row.jvs_id ||
    row.student_id ||
    row.jsms_id ||
    row.jvs_student_id ||
    row.student_code ||
    row.admission_number ||
    row.index_number ||
    row.studentId ||
    "";

  if (text(direct).toUpperCase().startsWith("JVS")) {
    return text(direct).toUpperCase().replace(/\s+/g, "");
  }

  for (const value of Object.values(row)) {
    const match = text(value).match(/JVS\s*\d{4,}/i);
    if (match) return match[0].replace(/\s+/g, "").toUpperCase();
  }

  return text(direct || row.id);
}

function getClassName(row: AnyRow) {
  return text(row.class_name || row.className || row.class || row.current_class || row.student_class || row.grade || row.name);
}

function getLevelGroupFromClassName(className: string) {
  const name = lower(className);
  if (name.includes("playroom")) return "Playroom";
  if (name.startsWith("kg")) return "KG";
  if (["class 1", "class 2", "class 3"].includes(name)) return "Lower Primary";
  if (["class 4", "class 5", "class 6"].includes(name)) return "Upper Primary";
  if (name.startsWith("jhs")) return "JHS";
  return "Other";
}

function cleanPhone(phone: string) {
  const digits = text(phone).replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("233") && digits.length >= 12) return digits;
  if (digits.startsWith("0") && digits.length === 10) return `233${digits.slice(1)}`;
  if (digits.length === 9) return `233${digits}`;
  return digits;
}

function getParentPhone(row: AnyRow) {
  const candidates = [
    row.emergency_contact,
    row.emergency_contact_phone,
    row.emergency_phone,
    row.guardian_phone,
    row.parent_phone,
    row.father_phone,
    row.mother_phone,
    row.contact_phone,
    row.phone,
    row.mobile,
  ];

  const found = candidates.find((item) => text(item));
  return text(found);
}

function paymentMatchesStudent(payment: AnyRow, student: AnyRow, studentId: string, studentName: string, className: string) {
  const paymentStudentId = text(payment.student_id || payment.studentId);
  const uuid = text(student.id);
  const paymentName = lower(payment.student_name || payment.full_name || payment.name);
  const paymentClass = lower(payment.class_name || payment.className || payment.class);

  if (studentId && paymentStudentId === studentId) return true;
  if (uuid && paymentStudentId === uuid) return true;

  return Boolean(paymentName) && paymentName === lower(studentName) && (!paymentClass || paymentClass === lower(className));
}

function currentTermPayment(payment: AnyRow, academicYear: string, currentTerm: string) {
  const year = lower(payment.academic_year || payment.year);
  const term = lower(payment.term || payment.current_term);

  const yearOk = !year || !academicYear || year === lower(academicYear);
  const termOk = !term || !currentTerm || term === lower(currentTerm);

  return yearOk && termOk;
}

function getPaymentAmount(row: AnyRow) {
  return num(row.amount_paid || row.amount || row.paid_amount || row.payment_amount);
}

function getPaymentDate(row: AnyRow) {
  return (
    row.payment_date ||
    row.paid_at ||
    row.created_at ||
    row.date_paid ||
    row.paymentDate ||
    row.date ||
    ""
  );
}

function getReceiptNumber(row: AnyRow) {
  return text(row.receipt_no || row.receipt_number || row.receipt || row.reference || row.payment_reference || row.paystack_reference);
}

function calculateExpected(student: AnyRow, classRow: AnyRow | null, newStudentItems: AnyRow[]) {
  const className = getClassName(student);
  const levelGroup = text(classRow?.fee_level_group) || getLevelGroupFromClassName(className);
  const isNew = student.is_new === true || lower(student.student_type) === "new";

  const continuingFee = num(classRow?.fee_returning || classRow?.fee_amount || classRow?.amount);
  const newItemsTotal = newStudentItems
    .filter((item) => text(item.level_group) === levelGroup && item.is_active !== false)
    .reduce((sum, item) => sum + num(item.amount), 0);

  const newFee = newItemsTotal || num(classRow?.fee_new || classRow?.new_student_fee);
  let baseFee = isNew ? newFee : continuingFee;

  const scholarship = lower(student.scholarship_type || student.scholarship || student.fee_type);
  const customAmount = num(student.scholarship_amount || student.custom_fee_amount || student.custom_fee || student.special_fee_amount);

  if (scholarship === "full" || scholarship === "full scholarship") baseFee = 0;
  else if (scholarship === "half" || scholarship === "half scholarship") baseFee = baseFee / 2;
  else if (scholarship === "custom" || scholarship === "custom amount" || scholarship === "special") baseFee = customAmount;
  else if (customAmount > 0 && Boolean(student.has_custom_fee || student.custom_fee_amount || student.custom_fee)) baseFee = customAmount;

  const arrears = num(student.arrears || student.previous_balance || student.old_balance);

  return Math.max(baseFee + arrears, 0);
}

function fillMessage(template: string, data: Recipient, settings: { schoolName: string; academicYear: string; currentTerm: string }) {
  return template
    .replaceAll("{student_name}", data.studentName)
    .replaceAll("{student_id}", data.studentId)
    .replaceAll("{class_name}", data.className)
    .replaceAll("{expected}", money(data.expected))
    .replaceAll("{paid}", money(data.paid))
    .replaceAll("{balance}", money(data.balance))
    .replaceAll("{portal_link}", data.parentLink)
    .replaceAll("{term}", settings.currentTerm || "current term")
    .replaceAll("{academic_year}", settings.academicYear || "current academic year")
    .replaceAll("{school_name}", settings.schoolName || "JEFSEM VISION SCHOOL");
}

function inputStyle(): React.CSSProperties {
  return {
    width: "100%",
    border: `1px solid ${COLORS.border}`,
    borderRadius: "16px",
    padding: "14px 16px",
    fontSize: "16px",
    outline: "none",
    background: "#fff",
  };
}

export default function FeeReminderPage() {
  const [loading, setLoading] = useState(true);
  const [students, setStudents] = useState<AnyRow[]>([]);
  const [classes, setClasses] = useState<AnyRow[]>([]);
  const [payments, setPayments] = useState<AnyRow[]>([]);
  const [newItems, setNewItems] = useState<AnyRow[]>([]);
  const [settings, setSettings] = useState<AnyRow | null>(null);

  const [sendMode, setSendMode] = useState<SendMode>("owing");
  const [channel, setChannel] = useState<ChannelMode>("sms");
  const [selectedClass, setSelectedClass] = useState("");
  const [selectedLevel, setSelectedLevel] = useState("");
  const [studentSearch, setStudentSearch] = useState("");
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [messageTemplate, setMessageTemplate] = useState(DEFAULT_MESSAGE);
  const [customPath, setCustomPath] = useState("/parent/fee/{student_id}");
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState("");

  const [printClass, setPrintClass] = useState("");
  const [printStatus, setPrintStatus] = useState<PrintStatus>("all");

  useEffect(() => {
    async function loadData() {
      setLoading(true);

      const [studentsRes, classesRes, paymentsRes, settingsRes, newItemsRes] = await Promise.all([
        supabase.from("students").select("*"),
        supabase.from("classes").select("*"),
        supabase.from("fee_payments").select("*"),
        supabase.from("school_settings").select("*").limit(1).maybeSingle(),
        supabase.from("new_student_fee_items").select("*"),
      ]);

      setStudents(studentsRes.data || []);
      setClasses(classesRes.data || []);
      setPayments(paymentsRes.data || []);
      setSettings(settingsRes.data || null);
      setNewItems(newItemsRes.data || []);
      setLoading(false);
    }

    loadData();
  }, []);

  const schoolName = text(settings?.school_name) || "JEFSEM VISION SCHOOL";
  const academicYear = text(settings?.academic_year);
  const currentTerm = text(settings?.current_term);

  const classMap = useMemo(() => {
    const map = new Map<string, AnyRow>();
    classes.forEach((row) => map.set(getClassName(row), row));
    return map;
  }, [classes]);

  const classOptions = useMemo(() => {
    const values = new Set<string>();
    students.forEach((student) => {
      const className = getClassName(student);
      if (className) values.add(className);
    });
    return [...values].sort((a, b) => a.localeCompare(b));
  }, [students]);

  const levelOptions = ["Playroom", "KG", "Lower Primary", "Upper Primary", "JHS"];

  const allFinanceRows = useMemo<Recipient[]>(() => {
    return students
      .filter((student) => (typeof student.active === "boolean" ? student.active : true))
      .map((student) => {
        const studentName = getStudentName(student);
        const studentId = getStudentId(student);
        const className = getClassName(student);
        const classRow = classMap.get(className) || null;
        const levelGroup = text(classRow?.fee_level_group) || getLevelGroupFromClassName(className);
        const expected = calculateExpected(student, classRow, newItems);

        const studentPayments = payments
          .filter(
            (payment) =>
              paymentMatchesStudent(payment, student, studentId, studentName, className) &&
              currentTermPayment(payment, academicYear, currentTerm)
          )
          .sort((a, b) => {
            const dateA = new Date(getPaymentDate(a)).getTime() || 0;
            const dateB = new Date(getPaymentDate(b)).getTime() || 0;
            return dateB - dateA;
          });

        const paid = studentPayments.reduce((sum, payment) => sum + getPaymentAmount(payment), 0);
        const balance = Math.max(expected - paid, 0);

        const lastPayment = studentPayments[0] || null;
        const lastPaymentDate = lastPayment ? formatDate(getPaymentDate(lastPayment)) : "";
        const lastPaymentAmount = lastPayment ? getPaymentAmount(lastPayment) : 0;
        const lastReceipt = lastPayment ? getReceiptNumber(lastPayment) : "";

        const phone = getParentPhone(student);
        const clean = cleanPhone(phone);
        const path = customPath || "/parent/fee/{student_id}";
        const parentLink = `https://jefsemvision.cc${path.startsWith("/") ? path : `/${path}`}`.replaceAll(
          "{student_id}",
          encodeURIComponent(studentId)
        );

        return {
          studentName,
          studentId,
          className,
          levelGroup,
          phone,
          cleanPhone: clean,
          expected,
          paid,
          balance,
          lastPaymentDate,
          lastPaymentAmount,
          lastReceipt,
          paymentCount: studentPayments.length,
          parentLink,
          message: "",
        };
      })
      .filter((row) => row.studentId || row.studentName)
      .map((row) => ({
        ...row,
        message: fillMessage(messageTemplate, row, { schoolName, academicYear, currentTerm }),
      }));
  }, [students, classMap, newItems, payments, academicYear, currentTerm, customPath, messageTemplate, schoolName]);

  const individualMatches = useMemo(() => {
    const q = lower(studentSearch);
    if (!q) return allFinanceRows.slice(0, 8);

    return allFinanceRows
      .filter((row) => lower(`${row.studentName} ${row.studentId} ${row.className}`).includes(q))
      .slice(0, 8);
  }, [allFinanceRows, studentSearch]);

  const selectedRecipients = useMemo(() => {
    let rows = [...allFinanceRows];

    if (sendMode === "owing") rows = rows.filter((row) => row.balance > 0);
    if (sendMode === "class") rows = rows.filter((row) => row.className === selectedClass);
    if (sendMode === "level") rows = rows.filter((row) => row.levelGroup === selectedLevel);
    if (sendMode === "individual") rows = rows.filter((row) => row.studentId === selectedStudentId);

    return rows;
  }, [allFinanceRows, sendMode, selectedClass, selectedLevel, selectedStudentId]);

  const printRows = useMemo(() => {
    let rows = [...allFinanceRows];

    if (printClass) rows = rows.filter((row) => row.className === printClass);
    if (printStatus === "owing") rows = rows.filter((row) => row.balance > 0);
    if (printStatus === "cleared") rows = rows.filter((row) => row.balance <= 0);

    return rows.sort((a, b) => a.studentName.localeCompare(b.studentName));
  }, [allFinanceRows, printClass, printStatus]);

  const printTotals = useMemo(() => {
    return printRows.reduce(
      (sum, row) => {
        sum.expected += row.expected;
        sum.paid += row.paid;
        sum.balance += row.balance;
        return sum;
      },
      { expected: 0, paid: 0, balance: 0 }
    );
  }, [printRows]);

  const canSend = selectedRecipients.filter((row) => row.cleanPhone);
  const noPhone = selectedRecipients.length - canSend.length;
  const owingCount = selectedRecipients.filter((row) => row.balance > 0).length;

  async function sendSms() {
    setStatus("");

    if (!canSend.length) {
      setStatus("No valid parent phone numbers found.");
      return;
    }

    setSending(true);

    try {
      const recipients = canSend.map((row, index) => ({
        phone: row.cleanPhone,
        message: row.message,
        recipientId: `${row.studentId || "JSMS"}-${index + 1}`,
        referenceId: `${row.studentId || "JSMS"}-${Date.now()}-${index + 1}`,
        studentName: row.studentName,
        studentId: row.studentId,
      }));

      const response = await authedFetch("/api/beem/send-sms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipients }),
      });

      const data = await response.json();

      if (!data.ok) {
        setStatus(`SMS error: SMS failed. Sent: ${data.sent || 0}. Failed: ${data.failed || 0}. ${data.message || "Check Network response for details."}`);
      } else {
        setStatus(`SMS sent. Sent: ${data.sent}. Failed: ${data.failed}.`);
      }
    } catch (error: any) {
      setStatus(`SMS error: ${error?.message || "Failed to send SMS."}`);
    }

    setSending(false);
  }

  function sendWhatsapp() {
    if (!canSend.length) {
      setStatus("No valid parent phone numbers found.");
      return;
    }

    const links = canSend.map((row) => `https://wa.me/${row.cleanPhone}?text=${encodeURIComponent(row.message)}`);

    if (links.length === 1) {
      window.open(links[0], "_blank");
      setStatus("WhatsApp opened for the selected parent.");
      return;
    }

    navigator.clipboard.writeText(links.join("\n"));
    window.open(links[0], "_blank");
    setStatus("WhatsApp links copied. First chat opened. wa.me cannot bulk-send automatically; use SMS for bulk sending.");
  }

  async function handleSend() {
    if (channel === "sms") await sendSms();
    if (channel === "whatsapp") sendWhatsapp();

    if (channel === "both") {
      await sendSms();
      sendWhatsapp();
    }
  }

  function copyMessages() {
    const content = canSend.map((row) => `${row.studentName} - ${row.cleanPhone}\n${row.message}`).join("\n\n---\n\n");
    navigator.clipboard.writeText(content);
    setStatus("Messages copied.");
  }

  function printReport() {
    if (!printRows.length) {
      setStatus("No students found for the selected print report.");
      return;
    }

    window.print();
  }

  if (loading) return <main style={{ padding: 24 }}>Loading fee reminder...</main>;

  return (
    <main style={{ minHeight: "100vh", background: COLORS.bg, fontFamily: "Arial, sans-serif", color: COLORS.text }}>
      <style jsx global>{`
        @media print {
          body {
            background: #fff !important;
          }

          .no-print {
            display: none !important;
          }

          .print-area {
            display: block !important;
            position: absolute !important;
            inset: 0 !important;
            width: 100% !important;
            padding: 18px !important;
            background: #fff !important;
            color: #000 !important;
          }

          .print-table {
            width: 100% !important;
            border-collapse: collapse !important;
            font-size: 11px !important;
          }

          .print-table th,
          .print-table td {
            border: 1px solid #111 !important;
            padding: 6px !important;
            text-align: left !important;
            vertical-align: top !important;
          }

          .print-table th {
            background: #f1f1f1 !important;
          }

          @page {
            size: A4 landscape;
            margin: 10mm;
          }
        }

        @media screen {
          .print-area {
            display: none;
          }
        }

        @media (max-width: 900px) {
          .reminder-shell { flex-direction: column; }
          .reminder-sidebar {
            width: auto !important;
            position: relative !important;
            min-height: auto !important;
          }
          .reminder-main { padding: 16px !important; }
          .reminder-two-pane { grid-template-columns: 1fr !important; }
        }
      `}</style>

      <div className="reminder-shell no-print" style={{ display: "flex", minHeight: "100vh" }}>
        <aside className="reminder-sidebar" style={{ width: "clamp(220px, 22vw, 260px)", background: COLORS.sidebar, color: "#fff", padding: 18, borderRight: `4px solid ${COLORS.gold}` }}>
          <h2 style={{ margin: "10px 0 4px" }}>JVS Fees</h2>
          <p style={{ margin: "0 0 20px", opacity: 0.8 }}>Fee Reminder</p>

          <nav style={{ display: "grid", gap: 10 }}>
            {[
              ["Dashboard", "/fees/admin"],
              ["Record Payment", "/fees/admin/record-payment"],
              ["Student Accounts", "/fees/admin/student-accounts"],
              ["Debtors", "/fees/admin/debtors"],
              ["Receipts", "/fees/admin/receipts"],
              ["Reports", "/fees/admin/reports"],
              ["Fee Reminder", "/fees/admin/fee-reminder"],
              ["Fee Structure", "/fees/admin/fee-structure"],
            ].map(([label, href]) => (
              <Link
                key={href}
                href={href}
                style={{
                  color: "#fff",
                  textDecoration: "none",
                  padding: "14px 16px",
                  borderRadius: 14,
                  background: href === "/fees/admin/fee-reminder" ? "rgba(212,160,23,.35)" : "rgba(255,255,255,.07)",
                  border: href === "/fees/admin/fee-reminder" ? `1px solid ${COLORS.gold}` : "1px solid rgba(255,255,255,.08)",
                  fontWeight: 800,
                }}
              >
                {label}
              </Link>
            ))}
          </nav>
        </aside>

        <section className="reminder-main" style={{ flex: 1, padding: 28 }}>
          <Link href="/fees/admin" style={{ color: COLORS.muted, textDecoration: "none", fontWeight: 800 }}>
            ← Back to Fees Dashboard
          </Link>

          <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 20, marginTop: 24, marginBottom: 24 }}>
            <div>
              <h1 style={{ fontSize: 38, margin: 0 }}>Fee Reminder</h1>
              <p style={{ margin: "10px 0 0", color: COLORS.muted, fontSize: 18 }}>
                Send fee reminders and print class fee reports straight away.
              </p>
            </div>

            <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 18, padding: "14px 22px" }}>
              <b>{currentTerm || "Current Term"}</b>
              <br />
              <span style={{ color: COLORS.muted }}>{academicYear || "Academic Year"}</span>
            </div>
          </header>

          <section style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 24, padding: 22, marginBottom: 22 }}>
            <h2 style={{ marginTop: 0 }}>🖨️ Print Class Fee Report</h2>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 14, alignItems: "end" }}>
              <div>
                <label style={{ fontWeight: 800 }}>Class</label>
                <select value={printClass} onChange={(e) => setPrintClass(e.target.value)} style={{ ...inputStyle(), marginTop: 8 }}>
                  <option value="">All classes</option>
                  {classOptions.map((className) => (
                    <option key={className} value={className}>
                      {className}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ fontWeight: 800 }}>Status</label>
                <select value={printStatus} onChange={(e) => setPrintStatus(e.target.value as PrintStatus)} style={{ ...inputStyle(), marginTop: 8 }}>
                  <option value="all">All students</option>
                  <option value="owing">Owing only</option>
                  <option value="cleared">Fully paid only</option>
                </select>
              </div>

              <button onClick={printReport} disabled={!printRows.length} style={buttonStyle(COLORS.gold, "#111827", !printRows.length)}>
                Print Report
              </button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, marginTop: 18 }}>
              <Summary title="Students" value={printRows.length} />
              <MoneySummary title="Fees Due" value={printTotals.expected} />
              <MoneySummary title="Amount Paid" value={printTotals.paid} />
              <MoneySummary title="Balance" value={printTotals.balance} danger />
            </div>
          </section>

          <div className="reminder-two-pane" style={{ display: "grid", gridTemplateColumns: "420px 1fr", gap: 22, alignItems: "start" }}>
            <section style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 24, padding: 22 }}>
              <h2 style={{ marginTop: 0 }}>Send To</h2>

              <label style={{ fontWeight: 800 }}>Recipient group</label>
              <select value={sendMode} onChange={(e) => setSendMode(e.target.value as SendMode)} style={{ ...inputStyle(), marginTop: 8, marginBottom: 14 }}>
                <option value="owing">Those owing</option>
                <option value="all">All students</option>
                <option value="class">One class</option>
                <option value="level">One level</option>
                <option value="individual">Individual student</option>
              </select>

              {sendMode === "class" && (
                <>
                  <label style={{ fontWeight: 800 }}>Class</label>
                  <select value={selectedClass} onChange={(e) => setSelectedClass(e.target.value)} style={{ ...inputStyle(), marginTop: 8, marginBottom: 14 }}>
                    <option value="">Select class</option>
                    {classOptions.map((className) => (
                      <option key={className} value={className}>
                        {className}
                      </option>
                    ))}
                  </select>
                </>
              )}

              {sendMode === "level" && (
                <>
                  <label style={{ fontWeight: 800 }}>Level</label>
                  <select value={selectedLevel} onChange={(e) => setSelectedLevel(e.target.value)} style={{ ...inputStyle(), marginTop: 8, marginBottom: 14 }}>
                    <option value="">Select level</option>
                    {levelOptions.map((level) => (
                      <option key={level} value={level}>
                        {level}
                      </option>
                    ))}
                  </select>
                </>
              )}

              {sendMode === "individual" && (
                <>
                  <label style={{ fontWeight: 800 }}>Search student</label>
                  <input value={studentSearch} onChange={(e) => setStudentSearch(e.target.value)} placeholder="Search name or JVS ID" style={{ ...inputStyle(), marginTop: 8 }} />

                  <div style={{ display: "grid", gap: 8, marginTop: 10, maxHeight: 220, overflowY: "auto" }}>
                    {individualMatches.map((row) => (
                      <button
                        key={`${row.studentId}-${row.studentName}`}
                        onClick={() => setSelectedStudentId(row.studentId)}
                        style={{
                          textAlign: "left",
                          border: `1px solid ${selectedStudentId === row.studentId ? COLORS.gold : COLORS.border}`,
                          background: selectedStudentId === row.studentId ? "#fff7d6" : "#fff",
                          borderRadius: 14,
                          padding: 12,
                          cursor: "pointer",
                          fontWeight: 800,
                        }}
                      >
                        {row.studentName} <span style={{ color: COLORS.muted }}>({row.studentId})</span>
                        <br />
                        <small style={{ color: COLORS.muted }}>
                          {row.className} • {row.cleanPhone || "No phone"}
                        </small>
                      </button>
                    ))}
                  </div>
                </>
              )}

              <label style={{ fontWeight: 800 }}>Channel</label>
              <select value={channel} onChange={(e) => setChannel(e.target.value as ChannelMode)} style={{ ...inputStyle(), marginTop: 8, marginBottom: 14 }}>
                <option value="sms">SMS via Beem</option>
                <option value="whatsapp">WhatsApp link</option>
                <option value="both">SMS + WhatsApp</option>
              </select>

              <label style={{ fontWeight: 800 }}>Parent fee link path</label>
              <input value={customPath} onChange={(e) => setCustomPath(e.target.value)} style={{ ...inputStyle(), marginTop: 8 }} />
              <small style={{ color: COLORS.muted }}>Example: https://jefsemvision.cc/parent/fee/JVS123456</small>
            </section>

            <section style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 24, padding: 22 }}>
              <h2 style={{ marginTop: 0 }}>Message</h2>

              <textarea value={messageTemplate} onChange={(e) => setMessageTemplate(e.target.value)} rows={9} style={{ ...inputStyle(), resize: "vertical", lineHeight: 1.5 }} />

              <p style={{ color: COLORS.muted, marginTop: 10 }}>
                Placeholders: {"{student_name}"}, {"{student_id}"}, {"{class_name}"}, {"{balance}"}, {"{portal_link}"}, {"{term}"}, {"{academic_year}"}, {"{school_name}"}
              </p>
            </section>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 18, marginTop: 22 }}>
            <Summary title="Selected" value={selectedRecipients.length} />
            <Summary title="Can Send" value={canSend.length} />
            <Summary title="No Phone" value={noPhone} danger />
            <Summary title="Owing" value={owingCount} danger />
          </div>

          <section style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 24, padding: 22, marginTop: 22 }}>
            <h2 style={{ marginTop: 0 }}>Send</h2>

            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <button onClick={handleSend} disabled={sending || !canSend.length} style={buttonStyle(COLORS.gold, "#111827", sending || !canSend.length)}>
                {sending ? "Sending..." : channel === "sms" ? `Send SMS (${canSend.length})` : channel === "whatsapp" ? `Send WhatsApp (${canSend.length})` : `Send Both (${canSend.length})`}
              </button>

              <button onClick={sendWhatsapp} disabled={!canSend.length} style={buttonStyle("#16a34a", "#fff", !canSend.length)}>
                Open WhatsApp
              </button>

              <button onClick={copyMessages} disabled={!canSend.length} style={buttonStyle("#fff", COLORS.text, !canSend.length)}>
                Copy Messages
              </button>
            </div>

            {status && (
              <p style={{ margin: "16px 0 0", color: status.toLowerCase().includes("error") ? COLORS.danger : COLORS.success, fontWeight: 800 }}>
                {status}
              </p>
            )}
          </section>

          <section style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 24, padding: 22, marginTop: 22 }}>
            <h2 style={{ marginTop: 0 }}>Preview</h2>

            {canSend[0] ? (
              <div style={{ whiteSpace: "pre-wrap", color: COLORS.text, lineHeight: 1.6 }}>
                <b>{canSend[0].studentName}</b> • {canSend[0].cleanPhone}
                <br />
                <br />
                {canSend[0].message}
              </div>
            ) : (
              <p style={{ color: COLORS.muted }}>No recipient with phone selected.</p>
            )}
          </section>
        </section>
      </div>

      <section className="print-area">
        <div style={{ textAlign: "center", marginBottom: 14 }}>
          <h1 style={{ margin: 0, fontSize: 22 }}>{schoolName}</h1>
          <h2 style={{ margin: "6px 0", fontSize: 17 }}>School Fees Report</h2>
          <p style={{ margin: 0, fontSize: 12 }}>
            {printClass || "All Classes"} • {printStatus === "all" ? "All Students" : printStatus === "owing" ? "Owing Only" : "Fully Paid Only"} • {currentTerm || "Current Term"} • {academicYear || "Academic Year"}
          </p>
          <p style={{ margin: "5px 0 0", fontSize: 11 }}>Printed on {formatDate(new Date().toISOString())}</p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 8, marginBottom: 12, fontSize: 12 }}>
          <div style={printBoxStyle()}>
            <b>Students:</b> {printRows.length}
          </div>
          <div style={printBoxStyle()}>
            <b>Fees Due:</b> {money(printTotals.expected)}
          </div>
          <div style={printBoxStyle()}>
            <b>Amount Paid:</b> {money(printTotals.paid)}
          </div>
          <div style={printBoxStyle()}>
            <b>Balance:</b> {money(printTotals.balance)}
          </div>
        </div>

        <table className="print-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Student Name</th>
              <th>Student ID</th>
              <th>Class</th>
              <th>Fees Due</th>
              <th>Amount Paid</th>
              <th>Balance</th>
              <th>Status</th>
              <th>Last Paid</th>
              <th>Last Amount</th>
              <th>Receipt</th>
              <th>Parent Phone</th>
            </tr>
          </thead>

          <tbody>
            {printRows.map((row, index) => (
              <tr key={`${row.studentId}-${row.studentName}`}>
                <td>{index + 1}</td>
                <td>{row.studentName}</td>
                <td>{row.studentId}</td>
                <td>{row.className}</td>
                <td>{money(row.expected)}</td>
                <td>{money(row.paid)}</td>
                <td>{money(row.balance)}</td>
                <td>{row.balance > 0 ? "Owing" : "Cleared"}</td>
                <td>{row.lastPaymentDate || "-"}</td>
                <td>{row.lastPaymentAmount ? money(row.lastPaymentAmount) : "-"}</td>
                <td>{row.lastReceipt || "-"}</td>
                <td>{row.phone || row.cleanPhone || "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 60, marginTop: 28, fontSize: 12 }}>
          <div>
            <p>Prepared by: ______________________________</p>
          </div>
          <div>
            <p>Checked by: ______________________________</p>
          </div>
        </div>
      </section>
    </main>
  );
}

function Summary({ title, value, danger = false }: { title: string; value: number; danger?: boolean }) {
  return (
    <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 22, padding: 22 }}>
      <p style={{ margin: 0, color: COLORS.muted, fontWeight: 800 }}>{title}</p>
      <h2 style={{ margin: "10px 0 0", fontSize: 32, color: danger ? COLORS.danger : COLORS.text }}>{value}</h2>
    </div>
  );
}

function MoneySummary({ title, value, danger = false }: { title: string; value: number; danger?: boolean }) {
  return (
    <div style={{ background: "#fffaf0", border: `1px solid ${COLORS.border}`, borderRadius: 18, padding: 16 }}>
      <p style={{ margin: 0, color: COLORS.muted, fontWeight: 800 }}>{title}</p>
      <h3 style={{ margin: "8px 0 0", color: danger ? COLORS.danger : COLORS.text }}>{money(value)}</h3>
    </div>
  );
}

function buttonStyle(bg: string, color: string, disabled = false): React.CSSProperties {
  return {
    border: bg === "#fff" ? `1px solid ${COLORS.border}` : "none",
    background: disabled ? "#e5e7eb" : bg,
    color: disabled ? COLORS.muted : color,
    padding: "16px 22px",
    borderRadius: 16,
    cursor: disabled ? "not-allowed" : "pointer",
    fontWeight: 900,
    fontSize: 16,
  };
}

function printBoxStyle(): React.CSSProperties {
  return {
    border: "1px solid #111",
    padding: "8px",
    borderRadius: 4,
  };
}