"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type AnyRow = Record<string, any>;
type TabKey = "overview" | "fees" | "books" | "uniforms" | "receipts";
type ScopeKey = "current" | "all";

type AccountBox = {
  expected: number;
  paid: number;
  balance: number;
  note?: string;
};

type LedgerRow = {
  id: string;
  module: "Fees" | "Books" | "Uniforms";
  date: string;
  receipt: string;
  details: string;
  expected: number;
  paid: number;
  balance: number;
  method: string;
  receivedBy: string;
};

const COLORS = {
  bg: "#f7f4ec",
  sidebar: "#0f172a",
  sidebarSoft: "#111827",
  gold: "#d4a017",
  goldSoft: "#fde68a",
  card: "#ffffff",
  text: "#111827",
  muted: "#6b7280",
  border: "#e5e7eb",
  greenBg: "#dcfce7",
  greenText: "#166534",
  yellowBg: "#fef3c7",
  yellowText: "#92400e",
  redBg: "#fee2e2",
  redText: "#991b1b",
  blueBg: "#dbeafe",
  blueText: "#1d4ed8",
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

function getRole(row: AnyRow | null) {
  const raw = String(row?.role || "").trim().toLowerCase();
  if (raw === "owner" || raw === "admin" || raw === "headmaster" || raw === "super_admin" || raw === "superadmin") return raw;
  return "teacher";
}

function getStudentName(row: AnyRow | null) {
  return String(row?.full_name || row?.student_name || row?.name || "-").trim();
}

function getClassName(row: AnyRow | null) {
  return String(row?.class_name || row?.className || row?.class || "").trim();
}

function findRealJvsId(row: AnyRow | null) {
  if (!row) return "";

  const likelyFields = [
    row.jvs_id,
    row.student_id,
    row.jsms_id,
    row.jvs_student_id,
    row.jvs_code,
    row.student_code,
    row.student_number,
    row.admission_number,
    row.index_number,
    row.jvsId,
    row.studentId,
    row.id_number,
  ];

  for (const value of likelyFields) {
    const text = String(value || "").trim();
    if (text.toUpperCase().startsWith("JVS")) return text;
  }

  for (const value of Object.values(row)) {
    const text = String(value || "").trim();
    if (text.toUpperCase().startsWith("JVS")) return text;
  }

  return "";
}

function getStudentDbKey(row: AnyRow | null) {
  // Use the real JVS ID as the selected key so search/selection stays stable.
  // The UUID can still be used as fallback for old rows without JVS ID.
  return String(findRealJvsId(row) || row?.id || getStudentName(row)).trim();
}

function numberValue(value: unknown) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

function money(value: number) {
  return `GHS ${Number(value || 0).toFixed(2)}`;
}

function cleanDate(value: unknown) {
  const raw = String(value || "");
  if (!raw) return "-";
  if (raw.includes("T")) return raw.slice(0, 10);
  return raw.slice(0, 10);
}

function classSortValue(className: string) {
  const index = CLASS_ORDER.indexOf(className);
  return index === -1 ? 999 : index;
}

function sameAcademicScope(row: AnyRow, academicYear: string, currentTerm: string, scope: ScopeKey) {
  if (scope === "all") return true;

  const rowYear = String(row.academic_year || row.academicYear || "").trim();
  const rowTerm = String(row.term || row.current_term || row.currentTerm || "").trim();

  return rowYear === academicYear && rowTerm === currentTerm;
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

function computeFeeExpected(params: {
  student: AnyRow | null;
  classRow: AnyRow | null;
  newStudentItems: AnyRow[];
}) {
  const { student, classRow, newStudentItems } = params;
  if (!student) return { expected: 0, baseFee: 0, arrears: 0, note: "No student selected." };

  const className = getClassName(student);
  const levelGroup = getLevelGroupFromClassName(className);
  const isNew = student.is_new === true;

  const newItemsTotal = newStudentItems
    .filter((item) => {
      const itemLevel = String(item.level_group || "").trim().toLowerCase();
      const active = item.is_active !== false;
      return active && itemLevel === levelGroup.toLowerCase();
    })
    .reduce((sum, item) => sum + numberValue(item.amount), 0);

  const returningFee = numberValue(classRow?.fee_returning);
  const fallbackNewFee = numberValue(classRow?.fee_new || classRow?.fee_returning);

  let baseFee = isNew ? newItemsTotal || fallbackNewFee : returningFee;
  let note = isNew
    ? newItemsTotal > 0
      ? `New student structure used for ${levelGroup}.`
      : "New student structure missing, so class fallback fee was used."
    : "Continuing student class fee used.";

  const scholarshipRaw = String(student.scholarship_type || "none").trim().toLowerCase();

  if (scholarshipRaw === "full") {
    baseFee = 0;
    note = "Full scholarship applied.";
  } else if (scholarshipRaw === "half") {
    baseFee = baseFee / 2;
    note = "Half scholarship applied.";
  } else if (scholarshipRaw === "custom") {
    baseFee = numberValue(student.scholarship_amount);
    note = "Custom fee amount saved on student profile applied.";
  }

  const arrears = numberValue(student.arrears);
  return { expected: baseFee + arrears, baseFee, arrears, note };
}

function statusBadge(balance: number, paid: number) {
  if (balance <= 0 && paid > 0) return { text: "Settled", bg: COLORS.greenBg, color: COLORS.greenText };
  if (paid > 0) return { text: "Part Payment", bg: COLORS.yellowBg, color: COLORS.yellowText };
  return { text: "Owing", bg: COLORS.redBg, color: COLORS.redText };
}

function balanceText(value: number) {
  if (value > 0) return `${money(value)} owing`;
  if (value < 0) return `${money(Math.abs(value))} overpaid`;
  return "Fully settled";
}

function paymentStudentId(row: AnyRow) {
  return String(row.student_id || row.studentId || row.jvs_id || row.jvsId || "").trim();
}

function normalizeText(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function nameClassKey(name: string, className: string) {
  return `${name}|${className}`;
}

function rowMatchesStudent(row: AnyRow, student: AnyRow | null, jvsId: string, allowNameFallback: boolean) {
  if (!student) return false;

  const paymentId = paymentStudentId(row);
  const studentDbId = String(student.id || "").trim();
  const studentName = normalizeText(getStudentName(student));
  const studentClass = normalizeText(getClassName(student));
  const rowName = normalizeText(row.student_name || row.full_name || row.name);
  const rowClass = normalizeText(row.class_name || row.class || row.className);

  if (jvsId && paymentId === jvsId) return true;
  if (studentDbId && paymentId === studentDbId) return true;

  // fallback for older rows that saved only name + class instead of JVS ID --
  // only trust it when exactly one student shares this name+class, otherwise
  // leave it unmatched rather than risk crediting the wrong student.
  if (!allowNameFallback) return false;

  return Boolean(rowName && studentName && rowName === studentName && (!rowClass || rowClass === studentClass));
}

async function optionalSelect(table: string, orderColumn?: string, ascending = false) {
  try {
    let query = supabase.from(table).select("*");
    if (orderColumn) query = query.order(orderColumn, { ascending });
    const { data, error } = await query;

    if (error) {
      console.warn(`${table} skipped:`, error.message);
      return [] as AnyRow[];
    }

    return (data || []) as AnyRow[];
  } catch (error) {
    console.warn(`${table} skipped:`, error);
    return [] as AnyRow[];
  }
}

function ActionLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} style={sideLinkStyle}>
      {label}
    </Link>
  );
}

