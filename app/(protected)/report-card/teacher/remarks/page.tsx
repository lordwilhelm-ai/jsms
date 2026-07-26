"use client";

import { useEffect, useMemo, useState } from "react";
import { FiRefreshCw } from "react-icons/fi";
import { supabase } from "@/lib/supabase";
import { authedFetch } from "@/lib/apiClient";

type TeacherRow = Record<string, any>;

type ClassRow = {
  id: string;
  name?: string | null;
  class_name?: string | null;
  class_order?: number | null;
};

type StudentRow = {
  id: string;
  student_id: string | null;
  jvs_id: string | null;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  class_name: string | null;
};

type ScoreRow = {
  student_id: string | null;
  student_name?: string | null;
  class_name?: string | null;
  subject_name?: string | null;
  academic_year?: string | null;
  term?: string | null;
  total_score?: number | string | null;
  grade?: string | null;
  playroom_mark?: string | null;
};

type ReportCardRow = Record<string, any>;

type EntryRow = {
  studentId: string;
  averageScore: string | number;
  conduct: string;
  attitude: string;
  interest: string;
  teacherRemark: string;
  promotedTo: string;
  suggestionConduct: string;
  suggestionAttitude: string;
  suggestionInterest: string;
  suggestionRemark: string;
  rowId: string;
};

type SettingsData = {
  academicYear: string;
  currentTerm: string;
};

const CONDUCT_OPTIONS = [
  "Very Well Behaved",
  "Well Behaved",
  "Generally Well Behaved",
  "Respectful and Courteous",
  "Calm and Cooperative",
  "Polite and Responsible",
];

const ATTITUDE_OPTIONS = [
  "Very Hardworking",
  "Hardworking",
  "Shows Good Effort",
  "Determined to Improve",
  "Participates Well",
  "Attentive and Focused",
];

const INTEREST_OPTIONS = [
  "Football",
  "Reading",
  "Writing",
  "Drawing / Art",
  "Singing",
  "Dancing",
  "Sports (General)",
  "Computing",
  "Creative Activities",
];

const REMARK_OPTIONS = [
  "Excellent performance. Keep it up.",
  "Very good work. Keep improving.",
  "Good effort. Keep it up.",
  "Good progress. Continue working hard.",
  "Shows steady improvement. Keep trying.",
  "Shows promise and can achieve more with steady effort.",
  "Participates well and is making progress.",
  "Promotion recommended.",
];

