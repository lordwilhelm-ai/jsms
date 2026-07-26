import { supabaseAdmin } from "@/lib/supabase-admin";

// Books previously adjusted stock with "read current quantity, compute the
// new absolute value, write it back" — two concurrent requests (two staff
// issuing/restocking the same title at the same moment) can race and one
// update silently overwrites the other. Supabase's JS client can't express
// an atomic `quantity = quantity + delta` UPDATE directly (it only accepts
// literal values), so this does the equivalent via optimistic
// concurrency: read, compute, then UPDATE ... WHERE id = X AND quantity =
// <the value just read>, retrying with a fresh read if another write beat
// us to it (0 rows affected). This removes the ONLINE race entirely.
//
// It deliberately does NOT reject a negative result — issuing more books
// than are in stock is allowed to happen (see the offline "issue always
// succeeds, reconcile after sync" design) and shows up for admin review via
// getNegativeStockBooks() below rather than being blocked here.
export async function adjustBookQuantity(bookId: string, delta: number) {
  const MAX_ATTEMPTS = 5;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const { data: current, error: readError } = await supabaseAdmin
      .from("jsms_books")
      .select("quantity")
      .eq("id", bookId)
      .maybeSingle();

    if (readError) throw new Error(readError.message);
    if (!current) return null;

    const currentQuantity = Number(current.quantity ?? 0);
    const nextQuantity = currentQuantity + delta;

    const { data: updated, error: updateError } = await supabaseAdmin
      .from("jsms_books")
      .update({ quantity: nextQuantity })
      .eq("id", bookId)
      .eq("quantity", currentQuantity)
      .select("id, quantity")
      .maybeSingle();

    if (updateError) throw new Error(updateError.message);
    if (updated) return updated.quantity as number;
    // 0 rows matched — quantity changed under us, retry with a fresh read.
  }

  throw new Error("Could not update stock — too many concurrent changes, try again.");
}

export async function getNegativeStockBooks() {
  const { data, error } = await supabaseAdmin
    .from("jsms_books")
    .select("id, book_name, class_name, quantity")
    .lt("quantity", 0);

  if (error) throw new Error(error.message);
  return data || [];
}
