"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type Section = "dashboard" | "payment" | "given" | "records";
type AnyRow = Record<string, any>;

type StudentOption = {
  student_id: string;
  student_name: string;
  class_name: string;
};

type ClassRow = {
  id?: string;
  name?: string | null;
  class_name?: string | null;
  fee_lacoste?: number | string | null;
  fee_monwed?: number | string | null;
  fee_friday?: number | string | null;
};

type UniformOption = {
  key: "lacoste" | "monwed" | "friday";
  label: string;
  price: number;
};

type UniformPayment = {
  id: string;
  student_id: string | null;
  student_name: string | null;
  class_name: string | null;
  receipt_number: string | null;
  item_name: string | null;
  selected_items: any;
  total_amount: number;
  amount_paid: number;
  balance: number;
  payment_status: string | null;
  receipt_issued_by: string | null;
  received_by?: string | null;
  payment_note: string | null;
  term: string | null;
  academic_year: string | null;
  created_at: string;
};

type UniformPaymentItem = {
  id: string;
  payment_id: string | null;
  receipt_number: string | null;
  student_id: string | null;
  student_name: string | null;
  class_name: string | null;
  item_name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  created_at: string;
};

type UniformGiven = {
  id: string;
  payment_id: string | null;
  receipt_number: string | null;
  student_id: string | null;
  student_name: string | null;
  class_name: string | null;
  item_name: string;
  quantity_given: number;
  given_by: string | null;
  given_at: string | null;
  note: string | null;
  created_at: string;
};

const UNIFORM_KEYS = ["lacoste", "monwed", "friday"] as const;

const COLORS = {
  page: "#fffaf0",
  deep: "#0f172a",
  gold: "#d4a017",
  goldSoft: "#fff7d6",
  green: "#0f7a3b",
  border: "#f2d98b",
  muted: "#6b7280",
  red: "#991b1b",
  orange: "#9a3412",
};

function clean(value: unknown) {
  return String(value || "").trim();
}

function numberValue(value: unknown) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

function money(value: number) {
  return `GHS ${numberValue(value).toFixed(2)}`;
}

