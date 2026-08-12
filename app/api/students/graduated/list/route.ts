import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireStaffRole, unauthorizedResponse } from "@/lib/apiAuth";
import { fetchAllRows } from "@/lib/supabasePagination";

// A graduated student's class_name is stamped "Graduated" at promotion time,
// but there's no separate "graduation year" column on students — it's
// derived from their own most recent report card's academic_year (the year
// they finished JHS 3), the same trusted, already-saved record used to
// reconstruct a student's class after the promotion incident. Anyone with no
// report card history at all (e.g. force-completed with no academic record)
// falls into an "Unknown" bucket rather than being guessed at.
export async function GET(request: Request) {
  try {
    const auth = await requireStaffRole(request, ["owner", "admin", "headmaster"]);
    if (!auth.ok) return unauthorizedResponse(auth);

    const { data: students, error: studentsError } = await supabaseAdmin
      .from("students")
      .select("id, student_id, full_name, photo_url, gender, date_of_birth, updated_at")
      .eq("status", "Completed")
      .order("full_name");

    if (studentsError) throw new Error(studentsError.message);

    if (!students || students.length === 0) {
      return NextResponse.json({ groups: [] });
    }

    const studentCodes = students.map((s) => s.student_id).filter(Boolean);

    const { data: cards, error: cardsError } = await fetchAllRows((from, to) =>
      supabaseAdmin
        .from("jsms_report_cards")
        .select("student_id, academic_year, updated_at")
        .in("student_id", studentCodes)
        .order("updated_at", { ascending: false })
        .range(from, to)
    );

    if (cardsError) throw new Error(cardsError.message);

    const yearByCode = new Map<string, string>();
    for (const row of cards || []) {
      if (!yearByCode.has(row.student_id) && row.academic_year) {
        yearByCode.set(row.student_id, row.academic_year);
      }
    }

    const groupsMap = new Map<string, any[]>();
    for (const s of students) {
      const year = yearByCode.get(s.student_id) || "Unknown";
      if (!groupsMap.has(year)) groupsMap.set(year, []);
      groupsMap.get(year)!.push({
        id: s.id,
        studentId: s.student_id,
        fullName: s.full_name,
        photoUrl: s.photo_url,
        gender: s.gender,
        dateOfBirth: s.date_of_birth,
      });
    }

    const groups = [...groupsMap.entries()]
      .sort((a, b) => (a[0] === "Unknown" ? 1 : b[0] === "Unknown" ? -1 : b[0].localeCompare(a[0])))
      .map(([year, group]) => ({ year, students: group }));

    return NextResponse.json({ groups, total: students.length });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Something went wrong." },
      { status: 500 }
    );
  }
}
