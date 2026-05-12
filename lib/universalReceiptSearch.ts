import { supabase } from "@/lib/supabase";

export type UniversalPayment = {
  id: string;
  module: "Fees" | "Books" | "Uniforms" | "Admission";
  source_table: string;
  receipt_number: string;
  student_id: string;
  student_name: string;
  class_name: string;
  item_name: string;
  total_amount: number;
  amount_paid: number;
  balance: number;
  term: string;
  academic_year: string;
  received_by: string;
  payment_note: string;
  created_at: string;
};

export type UniversalReceiptResult = {
  searchedReceipt: UniversalPayment | null;
  studentPayments: UniversalPayment[];
  error: string;
};

function text(value: unknown) {
  return String(value || "").trim();
}

function num(value: unknown) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

function receiptKey(value: string) {
  return text(value).toLowerCase().replace(/[^a-z0-9]/g, "");
}

function receiptFrom(row: any) {
  return text(
    row.receipt_number ||
      row.receipt_no ||
      row.receiptNo ||
      row.receipt ||
      row.reference ||
      row.payment_reference ||
      row.transaction_reference ||
      row.id
  );
}

function dateFrom(row: any) {
  return text(row.created_at || row.payment_date || row.date || "");
}

function normalizeFee(row: any): UniversalPayment {
  return {
    id: text(row.id),
    module: "Fees",
    source_table: "fee_payments",
    receipt_number: receiptFrom(row),
    student_id: text(row.student_id || row.studentId),
    student_name: text(row.student_name || row.full_name || row.name),
    class_name: text(row.class_name || row.className || row.class),
    item_name: text(row.payment_type || row.item_name || "School Fees"),
    total_amount: num(row.total_amount || row.total_fee || row.amount_due),
    amount_paid: num(row.amount_paid || row.amount),
    balance: num(row.balance || row.balance_after),
    term: text(row.term),
    academic_year: text(row.academic_year),
    received_by: text(row.received_by || row.recorded_by),
    payment_note: text(row.payment_note || row.note || row.notes),
    created_at: dateFrom(row),
  };
}

function normalizeBook(row: any): UniversalPayment {
  return {
    id: text(row.id),
    module: "Books",
    source_table: "jsms_book_payments",
    receipt_number: receiptFrom(row),
    student_id: text(row.student_id),
    student_name: text(row.student_name),
    class_name: text(row.class_name),
    item_name: text(row.item_name || row.book_name || "Books"),
    total_amount: num(row.total_amount),
    amount_paid: num(row.amount_paid),
    balance: num(row.balance),
    term: text(row.term),
    academic_year: text(row.academic_year),
    received_by: text(row.received_by),
    payment_note: text(row.payment_note),
    created_at: dateFrom(row),
  };
}

function normalizeUniform(row: any): UniversalPayment {
  return {
    id: text(row.id),
    module: "Uniforms",
    source_table: "jsms_uniform_payments",
    receipt_number: receiptFrom(row),
    student_id: text(row.student_id),
    student_name: text(row.student_name),
    class_name: text(row.class_name),
    item_name: text(row.item_name || "Uniform"),
    total_amount: num(row.total_amount),
    amount_paid: num(row.amount_paid),
    balance: num(row.balance),
    term: text(row.term),
    academic_year: text(row.academic_year),
    received_by: text(row.received_by),
    payment_note: text(row.payment_note),
    created_at: dateFrom(row),
  };
}

function normalizeAdmission(row: any): UniversalPayment {
  return {
    id: text(row.id),
    module: "Admission",
    source_table: "jsms_admission_payments",
    receipt_number: receiptFrom(row),
    student_id: text(row.student_id),
    student_name: text(row.student_name),
    class_name: text(row.class_name),
    item_name: text(row.item_name || "Admission"),
    total_amount: num(row.total_amount),
    amount_paid: num(row.amount_paid),
    balance: num(row.balance),
    term: text(row.term),
    academic_year: text(row.academic_year),
    received_by: text(row.received_by),
    payment_note: text(row.payment_note),
    created_at: dateFrom(row),
  };
}

function sameStudent(a: UniversalPayment, b: UniversalPayment) {
  const aId = text(a.student_id).toLowerCase();
  const bId = text(b.student_id).toLowerCase();

  if (aId && bId && aId === bId) return true;

  const aName = text(a.student_name).toLowerCase();
  const bName = text(b.student_name).toLowerCase();

  const aClass = text(a.class_name).toLowerCase();
  const bClass = text(b.class_name).toLowerCase();

  return Boolean(
    aName && bName && aClass && bClass && aName === bName && aClass === bClass
  );
}

async function safeRead(table: string) {
  const result = await supabase.from(table).select("*");

  if (result.error) return [];

  return result.data || [];
}

export async function getUniversalPayments() {
  const [feeRows, bookRows, uniformRows, admissionRows] = await Promise.all([
    safeRead("fee_payments"),
    safeRead("jsms_book_payments"),
    safeRead("jsms_uniform_payments"),
    safeRead("jsms_admission_payments"),
  ]);

  return [
    ...feeRows.map(normalizeFee),
    ...bookRows.map(normalizeBook),
    ...uniformRows.map(normalizeUniform),
    ...admissionRows.map(normalizeAdmission),
  ]
    .filter((row) => row.receipt_number)
    .sort((a, b) => {
      const aTime = new Date(a.created_at || "").getTime();
      const bTime = new Date(b.created_at || "").getTime();

      return bTime - aTime;
    });
}

export async function getUniversalReceiptSuggestions(query: string) {
  const q = receiptKey(query);

  if (!q) return [];

  const allPayments = await getUniversalPayments();

  return allPayments
    .filter((payment) => {
      const r = receiptKey(payment.receipt_number);
      const student = `${payment.student_name} ${payment.class_name}`.toLowerCase();

      return r.includes(q) || student.includes(query.toLowerCase());
    })
    .slice(0, 10);
}

export async function searchUniversalReceipt(
  receiptNumber: string
): Promise<UniversalReceiptResult> {
  const receipt = text(receiptNumber);
  const key = receiptKey(receipt);

  if (!key) {
    return {
      searchedReceipt: null,
      studentPayments: [],
      error: "Enter a receipt number.",
    };
  }

  const allPayments = await getUniversalPayments();

  const exactMatch =
    allPayments.find((row) => receiptKey(row.receipt_number) === key) || null;

  const looseMatch =
    exactMatch ||
    allPayments.find((row) => receiptKey(row.receipt_number).includes(key)) ||
    null;

  if (!looseMatch) {
    return {
      searchedReceipt: null,
      studentPayments: [],
      error: "No receipt found.",
    };
  }

  const studentPayments = allPayments.filter((payment) =>
    sameStudent(payment, looseMatch)
  );

  return {
    searchedReceipt: looseMatch,
    studentPayments,
    error: "",
  };
}