const PROMOTED_TO_OPTIONS = [
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

function isPlayroomOneClass(className: string) {
  return cleanLower(className) === "playroom 1";
}

function cleanText(value: unknown) {
  return String(value || "").trim();
}

function cleanLower(value: unknown) {
  return cleanText(value).toLowerCase();
}

function getRole(row: TeacherRow | null) {
  const raw = cleanLower(row?.role);
  if (raw === "owner" || raw === "admin" || raw === "headmaster" || raw === "super_admin" || raw === "superadmin") return raw;
  return "teacher";
}

function getTeacherName(row: TeacherRow | null) {
  return cleanText(
    row?.full_name || row?.name || row?.teacher_name || row?.username || "Teacher"
  );
}

function getTeacherCode(row: TeacherRow | null) {
  return cleanText(row?.teacher_id || row?.id);
}

function getClassName(row: ClassRow) {
  return cleanText(row.class_name || row.name);
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

function getAcademicYear(settings: Record<string, any> | null) {
  return cleanText(settings?.current_academic_year || settings?.academic_year);
}

function getConductFromAverage(avg: number) {
  if (avg >= 80) return "Very Well Behaved";
  if (avg >= 75) return "Well Behaved";
  if (avg >= 70) return "Generally Well Behaved";
  if (avg >= 60) return "Respectful and Courteous";
  if (avg >= 45) return "Calm and Cooperative";
  return "Polite and Responsible";
}

function getAttitudeFromAverage(avg: number) {
  if (avg >= 80) return "Very Hardworking";
  if (avg >= 75) return "Hardworking";
  if (avg >= 70) return "Shows Good Effort";
  if (avg >= 60) return "Determined to Improve";
  if (avg >= 45) return "Participates Well";
  return "Attentive and Focused";
}

function getRemarkFromAverage(avg: number) {
  if (avg >= 80) return "Excellent performance. Keep it up.";
  if (avg >= 75) return "Very good work. Keep improving.";
  if (avg >= 70) return "Good effort. Keep it up.";
  if (avg >= 60) return "Good progress. Continue working hard.";
  if (avg >= 45) return "Shows steady improvement. Keep trying.";
  return "Shows promise and can achieve more with steady effort.";
}

function getInterestPriorityRank(interest: string) {
  const ranks: Record<string, number> = {
    Writing: 1,
    Reading: 2,
    Computing: 3,
    "Drawing / Art": 4,
    Singing: 5,
    "Sports (General)": 6,
    "Creative Activities": 7,
    Dancing: 8,
    Football: 9,
  };

  return ranks[interest] || 999;
}

function mapSubjectToInterest(subjectName: string | null | undefined) {
  const subject = cleanLower(subjectName);

  if (subject.includes("writing")) return "Writing";

  if (
    subject.includes("english") ||
    subject.includes("language") ||
    subject.includes("literacy") ||
    subject.includes("fanti") ||
    subject.includes("ghanaian language") ||
    subject.includes("rme") ||
    subject.includes("social studies") ||
    subject.includes("our world") ||
    subject.includes("social development")
  ) {
    return "Reading";
  }

  if (subject.includes("creative arts") || subject.includes("art")) {
    return "Drawing / Art";
  }

  if (subject.includes("computing")) {
    return "Computing";
  }

  if (subject.includes("physical development")) {
    return "Sports (General)";
  }

  if (subject.includes("rhymes") || subject.includes("songs")) {
    return "Singing";
  }

  if (subject.includes("mathematics") || subject.includes("numeracy")) {
    return "Computing";
  }

  if (subject.includes("science")) {
    return "Computing";
  }

  if (subject.includes("career technology")) {
    return "Creative Activities";
  }

  return "Reading";
}

function getNumericScore(score: ScoreRow) {
  const raw = score.total_score;

  if (raw === null || raw === undefined || raw === "") return null;

  const value = Number(raw);

  if (Number.isNaN(value)) return null;

  return value;
}

function getSuggestedInterestFromScores(studentScores: ScoreRow[]) {
  const numericScores = studentScores
    .map((item) => {
      const total = getNumericScore(item);

      return {
        subject: item.subject_name || "",
        total,
        interest: mapSubjectToInterest(item.subject_name),
      };
    })
    .filter((item) => item.total !== null) as {
    subject: string;
    total: number;
    interest: string;
  }[];

  if (numericScores.length === 0) {
    const first = studentScores[0];
    return first ? mapSubjectToInterest(first.subject_name) : "Reading";
  }

  numericScores.sort((a, b) => {
    if (b.total !== a.total) return b.total - a.total;
    return getInterestPriorityRank(a.interest) - getInterestPriorityRank(b.interest);
  });

  return numericScores[0].interest;
}

function buildInitialRow(
  student: StudentRow,
  savedRow: ReportCardRow | undefined,
  studentScores: ScoreRow[]
): EntryRow {
  const numericTotals = studentScores
    .map(getNumericScore)
    .filter((value): value is number => value !== null);

  const average =
    numericTotals.length > 0
      ? Number(
          (
            numericTotals.reduce((sum, value) => sum + value, 0) /
            numericTotals.length
          ).toFixed(1)
        )
      : "";

  const suggestedConduct =
    average === "" ? "Generally Well Behaved" : getConductFromAverage(average);

  const suggestedAttitude =
    average === "" ? "Shows Good Effort" : getAttitudeFromAverage(average);

  const suggestedRemark =
    average === "" ? "Shows promise and can achieve more with steady effort." : getRemarkFromAverage(average);

  const suggestedInterest = getSuggestedInterestFromScores(studentScores);

  return {
    studentId: getStudentReportId(student),
    averageScore: average,
    conduct: savedRow?.conduct || suggestedConduct,
    attitude: savedRow?.attitude || suggestedAttitude,
    interest: savedRow?.interest || suggestedInterest,
    teacherRemark: savedRow?.teacher_remark || suggestedRemark,
    promotedTo:
      savedRow?.promoted_to ||
      savedRow?.promotedTo ||
      savedRow?.promotion_to ||
      savedRow?.promoted_class ||
      savedRow?.next_class ||
      "",
    suggestionConduct: suggestedConduct,
    suggestionAttitude: suggestedAttitude,
    suggestionInterest: suggestedInterest,
    suggestionRemark: suggestedRemark,
    rowId: savedRow?.id || "",
  };
}

export default function ReportCardTeacherRemarksPage() {
  const [settings, setSettings] = useState<SettingsData>({
    academicYear: "",
    currentTerm: "",
  });

  const [teacher, setTeacher] = useState<TeacherRow | null>(null);
  const [classOptions, setClassOptions] = useState<string[]>([]);
  const [selectedClass, setSelectedClass] = useState("");

  const [students, setStudents] = useState<StudentRow[]>([]);
  const [entryData, setEntryData] = useState<Record<string, EntryRow>>({});

  const [loading, setLoading] = useState(true);
  const [loadingPage, setLoadingPage] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [assignmentError, setAssignmentError] = useState("");

  const classAverage = useMemo(() => {
    const values = Object.values(entryData)
      .map((row) => row.averageScore)
      .filter((value) => value !== "" && value !== null && value !== undefined)
      .map(Number);

    if (values.length === 0) return "";

    return Number(
      (values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(1)
    );
  }, [entryData]);

  const isPlayroomOne = isPlayroomOneClass(selectedClass);

  async function loadPage() {
    setLoading(true);
    setMessage("");
    setAssignmentError("");

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.user) {
      setAssignmentError("Please log in again.");
      setLoading(false);
      return;
    }

    const [teachersRes, settingsRes, classesRes] = await Promise.all([
      supabase.from("teachers").select("*"),
      supabase
        .from("school_settings")
        .select("current_academic_year,academic_year,current_term,updated_at")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("classes")
        .select("id,name,class_name,class_order")
        .order("class_order", { ascending: true }),
    ]);

    setSettings({
      academicYear: getAcademicYear(settingsRes.data),
      currentTerm: cleanText(settingsRes.data?.current_term),
    });

    if (teachersRes.error || !teachersRes.data || teachersRes.data.length === 0) {
      setAssignmentError("Teacher records could not be loaded.");
      setLoading(false);
      return;
    }

    const row =
      teachersRes.data.find((item: any) => item.auth_user_id === session.user.id) ||
      teachersRes.data.find(
        (item: any) => cleanLower(item.email) === cleanLower(session.user.email)
      ) ||
      null;

    if (!row) {
      setAssignmentError("Teacher account was not found.");
      setLoading(false);
      return;
    }

    const role = getRole(row);

    if (role === "owner" || role === "admin" || role === "headmaster" || role === "super_admin" || role === "superadmin") {
      setAssignmentError("This page is for teachers only.");
      setLoading(false);
      return;
    }

    setTeacher(row);

    try {
      const assignResponse = await authedFetch(
        `/api/teacher-assignments/get?teacher_id=${row.id}`
      );
      const assignData = await assignResponse.json();

      if (!assignResponse.ok || assignData.error) {
        setClassOptions([]);
        setSelectedClass("");
        setAssignmentError("Assigned classes could not be loaded.");
        setLoading(false);
        return;
      }

      const classIds = assignData.class_ids || [];
      const classNames: string[] = [];

      (classesRes.data || []).forEach((cls: ClassRow) => {
        const classId = cleanText(cls.id);
        const className = getClassName(cls);

        if (classIds.includes(classId) && className) {
          classNames.push(className);
        }
      });

      const uniqueClasses = Array.from(new Set(classNames));

      if (uniqueClasses.length === 0) {
        setClassOptions([]);
        setSelectedClass("");
        setAssignmentError("No assigned classes found.");
        setLoading(false);
        return;
      }

      setClassOptions(uniqueClasses);
      setSelectedClass((old) => old || uniqueClasses[0]);
    } catch {
      setClassOptions([]);
      setSelectedClass("");
      setAssignmentError("Assigned classes could not be loaded.");
    }

    setLoading(false);
  }

  async function loadClassRemarks(className: string) {
    if (!className || !settings.academicYear || !settings.currentTerm) {
      setStudents([]);
      setEntryData({});
      return;
    }

    setLoadingPage(true);
    setMessage("");

    const reportCardParams = new URLSearchParams({
      academic_year: settings.academicYear,
      term: settings.currentTerm,
      class_name: className,
    });

    const [studentsRes, reportResRaw, scoresResRaw] = await Promise.all([
      supabase
        .from("students")
        .select("id,student_id,jvs_id,full_name,first_name,last_name,class_name")
        .eq("class_name", className)
        .or("is_active.eq.true,active.eq.true")
        .or("left_school.is.null,left_school.eq.false")
        .order("full_name", { ascending: true }),
      authedFetch(`/api/report-card/cards?${reportCardParams.toString()}`),
      authedFetch(`/api/report-card/scores?${reportCardParams.toString()}`),
    ]);

    if (studentsRes.error) {
      setMessage(studentsRes.error.message);
      setStudents([]);
      setEntryData({});
      setLoadingPage(false);
      return;
    }

    const reportResData = await reportResRaw.json();
    if (!reportResRaw.ok) {
      setMessage(reportResData.error || "Failed to load remarks.");
      setStudents([]);
      setEntryData({});
      setLoadingPage(false);
      return;
    }

    const scoresResData = await scoresResRaw.json();
    if (!scoresResRaw.ok) {
      setMessage(scoresResData.error || "Failed to load scores.");
      setStudents([]);
      setEntryData({});
      setLoadingPage(false);
      return;
    }

    const studentList = studentsRes.data || [];
    const reportRows = reportResData.rows || [];
    const scores = scoresResData.rows || [];

    const initialData: Record<string, EntryRow> = {};

    studentList.forEach((student) => {
      const reportStudentId = getStudentReportId(student);
      const savedRow = reportRows.find(
        (row: any) => cleanText(row.student_id) === reportStudentId
      );
      const studentScores = scores.filter(
        (row: any) => cleanText(row.student_id) === reportStudentId
      );

      initialData[reportStudentId] = buildInitialRow(
        student,
        savedRow,
        studentScores
      );
    });

    setStudents(studentList);
    setEntryData(initialData);
    setLoadingPage(false);
  }

  useEffect(() => {
    loadPage();
  }, []);

  useEffect(() => {
    loadClassRemarks(selectedClass);
  }, [selectedClass, settings.academicYear, settings.currentTerm]);

  function handleFieldChange(studentId: string, field: keyof EntryRow, value: string) {
    setEntryData((prev) => ({
      ...prev,
      [studentId]: {
        ...prev[studentId],
        [field]: value,
      },
    }));
  }

  function applySuggestedValues() {
    setEntryData((prev) => {
      const next = { ...prev };

      Object.keys(next).forEach((studentId) => {
        next[studentId] = {
          ...next[studentId],
          conduct: next[studentId].suggestionConduct,
          attitude: next[studentId].suggestionAttitude,
          interest: next[studentId].suggestionInterest,
          teacherRemark: next[studentId].suggestionRemark,
        };
      });

      return next;
    });
  }

  async function saveAllRemarks() {
    if (!selectedClass) {
      setMessage("Please select class.");
      return;
    }

    if (!settings.academicYear || !settings.currentTerm) {
      setMessage("Academic year or current term is missing in JSMS settings.");
      return;
    }

    if (students.length === 0) {
      setMessage("No students found for this class.");
      return;
    }

    setSaving(true);
    setMessage("");

    const payload = students
      .map((student) => {
        const reportStudentId = getStudentReportId(student);
        const row = entryData[reportStudentId];

        if (!row) return null;

        if (isPlayroomOne) {
          if (!row.promotedTo) return null;

          return {
            student_id: reportStudentId,
            student_name: getStudentName(student),
            class_name: selectedClass,
            academic_year: settings.academicYear,
            term: settings.currentTerm,
            conduct: null,
            attitude: null,
            interest: null,
            interest_other: null,
            teacher_remark: null,
            teacher_remark_suggestion: null,
            promoted_to: row.promotedTo,
            average_score: row.averageScore === "" ? null : Number(row.averageScore),
            teacher_id: getTeacherCode(teacher),
            teacher_name: getTeacherName(teacher),
            source_system: "teacher",
            updated_at: new Date().toISOString(),
          };
        }

        if (!row.conduct || !row.attitude || !row.interest || !row.teacherRemark) {
          return null;
        }

        return {
          student_id: reportStudentId,
          student_name: getStudentName(student),
          class_name: selectedClass,
          academic_year: settings.academicYear,
          term: settings.currentTerm,
          conduct: row.conduct,
          attitude: row.attitude,
          interest: row.interest,
          interest_other: null,
          teacher_remark: row.teacherRemark,
          teacher_remark_suggestion: row.suggestionRemark,
          promoted_to: null,
          average_score: row.averageScore === "" ? null : Number(row.averageScore),
          teacher_id: getTeacherCode(teacher),
          teacher_name: getTeacherName(teacher),
          source_system: "teacher",
          updated_at: new Date().toISOString(),
        };
      })
      .filter(Boolean);

    try {
      const response = await authedFetch("/api/report-card/save-remarks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: payload }),
      });
      const data = await response.json();

      if (!response.ok || data.error) {
        throw new Error(data.error || "Failed to save remarks.");
      }

      setMessage("Remarks saved successfully.");
      await loadClassRemarks(selectedClass);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to save remarks.");
    }

    setSaving(false);
  }

  if (loading) {
    return (
      <div className="rounded-[28px] bg-white p-5 shadow-sm">
        <p className="text-sm text-gray-500">Loading remarks page...</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="rounded-[28px] bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-extrabold text-gray-900">Remarks</h1>
            <p className="mt-2 text-sm text-gray-500">
              {selectedClass || "Class"} • {settings.currentTerm || "Current Term"} •{" "}
              {settings.academicYear || "Academic Year"}
            </p>
          </div>

          <button
            type="button"
            onClick={loadPage}
            className="flex items-center justify-center gap-2 rounded-2xl bg-sky-50 px-4 py-3 text-sm font-bold text-sky-700 hover:bg-sky-100"
          >
            <FiRefreshCw size={16} />
            Refresh
          </button>
        </div>
      </div>

      <div className="rounded-[28px] bg-white p-5 shadow-sm space-y-4">
        {assignmentError && (
          <div className="rounded-2xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-700">
            {assignmentError}
          </div>
        )}

        <div>
          <label className="mb-2 block text-sm font-semibold text-gray-700">
            Class
          </label>
          <select
            value={selectedClass}
            onChange={(e) => setSelectedClass(e.target.value)}
            className="w-full rounded-2xl border border-gray-300 px-4 py-3 outline-none focus:border-sky-500"
          >
            {classOptions.length === 0 ? (
              <option value="">No assigned classes found</option>
            ) : (
              classOptions.map((className) => (
                <option key={className} value={className}>
                  {className}
                </option>
              ))
            )}
          </select>
        </div>

        {!isPlayroomOne && (
          <button
            type="button"
            onClick={applySuggestedValues}
            className="w-full rounded-2xl bg-gray-100 px-4 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-200"
          >
            Reset All Rows To Suggested Values
          </button>
        )}
      </div>

      <div className="rounded-[28px] bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-gray-900">
              Class Remarks Sheet
            </h2>
            <p className="text-sm text-gray-500">
              {isPlayroomOne
                ? "Select only the promoted class for each Playroom 1 student."
                : "Fill one row per student."}
            </p>
          </div>

          {!isPlayroomOne && (
            <div className="rounded-2xl bg-sky-50 px-4 py-3 text-sm font-semibold text-sky-700">
              Class Average: {classAverage === "" ? "-" : classAverage}
            </div>
          )}
        </div>

        {message && (
          <div className="mb-4 rounded-2xl bg-sky-50 px-4 py-3 text-sm font-semibold text-sky-700">
            {message}
          </div>
        )}

        {loadingPage ? (
          <div className="rounded-2xl border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500">
            Loading class remarks...
          </div>
        ) : students.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500">
            No students found for this class.
          </div>
        ) : (
          <div className="space-y-4">
            {students.map((student) => {
              const reportStudentId = getStudentReportId(student);
              const row = entryData[reportStudentId];

              if (!row) return null;

              return (
                <div
                  key={student.id}
                  className="rounded-3xl border border-gray-200 p-4"
                >
                  <div className="mb-4">
                    <h3 className="text-base font-bold text-gray-900">
                      {getStudentName(student)}
                    </h3>
                    <p className="text-xs text-gray-500">{reportStudentId}</p>
                  </div>

                  {isPlayroomOne ? (
                    <div className="max-w-xl">
                      <label className="mb-2 block text-sm font-semibold text-gray-700">
                        Promoted To
                      </label>
                      <select
                        value={row.promotedTo || ""}
                        onChange={(e) =>
                          handleFieldChange(
                            reportStudentId,
                            "promotedTo",
                            e.target.value
                          )
                        }
                        className="w-full rounded-2xl border border-gray-300 px-4 py-3 outline-none focus:border-sky-500"
                      >
                        <option value="">Select Promoted To</option>
                        {PROMOTED_TO_OPTIONS.map((item) => (
                          <option key={item} value={item}>
                            {item}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-3">
                        <div className="w-44">
                          <label className="mb-2 block text-sm font-semibold text-gray-700">
                            Average Score
                          </label>
                          <input
                            type="text"
                            readOnly
                            value={row.averageScore ?? ""}
                            className="w-full rounded-2xl border border-gray-200 bg-gray-100 px-4 py-3 text-gray-700 outline-none"
                          />
                        </div>

                        <div className="w-56">
                          <label className="mb-2 block text-sm font-semibold text-gray-700">
                            Conduct
                          </label>
                          <select
                            value={row.conduct || ""}
                            onChange={(e) =>
                              handleFieldChange(
                                reportStudentId,
                                "conduct",
                                e.target.value
                              )
                            }
                            className="w-full rounded-2xl border border-gray-300 px-4 py-3 outline-none focus:border-sky-500"
                          >
                            <option value="">Select Conduct</option>
                            {CONDUCT_OPTIONS.map((item) => (
                              <option key={item} value={item}>
                                {item}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="w-52">
                          <label className="mb-2 block text-sm font-semibold text-gray-700">
                            Attitude
                          </label>
                          <select
                            value={row.attitude || ""}
                            onChange={(e) =>
                              handleFieldChange(
                                reportStudentId,
                                "attitude",
                                e.target.value
                              )
                            }
                            className="w-full rounded-2xl border border-gray-300 px-4 py-3 outline-none focus:border-sky-500"
                          >
                            <option value="">Select Attitude</option>
                            {ATTITUDE_OPTIONS.map((item) => (
                              <option key={item} value={item}>
                                {item}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="w-52">
                          <label className="mb-2 block text-sm font-semibold text-gray-700">
                            Interest
                          </label>
                          <select
                            value={row.interest || ""}
                            onChange={(e) =>
                              handleFieldChange(
                                reportStudentId,
                                "interest",
                                e.target.value
                              )
                            }
                            className="w-full rounded-2xl border border-gray-300 px-4 py-3 outline-none focus:border-sky-500"
                          >
                            <option value="">Select Interest</option>
                            {INTEREST_OPTIONS.map((item) => (
                              <option key={item} value={item}>
                                {item}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="w-[320px]">
                          <label className="mb-2 block text-sm font-semibold text-gray-700">
                            Class Teacher&apos;s Remark
                          </label>
                          <select
                            value={row.teacherRemark || ""}
                            onChange={(e) =>
                              handleFieldChange(
                                reportStudentId,
                                "teacherRemark",
                                e.target.value
                              )
                            }
                            className="w-full rounded-2xl border border-gray-300 px-4 py-3 outline-none focus:border-sky-500"
                          >
                            <option value="">Select Remark</option>
                            {REMARK_OPTIONS.map((item) => (
                              <option key={item} value={item}>
                                {item}
                              </option>
                            ))}
                          </select>
                        </div>
                    </div>
                  )}
                </div>
              );
            })}

            <button
              type="button"
              onClick={saveAllRemarks}
              disabled={saving}
              className="w-full rounded-2xl bg-sky-500 px-4 py-4 text-sm font-bold text-white hover:bg-sky-600 disabled:opacity-60"
            >
              {saving ? "Saving..." : isPlayroomOne ? "Save Promotions" : "Save All Remarks"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