function getTodayReceiptCode() {
  const now = new Date();
  const year = String(now.getFullYear()).slice(-2);
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}${day}`;
}

function getDayRange() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);

  const end = new Date();
  end.setHours(23, 59, 59, 999);

  return { start: start.toISOString(), end: end.toISOString() };
}

function getLastFourStudentId(studentId: string) {
  const digitsOnly = clean(studentId).replace(/\D/g, "");
  if (digitsOnly.length < 4) throw new Error("Student ID must contain at least 4 numbers.");
  return digitsOnly.slice(-4);
}

function findRealJvsId(row: any) {
  const direct =
    row.jvs_id ||
    row.student_id ||
    row.jsms_id ||
    row.jvs_student_id ||
    row.jvs_code ||
    row.student_code ||
    row.student_number ||
    row.admission_number ||
    row.index_number ||
    row.jvsId ||
    row.studentId ||
    row.id_number ||
    "";

  if (String(direct || "").toUpperCase().startsWith("JVS")) return String(direct);

  for (const value of Object.values(row)) {
    const text = String(value || "");
    const match = text.match(/JVS\s*\d{4,}/i);
    if (match) return match[0].replace(/\s+/g, "").toUpperCase();
  }

  return String(direct || "");
}

function getClassName(row: AnyRow | null | undefined) {
  return clean(row?.class_name || row?.className || row?.name || row?.student_class || row?.class);
}

function sameClass(a: string | null | undefined, b: string | null | undefined) {
  return clean(a).toLowerCase() === clean(b).toLowerCase();
}

function getPaymentStatus(total: number, paid: number) {
  const balance = Math.max(total - paid, 0);
  if (balance <= 0 && paid > 0) return "paid";
  if (paid > 0) return "part_paid";
  return "unpaid";
}

function statusLabel(status: string | null | undefined) {
  if (status === "paid") return "Paid";
  if (status === "part_paid") return "Part Paid";
  return "Owing";
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function isActiveStudent(row: AnyRow) {
  if (typeof row.active === "boolean") return row.active;
  if (typeof row.is_active === "boolean") return row.is_active;
  if (typeof row.left_school === "boolean") return !row.left_school;
  if (row.status) return !["inactive", "left", "withdrawn"].includes(clean(row.status).toLowerCase());
  return true;
}

function getUniformOptions(classRow: ClassRow | undefined): UniformOption[] {
  return [
    { key: "lacoste", label: "Lacoste", price: numberValue(classRow?.fee_lacoste) },
    { key: "monwed", label: "Mon to Wed Wear", price: numberValue(classRow?.fee_monwed) },
    { key: "friday", label: "Fri Wear", price: numberValue(classRow?.fee_friday) },
  ];
}

export default function UniformsPage() {
  const [activeSection, setActiveSection] = useState<Section>("dashboard");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [payments, setPayments] = useState<UniformPayment[]>([]);
  const [paymentItems, setPaymentItems] = useState<UniformPaymentItem[]>([]);
  const [givenItems, setGivenItems] = useState<UniformGiven[]>([]);

  const [currentUserName, setCurrentUserName] = useState("Admin");
  const [currentTerm, setCurrentTerm] = useState("Current Term");
  const [academicYear, setAcademicYear] = useState("");

  const [classFilter, setClassFilter] = useState("");
  const [message, setMessage] = useState("");

  const [paymentForm, setPaymentForm] = useState({
    student_search: "",
    student_id: "",
    student_name: "",
    class_name: "",
    amount_paid: "",
    note: "",
  });

  const [selectedUniforms, setSelectedUniforms] = useState<string[]>([]);

  const [givenForm, setGivenForm] = useState({
    payment_id: "",
    note: "",
  });
  const [givenSelections, setGivenSelections] = useState<Record<string, boolean>>({});

  useEffect(() => {
    void loadEverything();
  }, []);

  async function loadEverything() {
    setLoading(true);
    setLoadError("");
    setMessage("");

    await Promise.all([loadUser(), loadSettings(), loadClasses(), loadStudents(), loadUniformData()]);

    setLoading(false);
  }

  async function loadUser() {
    const { data: { session } } = await supabase.auth.getSession();
    const email = clean(session?.user?.email).toLowerCase();
    const userId = clean(session?.user?.id);

    if (!email && !userId) return;

    const { data } = await supabase.from("teachers").select("*");
    const userRow =
      data?.find((item: any) => clean(item.auth_user_id) === userId) ||
      data?.find((item: any) => clean(item.email).toLowerCase() === email) ||
      null;

    setCurrentUserName(clean(userRow?.full_name || userRow?.name || userRow?.teacher_name || session?.user?.email || "Admin"));
  }

  async function loadSettings() {
    const possibleTables = ["school_settings", "jsms_settings", "settings"];

    for (const table of possibleTables) {
      const result = await supabase.from(table).select("*").limit(1).maybeSingle();
      if (!result.error && result.data) {
        const row = result.data as any;
        const term = row.current_term || row.active_term || row.term || row.school_term || "";
        const year = row.academic_year || row.current_academic_year || row.school_year || "";
        if (term) setCurrentTerm(String(term));
        if (year) setAcademicYear(String(year));
        return;
      }
    }
  }

  async function loadClasses() {
    const result = await supabase.from("classes").select("*").order("class_order", { ascending: true });
    if (!result.error) setClasses((result.data || []) as ClassRow[]);
  }

  async function loadStudents() {
    const possibleTables = ["students", "jsms_students", "student_names", "students_names", "students_names_and_classes"];

    for (const table of possibleTables) {
      const result = await supabase.from(table).select("*");
      if (!result.error && result.data && result.data.length > 0) {
        const normalized = normalizeStudents(result.data).filter((item) => item.student_name && item.class_name);
        if (normalized.length > 0) {
          setStudents(normalized);
          return;
        }
      }
    }

    setStudents([]);
  }

  function normalizeStudents(rows: any[]): StudentOption[] {
    return rows
      .filter(isActiveStudent)
      .map((row) => {
        const name =
          row.student_name ||
          row.full_name ||
          row.fullname ||
          row.name ||
          row.studentName ||
          row.fullName ||
          `${row.first_name || ""} ${row.other_name || ""} ${row.last_name || ""}`.trim();

        const className =
          row.class_name ||
          row.class ||
          row.current_class ||
          row.grade ||
          row.className ||
          row.student_class ||
          "";

        return {
          student_id: clean(findRealJvsId(row)),
          student_name: clean(name),
          class_name: clean(className),
        };
      });
  }

  async function loadUniformData() {
    const [paymentsRes, itemsRes, givenRes] = await Promise.all([
      supabase.from("jsms_uniform_payments").select("*").order("created_at", { ascending: false }),
      supabase.from("jsms_uniform_payment_items").select("*").order("created_at", { ascending: false }),
      supabase.from("jsms_uniforms_given").select("*").order("created_at", { ascending: false }),
    ]);

    if (paymentsRes.error) setLoadError(`Uniform payments issue: ${paymentsRes.error.message}. Run the uniform SQL setup first.`);
    else setPayments((paymentsRes.data || []) as UniformPayment[]);

    if (!itemsRes.error) setPaymentItems((itemsRes.data || []) as UniformPaymentItem[]);
    if (!givenRes.error) setGivenItems((givenRes.data || []) as UniformGiven[]);
  }

  const selectedClassRow = useMemo(() => {
    return classes.find((row) => sameClass(getClassName(row as AnyRow), paymentForm.class_name));
  }, [classes, paymentForm.class_name]);

  const uniformOptions = useMemo(() => getUniformOptions(selectedClassRow), [selectedClassRow]);

  const selectedUniformOptions = useMemo(() => {
    return uniformOptions.filter((item) => selectedUniforms.includes(item.key));
  }, [uniformOptions, selectedUniforms]);

  const paymentTotal = selectedUniformOptions.reduce((sum, item) => sum + numberValue(item.price), 0);
  const paymentPaid = numberValue(paymentForm.amount_paid);
  const paymentBalance = Math.max(paymentTotal - paymentPaid, 0);
  const nextPaymentStatus = getPaymentStatus(paymentTotal, paymentPaid);

  const filteredPayments = useMemo(() => {
    if (!classFilter) return payments;
    return payments.filter((payment) => sameClass(payment.class_name, classFilter));
  }, [payments, classFilter]);

  const stats = useMemo(() => {
    const totalCollected = payments.reduce((sum, item) => sum + numberValue(item.amount_paid), 0);
    const totalBalance = payments.reduce((sum, item) => sum + Math.max(numberValue(item.balance), 0), 0);
    const owing = payments.filter((item) => numberValue(item.balance) > 0).length;

    return {
      payments: payments.length,
      collected: totalCollected,
      balance: totalBalance,
      owing,
      given: givenItems.length,
    };
  }, [payments, givenItems]);

  const studentSuggestions = useMemo(() => {
    const value = clean(paymentForm.student_search).toLowerCase();
    if (!value) return [];

    return students
      .filter((student) => {
        const text = `${student.student_id} ${student.student_name} ${student.class_name}`.toLowerCase();
        return text.includes(value);
      })
      .slice(0, 8);
  }, [students, paymentForm.student_search]);

  const selectedPaymentForGiven = useMemo(() => {
    return payments.find((item) => item.id === givenForm.payment_id);
  }, [payments, givenForm.payment_id]);

  const selectedPaymentItemsForGiven = useMemo(() => {
    if (!selectedPaymentForGiven) return [];
    return paymentItems.filter((item) => item.payment_id === selectedPaymentForGiven.id);
  }, [paymentItems, selectedPaymentForGiven]);

  const alreadyGivenForSelectedPayment = useMemo(() => {
    if (!selectedPaymentForGiven) return new Set<string>();
    const existing = givenItems
      .filter((item) => item.payment_id === selectedPaymentForGiven.id)
      .map((item) => clean(item.item_name).toLowerCase());
    return new Set(existing);
  }, [givenItems, selectedPaymentForGiven]);

  async function generateReceiptNumber(studentId: string) {
    const lastFour = getLastFourStudentId(studentId);
    const today = getTodayReceiptCode();
    const { start, end } = getDayRange();
    const prefix = `JVSU/${today}/${lastFour}`;

    const { data } = await supabase
      .from("jsms_uniform_payments")
      .select("receipt_number, created_at")
      .gte("created_at", start)
      .lte("created_at", end);

    const count = (data || []).filter((row: any) => clean(row.receipt_number).startsWith(prefix)).length + 1;
    return `${prefix}/${String(count).padStart(2, "0")}`;
  }

  function handleStudentPick(student: StudentOption) {
    setPaymentForm((prev) => ({
      ...prev,
      student_search: `${student.student_name} - ${student.student_id}`,
      student_id: student.student_id,
      student_name: student.student_name,
      class_name: student.class_name,
    }));
    setSelectedUniforms([]);
    setMessage("");
  }

  async function safeInsert(table: string, payload: AnyRow) {
    const result = await supabase.from(table).insert(payload);
    return !result.error;
  }

  async function handleRecordPayment() {
    try {
      setMessage("");

      if (!paymentForm.student_id || !paymentForm.student_name || !paymentForm.class_name) {
        throw new Error("Select a student first.");
      }

      if (selectedUniformOptions.length === 0) {
        throw new Error("Select at least one uniform item.");
      }

      if (paymentTotal <= 0) {
        throw new Error("Selected uniform price is 0. Set Lacoste, Mon-Wed, and Friday prices in Fee Structure first.");
      }

      if (paymentPaid < 0) throw new Error("Amount paid cannot be negative.");
      if (paymentPaid > paymentTotal) throw new Error("Amount paid cannot be more than total amount.");

      const receipt = await generateReceiptNumber(paymentForm.student_id);
      const itemNames = selectedUniformOptions.map((item) => item.label).join(", ");

      const paymentPayload = {
        student_id: paymentForm.student_id,
        student_name: paymentForm.student_name,
        class_name: paymentForm.class_name,
        receipt_number: receipt,
        item_name: itemNames,
        selected_items: selectedUniformOptions.map((item) => ({
          key: item.key,
          item_name: item.label,
          price: item.price,
          quantity: 1,
        })),
        total_amount: paymentTotal,
        amount_paid: paymentPaid,
        balance: paymentBalance,
        payment_status: nextPaymentStatus,
        receipt_issued_by: currentUserName,
        received_by: currentUserName,
        payment_note: paymentForm.note,
        term: currentTerm,
        academic_year: academicYear,
      };

      const { data: paymentData, error } = await supabase
        .from("jsms_uniform_payments")
        .insert(paymentPayload)
        .select("*")
        .single();

      if (error) throw error;

      const itemsPayload = selectedUniformOptions.map((item) => ({
        payment_id: paymentData.id,
        receipt_number: receipt,
        student_id: paymentForm.student_id,
        student_name: paymentForm.student_name,
        class_name: paymentForm.class_name,
        item_name: item.label,
        quantity: 1,
        unit_price: item.price,
        total_price: item.price,
      }));

      const itemInsert = await supabase.from("jsms_uniform_payment_items").insert(itemsPayload);
      if (itemInsert.error) throw itemInsert.error;

      await safeInsert("jsms_all_payment_logs", {
        receipt_number: receipt,
        student_id: paymentForm.student_id,
        student_name: paymentForm.student_name,
        class_name: paymentForm.class_name,
        module: "uniforms",
        item_name: itemNames,
        amount_paid: paymentPaid,
        total_amount: paymentTotal,
        balance: paymentBalance,
        payment_status: nextPaymentStatus,
        received_by: currentUserName,
        term: currentTerm,
        academic_year: academicYear,
      });

      await safeInsert("universal_receipts", {
        receipt_number: receipt,
        student_id: paymentForm.student_id,
        student_name: paymentForm.student_name,
        class_name: paymentForm.class_name,
        module: "uniforms",
        item_name: itemNames,
        amount_paid: paymentPaid,
        total_amount: paymentTotal,
        balance: paymentBalance,
        issued_by: currentUserName,
        term: currentTerm,
        academic_year: academicYear,
      });

      setPaymentForm({
        student_search: "",
        student_id: "",
        student_name: "",
        class_name: "",
        amount_paid: "",
        note: "",
      });
      setSelectedUniforms([]);
      setMessage(`Uniform payment recorded. Receipt: ${receipt}`);
      setActiveSection("records");
      await loadUniformData();
    } catch (error: any) {
      setMessage(`Error: ${error?.message || "Could not record uniform payment."}`);
    }
  }

  async function handleMarkGiven() {
    try {
      setMessage("");
      if (!selectedPaymentForGiven) throw new Error("Select a payment receipt first.");

      const selectedItems = selectedPaymentItemsForGiven.filter((item) => givenSelections[item.id]);
      if (selectedItems.length === 0) throw new Error("Select at least one uniform item to mark as given.");

      const payload = selectedItems.map((item) => ({
        payment_id: selectedPaymentForGiven.id,
        receipt_number: selectedPaymentForGiven.receipt_number,
        student_id: selectedPaymentForGiven.student_id,
        student_name: selectedPaymentForGiven.student_name,
        class_name: selectedPaymentForGiven.class_name,
        item_name: item.item_name,
        quantity_given: 1,
        given_by: currentUserName,
        given_at: new Date().toISOString(),
        note: givenForm.note,
      }));

      const result = await supabase.from("jsms_uniforms_given").insert(payload);
      if (result.error) throw result.error;

      setGivenForm({ payment_id: "", note: "" });
      setGivenSelections({});
      setMessage("Uniform item(s) marked as given.");
      await loadUniformData();
    } catch (error: any) {
      setMessage(`Error: ${error?.message || "Could not mark uniform as given."}`);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-[#fffaf0] p-6">
        <div className="rounded-3xl bg-white p-6 text-center text-sm font-black text-gray-500 shadow-sm">
          Loading uniforms...
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#fffaf0] text-gray-950">
      <style jsx global>{`
        button, a, input, select, textarea { transition: all 0.18s ease; }
        button:hover, a:hover { transform: translateY(-1px); }
      `}</style>

      <section className="mx-auto flex max-w-[1500px] gap-5 p-4 max-lg:flex-col">
        <aside className="sticky top-4 h-fit w-[270px] rounded-[28px] border-2 border-yellow-400 bg-slate-950 p-5 text-white shadow-xl max-lg:static max-lg:w-full">
          <p className="text-xs font-black uppercase tracking-widest text-yellow-200">Uniform Module</p>
          <h1 className="mt-2 text-2xl font-black">Uniforms</h1>
          <p className="mt-2 text-sm font-semibold text-gray-300">
            Lacoste, Mon to Wed Wear, and Fri Wear prices are pulled from Fee Structure.
          </p>

          <nav className="mt-6 grid gap-2">
            <SideButton active={activeSection === "dashboard"} onClick={() => setActiveSection("dashboard")}>Dashboard</SideButton>
            <SideButton active={activeSection === "payment"} onClick={() => setActiveSection("payment")}>Record Payment</SideButton>
            <SideButton active={activeSection === "given"} onClick={() => setActiveSection("given")}>Give Uniform</SideButton>
            <SideButton active={activeSection === "records"} onClick={() => setActiveSection("records")}>Records</SideButton>
          </nav>

          <Link href="/dashboard/admin" className="mt-6 block rounded-2xl bg-white/10 px-4 py-3 text-center text-sm font-black text-yellow-100">
            Back to JSMS Dashboard
          </Link>
        </aside>

        <section className="flex-1 space-y-5">
          <header className="rounded-[30px] border-2 border-yellow-400 bg-gradient-to-br from-slate-950 to-gray-800 p-6 text-white shadow-xl">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-widest text-yellow-200">JSMS Uniform Module</p>
                <h2 className="mt-2 text-3xl font-black">Uniform Sales & Issuing</h2>
                <p className="mt-2 text-sm font-semibold text-gray-300">
                  {academicYear || "Academic Year"} • {currentTerm || "Current Term"}
                </p>
              </div>
              <button onClick={() => void loadEverything()} className="rounded-2xl bg-yellow-500 px-4 py-3 text-sm font-black text-white shadow-sm">
                Refresh
              </button>
            </div>
          </header>

          {loadError ? <Alert danger>{loadError}</Alert> : null}
          {message ? <Alert danger={message.startsWith("Error:")}>{message}</Alert> : null}

          {activeSection === "dashboard" && (
            <DashboardSection stats={stats} payments={payments} givenItems={givenItems} />
          )}

          {activeSection === "payment" && (
            <PaymentSection
              paymentForm={paymentForm}
              setPaymentForm={setPaymentForm}
              studentSuggestions={studentSuggestions}
              handleStudentPick={handleStudentPick}
              uniformOptions={uniformOptions}
              selectedUniforms={selectedUniforms}
              setSelectedUniforms={setSelectedUniforms}
              paymentTotal={paymentTotal}
              paymentPaid={paymentPaid}
              paymentBalance={paymentBalance}
              nextPaymentStatus={nextPaymentStatus}
              handleRecordPayment={handleRecordPayment}
            />
          )}

          {activeSection === "given" && (
            <GivenSection
              payments={payments}
              givenForm={givenForm}
              setGivenForm={setGivenForm}
              selectedPaymentForGiven={selectedPaymentForGiven}
              selectedPaymentItemsForGiven={selectedPaymentItemsForGiven}
              alreadyGivenForSelectedPayment={alreadyGivenForSelectedPayment}
              givenSelections={givenSelections}
              setGivenSelections={setGivenSelections}
              handleMarkGiven={handleMarkGiven}
            />
          )}

          {activeSection === "records" && (
            <RecordsSection
              payments={filteredPayments}
              givenItems={givenItems}
              classFilter={classFilter}
              setClassFilter={setClassFilter}
              classOptions={[...new Set(classes.map((row) => getClassName(row as AnyRow)).filter(Boolean))]}
            />
          )}
        </section>
      </section>
    </main>
  );
}

function SideButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-2xl px-4 py-3 text-left text-sm font-black ${active ? "bg-yellow-500 text-white" : "bg-white/10 text-yellow-100"}`}
    >
      {children}
    </button>
  );
}

