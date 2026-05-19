"use client";

import { useEffect, useMemo, useState } from "react";
import { FiRefreshCw, FiX } from "react-icons/fi";
import { supabase } from "@/lib/supabase";

type TeacherRow = Record<string, any>;

type SubjectRow = {
  id: string;
  name?: string | null;
  subject_name?: string | null;
  subject_order?: number | null;
  is_active?: boolean | null;
};

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
  student_id: string;
  student_name: string;
  class_name: string;
  playroom_mark: string;
  cat1: string;
  cat2: string;
  cat3: string;
  homework: string;
  exercise: string;
  project_work: string;
  exam_raw: string;
  class_work_100: string;
  class_work_50: string;
  exam_50: string;
  total_score: string;
  position: string;
  grade: string;
  remark: string;
};

type Settings = {
  academic_year: string;
  current_term: string;
};

function getRole(row: TeacherRow | null) {
  const raw = String(row?.role || "").trim().toLowerCase();
  if (raw === "owner" || raw === "admin" || raw === "headmaster") return raw;
  return "teacher";
}

function getTeacherName(row: TeacherRow | null) {
  return String(
    row?.full_name || row?.name || row?.teacher_name || row?.username || "Teacher"
  ).trim();
}

function getTeacherCode(row: TeacherRow | null) {
  return String(row?.teacher_id || row?.id || "").trim();
}

function getClassName(row: ClassRow) {
  return String(row.class_name || row.name || "").trim();
}

function getSubjectName(row: SubjectRow | any) {
  return String(row?.subject_name || row?.name || "").trim();
}

function getStudentName(student: StudentRow) {
  return (
    student.full_name ||
    `${student.first_name || ""} ${student.last_name || ""}`.trim() ||
    "Unnamed Student"
  );
}

function getStudentId(student: StudentRow) {
  return student.student_id || student.jvs_id || "";
}

function isPlayroomClass(className: string) {
  const value = String(className || "").trim().toLowerCase();
  return value === "playroom 1" || value === "playroom 2";
}

function getPlayroomRemark(mark: string) {
  if (mark === "A") return "Excellent";
  if (mark === "B") return "Very Good";
  if (mark === "C") return "Good";
  if (mark === "D") return "Developing";
  return "";
}

function cleanMark(value: string, max?: number) {
  const cleaned = value.replace(/[^0-9.]/g, "");

  if (cleaned === "") return "";

  const numberValue = Number(cleaned);

  if (Number.isNaN(numberValue)) return "";
  if (numberValue < 0) return "0";
  if (max && numberValue > max) return String(max);

  return cleaned;
}

function uniqueList(list: string[]) {
  return Array.from(new Set(list.map((item) => item.trim()).filter(Boolean)));
}

function getClassWork100(row: ScoreRow) {
  return (
    Number(row.cat1 || 0) +
    Number(row.cat2 || 0) +
    Number(row.cat3 || 0) +
    Number(row.homework || 0) +
    Number(row.exercise || 0) +
    Number(row.project_work || 0)
  );
}

function getExam50(row: ScoreRow) {
  return Number(row.exam_raw || 0) / 2;
}

