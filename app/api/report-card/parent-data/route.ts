import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

type AnyRow = Record<string, any>;

function cleanText(value: unknown) {
  return String(value || "").trim();
}

function cleanLower(value: unknown) {
  return cleanText(value).toLowerCase();
}

function isActiveStudent(student: AnyRow) {
  const status = cleanLower(student?.status);

  if (student?.left_school === true) return false;
  if (student?.is_active === false) return false;
  if (student?.active === false) return false;
  if (status === "inactive" || status === "left" || status === "withdrawn") return false;

  return true;
}

function getStudentReportId(student: AnyRow) {
  return cleanText(student?.student_id || student?.jvs_id || student?.id);
}

function getClassName(student: AnyRow) {
  return cleanText(student?.class_name || student?.class || student?.current_class);
}

function getStudentKeys(student: AnyRow) {
  return [
    cleanText(student?.id),
    cleanText(student?.student_id),
    cleanText(student?.jvs_id),
    cleanText(student?.student_uuid),
    cleanText(student?.student_db_id),
    cleanText(student?.full_name),
    cleanText(student?.student_name),
    cleanText(student?.name),
  ].filter(Boolean);
}

function rowBelongsToKeys(row: AnyRow, keys: Set<string>) {
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

// The parent portal has no login — knowing a student's ID (from the printed
// report card's QR code) *and* their class is the access control, same as
// the rest of that portal. This route now does the ENTIRE lookup
// server-side with the service role:
//   - it never accepts a caller-supplied list of student IDs (that was a
//     bulk-scrape vector: `.in("student_id", studentIds)` with an unbounded
//     comma list would return many students' records in one call);
//   - it never ships the full students/fee_payments/fee_structure/classes
//     tables to the browser (that used to happen client-side in
//     app/parent/page.tsx via the anon `supabase` client) — only the ONE
//     resolved student's own rows go back in the response.
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const studentQuery = cleanText(searchParams.get("student"));
    const classQuery = cleanText(searchParams.get("class"));

    if (!studentQuery || !classQuery) {
      return NextResponse.json({ error: "student and class are required." }, { status: 400 });
    }

    const { data: studentsData, error: studentsError } = await supabaseAdmin
      .from("students")
      .select("*");

    if (studentsError) throw studentsError;

    const allStudents = ((studentsData || []) as AnyRow[]).filter(isActiveStudent);

    const student =
      allStudents.find(
        (row) => cleanLower(getStudentReportId(row)) === cleanLower(studentQuery)
      ) ||
      allStudents.find((row) => cleanLower(row.student_id) === cleanLower(studentQuery)) ||
      null;

    if (!student) {
      return NextResponse.json(
        { error: "Student record not found or inactive." },
        { status: 404 }
      );
    }

    const className = getClassName(student);

    if (cleanLower(className) !== cleanLower(classQuery)) {
      return NextResponse.json(
        { error: "Student ID and class do not match." },
        { status: 404 }
      );
    }

    const classTotal = allStudents.filter((row) => getClassName(row) === className).length;
    const keys = new Set(getStudentKeys(student));

    const [
      scoresRes,
      attendanceRes,
      cardsRes,
      feeLiveRes,
      feePaymentsRes,
      feeStructureRes,
      classesRes,
      settingsRes,
    ] = await Promise.all([
      supabaseAdmin.from("jsms_report_scores").select("*"),
      supabaseAdmin.from("jsms_report_attendance").select("*"),
      supabaseAdmin.from("jsms_report_cards").select("*"),
      supabaseAdmin.from("jsms_report_fee_live_view").select("*"),
      supabaseAdmin.from("fee_payments").select("*"),
      supabaseAdmin.from("fee_structure").select("*"),
      supabaseAdmin.from("classes").select("*"),
      supabaseAdmin
        .from("school_settings")
        .select("*")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    if (scoresRes.error) throw scoresRes.error;
    if (attendanceRes.error) throw attendanceRes.error;
    if (cardsRes.error) throw cardsRes.error;
    if (feeLiveRes.error) throw feeLiveRes.error;
    if (feePaymentsRes.error) throw feePaymentsRes.error;
    if (feeStructureRes.error) throw feeStructureRes.error;
    if (classesRes.error) throw classesRes.error;

    const scores = ((scoresRes.data || []) as AnyRow[]).filter((row) => rowBelongsToKeys(row, keys));
    const attendance = ((attendanceRes.data || []) as AnyRow[]).filter((row) => rowBelongsToKeys(row, keys));
    const cards = ((cardsRes.data || []) as AnyRow[]).filter((row) => rowBelongsToKeys(row, keys));
    const feeLiveRows = ((feeLiveRes.data || []) as AnyRow[]).filter((row) => rowBelongsToKeys(row, keys));
    const feePayments = ((feePaymentsRes.data || []) as AnyRow[]).filter((row) => rowBelongsToKeys(row, keys));

    // Fee structure/class rates aren't per-student data, but there's no
    // reason to ship every OTHER class's fee schedule to this student's
    // browser either — trim to the student's own class.
    const feeStructures = ((feeStructureRes.data || []) as AnyRow[]).filter(
      (row) => cleanLower(row.class_name || row.class || row.level) === cleanLower(className)
    );
    const classes = ((classesRes.data || []) as AnyRow[]).filter(
      (row) => cleanLower(row.class_name || row.name) === cleanLower(className)
    );

    return NextResponse.json({
      student,
      classTotal,
      settings: settingsRes.error ? null : settingsRes.data || null,
      scores,
      attendance,
      cards,
      feeLiveRows,
      feePayments,
      feeStructures,
      classes,
    });
  } catch (error) {
    console.error("Load parent report-card data error:", error);
    const message =
      error instanceof Error
        ? error.message
        : String((error as Record<string, any>)?.message || "Failed to load report card.");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
