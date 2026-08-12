import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireStaffRole, unauthorizedResponse } from "@/lib/apiAuth";
import { insertBookPaymentWithReceipt, getLastFourStudentId } from "@/lib/booksReceipts";
import { logActivity } from "@/lib/activityLog";
import { isStudentActive } from "@/lib/studentStatus";

// Books Record Payment used to write straight to Supabase from the browser.
// Proxied through here so it can be replayed from the offline queue and is
// authorized server-side, matching Fees/Uniforms. Only records the PAYMENT
// (+ payment items) — the follow-up "which books were given" step is a
// separate call (/api/books/issue) when online, matching the existing
// two-step popup UX, or bundled into one offline action
// (/api/books/record-payment-and-issue) when queued — see that route's
// comment for why the two need to be combined in the offline case.
const ALLOWED_ROLES = ["owner", "admin", "headmaster"] as const;

function numberValue(value: unknown) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function cleanText(value: unknown) {
  return String(value ?? "").trim();
}

function getStaffDisplayName(teacher: Record<string, any> | null) {
  return (
    String(
      teacher?.full_name || teacher?.name || teacher?.teacher_name || teacher?.username || teacher?.email || "Staff"
    ).trim() || "Staff"
  );
}

export async function POST(request: Request) {
  try {
    const auth = await requireStaffRole(request, [...ALLOWED_ROLES]);
    if (!auth.ok) return unauthorizedResponse(auth);

    const body = await request.json();

    const studentId = cleanText(body?.studentId);
    const studentName = cleanText(body?.studentName);
    const className = cleanText(body?.className);
    const paymentType = cleanText(body?.paymentType);
    const structureId = body?.structureId ? cleanText(body.structureId) : null;
    const paidFor = cleanText(body?.paidFor);
    const totalAmount = numberValue(body?.totalAmount);
    const amountPaid = numberValue(body?.amountPaid);
    const term = cleanText(body?.term);
    const academicYear = body?.academicYear ? cleanText(body.academicYear) : null;
    const note = body?.note ? cleanText(body.note) : null;
    const specificBooks: Array<{ id: string; book_name: string; selling_price: number }> = Array.isArray(
      body?.specificBooks
    )
      ? body.specificBooks
      : [];

    if (!studentId || !studentName || !className) {
      return NextResponse.json({ error: "Select student first." }, { status: 400 });
    }

    try {
      getLastFourStudentId(studentId);
    } catch {
      return NextResponse.json(
        { error: "Student ID must contain at least 4 numbers, like JVS97001." },
        { status: 400 }
      );
    }

    if (!(amountPaid > 0)) {
      return NextResponse.json({ error: "Enter amount paid." }, { status: 400 });
    }

    if (amountPaid > totalAmount) {
      return NextResponse.json({ error: "Amount paid cannot be more than total." }, { status: 400 });
    }

    // This route never looked the student up server-side at all — it just
    // trusted whatever id/name/class the client sent. Re-validate against
    // the real record so an inactive/withdrawn student can't have a new
    // book payment recorded against them.
    const { data: student, error: studentError } = await supabaseAdmin
      .from("students")
      .select("status, is_active, active, left_school")
      .eq("student_id", studentId)
      .maybeSingle();

    if (studentError) throw new Error(studentError.message);
    if (!student) {
      return NextResponse.json({ error: "Student record not found." }, { status: 404 });
    }
    if (!isStudentActive(student)) {
      return NextResponse.json(
        { error: "This student is marked inactive and cannot receive new book payments." },
        { status: 400 }
      );
    }

    const staffName = getStaffDisplayName(auth.teacher);
    const balance = totalAmount - amountPaid;

    const payment = await insertBookPaymentWithReceipt(studentId, {
      student_id: studentId,
      student_name: studentName,
      class_name: className,
      payment_type: paymentType,
      structure_id: structureId,
      paid_for: paidFor,
      item_name: paidFor,
      total_amount: totalAmount,
      amount_paid: amountPaid,
      balance,
      receipt_issued_by: staffName,
      received_by: staffName,
      payment_note: note,
      term,
      academic_year: academicYear,
    });

    void logActivity({
      userName: staffName,
      role: auth.role,
      action: "BOOKS_RECORD_PAYMENT",
      className,
      details: `Recorded GHS ${amountPaid.toFixed(2)} book payment (${paidFor || paymentType}) for ${studentName} (${studentId}).`,
    });

    if (paymentType === "specific_books" && specificBooks.length > 0) {
      const itemRows = specificBooks.map((book) => ({
        payment_id: payment.id,
        book_id: book.id,
        book_name: book.book_name,
        quantity: 1,
        unit_price: numberValue(book.selling_price),
        total_price: numberValue(book.selling_price),
      }));

      const { error: itemsError } = await supabaseAdmin.from("jsms_book_payment_items").insert(itemRows);
      if (itemsError) {
        // Payment already recorded — surface this as a message but don't
        // fail the whole request (matches the client's prior behavior).
        return NextResponse.json({
          message: `Payment saved, but selected books failed: ${itemsError.message}`,
          payment,
        });
      }
    }

    return NextResponse.json({ message: "Payment recorded.", payment });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
