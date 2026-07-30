import { NextResponse } from "next/server";
import { requireStaffRole, unauthorizedResponse } from "@/lib/apiAuth";
import { insertBooksGivenAndAdjustStock, type GivenRow } from "@/lib/booksIssue";
import { logActivity } from "@/lib/activityLog";

// "Confirm books given" step of the record-payment popup, for a payment
// that ALREADY exists on the server (either just recorded online, or an
// older payment being issued later via "Manual Give"). If the payment
// itself is still sitting in the offline queue (not yet synced, no real
// id), use /api/books/record-payment-and-issue instead — see that route's
// comment for why the two need to be combined in that case.
const ALLOWED_ROLES = ["owner", "admin", "headmaster"] as const;

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
    const paymentId = cleanText(body?.paymentId);
    const items: Array<{
      book_id: string | null;
      book_name: string;
      quantity_given: number;
    }> = Array.isArray(body?.items) ? body.items : [];

    if (!paymentId) {
      return NextResponse.json({ error: "Payment id is required." }, { status: 400 });
    }

    if (items.length === 0) {
      return NextResponse.json({ error: "Select at least one book given." }, { status: 400 });
    }

    const staffName = getStaffDisplayName(auth.teacher);
    const now = new Date().toISOString();

    const rows: GivenRow[] = items.map((item) => ({
      payment_id: paymentId,
      receipt_number: cleanText(body?.receiptNumber) || null,
      student_id: cleanText(body?.studentId),
      student_name: cleanText(body?.studentName),
      class_name: cleanText(body?.className) || null,
      structure_id: body?.structureId ? cleanText(body.structureId) : null,
      book_id: item.book_id,
      book_name: item.book_name,
      quantity_given: Number(item.quantity_given) || 0,
      given_by: staffName,
      given_at: now,
      note: null,
    }));

    const { oversoldBooks } = await insertBooksGivenAndAdjustStock(rows);

    const bookSummary = rows.map((r) => `${r.book_name} x${r.quantity_given}`).join(", ");
    void logActivity({
      userName: staffName,
      role: auth.role,
      action: "BOOKS_ISSUE",
      className: rows[0]?.class_name ?? null,
      details: `Issued books to ${rows[0]?.student_name || cleanText(body?.studentId)}: ${bookSummary}.`,
    });

    return NextResponse.json({ message: "Books given saved.", oversoldBooks });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
