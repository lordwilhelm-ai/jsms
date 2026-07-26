"use client";

import type { FormEvent } from "react";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

type AnyRow = Record<string, any>;
type StudentRow = Record<string, any>;
type SettingsRow = Record<string, any>;
type ClassRow = Record<string, any>;
type FeeViewRow = Record<string, any>;

const PLAYROOM_CLASSES = ["Playroom 1", "Playroom 2"];
const KG_CLASSES = ["KG 1", "KG 2"];
const LOWER_PRIMARY_CLASSES = ["Class 1", "Class 2", "Class 3"];
const UPPER_PRIMARY_CLASSES = ["Class 4", "Class 5", "Class 6"];
const JHS_CLASSES = ["JHS 1", "JHS 2", "JHS 3"];

type PortalState = {
  loading: boolean;
  error: string;
  student: StudentRow | null;
  settings: SettingsRow | null;
  classes: ClassRow[];
  scores: AnyRow[];
  attendance: AnyRow | null;
  remarks: AnyRow | null;
  feeLiveRows: FeeViewRow[];
  feePayments: AnyRow[];
  feeStructures: AnyRow[];
  classTotal: number;
};

const initialState: PortalState = {
  loading: true,
  error: "",
  student: null,
  settings: null,
  classes: [],
  scores: [],
  attendance: null,
  remarks: null,
  feeLiveRows: [],
  feePayments: [],
  feeStructures: [],
  classTotal: 0,
};

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

