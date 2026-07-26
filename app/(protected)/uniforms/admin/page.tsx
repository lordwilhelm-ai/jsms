"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { authedFetch } from "@/lib/apiClient";
import { queueOfflineAction } from "@/lib/offline/sync";
import { useOfflineStatus } from "@/lib/offline/useOfflineStatus";
import OfflineStatusPill from "@/app/components/OfflineStatusPill";
import { fetchWithCache } from "@/lib/offline/cachedQuery";

const OFFLINE_MODULE = "uniforms";

type Section = "dashboard" | "payment" | "given" | "expenses" | "records";
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

type UniformExpense = {
  id: string;
  expense_type: string | null;
  item_name: string | null;
  quantity: number;
  unit: string | null;
  unit_cost: number;
  total_cost: number;
  supplier_name: string | null;
  receipt_number: string | null;
  paid_by: string | null;
  expense_date: string | null;
  note: string | null;
  term: string | null;
  academic_year: string | null;
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

  if (
    String(direct || "")
      .toUpperCase()
      .startsWith("JVS")
  )
    return String(direct);

  for (const value of Object.values(row)) {
    const text = String(value || "");
    const match = text.match(/JVS\s*\d{4,}/i);
    if (match) return match[0].replace(/\s+/g, "").toUpperCase();
  }

  return String(direct || "");
}

