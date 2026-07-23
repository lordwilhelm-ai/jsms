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

type AttendanceEntry = {
  daysPresent: string;
  feedingPresent: number;
  source: "saved" | "feeding" | "manual";
};

type SchoolSettings = {
  academicYear: string;
  currentTerm: string;
  termBegins: string;
  termEnds: string;
};

function cleanText(value: any) {
  return String(value || "").trim();
}

function cleanLower(value: any) {
  return cleanText(value).toLowerCase();
}

function getRole(row: TeacherRow | null) {
  const raw = cleanLower(row?.role);
  if (raw === "owner" || raw === "admin" || raw === "headmaster") return raw;
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
    student.full_name ||
    `${student.first_name || ""} ${student.last_name || ""}`.trim() ||
    "Unnamed Student"
  );
}

function getStudentId(student: StudentRow) {
  return student.student_id || student.jvs_id || "";
}

function toDateText(value: any) {
  if (!value) return "";

  const raw = String(value).trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return "";

  return date.toISOString().slice(0, 10);
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

function isWeekend(dateText: string) {
  const date = new Date(`${dateText}T00:00:00`);
  const day = date.getDay();

  return day === 0 || day === 6;
}

function calculateSchoolDays(startDate: string, endDate: string, holidayDates: string[]) {
  const holidaySet = new Set(holidayDates.map(toDateText).filter(Boolean));

  return eachDateInclusive(startDate, endDate).filter((date) => {
    if (isWeekend(date)) return false;
    if (holidaySet.has(date)) return false;
    return true;
  }).length;
}

function getDateRangeLabel(startDate: string, endDate: string) {
  if (!startDate || !endDate) return "Term dates not set";
  return `${startDate} to ${endDate}`;
}

async function loadSchoolSettings(): Promise<SchoolSettings> {
  const { data, error } = await supabase
    .from("school_settings")
    .select("current_academic_year,current_term,academic_year,term_begins,term_ends")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    return {
      academicYear: "",
      currentTerm: "",
      termBegins: "",
      termEnds: "",
    };
  }

  return {
    academicYear: cleanText(data.current_academic_year || data.academic_year),
    currentTerm: cleanText(data.current_term),
    termBegins: toDateText(data.term_begins),
    termEnds: toDateText(data.term_ends),
  };
}

async function loadHolidayDates(startDate: string, endDate: string) {
  if (!startDate || !endDate) return [];

  const holidayTables = [
    "ghana_public_holidays",
    "school_closures",
    "feeding_holidays",
    "school_holidays",
    "holidays",
  ];

  const results: string[] = [];

  for (const tableName of holidayTables) {
    const { data, error } = await supabase.from(tableName).select("*").limit(1000);

    if (error || !data) continue;

    (data || []).forEach((row: any) => {
      const single =
        toDateText(row.date) ||
        toDateText(row.holiday_date) ||
        toDateText(row.day) ||
        "";

      const rangeStart = toDateText(row.start_date);
      const rangeEnd = toDateText(row.end_date);

      if (single && single >= startDate && single <= endDate) {
        results.push(single);
      }

      if (rangeStart && rangeEnd) {
        eachDateInclusive(rangeStart, rangeEnd).forEach((date) => {
          if (date >= startDate && date <= endDate) results.push(date);
        });
      }
    });
  }

  return Array.from(new Set(results));
}

function buildStudentLookup(students: StudentRow[]) {
  const lookup = new Map<string, string>();

  students.forEach((student) => {
    const finalStudentId = getStudentId(student);
    if (!finalStudentId) return;

    [student.id, student.student_id, student.jvs_id].forEach((value) => {
      if (value) {
        lookup.set(String(value).trim(), finalStudentId);
      }
    });
  });

  return lookup;
}