function money(value: number) {
  return `GHS ${Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function isPlayroom(className: string) {
  return PLAYROOM_CLASSES.includes(className);
}

function isKG(className: string) {
  return KG_CLASSES.includes(className);
}

function isLowerPrimary(className: string) {
  return LOWER_PRIMARY_CLASSES.includes(className);
}

function isUpperPrimary(className: string) {
  return UPPER_PRIMARY_CLASSES.includes(className);
}

function isJHS(className: string) {
  return JHS_CLASSES.includes(className);
}

function usesGradeColumn(className: string) {
  return isUpperPrimary(className) || isJHS(className);
}

function getLevelTitle(className: string) {
  if (isPlayroom(className)) return "PRE-SCHOOL";
  if (isKG(className)) return "KINDERGARTEN";
  if (isLowerPrimary(className)) return "LOWER PRIMARY";
  if (isUpperPrimary(className)) return "UPPER PRIMARY";
  if (isJHS(className)) return "JHS";
  return "";
}

function getStudentName(student: StudentRow | null) {
  if (!student) return "";

  return (
    cleanText(student.full_name) ||
    `${student.first_name || ""} ${student.last_name || ""}`.trim() ||
    cleanText(student.student_name) ||
    cleanText(student.name)
  );
}

function getStudentReportId(student: StudentRow | null) {
  if (!student) return "";
  return cleanText(student.student_id || student.jvs_id || student.id);
}

function getClassName(student: StudentRow | null) {
  if (!student) return "";
  return cleanText(student.class_name || student.class || student.current_class);
}

function getStudentPhoto(student: StudentRow | null) {
  if (!student) return "";
  return cleanText(
    student.photo_url ||
      student.profile_photo_url ||
      student.image_url ||
      student.picture_url ||
      ""
  );
}

function getAcademicYear(settings: SettingsRow | null) {
  return cleanText(settings?.current_academic_year || settings?.academic_year);
}

function getCurrentTerm(settings: SettingsRow | null) {
  return cleanText(settings?.current_term || settings?.term);
}

function getNextTermLabel(currentTerm: string) {
  const term = cleanLower(currentTerm);

  if (term.includes("first")) return "Second Term";
  if (term.includes("second")) return "Third Term";
  if (term.includes("third")) return "First Term";

  return "Next Term";
}

function getPromotedClass(className: string, currentTerm: string) {
  const term = cleanLower(currentTerm);

  if (!term.includes("third")) return "";

  const order = [
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

  const index = order.indexOf(className);

  if (index === -1) return "";
  if (index >= order.length - 1) return "Completed";

  return order[index + 1];
}

function getReportPromotedClass(
  className: string,
  currentTerm: string,
  remarks: AnyRow | null
) {
  if (cleanLower(className) === "playroom 1") {
    return cleanText(
      remarks?.promoted_to ||
        remarks?.promotedTo ||
        remarks?.promotion_to ||
        remarks?.promoted_class ||
        remarks?.next_class ||
        ""
    );
  }

  return getPromotedClass(className, currentTerm);
}

function getStudentKeys(student: StudentRow | null) {
  if (!student) return [];

  return [
    cleanText(student.id),
    cleanText(student.student_id),
    cleanText(student.jvs_id),
    cleanText(student.student_uuid),
    cleanText(student.student_db_id),
    cleanText(student.full_name),
    cleanText(student.student_name),
    cleanText(student.name),
  ].filter(Boolean);
}

function rowBelongsToStudent(row: Record<string, any>, student: StudentRow | null) {
  if (!student) return false;

  const keys = new Set(getStudentKeys(student));

  return (
    keys.has(cleanText(row.student_id)) ||
    keys.has(cleanText(row.jvs_id)) ||
    keys.has(cleanText(row.student_uuid)) ||
    keys.has(cleanText(row.student_db_id)) ||
    keys.has(cleanText(row.id)) ||
    keys.has(cleanText(row.student_name)) ||
    keys.has(cleanText(row.full_name)) ||
    keys.has(cleanText(row.name))
  );
}

function isSameAcademicPeriod(row: Record<string, any>, settings: SettingsRow | null) {
  const rowYear = cleanText(row.academic_year || row.current_academic_year);
  const rowTerm = cleanText(row.term || row.current_term);

  const settingsYear = getAcademicYear(settings);
  const settingsTerm = getCurrentTerm(settings);

  const yearMatches = !rowYear || !settingsYear || rowYear === settingsYear;
  const termMatches = !rowTerm || !settingsTerm || rowTerm === settingsTerm;

  return yearMatches && termMatches;
}

function getScoreTotal(row: AnyRow) {
  return (
    safeNumber(row.final_total) ||
    safeNumber(row.final_score) ||
    safeNumber(row.total_score) ||
    safeNumber(row.total) ||
    safeNumber(row.score)
  );
}

function getSubjectName(row: AnyRow) {
  return cleanText(row.subject || row.subject_name || row.name);
}

function getScoreRemark(total: unknown) {
  if (total === null || total === undefined || total === "") return "";

  const value = Number(total);

  if (value >= 80) return "Excellent";
  if (value >= 75) return "Very Good";
  if (value >= 70) return "Good";
  if (value >= 65) return "Credit";
  if (value >= 60) return "Very Satisfactory";
  if (value >= 55) return "Satisfactory";
  if (value >= 45) return "Needs Improvement";
  if (value >= 40) return "Weak";
  return "Poor";
}

function getGrade(row: AnyRow) {
  return cleanText(row.grade || row.letter_grade || row.final_grade);
}

function getPlayroomLetter(row: AnyRow) {
  return cleanText(row.letter_grade || row.grade || row.score || row.final_grade).toUpperCase();
}

function normalizeSubjectName(subjectName: unknown) {
  return cleanLower(subjectName);
}

function getSubjectPriority(subjectName: string, className: string) {
  const key = normalizeSubjectName(subjectName);

  if (isPlayroom(className)) {
    const order = [
      "language and literacy",
      "literacy",
      "numeracy",
      "creative activities",
      "environmental studies",
      "religious and moral education",
      "physical development",
      "writing",
      "phonics",
    ];

    const index = order.indexOf(key);
    return index === -1 ? 999 : index;
  }

  const order = [
    "english language",
    "english",
    "mathematics",
    "maths",
    "science",
    "integrated science",
    "social studies",
    "our world our people",
    "rme",
    "religious and moral education",
    "computing",
    "ict",
    "creative arts",
    "creative arts and design",
    "ghanaian language",
    "fanti",
    "history",
    "physical education",
    "career technology",
    "french",
  ];

  const index = order.indexOf(key);
  return index === -1 ? 999 : index;
}

function orderScores(rows: AnyRow[], className: string) {
  return [...rows].sort((a, b) => {
    const priority = getSubjectPriority(getSubjectName(a), className) - getSubjectPriority(getSubjectName(b), className);
    if (priority !== 0) return priority;

    return getSubjectName(a).localeCompare(getSubjectName(b));
  });
}

function getClassBaseFee(student: StudentRow, classRows: ClassRow[]) {
  const classRow = classRows.find(
    (row) => cleanText(row.class_name || row.name) === cleanText(student.class_name)
  );

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

function applyScholarship(student: StudentRow, baseFee: number) {
  const type = cleanLower(student.scholarship_type);
  const scholarshipAmount = safeNumber(student.scholarship_amount);

  if (!type || type === "none" || type === "regular") {
    return { payable: baseFee, note: "" };
  }

  if (type === "full") {
    return { payable: 0, note: "Full Scholarship" };
  }

  if (type === "half") {
    return { payable: baseFee / 2, note: "Half Scholarship" };
  }

  if (type === "custom") {
    return {
      payable: Math.max(0, scholarshipAmount),
      note: `Scholarship Payable: ${money(scholarshipAmount)}`,
    };
  }

  return { payable: baseFee, note: "" };
}

function getTotalPaidFromFeePayments(
  student: StudentRow,
  settings: SettingsRow | null,
  feePaymentRows: Record<string, any>[]
) {
  return feePaymentRows
    .filter((row) => rowBelongsToStudent(row, student))
    .filter((row) => isSameAcademicPeriod(row, settings))
    .reduce((sum, row) => sum + getPaidAmount(row), 0);
}

function getFeeFromFeeStructure(
  student: StudentRow,
  settings: SettingsRow | null,
  feeStructureRows: Record<string, any>[],
  classRows: ClassRow[]
) {
  const nextTermLabel = getNextTermLabel(getCurrentTerm(settings));

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

function computeFees(
  student: StudentRow,
  settings: SettingsRow | null,
  feeLiveRows: FeeViewRow[],
  feePaymentRows: Record<string, any>[],
  feeStructureRows: Record<string, any>[],
  classRows: ClassRow[]
) {
  const currentTerm = getCurrentTerm(settings);
  const nextTermLabel = getNextTermLabel(currentTerm);

  const feeLive = feeLiveRows.find((row) => rowBelongsToStudent(row, student));

  // fee_structure only ever holds rows for the upcoming term (see
  // getFeeFromFeeStructure, used below for nextTermFee) — the fee actually
  // owed for the term the student is currently in comes from the class's
  // own rate, same source the admin's record-payment page charges against.
  const currentTermBaseFee = getClassBaseFee(student, classRows);
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
    currentTermFee: expectedCurrentTermFee,
    amountPaid: totalPaid,
    arrears,
    nextTermFee,
    total,
    nextTermLabel,
    scholarshipNote:
      cleanText(feeLive?.scholarship_note) ||
      nextTermScholarship.note ||
      currentTermScholarship.note,
  };
}

function getPaymentDate(row: AnyRow) {
  return row.payment_date || row.paid_at || row.created_at || row.date;
}

function getReceipt(row: AnyRow) {
  return cleanText(row.receipt_number || row.receipt_no || row.receipt || row.reference || row.payment_reference);
}

function getPaidAmount(row: AnyRow) {
  return (
    safeNumber(row.amount_paid) ||
    safeNumber(row.amount) ||
    safeNumber(row.paid_amount) ||
    safeNumber(row.payment_amount)
  );
}

function simpleDate(value: unknown) {
  const raw = cleanText(value);
  if (!raw) return "";

  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;

  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function ParentPortalContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const studentQuery = cleanText(searchParams.get("student"));
  const classQuery = cleanText(searchParams.get("class"));
  const [state, setState] = useState<PortalState>(initialState);

  useEffect(() => {
    let active = true;

    async function loadPortal() {
      if (!studentQuery || !classQuery) {
        setState({
          ...initialState,
          loading: false,
          error: "",
        });
        return;
      }

      setState((prev) => ({ ...prev, loading: true, error: "" }));

      try {
        // Report-card tables (and, as of this fix, the fee/fee-structure
        // lookup too) have no login-based access control — this whole
        // portal works by knowing the student's ID + class. The server
        // resolves and scopes EVERYTHING to that one student; the browser
        // never bulk-fetches the students/fee_payments/fee_structure/classes
        // tables directly (that used to leak every other family's fee and
        // student data into this public page's network response).
        const reportParams = new URLSearchParams({ student: studentQuery, class: classQuery });
        const reportRes = await fetch(`/api/report-card/parent-data?${reportParams.toString()}`);
        const reportData = await reportRes.json();

        if (!active) return;

        if (!reportRes.ok || !reportData.student) {
          setState({
            ...initialState,
            loading: false,
            error: reportData.error || "Could not load parent portal.",
          });
          return;
        }

        const student: StudentRow = reportData.student;
        const scores: AnyRow[] = reportData.scores || [];
        const attendanceRows: AnyRow[] = reportData.attendance || [];
        const remarksRows: AnyRow[] = reportData.cards || [];
        const feeLiveRows: FeeViewRow[] = reportData.feeLiveRows || [];
        const feePayments: AnyRow[] = reportData.feePayments || [];
        const feeStructures: AnyRow[] = reportData.feeStructures || [];
        const classes: ClassRow[] = reportData.classes || [];
        const classTotal: number = reportData.classTotal || 0;
        const settings: SettingsRow | null = reportData.settings || null;

        const currentYear = getAcademicYear(settings);
        const currentTerm = getCurrentTerm(settings);

        const studentScoresAll = scores.filter((row) => rowBelongsToStudent(row, student));
        const studentScoresPeriod = studentScoresAll.filter((row) => {
          const rowYear = cleanText(row.academic_year || row.current_academic_year);
          const rowTerm = cleanText(row.term || row.current_term);

          const yearOk = !rowYear || !currentYear || rowYear === currentYear;
          const termOk = !rowTerm || !currentTerm || rowTerm === currentTerm;

          return yearOk && termOk;
        });

        const studentAttendanceAll = attendanceRows.filter((row) => rowBelongsToStudent(row, student));
        const studentAttendance =
          studentAttendanceAll.find((row) => isSameAcademicPeriod(row, settings)) ||
          studentAttendanceAll[0] ||
          null;

        const studentRemarksAll = remarksRows.filter((row) => rowBelongsToStudent(row, student));
        const studentRemarks =
          studentRemarksAll.find((row) => isSameAcademicPeriod(row, settings)) ||
          studentRemarksAll[0] ||
          null;

        const className = getClassName(student);

        setState({
          loading: false,
          error: "",
          student,
          settings,
          classes,
          scores: orderScores(studentScoresPeriod.length > 0 ? studentScoresPeriod : studentScoresAll, className),
          attendance: studentAttendance,
          remarks: studentRemarks,
          feeLiveRows,
          feePayments,
          feeStructures,
          classTotal,
        });
      } catch (error: any) {
        if (!active) return;

        setState({
          ...initialState,
          loading: false,
          error: error?.message || "Could not load parent portal.",
        });
      }
    }

    void loadPortal();

    return () => {
      active = false;
    };
  }, [studentQuery, classQuery]);

  const fees = useMemo(() => {
    if (!state.student) {
      return {
        currentTermFee: 0,
        amountPaid: 0,
        arrears: 0,
        nextTermFee: 0,
        total: 0,
        nextTermLabel: "Next Term",
        scholarshipNote: "",
      };
    }

    return computeFees(
      state.student,
      state.settings,
      state.feeLiveRows,
      state.feePayments,
      state.feeStructures,
      state.classes
    );
  }, [
    state.student,
    state.settings,
    state.feeLiveRows,
    state.feePayments,
    state.feeStructures,
    state.classes,
  ]);

  const currentTerm = getCurrentTerm(state.settings);
  const academicYear = getAcademicYear(state.settings);

  if (!studentQuery || !classQuery) {
    return <ParentLookupForm />;
  }

  if (state.loading) {
    return (
      <main className="min-h-screen bg-[#f7f3df] px-4 py-8">
        <div className="mx-auto max-w-3xl rounded-3xl bg-white p-6 text-center shadow-sm">
          <p className="text-sm font-black text-slate-600">Loading parent portal...</p>
        </div>
      </main>
    );
  }

  if (state.error) {
    return <ParentLookupForm error={state.error} initialStudentId={studentQuery} initialClassName={classQuery} />;
  }

  const student = state.student!;
  const className = getClassName(student);
  const studentId = getStudentReportId(student);
  const studentName = getStudentName(student);
  const promotedTo = getReportPromotedClass(className, currentTerm, state.remarks);
  const photoUrl = getStudentPhoto(student);

  return (
    <main className="min-h-screen bg-[#f7f3df] px-3 py-4">
      <section className="mx-auto max-w-5xl space-y-4">
        <ReportCardPanel
          studentName={studentName}
          studentId={studentId}
          className={className}
          classTotal={state.classTotal}
          academicYear={academicYear}
          currentTerm={currentTerm}
          levelTitle={getLevelTitle(className)}
          photoUrl={photoUrl}
          scores={state.scores}
          attendance={state.attendance}
          remarks={state.remarks}
          promotedTo={promotedTo}
          fees={fees}
        />

        <FeesPanel fees={fees} student={student} settings={state.settings} feePayments={state.feePayments} />

        <footer className="rounded-3xl bg-white p-4 text-center text-xs font-bold text-slate-500 shadow-sm">
          This page opens from the QR code on the printed report card.
        </footer>
      </section>
    </main>
  );
}

function ReportCardPanel({
  studentName,
  studentId,
  className,
  classTotal,
  academicYear,
  currentTerm,
  levelTitle,
  photoUrl,
  scores,
  attendance,
  remarks,
  promotedTo,
  fees,
}: {
  studentName: string;
  studentId: string;
  className: string;
  classTotal: number;
  academicYear: string;
  currentTerm: string;
  levelTitle: string;
  photoUrl: string;
  scores: AnyRow[];
  attendance: AnyRow | null;
  remarks: AnyRow | null;
  promotedTo: string;
  fees: ReturnType<typeof computeFees>;
}) {
  const playroom = isPlayroom(className);
  const gradeOnly = playroom || isKG(className);
  const totalScore = scores.reduce((sum, row) => sum + getScoreTotal(row), 0);
  const average = scores.length > 0 ? totalScore / scores.length : 0;

  return (
    <section className="overflow-hidden rounded-[2rem] border border-yellow-200 bg-white shadow-sm">
      <div className="bg-slate-950 p-5 text-center text-white">
        <p className="text-xs font-black uppercase tracking-[0.35em] text-yellow-100">Jefsem Vision School</p>
        <h1 className="mt-2 text-xl font-black">Terminal Report</h1>
        <p className="mt-1 text-xs font-black uppercase tracking-[0.22em] text-white/60">{levelTitle}</p>
      </div>

      <div className="grid grid-cols-[1fr_auto] items-start gap-4 border-b border-yellow-100 p-5">
        <div className="grid gap-2 text-sm font-bold text-slate-700 sm:grid-cols-2">
          <InfoLine label="Name" value={studentName} />
          <InfoLine label="Class" value={className} />
          <InfoLine label="Student ID" value={studentId} />
          <InfoLine label="Term" value={currentTerm || "—"} />
          <InfoLine label="Academic Year" value={academicYear || "—"} />
          <InfoLine label="No. on Roll" value={classTotal ? String(classTotal) : "—"} />
        </div>

        {photoUrl ? (
          <img
            src={photoUrl}
            alt={studentName}
            className="h-16 w-16 shrink-0 rounded-2xl border border-yellow-200 object-cover md:h-28 md:w-28 md:rounded-3xl"
          />
        ) : null}
      </div>

      <div className="p-5">
        {gradeOnly ? (
          <GradeTable rows={scores} />
        ) : (
          <ScoreTable rows={scores} className={className} />
        )}

        <div className="mt-5 grid gap-3 md:grid-cols-3">
          <MiniTotal
            label="Attendance"
            value={
              attendance
                ? `${cleanText(attendance.days_present || attendance.present || attendance.attendance_present || "—")}`
                : "—"
            }
          />
          <MiniTotal label="Average" value={average ? average.toFixed(2) : "—"} />
          <MiniTotal label="Promoted To" value={promotedTo || "—"} />
        </div>

        {!playroom ? (
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <CommentBox title="Conduct" value={cleanText(remarks?.conduct || remarks?.student_conduct)} />
            <CommentBox title="Interest" value={cleanText(remarks?.interest || remarks?.student_interest)} />
            <CommentBox title="Teacher Remark" value={cleanText(remarks?.teacher_remark || remarks?.remarks || remarks?.comment)} />
          </div>
        ) : null}

        <div className="mt-4 rounded-3xl border border-yellow-200 bg-yellow-50 p-4">
          <p className="text-xs font-black uppercase tracking-wide text-yellow-800">
            Fees For Next Term ({fees.nextTermLabel})
          </p>

          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <FeeBox label="Arrears" value={money(fees.arrears)} danger={fees.arrears > 0} />
            <FeeBox label="Fees For Next Term" value={money(fees.nextTermFee)} />
            <FeeBox label="Total Payable" value={money(fees.total)} danger={fees.total > 0} />
          </div>

          {fees.scholarshipNote ? (
            <p className="mt-2 text-xs font-bold text-yellow-800">{fees.scholarshipNote}</p>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function FeesPanel({
  fees,
  student,
  settings,
  feePayments,
}: {
  fees: ReturnType<typeof computeFees>;
  student: StudentRow;
  settings: SettingsRow | null;
  feePayments: AnyRow[];
}) {
  const currentRows = feePayments
    .filter((row) => rowBelongsToStudent(row, student))
    .filter((row) => isSameAcademicPeriod(row, settings))
    .sort((a, b) => {
      const aTime = new Date(cleanText(getPaymentDate(a))).getTime();
      const bTime = new Date(cleanText(getPaymentDate(b))).getTime();
      return (Number.isNaN(bTime) ? 0 : bTime) - (Number.isNaN(aTime) ? 0 : aTime);
    });

  const status = fees.arrears <= 0 ? "Paid" : fees.amountPaid > 0 ? "Part Payment" : "Owing";

  return (
    <section className="rounded-[2rem] border border-yellow-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-wide text-yellow-700">Fees Account</p>
          <h2 className="mt-1 text-xl font-black text-slate-950">Payment Summary</h2>
        </div>

        <span
          className={
            status === "Paid"
              ? "rounded-full border border-emerald-200 bg-emerald-100 px-3 py-1 text-xs font-black text-emerald-700"
              : status === "Part Payment"
                ? "rounded-full border border-yellow-200 bg-yellow-100 px-3 py-1 text-xs font-black text-yellow-800"
                : "rounded-full border border-red-200 bg-red-100 px-3 py-1 text-xs font-black text-red-700"
          }
        >
          {status}
        </span>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-4">
        <MiniTotal label="Current Term Fee" value={money(fees.currentTermFee)} />
        <MiniTotal label="Amount Paid" value={money(fees.amountPaid)} />
        <MiniTotal label="Arrears" value={money(fees.arrears)} danger={fees.arrears > 0} />
        <MiniTotal label="Next Term Total" value={money(fees.total)} danger={fees.total > 0} />
      </div>

      <div className="mt-4 space-y-2">
        {currentRows.length === 0 ? (
          <div className="rounded-2xl bg-slate-50 p-3 text-sm font-bold text-slate-400">
            No fee payment recorded for this term.
          </div>
        ) : (
          currentRows.slice(0, 4).map((row, index) => (
            <div
              key={cleanText(row.id) || `${getReceipt(row)}-${index}`}
              className="rounded-2xl border border-slate-100 bg-slate-50 p-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-black text-slate-950">
                    {getReceipt(row) || "Fee Payment"}
                  </p>
                  <p className="mt-1 text-xs font-bold text-slate-400">
                    {simpleDate(getPaymentDate(row))}
                  </p>
                </div>

                <p className="shrink-0 text-sm font-black text-emerald-700">
                  {money(getPaidAmount(row))}
                </p>
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

function GradeTable({ rows }: { rows: AnyRow[] }) {
  return (
    <div className="overflow-x-auto rounded-3xl border border-slate-200">
      <table className="w-full min-w-[560px] text-left text-sm">
        <thead className="bg-slate-950 text-white">
          <tr>
            <th className="px-3 py-3 font-black">Subject</th>
            <th className="px-3 py-3 text-center font-black">A</th>
            <th className="px-3 py-3 text-center font-black">B</th>
            <th className="px-3 py-3 text-center font-black">C</th>
            <th className="px-3 py-3 text-center font-black">D</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={5} className="px-3 py-5 text-center font-bold text-slate-400">
                No subject grades saved yet.
              </td>
            </tr>
          ) : (
            rows.map((row, index) => {
              const letter = getPlayroomLetter(row);

              return (
                <tr key={cleanText(row.id) || `${getSubjectName(row)}-${index}`} className="border-t border-slate-100">
                  <td className="px-3 py-3 font-black text-slate-900">{getSubjectName(row) || "Subject"}</td>
                  {["A", "B", "C", "D"].map((grade) => (
                    <td key={grade} className="px-3 py-3 text-center font-black text-slate-700">
                      {letter === grade ? "✓" : ""}
                    </td>
                  ))}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}

function ScoreTable({ rows, className }: { rows: AnyRow[]; className: string }) {
  return (
    <div className="overflow-x-auto rounded-3xl border border-slate-200">
      <table className="w-full min-w-[560px] text-left text-sm">
        <thead className="bg-slate-950 text-white">
          <tr>
            <th className="px-3 py-3 font-black">Subject</th>
            <th className="px-3 py-3 font-black">Class Work</th>
            <th className="px-3 py-3 font-black">Exam</th>
            <th className="px-3 py-3 font-black">Total</th>
            {usesGradeColumn(className) ? <th className="px-3 py-3 font-black">Grade</th> : null}
            <th className="px-3 py-3 font-black">Remark</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={usesGradeColumn(className) ? 6 : 5} className="px-3 py-5 text-center font-bold text-slate-400">
                No subject scores saved yet.
              </td>
            </tr>
          ) : (
            rows.map((row, index) => {
              const total = getScoreTotal(row);

              return (
                <tr key={cleanText(row.id) || `${getSubjectName(row)}-${index}`} className="border-t border-slate-100">
                  <td className="px-3 py-3 font-black text-slate-900">{getSubjectName(row) || "Subject"}</td>
                  <td className="px-3 py-3 font-bold text-slate-700">{safeNumber(row.class_work || row.class_score || row.classwork) || "—"}</td>
                  <td className="px-3 py-3 font-bold text-slate-700">{safeNumber(row.exam || row.exam_score) || "—"}</td>
                  <td className="px-3 py-3 font-bold text-slate-700">{total || "—"}</td>
                  {usesGradeColumn(className) ? <td className="px-3 py-3 font-bold text-slate-700">{getGrade(row) || "—"}</td> : null}
                  <td className="px-3 py-3 font-bold text-slate-500">{cleanText(row.remark || row.remarks) || getScoreRemark(total) || "—"}</td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <p>
      <span className="font-black text-slate-950">{label}:</span> {value || "—"}
    </p>
  );
}

function MiniTotal({
  label,
  value,
  danger = false,
}: {
  label: string;
  value: string;
  danger?: boolean;
}) {
  return (
    <div className={`rounded-3xl p-4 ${danger ? "bg-red-50" : "bg-slate-50"}`}>
      <p className="text-xs font-black uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 text-lg font-black ${danger ? "text-red-700" : "text-slate-950"}`}>
        {value}
      </p>
    </div>
  );
}