function formatNumber(value: number) {
  if (!value) return "";
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function getGrade(total: number) {
  if (total >= 80) return "1";
  if (total >= 70) return "2";
  if (total >= 60) return "3";
  if (total >= 55) return "4";
  if (total >= 50) return "5";
  if (total >= 45) return "6";
  if (total >= 40) return "7";
  if (total >= 35) return "8";
  return "9";
}

function getRemark(total: number) {
  if (total >= 80) return "Excellent";
  if (total >= 70) return "Very Good";
  if (total >= 60) return "Good";
  if (total >= 55) return "Credit";
  if (total >= 50) return "Satisfactory";
  if (total >= 45) return "Needs Improvement";
  if (total >= 40) return "Weak";
  return "Poor";
}

function recalcRow(row: ScoreRow): ScoreRow {
  if (isPlayroomClass(row.class_name)) {
    return {
      ...row,
      class_work_100: "",
      class_work_50: "",
      exam_50: "",
      total_score: "",
      position: "",
      grade: row.playroom_mark || "",
      remark: getPlayroomRemark(row.playroom_mark),
    };
  }

  const classWork100 = getClassWork100(row);
  const classWork50 = classWork100 / 2;
  const exam50 = getExam50(row);
  const finalTotal = classWork50 + exam50;

  return {
    ...row,
    class_work_100: formatNumber(classWork100),
    class_work_50: formatNumber(classWork50),
    exam_50: formatNumber(exam50),
    total_score: formatNumber(finalTotal),
    grade: finalTotal > 0 ? getGrade(finalTotal) : "",
    remark: finalTotal > 0 ? getRemark(finalTotal) : "",
  };
}

function applyPositions(rows: ScoreRow[]) {
  const scoredRows = rows
    .map((row, index) => ({
      index,
      total: Number(row.total_score || 0),
    }))
    .sort((a, b) => b.total - a.total);

  const positions = new Map<number, string>();
  let lastScore: number | null = null;
  let lastPosition = 0;

  scoredRows.forEach((item, index) => {
    if (item.total <= 0) {
      positions.set(item.index, "");
      return;
    }

    if (lastScore === null || item.total !== lastScore) {
      lastPosition = index + 1;
      lastScore = item.total;
    }

    positions.set(item.index, String(lastPosition));
  });

  return rows.map((row, index) => ({
    ...row,
    position: positions.get(index) || "",
  }));
}

export default function UploadResultsPage() {
  const [settings, setSettings] = useState<Settings>({
    academic_year: "",
    current_term: "",
  });

  const [teacher, setTeacher] = useState<TeacherRow | null>(null);
  const [classOptions, setClassOptions] = useState<string[]>([]);
  const [subjectOptions, setSubjectOptions] = useState<string[]>([]);

  const [selectedClass, setSelectedClass] = useState("");
  const [selectedSubject, setSelectedSubject] = useState("");

  const [rows, setRows] = useState<ScoreRow[]>([]);

  const [pickerOpen, setPickerOpen] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [assignmentError, setAssignmentError] = useState("");

  const availableSubjects = useMemo(() => {
    return uniqueList(subjectOptions);
  }, [subjectOptions]);

  const isPlayroom = isPlayroomClass(selectedClass);

  async function loadTeacherSubjects(teacherId: string, className: string) {
    setSubjectOptions([]);
    setSelectedSubject("");

    if (!teacherId || !className) {
      setAssignmentError("Please select class first.");
      return;
    }

    const { data: classRow } = await supabase
      .from("classes")
      .select("id,name,class_name")
      .or(`name.eq.${className},class_name.eq.${className}`)
      .maybeSingle();

    const classId = classRow?.id || "";

    if (!classId) {
      setAssignmentError("Selected class was not found.");
      return;
    }

    const { data: teacherSubjectRows, error: teacherSubjectError } = await supabase
      .from("teacher_subjects")
      .select("teacher_id,class_id,subject_id")
      .eq("teacher_id", teacherId)
      .eq("class_id", classId);

    if (teacherSubjectError) {
      setAssignmentError("Assigned subjects could not be loaded.");
      return;
    }

    const subjectIds = uniqueList(
      (teacherSubjectRows || [])
        .map((row: any) => String(row.subject_id || ""))
        .filter(Boolean)
    );

    if (subjectIds.length === 0) {
      setAssignmentError("No subjects assigned to this teacher for the selected class.");
      return;
    }

    const { data: subjects, error: subjectsError } = await supabase
      .from("subjects")
      .select("id,name,subject_name,subject_order,is_active")
      .in("id", subjectIds)
      .eq("is_active", true)
      .order("subject_order", { ascending: true })
      .order("name", { ascending: true });

    if (subjectsError) {
      setAssignmentError("Assigned subjects could not be loaded.");
      return;
    }

    const names = uniqueList((subjects || []).map(getSubjectName).filter(Boolean));

    if (names.length === 0) {
      setAssignmentError("No assigned subjects found.");
      return;
    }

    setAssignmentError("");
    setSubjectOptions(names);
    setSelectedSubject(names[0] || "");
  }

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
        .select("academic_year,current_term")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("classes")
        .select("id,name,class_name,class_order")
        .order("class_order", { ascending: true }),
    ]);

    setSettings({
      academic_year: settingsRes.data?.academic_year || "",
      current_term: settingsRes.data?.current_term || "",
    });

    if (teachersRes.error || !teachersRes.data || teachersRes.data.length === 0) {
      setAssignmentError("Teacher records could not be loaded.");
      setLoading(false);
      return;
    }

    const row =
      teachersRes.data.find((item: any) => item.auth_user_id === session.user.id) ||
      teachersRes.data.find(
        (item: any) =>
          String(item.email || "").trim().toLowerCase() ===
          String(session.user.email || "").trim().toLowerCase()
      ) ||
      null;

    if (!row) {
      setAssignmentError("Teacher account was not found.");
      setLoading(false);
      return;
    }

    const role = getRole(row);

    if (role === "owner" || role === "admin" || role === "headmaster") {
      setAssignmentError("This page is for teachers only.");
      setLoading(false);
      return;
    }

    setTeacher(row);

    try {
      const assignResponse = await fetch(
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
        const classId = String(cls.id || "").trim();
        const className = getClassName(cls);

        if (classIds.includes(classId) && className) {
          classNames.push(className);
        }
      });

      const uniqueClasses = uniqueList(classNames);

      if (uniqueClasses.length === 0) {
        setClassOptions([]);
        setSelectedClass("");
        setAssignmentError("No assigned classes found.");
        setLoading(false);
        return;
      }

      setClassOptions(uniqueClasses);
      setSelectedClass(uniqueClasses[0]);

      await loadTeacherSubjects(row.id, uniqueClasses[0]);
    } catch {
      setClassOptions([]);
      setSelectedClass("");
      setAssignmentError("Assigned classes could not be loaded.");
    }

    setLoading(false);
  }

  async function loadStudentsAndScores(className: string, subjectName: string) {
    if (!className || !subjectName || !settings.academic_year || !settings.current_term) {
      setRows([]);
      return;
    }

    setLoadingStudents(true);
    setMessage("");

    const { data: studentData, error: studentError } = await supabase
      .from("students")
      .select("id,student_id,jvs_id,full_name,first_name,last_name,class_name")
      .eq("class_name", className)
      .or("is_active.eq.true,active.eq.true")
      .or("left_school.is.null,left_school.eq.false")
      .order("full_name", { ascending: true });

    if (studentError) {
      setMessage(studentError.message);
      setRows([]);
      setLoadingStudents(false);
      return;
    }

    const { data: existingScores } = await supabase
      .from("jsms_report_scores")
      .select("*")
      .eq("class_name", className)
      .eq("subject_name", subjectName)
      .eq("academic_year", settings.academic_year)
      .eq("term", settings.current_term);

    const existingMap = new Map(
      (existingScores || []).map((score: any) => [score.student_id, score])
    );

    const newRows: ScoreRow[] = (studentData || [])
      .map((student) => {
        const studentId = getStudentId(student);
        const existing: any = existingMap.get(studentId);

        const row: ScoreRow = {
          student_id: studentId,
          student_name: getStudentName(student),
          class_name: student.class_name || className,
          playroom_mark: existing?.playroom_mark?.toString() || existing?.grade?.toString() || "",
          cat1: existing?.cat1?.toString() || "",
          cat2: existing?.cat2?.toString() || "",
          cat3: existing?.cat3?.toString() || "",
          homework: existing?.homework?.toString() || "",
          exercise: existing?.exercise?.toString() || "",
          project_work: existing?.project_work?.toString() || "",
          exam_raw: existing?.exam_raw?.toString() || existing?.exam_score?.toString() || "",
          class_work_100: existing?.class_work_100?.toString() || "",
          class_work_50: existing?.class_score?.toString() || "",
          exam_50: existing?.exam_50?.toString() || "",
          total_score: existing?.total_score?.toString() || "",
          position: existing?.position?.toString() || "",
          grade: existing?.grade || "",
          remark: existing?.remark || "",
        };

        return recalcRow(row);
      })
      .filter((row) => row.student_id);

    setRows(applyPositions(newRows));
    setLoadingStudents(false);
  }

  useEffect(() => {
    loadPage();
  }, []);


  useEffect(() => {
    if (!teacher?.id || !selectedClass) return;
    loadTeacherSubjects(teacher.id, selectedClass);
  }, [teacher?.id, selectedClass]);

  useEffect(() => {
    if (!availableSubjects.includes(selectedSubject)) {
      setSelectedSubject(availableSubjects[0] || "");
    }
  }, [availableSubjects, selectedSubject]);

  useEffect(() => {
    loadStudentsAndScores(selectedClass, selectedSubject);
  }, [
    selectedClass,
    selectedSubject,
    settings.academic_year,
    settings.current_term,
  ]);

  function updateRow(index: number, field: keyof ScoreRow, value: string) {
    const maxMap: Partial<Record<keyof ScoreRow, number>> = {
      cat1: 20,
      cat2: 20,
      cat3: 20,
      homework: 15,
      exercise: 15,
      project_work: 10,
      exam_raw: 100,
    };

    const nextValue = field === "playroom_mark" ? value : cleanMark(value, maxMap[field]);

    setRows((prev) => {
      const copy = [...prev];
      copy[index] = recalcRow({
        ...copy[index],
        [field]: nextValue,
      });

      return isPlayroomClass(copy[index].class_name) ? copy : applyPositions(copy);
    });
  }

  async function saveResults() {
    if (!selectedClass || !selectedSubject) {
      setMessage("Please select class and subject.");
      return;
    }

    if (!settings.academic_year || !settings.current_term) {
      setMessage("Academic year or current term is missing in JSMS settings.");
      return;
    }

    setSaving(true);
    setMessage("");

    const positionedRows = applyPositions(rows);

    const payload = positionedRows.map((row) => {
      const classWork100 = getClassWork100(row);
      const classWork50 = classWork100 / 2;
      const examRaw = Number(row.exam_raw || 0);
      const exam50 = examRaw / 2;
      const finalTotal = classWork50 + exam50;

      return {
        student_id: row.student_id,
        student_name: row.student_name,
        class_name: row.class_name,
        academic_year: settings.academic_year,
        term: settings.current_term,
        subject_name: selectedSubject,

        playroom_mark: isPlayroomClass(row.class_name) ? row.playroom_mark || null : null,

        cat1: isPlayroomClass(row.class_name) || row.cat1 === "" ? null : Number(row.cat1),
        cat2: isPlayroomClass(row.class_name) || row.cat2 === "" ? null : Number(row.cat2),
        cat3: isPlayroomClass(row.class_name) || row.cat3 === "" ? null : Number(row.cat3),
        homework: isPlayroomClass(row.class_name) || row.homework === "" ? null : Number(row.homework),
        exercise: isPlayroomClass(row.class_name) || row.exercise === "" ? null : Number(row.exercise),
        project_work: isPlayroomClass(row.class_name) || row.project_work === "" ? null : Number(row.project_work),

        class_work_100: isPlayroomClass(row.class_name) ? null : classWork100,
        class_score: isPlayroomClass(row.class_name) ? null : classWork50,

        exam_raw: isPlayroomClass(row.class_name) || row.exam_raw === "" ? null : examRaw,
        exam_50: isPlayroomClass(row.class_name) ? null : exam50,
        exam_score: isPlayroomClass(row.class_name) ? null : examRaw,

        total_score: isPlayroomClass(row.class_name) ? null : finalTotal,
        position: isPlayroomClass(row.class_name) || row.position === "" ? null : Number(row.position),
        grade: isPlayroomClass(row.class_name) ? row.playroom_mark || "" : finalTotal > 0 ? getGrade(finalTotal) : "",
        remark: isPlayroomClass(row.class_name) ? getPlayroomRemark(row.playroom_mark) : finalTotal > 0 ? getRemark(finalTotal) : "",

        teacher_id: getTeacherCode(teacher),
        teacher_name: getTeacherName(teacher),

        source_system: "jsms_live",
        is_locked: false,
        migrated_at: new Date().toISOString(),
      };
    });

    const { error } = await supabase
      .from("jsms_report_scores")
      .upsert(payload, {
        onConflict: "student_id,academic_year,term,subject_name",
      });

    if (error) {
      setMessage(error.message);
    } else {
      setRows(positionedRows);
      setMessage("Results saved successfully.");
      setPickerOpen(false);
      await loadStudentsAndScores(selectedClass, selectedSubject);
    }

    setSaving(false);
  }

  if (loading) {
    return (
      <div className="rounded-[28px] bg-white p-5 shadow-sm">
        <p className="text-sm text-gray-500">Loading...</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {pickerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-[28px] bg-white p-5 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-extrabold text-gray-900">
                  Choose Class & Subject
                </h2>
                <p className="mt-1 text-sm text-gray-500">
                  Select the class and subject.
                </p>
              </div>

              <button
                onClick={() => setPickerOpen(false)}
                className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gray-100 text-gray-600"
              >
                <FiX size={20} />
              </button>
            </div>

            {assignmentError && (
              <div className="mb-4 rounded-2xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-700">
                {assignmentError}
                <button
                  type="button"
                  onClick={loadPage}
                  className="mt-3 flex items-center gap-2 rounded-xl bg-amber-100 px-3 py-2 text-xs font-bold text-amber-800"
                >
                  <FiRefreshCw size={14} />
                  Check Again
                </button>
              </div>
            )}

            <div className="space-y-4">
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

              <div>
                <label className="mb-2 block text-sm font-semibold text-gray-700">
                  Subject
                </label>
                <select
                  value={selectedSubject}
                  onChange={(e) => setSelectedSubject(e.target.value)}
                  className="w-full rounded-2xl border border-gray-300 px-4 py-3 outline-none focus:border-sky-500"
                >
                  {availableSubjects.length === 0 ? (
                    <option value="">No assigned subjects found</option>
                  ) : (
                    availableSubjects.map((subject) => (
                      <option key={subject} value={subject}>
                        {subject}
                      </option>
                    ))
                  )}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <span className="rounded-2xl bg-sky-50 px-3 py-3 text-xs font-bold text-sky-700">
                  {settings.academic_year || "Academic Year"}
                </span>

                <span className="rounded-2xl bg-emerald-50 px-3 py-3 text-xs font-bold text-emerald-700">
                  {settings.current_term || "Current Term"}
                </span>
              </div>

              <button
                onClick={() => setPickerOpen(false)}
                disabled={!selectedClass || !selectedSubject}
                className="w-full rounded-2xl bg-sky-500 px-4 py-4 text-sm font-bold text-white hover:bg-sky-600 disabled:opacity-50"
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="rounded-[28px] bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-extrabold text-gray-900">
              Upload Results
            </h1>
            <p className="mt-2 text-sm text-gray-500">
              {selectedClass || "Class"} • {selectedSubject || "Subject"} •{" "}
              {settings.current_term || "Current Term"}
            </p>
          </div>

          <button
            onClick={() => setPickerOpen(true)}
            className="rounded-2xl bg-sky-50 px-4 py-3 text-sm font-bold text-sky-700 hover:bg-sky-100"
          >
            Change Class / Subject
          </button>
        </div>
      </div>

      <div className="rounded-[28px] bg-white p-5 shadow-sm">
        {message && (
          <div className="mb-4 rounded-2xl bg-sky-50 px-4 py-3 text-sm font-semibold text-sky-700">
            {message}
          </div>
        )}

        {loadingStudents ? (
          <p className="text-sm text-gray-500">Loading students...</p>
        ) : rows.length === 0 ? (
          <div className="rounded-2xl bg-amber-50 px-4 py-4 text-sm font-semibold text-amber-700">
            No students found, or no subject selected.
          </div>
        ) : (
          <>
            {isPlayroom ? (
              <div className="space-y-3">
                {rows.map((row, index) => (
                  <div
                    key={row.student_id}
                    className="rounded-2xl border border-gray-200 bg-white p-4"
                  >
                    <div className="mb-3">
                      <p className="font-bold text-gray-900">{row.student_name}</p>
                      <p className="text-xs font-medium text-gray-400">
                        {row.student_id}
                      </p>
                    </div>

                    <div className="grid grid-cols-4 gap-2">
                      {["A", "B", "C", "D"].map((mark) => {
                        const active = row.playroom_mark === mark;

                        return (
                          <button
                            key={mark}
                            type="button"
                            onClick={() => updateRow(index, "playroom_mark", mark)}
                            className={`rounded-2xl px-4 py-4 text-lg font-black transition ${
                              active
                                ? "bg-sky-500 text-white shadow-md"
                                : "bg-sky-50 text-sky-700 hover:bg-sky-100"
                            }`}
                          >
                            {mark}
                          </button>
                        );
                      })}
                    </div>

                    <div className="mt-3 rounded-2xl bg-gray-50 px-4 py-3 text-sm font-semibold text-gray-600">
                      Selected:{" "}
                      <span className="font-black text-gray-900">
                        {row.playroom_mark || "-"}
                      </span>
                      {row.remark ? ` • ${row.remark}` : ""}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1320px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500">
                      <th className="px-3 py-3">Student</th>
                      <th className="px-3 py-3">CAT 1 /20</th>
                      <th className="px-3 py-3">CAT 2 /20</th>
                      <th className="px-3 py-3">CAT 3 /20</th>
                      <th className="px-3 py-3">Homework /15</th>
                      <th className="px-3 py-3">Exercise /15</th>
                      <th className="px-3 py-3">Project /10</th>
                      <th className="px-3 py-3">Class /100</th>
                      <th className="px-3 py-3">Class 50%</th>
                      <th className="px-3 py-3">Exam /100</th>
                      <th className="px-3 py-3">Exam 50%</th>
                      <th className="px-3 py-3">Total</th>
                      <th className="px-3 py-3">Position</th>
                      <th className="px-3 py-3">Grade</th>
                      <th className="px-3 py-3">Remark</th>
                    </tr>
                  </thead>

                  <tbody>
                    {rows.map((row, index) => (
                      <tr key={row.student_id} className="border-b border-gray-100">
                        <td className="px-3 py-3 font-bold text-gray-900">
                          {row.student_name}
                          <p className="text-xs font-medium text-gray-400">
                            {row.student_id}
                          </p>
                        </td>

                        <td className="px-3 py-3">
                          <input value={row.cat1} onChange={(e) => updateRow(index, "cat1", e.target.value)} className="w-20 rounded-xl border border-gray-300 px-3 py-2 outline-none focus:border-sky-500" />
                        </td>

                        <td className="px-3 py-3">
                          <input value={row.cat2} onChange={(e) => updateRow(index, "cat2", e.target.value)} className="w-20 rounded-xl border border-gray-300 px-3 py-2 outline-none focus:border-sky-500" />
                        </td>

                        <td className="px-3 py-3">
                          <input value={row.cat3} onChange={(e) => updateRow(index, "cat3", e.target.value)} className="w-20 rounded-xl border border-gray-300 px-3 py-2 outline-none focus:border-sky-500" />
                        </td>

                        <td className="px-3 py-3">
                          <input value={row.homework} onChange={(e) => updateRow(index, "homework", e.target.value)} className="w-20 rounded-xl border border-gray-300 px-3 py-2 outline-none focus:border-sky-500" />
                        </td>

                        <td className="px-3 py-3">
                          <input value={row.exercise} onChange={(e) => updateRow(index, "exercise", e.target.value)} className="w-20 rounded-xl border border-gray-300 px-3 py-2 outline-none focus:border-sky-500" />
                        </td>

                        <td className="px-3 py-3">
                          <input value={row.project_work} onChange={(e) => updateRow(index, "project_work", e.target.value)} className="w-20 rounded-xl border border-gray-300 px-3 py-2 outline-none focus:border-sky-500" />
                        </td>

                        <td className="px-3 py-3 font-extrabold text-gray-900">{row.class_work_100 || "0"}</td>
                        <td className="px-3 py-3 font-extrabold text-sky-600">{row.class_work_50 || "0"}</td>

                        <td className="px-3 py-3">
                          <input value={row.exam_raw} onChange={(e) => updateRow(index, "exam_raw", e.target.value)} className="w-20 rounded-xl border border-gray-300 px-3 py-2 outline-none focus:border-sky-500" />
                        </td>

                        <td className="px-3 py-3 font-extrabold text-emerald-600">{row.exam_50 || "0"}</td>
                        <td className="px-3 py-3 font-extrabold text-gray-900">{row.total_score || "0"}</td>
                        <td className="px-3 py-3 font-extrabold text-purple-600">{row.position || "-"}</td>
                        <td className="px-3 py-3 font-extrabold text-sky-600">{row.grade || "-"}</td>
                        <td className="px-3 py-3 text-gray-600">{row.remark || "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <button
              onClick={saveResults}
              disabled={saving}
              className="mt-5 w-full rounded-2xl bg-sky-500 px-4 py-4 text-sm font-bold text-white hover:bg-sky-600 disabled:opacity-60"
            >
              {saving ? "Saving Results..." : "Save Results"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