async function countPresentFromFeedingTable(
  tableName: string,
  className: string,
  startDate: string,
  endDate: string,
  students: StudentRow[]
) {
  const lookup = buildStudentLookup(students);
  const keys = Array.from(lookup.keys());

  if (!className || !startDate || !endDate || keys.length === 0) {
    return new Map<string, number>();
  }

  const { data, error } = await supabase
    .from(tableName)
    .select("date,academic_year,student_id,student_name,class_name,attendance")
    .eq("class_name", className)
    .gte("date", startDate)
    .lte("date", endDate)
    .in("student_id", keys)
    .limit(50000);

  if (error || !data) {
    return new Map<string, number>();
  }

  const studentDates = new Map<string, Set<string>>();

  (data || []).forEach((row: any) => {
    if (cleanLower(row.attendance) !== "present") return;

    const dateText = toDateText(row.date);
    const feedingStudentKey = cleanText(row.student_id);
    const reportStudentId = lookup.get(feedingStudentKey);

    if (!dateText || !reportStudentId) return;

    if (!studentDates.has(reportStudentId)) {
      studentDates.set(reportStudentId, new Set<string>());
    }

    studentDates.get(reportStudentId)?.add(dateText);
  });

  const counts = new Map<string, number>();

  studentDates.forEach((dates, studentId) => {
    counts.set(studentId, dates.size);
  });

  return counts;
}

async function loadFeedingCounts(
  className: string,
  startDate: string,
  endDate: string,
  students: StudentRow[]
) {
  // Feeding attendance is stored in balance_ledger.
  // daily_entries is kept as fallback because some older/newer records may be there.
  const balanceCounts = await countPresentFromFeedingTable(
    "balance_ledger",
    className,
    startDate,
    endDate,
    students
  );

  const dailyCounts = await countPresentFromFeedingTable(
    "daily_entries",
    className,
    startDate,
    endDate,
    students
  );

  const merged = new Map<string, number>();

  const allIds = Array.from(
    new Set([...Array.from(balanceCounts.keys()), ...Array.from(dailyCounts.keys())])
  );

  allIds.forEach((studentId) => {
    const balanceValue = balanceCounts.get(studentId) || 0;
    const dailyValue = dailyCounts.get(studentId) || 0;

    // If both tables have data for same term, choose the larger count to avoid double-counting.
    merged.set(studentId, Math.max(balanceValue, dailyValue));
  });

  return merged;
}

async function loadSavedAttendance(academicYear: string, term: string, className: string) {
  const params = new URLSearchParams({ academic_year: academicYear, term, class_name: className });
  const response = await authedFetch(`/api/report-card/attendance?${params.toString()}`);
  const result = await response.json();

  if (!response.ok || !result.rows) return new Map<string, any>();

  const map = new Map<string, any>();

  (result.rows || []).forEach((row: any) => {
    const key = cleanText(row.student_id);
    if (key) map.set(key, row);
  });

  return map;
}

