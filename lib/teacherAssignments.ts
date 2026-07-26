import { supabaseAdmin } from "@/lib/supabase-admin";

// Shared by the report-card save routes (save-scores, save-attendance,
// save-remarks): a `teacher`-role caller's payload can name ANY class_name
// (and, for scores, subject_name) — the client-side pickers only ever show
// the teacher's own assigned classes/subjects, but nothing stopped a direct
// API call from writing rows for a class/subject the teacher isn't assigned
// to. This resolves the same teacher_class_assignments / teacher_subjects
// tables the "/api/teacher-assignments/get" endpoint and the upload-results
// page use, and rejects rows outside that scope. Callers with owner/admin/
// headmaster roles are trusted broadly (same as everywhere else in this
// app) and should skip this check entirely.

function cleanText(value: unknown) {
  return String(value || "").trim();
}

function cleanLower(value: unknown) {
  return cleanText(value).toLowerCase();
}

export type ScopeRow = {
  class_name?: string | null;
  subject_name?: string | null;
};

export type ScopeCheckResult = { ok: true } | { ok: false; error: string };

export async function verifyTeacherScope(
  teacherId: string,
  rows: ScopeRow[],
  options: { requireSubject?: boolean } = {}
): Promise<ScopeCheckResult> {
  const classNames = Array.from(
    new Set(rows.map((row) => cleanText(row.class_name)).filter(Boolean))
  );

  if (classNames.length === 0) {
    return { ok: false, error: "No class specified." };
  }

  const [classesRes, classAssignmentsRes] = await Promise.all([
    supabaseAdmin.from("classes").select("id,name,class_name"),
    supabaseAdmin
      .from("teacher_class_assignments")
      .select("class_id")
      .eq("teacher_id", teacherId),
  ]);

  if (classesRes.error || classAssignmentsRes.error) {
    return { ok: false, error: "Could not verify class assignment." };
  }

  const classNameToId = new Map<string, string>();
  (classesRes.data || []).forEach((row: any) => {
    const name = cleanLower(row.class_name || row.name);
    if (name) classNameToId.set(name, String(row.id));
  });

  const assignedClassIds = new Set(
    (classAssignmentsRes.data || []).map((row: any) => String(row.class_id))
  );

  const requestedClassIds: string[] = [];

  for (const className of classNames) {
    const classId = classNameToId.get(cleanLower(className));

    if (!classId || !assignedClassIds.has(classId)) {
      return { ok: false, error: `You are not assigned to class "${className}".` };
    }

    requestedClassIds.push(classId);
  }

  if (!options.requireSubject) {
    return { ok: true };
  }

  const subjectNames = Array.from(
    new Set(rows.map((row) => cleanText(row.subject_name)).filter(Boolean))
  );

  if (subjectNames.length === 0) {
    return { ok: false, error: "No subject specified." };
  }

  const [subjectsRes, teacherSubjectsRes] = await Promise.all([
    supabaseAdmin.from("subjects").select("id,name,subject_name"),
    supabaseAdmin
      .from("teacher_subjects")
      .select("class_id,subject_id")
      .eq("teacher_id", teacherId)
      .in("class_id", requestedClassIds),
  ]);

  if (subjectsRes.error || teacherSubjectsRes.error) {
    return { ok: false, error: "Could not verify subject assignment." };
  }

  const subjectNameToId = new Map<string, string>();
  (subjectsRes.data || []).forEach((row: any) => {
    const name = cleanLower(row.subject_name || row.name);
    if (name) subjectNameToId.set(name, String(row.id));
  });

  const assignedPairs = new Set(
    (teacherSubjectsRes.data || []).map(
      (row: any) => `${String(row.class_id)}::${String(row.subject_id)}`
    )
  );

  for (const row of rows) {
    const className = cleanText(row.class_name);
    const subjectName = cleanText(row.subject_name);

    if (!className || !subjectName) continue;

    const classId = classNameToId.get(cleanLower(className));
    const subjectId = subjectNameToId.get(cleanLower(subjectName));

    if (!classId || !subjectId || !assignedPairs.has(`${classId}::${subjectId}`)) {
      return {
        ok: false,
        error: `You are not assigned to subject "${subjectName}" for class "${className}".`,
      };
    }
  }

  return { ok: true };
}
