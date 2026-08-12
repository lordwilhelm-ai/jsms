import { supabaseAdmin } from "@/lib/supabase-admin";

export type RecordField = {
  key: string;
  label: string;
  type: "text" | "number" | "date";
  editable: boolean;
};

export type RecordTypeConfig = {
  label: string;
  table: string;
  childTable?: string;
  childKey?: string;
  searchFields: string[];
  listFields: string[];
  fields: RecordField[];
  isFeePayment?: boolean;
};

// One entry per money-entry action the Activity Log's Undo/Edit feature
// supports. Adding a new type here (and a matching undoType/undoPayload on
// its logActivity() call) is the whole extension point for widening this
// beyond the original 5 — nothing else needs to change.
export const RECORD_TYPES: Record<string, RecordTypeConfig> = {
  fees: {
    label: "Fee Payments",
    table: "fee_payments",
    searchFields: ["student_name", "student_id", "receipt_no", "class_name"],
    listFields: [
      "id",
      "receipt_no",
      "student_id",
      "student_name",
      "class_name",
      "academic_year",
      "term",
      "amount_paid",
      "total_fee",
      "balance_after_payment",
      "payment_date",
      "payment_method",
      "note",
    ],
    fields: [
      { key: "student_id", label: "Student ID", type: "text", editable: true },
      { key: "student_name", label: "Student Name", type: "text", editable: true },
      { key: "class_name", label: "Class", type: "text", editable: true },
      { key: "academic_year", label: "Academic Year", type: "text", editable: true },
      { key: "term", label: "Term", type: "text", editable: true },
      { key: "amount_paid", label: "Amount Paid", type: "number", editable: true },
      { key: "total_fee", label: "Total Fee Owed", type: "number", editable: true },
      { key: "payment_date", label: "Payment Date", type: "date", editable: true },
      { key: "payment_method", label: "Payment Method", type: "text", editable: true },
      { key: "note", label: "Note", type: "text", editable: true },
    ],
    isFeePayment: true,
  },
  feeding: {
    label: "Feeding Money Received",
    table: "received_money",
    searchFields: ["class_name", "teacher_names"],
    listFields: ["id", "date", "class_name", "amount_received", "teacher_names", "received_by"],
    fields: [
      { key: "date", label: "Date", type: "date", editable: true },
      { key: "class_name", label: "Class", type: "text", editable: true },
      { key: "amount_received", label: "Amount Received", type: "number", editable: true },
      { key: "teacher_names", label: "Teacher Name(s)", type: "text", editable: true },
    ],
  },
  uniforms: {
    label: "Uniform Payments",
    table: "jsms_uniform_payments",
    childTable: "jsms_uniform_payment_items",
    childKey: "payment_id",
    searchFields: ["student_name", "student_id", "receipt_number", "class_name", "item_name"],
    listFields: [
      "id",
      "receipt_number",
      "student_id",
      "student_name",
      "class_name",
      "item_name",
      "amount_paid",
      "total_amount",
      "balance",
      "payment_status",
      "created_at",
    ],
    fields: [
      { key: "student_id", label: "Student ID", type: "text", editable: true },
      { key: "student_name", label: "Student Name", type: "text", editable: true },
      { key: "class_name", label: "Class", type: "text", editable: true },
      { key: "item_name", label: "Item(s)", type: "text", editable: true },
      { key: "amount_paid", label: "Amount Paid", type: "number", editable: true },
      { key: "total_amount", label: "Total Amount", type: "number", editable: true },
      { key: "payment_note", label: "Note", type: "text", editable: true },
    ],
  },
  books: {
    label: "Book Payments",
    table: "jsms_book_payments",
    childTable: "jsms_book_payment_items",
    childKey: "payment_id",
    searchFields: ["student_name", "student_id", "receipt_number", "class_name", "paid_for"],
    listFields: [
      "id",
      "receipt_number",
      "student_id",
      "student_name",
      "class_name",
      "paid_for",
      "amount_paid",
      "total_amount",
      "balance",
      "created_at",
    ],
    fields: [
      { key: "student_id", label: "Student ID", type: "text", editable: true },
      { key: "student_name", label: "Student Name", type: "text", editable: true },
      { key: "class_name", label: "Class", type: "text", editable: true },
      { key: "paid_for", label: "Paid For", type: "text", editable: true },
      { key: "amount_paid", label: "Amount Paid", type: "number", editable: true },
      { key: "total_amount", label: "Total Amount", type: "number", editable: true },
      { key: "payment_note", label: "Note", type: "text", editable: true },
    ],
  },
  finance: {
    label: "Income & Expenditure",
    table: "finance_transactions",
    searchFields: ["item_name", "category", "description", "recorded_by"],
    listFields: [
      "id",
      "type",
      "category",
      "item_name",
      "amount",
      "transaction_date",
      "money_location",
      "description",
      "recorded_by",
    ],
    fields: [
      { key: "type", label: "Type", type: "text", editable: true },
      { key: "category", label: "Category", type: "text", editable: true },
      { key: "item_name", label: "Item", type: "text", editable: true },
      { key: "amount", label: "Amount", type: "number", editable: true },
      { key: "transaction_date", label: "Date", type: "date", editable: true },
      { key: "money_location", label: "Money Location", type: "text", editable: true },
      { key: "description", label: "Description", type: "text", editable: true },
    ],
  },
};

