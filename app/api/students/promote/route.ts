import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireStaffRole, unauthorizedResponse } from "@/lib/apiAuth";
import { logActivity, actorName } from "@/lib/activityLog";

// Runs server-side to completion in one request instead of the old
// client-side loop (app/(protected)/students/page.tsx used to await one
// supabase.update() per student directly from the browser) — that loop had
// no way to survive the admin closing the tab or losing connection mid-way,
// which is exactly what left the school with a half-promoted, mixed roster
// once already.
export const maxDuration = 60;

type ClassRow = { id: string; class_name: string; class_order: number };
type StudentRow = {
  id: string;
  student_id: string;
  full_name: string;
  class_name: string;
  status: string;
};

export async function POST(request: Request) {
  try {
    const auth = await requireStaffRole(request, ["owner", "admin", "headmaster"]);
    if (!auth.ok) return unauthorizedResponse(auth);

    const body = await request.json().catch(() => ({}));
    const mode = String(body.mode || "");
    const studentId = String(body.studentId || "").trim();
    const fromClass = String(body.fromClass || "").trim();
    const useAutoNext = body.useAutoNext !== false;
    const targetClassId = body.targetClassId ? String(body.targetClassId) : "";

    if (!["individual", "class", "all"].includes(mode)) {
      return NextResponse.json({ error: "Invalid promotion mode." }, { status: 400 });
    }

    const { data: classes, error: classesError } = await supabaseAdmin
      .from("classes")
      .select("id, class_name, class_order")
      .order("class_order");

    if (classesError) throw new Error(classesError.message);

    const orderedClasses = (classes || []) as ClassRow[];
    const classByName = new Map(orderedClasses.map((c) => [c.class_name, c]));

    function nextClass(name: string): ClassRow | null {
      const idx = orderedClasses.findIndex((c) => c.class_name === name);
      if (idx === -1 || idx === orderedClasses.length - 1) return null;
      return orderedClasses[idx + 1];
    }

    let query = supabaseAdmin
      .from("students")
      .select("id, student_id, full_name, class_name, status")
      .eq("status", "Active");

    if (mode === "individual") {
      if (!studentId) {
        return NextResponse.json({ error: "Select a student." }, { status: 400 });
      }
      query = query.eq("id", studentId);
    } else if (mode === "class") {
      if (!fromClass) {
        return NextResponse.json({ error: "Select a class." }, { status: 400 });
      }
      query = query.eq("class_name", fromClass);
    }

    const { data: studentsData, error: studentsError } = await query;
    if (studentsError) throw new Error(studentsError.message);

    const students = (studentsData || []) as StudentRow[];
    if (students.length === 0) {
      return NextResponse.json({ error: "No students found for this promotion." }, { status: 400 });
    }

    let manualTargetClass: ClassRow | null = null;
    if (!useAutoNext) {
      if (!targetClassId) {
        return NextResponse.json({ error: "Select the class to promote to." }, { status: 400 });
      }
      manualTargetClass = orderedClasses.find((c) => c.id === targetClassId) || null;
      if (!manualTargetClass) {
        return NextResponse.json({ error: "Target class not found." }, { status: 400 });
      }
    }

    // Playroom 1 is the one class where "next class" isn't a blanket rule —
    // each student's own class teacher already recorded a Playroom 1 vs
    // Playroom 2 recommendation on their report card ("Promoted To"), so
    // auto-promotion here means honoring that choice, not the ladder.
    const needsPlayroomDecisions =
      !manualTargetClass && students.some((s) => s.class_name === "Playroom 1");
    const decisionByCode = new Map<string, string>();

    if (needsPlayroomDecisions) {
      const { data: cards, error: cardsError } = await supabaseAdmin
        .from("jsms_report_cards")
        .select("student_id, promoted_to, updated_at")
        .eq("class_name", "Playroom 1")
        .not("promoted_to", "is", null)
        .order("updated_at", { ascending: false });

      if (cardsError) throw new Error(cardsError.message);

      for (const row of cards || []) {
        if (!decisionByCode.has(row.student_id)) {
          decisionByCode.set(row.student_id, row.promoted_to as string);
        }
      }
    }

    type PlanItem = { student: StudentRow; targetClass: ClassRow | null; completed: boolean };

    const plan: PlanItem[] = students.map((s) => {
      if (manualTargetClass) {
        return { student: s, targetClass: manualTargetClass, completed: false };
      }

      if (s.class_name === "Playroom 1") {
        const decision = decisionByCode.get(s.student_id);
        const targetName = decision === "Playroom 2" ? "Playroom 2" : "Playroom 1";
        return { student: s, targetClass: classByName.get(targetName) || null, completed: false };
      }

      const next = nextClass(s.class_name);
      if (!next) {
        return { student: s, targetClass: null, completed: true };
      }
      return { student: s, targetClass: next, completed: false };
    });

    const chunkSize = 25;
    const failures: { id: string; name: string; error: string }[] = [];
    let promotedCount = 0;
    let completedCount = 0;

    for (let i = 0; i < plan.length; i += chunkSize) {
      const chunk = plan.slice(i, i + chunkSize);

      const results = await Promise.all(
        chunk.map(async (item) => {
          const update = item.completed
            ? { status: "Completed", is_active: false, active: false, class_name: "Graduated" }
            : {
                class_id: item.targetClass!.id,
                class_name: item.targetClass!.class_name,
                status: "Active",
                is_active: true,
                active: true,
              };

          const { error } = await supabaseAdmin
            .from("students")
            .update(update)
            .eq("id", item.student.id);

          return { item, error };
        })
      );

      for (const { item, error } of results) {
        if (error) {
          failures.push({ id: item.student.id, name: item.student.full_name, error: error.message });
        } else if (item.completed) {
          completedCount++;
        } else {
          promotedCount++;
        }
      }
    }

    const scopeLabel =
      mode === "all" ? "the whole school" : mode === "class" ? `class "${fromClass}"` : "1 student";

    const summary = `Promoted ${scopeLabel}: ${promotedCount} moved up${
      completedCount ? `, ${completedCount} marked Completed` : ""
    }${failures.length ? `, ${failures.length} failed` : ""}.`;

    void logActivity({
      userName: actorName(auth.teacher),
      role: auth.role,
      action: "STUDENTS_PROMOTE",
      details: summary,
    });

    if (failures.length > 0) {
      return NextResponse.json(
        { message: summary, promoted: promotedCount, completed: completedCount, failures },
        { status: 207 }
      );
    }

    return NextResponse.json({ message: summary, promoted: promotedCount, completed: completedCount });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Something went wrong." },
      { status: 500 }
    );
  }
}