function getClassName(row: AnyRow | null | undefined) {
  return clean(
    row?.class_name ||
      row?.className ||
      row?.name ||
      row?.student_class ||
      row?.class,
  );
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

function normalizeUniformPaymentItemsFromPayment(
  payment: UniformPayment,
): UniformPaymentItem[] {
  const selectedRaw = payment.selected_items;
  let selectedItems: any[] = [];

  if (Array.isArray(selectedRaw)) {
    selectedItems = selectedRaw;
  } else if (typeof selectedRaw === "string" && selectedRaw.trim()) {
    try {
      const parsed = JSON.parse(selectedRaw);
      selectedItems = Array.isArray(parsed) ? parsed : [];
    } catch {
      selectedItems = [];
    }
  }

  const fromSelectedItems = selectedItems
    .map((item, index) => {
      const itemName = clean(item?.item_name || item?.label || item?.name);
      if (!itemName) return null;

      const price = numberValue(
        item?.price || item?.unit_price || item?.total_price,
      );

      return {
        id: `fallback-${payment.id}-${index}`,
        payment_id: payment.id,
        receipt_number: payment.receipt_number,
        student_id: payment.student_id,
        student_name: payment.student_name,
        class_name: payment.class_name,
        item_name: itemName,
        quantity: numberValue(item?.quantity) || 1,
        unit_price: price,
        total_price: price,
        created_at: payment.created_at,
      } as UniformPaymentItem;
    })
    .filter(Boolean) as UniformPaymentItem[];

  if (fromSelectedItems.length > 0) return fromSelectedItems;

  return clean(payment.item_name)
    .split(",")
    .map((item) => clean(item))
    .filter(Boolean)
    .map((itemName, index) => ({
      id: `fallback-${payment.id}-${index}`,
      payment_id: payment.id,
      receipt_number: payment.receipt_number,
      student_id: payment.student_id,
      student_name: payment.student_name,
      class_name: payment.class_name,
      item_name: itemName,
      quantity: 1,
      unit_price: 0,
      total_price: 0,
      created_at: payment.created_at,
    }));
}

function isActiveStudent(row: AnyRow) {
  if (typeof row.active === "boolean") return row.active;
  if (typeof row.is_active === "boolean") return row.is_active;
  if (typeof row.left_school === "boolean") return !row.left_school;
  if (row.status)
    return !["inactive", "left", "withdrawn"].includes(
      clean(row.status).toLowerCase(),
    );
  return true;
}

function getUniformOptions(classRow: ClassRow | undefined): UniformOption[] {
  return [
    {
      key: "lacoste",
      label: "Lacoste",
      price: numberValue(classRow?.fee_lacoste),
    },
    {
      key: "monwed",
      label: "Mon to Wed Wear",
      price: numberValue(classRow?.fee_monwed),
    },
    {
      key: "friday",
      label: "Fri Wear",
      price: numberValue(classRow?.fee_friday),
    },
  ];
}

export default function UniformsPage() {
  const [activeSection, setActiveSection] = useState<Section>("dashboard");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [showingCachedData, setShowingCachedData] = useState(false);

  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [payments, setPayments] = useState<UniformPayment[]>([]);
  const [paymentItems, setPaymentItems] = useState<UniformPaymentItem[]>([]);
  const [givenItems, setGivenItems] = useState<UniformGiven[]>([]);
  const [expenses, setExpenses] = useState<UniformExpense[]>([]);

  const [currentUserName, setCurrentUserName] = useState("Admin");
  const [currentTerm, setCurrentTerm] = useState("Current Term");
  const [academicYear, setAcademicYear] = useState("");

  const [classFilter, setClassFilter] = useState("");
  const [message, setMessage] = useState("");

  const { online, pendingCount, syncing } = useOfflineStatus(OFFLINE_MODULE, async () => {
    if (!navigator.onLine) return;

    try {
      await loadUniformData();
    } catch (error) {
      console.warn("Uniforms: post-sync reload failed:", error);
    }
  });

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
  const [givenSelections, setGivenSelections] = useState<
    Record<string, boolean>
  >({});

  const [expenseForm, setExpenseForm] = useState({
    expense_type: "Fabric Purchase",
    item_name: "",
    quantity: "",
    unit: "yards",
    unit_cost: "",
    supplier_name: "",
    receipt_number: "",
    note: "",
  });

  useEffect(() => {
    void loadEverything();
  }, []);

  async function loadEverything() {
    setLoading(true);
    setLoadError("");
    setMessage("");

    const [
      userFromCache,
      settingsFromCache,
      classesFromCache,
      studentsFromCache,
      uniformDataFromCache,
    ] = await Promise.all([
      loadUser(),
      loadSettings(),
      loadClasses(),
      loadStudents(),
      loadUniformData(),
    ]);

    setShowingCachedData(
      [
        userFromCache,
        settingsFromCache,
        classesFromCache,
        studentsFromCache,
        uniformDataFromCache,
      ].some(Boolean),
    );

    setLoading(false);
  }

  async function loadUser() {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const email = clean(session?.user?.email).toLowerCase();
    const userId = clean(session?.user?.id);

    if (!email && !userId) return false;

    const teachersRes = await fetchWithCache(
      OFFLINE_MODULE,
      "teachers",
      () => supabase.from("teachers").select("*"),
      [] as any[],
    );

    const userRow =
      teachersRes.data.find((item: any) => clean(item.auth_user_id) === userId) ||
      teachersRes.data.find((item: any) => clean(item.email).toLowerCase() === email) ||
      null;

    setCurrentUserName(
      clean(
        userRow?.full_name ||
          userRow?.name ||
          userRow?.teacher_name ||
          session?.user?.email ||
          "Admin",
      ),
    );

    return teachersRes.fromCache;
  }

  async function loadSettings() {
    const possibleTables = ["school_settings", "jsms_settings", "settings"];

    for (const table of possibleTables) {
      const result = await fetchWithCache(
        OFFLINE_MODULE,
        table,
        () => supabase.from(table).select("*").limit(1).maybeSingle(),
        null as any,
      );

      if (result.data) {
        const row = result.data as any;
        const term =
          row.current_term ||
          row.active_term ||
          row.term ||
          row.school_term ||
          "";
        const year =
          row.academic_year ||
          row.current_academic_year ||
          row.school_year ||
          "";
        if (term) setCurrentTerm(String(term));
        if (year) setAcademicYear(String(year));
        return result.fromCache;
      }
    }

    return false;
  }

  async function loadClasses() {
    const result = await fetchWithCache(
      OFFLINE_MODULE,
      "classes",
      () => supabase.from("classes").select("*").order("class_order", { ascending: true }),
      [] as ClassRow[],
    );

    setClasses(result.data);
    return result.fromCache;
  }

  async function loadStudents() {
    const possibleTables = [
      "students",
      "jsms_students",
      "student_names",
      "students_names",
      "students_names_and_classes",
    ];

    for (const table of possibleTables) {
      const result = await fetchWithCache(
        OFFLINE_MODULE,
        table,
        () => supabase.from(table).select("*"),
        [] as any[],
      );

      if (result.data && result.data.length > 0) {
        const normalized = normalizeStudents(result.data).filter(
          (item) => item.student_name && item.class_name,
        );
        if (normalized.length > 0) {
          setStudents(normalized);
          return result.fromCache;
        }
      }
    }

    setStudents([]);
    return false;
  }

  function normalizeStudents(rows: any[]): StudentOption[] {
    return rows.filter(isActiveStudent).map((row) => {
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
    const [paymentsRes, itemsRes, givenRes, expensesRes] = await Promise.all([
      fetchWithCache(
        OFFLINE_MODULE,
        "jsms_uniform_payments",
        () => supabase.from("jsms_uniform_payments").select("*").order("created_at", { ascending: false }),
        [] as UniformPayment[],
      ),
      fetchWithCache(
        OFFLINE_MODULE,
        "jsms_uniform_payment_items",
        () => supabase.from("jsms_uniform_payment_items").select("*").order("created_at", { ascending: false }),
        [] as UniformPaymentItem[],
      ),
      fetchWithCache(
        OFFLINE_MODULE,
        "jsms_uniforms_given",
        () => supabase.from("jsms_uniforms_given").select("*").order("created_at", { ascending: false }),
        [] as UniformGiven[],
      ),
      fetchWithCache(
        OFFLINE_MODULE,
        "jsms_uniform_expenses",
        () => supabase.from("jsms_uniform_expenses").select("*").order("created_at", { ascending: false }),
        [] as UniformExpense[],
      ),
    ]);

    setPayments(paymentsRes.data);
    setPaymentItems(itemsRes.data);
    setGivenItems(givenRes.data);
    setExpenses(expensesRes.data);

    return [paymentsRes, itemsRes, givenRes, expensesRes].some((result) => result.fromCache);
  }

  const selectedClassRow = useMemo(() => {
    return classes.find((row) =>
      sameClass(getClassName(row as AnyRow), paymentForm.class_name),
    );
  }, [classes, paymentForm.class_name]);

  const uniformOptions = useMemo(
    () => getUniformOptions(selectedClassRow),
    [selectedClassRow],
  );

  const selectedUniformOptions = useMemo(() => {
    return uniformOptions.filter((item) => selectedUniforms.includes(item.key));
  }, [uniformOptions, selectedUniforms]);

  const paymentTotal = selectedUniformOptions.reduce(
    (sum, item) => sum + numberValue(item.price),
    0,
  );
  const paymentPaid = numberValue(paymentForm.amount_paid);
  const paymentBalance = Math.max(paymentTotal - paymentPaid, 0);
  const nextPaymentStatus = getPaymentStatus(paymentTotal, paymentPaid);

  const filteredPayments = useMemo(() => {
    if (!classFilter) return payments;
    return payments.filter((payment) =>
      sameClass(payment.class_name, classFilter),
    );
  }, [payments, classFilter]);

  // currentTerm defaults to the "Current Term" placeholder and academicYear
  // to "" until loadSettings() finds a real school_settings row. Only scope
  // by term/year once we actually have a real current term, so we never
  // silently zero out every stat when settings failed to load.
  const hasTermScope = Boolean(currentTerm) && currentTerm !== "Current Term";

  // Payments belonging to the current term/academic year, used for the
  // "Balance Owing" dashboard stat so balances from previous terms don't
  // silently keep accumulating into the "current" figure forever.
  const currentTermPayments = useMemo(() => {
    if (!hasTermScope) return payments;

    return payments.filter((payment) => {
      const sameTerm = !payment.term || payment.term === currentTerm;
      const sameYear =
        !academicYear || !payment.academic_year || payment.academic_year === academicYear;

      return sameTerm && sameYear;
    });
  }, [payments, hasTermScope, currentTerm, academicYear]);

  const stats = useMemo(() => {
    const totalCollected = payments.reduce(
      (sum, item) => sum + numberValue(item.amount_paid),
      0,
    );
    const totalBalance = currentTermPayments.reduce(
      (sum, item) => sum + Math.max(numberValue(item.balance), 0),
      0,
    );
    const totalExpenses = expenses.reduce(
      (sum, item) => sum + numberValue(item.total_cost),
      0,
    );
    const profit = totalCollected - totalExpenses;
    const owing = currentTermPayments.filter(
      (item) => numberValue(item.balance) > 0,
    ).length;

    return {
      payments: payments.length,
      collected: totalCollected,
      balance: totalBalance,
      expenses: totalExpenses,
      profit,
      owing,
      given: givenItems.length,
    };
  }, [payments, currentTermPayments, givenItems, expenses]);

  const studentSuggestions = useMemo(() => {
    const value = clean(paymentForm.student_search).toLowerCase();
    if (!value) return [];

    return students
      .filter((student) => {
        const text =
          `${student.student_id} ${student.student_name} ${student.class_name}`.toLowerCase();
        return text.includes(value);
      })
      .slice(0, 8);
  }, [students, paymentForm.student_search]);

  const selectedPaymentForGiven = useMemo(() => {
    return payments.find((item) => item.id === givenForm.payment_id);
  }, [payments, givenForm.payment_id]);

  const selectedPaymentItemsForGiven = useMemo(() => {
    if (!selectedPaymentForGiven) return [];

    const savedItems = paymentItems.filter(
      (item) => item.payment_id === selectedPaymentForGiven.id,
    );
    if (savedItems.length > 0) return savedItems;

    return normalizeUniformPaymentItemsFromPayment(selectedPaymentForGiven);
  }, [paymentItems, selectedPaymentForGiven]);

  const alreadyGivenForSelectedPayment = useMemo(() => {
    if (!selectedPaymentForGiven) return new Set<string>();
    const existing = givenItems
      .filter((item) => item.payment_id === selectedPaymentForGiven.id)
      .map((item) => clean(item.item_name).toLowerCase());
    return new Set(existing);
  }, [givenItems, selectedPaymentForGiven]);

  useEffect(() => {
    if (!selectedPaymentForGiven) return;

    const availableItems = selectedPaymentItemsForGiven.filter(
      (item) =>
        !alreadyGivenForSelectedPayment.has(
          clean(item.item_name).toLowerCase(),
        ),
    );

    if (
      availableItems.length === 1 &&
      Object.keys(givenSelections).length === 0
    ) {
      setGivenSelections({ [availableItems[0].id]: true });
    }
  }, [
    selectedPaymentForGiven,
    selectedPaymentItemsForGiven,
    alreadyGivenForSelectedPayment,
    givenSelections,
  ]);

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

  async function handleRecordPayment() {
    try {
      setMessage("");

      if (
        !paymentForm.student_id ||
        !paymentForm.student_name ||
        !paymentForm.class_name
      ) {
        throw new Error("Select a student first.");
      }

      if (selectedUniformOptions.length === 0) {
        throw new Error("Select at least one uniform item.");
      }

      if (paymentTotal <= 0) {
        throw new Error(
          "Selected uniform price is 0. Set Lacoste, Mon-Wed, and Friday prices in Fee Structure first.",
        );
      }

      if (paymentPaid < 0) throw new Error("Amount paid cannot be negative.");
      if (paymentPaid > paymentTotal)
        throw new Error("Amount paid cannot be more than total amount.");

      const payload = {
        studentId: paymentForm.student_id,
        studentName: paymentForm.student_name,
        className: paymentForm.class_name,
        selectedItems: selectedUniformOptions.map((item) => ({
          key: item.key,
          label: item.label,
          price: item.price,
        })),
        totalAmount: paymentTotal,
        amountPaid: paymentPaid,
        term: currentTerm,
        academicYear,
        note: paymentForm.note,
      };

      let receiptLabel = "";

      if (navigator.onLine) {
        try {
          const response = await authedFetch("/api/uniforms/record-payment", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });

          const body = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(body?.error || "Could not record uniform payment.");

          receiptLabel = String(body.payment?.receipt_number || "");
          setMessage(`Uniform payment recorded. Receipt: ${receiptLabel}`);
          await loadUniformData();
        } catch (error: any) {
          if (!(error instanceof TypeError)) throw error;
          receiptLabel = await queueUniformPayment(payload);
        }
      } else {
        receiptLabel = await queueUniformPayment(payload);
      }

      setPaymentForm({
        student_search: "",
        student_id: "",
        student_name: "",
        class_name: "",
        amount_paid: "",
        note: "",
      });
      setSelectedUniforms([]);
      setActiveSection("records");
    } catch (error: any) {
      setMessage(
        `Error: ${error?.message || "Could not record uniform payment."}`,
      );
    }
  }

  async function queueUniformPayment(payload: Record<string, any>) {
    const offlineId = await queueOfflineAction(
      OFFLINE_MODULE,
      "record-payment",
      "/api/uniforms/record-payment",
      payload
    );

    setPayments((prev) => [
      {
        id: `pending-${offlineId}`,
        offline_id: offlineId,
        pending_sync: true,
        student_id: payload.studentId,
        student_name: payload.studentName,
        class_name: payload.className,
        receipt_number: "Pending sync",
        item_name: payload.selectedItems.map((item: any) => item.label).join(", "),
        quantity: payload.selectedItems.length || 1,
        selected_items: payload.selectedItems,
        total_amount: payload.totalAmount,
        amount_paid: payload.amountPaid,
        balance: payload.totalAmount - payload.amountPaid,
        payment_status: payload.totalAmount - payload.amountPaid <= 0 ? "paid" : "partial",
        receipt_issued_by: currentUserName,
        payment_note: payload.note,
        term: payload.term,
        academic_year: payload.academicYear,
        created_at: new Date().toISOString(),
      } as UniformPayment,
      ...prev,
    ]);

    setMessage("Uniform payment saved offline — will sync automatically.");
    return "Pending sync";
  }

  async function handleRecordExpense() {
    try {
      setMessage("");

      const itemName = clean(expenseForm.item_name);
      const quantity = numberValue(expenseForm.quantity);
      const unitCost = numberValue(expenseForm.unit_cost);
      const totalCost = quantity * unitCost;

      if (!itemName) throw new Error("Enter the item or work name.");
      if (quantity <= 0) throw new Error("Quantity must be more than 0.");
      if (unitCost < 0) throw new Error("Unit cost cannot be negative.");
      if (totalCost <= 0) throw new Error("Total expense must be more than 0.");

      const payload = {
        expenseType: expenseForm.expense_type,
        itemName,
        quantity,
        unit: expenseForm.unit,
        unitCost,
        supplierName: expenseForm.supplier_name,
        receiptNumber: expenseForm.receipt_number,
        note: expenseForm.note,
        term: currentTerm,
        academicYear,
      };

      if (navigator.onLine) {
        try {
          const response = await authedFetch("/api/uniforms/record-expense", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });

          const body = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(body?.error || "Could not record uniform expense.");

          setMessage("Uniform expense recorded. Profit has been recalculated.");
          await loadUniformData();
        } catch (error: any) {
          if (!(error instanceof TypeError)) throw error;
          await queueUniformExpense(payload, totalCost);
        }
      } else {
        await queueUniformExpense(payload, totalCost);
      }

      setExpenseForm({
        expense_type: "Fabric Purchase",
        item_name: "",
        quantity: "",
        unit: "yards",
        unit_cost: "",
        supplier_name: "",
        receipt_number: "",
        note: "",
      });
    } catch (error: any) {
      setMessage(
        `Error: ${error?.message || "Could not record uniform expense."}`,
      );
    }
  }

  async function queueUniformExpense(payload: Record<string, any>, totalCost: number) {
    const offlineId = await queueOfflineAction(
      OFFLINE_MODULE,
      "record-expense",
      "/api/uniforms/record-expense",
      payload
    );

    setExpenses((prev) => [
      {
        id: `pending-${offlineId}`,
        expense_type: payload.expenseType,
        item_name: payload.itemName,
        quantity: payload.quantity,
        unit: payload.unit,
        unit_cost: payload.unitCost,
        total_cost: totalCost,
        supplier_name: payload.supplierName,
        receipt_number: payload.receiptNumber,
        paid_by: currentUserName,
        expense_date: new Date().toISOString(),
        note: payload.note,
        term: payload.term,
        academic_year: payload.academicYear,
        created_at: new Date().toISOString(),
      } as UniformExpense,
      ...prev,
    ]);

    setMessage("Uniform expense saved offline — will sync automatically.");
  }

  async function handleMarkGiven() {
    try {
      setMessage("");
      if (!selectedPaymentForGiven)
        throw new Error("Select a payment receipt first.");

      const selectedItems = selectedPaymentItemsForGiven.filter(
        (item) => givenSelections[item.id],
      );
      if (selectedItems.length === 0)
        throw new Error("Select at least one uniform item to mark as given.");

      const payload = {
        paymentId: selectedPaymentForGiven.id,
        receiptNumber: selectedPaymentForGiven.receipt_number,
        studentId: selectedPaymentForGiven.student_id,
        studentName: selectedPaymentForGiven.student_name,
        className: selectedPaymentForGiven.class_name,
        itemNames: selectedItems.map((item) => item.item_name),
        note: givenForm.note,
      };

      if (navigator.onLine) {
        try {
          const response = await authedFetch("/api/uniforms/mark-given", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });

          const body = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(body?.error || "Could not mark uniform as given.");

          setMessage("Uniform item(s) marked as given.");
          await loadUniformData();
        } catch (error: any) {
          if (!(error instanceof TypeError)) throw error;
          await queueUniformGiven(payload);
        }
      } else {
        await queueUniformGiven(payload);
      }

      setGivenForm({ payment_id: "", note: "" });
      setGivenSelections({});
    } catch (error: any) {
      setMessage(
        `Error: ${error?.message || "Could not mark uniform as given."}`,
      );
    }
  }

  async function queueUniformGiven(payload: Record<string, any>) {
    const offlineId = await queueOfflineAction(OFFLINE_MODULE, "mark-given", "/api/uniforms/mark-given", payload);
    const now = new Date().toISOString();

    setGivenItems((prev) => [
      ...(payload.itemNames as string[]).map(
        (itemName, index) =>
          ({
            id: `pending-${offlineId}-${index}`,
            payment_id: payload.paymentId,
            receipt_number: payload.receiptNumber,
            student_id: payload.studentId,
            student_name: payload.studentName,
            class_name: payload.className,
            item_name: itemName,
            quantity_given: 1,
            given_by: currentUserName,
            given_at: now,
            note: payload.note,
            created_at: now,
          }) as UniformGiven
      ),
      ...prev,
    ]);

    setMessage("Marked as given offline — will sync automatically.");
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
        button,
        a,
        input,
        select,
        textarea {
          transition: all 0.18s ease;
        }
        button:hover,
        a:hover {
          transform: translateY(-1px);
        }
      `}</style>

      <section className="mx-auto flex max-w-[1500px] gap-5 p-4 max-lg:flex-col">
        <aside className="sticky top-4 h-fit w-[270px] rounded-[28px] border-2 border-yellow-400 bg-slate-950 p-5 text-white shadow-xl max-lg:static max-lg:w-full">
          <p className="text-xs font-black uppercase tracking-widest text-yellow-200">
            Uniform Module
          </p>
          <h1 className="mt-2 text-2xl font-black">Uniforms</h1>
          <p className="mt-2 text-sm font-semibold text-gray-300">
            Lacoste, Mon to Wed Wear, and Fri Wear prices are pulled from Fee
            Structure.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <OfflineStatusPill online={online} pendingCount={pendingCount} syncing={syncing} />
            {showingCachedData && (
              <span className="text-xs font-semibold text-gray-300">Showing last synced data</span>
            )}
          </div>

          <nav className="mt-6 grid gap-2">
            <SideButton
              active={activeSection === "dashboard"}
              onClick={() => setActiveSection("dashboard")}
            >
              Dashboard
            </SideButton>
            <SideButton
              active={activeSection === "payment"}
              onClick={() => setActiveSection("payment")}
            >
              Record Payment
            </SideButton>
            <SideButton
              active={activeSection === "given"}
              onClick={() => setActiveSection("given")}
            >
              Give Uniform
            </SideButton>
            <SideButton
              active={activeSection === "expenses"}
              onClick={() => setActiveSection("expenses")}
            >
              Production Expenses
            </SideButton>
            <SideButton
              active={activeSection === "records"}
              onClick={() => setActiveSection("records")}
            >
              Records
            </SideButton>
          </nav>

          <Link
            href="/dashboard/admin"
            className="mt-6 block rounded-2xl bg-white/10 px-4 py-3 text-center text-sm font-black text-yellow-100"
          >
            Back to JSMS Dashboard
          </Link>
        </aside>

        <section className="flex-1 space-y-5">
          <header className="rounded-[30px] border-2 border-yellow-400 bg-gradient-to-br from-slate-950 to-gray-800 p-6 text-white shadow-xl">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-widest text-yellow-200">
                  JSMS Uniform Module
                </p>
                <h2 className="mt-2 text-3xl font-black">
                  Uniform Sales & Issuing
                </h2>
                <p className="mt-2 text-sm font-semibold text-gray-300">
                  {academicYear || "Academic Year"} •{" "}
                  {currentTerm || "Current Term"}
                </p>
              </div>
              <button
                onClick={() => void loadEverything()}
                className="rounded-2xl bg-yellow-500 px-4 py-3 text-sm font-black text-white shadow-sm"
              >
                Refresh
              </button>
            </div>
          </header>

          {loadError ? <Alert danger>{loadError}</Alert> : null}
          {message ? (
            <Alert danger={message.startsWith("Error:")}>{message}</Alert>
          ) : null}

          {activeSection === "dashboard" && (
            <DashboardSection
              stats={stats}
              payments={payments}
              givenItems={givenItems}
              expenses={expenses}
            />
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

          {activeSection === "expenses" && (
            <ExpensesSection
              expenses={expenses}
              expenseForm={expenseForm}
              setExpenseForm={setExpenseForm}
              handleRecordExpense={handleRecordExpense}
            />
          )}

          {activeSection === "records" && (
            <RecordsSection
              payments={filteredPayments}
              givenItems={givenItems}
              expenses={expenses}
              classFilter={classFilter}
              setClassFilter={setClassFilter}
              classOptions={[
                ...new Set(
                  classes
                    .map((row) => getClassName(row as AnyRow))
                    .filter(Boolean),
                ),
              ]}
            />
          )}
        </section>
      </section>
    </main>
  );
}

function SideButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
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

function Alert({
  danger,
  children,
}: {
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`rounded-3xl border p-4 text-sm font-black ${danger ? "border-red-200 bg-red-50 text-red-700" : "border-green-200 bg-green-50 text-green-700"}`}
    >
      {children}
    </div>
  );
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-3xl border border-yellow-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-black uppercase tracking-wider text-gray-500">
        {label}
      </p>
      <div className="mt-2 text-xl font-black text-gray-950">{value}</div>
    </div>
  );
}

function DashboardSection({
  stats,
  payments,
  givenItems,
  expenses,
}: {
  stats: any;
  payments: UniformPayment[];
  givenItems: UniformGiven[];
  expenses: UniformExpense[];
}) {
  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-5">
        <Info label="Sales Collected" value={money(stats.collected)} />
        <Info label="Production Expenses" value={money(stats.expenses)} />
        <Info label="Profit" value={money(stats.profit)} />
        <Info label="Balance Owing" value={money(stats.balance)} />
        <Info label="Given" value={stats.given} />
      </div>

      <Panel title="Recent Uniform Payments">
        <SimpleTable
          headers={["Receipt", "Student", "Items", "Paid", "Balance", "Status"]}
          rows={payments
            .slice(0, 8)
            .map((payment) => [
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

      <Panel title="Recent Production Expenses">
        <SimpleTable
          headers={[
            "Date",
            "Type",
            "Item / Work",
            "Quantity",
            "Total",
            "Recorded By",
          ]}
          rows={expenses
            .slice(0, 8)
            .map((expense) => [
              formatDate(expense.expense_date || expense.created_at),
              expense.expense_type || "-",
              expense.item_name || "-",
              `${numberValue(expense.quantity)} ${expense.unit || ""}`.trim(),
              money(numberValue(expense.total_cost)),
              expense.paid_by || "-",
            ])}
          empty="No uniform production expenses yet."
        />
      </Panel>

      <Panel title="Recently Given Uniforms">
        <SimpleTable
          headers={["Student", "Class", "Item", "Given By", "Date"]}
          rows={givenItems
            .slice(0, 8)
            .map((item) => [
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
        Select student first. The page will pull Lacoste, Mon-Wed, and Friday
        prices from the student's class fee structure.
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
                  {student.student_name} • {student.student_id} •{" "}
                  {student.class_name}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <TextInput
          placeholder="Class"
          value={paymentForm.class_name}
          disabled
          onChange={() => {}}
        />
      </div>

      <div className="mt-4 rounded-3xl border border-yellow-200 bg-[#fffdf6] p-4">
        <p className="mb-3 text-sm font-black text-gray-950">Uniform Items</p>

        {!paymentForm.class_name ? (
          <p className="text-sm font-bold text-gray-500">
            Pick a student to show uniform prices.
          </p>
        ) : (
          <div className="grid gap-3 md:grid-cols-3">
            {uniformOptions.map((item) => (
              <label
                key={item.key}
                className="flex cursor-pointer items-center justify-between gap-3 rounded-2xl border border-yellow-100 bg-white p-3 text-sm font-bold shadow-sm"
              >
                <span>
                  {item.label}
                  <span className="mt-1 block text-xs text-gray-500">
                    {money(item.price)}
                  </span>
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
          onChange={(value) =>
            setPaymentForm((prev: any) => ({ ...prev, amount_paid: value }))
          }
        />
        <TextInput
          placeholder="Note"
          value={paymentForm.note}
          onChange={(value) =>
            setPaymentForm((prev: any) => ({ ...prev, note: value }))
          }
        />
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-4">
        <Info label="Total" value={money(paymentTotal)} />
        <Info label="Paid" value={money(paymentPaid)} />
        <Info label="Balance" value={money(paymentBalance)} />
        <Info label="Status" value={statusLabel(nextPaymentStatus)} />
      </div>

      <ActionButton onClick={handleRecordPayment}>
        Record Uniform Payment
      </ActionButton>
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
  setGivenSelections: React.Dispatch<
    React.SetStateAction<Record<string, boolean>>
  >;
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
            setGivenForm((prev: any) => ({
              ...prev,
              payment_id: e.target.value,
            }));
            setGivenSelections({});
          }}
          className="h-11 rounded-2xl border border-yellow-200 bg-[#fffdf6] px-3 text-sm font-semibold outline-none"
        >
          <option value="">Select receipt</option>
          {payments.map((payment) => (
            <option key={payment.id} value={payment.id}>
              {payment.receipt_number} - {payment.student_name} -{" "}
              {payment.item_name}
            </option>
          ))}
        </select>

        <TextInput
          placeholder="Note"
          value={givenForm.note}
          onChange={(value) =>
            setGivenForm((prev: any) => ({ ...prev, note: value }))
          }
        />
      </div>

      {selectedPaymentForGiven ? (
        <div className="mt-4 rounded-3xl border border-yellow-200 bg-[#fffdf6] p-4">
          <p className="text-sm font-black text-gray-950">
            {selectedPaymentForGiven.student_name} •{" "}
            {selectedPaymentForGiven.class_name}
          </p>
          <p className="mt-1 text-xs font-bold text-gray-500">
            Receipt: {selectedPaymentForGiven.receipt_number}
          </p>

          <div className="mt-4 grid gap-2 md:grid-cols-3">
            {selectedPaymentItemsForGiven.length === 0 ? (
              <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700 md:col-span-3">
                No uniform item was found under this receipt. Record the payment
                again or check the payment item table.
              </div>
            ) : (
              selectedPaymentItemsForGiven.map((item) => {
                const isGiven = alreadyGivenForSelectedPayment.has(
                  clean(item.item_name).toLowerCase(),
                );
                return (
                  <label
                    key={item.id}
                    className={`flex items-center justify-between rounded-2xl border p-3 text-sm font-bold ${isGiven ? "border-green-200 bg-green-50 text-green-700" : "border-yellow-100 bg-white"}`}
                  >
                    <span>
                      {item.item_name}
                      {isGiven ? (
                        <span className="block text-xs">Already given</span>
                      ) : null}
                    </span>
                    <input
                      type="checkbox"
                      disabled={isGiven}
                      checked={Boolean(givenSelections[item.id])}
                      onChange={(e) =>
                        setGivenSelections((prev) => ({
                          ...prev,
                          [item.id]: e.target.checked,
                        }))
                      }
                    />
                  </label>
                );
              })
            )}
          </div>
        </div>
      ) : null}

      <ActionButton onClick={handleMarkGiven}>
        Mark Selected As Given
      </ActionButton>
    </Panel>
  );
}

function ExpensesSection({
  expenses,
  expenseForm,
  setExpenseForm,
  handleRecordExpense,
}: {
  expenses: UniformExpense[];
  expenseForm: any;
  setExpenseForm: React.Dispatch<React.SetStateAction<any>>;
  handleRecordExpense: () => void;
}) {
  const quantity = numberValue(expenseForm.quantity);
  const unitCost = numberValue(expenseForm.unit_cost);
  const totalCost = quantity * unitCost;

  return (
    <div className="space-y-5">
      <Panel title="Record Uniform Production Expense">
        <p className="mb-4 text-sm font-semibold text-gray-500">
          Record fabric purchases, sewing cost, buttons, thread, transport, or
          any expense used to produce uniforms. Profit = total uniform sales
          collected minus these expenses.
        </p>

        <div className="grid gap-3 md:grid-cols-3">
          <select
            value={expenseForm.expense_type}
            onChange={(e) =>
              setExpenseForm((prev: any) => ({
                ...prev,
                expense_type: e.target.value,
              }))
            }
            className="h-11 rounded-2xl border border-yellow-200 bg-[#fffdf6] px-3 text-sm font-semibold outline-none"
          >
            <option value="Fabric Purchase">Fabric Purchase</option>
            <option value="Sewing / Tailor Cost">Sewing / Tailor Cost</option>
            <option value="Buttons / Zips / Thread">
              Buttons / Zips / Thread
            </option>
            <option value="Transport">Transport</option>
            <option value="Other Production Cost">Other Production Cost</option>
          </select>

          <TextInput
            placeholder="Item or work name e.g. Blue fabric"
            value={expenseForm.item_name}
            onChange={(value) =>
              setExpenseForm((prev: any) => ({ ...prev, item_name: value }))
            }
          />

          <TextInput
            placeholder="Supplier / tailor name"
            value={expenseForm.supplier_name}
            onChange={(value) =>
              setExpenseForm((prev: any) => ({ ...prev, supplier_name: value }))
            }
          />
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <TextInput
            placeholder="Quantity e.g. 30"
            type="number"
            value={expenseForm.quantity}
            onChange={(value) =>
              setExpenseForm((prev: any) => ({ ...prev, quantity: value }))
            }
          />

          <select
            value={expenseForm.unit}
            onChange={(e) =>
              setExpenseForm((prev: any) => ({ ...prev, unit: e.target.value }))
            }
            className="h-11 rounded-2xl border border-yellow-200 bg-[#fffdf6] px-3 text-sm font-semibold outline-none"
          >
            <option value="yards">yards</option>
            <option value="pieces">pieces</option>
            <option value="sets">sets</option>
            <option value="work">work</option>
            <option value="trip">trip</option>
          </select>

          <TextInput
            placeholder="Unit cost"
            type="number"
            value={expenseForm.unit_cost}
            onChange={(value) =>
              setExpenseForm((prev: any) => ({ ...prev, unit_cost: value }))
            }
          />

          <TextInput
            placeholder="Supplier receipt no. optional"
            value={expenseForm.receipt_number}
            onChange={(value) =>
              setExpenseForm((prev: any) => ({
                ...prev,
                receipt_number: value,
              }))
            }
          />
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <TextInput
            placeholder="Note"
            value={expenseForm.note}
            onChange={(value) =>
              setExpenseForm((prev: any) => ({ ...prev, note: value }))
            }
          />
          <Info label="Expense Total" value={money(totalCost)} />
        </div>

        <ActionButton onClick={handleRecordExpense}>
          Record Production Expense
        </ActionButton>
      </Panel>

      <Panel title="Production Expense Records">
        <SimpleTable
          headers={[
            "Date",
            "Type",
            "Item / Work",
            "Quantity",
            "Unit Cost",
            "Total",
            "Supplier",
            "Recorded By",
          ]}
          rows={expenses.map((expense) => [
            formatDate(expense.expense_date || expense.created_at),
            expense.expense_type || "-",
            expense.item_name || "-",
            `${numberValue(expense.quantity)} ${expense.unit || ""}`.trim(),
            money(numberValue(expense.unit_cost)),
            money(numberValue(expense.total_cost)),
            expense.supplier_name || "-",
            expense.paid_by || "-",
          ])}
          empty="No production expense recorded yet."
        />
      </Panel>
    </div>
  );
}

function RecordsSection({
  payments,
  givenItems,
  expenses,
  classFilter,
  setClassFilter,
  classOptions,
}: {
  payments: UniformPayment[];
  givenItems: UniformGiven[];
  expenses: UniformExpense[];
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
            <option key={className} value={className}>
              {className}
            </option>
          ))}
        </select>
      </Panel>

      <Panel title="Uniform Payments">
        <SimpleTable
          headers={[
            "Date",
            "Receipt",
            "Student",
            "Class",
            "Items",
            "Total",
            "Paid",
            "Balance",
            "Status",
          ]}
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

      <Panel title="Production Expenses">
        <SimpleTable
          headers={[
            "Date",
            "Type",
            "Item / Work",
            "Quantity",
            "Total",
            "Recorded By",
          ]}
          rows={expenses.map((expense) => [
            formatDate(expense.expense_date || expense.created_at),
            expense.expense_type || "-",
            expense.item_name || "-",
            `${numberValue(expense.quantity)} ${expense.unit || ""}`.trim(),
            money(numberValue(expense.total_cost)),
            expense.paid_by || "-",
          ])}
          empty="No production expense recorded yet."
        />
      </Panel>
    </div>
  );
}

function Panel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
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

function ActionButton({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
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

function SimpleTable({
  headers,
  rows,
  empty,
}: {
  headers: string[];
  rows: React.ReactNode[][];
  empty: string;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] border-separate border-spacing-y-2 text-left text-sm">
        <thead>
          <tr>
            {headers.map((header) => (
              <th
                key={header}
                className="px-3 py-2 text-xs font-black uppercase tracking-wider text-gray-500"
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td
                colSpan={headers.length}
                className="rounded-2xl bg-gray-50 px-3 py-6 text-center font-bold text-gray-500"
              >
                {empty}
              </td>
            </tr>
          ) : (
            rows.map((row, rowIndex) => (
              <tr key={rowIndex} className="bg-[#fffdf6]">
                {row.map((cell, cellIndex) => (
                  <td
                    key={cellIndex}
                    className="border-y border-yellow-100 px-3 py-3 first:rounded-l-2xl first:border-l last:rounded-r-2xl last:border-r"
                  >
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
