import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireStaffRole, unauthorizedResponse } from "@/lib/apiAuth";
import { insertBookPaymentWithReceipt, getLastFourStudentId } from "@/lib/booksReceipts";
import { insertBooksGivenAndAdjustStock, type GivenRow } from "@/lib/booksIssue";

// Recording a book payment and confirming which books were given normally
// happen as two separate calls, a few seconds apart, with the popup UI
// showing the real payment in between (see /api/books/record-payment and
// /api/books/issue). That two-step handoff relies on the FIRST call
// returning a real payment id before the second call fires.
//
// When the payment can't reach the server at all (offline), there's no real
// id to hand to a second queued action — so instead the client bundles both
// steps (the payment AND whichever books the popup says to give) into ONE
// offline action pointed at this route, and the two inserts + stock
// adjustment all happen together, atomically, once this finally syncs.
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
    const givenItems: Array<{ book_id: string | null; book_name: string; quantity_given: number }> = Array.isArray(
      body?.givenItems
    )
      ? body.givenItems
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

    if (!(amountPaid > 0) || amountPaid > totalAmount) {
      return NextResponse.json({ error: "Enter a valid amount paid." }, { status: 400 });
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
      if (itemsError) throw new Error(`Payment saved, but selected books failed: ${itemsError.message}`);
    }

    let oversoldBooks: string[] = [];

    if (givenItems.length > 0) {
      const now = new Date().toISOString();
      const rows: GivenRow[] = givenItems.map((item) => ({
        payment_id: payment.id,
        receipt_number: payment.receipt_number,
        student_id: studentId,
        student_name: studentName,
        class_name: className,
        structure_id: structureId,
        book_id: item.book_id,
        book_name: item.book_name,
        quantity_given: Number(item.quantity_given) || 0,
        given_by: staffName,
        given_at: now,
        note: null,
      }));

      const result = await insertBooksGivenAndAdjustStock(rows);
      oversoldBooks = result.oversoldBooks;
    }

    return NextResponse.json({ message: "Payment and books given saved.", payment, oversoldBooks });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
