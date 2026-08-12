import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireStaffRole, unauthorizedResponse } from "@/lib/apiAuth";
import { fetchAllRows } from "@/lib/supabasePagination";

// Report cards, fees, uniforms, and books all key student_id by the JVS
// text code (students.student_id), not the students.id UUID — matches the
// existing report-card and fees routes. daily_entries (feeding) is the one
// table that keys by the UUID instead, so it's queried separately below.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireStaffRole(request, ["owner", "admin", "headmaster"]);
    if (!auth.ok) return unauthorizedResponse(auth);

    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "Student id is required." }, { status: 400 });
    }

    const { data: student, error: studentError } = await supabaseAdmin
      .from("students")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (studentError) throw new Error(studentError.message);
    if (!student) {
      return NextResponse.json({ error: "Student not found." }, { status: 404 });
    }

    const code = student.student_id;

    const [scoresRes, attendanceRes, cardsRes, feesRes, uniformPaymentsRes, uniformGivenRes, booksGivenRes] =
      await Promise.all([
        fetchAllRows((from, to) =>
          supabaseAdmin
            .from("jsms_report_scores")
            .select(
              "subject_name, class_score, exam_score, total_score, grade, position, remark, class_name, academic_year, term"
            )
            .eq("student_id", code)
            .order("academic_year")
            .order("term")
            .range(from, to)
        ),
        fetchAllRows((from, to) =>
          supabaseAdmin
            .from("jsms_report_attendance")
            .select("class_name, academic_year, term, days_present, days_absent, total_school_days")
            .eq("student_id", code)
            .range(from, to)
        ),
        fetchAllRows((from, to) =>
          supabaseAdmin
            .from("jsms_report_cards")
            .select(
              "class_name, academic_year, term, conduct, attitude, interest, teacher_remark, promoted_to, teacher_name, updated_at"
            )
            .eq("student_id", code)
            .order("academic_year")
            .order("term")
            .range(from, to)
        ),
        fetchAllRows((from, to) =>
          supabaseAdmin
            .from("fee_payments")
            .select("receipt_no, class_name, academic_year, term, amount_paid, balance_after_payment, payment_date, payment_method")
            .eq("student_id", code)
            .order("payment_date", { ascending: false })
            .range(from, to)
        ),
        fetchAllRows((from, to) =>
          supabaseAdmin
            .from("jsms_uniform_payments")
            .select("receipt_number, item_name, quantity, amount_paid, created_at, class_name")
            .eq("student_id", code)
            .range(from, to)
        ),
        fetchAllRows((from, to) =>
          supabaseAdmin
            .from("jsms_uniforms_given")
            .select("item_name, quantity_given, given_at")
            .eq("student_id", code)
            .range(from, to)
        ),
        fetchAllRows((from, to) =>
          supabaseAdmin
            .from("jsms_books_given")
            .select("book_name, quantity_given, given_at")
            .eq("student_id", code)
            .range(from, to)
        ),
      ]);

    for (const res of [scoresRes, attendanceRes, cardsRes, feesRes, uniformPaymentsRes, uniformGivenRes, booksGivenRes]) {
      if (res.error) throw new Error(res.error.message);
    }

    // daily_entries (feeding) keys by the students.id UUID, not the JVS
    // code — kept summarized rather than row-by-row since a student who
    // attended for years can rack up hundreds of feeding entries.
    const { data: feedingRows, error: feedingError } = await fetchAllRows((from, to) =>
      supabaseAdmin
        .from("daily_entries")
        .select("amount_paid_today, ate_today, date")
        .eq("student_id", id)
        .range(from, to)
    );
    if (feedingError) throw new Error(feedingError.message);

    const feedingSummary = {
      totalEntries: feedingRows?.length || 0,
      totalPaid: (feedingRows || []).reduce((sum, r) => sum + Number(r.amount_paid_today || 0), 0),
      daysAte: (feedingRows || []).filter((r) => r.ate_today).length,
      firstDate: feedingRows && feedingRows.length ? feedingRows.reduce((a, b) => (a.date < b.date ? a : b)).date : null,
      lastDate: feedingRows && feedingRows.length ? feedingRows.reduce((a, b) => (a.date > b.date ? a : b)).date : null,
    };

    // Group report cards by academic year + term for a clean per-term view.
    const termsMap = new Map<string, { academicYear: string; term: string; className: string; scores: any[]; attendance: any; remark: any }>();
    for (const row of scoresRes.data || []) {
      const key = `${row.academic_year}__${row.term}`;
      if (!termsMap.has(key)) {
        termsMap.set(key, { academicYear: row.academic_year, term: row.term, className: row.class_name, scores: [], attendance: null, remark: null });
      }
      termsMap.get(key)!.scores.push(row);
    }
    for (const row of attendanceRes.data || []) {
      const key = `${row.academic_year}__${row.term}`;
      if (!termsMap.has(key)) {
        termsMap.set(key, { academicYear: row.academic_year, term: row.term, className: row.class_name, scores: [], attendance: null, remark: null });
      }
      termsMap.get(key)!.attendance = row;
    }
    for (const row of cardsRes.data || []) {
      const key = `${row.academic_year}__${row.term}`;
      if (!termsMap.has(key)) {
        termsMap.set(key, { academicYear: row.academic_year, term: row.term, className: row.class_name, scores: [], attendance: null, remark: null });
      }
      termsMap.get(key)!.remark = row;
    }

    const reportCardTerms = [...termsMap.values()].sort((a, b) => {
      if (a.academicYear !== b.academicYear) return a.academicYear.localeCompare(b.academicYear);
      return String(a.term).localeCompare(String(b.term));
    });

    return NextResponse.json({
      student,
      reportCardTerms,
      feePayments: feesRes.data || [],
      uniformPayments: uniformPaymentsRes.data || [],
      uniformsGiven: uniformGivenRes.data || [],
      booksGiven: booksGivenRes.data || [],
      feedingSummary,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Something went wrong." },
      { status: 500 }
    );
  }
}
