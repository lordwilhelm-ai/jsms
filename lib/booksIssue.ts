import { supabaseAdmin } from "@/lib/supabase-admin";
import { adjustBookQuantity } from "@/lib/booksStock";

export type GivenRow = {
  payment_id: string;
  receipt_number: string | null;
  student_id: string;
  student_name: string;
  class_name: string | null;
  structure_id: string | null;
  book_id: string | null;
  book_name: string;
  quantity_given: number;
  given_by: string;
  given_at: string;
  note: string | null;
};

// Inserts the jsms_books_given rows, then atomically decrements each
// affected book's stock (see lib/booksStock.ts — this is allowed to go
// negative by design; the offline "issue always succeeds, reconcile after
// sync" behavior depends on that). Returns which of the touched books went
// negative from THIS call specifically, for immediate feedback — the Books
// page's reconciliation banner separately scans ALL books for negative
// stock on every load, so this is a convenience, not the only detection path.
export async function insertBooksGivenAndAdjustStock(rows: GivenRow[]) {
  if (rows.length === 0) return { oversoldBooks: [] as string[] };

  const { error } = await supabaseAdmin.from("jsms_books_given").insert(rows);
  if (error) throw new Error(error.message);

  const neededByBookId = new Map<string, number>();
  for (const row of rows) {
    if (!row.book_id) continue;
    neededByBookId.set(row.book_id, (neededByBookId.get(row.book_id) || 0) + Number(row.quantity_given || 0));
  }

  const oversoldBooks: string[] = [];

  for (const [bookId, qty] of neededByBookId.entries()) {
    const resultingQuantity = await adjustBookQuantity(bookId, -qty);

    if (resultingQuantity !== null && resultingQuantity < 0) {
      const { data: book } = await supabaseAdmin.from("jsms_books").select("book_name").eq("id", bookId).maybeSingle();
      oversoldBooks.push(book?.book_name || bookId);
    }
  }

  return { oversoldBooks };
}
