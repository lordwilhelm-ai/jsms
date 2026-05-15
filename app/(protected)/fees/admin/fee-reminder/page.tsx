"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type AnyRow = Record<string, any>;
type GroupMode = "owing" | "all" | "class" | "level" | "individual";
type ChannelMode = "sms" | "whatsapp" | "both";
type LinkMode = "fee" | "report" | "parent" | "custom";

type RecipientRow = AnyRow & {
  studentName: string;
  studentIdValue: string;
  classNameValue: string;
  levelGroup: string;
  expected: number;
  paid: number;
  balance: number;
  parentName: string;
  parentPhone: string;
  cleanPhone: string;
  parentLink: string;
  message: string;
  setupLabel: string;
};

const COLORS = {
  bg: "#f7f4ec",
  sidebar: "#0f172a",
  gold: "#d4a017",
  card: "#ffffff",
  text: "#111827",
  muted: "#6b7280",
  border: "#e5e7eb",
  dangerText: "#991b1b",
  successText: "#166534",
  warningText: "#92400e",
  softGold: "#fff7d6",
};

const DEFAULT_TEMPLATE =
  "Dear Parent/Guardian, your ward {student_name} ({student_id}) in {class_name} has an outstanding school fees balance of {balance} for {term}, {academic_year}. Kindly make payment. View account: {portal_link}. Thank you. {school_name}";

const TEMPLATES = [
  {
    name: "Fee Reminder",
    value: DEFAULT_TEMPLATE,
  },
  {
    name: "Short WhatsApp",
    value:
      "Hello, {student_name} ({class_name}) has a fee balance of {balance}. Kindly pay soon. Fee account: {portal_link} - {school_name}",
  },
  {
    name: "Strong Reminder",
    value:
      "Dear Parent/Guardian, records show that {student_name} ({student_id}) still owes {balance} for {term}, {academic_year}. Kindly settle it as soon as possible. Details: {portal_link}. {school_name}",
  },
  {
    name: "Custom",
    value: DEFAULT_TEMPLATE,
  },
];

function normalizeText(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function numberValue(value: unknown) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

function money(value: number) {
  return `GHS ${Number(value || 0).toFixed(2)}`;
}

function getRole(row: AnyRow | null) {
  const raw = normalizeText(row?.role);
  if (raw === "owner" || raw === "admin" || raw === "headmaster") return raw;
  return "teacher";
}

function getStudentName(row: AnyRow) {
  const direct = String(row.full_name || row.student_name || row.studentName || row.fullName || row.name || "").trim();
  if (direct) return direct;

  const first = String(row.first_name || row.firstname || "").trim();
  const other = String(row.other_name || row.middle_name || "").trim();
  const last = String(row.last_name || row.surname || "").trim();
  return `${first} ${other} ${last}`.replace(/\s+/g, " ").trim() || "-";
}

function findRealJvsId(row: AnyRow) {
  const direct =
    row.jvs_id ||
    row.student_id ||
    row.jsms_id ||
    row.jvs_student_id ||
    row.jvs_code ||
    row.student_code ||
    row.student_number ||
    row.admission_number ||
    row.index_number ||
    row.jvsId ||
    row.studentId ||
    row.id_number ||
    "";

  if (String(direct || "").toUpperCase().startsWith("JVS")) {
    return String(direct).trim().toUpperCase().replace(/\s+/g, "");
  }

  for (const value of Object.values(row)) {
    const text = String(value || "");
    const match = text.match(/JVS\s*\d{4,}/i);
    if (match) return match[0].replace(/\s+/g, "").toUpperCase();
  }

  return String(direct || "").trim();
}

function getClassName(row: AnyRow) {
  return String(row.class_name || row.className || row.class || row.current_class || row.student_class || row.grade || "").trim();
}

function getLevelGroupFromClassName(className: string) {
  const name = className.trim().toLowerCase();
  if (name.includes("playroom")) return "Playroom";
  if (name.startsWith("kg")) return "KG";
  if (["class 1", "class 2", "class 3"].includes(name)) return "Lower Primary";
  if (["class 4", "class 5", "class 6"].includes(name)) return "Upper Primary";
  if (name.startsWith("jhs")) return "JHS";
  return "Other";
}

function getLevelGroup(classRow: AnyRow | null, className: string) {
  return String(classRow?.fee_level_group || "").trim() || getLevelGroupFromClassName(className);
}

function getParentName(row: AnyRow) {
  return String(
    row.parent_name || row.guardian_name || row.emergency_contact_name || row.father_name || row.mother_name || "Parent/Guardian"
  ).trim();
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

  const found = candidates.find((value) => String(value || "").trim());
  return String(found || "").trim();
}

function cleanPhone(phone: string) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("233")) return digits;
  if (digits.startsWith("0") && digits.length === 10) return `233${digits.slice(1)}`;
  if (digits.length === 9) return `233${digits}`;
  return digits;
}