function SummaryCard({ title, box, note }: { title: string; box: AccountBox; note: string }) {
  const badge = statusBadge(box.balance, box.paid);

  return (
    <div className="animated-card" style={panelStyle}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", alignItems: "center" }}>
        <div>
          <p style={{ margin: 0, color: COLORS.muted, fontSize: "13px", fontWeight: 900 }}>{title}</p>
          <h3 style={{ margin: "7px 0 0", fontSize: "21px" }}>{balanceText(box.balance)}</h3>
        </div>
        <span style={{ background: badge.bg, color: badge.color, borderRadius: "999px", padding: "7px 10px", fontSize: "12px", fontWeight: 900 }}>
          {badge.text}
        </span>
      </div>

      <div style={{ display: "grid", gap: "10px", marginTop: "16px" }}>
        <InfoLine label="Expected" value={money(box.expected)} />
        <InfoLine label="Paid" value={money(box.paid)} good={box.paid > 0} />
        <InfoLine label="Balance" value={box.balance > 0 ? money(box.balance) : "GHS 0.00"} danger={box.balance > 0} />
      </div>

      <p style={{ margin: "12px 0 0", color: COLORS.muted, fontSize: "12px", lineHeight: 1.5 }}>{note}</p>
    </div>
  );
}

function InfoLine({ label, value, danger, good }: { label: string; value: string; danger?: boolean; good?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", borderBottom: `1px solid ${COLORS.border}`, paddingBottom: "8px" }}>
      <span style={{ color: COLORS.muted }}>{label}</span>
      <strong style={{ color: danger ? COLORS.redText : good ? COLORS.greenText : COLORS.text }}>{value}</strong>
    </div>
  );
}