export default function ReportCardAttendancePage() {
  const [settings, setSettings] = useState<SchoolSettings>({
    academicYear: "",
    currentTerm: "",
    termBegins: "",
    termEnds: "",
  });

  const [teacher, setTeacher] = useState<TeacherRow | null>(null);
  const [classOptions, setClassOptions] = useState<string[]>([]);
  const [selectedClass, setSelectedClass] = useState("");

  const [students, setStudents] = useState<StudentRow[]>([]);
  const [entryData, setEntryData] = useState<Record<string, AttendanceEntry>>({});

  const [holidayDates, setHolidayDates] = useState<string[]>([]);
  const [totalSchoolDays, setTotalSchoolDays] = useState(0);

  const [loading, setLoading] = useState(true);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [assignmentError, setAssignmentError] = useState("");

  const termDateLabel = useMemo(() => {
    return getDateRangeLabel(settings.termBegins, settings.termEnds);
  }, [settings.termBegins, settings.termEnds]);

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

    const freshSettings = await loadSchoolSettings();
    setSettings(freshSettings);

    const holidays = await loadHolidayDates(
      freshSettings.termBegins,
      freshSettings.termEnds
    );
    setHolidayDates(holidays);

    const schoolDays = calculateSchoolDays(
      freshSettings.termBegins,
      freshSettings.termEnds,
      holidays
    );
    setTotalSchoolDays(schoolDays);

    const [teachersRes, classesRes] = await Promise.all([
      supabase.from("teachers").select("*"),
      supabase
        .from("classes")
        .select("id,name,class_name,class_order")
        .order("class_order", { ascending: true }),
    ]);

    if (teachersRes.error || !teachersRes.data || teachersRes.data.length === 0) {
      setAssignmentError("Teacher records could not be loaded.");
      setLoading(false);
      return;
    }

    const teacherRow =
      teachersRes.data.find((item: any) => item.auth_user_id === session.user.id) ||
      teachersRes.data.find(
        (item: any) => cleanLower(item.email) === cleanLower(session.user.email)
      ) ||
      null;

    if (!teacherRow) {
      setAssignmentError("Teacher account was not found.");
      setLoading(false);
      return;
    }

    const role = getRole(teacherRow);

    if (role === "owner" || role === "admin" || role === "headmaster") {
      setAssignmentError("This page is for teachers only.");
      setLoading(false);
      return;
    }

    setTeacher(teacherRow);

    try {
      const res = await authedFetch(
        `/api/teacher-assignments/get?teacher_id=${teacherRow.id}`
      );

      const result = await res.json();

      if (!res.ok || result.error) {
        setClassOptions([]);
        setSelectedClass("");
        setAssignmentError("Assigned classes could not be loaded.");
        setLoading(false);
        return;
      }

      const classIds = result.class_ids || [];
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

  async function loadStudentsAndAttendance(className: string) {
    if (!className || !settings.academicYear || !settings.currentTerm) {
      setStudents([]);
      setEntryData({});
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
      setStudents([]);
      setEntryData({});
      setLoadingStudents(false);
      return;
    }

    const studentList = studentData || [];
    setStudents(studentList);

    const feedingCounts = await loadFeedingCounts(
      className,
      settings.termBegins,
      settings.termEnds,
      studentList
    );

    const savedMap = await loadSavedAttendance(
      settings.academicYear,
      settings.currentTerm,
      className
    );

    const entries: Record<string, AttendanceEntry> = {};

    studentList.forEach((student) => {
      const reportStudentId = getStudentId(student);
      if (!reportStudentId) return;

      const saved = savedMap.get(reportStudentId);
      const feedingPresent = feedingCounts.get(reportStudentId) || 0;

      const savedPresent =
        saved?.days_present ??
        saved?.attendance_present ??
        saved?.present_days ??
        null;

      if (savedPresent !== null && savedPresent !== undefined) {
        entries[reportStudentId] = {
          daysPresent: String(savedPresent),
          feedingPresent,
          source: "saved",
        };
      } else {
        entries[reportStudentId] = {
          daysPresent: feedingPresent ? String(feedingPresent) : "",
          feedingPresent,
          source: "feeding",
        };
      }
    });

    setEntryData(entries);
    setLoadingStudents(false);
  }

  useEffect(() => {
    loadPage();
  }, []);

  useEffect(() => {
    loadStudentsAndAttendance(selectedClass);
  }, [
    selectedClass,
    settings.academicYear,
    settings.currentTerm,
    settings.termBegins,
    settings.termEnds,
  ]);

  function handleDaysPresentChange(studentId: string, value: string) {
    let nextValue = "";

    if (value !== "") {
      let numberValue = Number(value);

      if (Number.isNaN(numberValue)) numberValue = 0;

      numberValue = Math.max(0, numberValue);

      if (totalSchoolDays > 0) {
        numberValue = Math.min(totalSchoolDays, numberValue);
      }

      nextValue = String(numberValue);
    }

    setEntryData((prev) => ({
      ...prev,
      [studentId]: {
        ...(prev[studentId] || { feedingPresent: 0, source: "manual" }),
        daysPresent: nextValue,
        source: "manual",
      },
    }));
  }

  function useFeedingValue(studentId: string) {
    setEntryData((prev) => {
      const old = prev[studentId] || {
        feedingPresent: 0,
        daysPresent: "",
        source: "feeding",
      };

      return {
        ...prev,
        [studentId]: {
          ...old,
          daysPresent: old.feedingPresent ? String(old.feedingPresent) : "",
          source: "feeding",
        },
      };
    });
  }

  async function saveAttendance() {
    if (!selectedClass) {
      setMessage("Please select class.");
      return;
    }

    if (!settings.academicYear || !settings.currentTerm) {
      setMessage("Academic year or current term is missing in school settings.");
      return;
    }

    if (!settings.termBegins || !settings.termEnds || totalSchoolDays < 1) {
      setMessage("Term dates are missing in school_settings.");
      return;
    }

    setSaving(true);
    setMessage("");

    const payload = students
      .map((student) => {
        const reportStudentId = getStudentId(student);
        const row = entryData[reportStudentId];

        if (!reportStudentId || !row) return null;

        const daysPresent =
          row.daysPresent === "" || row.daysPresent === undefined
            ? null
            : Number(row.daysPresent);

        if (daysPresent === null) return null;

        const daysAbsent = Math.max(0, totalSchoolDays - daysPresent);

        return {
          student_id: reportStudentId,
          student_name: getStudentName(student),
          class_name: selectedClass,
          academic_year: settings.academicYear,
          term: settings.currentTerm,
          total_school_days: totalSchoolDays,
          days_present: daysPresent,
          attendance_present: daysPresent,
          days_absent: daysAbsent,
          term_start_date: settings.termBegins,
          term_end_date: settings.termEnds,
          holidays_count: holidayDates.length,
          feeding_present_days: row.feedingPresent,
          teacher_id: getTeacherCode(teacher),
          teacher_name: getTeacherName(teacher),
          source_system: row.source === "manual" ? "teacher_edit" : "feeding",
          updated_at: new Date().toISOString(),
        };
      })
      .filter(Boolean);

    try {
      const response = await authedFetch("/api/report-card/save-attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: payload }),
      });
      const data = await response.json();

      if (!response.ok || data.error) {
        throw new Error(data.error || "Failed to save attendance.");
      }

      setMessage("Attendance saved successfully.");
      await loadStudentsAndAttendance(selectedClass);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to save attendance.");
    }

    setSaving(false);
  }

  if (loading) {
    return (
      <div className="rounded-[28px] bg-white p-5 shadow-sm">
        <p className="text-sm text-gray-500">Loading attendance page...</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="rounded-[28px] bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-extrabold text-gray-900">Attendance</h1>
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

        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <div className="rounded-2xl bg-sky-50 px-4 py-3">
            <p className="text-xs font-bold text-sky-600">Term Dates</p>
            <p className="mt-1 text-sm font-black text-sky-900">
              {getDateRangeLabel(settings.termBegins, settings.termEnds)}
            </p>
          </div>

          <div className="rounded-2xl bg-emerald-50 px-4 py-3">
            <p className="text-xs font-bold text-emerald-600">School Days</p>
            <p className="mt-1 text-xl font-black text-emerald-900">
              {totalSchoolDays || 0}
            </p>
          </div>

          <div className="rounded-2xl bg-amber-50 px-4 py-3">
            <p className="text-xs font-bold text-amber-600">Holidays Removed</p>
            <p className="mt-1 text-xl font-black text-amber-900">
              {holidayDates.length}
            </p>
          </div>
        </div>

        {(!settings.termBegins || !settings.termEnds) && (
          <div className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
            Term dates not found. This page reads school_settings.term_begins and school_settings.term_ends.
          </div>
        )}
      </div>

      <div className="rounded-[28px] bg-white p-5 shadow-sm">
        {message && (
          <div className="mb-4 rounded-2xl bg-sky-50 px-4 py-3 text-sm font-semibold text-sky-700">
            {message}
          </div>
        )}

        {loadingStudents ? (
          <p className="text-sm text-gray-500">Loading students...</p>
        ) : students.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500">
            No students found for this class.
          </div>
        ) : (
          <div className="space-y-4">
            {students.map((student) => {
              const reportStudentId = getStudentId(student);
              const row = entryData[reportStudentId] || {
                daysPresent: "",
                feedingPresent: 0,
                source: "feeding",
              };

              const daysPresent =
                row.daysPresent === "" || row.daysPresent === undefined
                  ? ""
                  : Number(row.daysPresent);

              const daysAbsent =
                daysPresent === ""
                  ? ""
                  : Math.max(0, totalSchoolDays - daysPresent);

              return (
                <div
                  key={student.id}
                  className="rounded-3xl border border-gray-200 p-4"
                >
                  <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <h3 className="text-base font-bold text-gray-900">
                        {getStudentName(student)}
                      </h3>
                      <p className="text-xs text-gray-500">{reportStudentId}</p>
                    </div>

                    <span
                      className={`w-fit rounded-full px-3 py-2 text-xs font-bold ${
                        row.source === "manual"
                          ? "bg-purple-50 text-purple-700"
                          : row.source === "saved"
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-sky-50 text-sky-700"
                      }`}
                    >
                      {row.source === "manual"
                        ? "Edited"
                        : row.source === "saved"
                        ? "Saved"
                        : "From Feeding"}
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-3">
                      <div className="w-36">
                        <label className="mb-2 block text-sm font-semibold text-gray-700">
                          School Days
                        </label>
                        <input
                          type="text"
                          readOnly
                          value={totalSchoolDays || ""}
                          className="w-full rounded-2xl border border-gray-200 bg-gray-100 px-4 py-3 text-gray-700 outline-none"
                        />
                      </div>

                      <div className="w-40">
                        <label className="mb-2 block text-sm font-semibold text-gray-700">
                          Feeding Present
                        </label>
                        <input
                          type="text"
                          readOnly
                          value={row.feedingPresent || 0}
                          className="w-full rounded-2xl border border-gray-200 bg-sky-50 px-4 py-3 text-sky-700 outline-none"
                        />
                      </div>

                      <div className="w-40">
                        <label className="mb-2 block text-sm font-semibold text-gray-700">
                          Days Present
                        </label>
                        <input
                          type="number"
                          min="0"
                          max={totalSchoolDays || undefined}
                          value={row.daysPresent ?? ""}
                          onChange={(e) =>
                            handleDaysPresentChange(reportStudentId, e.target.value)
                          }
                          className="w-full rounded-2xl border border-gray-300 px-4 py-3 outline-none focus:border-sky-500"
                        />
                      </div>

                      <div className="w-36">
                        <label className="mb-2 block text-sm font-semibold text-gray-700">
                          Days Absent
                        </label>
                        <input
                          type="text"
                          readOnly
                          value={daysAbsent}
                          className="w-full rounded-2xl border border-gray-200 bg-gray-100 px-4 py-3 text-gray-700 outline-none"
                        />
                      </div>

                      <div className="flex w-44 items-end">
                        <button
                          type="button"
                          onClick={() => useFeedingValue(reportStudentId)}
                          className="w-full rounded-2xl bg-slate-100 px-4 py-3 text-sm font-bold text-slate-700 hover:bg-slate-200"
                        >
                          Use Feeding
                        </button>
                      </div>
                  </div>
                </div>
              );
            })}

            <button
              onClick={saveAttendance}
              disabled={saving}
              className="w-full rounded-2xl bg-sky-500 px-4 py-4 text-sm font-bold text-white hover:bg-sky-600 disabled:opacity-60"
            >
              {saving ? "Saving..." : "Save Attendance"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