function sameStudentPayment(payment: AnyRow, student: AnyRow, studentId: string, studentName: string, className: string) {
  const paymentStudentId = String(payment.student_id || payment.studentId || "").trim();
  const paymentName = normalizeText(payment.student_name || payment.full_name || payment.name);
  const paymentClass = normalizeText(payment.class_name || payment.className || payment.class);
  const uuid = String(student.id || "").trim();

  if (studentId && paymentStudentId === studentId) return true;
  if (uuid && paymentStudentId === uuid) return true;

  return Boolean(paymentName) && paymentName === normalizeText(studentName) && (!paymentClass || paymentClass === normalizeText(className));
}

function currentTermPayment(payment: AnyRow, academicYear: string, currentTerm: string) {
  const pYear = normalizeText(payment.academic_year || payment.year);
  const pTerm = normalizeText(payment.term || payment.current_term);
  if (!pYear && !pTerm) return true;
  const yearOk = !academicYear || !pYear || pYear === normalizeText(academicYear);
  const termOk = !currentTerm || !pTerm || pTerm === normalizeText(currentTerm);
  return yearOk && termOk;
}

function getPaymentAmount(row: AnyRow) {
  return numberValue(row.amount_paid || row.amount || row.paid_amount || row.payment_amount);
}

function calculateExpectedFee(params: { student: AnyRow; classRow: AnyRow | null; newStudentItems: AnyRow[] }) {
  const { student, classRow, newStudentItems } = params;
  const className = getClassName(student);
  const levelGroup = getLevelGroup(classRow, className);
  const isNew = student.is_new === true || normalizeText(student.student_type) === "new";
  const returningFee = numberValue(classRow?.fee_returning || classRow?.fee_amount || classRow?.amount);
  const newItemsTotal = newStudentItems
    .filter((item) => String(item.level_group || "").trim() === levelGroup && item.is_active !== false)
    .reduce((sum, item) => sum + numberValue(item.amount), 0);
  const fallbackNewFee = numberValue(classRow?.fee_new || classRow?.new_student_fee);

  let baseFee = isNew ? newItemsTotal || fallbackNewFee : returningFee;
  let setupLabel = isNew ? "New Student" : "Continuing";

  const scholarship = normalizeText(student.scholarship_type || student.scholarship || student.fee_type);
  const customAmount = numberValue(student.scholarship_amount || student.custom_fee_amount || student.custom_fee || student.special_fee_amount);

  if (scholarship === "full" || scholarship === "full scholarship") {
    baseFee = 0;
    setupLabel = "Full Scholarship";
  } else if (scholarship === "half" || scholarship === "half scholarship") {
    baseFee = baseFee / 2;
    setupLabel = "Half Scholarship";
  } else if (scholarship === "custom" || scholarship === "custom amount" || scholarship === "special") {
    baseFee = customAmount;
    setupLabel = "Custom Fee";
  } else if (customAmount > 0 && Boolean(student.has_custom_fee || student.custom_fee_amount || student.custom_fee)) {
    baseFee = customAmount;
    setupLabel = "Custom Fee";
  }

  const arrears = numberValue(student.arrears || student.previous_balance || student.old_balance);
  const expected = Math.max(baseFee + arrears, 0);
  return { expected, setupLabel, levelGroup };
}

