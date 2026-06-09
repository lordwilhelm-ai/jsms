import { supabase } from "@/lib/supabase";

type AnyRow = Record<string, any>;

export type UniversalPayment = {
  id: string;
  module: string;
  receipt_number: string;
  student_id: string;
  student_name: string;
  class_name: string;
  item_name: string;
  total_amount: number;
  amount_paid: number;
  balance: number;
  payment_method: string;
  received_by: string;
  note: string;
  term: string | null;
  academic_year: string | null;
  payment_date: string | null;
  created_at: string | null;
  source_table: string;
  search_text?: string;
};

export type UniversalReceiptResult = {
  searchedReceipt: UniversalPayment | null;
  studentPayments: UniversalPayment[];
  error?: string;
};

function cleanText(value: unknown) {
  return String(value || "").trim();
}

function normalizeText(value: unknown) {
  return cleanText(value).toLowerCase();
}

function numberValue(value: unknown) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

function mapUniversalPayment(row: AnyRow): UniversalPayment {
  return {
    id: cleanText(row.id),
    module: cleanText(row.module || "-"),
    receipt_number: cleanText(row.receipt_number || row.receipt_no || row.id),
    student_id: cleanText(row.student_id),
    student_name: cleanText(row.student_name),
    class_name: cleanText(row.class_name),
    item_name: cleanText(row.item_name || row.payment_type || row.module || "-"),
    total_amount: numberValue(row.total_amount),
    amount_paid: numberValue(row.amount_paid),
    balance: numberValue(row.balance),
    payment_method: cleanText(row.payment_method || "-"),
    received_by: cleanText(row.received_by || "Admin"),
    note: cleanText(row.note || "-"),
    term: row.term ? cleanText(row.term) : null,
    academic_year: row.academic_year ? cleanText(row.academic_year) : null,
    payment_date: row.payment_date ? cleanText(row.payment_date) : null,
    created_at: row.created_at ? cleanText(row.created_at) : null,
    source_table: cleanText(row.source_table || "-"),
    search_text: cleanText(row.search_text),
  };
}

/**
 * Searches every receipt module through the Supabase view:
 * public.v_universal_receipt_search
 *
 * Covered modules:
 * - Fees: fee_payments
 * - Admission: admission_payments
 * - Books: jsms_book_payments / jsms_book_sales
 * - Uniforms: jsms_uniform_payments
 */
export async function getUniversalReceiptSuggestions(value: string): Promise<UniversalPayment[]> {
  const q = normalizeText(value);

  if (!q) return [];

  const { data, error } = await supabase
    .from("v_universal_receipt_search")
    .select("*")
    .ilike("search_text", `%${q}%`)
    .order("created_at", { ascending: false })
    .limit(8);

  if (error) {
    console.error("Universal receipt suggestions failed:", error);
    return [];
  }

  return (data || []).map(mapUniversalPayment);
}

export async function searchUniversalReceipt(value: string): Promise<UniversalReceiptResult> {
  const q = normalizeText(value);

  if (!q) {
    return {
      searchedReceipt: null,
      studentPayments: [],
      error: "Enter a receipt number, student ID, or student name.",
    };
  }

  const { data, error } = await supabase
    .from("v_universal_receipt_search")
    .select("*")
    .ilike("search_text", `%${q}%`)
    .order("created_at", { ascending: false })
    .limit(25);

  if (error) {
    console.error("Universal receipt search failed:", error);
    return {
      searchedReceipt: null,
      studentPayments: [],
      error: error.message || "Receipt search failed.",
    };
  }

  const matches = (data || []).map(mapUniversalPayment);

  if (matches.length === 0) {
    return {
      searchedReceipt: null,
      studentPayments: [],
      error: "No receipt found.",
    };
  }

  const exactMatch =
    matches.find((item) => normalizeText(item.receipt_number) === q) ||
    matches.find((item) => normalizeText(item.receipt_number).includes(q)) ||
    matches.find((item) => normalizeText(item.student_id) === q) ||
    matches.find((item) => normalizeText(item.student_name).includes(q)) ||
    matches[0];

  let studentPayments = matches;

  if (exactMatch?.student_id) {
    const { data: studentRows, error: studentError } = await supabase
      .from("universal_receipts")
      .select("*")
      .eq("student_id", exactMatch.student_id)
      .order("created_at", { ascending: false });

    if (studentError) {
      console.error("Student receipt history failed:", studentError);
    } else {
      studentPayments = (studentRows || []).map(mapUniversalPayment);
    }
  }

  return {
    searchedReceipt: exactMatch,
    studentPayments,
  };
}