function Alert({ danger, children }: { danger?: boolean; children: React.ReactNode }) {
  return (
    <div className={`rounded-3xl border p-4 text-sm font-black ${danger ? "border-red-200 bg-red-50 text-red-700" : "border-green-200 bg-green-50 text-green-700"}`}>
      {children}
    </div>
  );
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-3xl border border-yellow-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-black uppercase tracking-wider text-gray-500">{label}</p>
      <div className="mt-2 text-xl font-black text-gray-950">{value}</div>
    </div>
  );
}

function DashboardSection({ stats, payments, givenItems }: { stats: any; payments: UniformPayment[]; givenItems: UniformGiven[] }) {
  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-5">
        <Info label="Payments" value={stats.payments} />
        <Info label="Collected" value={money(stats.collected)} />
        <Info label="Balance" value={money(stats.balance)} />
        <Info label="Owing" value={stats.owing} />
        <Info label="Given" value={stats.given} />
      </div>

      <Panel title="Recent Uniform Payments">
        <SimpleTable
          headers={["Receipt", "Student", "Items", "Paid", "Balance", "Status"]}
          rows={payments.slice(0, 8).map((payment) => [
            payment.receipt_number || "-",
            payment.student_name || "-",
            payment.item_name || "-",
            money(numberValue(payment.amount_paid)),
            money(numberValue(payment.balance)),
            statusLabel(payment.payment_status),
          ])}
          empty="No uniform payments yet."
        />
      </Panel>

      <Panel title="Recently Given Uniforms">
        <SimpleTable
          headers={["Student", "Class", "Item", "Given By", "Date"]}
          rows={givenItems.slice(0, 8).map((item) => [
            item.student_name || "-",
            item.class_name || "-",
            item.item_name,
            item.given_by || "-",
            formatDate(item.given_at || item.created_at),
          ])}
          empty="No uniform issued yet."
        />
      </Panel>
    </div>
  );
}

