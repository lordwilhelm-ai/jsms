"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { FiArrowLeft, FiRefreshCw, FiSearch } from "react-icons/fi";
import { supabase } from "@/lib/supabase";
import { fetchWithCache } from "@/lib/offline/cachedQuery";
import { fetchAllRows } from "@/lib/supabasePagination";

const OFFLINE_MODULE = "report-card";

const CLASS_ORDER = [
  "Playroom 1", "Playroom 2", "KG 1", "KG 2",
  "Class 1", "Class 2", "Class 3", "Class 4", "Class 5", "Class 6",
  "JHS 1", "JHS 2", "JHS 3",
];

type StudentRow = Record<string, any>;
type SettingsRow = Record<string, any>;
type ClassRow = Record<string, any>;
type FeeViewRow = Record<string, any>;

function cleanText(value: unknown) {
  return String(value || "").trim();
}

function cleanLower(value: unknown) {
  return cleanText(value).toLowerCase();
}

function safeNumber(value: unknown) {
  const numberValue = Number(value || 0);
  return Number.isNaN(numberValue) ? 0 : numberValue;
}

function formatMoney(value: number) {
  return `₵${safeNumber(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function isActiveStudent(student: StudentRow) {
  const status = cleanLower(student.status);
  if (student.left_school === true) return false;
  if (student.is_active === false) return false;
  if (student.active === false) return false;
  if (status === "inactive" || status === "left" || status === "withdrawn") return false;
  return true;
}

function getAcademicYear(settings: SettingsRow | null) {
  return cleanText(settings?.current_academic_year || settings?.academic_year);
}

function getStudentName(student: StudentRow) {
  return (
    cleanText(student.full_name) ||
    `${student.first_name || ""} ${student.last_name || ""}`.trim() ||
    "Unnamed Student"
  );
}

function getStudentReportId(student: StudentRow) {
  return cleanText(student.student_id || student.jvs_id || student.id);
}

function getClassName(row: ClassRow) {
  return cleanText(row.class_name || row.name);
}

function getClassOrder(className: string, classes: ClassRow[]) {
  const found = classes.find((item) => getClassName(item) === className);
  if (found?.class_order !== null && found?.class_order !== undefined) return Number(found.class_order);
  const fallback = CLASS_ORDER.indexOf(className);
  return fallback === -1 ? 999 : fallback;
}

function getNextTermLabel(currentTerm: string) {
  const term = cleanLower(currentTerm);
  if (term.includes("first")) return "Second Term";
  if (term.includes("second")) return "Third Term";
  if (term.includes("third")) return "First Term";
  return "Next Term";
}

function getStudentKeys(student: StudentRow) {
  return [
    cleanText(student.id),
    cleanText(student.student_id),
    cleanText(student.jvs_id),
  ].filter(Boolean);
}

function rowBelongsToStudent(row: Record<string, any>, student: StudentRow) {
  const keys = new Set(getStudentKeys(student));
  return (
    keys.has(cleanText(row.student_id)) ||
    keys.has(cleanText(row.jvs_id)) ||
    keys.has(cleanText(row.student_uuid)) ||
    keys.has(cleanText(row.student_db_id)) ||
    keys.has(cleanText(row.id))
  );
}

function isSameAcademicPeriod(row: Record<string, any>, settings: SettingsRow | null) {
  const rowYear = cleanText(row.academic_year || row.current_academic_year);
  const rowTerm = cleanText(row.term || row.current_term);
  const settingsYear = getAcademicYear(settings);
  const settingsTerm = cleanText(settings?.current_term);
  const yearMatches = !rowYear || !settingsYear || rowYear === settingsYear;
  const termMatches = !rowTerm || !settingsTerm || rowTerm === settingsTerm;
  return yearMatches && termMatches;
}

function getLatestPaymentRow(student: StudentRow, settings: SettingsRow | null, feePaymentRows: Record<string, any>[]) {
  const rows = feePaymentRows
    .filter((row) => rowBelongsToStudent(row, student))
    .filter((row) => isSameAcademicPeriod(row, settings))
    .sort((a, b) => {
      const dateA = new Date(cleanText(a.payment_date || a.created_at || a.updated_at || a.date)).getTime();
      const dateB = new Date(cleanText(b.payment_date || b.created_at || b.updated_at || b.date)).getTime();
      return (Number.isNaN(dateB) ? 0 : dateB) - (Number.isNaN(dateA) ? 0 : dateA);
    });
  return rows[0] || null;
}

function getTotalPaidFromFeePayments(student: StudentRow, settings: SettingsRow | null, feePaymentRows: Record<string, any>[]) {
  return feePaymentRows
    .filter((row) => rowBelongsToStudent(row, student))
    .filter((row) => isSameAcademicPeriod(row, settings))
    .reduce((sum, row) => sum + safeNumber(row.amount) + safeNumber(row.amount_paid) + safeNumber(row.paid_amount) + safeNumber(row.payment_amount), 0);
}

function getClassBaseFee(student: StudentRow, classRows: ClassRow[]) {
  const classRow = classRows.find((row) => getClassName(row) === cleanText(student.class_name));
  if (!classRow) return 0;
  return (
    safeNumber(classRow.fee_returning) ||
    safeNumber(classRow.returning_fee) ||
    safeNumber(classRow.continuing_fee) ||
    safeNumber(classRow.fee_continuing) ||
    safeNumber(classRow.amount) ||
    safeNumber(classRow.fee_amount)
  );
}

function getFeeFromFeeStructure(student: StudentRow, settings: SettingsRow | null, feeStructureRows: Record<string, any>[], classRows: ClassRow[]) {
  const nextTermLabel = getNextTermLabel(cleanText(settings?.current_term));
  const matchingStructure = feeStructureRows.find((row) => {
    const rowClass = cleanText(row.class_name || row.class || row.level);
    const rowTerm = cleanText(row.term || row.fee_term);
    const classMatches = rowClass === cleanText(student.class_name);
    const termMatches = !rowTerm || rowTerm === nextTermLabel;
    return classMatches && termMatches;
  });

  if (matchingStructure) {
    return (
      safeNumber(matchingStructure.fee_returning) ||
      safeNumber(matchingStructure.returning_fee) ||
      safeNumber(matchingStructure.continuing_fee) ||
      safeNumber(matchingStructure.fee_continuing) ||
      safeNumber(matchingStructure.amount) ||
      safeNumber(matchingStructure.fee_amount) ||
      safeNumber(matchingStructure.total_fee)
    );
  }

  return getClassBaseFee(student, classRows);
}

function applyScholarship(student: StudentRow, baseFee: number) {
  const type = cleanLower(student.scholarship_type);
  const scholarshipAmount = safeNumber(student.scholarship_amount);

  if (!type || type === "none" || type === "regular") return { payable: baseFee, note: "" };
  if (type === "full") return { payable: 0, note: "Full Scholarship" };
  if (type === "half") return { payable: baseFee / 2, note: "Half Scholarship" };
  if (type === "custom") return { payable: Math.max(0, scholarshipAmount), note: `Scholarship Payable: ${formatMoney(scholarshipAmount)}` };
  return { payable: baseFee, note: "" };
}

function computeFees(
  student: StudentRow,
  settings: SettingsRow | null,
  feeLiveRows: FeeViewRow[],
  feePaymentRows: Record<string, any>[],
  feeStructureRows: Record<string, any>[],
  classRows: ClassRow[]
) {
  const feeLive = feeLiveRows.find((row) => rowBelongsToStudent(row, student));

  const currentTermBaseFee = getFeeFromFeeStructure(student, settings, feeStructureRows, classRows);
  const currentTermScholarship = applyScholarship(student, currentTermBaseFee);
  const expectedCurrentTermFee = currentTermScholarship.payable;

  const totalPaid = getTotalPaidFromFeePayments(student, settings, feePaymentRows);

  // student.arrears / previous_balance are the same school-fees-only fields
  // the Fees module (record-payment, debtors, etc.) reads — student_balances
  // is the FEEDING ledger (upserted by the feeding module, keyed only by
  // student_id) and must never be folded into fee arrears here.
  const manualArrears =
    safeNumber(student.arrears) ||
    safeNumber(student.previous_balance);

  const computedArrears = Math.max(0, expectedCurrentTermFee + manualArrears - totalPaid);

  const liveArrears =
    safeNumber(feeLive?.arrears) ||
    safeNumber(feeLive?.total_arrears) ||
    safeNumber(feeLive?.balance) ||
    safeNumber(feeLive?.fee_balance) ||
    safeNumber(feeLive?.outstanding_balance) ||
    safeNumber(feeLive?.outstanding_fees) ||
    safeNumber(feeLive?.school_fees_arrears) ||
    safeNumber(feeLive?.amount_due);

  const arrears = liveArrears || computedArrears;

  const nextTermBaseFee = getFeeFromFeeStructure(student, settings, feeStructureRows, classRows);
  const nextTermScholarship = applyScholarship(student, nextTermBaseFee);
  const nextTermFee = nextTermScholarship.payable;
  const total = arrears + nextTermFee;

  return {
    arrears,
    nextTermFee,
    total,
    scholarshipNote: cleanText(feeLive?.scholarship_note) || nextTermScholarship.note || currentTermScholarship.note,
  };
}

export default function ReportCardBillingPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [showingCachedData, setShowingCachedData] = useState(false);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [settings, setSettings] = useState<SettingsRow | null>(null);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [feeLiveRows, setFeeLiveRows] = useState<FeeViewRow[]>([]);
  const [feePayments, setFeePayments] = useState<Record<string, any>[]>([]);
  const [feeStructures, setFeeStructures] = useState<Record<string, any>[]>([]);
  const [selectedClass, setSelectedClass] = useState("All");
  const [search, setSearch] = useState("");

  const academicYear = getAcademicYear(settings);
  const currentTerm = cleanText(settings?.current_term);
  const nextTermLabel = getNextTermLabel(currentTerm);

  async function loadData() {
    setLoading(true);
    const [studentsRes, settingsRes, classesRes, feeLiveRes, feePaymentsRes, feeStructureRes] = await Promise.all([
      fetchWithCache(OFFLINE_MODULE, "students", () => supabase.from("students").select("*"), [] as any[]),
      fetchWithCache(OFFLINE_MODULE, "school_settings", () => supabase.from("school_settings").select("*").order("updated_at", { ascending: false }).limit(1).maybeSingle(), null as any),
      fetchWithCache(OFFLINE_MODULE, "classes", () => supabase.from("classes").select("*").order("class_order", { ascending: true }), [] as any[]),
      fetchWithCache(OFFLINE_MODULE, "jsms_report_fee_live_view", () => supabase.from("jsms_report_fee_live_view").select("*"), [] as any[]),
      fetchWithCache(
        OFFLINE_MODULE,
        "fee_payments",
        () => fetchAllRows((from, to) => supabase.from("fee_payments").select("*").range(from, to)),
        [] as any[]
      ),
      fetchWithCache(OFFLINE_MODULE, "fee_structure", () => supabase.from("fee_structure").select("*"), [] as any[]),
    ]);

    setStudents((studentsRes.data || []).filter(isActiveStudent));
    setSettings(settingsRes.data || null);
    setClasses(classesRes.data || []);
    setFeeLiveRows(feeLiveRes.data || []);
    setFeePayments(feePaymentsRes.data || []);
    setFeeStructures(feeStructureRes.data || []);
    setShowingCachedData(
      [studentsRes, settingsRes, classesRes, feeLiveRes, feePaymentsRes, feeStructureRes].some((r) => r.fromCache)
    );
    setLoading(false);
  }

  useEffect(() => { loadData(); }, []);

  const classNames = useMemo(() => {
    const fromClasses = classes.map(getClassName).filter(Boolean);
    const fromStudents = students.map((s) => cleanText(s.class_name)).filter(Boolean);
    return Array.from(new Set([...fromClasses, ...fromStudents])).sort((a, b) => getClassOrder(a, classes) - getClassOrder(b, classes));
  }, [classes, students]);

  const billingRows = useMemo(() => {
    return students
      .map((student) => ({
        student,
        fees: computeFees(student, settings, feeLiveRows, feePayments, feeStructures, classes),
      }))
      .filter((row) => selectedClass === "All" || cleanText(row.student.class_name) === selectedClass)
      .filter((row) => {
        const query = cleanLower(search);
        if (!query) return true;
        return cleanLower(getStudentName(row.student)).includes(query) || cleanLower(getStudentReportId(row.student)).includes(query);
      })
      .sort((a, b) => {
        const classDiff = getClassOrder(cleanText(a.student.class_name), classes) - getClassOrder(cleanText(b.student.class_name), classes);
        if (classDiff !== 0) return classDiff;
        return getStudentName(a.student).localeCompare(getStudentName(b.student));
      });
  }, [students, settings, feeLiveRows, feePayments, feeStructures, classes, selectedClass, search]);

  const totals = useMemo(() => billingRows.reduce((acc, row) => ({
    arrears: acc.arrears + row.fees.arrears,
    nextTermFee: acc.nextTermFee + row.fees.nextTermFee,
    total: acc.total + row.fees.total,
  }), { arrears: 0, nextTermFee: 0, total: 0 }), [billingRows]);

  return (
    <div className="min-h-screen bg-gray-100 p-5">
      <div className="mx-auto max-w-6xl space-y-5">
        <div className="rounded-3xl bg-white p-6 shadow-sm">
          <button
            type="button"
            onClick={() => router.push("/report-card/admin")}
            className="mb-4 inline-flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-sky-700"
          >
            <FiArrowLeft size={16} />
            Back to Dashboard
          </button>
          <h1 className="text-2xl font-extrabold text-gray-900">Bills</h1>
          <p className="mt-2 text-sm text-gray-500">Fees for next term, as they will appear on each student&apos;s report card.</p>
          <p className="mt-2 text-sm font-semibold text-sky-700">{currentTerm || "Current Term"} • {academicYear || "Academic Year"}</p>
          {showingCachedData && (
            <p className="mt-2 text-xs text-gray-400">Showing last synced data</p>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-3xl bg-white p-6 shadow-sm">
            <p className="text-sm font-bold text-slate-500">Arrears (Current Term)</p>
            <h3 className="mt-3 text-3xl font-black text-slate-900">{loading ? "..." : formatMoney(totals.arrears)}</h3>
          </div>
          <div className="rounded-3xl bg-white p-6 shadow-sm">
            <p className="text-sm font-bold text-slate-500">{nextTermLabel} Fees</p>
            <h3 className="mt-3 text-3xl font-black text-slate-900">{loading ? "..." : formatMoney(totals.nextTermFee)}</h3>
          </div>
          <div className="rounded-3xl bg-white p-6 shadow-sm">
            <p className="text-sm font-bold text-slate-500">Total Due</p>
            <h3 className="mt-3 text-3xl font-black text-emerald-700">{loading ? "..." : formatMoney(totals.total)}</h3>
          </div>
        </div>

        <div className="flex flex-col gap-4 rounded-3xl bg-white p-5 shadow-sm lg:flex-row lg:items-center lg:justify-between">
          <select
            value={selectedClass}
            onChange={(event) => setSelectedClass(event.target.value)}
            className="w-full rounded-2xl border border-gray-300 px-4 py-3 text-sm outline-none focus:border-sky-500 lg:w-64"
          >
            <option value="All">All Classes</option>
            {classNames.map((className) => (
              <option key={className} value={className}>{className}</option>
            ))}
          </select>

          <div className="relative w-full lg:w-72">
            <FiSearch className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by name or student ID"
              className="w-full rounded-2xl border border-gray-300 py-3 pl-10 pr-4 text-sm outline-none focus:border-sky-500"
            />
          </div>

          <button
            type="button"
            onClick={loadData}
            className="flex items-center justify-center gap-2 rounded-2xl bg-gray-100 px-4 py-3 text-sm font-bold text-gray-700 hover:bg-gray-200"
          >
            <FiRefreshCw size={16} />
            Refresh
          </button>
        </div>

        <div className="rounded-3xl bg-white shadow-sm">
          <div className="border-b border-gray-200 px-6 py-4">
            <h2 className="text-lg font-bold text-gray-800">Student Fees</h2>
            <p className="text-sm text-gray-500">Arrears, {nextTermLabel.toLowerCase()} fees and total due per student.</p>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="px-6 py-4 font-semibold">Name</th>
                  <th className="px-6 py-4 font-semibold">Student ID</th>
                  <th className="px-6 py-4 font-semibold">Class</th>
                  <th className="px-6 py-4 font-semibold">Arrears</th>
                  <th className="px-6 py-4 font-semibold">{nextTermLabel} Fee</th>
                  <th className="px-6 py-4 font-semibold">Total</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-8 text-center text-gray-500">Loading...</td>
                  </tr>
                ) : billingRows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-8 text-center text-gray-500">No students found.</td>
                  </tr>
                ) : (
                  billingRows.map((row, index) => (
                    <tr key={row.student.id} className={index !== billingRows.length - 1 ? "border-b border-gray-100" : ""}>
                      <td className="px-6 py-4 font-medium text-gray-800">{getStudentName(row.student)}</td>
                      <td className="px-6 py-4 text-gray-600">{getStudentReportId(row.student)}</td>
                      <td className="px-6 py-4 text-gray-600">{cleanText(row.student.class_name)}</td>
                      <td className="px-6 py-4 text-gray-600">{formatMoney(row.fees.arrears)}</td>
                      <td className="px-6 py-4 text-gray-600">
                        {formatMoney(row.fees.nextTermFee)}
                        {row.fees.scholarshipNote && (
                          <span className="mt-1 block text-xs font-semibold text-emerald-600">{row.fees.scholarshipNote}</span>
                        )}
                      </td>
                      <td className="px-6 py-4 font-bold text-slate-900">{formatMoney(row.fees.total)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