// fee_payments snapshots cumulative_paid/balance_after_payment ON EACH ROW
// at save time from every earlier payment for that exact student+term+year
// (see app/api/fees/record-payment/route.ts) — so editing OR deleting one
// payment can leave every LATER payment in that same lineage stale. This
// recomputes the whole chain in chronological order, exactly like a fresh
// insert would. Called after any edit/delete that touches a fee_payments
// row, for both the row's old (student,term,year) and, if changed, its new
// one.
export async function recalculateFeePaymentChain(studentCode: string, academicYear: string, term: string) {
  if (!studentCode || !academicYear || !term) return;

  const { data: rows, error } = await supabaseAdmin
    .from("fee_payments")
    .select("id, amount_paid, total_fee, created_at")
    .eq("student_id", studentCode)
    .eq("academic_year", academicYear)
    .eq("term", term)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);

  let cumulative = 0;
  for (const row of rows || []) {
    cumulative += Number(row.amount_paid || 0);
    const totalFee = Number(row.total_fee || 0);
    const balance = Math.max(totalFee - cumulative, 0);

    const { error: updateError } = await supabaseAdmin
      .from("fee_payments")
      .update({ cumulative_paid: cumulative, balance_after_payment: balance })
      .eq("id", row.id);
    if (updateError) throw new Error(updateError.message);
  }
}

// Shared by both the Activity Log's "Undo" button (which already knows the
// exact row via undo_payload) and the Manage Records browser's Delete
// action (found via search instead) — same deletion logic either way.
export async function deleteRecordRow(type: string, id: string) {
  const config = RECORD_TYPES[type];
  if (!config) throw new Error(`Unknown record type "${type}".`);

  if (config.isFeePayment) {
    const { data: target, error: targetError } = await supabaseAdmin
      .from(config.table)
      .select("student_id, academic_year, term")
      .eq("id", id)
      .maybeSingle();
    if (targetError) throw new Error(targetError.message);
    if (!target) return;

    const { error: deleteError } = await supabaseAdmin.from(config.table).delete().eq("id", id);
    if (deleteError) throw new Error(deleteError.message);

    await recalculateFeePaymentChain(target.student_id, target.academic_year, target.term);
    return;
  }

  if (config.childTable && config.childKey) {
    const { error: childError } = await supabaseAdmin
      .from(config.childTable)
      .delete()
      .eq(config.childKey, id);
    if (childError) throw new Error(childError.message);
  }

  const { error } = await supabaseAdmin.from(config.table).delete().eq("id", id);
  if (error) throw new Error(error.message);
}