function SectionHeader({ title, box, subtitle }: { title: string; box: AccountBox; subtitle: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", marginBottom: "16px" }}>
      <div>
        <h3 style={{ margin: 0 }}>{title}</h3>
        <p style={{ margin: "6px 0 0", color: COLORS.muted, fontSize: "13px" }}>{subtitle}</p>
      </div>
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
        <SmallPill label="Expected" value={money(box.expected)} />
        <SmallPill label="Paid" value={money(box.paid)} />
        <SmallPill label="Balance" value={box.balance > 0 ? money(box.balance) : "GHS 0.00"} />
      </div>
    </div>
  );
}

function SmallPill({ label, value }: { label: string; value: string }) {
  return (
    <span style={{ background: "#f9fafb", border: `1px solid ${COLORS.border}`, borderRadius: "999px", padding: "8px 10px", fontSize: "12px", fontWeight: 900 }}>
      {label}: {value}
    </span>
  );
}

function LedgerTable({ rows, emptyText, showModule = false }: { rows: LedgerRow[]; emptyText: string; showModule?: boolean }) {
  if (rows.length === 0) {
    return <p style={{ margin: 0, color: COLORS.muted }}>{emptyText}</p>;
  }

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", minWidth: showModule ? "940px" : "860px", fontSize: "13px" }}>
        <thead>
          <tr style={{ background: "#fff7d6" }}>
            <th style={thStyle}>Date</th>
            {showModule && <th style={thStyle}>Section</th>}
            <th style={thStyle}>Receipt</th>
            <th style={thStyle}>Details</th>
            <th style={thStyle}>Expected</th>
            <th style={thStyle}>Paid</th>
            <th style={thStyle}>Balance</th>
            <th style={thStyle}>Method</th>
            <th style={thStyle}>Received By</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td style={tdStyle}>{row.date}</td>
              {showModule && <td style={tdStyle}>{row.module}</td>}
              <td style={tdStyle}>{row.receipt}</td>
              <td style={tdStyle}>{row.details}</td>
              <td style={tdStyle}>{money(row.expected)}</td>
              <td style={tdStyle}>{money(row.paid)}</td>
              <td style={tdStyle}>{balanceText(row.balance)}</td>
              <td style={tdStyle}>{row.method || "-"}</td>
              <td style={tdStyle}>{row.receivedBy || "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function StudentAccountsPage() {
  const router = useRouter();

  const [checkingUser, setCheckingUser] = useState(true);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const [settingsRow, setSettingsRow] = useState<AnyRow | null>(null);
  const [classes, setClasses] = useState<AnyRow[]>([]);
  const [students, setStudents] = useState<AnyRow[]>([]);
  const [feePayments, setFeePayments] = useState<AnyRow[]>([]);
  const [bookPayments, setBookPayments] = useState<AnyRow[]>([]);
  const [uniformPayments, setUniformPayments] = useState<AnyRow[]>([]);
  const [newStudentItems, setNewStudentItems] = useState<AnyRow[]>([]);

  const [selectedStudentKey, setSelectedStudentKey] = useState("");
  const [studentSearch, setStudentSearch] = useState("");
  const [scope, setScope] = useState<ScopeKey>("current");
  const [activeTab, setActiveTab] = useState<TabKey>("overview");

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

        const [teachersRes, settingsRes, classesRes, studentsRes] = await Promise.all([
          supabase.from("teachers").select("*"),
          supabase.from("school_settings").select("*").limit(1).maybeSingle(),
          supabase.from("classes").select("*"),
          supabase.from("students").select("*"),
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

        if (settingsRes.error) throw settingsRes.error;
        if (classesRes.error) throw classesRes.error;
        if (studentsRes.error) throw studentsRes.error;

        const [fees, books, uniforms, feeItems] = await Promise.all([
          optionalSelect("fee_payments", "created_at", false),
          optionalSelect("jsms_book_payments", "created_at", false),
          optionalSelect("jsms_uniform_payments", "created_at", false),
          optionalSelect("new_student_fee_items", "sort_order", true),
        ]);

        if (!active) return;

        const studentRows = (studentsRes.data || [])
          .filter((row) => row.active !== false)
          .sort((a, b) => {
            const classCompare = classSortValue(getClassName(a)) - classSortValue(getClassName(b));
            if (classCompare !== 0) return classCompare;
            return getStudentName(a).localeCompare(getStudentName(b));
          });

        setSettingsRow(settingsRes.data || null);
        setClasses(classesRes.data || []);
        setStudents(studentRows);
        setFeePayments(fees);
        setBookPayments(books);
        setUniformPayments(uniforms);
        setNewStudentItems(feeItems);

        const firstWithJvs = studentRows.find((row) => findRealJvsId(row));
        if (firstWithJvs) setSelectedStudentKey(getStudentDbKey(firstWithJvs));
      } catch (error: any) {
        console.error(error);
        setMessage(`Error: ${error?.message || "Failed to load student account."}`);
      } finally {
        if (active) {
          setCheckingUser(false);
          setLoading(false);
        }
      }
    }

    void loadPage();

    return () => {
      active = false;
    };
  }, [router]);

  const schoolName = String(settingsRow?.school_name || "JEFSEM VISION SCHOOL");
  const academicYear = String(settingsRow?.academic_year || "");
  const currentTerm = String(settingsRow?.current_term || "");

  const classMap = useMemo(() => {
    const map = new Map<string, AnyRow>();
    classes.forEach((row) => map.set(getClassName(row), row));
    return map;
  }, [classes]);

  const visibleStudents = useMemo(() => {
    const search = studentSearch.trim().toLowerCase();

    return students.filter((student) => {
      const jvsId = findRealJvsId(student);
      if (!jvsId) return false;
      if (!search) return true;

      const name = getStudentName(student).toLowerCase();
      const id = jvsId.toLowerCase();
      const className = getClassName(student).toLowerCase();
      return name.includes(search) || id.includes(search) || className.includes(search);
    });
  }, [students, studentSearch]);

  useEffect(() => {
    if (students.length === 0) return;

    const search = studentSearch.trim();

    if (search) {
      const firstMatch = visibleStudents[0];
      const firstMatchKey = firstMatch ? getStudentDbKey(firstMatch) : "";

      if (firstMatchKey && selectedStudentKey !== firstMatchKey) {
        setSelectedStudentKey(firstMatchKey);
      }

      if (!firstMatchKey && selectedStudentKey) {
        setSelectedStudentKey("");
      }

      return;
    }

    const selectedStillExists = visibleStudents.some((student) => getStudentDbKey(student) === selectedStudentKey);

    if (!selectedStillExists && visibleStudents[0]) {
      setSelectedStudentKey(getStudentDbKey(visibleStudents[0]));
    }
  }, [studentSearch, students.length, visibleStudents, selectedStudentKey]);

  const selectedStudent = useMemo(() => {
    return students.find((student) => getStudentDbKey(student) === selectedStudentKey) || null;
  }, [students, selectedStudentKey]);

  const jvsStudentId = findRealJvsId(selectedStudent);
  const className = getClassName(selectedStudent);
  const classRow = classMap.get(className) || null;

  // Counts how many loaded students share the same normalized name+class, so
  // the name/class payment-matching fallback (for legacy rows with no
  // student ID) can be restricted to only the unambiguous cases below.
  const nameClassCounts = useMemo(() => {
    const map = new Map<string, number>();
    students.forEach((student) => {
      const key = nameClassKey(normalizeText(getStudentName(student)), normalizeText(getClassName(student)));
      map.set(key, (map.get(key) || 0) + 1);
    });
    return map;
  }, [students]);

  const allowNameFallback = useMemo(() => {
    if (!selectedStudent) return false;
    const key = nameClassKey(normalizeText(getStudentName(selectedStudent)), normalizeText(className));
    return (nameClassCounts.get(key) || 0) === 1;
  }, [selectedStudent, className, nameClassCounts]);

  const studentFeePayments = useMemo(() => {
    return feePayments.filter(
      (row) =>
        rowMatchesStudent(row, selectedStudent, jvsStudentId, allowNameFallback) &&
        sameAcademicScope(row, academicYear, currentTerm, scope)
    );
  }, [feePayments, selectedStudent, jvsStudentId, allowNameFallback, academicYear, currentTerm, scope]);

  const studentBookPayments = useMemo(() => {
    return bookPayments.filter(
      (row) =>
        rowMatchesStudent(row, selectedStudent, jvsStudentId, allowNameFallback) &&
        sameAcademicScope(row, academicYear, currentTerm, scope)
    );
  }, [bookPayments, selectedStudent, jvsStudentId, allowNameFallback, academicYear, currentTerm, scope]);

  const studentUniformPayments = useMemo(() => {
    return uniformPayments.filter(
      (row) =>
        rowMatchesStudent(row, selectedStudent, jvsStudentId, allowNameFallback) &&
        sameAcademicScope(row, academicYear, currentTerm, scope)
    );
  }, [uniformPayments, selectedStudent, jvsStudentId, allowNameFallback, academicYear, currentTerm, scope]);

  const feeBox = useMemo<AccountBox>(() => {
    const feeCalc = computeFeeExpected({ student: selectedStudent, classRow, newStudentItems });
    const expected = scope === "current" ? feeCalc.expected : 0;
    const paid = studentFeePayments.reduce((sum, row) => sum + numberValue(row.amount_paid), 0);
    const balance = scope === "current" ? expected - paid : 0;
    return { expected, paid, balance, note: feeCalc.note };
  }, [selectedStudent, classRow, newStudentItems, studentFeePayments, scope]);

  const bookBox = useMemo<AccountBox>(() => {
    const expected = studentBookPayments.reduce((sum, row) => sum + numberValue(row.total_amount), 0);
    const paid = studentBookPayments.reduce((sum, row) => sum + numberValue(row.amount_paid), 0);
    return { expected, paid, balance: expected - paid };
  }, [studentBookPayments]);

  const uniformBox = useMemo<AccountBox>(() => {
    const expected = studentUniformPayments.reduce((sum, row) => sum + numberValue(row.total_amount), 0);
    const paid = studentUniformPayments.reduce((sum, row) => sum + numberValue(row.amount_paid), 0);
    return { expected, paid, balance: expected - paid };
  }, [studentUniformPayments]);

  const feeRows = useMemo<LedgerRow[]>(() => {
    return studentFeePayments.map((row, index) => ({
      id: `fees-${row.id || index}`,
      module: "Fees",
      date: cleanDate(row.payment_date || row.created_at),
      receipt: String(row.receipt_no || row.receipt_number || "-"),
      details: String(row.payment_type || row.notes || "School fees"),
      expected: scope === "current" ? feeBox.expected : 0,
      paid: numberValue(row.amount_paid),
      balance: 0,
      method: String(row.method || row.payment_method || "-"),
      receivedBy: String(row.recorded_by || row.received_by || "-"),
    }));
  }, [studentFeePayments, feeBox.expected, scope]);

  const bookRows = useMemo<LedgerRow[]>(() => {
    return studentBookPayments.map((row, index) => ({
      id: `books-${row.id || index}`,
      module: "Books",
      date: cleanDate(row.created_at || row.payment_date),
      receipt: String(row.receipt_number || row.receipt_no || "-"),
      details: String(row.paid_for || row.item_name || row.payment_type || "Books"),
      expected: numberValue(row.total_amount),
      paid: numberValue(row.amount_paid),
      balance: numberValue(row.balance),
      method: String(row.payment_method || row.method || "-"),
      receivedBy: String(row.received_by || row.receipt_issued_by || "-"),
    }));
  }, [studentBookPayments]);

  const uniformRows = useMemo<LedgerRow[]>(() => {
    return studentUniformPayments.map((row, index) => ({
      id: `uniforms-${row.id || index}`,
      module: "Uniforms",
      date: cleanDate(row.created_at || row.payment_date),
      receipt: String(row.receipt_number || row.receipt_no || "-"),
      details: String(row.paid_for || row.item_name || row.payment_type || "Uniforms"),
      expected: numberValue(row.total_amount),
      paid: numberValue(row.amount_paid),
      balance: numberValue(row.balance),
      method: String(row.payment_method || row.method || "-"),
      receivedBy: String(row.received_by || row.receipt_issued_by || "-"),
    }));
  }, [studentUniformPayments]);

  const allRows = useMemo(() => {
    return [...feeRows, ...bookRows, ...uniformRows].sort((a, b) => b.date.localeCompare(a.date));
  }, [feeRows, bookRows, uniformRows]);

  const tabs: { key: TabKey; label: string }[] = [
    { key: "overview", label: "Overview" },
    { key: "fees", label: "Fees" },
    { key: "books", label: "Books" },
    { key: "uniforms", label: "Uniforms" },
    { key: "receipts", label: "Receipts" },
  ];

  if (checkingUser || loading) {
    return <div style={{ padding: "24px" }}>Loading student accounts...</div>;
  }

  return (
    <main style={{ minHeight: "100vh", background: COLORS.bg, fontFamily: "Arial, sans-serif", color: COLORS.text }}>
      <style jsx global>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(14px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .animated-card {
          animation: fadeUp 0.42s ease both;
          transition: transform 0.22s ease, box-shadow 0.22s ease, border-color 0.22s ease;
        }

        .animated-card:hover {
          transform: translateY(-4px);
          box-shadow: 0 22px 46px rgba(15, 23, 42, 0.13) !important;
          border-color: ${COLORS.gold} !important;
        }

        input:focus, select:focus {
          outline: none;
          border-color: ${COLORS.gold} !important;
          box-shadow: 0 0 0 4px rgba(212, 160, 23, 0.16);
        }

        @media (max-width: 900px) {
          .layout-shell { display: block !important; }
          .sidebar { position: relative !important; width: auto !important; min-height: auto !important; }
          .main-area { padding: 16px !important; }
          .search-grid { grid-template-columns: 1fr !important; }
        }

        @media print {
          aside, .no-print, .student-search-card { display: none !important; }
          main { background: #fff !important; }
          .print-area { padding: 0 !important; max-width: none !important; }
          .animated-card { box-shadow: none !important; break-inside: avoid; }
        }
      `}</style>

      <div className="layout-shell" style={{ display: "flex", minHeight: "100vh" }}>
        <aside
          className="sidebar"
          style={{
            width: "clamp(220px, 22vw, 290px)",
            background: `linear-gradient(180deg, ${COLORS.sidebar} 0%, ${COLORS.sidebarSoft} 100%)`,
            color: "#fff",
            padding: "24px 18px",
            borderRight: `4px solid ${COLORS.gold}`,
            position: "sticky",
            top: 0,
            alignSelf: "flex-start",
            minHeight: "100vh",
            flexShrink: 0,
          }}
        >
          <div style={{ marginBottom: "24px" }}>
            <p style={{ margin: 0, fontSize: "12px", opacity: 0.8 }}>Fees Module</p>
            <h1 style={{ margin: "6px 0 0", fontSize: "24px", lineHeight: 1.2 }}>Student Accounts</h1>
            <p style={{ margin: "10px 0 0", fontSize: "13px", opacity: 0.85 }}>{schoolName}</p>
            <p style={{ margin: "4px 0 0", fontSize: "12px", color: COLORS.goldSoft }}>
              {academicYear || "-"} • {currentTerm || "-"}
            </p>
          </div>

          <div style={{ display: "grid", gap: "10px" }}>
            <ActionLink href="/fees/admin" label="Dashboard" />
            <ActionLink href="/fees/admin/record-payment" label="Record Payment" />
            <ActionLink href="/fees/admin/fee-structure" label="Fee Structure" />
            <ActionLink href="/fees/admin/student-accounts" label="Student Accounts" />
            <ActionLink href="/fees/admin/debtors" label="Debtors" />
            <ActionLink href="/fees/admin/receipts" label="Receipts" />
            <ActionLink href="/fees/admin/reports" label="Reports" />
            <ActionLink href="/fees/admin/fee-reminder" label="Fee Reminder" />
          </div>
        </aside>

        <section className="main-area print-area" style={{ flex: 1, padding: "26px", maxWidth: "1500px", margin: "0 auto" }}>
          <div
            className="no-print"
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: "14px",
              alignItems: "center",
              flexWrap: "wrap",
              marginBottom: "20px",
            }}
          >
            <div>
              <h2 style={{ margin: 0, fontSize: "28px" }}>Student Financial Summary</h2>
              <p style={{ margin: "7px 0 0", color: COLORS.muted }}>
                Fees, books and uniforms are shown separately. No net balance is combined.
              </p>
            </div>

            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              <button onClick={() => setScope("current")} style={scope === "current" ? primaryButton : lightButton}>
                Current Term
              </button>
              <button onClick={() => setScope("all")} style={scope === "all" ? primaryButton : lightButton}>
                All History
              </button>
              <button onClick={() => window.print()} style={goldButton}>
                Print Account
              </button>
            </div>
          </div>

          {message && (
            <div
              className="no-print"
              style={{
                background: message.startsWith("Error") ? COLORS.redBg : COLORS.greenBg,
                color: message.startsWith("Error") ? COLORS.redText : COLORS.greenText,
                borderRadius: "16px",
                padding: "13px 15px",
                marginBottom: "18px",
                fontWeight: 800,
              }}
            >
              {message}
            </div>
          )}

          <div
            className="student-search-card no-print"
            style={{
              background: COLORS.card,
              borderRadius: "22px",
              padding: "18px",
              boxShadow: "0 14px 34px rgba(15,23,42,0.08)",
              border: `1px solid ${COLORS.border}`,
              marginBottom: "20px",
            }}
          >
            <div className="search-grid" style={{ display: "grid", gridTemplateColumns: "1.2fr 1.6fr", gap: "14px" }}>
              <div>
                <label style={labelStyle}>Search Student</label>
                <input
                  value={studentSearch}
                  onChange={(e) => setStudentSearch(e.target.value)}
                  placeholder="Type name, class or JVS ID"
                  style={inputStyle}
                />
                <p style={{ margin: "8px 0 0", color: COLORS.muted, fontSize: "12px" }}>
                  {studentSearch.trim()
                    ? `${visibleStudents.length} result${visibleStudents.length === 1 ? "" : "s"} found`
                    : "Start typing to jump straight to a student."}
                </p>
              </div>
              <div>
                <label style={labelStyle}>Select Student</label>
                <select value={selectedStudentKey} onChange={(e) => setSelectedStudentKey(e.target.value)} style={inputStyle}>
                  {visibleStudents.length === 0 ? (
                    <option value="">No student with JVS ID found</option>
                  ) : (
                    visibleStudents.map((student) => {
                      const jvsId = findRealJvsId(student);
                      const key = getStudentDbKey(student);
                      return (
                        <option key={key} value={key}>
                          {getStudentName(student)} — {getClassName(student)} — {jvsId}
                        </option>
                      );
                    })
                  )}
                </select>
              </div>
            </div>

            {studentSearch.trim() && visibleStudents.length > 0 && (
              <div style={{ marginTop: "14px", display: "flex", gap: "8px", flexWrap: "wrap" }}>
                {visibleStudents.slice(0, 8).map((student) => {
                  const key = getStudentDbKey(student);
                  const active = key === selectedStudentKey;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setSelectedStudentKey(key)}
                      style={{
                        border: active ? `1px solid ${COLORS.gold}` : `1px solid ${COLORS.border}`,
                        background: active ? "#fff7d6" : "#fff",
                        color: COLORS.text,
                        borderRadius: "999px",
                        padding: "9px 12px",
                        fontWeight: 900,
                        cursor: "pointer",
                        fontSize: "12px",
                      }}
                    >
                      {getStudentName(student)} • {getClassName(student)} • {findRealJvsId(student)}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {!selectedStudent ? (
            <div style={panelStyle}>No student selected.</div>
          ) : !jvsStudentId ? (
            <div style={panelStyle}>This student has no JVS ID saved. Add the JVS student ID first.</div>
          ) : (
            <>
              <div
                className="animated-card"
                style={{
                  background: `linear-gradient(135deg, ${COLORS.sidebar} 0%, #1f2937 100%)`,
                  color: "#fff",
                  borderRadius: "26px",
                  padding: "22px",
                  border: `1px solid rgba(255,255,255,0.12)`,
                  boxShadow: "0 18px 40px rgba(15,23,42,0.18)",
                  marginBottom: "20px",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: "16px", flexWrap: "wrap" }}>
                  <div>
                    <p style={{ margin: 0, color: COLORS.goldSoft, fontSize: "13px", fontWeight: 900 }}>Student Financial Statement</p>
                    <h2 style={{ margin: "7px 0 0", fontSize: "27px" }}>{getStudentName(selectedStudent)}</h2>
                    <p style={{ margin: "8px 0 0", opacity: 0.86 }}>
                      <strong>{jvsStudentId}</strong> • {className} • {getLevelGroupFromClassName(className)}
                    </p>
                  </div>

                  <div style={{ textAlign: "right" }}>
                    <p style={{ margin: 0, fontSize: "13px", opacity: 0.82 }}>View</p>
                    <h3 style={{ margin: "6px 0 0" }}>{scope === "current" ? `${academicYear || "-"} • ${currentTerm || "-"}` : "All Payment History"}</h3>
                    <p style={{ margin: "6px 0 0", color: COLORS.goldSoft, fontWeight: 900 }}>
                      Student ID: {jvsStudentId}
                    </p>
                  </div>
                </div>
              </div>

              {scope === "all" && (
                <div
                  className="no-print"
                  style={{
                    background: COLORS.blueBg,
                    color: COLORS.blueText,
                    borderRadius: "16px",
                    padding: "12px 14px",
                    marginBottom: "18px",
                    fontWeight: 800,
                    fontSize: "13px",
                  }}
                >
                  All History shows payment records. Fees expected/balance is only calculated in Current Term because old term structures may be different.
                </div>
              )}


              <div
                className="animated-card"
                style={{
                  background: "#fffef8",
                  border: `1px solid ${COLORS.goldSoft}`,
                  borderRadius: "20px",
                  padding: "14px 16px",
                  marginBottom: "18px",
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                  gap: "10px",
                }}
              >
                <InfoLine label="Student Type" value={selectedStudent.is_new === true ? "New Student" : "Continuing Student"} />
                <InfoLine label="Scholarship" value={String(selectedStudent.scholarship_type || "none").toUpperCase()} />
                <InfoLine label="Custom/Saved Fee" value={String(selectedStudent.scholarship_type || "").toLowerCase() === "custom" ? money(numberValue(selectedStudent.scholarship_amount)) : "Not custom"} />
                <InfoLine label="Arrears" value={money(numberValue(selectedStudent.arrears))} />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "16px", marginBottom: "20px" }}>
                <SummaryCard title="Fees Summary" box={feeBox} note={feeBox.note || "School fees only."} />
                <SummaryCard title="Books Summary" box={bookBox} note="Books payments only." />
                <SummaryCard title="Uniforms Summary" box={uniformBox} note="Uniform payments only." />
              </div>

              <div className="no-print" style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginBottom: "18px" }}>
                {tabs.map((tab) => (
                  <button key={tab.key} onClick={() => setActiveTab(tab.key)} style={activeTab === tab.key ? primaryButton : lightButton}>
                    {tab.label}
                  </button>
                ))}
              </div>

              {activeTab === "overview" && (
                <div style={{ display: "grid", gap: "16px" }}>
                  <div style={panelStyle}>
                    <SectionHeader title="Fees Account" box={feeBox} subtitle="Separate fees balance for this student." />
                    <LedgerTable rows={feeRows.slice(0, 5)} emptyText="No fee payment found for this student." />
                  </div>

                  <div style={panelStyle}>
                    <SectionHeader title="Books Account" box={bookBox} subtitle="Separate books balance for this student." />
                    <LedgerTable rows={bookRows.slice(0, 5)} emptyText="No book payment found for this student." />
                  </div>

                  <div style={panelStyle}>
                    <SectionHeader title="Uniforms Account" box={uniformBox} subtitle="Separate uniforms balance for this student." />
                    <LedgerTable rows={uniformRows.slice(0, 5)} emptyText="No uniform payment found yet. Uniforms will show here once the uniform page saves into jsms_uniform_payments." />
                  </div>
                </div>
              )}

              {activeTab === "fees" && (
                <div style={panelStyle}>
                  <SectionHeader title="Fees Account" box={feeBox} subtitle="School fees only. Not mixed with books or uniforms." />
                  <LedgerTable rows={feeRows} emptyText="No fee payment found for this student." />
                </div>
              )}

              {activeTab === "books" && (
                <div style={panelStyle}>
                  <SectionHeader title="Books Account" box={bookBox} subtitle="Books only. Not mixed with fees or uniforms." />
                  <LedgerTable rows={bookRows} emptyText="No book payment found for this student." />
                </div>
              )}

              {activeTab === "uniforms" && (
                <div style={panelStyle}>
                  <SectionHeader title="Uniforms Account" box={uniformBox} subtitle="Uniforms only. Same payment logic as books." />
                  <LedgerTable rows={uniformRows} emptyText="No uniform payment found yet. Uniforms will show here once the uniform page saves into jsms_uniform_payments." />
                </div>
              )}

              {activeTab === "receipts" && (
                <div style={panelStyle}>
                  <SectionHeader title="All Receipts" box={{ expected: 0, paid: 0, balance: 0 }} subtitle="Receipts grouped by section. Balances are not combined." />
                  <LedgerTable rows={allRows} emptyText="No receipt or payment found for this student." showModule />
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </main>
  );
}