function PaymentSection({
  paymentForm,
  setPaymentForm,
  studentSuggestions,
  handleStudentPick,
  uniformOptions,
  selectedUniforms,
  setSelectedUniforms,
  paymentTotal,
  paymentPaid,
  paymentBalance,
  nextPaymentStatus,
  handleRecordPayment,
}: {
  paymentForm: any;
  setPaymentForm: React.Dispatch<React.SetStateAction<any>>;
  studentSuggestions: StudentOption[];
  handleStudentPick: (student: StudentOption) => void;
  uniformOptions: UniformOption[];
  selectedUniforms: string[];
  setSelectedUniforms: React.Dispatch<React.SetStateAction<string[]>>;
  paymentTotal: number;
  paymentPaid: number;
  paymentBalance: number;
  nextPaymentStatus: string;
  handleRecordPayment: () => void;
}) {
  return (
    <Panel title="Record Uniform Payment">
      <p className="mb-4 text-sm font-semibold text-gray-500">
        Select student first. The page will pull Lacoste, Mon-Wed, and Friday prices from the student's class fee structure.
      </p>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="relative">
          <TextInput
            placeholder="Search student by name or ID"
            value={paymentForm.student_search}
            onChange={(value) =>
              setPaymentForm((prev: any) => ({
                ...prev,
                student_search: value,
                student_id: "",
                student_name: "",
                class_name: "",
              }))
            }
          />

          {studentSuggestions.length > 0 && !paymentForm.student_id ? (
            <div className="absolute left-0 right-0 top-12 z-30 overflow-hidden rounded-2xl border border-yellow-200 bg-white shadow-xl">
              {studentSuggestions.map((student) => (
                <button
                  key={`${student.student_id}-${student.student_name}-${student.class_name}`}
                  type="button"
                  onClick={() => handleStudentPick(student)}
                  className="block w-full border-b border-yellow-50 px-4 py-3 text-left text-sm font-bold hover:bg-yellow-50"
                >
                  {student.student_name} • {student.student_id} • {student.class_name}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <TextInput placeholder="Class" value={paymentForm.class_name} disabled onChange={() => {}} />
      </div>

      <div className="mt-4 rounded-3xl border border-yellow-200 bg-[#fffdf6] p-4">
        <p className="mb-3 text-sm font-black text-gray-950">Uniform Items</p>

        {!paymentForm.class_name ? (
          <p className="text-sm font-bold text-gray-500">Pick a student to show uniform prices.</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-3">
            {uniformOptions.map((item) => (
              <label key={item.key} className="flex cursor-pointer items-center justify-between gap-3 rounded-2xl border border-yellow-100 bg-white p-3 text-sm font-bold shadow-sm">
                <span>
                  {item.label}
                  <span className="mt-1 block text-xs text-gray-500">{money(item.price)}</span>
                </span>
                <input
                  type="checkbox"
                  checked={selectedUniforms.includes(item.key)}
                  onChange={(e) => {
                    setSelectedUniforms((prev) => {
                      if (e.target.checked) return [...prev, item.key];
                      return prev.filter((key) => key !== item.key);
                    });
                  }}
                />
              </label>
            ))}
          </div>
        )}
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <TextInput
          placeholder="Amount paid"
          type="number"
          value={paymentForm.amount_paid}
          onChange={(value) => setPaymentForm((prev: any) => ({ ...prev, amount_paid: value }))}
        />
        <TextInput
          placeholder="Note"
          value={paymentForm.note}
          onChange={(value) => setPaymentForm((prev: any) => ({ ...prev, note: value }))}
        />
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-4">
        <Info label="Total" value={money(paymentTotal)} />
        <Info label="Paid" value={money(paymentPaid)} />
        <Info label="Balance" value={money(paymentBalance)} />
        <Info label="Status" value={statusLabel(nextPaymentStatus)} />
      </div>

      <ActionButton onClick={handleRecordPayment}>Record Uniform Payment</ActionButton>
    </Panel>
  );
}

function GivenSection({
  payments,
  givenForm,
  setGivenForm,
  selectedPaymentForGiven,
  selectedPaymentItemsForGiven,
  alreadyGivenForSelectedPayment,
  givenSelections,
  setGivenSelections,
  handleMarkGiven,
}: {
  payments: UniformPayment[];
  givenForm: any;
  setGivenForm: React.Dispatch<React.SetStateAction<any>>;
  selectedPaymentForGiven?: UniformPayment;
  selectedPaymentItemsForGiven: UniformPaymentItem[];
  alreadyGivenForSelectedPayment: Set<string>;
  givenSelections: Record<string, boolean>;
  setGivenSelections: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  handleMarkGiven: () => void;
}) {
  return (
    <Panel title="Give Uniform To Student">
      <p className="mb-4 text-sm font-semibold text-gray-500">
        This side records what has actually been given to the student.
      </p>

      <div className="grid gap-3 md:grid-cols-2">
        <select
          value={givenForm.payment_id}
          onChange={(e) => {
            setGivenForm((prev: any) => ({ ...prev, payment_id: e.target.value }));
            setGivenSelections({});
          }}
          className="h-11 rounded-2xl border border-yellow-200 bg-[#fffdf6] px-3 text-sm font-semibold outline-none"
        >
          <option value="">Select receipt</option>
          {payments.map((payment) => (
            <option key={payment.id} value={payment.id}>
              {payment.receipt_number} - {payment.student_name} - {payment.item_name}
            </option>
          ))}
        </select>

        <TextInput
          placeholder="Note"
          value={givenForm.note}
          onChange={(value) => setGivenForm((prev: any) => ({ ...prev, note: value }))}
        />
      </div>

      {selectedPaymentForGiven ? (
        <div className="mt-4 rounded-3xl border border-yellow-200 bg-[#fffdf6] p-4">
          <p className="text-sm font-black text-gray-950">
            {selectedPaymentForGiven.student_name} • {selectedPaymentForGiven.class_name}
          </p>
          <p className="mt-1 text-xs font-bold text-gray-500">Receipt: {selectedPaymentForGiven.receipt_number}</p>

          <div className="mt-4 grid gap-2 md:grid-cols-3">
            {selectedPaymentItemsForGiven.map((item) => {
              const isGiven = alreadyGivenForSelectedPayment.has(clean(item.item_name).toLowerCase());
              return (
                <label key={item.id} className={`flex items-center justify-between rounded-2xl border p-3 text-sm font-bold ${isGiven ? "border-green-200 bg-green-50 text-green-700" : "border-yellow-100 bg-white"}`}>
                  <span>
                    {item.item_name}
                    {isGiven ? <span className="block text-xs">Already given</span> : null}
                  </span>
                  <input
                    type="checkbox"
                    disabled={isGiven}
                    checked={Boolean(givenSelections[item.id])}
                    onChange={(e) => setGivenSelections((prev) => ({ ...prev, [item.id]: e.target.checked }))}
                  />
                </label>
              );
            })}
          </div>
        </div>
      ) : null}

      <ActionButton onClick={handleMarkGiven}>Mark Selected As Given</ActionButton>
    </Panel>
  );
}

function RecordsSection({
  payments,
  givenItems,
  classFilter,
  setClassFilter,
  classOptions,
}: {
  payments: UniformPayment[];
  givenItems: UniformGiven[];
  classFilter: string;
  setClassFilter: (value: string) => void;
  classOptions: string[];
}) {
  return (
    <div className="space-y-5">
      <Panel title="Filter Records">
        <select
          value={classFilter}
          onChange={(e) => setClassFilter(e.target.value)}
          className="h-11 w-full rounded-2xl border border-yellow-200 bg-[#fffdf6] px-3 text-sm font-semibold outline-none md:w-72"
        >
          <option value="">All classes</option>
          {classOptions.map((className) => (
            <option key={className} value={className}>{className}</option>
          ))}
        </select>
      </Panel>

      <Panel title="Uniform Payments">
        <SimpleTable
          headers={["Date", "Receipt", "Student", "Class", "Items", "Total", "Paid", "Balance", "Status"]}
          rows={payments.map((payment) => [
            formatDate(payment.created_at),
            payment.receipt_number || "-",
            payment.student_name || "-",
            payment.class_name || "-",
            payment.item_name || "-",
            money(numberValue(payment.total_amount)),
            money(numberValue(payment.amount_paid)),
            money(numberValue(payment.balance)),
            statusLabel(payment.payment_status),
          ])}
          empty="No uniform payments yet."
        />
      </Panel>

      <Panel title="Uniforms Given">
        <SimpleTable
          headers={["Date", "Receipt", "Student", "Class", "Item", "Given By"]}
          rows={givenItems.map((item) => [
            formatDate(item.given_at || item.created_at),
            item.receipt_number || "-",
            item.student_name || "-",
            item.class_name || "-",
            item.item_name,
            item.given_by || "-",
          ])}
          empty="No uniform issued yet."
        />
      </Panel>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[28px] border border-yellow-200 bg-white p-5 shadow-sm">
      <h2 className="mb-4 text-lg font-black text-gray-950">{title}</h2>
      {children}
    </section>
  );
}

function TextInput({
  value,
  onChange,
  placeholder,
  type = "text",
  disabled = false,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  type?: string;
  disabled?: boolean;
}) {
  return (
    <input
      type={type}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="h-11 rounded-2xl border border-yellow-200 bg-[#fffdf6] px-3 text-sm font-semibold outline-none disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500"
    />
  );
}

function ActionButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-4 rounded-2xl bg-yellow-500 px-5 py-3 text-sm font-black text-white shadow-sm active:scale-[0.99]"
    >
      {children}
    </button>
  );
}

function SimpleTable({ headers, rows, empty }: { headers: string[]; rows: React.ReactNode[][]; empty: string }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] border-separate border-spacing-y-2 text-left text-sm">
        <thead>
          <tr>
            {headers.map((header) => (
              <th key={header} className="px-3 py-2 text-xs font-black uppercase tracking-wider text-gray-500">{header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={headers.length} className="rounded-2xl bg-gray-50 px-3 py-6 text-center font-bold text-gray-500">
                {empty}
              </td>
            </tr>
          ) : (
            rows.map((row, rowIndex) => (
              <tr key={rowIndex} className="bg-[#fffdf6]">
                {row.map((cell, cellIndex) => (
                  <td key={cellIndex} className="border-y border-yellow-100 px-3 py-3 first:rounded-l-2xl first:border-l last:rounded-r-2xl last:border-r">
                    {cell}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