function buildParentLink(params: { baseUrl: string; linkMode: LinkMode; customPath: string; studentId: string }) {
  const base = (params.baseUrl || "https://jefsemvision.cc").replace(/\/$/, "");
  const id = encodeURIComponent(params.studentId || "");

  if (params.linkMode === "fee") return `${base}/parent/fee/${id}`;
  if (params.linkMode === "report") return `${base}/parent/report/${id}`;
  if (params.linkMode === "parent") return `${base}/parent/${id}`;

  const path = params.customPath.trim() || "/parent/fee/{student_id}";
  const cleanedPath = path.startsWith("/") ? path : `/${path}`;
  return `${base}${cleanedPath.replaceAll("{student_id}", id)}`;
}

function replacePlaceholders(template: string, row: Omit<RecipientRow, "message">, settings: AnyRow | null) {
  const map: Record<string, string> = {
    student_name: row.studentName,
    student_id: row.studentIdValue,
    class_name: row.classNameValue,
    level: row.levelGroup,
    expected: money(row.expected),
    paid: money(row.paid),
    balance: money(Math.max(row.balance, 0)),
    parent_name: row.parentName,
    parent_phone: row.parentPhone || "-",
    term: String(settings?.current_term || "-"),
    academic_year: String(settings?.academic_year || "-"),
    school_name: String(settings?.school_name || "JEFSEM VISION SCHOOL"),
    portal_link: row.parentLink,
  };

  return template.replace(/\{(.*?)\}/g, (_, key) => map[String(key).trim()] ?? `{${key}}`);
}

function whatsappHref(phone: string, message: string) {
  return phone ? `https://wa.me/${phone}?text=${encodeURIComponent(message)}` : "#";
}

function smsHref(phone: string, message: string) {
  return phone ? `sms:${phone}?body=${encodeURIComponent(message)}` : "#";
}


function ActionLink({ href, label }: { href: string; label: string }) {
  const active = href.endsWith("/fee-reminder");
  return (
    <Link
      href={href}
      style={{
        display: "block",
        textDecoration: "none",
        color: "#fff",
        padding: "12px 14px",
        borderRadius: "14px",
        background: active ? "rgba(212,160,23,0.24)" : "rgba(255,255,255,0.07)",
        border: active ? `1px solid ${COLORS.gold}` : "1px solid rgba(255,255,255,0.1)",
        fontWeight: 800,
        fontSize: "14px",
      }}
    >
      {label}
    </Link>
  );
}