function FeeBox({
  label,
  value,
  danger = false,
}: {
  label: string;
  value: string;
  danger?: boolean;
}) {
  return (
    <div className={`rounded-2xl bg-white p-3 ${danger ? "text-red-700" : "text-slate-950"}`}>
      <p className="text-[11px] font-black uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-base font-black">{value}</p>
    </div>
  );
}

function CommentBox({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-3xl bg-slate-50 p-4">
      <p className="text-xs font-black uppercase tracking-wide text-slate-500">{title}</p>
      <p className="mt-1 text-sm font-bold text-slate-800">{value || "—"}</p>
    </div>
  );
}

export default function ParentPortalPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-[#f7f3df] px-4 py-8">
          <div className="mx-auto max-w-3xl rounded-3xl bg-white p-6 text-center shadow-sm">
            <p className="text-sm font-black text-slate-600">Loading parent portal...</p>
          </div>
        </main>
      }
    >
      <ParentPortalContent />
    </Suspense>
  );
}

function ParentLookupForm({
  error = "",
  initialStudentId = "",
  initialClassName = "",
}: {
  error?: string;
  initialStudentId?: string;
  initialClassName?: string;
}) {
  const router = useRouter();
  const [studentId, setStudentId] = useState(initialStudentId);
  const [className, setClassName] = useState(initialClassName);
  const [classes, setClasses] = useState<string[]>([]);

  useEffect(() => {
    let active = true;

    async function loadClasses() {
      const { data } = await supabase
        .from("classes")
        .select("class_name,name,class_order")
        .order("class_order", { ascending: true });

      if (!active) return;

      const list = (data || [])
        .map((row: AnyRow) => cleanText(row.class_name || row.name))
        .filter(Boolean);

      setClasses([...new Set(list)]);
    }

    void loadClasses();

    return () => {
      active = false;
    };
  }, []);

  function submitLookup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const id = cleanText(studentId).toUpperCase();
    const cls = cleanText(className);

    if (!id || !cls) return;

    const query = new URLSearchParams({
      student: id,
      class: cls,
    });

    router.push(`/parent?${query.toString()}`);
  }

  return (
    <main className="min-h-screen bg-[#f7f3df] px-4 py-8">
      <section className="mx-auto max-w-md rounded-[2rem] border border-yellow-200 bg-white p-6 shadow-xl">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-yellow-100 text-2xl">
          🎓
        </div>

        <h1 className="text-center text-2xl font-black text-slate-950">
          Parent Portal
        </h1>
        <p className="mt-2 text-center text-sm font-bold text-slate-500">
          Enter your child&apos;s Student ID and class to open the report and fees page.
        </p>

        {error ? (
          <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-3 text-center text-sm font-black text-red-700">
            {error}
          </div>
        ) : null}

        <form onSubmit={submitLookup} className="mt-5 space-y-3">
          <div>
            <label className="text-xs font-black uppercase tracking-wide text-slate-500">
              Student ID
            </label>
            <input
              value={studentId}
              onChange={(event) => setStudentId(event.target.value.toUpperCase())}
              placeholder="Example: JVS97050"
              className="mt-1 h-12 w-full rounded-2xl border border-yellow-200 bg-[#fffdf6] px-4 text-sm font-black text-slate-950 outline-none focus:border-yellow-500"
            />
          </div>

          <div>
            <label className="text-xs font-black uppercase tracking-wide text-slate-500">
              Class
            </label>
            <select
              value={className}
              onChange={(event) => setClassName(event.target.value)}
              className="mt-1 h-12 w-full rounded-2xl border border-yellow-200 bg-[#fffdf6] px-4 text-sm font-black text-slate-950 outline-none focus:border-yellow-500"
            >
              <option value="">Select class</option>
              {classes.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>

          <button
            type="submit"
            disabled={!cleanText(studentId) || !cleanText(className)}
            className="h-12 w-full rounded-2xl bg-slate-950 text-sm font-black text-white shadow-sm transition active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            Open Portal
          </button>
        </form>
      </section>
    </main>
  );
}


