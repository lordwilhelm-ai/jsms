"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { FiEye, FiPrinter, FiRefreshCw } from "react-icons/fi";
import { supabase } from "@/lib/supabase";
import { authedFetch } from "@/lib/apiClient";

const CLASS_OPTIONS = [
  "All",
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

const PLAYROOM_CLASSES = ["Playroom 1", "Playroom 2"];
const KG_CLASSES = ["KG 1", "KG 2"];
const LOWER_PRIMARY_CLASSES = ["Class 1", "Class 2", "Class 3"];
const UPPER_PRIMARY_CLASSES = ["Class 4", "Class 5", "Class 6"];
const JHS_CLASSES = ["JHS 1", "JHS 2", "JHS 3"];

type StudentRow = Record<string, any>;
type SettingsRow = Record<string, any>;
type ScoreRow = Record<string, any>;
type AttendanceRow = Record<string, any>;
type RemarkRow = Record<string, any>;
type ClassRow = Record<string, any>;
type FeeViewRow = Record<string, any>;

type ReportData = {
  student: {
    id: string;
    fullName: string;
    firstName: string;
    lastName: string;
    studentId: string;
    className: string;
    photoUrl: string;
    classTotal: number;
    scholarshipType: string;
    scholarshipAmount: number;
    isNewStudent: boolean;
  };
  settings: SettingsRow;
  scores: ScoreRow[];
  attendance: AttendanceRow | null;
  remarks: RemarkRow | null;
  headteacherSignatureUrl: string;
  totalSchoolDays: number;
  fees: {
    arrears: number;
    nextTermFee: number;
    total: number;
    nextTermLabel: string;
    scholarshipNote: string;
  };
};

function cleanText(value: unknown) {
  return String(value || "").trim();
}

function cleanLower(value: unknown) {
  return cleanText(value).toLowerCase();
}

function money(value: number) {
  if (!value) return "";
  return `GHS ${Number(value).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function safeNumber(value: unknown) {
  const numberValue = Number(value || 0);
  return Number.isNaN(numberValue) ? 0 : numberValue;
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

function getStudentPhoto(student: StudentRow) {
  return cleanText(
    student.photo_url ||
      student.profile_photo_url ||
      student.image_url ||
      student.picture_url ||
      ""
  );
}

function isActiveStudent(student: StudentRow) {
  const status = cleanLower(student.status);

  if (student.left_school === true) return false;
  if (student.is_active === false) return false;
  if (student.active === false) return false;
  if (status === "inactive" || status === "left" || status === "withdrawn") {
    return false;
  }

  return true;
}

function getAcademicYear(settings: SettingsRow | null) {
  return cleanText(settings?.current_academic_year || settings?.academic_year);
}

function getSchoolLogo(settings: SettingsRow | null) {
  return cleanText(settings?.school_logo_url || settings?.logo_url);
}

function getSchoolMotto(settings: SettingsRow | null) {
  return cleanText(settings?.school_motto || settings?.motto);
}

function getSchoolAddress(settings: SettingsRow | null) {
  return cleanText(settings?.school_address || settings?.address);
}

function getSchoolPhone(settings: SettingsRow | null) {
  return cleanText(settings?.school_phone || settings?.phone);
}

function getClosingDate(settings: SettingsRow | null) {
  return cleanText(settings?.closing_date || settings?.term_ends);
}

function getReopeningDate(settings: SettingsRow | null) {
  return cleanText(settings?.reopening_date || "");
}

function getOrdinal(day: number) {
  if (day > 3 && day < 21) return `${day}th`;

  switch (day % 10) {
    case 1:
      return `${day}st`;
    case 2:
      return `${day}nd`;
    case 3:
      return `${day}rd`;
    default:
      return `${day}th`;
  }
}

function formatDate(value: unknown) {
  if (!value) return "";

  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value);

  const weekday = date.toLocaleDateString("en-GB", { weekday: "long" });
  const month = date.toLocaleDateString("en-GB", { month: "long" });
  const year = date.getFullYear();
  const day = getOrdinal(date.getDate());

  return `${weekday}, ${day} ${month}, ${year}`;
}

function getNextTermLabel(currentTerm: string) {
  const term = cleanLower(currentTerm);

  if (term.includes("first")) return "Second Term";
  if (term.includes("second")) return "Third Term";
  if (term.includes("third")) return "First Term";

  return "Next Term";
}

function getParentPortalUrl(studentId?: string, className?: string) {
  const baseUrl = "https://jefsemvision.cc/parent";
  const cleanStudentId = cleanText(studentId);
  const cleanClassName = cleanText(className);

  if (!cleanStudentId || !cleanClassName) return baseUrl;

  return `${baseUrl}?student=${encodeURIComponent(cleanStudentId)}&class=${encodeURIComponent(cleanClassName)}`;
}

function getQrCodeUrl(url: string) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=92x92&margin=1&data=${encodeURIComponent(url)}`;
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
  remarks: RemarkRow | null
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

function getHeadteacherSignatureUrl(teachers: any[]) {
  const headteacher =
    teachers.find((teacher) => {
      const role = cleanLower(teacher.role);
      return (
        role.includes("headmaster") ||
        role.includes("head teacher") ||
        role.includes("headteacher") ||
        role.includes("head")
      );
    }) || null;

  if (!headteacher) return "";

  return cleanText(
    headteacher.signature_url ||
      headteacher.teacher_signature_url ||
      headteacher.headmaster_signature_url ||
      headteacher.signature ||
      ""
  );
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

function getHeadmasterRemark(average: unknown) {
  if (average === "" || average === null || average === undefined) return "";

  const value = Number(average);

  if (value >= 80) return "Excellent performance. Keep it up.";
  if (value >= 70) return "Very good work. Keep improving.";
  if (value >= 60) return "Good effort. Keep improving.";
  if (value >= 50) return "Satisfactory progress. Keep working hard.";
  return "More effort is encouraged for better progress.";
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

function getAggregate(rows: any[], className: string) {
  if (!isUpperPrimary(className) && !isJHS(className)) return "";

  const normalRows = rows
    .filter((row) => row.grade !== "" && row.grade !== null && row.grade !== undefined)
    .map((row) => ({
      ...row,
      gradeNumber: Number(row.grade),
      key: normalizeSubjectName(row.subject),
    }))
    .filter((row) => !Number.isNaN(row.gradeNumber));

  const english = normalRows.find(
    (row) => row.key === "english" || row.key === "english language"
  );
  const maths = normalRows.find(
    (row) => row.key === "mathematics" || row.key === "maths"
  );
  const science = normalRows.find(
    (row) => row.key === "science" || row.key === "integrated science"
  );

  if (!english || !maths || !science) return "";

  const core = new Set([english.subject, maths.subject, science.subject]);

  const others = normalRows
    .filter((row) => !core.has(row.subject))
    .sort((a, b) => a.gradeNumber - b.gradeNumber)
    .slice(0, 3);

  const picked = [english, maths, science, ...others];

  if (picked.length < 6) return "";

  return picked.reduce((sum, row) => sum + row.gradeNumber, 0);
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

function getLatestPaymentRow(
  student: StudentRow,
  settings: SettingsRow | null,
  feePaymentRows: Record<string, any>[]
) {
  const rows = feePaymentRows
    .filter((row) => rowBelongsToStudent(row, student))
    .filter((row) => isSameAcademicPeriod(row, settings))
    .sort((a, b) => {
      const dateA = new Date(
        cleanText(a.payment_date || a.created_at || a.updated_at || a.date)
      ).getTime();
      const dateB = new Date(
        cleanText(b.payment_date || b.created_at || b.updated_at || b.date)
      ).getTime();

      return (Number.isNaN(dateB) ? 0 : dateB) - (Number.isNaN(dateA) ? 0 : dateA);
    });

  return rows[0] || null;
}

function getTotalPaidFromFeePayments(
  student: StudentRow,
  settings: SettingsRow | null,
  feePaymentRows: Record<string, any>[]
) {
  return feePaymentRows
    .filter((row) => rowBelongsToStudent(row, student))
    .filter((row) => isSameAcademicPeriod(row, settings))
    .reduce((sum, row) => {
      return (
        sum +
        safeNumber(row.amount) +
        safeNumber(row.amount_paid) +
        safeNumber(row.paid_amount) +
        safeNumber(row.payment_amount)
      );
    }, 0);
}

function getArrearsFromFeePayments(
  student: StudentRow,
  settings: SettingsRow | null,
  feePaymentRows: Record<string, any>[]
) {
  const latest = getLatestPaymentRow(student, settings, feePaymentRows);

  if (!latest) return 0;

  const directBalance =
    safeNumber(latest.balance_after_payment) ||
    safeNumber(latest.balance_after) ||
    safeNumber(latest.remaining_balance) ||
    safeNumber(latest.balance) ||
    safeNumber(latest.fee_balance) ||
    safeNumber(latest.outstanding_balance) ||
    safeNumber(latest.outstanding_fees) ||
    safeNumber(latest.arrears) ||
    safeNumber(latest.amount_due);

  if (directBalance > 0) return directBalance;

  const totalDue =
    safeNumber(latest.total_fee) ||
    safeNumber(latest.fee_total) ||
    safeNumber(latest.amount_due) ||
    safeNumber(latest.expected_amount);

  const totalPaid =
    safeNumber(latest.total_paid) ||
    safeNumber(latest.paid_amount) ||
    safeNumber(latest.amount_paid) ||
    safeNumber(latest.amount);

  if (totalDue > 0) return Math.max(0, totalDue - totalPaid);

  return 0;
}

function getFeeFromFeeStructure(
  student: StudentRow,
  settings: SettingsRow | null,
  feeStructureRows: Record<string, any>[],
  classRows: ClassRow[]
) {
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

function toDateOnly(value: unknown) {
  if (!value) return "";

  const raw = String(value).trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return "";

  return date.toISOString().slice(0, 10);
}

function getTermStartDate(settings: SettingsRow | null) {
  return toDateOnly(
    settings?.term_begins ||
      settings?.term_start_date ||
      settings?.current_term_start_date ||
      settings?.start_date ||
      settings?.opening_date
  );
}

function getTermEndDate(settings: SettingsRow | null) {
  return toDateOnly(
    settings?.term_ends ||
      settings?.term_end_date ||
      settings?.current_term_end_date ||
      settings?.end_date ||
      settings?.closing_date
  );
}

function isWeekendDate(dateText: string) {
  const date = new Date(`${dateText}T00:00:00`);
  const day = date.getDay();

  return day === 0 || day === 6;
}

function eachDateInclusive(startDate: string, endDate: string) {
  const dates: string[] = [];

  if (!startDate || !endDate) return dates;

  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return dates;
  if (start > end) return dates;

  const cursor = new Date(start);

  while (cursor <= end) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setDate(cursor.getDate() + 1);
  }

  return dates;
}

function calculateSchoolDaysFromSettings(settings: SettingsRow | null, holidayRows: Record<string, any>[]) {
  const startDate = getTermStartDate(settings);
  const endDate = getTermEndDate(settings);

  if (!startDate || !endDate) return 0;

  const holidaySet = new Set<string>();

  holidayRows.forEach((row) => {
    const singleDate = toDateOnly(row.date || row.holiday_date);
    const rangeStart = toDateOnly(row.start_date);
    const rangeEnd = toDateOnly(row.end_date);

    if (singleDate) holidaySet.add(singleDate);

    if (rangeStart && rangeEnd) {
      eachDateInclusive(rangeStart, rangeEnd).forEach((date) => holidaySet.add(date));
    }
  });

  return eachDateInclusive(startDate, endDate).filter((date) => {
    if (isWeekendDate(date)) return false;
    if (holidaySet.has(date)) return false;

    return true;
  }).length;
}

function getClassBaseFee(student: StudentRow, classRows: ClassRow[]) {
  const classRow = classRows.find(
    (row) => cleanText(row.class_name || row.name) === cleanText(student.class_name)
  );

  if (!classRow) return 0;

  // Report card "Fees For Next Term" must always use continuing/returning fees.
  // New-student admission bill is only for the admission term, not the next term.
  const returningFee =
    safeNumber(classRow.fee_returning) ||
    safeNumber(classRow.returning_fee) ||
    safeNumber(classRow.continuing_fee) ||
    safeNumber(classRow.fee_continuing) ||
    safeNumber(classRow.amount) ||
    safeNumber(classRow.fee_amount);

  return returningFee;
}

function applyScholarship(student: StudentRow, baseFee: number) {
  const type = cleanLower(student.scholarship_type);
  const scholarshipAmount = safeNumber(student.scholarship_amount);

  if (!type || type === "none" || type === "regular") {
    return {
      payable: baseFee,
      note: "",
    };
  }

  if (type === "full") {
    return {
      payable: 0,
      note: "Full Scholarship",
    };
  }

  if (type === "half") {
    return {
      payable: baseFee / 2,
      note: "Half Scholarship",
    };
  }

  if (type === "custom") {
    return {
      payable: Math.max(0, scholarshipAmount),
      note: `Scholarship Payable: ${money(scholarshipAmount)}`,
    };
  }

  return {
    payable: baseFee,
    note: "",
  };
}

function computeFees(
  student: StudentRow,
  settings: SettingsRow | null,
  feeLiveRows: FeeViewRow[],
  feePaymentRows: Record<string, any>[],
  feeStructureRows: Record<string, any>[],
  classRows: ClassRow[]
) {
  const currentTerm = cleanText(settings?.current_term);
  const nextTermLabel = getNextTermLabel(currentTerm);

  const feeLive = feeLiveRows.find((row) => rowBelongsToStudent(row, student));

  // This is the SAME idea as Fees > Record Payment:
  // Returning/continuing fee is what matters after admission/new-student billing.
  const currentTermBaseFee = getFeeFromFeeStructure(
    student,
    settings,
    feeStructureRows,
    classRows
  );

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

  // Next term must ALWAYS be continuing/returning student fee,
  // never the admission/new-student bill.
  const nextTermBaseFee = getFeeFromFeeStructure(
    student,
    settings,
    feeStructureRows,
    classRows
  );

  const nextTermScholarship = applyScholarship(student, nextTermBaseFee);
  const nextTermFee = nextTermScholarship.payable;
  const total = arrears + nextTermFee;

  return {
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

function ReportCardSheet({ data }: { data: ReportData }) {
  const { student, settings, scores, attendance, remarks, fees, headteacherSignatureUrl } = data;

  const schoolLogo = getSchoolLogo(settings);
  const className = student.className;
  const levelTitle = getLevelTitle(className);
  const parentPortalUrl = getParentPortalUrl(student.studentId, className);
  const parentQrUrl = getQrCodeUrl(parentPortalUrl);

  const sortedScores = [...scores].sort((a, b) => {
    const aPriority = getSubjectPriority(a.subject_name, className);
    const bPriority = getSubjectPriority(b.subject_name, className);

    if (aPriority !== bPriority) return aPriority - bPriority;

    return cleanText(a.subject_name).localeCompare(cleanText(b.subject_name));
  });

  const playroomRows = sortedScores.map((score) => ({
    subject: cleanText(score.subject_name),
    mark: cleanText(score.playroom_mark || score.grade),
  }));

  const academicRows = sortedScores.map((score) => {
    const total = score.total_score !== null && score.total_score !== undefined
      ? Number(score.total_score)
      : "";

    return {
      subject: cleanText(score.subject_name),
      classScore:
        score.class_score !== null && score.class_score !== undefined
          ? Number(score.class_score)
          : "",
      examScore:
        score.exam_score !== null && score.exam_score !== undefined
          ? Number(score.exam_score)
          : "",
      total,
      grade: usesGradeColumn(className) ? cleanText(score.grade) : "",
      position: cleanText(score.position),
      remark: cleanText(score.remark) || getScoreRemark(total),
    };
  });

  const totalScore = isPlayroom(className)
    ? ""
    : academicRows.reduce((sum, row) => sum + safeNumber(row.total), 0);

  const subjectCount = isPlayroom(className)
    ? 0
    : academicRows.filter((row) => row.total !== "").length;

  const averageScore =
    isPlayroom(className) || subjectCount === 0
      ? ""
      : Number((Number(totalScore) / subjectCount).toFixed(1));

  const aggregate = getAggregate(academicRows, className);

  const rowCount = isPlayroom(className) ? playroomRows.length : academicRows.length;
  const tablePadding = rowCount >= 10 ? "12px" : rowCount >= 7 ? "20px" : "28px";

  return (
    <div className="report-a4">
      {schoolLogo && (
        <div className="report-watermark">
          <img src={schoolLogo} alt="School Watermark" />
        </div>
      )}

      <div className="report-inner">
        <div className="report-header">
          <div className="report-header-grid">
            <div className="logo-circle">
              {schoolLogo && <img src={schoolLogo} alt="School Logo" />}
            </div>

            <div className="school-header-text">
              <div className="school-name">{settings.school_name || ""}</div>
              {getSchoolMotto(settings) && (
                <div className="header-meta motto">{getSchoolMotto(settings)}</div>
              )}
              {getSchoolAddress(settings) && (
                <div className="header-meta">{getSchoolAddress(settings)}</div>
              )}
              {getSchoolPhone(settings) && (
                <div className="header-meta">{getSchoolPhone(settings)}</div>
              )}
              <div>
                <span className="terminal-badge">Terminal Report</span>
              </div>
              {levelTitle && <div className="level-badge">{levelTitle}</div>}
            </div>

            <div className="logo-circle">
              {schoolLogo && <img src={schoolLogo} alt="School Logo" />}
            </div>
          </div>
        </div>

        <div className="student-info-card">
          <div className="student-info-grid">
            <div className="student-band">
              <div>
                <span className="lbl">Name: </span>
                {student.fullName}
              </div>
              <div>
                <span className="lbl">Class: </span>
                {className}
              </div>
              <div>
                <span className="lbl">Student ID: </span>
                {student.studentId}
              </div>
              <div>
                <span className="lbl">Term: </span>
                {settings.current_term || ""}
              </div>
              <div>
                <span className="lbl">Academic Year: </span>
                {getAcademicYear(settings)}
              </div>
              <div>
                <span className="lbl">No. on Roll: </span>
                {student.classTotal}
              </div>
              <div>
                <span className="lbl">Date: </span>
                {formatDate(getClosingDate(settings))}
              </div>
              <div>
                <span className="lbl">Reopening Date: </span>
                {formatDate(getReopeningDate(settings))}
              </div>
            </div>

            <div className="student-photo">
              {student.photoUrl ? (
                <img src={student.photoUrl} alt={student.fullName} />
              ) : (
                <span>Photo</span>
              )}
            </div>
          </div>
        </div>

        <div className="table-wrapper" style={{ paddingTop: tablePadding, paddingBottom: tablePadding }}>
          {isPlayroom(className) ? (
            <table className="report-table playroom-table">
              <thead>
                <tr>
                  <th style={{ width: "52%", textAlign: "left" }}>Subject</th>
                  <th>A</th>
                  <th>B</th>
                  <th>C</th>
                  <th>D</th>
                </tr>
              </thead>
              <tbody>
                {playroomRows.map((row) => (
                  <tr key={row.subject}>
                    <td>{row.subject}</td>
                    {["A", "B", "C", "D"].map((letter) => (
                      <td key={letter}>{row.mark === letter ? "✔" : ""}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <table className="report-table">
              <thead>
                <tr>
                  <th style={{ width: usesGradeColumn(className) ? "24%" : "28%", textAlign: "left" }}>
                    Subject
                  </th>
                  <th style={{ width: "13%" }}>CAT (50%)</th>
                  <th style={{ width: "14%" }}>Exams (50%)</th>
                  <th style={{ width: "8%" }}>Total</th>
                  {usesGradeColumn(className) && <th style={{ width: "8%" }}>Grade</th>}
                  <th style={{ width: "10%" }}>Position</th>
                  <th style={{ width: usesGradeColumn(className) ? "23%" : "27%" }}>Remarks</th>
                </tr>
              </thead>
              <tbody>
                {academicRows.map((row) => (
                  <tr key={row.subject}>
                    <td>{row.subject}</td>
                    <td>{row.classScore}</td>
                    <td>{row.examScore}</td>
                    <td style={{ fontWeight: 700 }}>{row.total}</td>
                    {usesGradeColumn(className) && <td>{row.grade}</td>}
                    <td>{row.position}</td>
                    <td style={{ textAlign: "left", paddingLeft: "7px" }}>{row.remark}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={3} style={{ textAlign: "right", paddingRight: "7px" }}>
                    Total Score
                  </td>
                  <td style={{ fontWeight: 700 }}>{totalScore}</td>
                  {usesGradeColumn(className) && <td />}
                  <td />
                  <td style={{ textAlign: "left", paddingLeft: "7px" }}>
                    Average: <strong>{averageScore}</strong>
                  </td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>

        <div className="details-section">
          <div className="detail-row">
            <span className="lbl">Attendance:</span>
            <span className="val">
              {attendance?.days_present || attendance?.attendance_present || "___"} out of{" "}
              {data.totalSchoolDays || attendance?.total_school_days || "___"} days
            </span>
          </div>

          <div className="detail-row">
            <span className="lbl">Promoted to:</span>
            <span className="val">
              {getReportPromotedClass(className, cleanText(settings.current_term), remarks) || "______________________"}
            </span>
          </div>

          {!isPlayroom(className) && (
            <>
              {aggregate !== "" && (
                <div className="detail-row">
                  <span className="lbl">Aggregate:</span>
                  <span className="val">{aggregate}</span>
                </div>
              )}

              <div className="detail-row">
                <span className="lbl">Conduct:</span>
                <span className="val">{remarks?.conduct || ""}</span>
              </div>

              <div className="detail-row">
                <span className="lbl">Attitude:</span>
                <span className="val">{remarks?.attitude || ""}</span>
              </div>

              <div className="detail-row">
                <span className="lbl">Interest:</span>
                <span className="val">{remarks?.interest || ""}</span>
              </div>

              <div className="detail-row detail-row-full">
                <span className="lbl">Class Teacher&apos;s Remarks:</span>
                <span className="val">{remarks?.teacher_remark || ""}</span>
              </div>

              <div className="detail-row detail-row-full">
                <span className="lbl">Headmaster&apos;s Remarks:</span>
                <span className="val">{getHeadmasterRemark(averageScore)}</span>
              </div>
            </>
          )}
        </div>

        <div className="bottom-section">
          <div>
            <div className="block-title">Grade Key</div>

            {isPlayroom(className) ? (
              <div className="grade-key-grid">
                {[
                  ["A", "Excellent"],
                  ["B", "Very Good"],
                  ["C", "Good"],
                  ["D", "Developing"],
                ].map(([letter, meaning]) => (
                  <div key={letter} className="gk-item">
                    <span className="gk-letter">{letter}</span>
                    <span>{meaning}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="grade-key-grid">
                {[
                  ["80–100", "Excellent"],
                  ["75–79", "Very Good"],
                  ["70–74", "Good"],
                  ["65–69", "Credit"],
                  ["60–64", "V. Satisfactory"],
                  ["55–59", "Satisfactory"],
                  ["45–54", "Needs Improvement"],
                  ["40–44", "Weak"],
                  ["0–39", "Poor"],
                ].map(([range, meaning]) => (
                  <div key={range} className="gk-item">
                    <span className="gk-letter">{range}</span>
                    <span>{meaning}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <div className="block-title">Fees For Next Term ({fees.nextTermLabel})</div>

            <table className="fees-table">
              <tbody>
                <tr>
                  <td>Arrears</td>
                  <td>{money(fees.arrears)}</td>
                </tr>
                <tr>
                  <td>Fees For Next Term</td>
                  <td>{money(fees.nextTermFee)}</td>
                </tr>
                <tr>
                  <td>Total Payable</td>
                  <td>{money(fees.total)}</td>
                </tr>
              </tbody>
            </table>

            {fees.scholarshipNote && (
              <div className="scholarship-note">{fees.scholarshipNote}</div>
            )}

            <div className="signature-block">
              <span className="signature-label">Headmaster&apos;s Signature:</span>
              <div className="signature-box">
                {headteacherSignatureUrl && (
                  <img
                    src={headteacherSignatureUrl}
                    alt="Headteacher Signature"
                  />
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="parent-portal-strip">
          <div className="parent-portal-text">
            <div><strong>Parent Portal:</strong> {parentPortalUrl.replace("https://", "")}</div>
            <div><strong>Website:</strong> jefsemvision.cc/website</div>
            <div><strong>Online Admission:</strong> jefsemvision.cc/website/admission</div>
          </div>

          <div className="parent-qr-box">
            <img src={parentQrUrl} alt="Parent Portal QR Code" />
          </div>
        </div>
      </div>
    </div>
  );
}


function getTeacherDisplayName(row: Record<string, any> | null) {
  return cleanText(
    row?.full_name ||
      row?.teacher_name ||
      row?.name ||
      row?.username ||
      row?.email ||
      "Teacher"
  );
}

function isAdminRole(row: Record<string, any> | null) {
  const role = cleanLower(row?.role);
  return (
    role === "admin" ||
    role === "headmaster" ||
    role === "owner" ||
    role === "super_admin" ||
    role === "superadmin"
  );
}

function classNameMatches(a: unknown, b: unknown) {
  return cleanLower(a) === cleanLower(b);
}

export default function ReportCardsPage() {
  const router = useRouter();

  const [students, setStudents] = useState<StudentRow[]>([]);
  const [settings, setSettings] = useState<SettingsRow | null>(null);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [scores, setScores] = useState<ScoreRow[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRow[]>([]);
  const [remarks, setRemarks] = useState<RemarkRow[]>([]);
  const [feeLiveRows, setFeeLiveRows] = useState<FeeViewRow[]>([]);
  const [teachers, setTeachers] = useState<any[]>([]);
  const [feePayments, setFeePayments] = useState<any[]>([]);
  const [feeStructures, setFeeStructures] = useState<any[]>([]);
  const [holidayRows, setHolidayRows] = useState<any[]>([]);

  const [isPreviewWindow, setIsPreviewWindow] = useState(false);
  const [selectedClass, setSelectedClass] = useState("All");
  const [loading, setLoading] = useState(true);
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [teacherName, setTeacherName] = useState("Teacher");
  const [assignedClassNames, setAssignedClassNames] = useState<string[]>([]);
  const [previewMode, setPreviewMode] = useState<"none" | "student" | "class" | "all">("none");
  const [previewStudentId, setPreviewStudentId] = useState("");
  const [message, setMessage] = useState("");

  const academicYear = getAcademicYear(settings);
  const currentTerm = cleanText(settings?.current_term);

  function getAllowedStudents(rows: StudentRow[], allowedClassNames: string[]) {
    const allowed = allowedClassNames.map((item) => cleanLower(item)).filter(Boolean);

    return rows.filter((student) => {
      if (!isActiveStudent(student)) return false;
      if (allowed.length === 0) return false;
      return allowed.includes(cleanLower(student.class_name));
    });
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const preview = cleanText(params.get("preview"));
    const student = cleanText(params.get("student"));
    const className = cleanText(params.get("class"));

    if (preview) {
      setIsPreviewWindow(true);

      if (preview === "all") {
        setPreviewMode("all");
      } else if (preview === "class") {
        setPreviewMode("class");
      } else if (preview === "student") {
        setPreviewMode("student");
      }

      if (student) setPreviewStudentId(student);
      if (className) setSelectedClass(className);
    }
  }, []);

  async function resolveTeacherClasses() {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.user) {
      router.replace("/");
      return null;
    }

    const teachersRes = await supabase.from("teachers").select("*");

    if (teachersRes.error) {
      setMessage(teachersRes.error.message);
      return null;
    }

    const teacherRow =
      (teachersRes.data || []).find(
        (item: any) => String(item.auth_user_id || "") === String(session.user.id)
      ) ||
      (teachersRes.data || []).find(
        (item: any) =>
          cleanLower(item.email) === cleanLower(session.user.email)
      ) ||
      null;

    if (!teacherRow) {
      setMessage("Teacher account was not found.");
      return null;
    }

    if (isAdminRole(teacherRow)) {
      router.replace("/report-card/admin/reports");
      return null;
    }

    setTeacherName(getTeacherDisplayName(teacherRow));

    const assignmentRes = await authedFetch(
      `/api/teacher-assignments/get?teacher_id=${teacherRow.id}`
    );

    const assignmentData = await assignmentRes.json().catch(() => ({}));

    if (!assignmentRes.ok || assignmentData.error) {
      setMessage(assignmentData.error || "Failed to load assigned classes.");
      return [];
    }

    const classIds = Array.isArray(assignmentData.class_ids)
      ? assignmentData.class_ids.map((id: unknown) => String(id))
      : [];

    const classesRes = await supabase
      .from("classes")
      .select("*")
      .order("class_order", { ascending: true });

    if (classesRes.error) {
      setMessage(classesRes.error.message);
      return [];
    }

    const classNames = ((classesRes.data || []) as ClassRow[])
      .filter((cls) => classIds.includes(String(cls.id || "")))
      .map((cls) => cleanText(cls.class_name || cls.name))
      .filter(Boolean);

    setClasses(classesRes.data || []);
    setAssignedClassNames(classNames);

    setSelectedClass((current) => {
      if (current && current !== "All" && classNames.some((name) => classNameMatches(name, current))) {
        return current;
      }

      return classNames[0] || "";
    });

    return classNames;
  }

  async function loadData(allowedClassNames = assignedClassNames) {
    setLoading(true);
    setMessage("");

    const [
      studentsRes,
      settingsRes,
      classesRes,
      scoresRaw,
      attendanceRaw,
      remarksRaw,
      feeLiveRes,
      teachersRes,
      feePaymentsRes,
      feeStructureRes,
      holidaysRes,
      closuresRes,
    ] = await Promise.all([
      supabase
        .from("students")
        .select("*")
        .order("class_name", { ascending: true })
        .order("full_name", { ascending: true }),
      supabase
        .from("school_settings")
        .select("*")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("classes")
        .select("*")
        .order("class_order", { ascending: true }),
      authedFetch("/api/report-card/scores"),
      authedFetch("/api/report-card/attendance"),
      authedFetch("/api/report-card/cards"),
      supabase
        .from("jsms_report_fee_live_view")
        .select("*"),
      supabase
        .from("teachers")
        .select("*"),
      supabase
        .from("fee_payments")
        .select("*"),
      supabase
        .from("fee_structure")
        .select("*"),
      supabase
        .from("ghana_public_holidays")
        .select("*"),
      supabase
        .from("school_closures")
        .select("*"),
    ]);

    const [scoresData, attendanceData, remarksData] = await Promise.all([
      scoresRaw.json(),
      attendanceRaw.json(),
      remarksRaw.json(),
    ]);

    if (studentsRes.error) setMessage(studentsRes.error.message);
    if (!studentsRes.error) setStudents(getAllowedStudents(studentsRes.data || [], allowedClassNames));
    if (!settingsRes.error) setSettings(settingsRes.data || null);
    if (!classesRes.error) setClasses(classesRes.data || []);
    if (scoresRaw.ok) setScores(scoresData.rows || []);
    if (attendanceRaw.ok) setAttendance(attendanceData.rows || []);
    if (remarksRaw.ok) setRemarks(remarksData.rows || []);
    if (!feeLiveRes.error) setFeeLiveRows(feeLiveRes.data || []);
    if (!teachersRes.error) setTeachers(teachersRes.data || []);
    if (!feePaymentsRes.error) setFeePayments(feePaymentsRes.data || []);
    if (!feeStructureRes.error) setFeeStructures(feeStructureRes.data || []);
    setHolidayRows([
      ...(!holidaysRes.error ? holidaysRes.data || [] : []),
      ...(!closuresRes.error ? closuresRes.data || [] : []),
    ]);

    setLoading(false);
  }

  useEffect(() => {
    async function initTeacherReports() {
      setCheckingAccess(true);
      const classNames = await resolveTeacherClasses();

      if (classNames) {
        await loadData(classNames);
      }

      setCheckingAccess(false);
    }

    void initTeacherReports();
  }, []);

  const teacherClassOptions = useMemo(() => assignedClassNames, [assignedClassNames]);

  const filteredStudents = useMemo(() => {
    if (!selectedClass) return [];
    return students.filter((student) => cleanText(student.class_name) === selectedClass);
  }, [students, selectedClass]);

  const classCounts = useMemo(() => {
    const map = new Map<string, number>();

    students.forEach((student) => {
      const className = cleanText(student.class_name);
      map.set(className, (map.get(className) || 0) + 1);
    });

    return map;
  }, [students]);

  const previewStudents = useMemo(() => {
    if (!isPreviewWindow) return filteredStudents;
    if (previewMode === "none") return filteredStudents;
    if (previewMode === "all") return students;
    if (previewMode === "class") return filteredStudents;

    return students.filter((student) => getStudentReportId(student) === previewStudentId);
  }, [isPreviewWindow, previewMode, previewStudentId, students, filteredStudents]);

  const headteacherSignatureUrl = useMemo(() => {
    return getHeadteacherSignatureUrl(teachers);
  }, [teachers]);

  const totalSchoolDays = useMemo(() => {
    return calculateSchoolDaysFromSettings(settings, holidayRows);
  }, [settings, holidayRows]);

  const reports = useMemo<ReportData[]>(() => {
    return previewStudents.map((student) => {
      const studentScores = scores.filter(
        (score) =>
          rowBelongsToStudent(score, student) &&
          cleanText(score.academic_year) === academicYear &&
          cleanText(score.term) === currentTerm
      );

      const studentAttendance =
        attendance.find(
          (row) =>
            rowBelongsToStudent(row, student) &&
            cleanText(row.academic_year) === academicYear &&
            cleanText(row.term) === currentTerm
        ) || null;

      const studentRemarks =
        remarks.find(
          (row) =>
            rowBelongsToStudent(row, student) &&
            cleanText(row.academic_year) === academicYear &&
            cleanText(row.term) === currentTerm
        ) || null;

      const fees = computeFees(
        student,
        settings,
        feeLiveRows,
        feePayments,
        feeStructures,
        classes
      );

      const fullName = getStudentName(student);
      const nameParts = fullName.split(" ");

      return {
        student: {
          id: cleanText(student.id),
          fullName,
          firstName: cleanText(student.first_name) || nameParts[0] || "",
          lastName: cleanText(student.last_name) || nameParts.slice(1).join(" "),
          studentId: getStudentReportId(student),
          className: cleanText(student.class_name),
          photoUrl: getStudentPhoto(student),
          classTotal: classCounts.get(cleanText(student.class_name)) || 0,
          scholarshipType: cleanText(student.scholarship_type),
          scholarshipAmount: safeNumber(student.scholarship_amount),
          isNewStudent:
            student.is_new === true ||
            student.is_new_student === true ||
            cleanLower(student.student_type).includes("new"),
        },
        settings: settings || {},
        scores: studentScores,
        attendance: studentAttendance,
        remarks: studentRemarks,
        headteacherSignatureUrl,
        totalSchoolDays,
        fees,
      };
    });
  }, [
    previewStudents,
    scores,
    academicYear,
    currentTerm,
    attendance,
    remarks,
    settings,
    feeLiveRows,
    feePayments,
    feeStructures,
    classes,
    classCounts,
    headteacherSignatureUrl,
    totalSchoolDays,
  ]);

  function previewStudent(student: StudentRow) {
    const studentId = encodeURIComponent(getStudentReportId(student));
    window.open(`/report-card/teacher/reports?preview=student&student=${studentId}`, "_blank");
  }

  function previewClass() {
    const mode = selectedClass === "All" ? "all" : "class";
    const classQuery = selectedClass === "All" ? "" : `&class=${encodeURIComponent(selectedClass)}`;

    window.open(`/report-card/teacher/reports?preview=${mode}${classQuery}`, "_blank");
  }

  function previewAll() {
    window.open("/report-card/teacher/reports?preview=all", "_blank");
  }

  function printReports() {
    window.print();
  }

  if (checkingAccess) {
    return (
      <main className="min-h-screen bg-gray-100 p-5">
        <div className="rounded-3xl bg-white p-6 text-center text-sm font-bold text-gray-600 shadow-sm">
          Loading assigned report cards...
        </div>
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 p-5">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=EB+Garamond:wght@400;600;700&family=Crimson+Pro:wght@400;600;700&display=swap');

        @media print {
          body {
            background: white !important;
          }

          body * {
            visibility: hidden !important;
          }

          .print-root,
          .print-root * {
            visibility: visible !important;
          }

          .no-print,
          .no-print * {
            display: none !important;
          }

          .print-root {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
          }

          .no-print {
            display: none !important;
          }

          @page {
            size: A4 portrait;
            margin: 0;
          }

                  .report-a4 {
          width: 210mm;
          height: 297mm;
          min-height: 297mm;
          max-height: 297mm;
          background: #fdfaf6;
          color: #1f2933;
          margin: 0 auto;
          box-sizing: border-box;
          font-family: 'Crimson Pro', Georgia, serif;
          overflow: hidden;
          position: relative;
          box-shadow: 0 10px 35px rgba(15, 23, 42, 0.16);
        }

          .report-a4:last-child {
            page-break-after: auto !important;
            break-after: auto !important;
          }
        }

        .report-a4 {
          width: 210mm;
          height: 297mm;
          min-height: 297mm;
          max-height: 297mm;
          background: #fff;
          color: #000;
          margin: 0 auto;
          box-sizing: border-box;
          font-family: 'Crimson Pro', Georgia, serif;
          overflow: hidden;
          position: relative;
          box-shadow: 0 10px 35px rgba(15, 23, 42, 0.16);
        }

                .report-a4::before {
          content: '';
          position: absolute;
          inset: 5.5mm;
          border: 1.5px solid #18324f;
          pointer-events: none;
          z-index: 0;
        }

                .report-a4::after {
          content: '';
          position: absolute;
          inset: 7mm;
          border: 0.75px solid #b89b5e;
          pointer-events: none;
          z-index: 0;
        }

        .report-watermark {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 0;
          pointer-events: none;
        }

        .report-watermark img {
          width: 120mm;
          height: 120mm;
          object-fit: contain;
          opacity: 0.06;
          transform: rotate(-18deg);
        }

                .report-inner {
          position: relative;
          z-index: 1;
          height: 100%;
          min-height: 100%;
          max-height: 100%;
          box-sizing: border-box;
          padding: 10mm 11mm 9mm 11mm;
          display: grid;
          grid-template-rows: auto auto 1fr auto auto auto;
        }

                .report-header {
          padding: 8px 8px 9px;
          border: 1px solid #d8c49a;
          border-radius: 8px;
          background: linear-gradient(135deg, #fffaf0 0%, #f4ead8 100%);
          margin-bottom: 10px;
        }

                .report-header-grid {
          display: grid;
          grid-template-columns: 66px 1fr 66px;
          align-items: center;
          column-gap: 10px;
        }

        

                .school-name {
          font-family: 'EB Garamond', 'Times New Roman', serif;
          font-size: 25px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 1.7px;
          line-height: 1.05;
          color: #18324f;
        }

        .school-header-text {
          text-align: center;
        }

                .header-meta {
          font-size: 11.5px;
          line-height: 1.35;
          color: #3c4653;
          margin-top: 2px;
        }

                .motto {
          font-style: italic;
          color: #8a6b2f;
          font-weight: 600;
        }

                .terminal-badge {
          display: inline-block;
          margin-top: 5px;
          background: #18324f;
          color: #fffdf7;
          font-size: 10.5px;
          font-weight: 700;
          letter-spacing: 2px;
          text-transform: uppercase;
          padding: 2px 16px;
          border-radius: 999px;
        }

                .level-badge {
          font-size: 10.5px;
          font-weight: 700;
          letter-spacing: 1.5px;
          text-transform: uppercase;
          color: #8a6b2f;
          margin-top: 4px;
        }

        .logo-circle {
          width: 64px;
          height: 64px;
          border: 2px solid #1a3a5c;
          border-radius: 9999px;
          overflow: hidden;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          background: #f0f4f8;
          font-size: 10px;
          color: #1a3a5c;
          font-weight: 700;
        }

        .student-photo {
          width: 145px;
          height: 110px;
          border: 1px solid #d4b679;
          border-radius: 8px;
          overflow: hidden;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #fff;
          color: #1a3a5c;
          font-size: 10px;
          font-weight: 700;
        }

        .student-photo img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
.logo-circle img,
        .student-photo img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        

        

                .student-info-card {
          background: #fdfaf3;
          border: 1px solid #d4b679;
          border-radius: 7px;
          padding: 8px 10px;
          margin-top: 8px;
        }

        .student-info-grid {
          display: grid;
          grid-template-columns: 1fr 145px;
          gap: 10px;
          align-items: stretch;
        }

        .student-band {
          font-size: 13px;
          line-height: 1.72;
          display: grid;
          grid-template-columns: 1fr 1fr;
          column-gap: 12px;
          align-content: center;
        }

        .student-band .lbl {
          font-weight: 700;
          color: #1a3a5c;
        }

        .table-wrapper {
          display: flex;
          flex-direction: column;
          justify-content: center;
        }

        .report-table {
          width: 100%;
          border-collapse: collapse;
          table-layout: fixed;
        }

                .report-table thead tr {
          background: #18324f;
          color: #fffdf7;
        }

                .report-table th {
          border: 1px solid #18324f;
          padding: 5px 3px;
          font-size: 10.5px;
          font-weight: 700;
          text-transform: uppercase;
          text-align: center;
          vertical-align: middle;
          line-height: 1.2;
        }

        .report-table th:first-child {
          text-align: left;
          padding-left: 7px;
        }

                .report-table tbody tr:nth-child(even) {
          background: #faf4e8;
        }

                .report-table tbody tr:nth-child(odd) {
          background: #fffdf7;
        }

        .report-table td {
          border: 1px solid #c5d3df;
          padding: 5px 3px;
          font-size: 12px;
          vertical-align: middle;
          color: #111;
          line-height: 1.25;
        }

        .report-table td:first-child {
          padding-left: 7px;
          font-weight: 600;
        }

        .report-table td:not(:first-child) {
          text-align: center;
        }

        .report-table tfoot tr {
          background: #e8edf2;
          font-weight: 700;
        }

        .report-table tfoot td {
          border: 1px solid #1a3a5c;
          padding: 5px 3px;
          font-size: 11.5px;
          color: #1a3a5c;
        }

        .playroom-table td:not(:first-child) {
          text-align: center;
          font-size: 15px;
        }

                .details-section {
          border-top: 1.5px solid #18324f;
          padding-top: 6px;
          margin-top: 0;
          display: grid;
          grid-template-columns: 1fr 1fr;
          column-gap: 16px;
          font-size: 12.5px;
          line-height: 1.65;
        }

        .detail-row {
          display: flex;
          align-items: baseline;
          gap: 5px;
          padding: 1px 0;
        }

        .detail-row .lbl {
          font-weight: 700;
          color: #1a3a5c;
          white-space: nowrap;
          flex-shrink: 0;
          font-size: 12.5px;
        }

        .detail-row .val {
          color: #111;
          font-size: 13px;
          flex: 1;
        }

        .detail-row-full {
          grid-column: 1 / -1;
        }

        .bottom-section {
          margin-top: 4px;
          display: grid;
          grid-template-columns: 1fr 1fr;
          column-gap: 14px;
          align-items: start;
        }

                .block-title {
          font-size: 10.5px;
          font-weight: 700;
          letter-spacing: 1px;
          text-transform: uppercase;
          color: #fffdf7;
          background: #18324f;
          border: 1px solid #18324f;
          border-bottom: none;
          padding: 4px 8px;
          border-radius: 6px 6px 0 0;
        }

                .grade-key-grid {
          border: 1px solid #d8c49a;
          display: grid;
          grid-template-columns: 1fr 1fr;
          font-size: 10.5px;
          background: #fffdf7;
        }

        .grade-key-grid .gk-item {
          padding: 3px 7px;
          border-bottom: 1px solid #c5d3df;
          border-right: 1px solid #c5d3df;
          display: flex;
          gap: 6px;
        }

        .grade-key-grid .gk-item:nth-child(even) {
          border-right: none;
        }

        .grade-key-grid .gk-letter {
          font-weight: 700;
          color: #1a3a5c;
          min-width: 42px;
        }

        .fees-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 12px;
        }

                .fees-table td {
          border: 1px solid #d8c49a;
          padding: 4px 7px;
        }

        .fees-table td:last-child {
          text-align: right;
          font-weight: 600;
          width: 35%;
        }

                .fees-table tr:last-child td {
          background: #faf4e8;
          font-weight: 700;
          color: #18324f;
        }

        .scholarship-note {
          margin-top: 5px;
          font-size: 11px;
          font-weight: 700;
          color: #1a3a5c;
        }

        .signature-block {
          margin-top: 9px;
        }

        .signature-label {
          font-size: 12px;
          font-weight: 700;
          color: #1a3a5c;
          display: block;
          margin-bottom: 3px;
        }

        .signature-box {
          height: 52px;
          border-bottom: 1.5px solid #1a3a5c;
          display: flex;
          align-items: flex-end;
          padding-bottom: 3px;
        }

        .signature-box img {
          max-height: 48px;
          max-width: 190px;
          object-fit: contain;
        }

        .parent-portal-strip {
          margin-top: 6px;
          border: 1px solid #c5d3df;
          border-radius: 8px;
          background: #fffaf0;
          display: grid;
          grid-template-columns: 1fr 64px;
          align-items: center;
          gap: 8px;
          padding: 6px 8px;
        }

        .parent-portal-text {
          font-size: 11px;
          color: #1a3a5c;
          line-height: 1.35;
        }

        .parent-qr-box {
          width: 58px;
          height: 58px;
          border: 1px solid #c5d3df;
          background: #fff;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 2px;
        }

        .parent-qr-box img {
          width: 100%;
          height: 100%;
          object-fit: contain;
        }
      `}</style>

      {!isPreviewWindow && (
        <div className="no-print space-y-5">
          <div className="rounded-3xl bg-white p-6 shadow-sm">
            <h1 className="text-2xl font-extrabold text-gray-900">Teacher Report Cards</h1>
            <p className="mt-2 text-sm text-gray-500">
              Select one assigned class to preview the report cards below.
            </p>
            <p className="mt-1 text-sm font-bold text-gray-700">Teacher: {teacherName}</p>
            <p className="mt-2 text-sm font-semibold text-sky-700">
              {currentTerm || "Current Term"} • {academicYear || "Academic Year"}
            </p>
          </div>

          <div className="flex flex-col gap-4 rounded-3xl bg-white p-5 shadow-sm lg:flex-row lg:items-center lg:justify-between">
            <div className="w-full lg:w-80">
              <label className="mb-2 block text-xs font-black uppercase tracking-wide text-gray-500">
                Select Class
              </label>
              <select
                value={selectedClass}
                onChange={(event) => setSelectedClass(event.target.value)}
                className="w-full rounded-2xl border border-gray-300 px-4 py-3 text-sm font-bold outline-none focus:border-sky-500"
              >
                {teacherClassOptions.length === 0 ? (
                  <option value="">No assigned class</option>
                ) : (
                  teacherClassOptions.map((className) => (
                    <option key={className} value={className}>
                      {className}
                    </option>
                  ))
                )}
              </select>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={printReports}
                disabled={reports.length === 0}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-50"
              >
                <FiPrinter size={16} />
                Print
              </button>

              <button
                type="button"
                onClick={() => loadData()}
                className="flex items-center gap-2 rounded-2xl bg-gray-100 px-4 py-3 text-sm font-bold text-gray-700 hover:bg-gray-200"
              >
                <FiRefreshCw size={16} />
                Refresh
              </button>
            </div>
          </div>

          {message && (
            <div className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
              {message}
            </div>
          )}

          <div className="overflow-x-auto">
            <div className="print-root space-y-8">
              {loading ? (
                <div className="rounded-3xl bg-white p-6 text-center text-sm font-bold text-gray-500 shadow-sm">
                  Loading report cards...
                </div>
              ) : reports.length === 0 ? (
                <div className="rounded-3xl bg-white p-6 text-center text-sm font-bold text-gray-500 shadow-sm">
                  No report cards found for this class.
                </div>
              ) : (
                reports.map((report, index) => (
                  <ReportCardSheet key={`${report.student.id}-${index}`} data={report} />
                ))
              )}
            </div>
          </div>
        </div>

      )}

      {isPreviewWindow && (
        <>
          <div className="no-print sticky top-0 z-40 mb-5 flex flex-col gap-3 rounded-3xl bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-bold text-gray-900">Report Preview</h2>
              <p className="text-sm text-gray-500">
                {reports.length === 1
                  ? "Previewing one report card."
                  : `Previewing ${reports.length} report cards.`}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={printReports}
                disabled={reports.length === 0}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-50"
              >
                <FiPrinter size={16} />
                Print
              </button>

              <button
                type="button"
                onClick={() => window.close()}
                className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-bold text-red-700 hover:bg-red-100"
              >
                Close
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <div className="print-root space-y-8">
              {reports.length === 0 ? (
                <div className="no-print rounded-3xl bg-white p-6 text-sm text-gray-500 shadow-sm">
                  No report cards found.
                </div>
              ) : (
                reports.map((report, index) => (
                  <ReportCardSheet key={`${report.student.id}-${index}`} data={report} />
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}