const sideLinkStyle: CSSProperties = {
  display: "block",
  textDecoration: "none",
  color: "#fff",
  padding: "11px 12px",
  borderRadius: "13px",
  background: "rgba(255,255,255,0.07)",
  border: "1px solid rgba(255,255,255,0.1)",
  fontSize: "14px",
};

const labelStyle: CSSProperties = {
  display: "block",
  fontSize: "13px",
  fontWeight: 900,
  marginBottom: "7px",
};

const inputStyle: CSSProperties = {
  width: "100%",
  padding: "12px 13px",
  borderRadius: "14px",
  border: `1px solid ${COLORS.border}`,
  background: "#fff",
  fontSize: "16px",
};

const primaryButton: CSSProperties = {
  border: "none",
  background: COLORS.sidebar,
  color: "#fff",
  padding: "10px 13px",
  borderRadius: "999px",
  fontWeight: 900,
  cursor: "pointer",
};

const lightButton: CSSProperties = {
  border: `1px solid ${COLORS.border}`,
  background: "#fff",
  color: COLORS.text,
  padding: "10px 13px",
  borderRadius: "999px",
  fontWeight: 900,
  cursor: "pointer",
};

const goldButton: CSSProperties = {
  border: "none",
  background: COLORS.gold,
  color: "#111827",
  padding: "10px 13px",
  borderRadius: "999px",
  fontWeight: 900,
  cursor: "pointer",
};

const panelStyle: CSSProperties = {
  background: COLORS.card,
  borderRadius: "22px",
  padding: "18px",
  boxShadow: "0 14px 34px rgba(15,23,42,0.08)",
  border: `1px solid ${COLORS.border}`,
};

const thStyle: CSSProperties = {
  textAlign: "left",
  padding: "11px",
  borderBottom: `1px solid ${COLORS.border}`,
  whiteSpace: "nowrap",
};

const tdStyle: CSSProperties = {
  padding: "11px",
  borderBottom: `1px solid ${COLORS.border}`,
  verticalAlign: "top",
};
