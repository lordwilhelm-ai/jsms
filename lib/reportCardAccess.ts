/**
 * PASTE THIS FILE AT:
 *   lib/reportCardAccess.ts
 *
 * (same folder as lib/supabase.ts)
 */

export type AccessRecord = {
  id: string;
  client_name: string | null;
  system_name: string | null;
  amount: number | null;
  is_paid: boolean | null;
  test_clear_active: boolean | null;
  paid_student_count: number | null;
  last_paid_at: string | null;
  cycle_start_at: string | null;
};

export type AccessResult = {
  canAccess: boolean;
  amountDue: number;
  record: AccessRecord | null;
  reason: "owing" | "no_record" | null;
};

const CLIENT_NAME = "jefsem vision school";
const SYSTEM_NAME = "report card system";

function normalize(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function isJefsemRecord(row: AccessRecord): boolean {
  return (
    normalize(row.client_name) === CLIENT_NAME &&
    normalize(row.system_name) === SYSTEM_NAME
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function canAccessReportCard(supabase: any): Promise<AccessResult> {
  const { data, error } = await supabase
    .from("rc_licenses")
    .select(
      "id,client_name,system_name,amount,is_paid,test_clear_active,paid_student_count,last_paid_at,cycle_start_at"
    )
    .order("created_at", { ascending: false });

  if (error || !data) {
    return { canAccess: false, amountDue: 0, record: null, reason: "no_record" };
  }

  const record: AccessRecord | null =
    (data as AccessRecord[]).find(isJefsemRecord) ?? null;

  if (!record) {
    return { canAccess: false, amountDue: 0, record: null, reason: "no_record" };
  }

  if (record.test_clear_active === true) {
    return { canAccess: true, amountDue: 0, record, reason: null };
  }

  const amount = Number(record.amount ?? 0);

  if (amount <= 0) {
    return { canAccess: true, amountDue: 0, record, reason: null };
  }

  return { canAccess: false, amountDue: amount, record, reason: "owing" };
}