export default function FeeReminderPage() {
  const router = useRouter();

  const [checkingUser, setCheckingUser] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [settingsRow, setSettingsRow] = useState<AnyRow | null>(null);
  const [classes, setClasses] = useState<AnyRow[]>([]);
  const [students, setStudents] = useState<AnyRow[]>([]);
  const [payments, setPayments] = useState<AnyRow[]>([]);
  const [newStudentItems, setNewStudentItems] = useState<AnyRow[]>([]);

  const [groupMode, setGroupMode] = useState<GroupMode>("owing");
  const [baseUrl, setBaseUrl] = useState("https://jefsemvision.cc");
  const [customPath, setCustomPath] = useState("/parent/fee/{student_id}");
  const [classFilter, setClassFilter] = useState("all");
  const [levelFilter, setLevelFilter] = useState("all");
  const [termMode, setTermMode] = useState("current");
  const [search, setSearch] = useState("");
  const [messageTemplate, setMessageTemplate] = useState(DEFAULT_TEMPLATE);
  const [sendingSms, setSendingSms] = useState(false);
  const [sendStatus, setSendStatus] = useState("");
  const [copied, setCopied] = useState("");

  useEffect(() => {
    let active = true;

    async function loadPage() {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!active) return;

        if (!session?.user) {
          router.replace("/");
          return;
        }

        const [teachersRes, settingsRes, classesRes, studentsRes, paymentsRes, newItemsRes] = await Promise.all([
          supabase.from("teachers").select("*"),
          supabase.from("school_settings").select("*").limit(1).maybeSingle(),
          supabase.from("classes").select("*"),
          supabase.from("students").select("*"),
          supabase.from("fee_payments").select("*").order("created_at", { ascending: false }),
          supabase.from("new_student_fee_items").select("*"),
        ]);

        if (!active) return;

        const userRow =
          (teachersRes.data || []).find((item) => item.auth_user_id === session.user.id) ||
          (teachersRes.data || []).find((item) => normalizeText(item.email) === normalizeText(session.user.email)) ||
          null;

        if (!userRow) {
          router.replace("/");
          return;
        }

        if (getRole(userRow) === "teacher") {
          router.replace("/fees/teacher");
          return;
        }

        setSettingsRow(settingsRes.data || null);
        setClasses(classesRes.data || []);
        setStudents((studentsRes.data || []).filter((row) => row.active !== false));
        setPayments(paymentsRes.data || []);
        setNewStudentItems(newItemsRes.data || []);
        setCheckingUser(false);
        setLoading(false);
      } catch (error: any) {
        setLoadError(error?.message || "Failed to load fee reminder page.");
        setCheckingUser(false);
        setLoading(false);
      }
    }

    loadPage();
    return () => {
      active = false;
    };
  }, [router]);

  const academicYear = String(settingsRow?.academic_year || "").trim();
  const currentTerm = String(settingsRow?.current_term || "").trim();

  const classMap = useMemo(() => {
    const map = new Map<string, AnyRow>();
    classes.forEach((row) => {
      const name = getClassName(row);
      if (name) map.set(normalizeText(name), row);
    });
    return map;
  }, [classes]);

  const classNames = useMemo(() => {
    return Array.from(new Set(students.map(getClassName).filter(Boolean))).sort((a, b) => String(a).localeCompare(String(b)));
  }, [students]);

  const allRows = useMemo<RecipientRow[]>(() => {
    const built = students.map((student) => {
      const studentName = getStudentName(student);
      const studentIdValue = findRealJvsId(student);
      const classNameValue = getClassName(student);
      const classRow = classMap.get(normalizeText(classNameValue)) || null;
      const expectedInfo = calculateExpectedFee({ student, classRow, newStudentItems });
      const studentPayments = payments.filter((payment) => {
        if (!sameStudentPayment(payment, student, studentIdValue, studentName, classNameValue)) return false;
        if (termMode === "current") return currentTermPayment(payment, academicYear, currentTerm);
        return true;
      });

      const paid = studentPayments.reduce((sum, payment) => sum + getPaymentAmount(payment), 0);
      const balance = expectedInfo.expected - paid;
      const parentName = getParentName(student);
      const parentPhone = getParentPhone(student);
      const clean = cleanPhone(parentPhone);
      const parentLink = buildParentLink({ baseUrl, linkMode: "custom", customPath, studentId: studentIdValue });

      const baseRow = {
        ...student,
        studentName,
        studentIdValue,
        classNameValue,
        levelGroup: expectedInfo.levelGroup,
        expected: expectedInfo.expected,
        paid,
        balance,
        parentName,
        parentPhone,
        cleanPhone: clean,
        parentLink,
        setupLabel: expectedInfo.setupLabel,
      };

      return { ...baseRow, message: replacePlaceholders(messageTemplate, baseRow, settingsRow) };
    });

    return built.sort((a, b) => b.balance - a.balance || a.studentName.localeCompare(b.studentName));
  }, [students, payments, termMode, academicYear, currentTerm, classMap, newStudentItems, baseUrl, customPath, messageTemplate, settingsRow]);

  const recipients = useMemo(() => {
    const q = normalizeText(search);

    return allRows.filter((row) => {
      if (groupMode === "owing" && row.balance <= 0) return false;
      if (groupMode === "class") return classFilter !== "all" && row.classNameValue === classFilter;
      if (groupMode === "level") return levelFilter !== "all" && row.levelGroup === levelFilter;
      if (groupMode === "individual") {
        if (!q) return false;
        return (
          normalizeText(row.studentName).includes(q) ||
          normalizeText(row.studentIdValue).includes(q) ||
          normalizeText(row.classNameValue).includes(q) ||
          normalizeText(row.parentPhone).includes(q)
        );
      }
      return true;
    });
  }, [allRows, groupMode, classFilter, levelFilter, search]);

  const validRecipients = useMemo(() => recipients.filter((row) => row.cleanPhone), [recipients]);
  const firstRecipient = validRecipients[0] || null;

  const summary = useMemo(() => {
    return recipients.reduce(
      (acc, row) => {
        acc.total += 1;
        if (row.cleanPhone) acc.withContacts += 1;
        else acc.noContacts += 1;
        if (row.balance > 0) acc.owing += 1;
        acc.balance += Math.max(row.balance, 0);
        return acc;
      },
      { total: 0, withContacts: 0, noContacts: 0, owing: 0, balance: 0 }
    );
  }, [recipients]);

  async function copyText(text: string, label: string) {
    await navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(""), 1800);
  }

  async function sendSms() {
    if (!validRecipients.length) {
      setSendStatus("No valid phone numbers found for this selection.");
      return;
    }

    const confirmed = window.confirm(`Send SMS to ${validRecipients.length} parent contact(s)?`);
    if (!confirmed) return;

    try {
      setSendingSms(true);
      setSendStatus("Sending SMS messages...");

      const response = await fetch("/api/beem/send-sms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: validRecipients.map((row) => ({
            phone: row.cleanPhone,
            message: row.message,
            studentName: row.studentName,
            studentId: row.studentIdValue,
          })),
        }),
      });

      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data?.error || `SMS failed. Sent: ${data?.sent || 0}. Failed: ${data?.failed || 0}.`);
      setSendStatus(`SMS sent. Sent: ${data.sent}. Failed: ${data.failed}.`);
    } catch (error: any) {
      setSendStatus(`SMS error: ${error?.message || "Failed to send SMS."}`);
    } finally {
      setSendingSms(false);
    }
  }

  function sendWhatsapp() {
    if (!validRecipients.length) {
      setSendStatus("No valid WhatsApp numbers found for this selection.");
      return;
    }

    if (validRecipients.length === 1) {
      window.open(whatsappHref(validRecipients[0].cleanPhone, validRecipients[0].message), "_blank");
      return;
    }

    const confirmed = window.confirm(`This will open WhatsApp links for ${validRecipients.length} contacts. Browser may block some popups. Continue?`);
    if (!confirmed) return;

    validRecipients.slice(0, 20).forEach((row, index) => {
      setTimeout(() => window.open(whatsappHref(row.cleanPhone, row.message), "_blank"), index * 450);
    });

    if (validRecipients.length > 20) {
      const remaining = validRecipients
        .slice(20)
        .map((row) => `${row.studentName} (${row.studentIdValue})\n${whatsappHref(row.cleanPhone, row.message)}`)
        .join("\n\n");
      copyText(remaining, "remaining WhatsApp links");
      setSendStatus("Opened first 20 WhatsApp links and copied the rest.");
    } else {
      setSendStatus("WhatsApp links opened.");
    }
  }

  function copyWhatsappLinks() {
    const text = validRecipients
      .map((row) => `${row.studentName} (${row.studentIdValue})\n${whatsappHref(row.cleanPhone, row.message)}`)
      .join("\n\n");
    copyText(text, "WhatsApp links");
  }

  function copyMessages() {
    const text = recipients.map((row) => `${row.studentName} (${row.studentIdValue}) - ${row.parentPhone || "NO PHONE"}\n${row.message}`).join("\n\n---\n\n");
    copyText(text, "messages");
  }

  if (checkingUser || loading) return <div style={{ padding: "24px" }}>Loading fee reminder...</div>;
  if (loadError) return <div style={{ padding: "24px", color: COLORS.dangerText }}>Error: {loadError}</div>;

  return (
    <main style={{ minHeight: "100vh", background: COLORS.bg, fontFamily: "Arial, sans-serif", color: COLORS.text }}>
      <style jsx global>{`
        @keyframes fadeUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        .card { animation: fadeUp 0.35s ease both; transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease; }
        .card:hover { transform: translateY(-3px); box-shadow: 0 18px 35px rgba(15,23,42,0.12) !important; border-color: ${COLORS.gold} !important; }
        input:focus, select:focus, textarea:focus { outline: none; border-color: ${COLORS.gold} !important; box-shadow: 0 0 0 4px rgba(212,160,23,0.16); }
        @media (max-width: 980px) { aside { display: none; } section { padding: 18px !important; } .topgrid { grid-template-columns: 1fr !important; } }
      `}</style>

      <div style={{ display: "flex", minHeight: "100vh" }}>
        <aside style={{ width: "260px", background: COLORS.sidebar, color: "#fff", padding: "22px", position: "sticky", top: 0, height: "100vh" }}>
          <div style={{ fontSize: "20px", fontWeight: 950, marginBottom: "6px" }}>JVS Fees</div>
          <div style={{ color: "#cbd5e1", fontSize: "13px", marginBottom: "22px" }}>Fee Reminder</div>
          <div style={{ display: "grid", gap: "10px" }}>
            <ActionLink href="/fees/admin" label="📊 Dashboard" />
            <ActionLink href="/fees/admin/record-payment" label="💰 Record Payment" />
            <ActionLink href="/fees/admin/student-accounts" label="👨‍🎓 Student Accounts" />
            <ActionLink href="/fees/admin/debtors" label="🚨 Debtors" />
            <ActionLink href="/fees/admin/receipts" label="🧾 Receipts" />
            <ActionLink href="/fees/admin/reports" label="📈 Reports" />
            <ActionLink href="/fees/admin/fee-reminder" label="📩 Fee Reminder" />
            <ActionLink href="/fees/admin/fee-structure" label="⚙️ Fee Structure" />
          </div>
        </aside>

        <section style={{ flex: 1, padding: "26px", maxWidth: "1120px", margin: "0 auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "16px", alignItems: "flex-start", marginBottom: "18px" }}>
            <div>
              <Link href="/fees/admin" style={{ color: COLORS.muted, textDecoration: "none", fontWeight: 800 }}>← Back to Fees Dashboard</Link>
              <h1 style={{ fontSize: "32px", margin: "10px 0 4px", fontWeight: 950 }}>Fee Reminder</h1>
              <p style={{ margin: 0, color: COLORS.muted }}>Select parents, type message, then send by SMS or WhatsApp.</p>
            </div>
            <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: "18px", padding: "14px 16px", minWidth: "210px" }}>
              <div style={{ fontSize: "12px", color: COLORS.muted, fontWeight: 900 }}>Current Term</div>
              <div style={{ fontWeight: 950 }}>{currentTerm || "No term set"}</div>
              <div style={{ color: COLORS.muted }}>{academicYear || "No academic year set"}</div>
            </div>
          </div>

          <div className="topgrid" style={{ display: "grid", gridTemplateColumns: "360px 1fr", gap: "16px", alignItems: "start" }}>
            <div className="card" style={cardStyle()}>
              <h2 style={cardTitle()}>Send To</h2>
              <select value={groupMode} onChange={(e) => setGroupMode(e.target.value as GroupMode)} style={fieldStyle()}>
                <option value="owing">Those owing</option>
                <option value="all">All students</option>
                <option value="class">One class</option>
                <option value="level">One level</option>
                <option value="individual">Individual student</option>
              </select>

              {groupMode === "class" && (
                <select value={classFilter} onChange={(e) => setClassFilter(e.target.value)} style={{ ...fieldStyle(), marginTop: "10px" }}>
                  <option value="all">Choose class</option>
                  {classNames.map((name) => <option key={name} value={name}>{name}</option>)}
                </select>
              )}

              {groupMode === "level" && (
                <select value={levelFilter} onChange={(e) => setLevelFilter(e.target.value)} style={{ ...fieldStyle(), marginTop: "10px" }}>
                  <option value="all">Choose level</option>
                  {['Playroom', 'KG', 'Lower Primary', 'Upper Primary', 'JHS'].map((level) => <option key={level} value={level}>{level}</option>)}
                </select>
              )}

              {groupMode === "individual" && (
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Type name, JVS ID or phone" style={{ ...fieldStyle(), marginTop: "10px" }} />
              )}

              <select value={termMode} onChange={(e) => setTermMode(e.target.value)} style={{ ...fieldStyle(), marginTop: "10px" }}>
                <option value="current">Current term balance</option>
                <option value="all">All history balance</option>
              </select>

              <input value={customPath} onChange={(e) => setCustomPath(e.target.value)} placeholder="/parent/fee/{student_id}" style={{ ...fieldStyle(), marginTop: "10px" }} />
              <div style={{ fontSize: "12px", color: COLORS.muted, marginTop: "8px", lineHeight: 1.4 }}>
                Parent link example: {baseUrl}/parent/fee/JVS123456
              </div>
            </div>

            <div className="card" style={cardStyle()}>
              <h2 style={cardTitle()}>Message</h2>
              <textarea value={messageTemplate} onChange={(e) => setMessageTemplate(e.target.value)} rows={8} style={{ ...fieldStyle(), resize: "vertical", lineHeight: 1.5 }} />
              <div style={{ color: COLORS.muted, fontSize: "12px", marginTop: "8px" }}>
                Placeholders: {'{student_name}'}, {'{student_id}'}, {'{class_name}'}, {'{balance}'}, {'{portal_link}'}, {'{term}'}, {'{academic_year}'}, {'{school_name}'}.
              </div>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: "12px", margin: "16px 0" }}>
            <SummaryCard label="Selected" value={summary.total} />
            <SummaryCard label="Can Send" value={summary.withContacts} />
            <SummaryCard label="No Phone" value={summary.noContacts} danger />
            <SummaryCard label="Owing" value={summary.owing} />
          </div>

          <div className="card" style={cardStyle()}>
            <h2 style={cardTitle()}>Send</h2>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
              <button onClick={sendSms} disabled={sendingSms} style={{ ...solidButton(), opacity: sendingSms ? 0.6 : 1 }}>
                {sendingSms ? "Sending SMS..." : `Send SMS (${validRecipients.length})`}
              </button>
              <button onClick={sendWhatsapp} style={{ ...solidButton(), background: "#16a34a", color: "#fff", boxShadow: "0 12px 25px rgba(22,163,74,0.22)" }}>
                Send WhatsApp ({validRecipients.length})
              </button>
              <button onClick={copyWhatsappLinks} style={outlineButton()}>Copy WhatsApp Links</button>
              <button onClick={copyMessages} style={outlineButton()}>Copy Messages</button>
            </div>
            {sendStatus && <div style={{ marginTop: "12px", fontWeight: 900, color: sendStatus.startsWith("SMS error") ? COLORS.dangerText : COLORS.successText }}>{sendStatus}</div>}
            {copied && <div style={{ marginTop: "12px", fontWeight: 900, color: COLORS.successText }}>Copied {copied}.</div>}
          </div>

          <div className="card" style={{ ...cardStyle(), marginTop: "16px" }}>
            <h2 style={cardTitle()}>Preview</h2>
            {firstRecipient ? (
              <div style={{ background: "#f8fafc", border: `1px solid ${COLORS.border}`, borderRadius: "16px", padding: "14px", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
                {firstRecipient.message}
              </div>
            ) : (
              <div style={{ color: COLORS.muted }}>No valid parent contact selected.</div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function SummaryCard({ label, value, danger = false }: { label: string; value: string | number; danger?: boolean }) {
  return (
    <div className="card" style={cardStyle()}>
      <div style={{ color: COLORS.muted, fontWeight: 900, fontSize: "13px" }}>{label}</div>
      <div style={{ fontWeight: 950, fontSize: "24px", marginTop: "6px", color: danger ? COLORS.dangerText : COLORS.text }}>{value}</div>
    </div>
  );
}

function cardStyle(): CSSProperties {
  return {
    background: COLORS.card,
    border: `1px solid ${COLORS.border}`,
    borderRadius: "24px",
    padding: "18px",
    boxShadow: "0 10px 25px rgba(15,23,42,0.07)",
  };
}

function cardTitle(): CSSProperties {
  return { margin: "0 0 14px", fontSize: "18px", fontWeight: 950 };
}

function fieldStyle(): CSSProperties {
  return {
    width: "100%",
    border: `1px solid ${COLORS.border}`,
    borderRadius: "14px",
    padding: "12px 13px",
    background: "#fff",
    color: COLORS.text,
    fontWeight: 700,
    boxSizing: "border-box",
  };
}

function solidButton(): CSSProperties {
  return {
    border: "none",
    background: COLORS.gold,
    color: COLORS.text,
    borderRadius: "14px",
    padding: "13px 18px",
    fontWeight: 950,
    cursor: "pointer",
    boxShadow: "0 12px 25px rgba(212,160,23,0.25)",
  };
}

function outlineButton(): CSSProperties {
  return {
    border: `1px solid ${COLORS.border}`,
    background: "#fff",
    color: COLORS.text,
    borderRadius: "14px",
    padding: "12px 16px",
    fontWeight: 900,
    cursor: "pointer",
  };
}
