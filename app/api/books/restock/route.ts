import { NextResponse } from "next/server";
import { requireStaffRole, unauthorizedResponse } from "@/lib/apiAuth";
import { adjustBookQuantity } from "@/lib/booksStock";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { logActivity, actorName } from "@/lib/activityLog";

const ALLOWED_ROLES = ["owner", "admin", "headmaster"] as const;

function numberValue(value: unknown) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export async function POST(request: Request) {
  try {
    const auth = await requireStaffRole(request, [...ALLOWED_ROLES]);
    if (!auth.ok) return unauthorizedResponse(auth);

    const body = await request.json();
    const bookId = String(body?.bookId || "").trim();
    const quantity = numberValue(body?.quantity);

    if (!bookId) {
      return NextResponse.json({ error: "Book id is required." }, { status: 400 });
    }

    if (!(quantity > 0)) {
      return NextResponse.json({ error: "Enter valid quantity." }, { status: 400 });
    }

    const newQuantity = await adjustBookQuantity(bookId, quantity);
    if (newQuantity === null) {
      return NextResponse.json({ error: "Book not found." }, { status: 404 });
    }

    const { data: bookRow } = await supabaseAdmin.from("jsms_books").select("book_name").eq("id", bookId).maybeSingle();

    void logActivity({
      userName: actorName(auth.teacher),
      role: auth.role,
      action: "BOOKS_RESTOCK",
      details: `Restocked ${quantity} of "${bookRow?.book_name || bookId}" — new quantity: ${newQuantity}.`,
    });

    return NextResponse.json({ message: "Stock updated.", quantity: newQuantity });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
