"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { authedFetch } from "@/lib/apiClient";
import { queueOfflineAction } from "@/lib/offline/sync";
import { useOfflineStatus } from "@/lib/offline/useOfflineStatus";
import { useModuleLoadBadge } from "@/lib/offline/useModulePrefetch";
import OfflineStatusPill from "@/app/components/OfflineStatusPill";
import ModuleDownloadBadge from "@/app/components/ModuleDownloadBadge";
import { fetchWithCache } from "@/lib/offline/cachedQuery";
import { notifyBookIssued } from "@/lib/jsmsNotify";

const OFFLINE_MODULE = "books";
import {
  getUniversalReceiptSuggestions,
  searchUniversalReceipt,
  type UniversalPayment,
  type UniversalReceiptResult,
} from "@/lib/universalReceiptSearch";

type Section =
  | "dashboard"
  | "structure"
  | "payment"
  | "given"
  | "records"
  | "stock"
  | "suppliers";

type PaymentType = "full_structure" | "specific_books";

type Book = {
  id: string;
  book_name: string;
  class_name: string | null;
  subject: string | null;
  quantity: number;
  cost_price: number;
  selling_price: number;
  supplier_name?: string | null;
  created_at: string;
};

type BookStructure = {
  id: string;
  structure_name: string;
  class_name: string;
  term: string | null;
  academic_year: string | null;
  full_amount: number;
  notes: string | null;
  is_active: boolean;
  created_at: string;
};

type BookStructureItem = {
  id: string;
  structure_id: string;
  book_id: string | null;
  book_name: string;
  subject: string | null;
  class_name: string | null;
  individual_price: number;
  expected_quantity: number;
  created_at: string;
};

type BookPayment = {
  id: string;
  student_id: string;
  student_name: string;
  class_name: string | null;
  receipt_number: string;
  payment_type: PaymentType | string;
  structure_id: string | null;
  paid_for: string | null;
  item_name?: string | null;
  total_amount: number;
  amount_paid: number;
  balance: number;
  receipt_issued_by: string | null;
  received_by?: string | null;
  payment_note: string | null;
  term: string | null;
  academic_year: string | null;
  created_at: string;
};

type BookPaymentItem = {
  id: string;
  payment_id: string;
  book_id: string | null;
  book_name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  created_at: string;
};

type BookGiven = {
  id: string;
  payment_id: string | null;
  receipt_number: string | null;
  student_id: string;
  student_name: string;
  class_name: string | null;
  structure_id: string | null;
  book_id: string | null;
  book_name: string;
  quantity_given: number;
  given_by: string | null;
  given_at: string | null;
  note: string | null;
  created_at: string;
};

type SupplierPurchase = {
  id: string;
  supplier_name: string;
  supplier_phone: string | null;
  supplier_receipt_number: string | null;
  purchase_date: string | null;
  bought_on_credit: boolean;
  total_amount: number;
  amount_paid: number;
  balance: number;
  payment_method: string | null;
  payment_status: string | null;
  paid_by: string | null;
  notes: string | null;
  created_at: string;
};

type SupplierPurchaseItem = {
  id: string;
  purchase_id: string;
  book_id: string | null;
  book_name: string;
  subject: string | null;
  class_name: string | null;
  quantity: number;
  cost_price: number;
  selling_price: number;
  total_cost: number;
  created_at: string;
};

type StudentOption = {
  student_id: string;
  student_name: string;
  class_name: string;
};

type SupplierTempItem = {
  temp_id: string;
  book_name: string;
  subject: string;
  class_name: string;
  quantity: string;
  cost_price: string;
  selling_price: string;
};

type PendingIssue = {
  payment: BookPayment;
  expectedBooks: {
    book_id: string | null;
    book_name: string;
    quantity: number;
  }[];
};

const classOptions = [
  "Playroom 1",
  "Playroom 2",
  "KG 1",
  "KG 2",
  "Class 1",
  "Class 2",
  "Class 3",
  "Class 4",
  "Class 5",
  "Class 6",
  "JHS 1",
  "JHS 2",
  "JHS 3",
];

function money(value: number) {
  return `GHS ${Number(value || 0).toFixed(2)}`;
}

function numberValue(value: unknown) {
  const num = Number(value || 0);
  return Number.isFinite(num) ? num : 0;
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

function getLastFourStudentId(studentId: string) {
  const digitsOnly = String(studentId || "").replace(/\D/g, "");

  if (digitsOnly.length < 4) {
    throw new Error("Student ID must contain at least 4 numbers.");
  }

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

  if (String(direct || "").toUpperCase().startsWith("JVS")) {
    return String(direct);
  }

  for (const value of Object.values(row)) {
    const text = String(value || "");
    const match = text.match(/JVS\s*\d{4,}/i);

    if (match) return match[0].replace(/\s+/g, "").toUpperCase();
  }

  return String(direct || "");
}

function paymentStatus(payment: BookPayment) {
  if (numberValue(payment.balance) <= 0) return "Fully Paid";
  if (numberValue(payment.amount_paid) > 0) return "Part Paid";
  return "Unpaid";
}

function supplierStatus(total: number, paid: number) {
  const balance = total - paid;

  if (balance <= 0) return "paid";
  if (paid > 0) return "part_paid";
  return "credit";
}

function supplierStatusLabel(value: string | null | undefined) {
  if (value === "paid") return "Paid";
  if (value === "part_paid") return "Part Paid";
  return "Credit";
}

export default function BooksDashboardPage() {
  const [activeSection, setActiveSection] = useState<Section>("dashboard");

  const [books, setBooks] = useState<Book[]>([]);
  const [structures, setStructures] = useState<BookStructure[]>([]);
  const [structureItems, setStructureItems] = useState<BookStructureItem[]>([]);
  const [payments, setPayments] = useState<BookPayment[]>([]);
  const [paymentItems, setPaymentItems] = useState<BookPaymentItem[]>([]);
  const [booksGiven, setBooksGiven] = useState<BookGiven[]>([]);
  const [supplierPurchases, setSupplierPurchases] = useState<
    SupplierPurchase[]
  >([]);
  const [supplierItems, setSupplierItems] = useState<SupplierPurchaseItem[]>(
    []
  );
  const [students, setStudents] = useState<StudentOption[]>([]);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [showingCachedData, setShowingCachedData] = useState(false);

  const [currentUserName, setCurrentUserName] = useState("Admin");
  const [currentTerm, setCurrentTerm] = useState("Current Term");
  const [academicYear, setAcademicYear] = useState("");

  const [receiptSearch, setReceiptSearch] = useState("");
  const [receiptSuggestions, setReceiptSuggestions] = useState<
    UniversalPayment[]
  >([]);
  const [showReceiptSuggestions, setShowReceiptSuggestions] = useState(false);
  const [searchingReceipt, setSearchingReceipt] = useState(false);
  const [universalResult, setUniversalResult] =
    useState<UniversalReceiptResult | null>(null);

  const [structureForm, setStructureForm] = useState({
    structure_name: "",
    class_name: "",
    full_amount: "",
    notes: "",
  });

  const [structureItemForm, setStructureItemForm] = useState({
    structure_id: "",
    book_id: "",
    book_name: "",
    subject: "",
    class_name: "",
    individual_price: "",
    expected_quantity: "1",
  });

  const [paymentForm, setPaymentForm] = useState({
    student_search: "",
    student_id: "",
    student_name: "",
    class_name: "",
    payment_type: "full_structure" as PaymentType,
    structure_id: "",
    amount_paid: "",
    note: "",
  });

  const [selectedSpecificBookIds, setSelectedSpecificBookIds] = useState<
    string[]
  >([]);

  const [manualGivenForm, setManualGivenForm] = useState({
    student_search: "",
    student_id: "",
    student_name: "",
    class_name: "",
    payment_id: "",
    note: "",
  });

  const [classFilter, setClassFilter] = useState("");

  const [stockForm, setStockForm] = useState({
    book_name: "",
    class_name: "",
    subject: "",
    quantity: "",
    cost_price: "",
    selling_price: "",
  });

  const [supplierForm, setSupplierForm] = useState({
    supplier_name: "",
    supplier_phone: "",
    supplier_receipt_number: "",
    purchase_date: "",
    bought_on_credit: false,
    amount_paid: "",
    payment_method: "",
    notes: "",
  });

  const [supplierItemForm, setSupplierItemForm] = useState({
    book_name: "",
    subject: "",
    class_name: "",
    quantity: "",
    cost_price: "",
    selling_price: "",
  });

  const [supplierTempItems, setSupplierTempItems] = useState<
    SupplierTempItem[]
  >([]);

  const [supplierPaymentForm, setSupplierPaymentForm] = useState({
    purchase_id: "",
    amount_paid: "",
    payment_method: "",
    note: "",
  });

  const [pendingIssue, setPendingIssue] = useState<PendingIssue | null>(null);
  const [issueSelections, setIssueSelections] = useState<
    Record<string, { checked: boolean; quantity: string }>
  >({});

  // Set only when handleRecordPayment couldn't reach the server at all
  // (offline). The popup still shows using a LOCAL fake payment
  // (pendingIssue.payment.id = "local-pending-payment") so the UX matches
  // the online flow exactly; saveBooksGivenFromPopup checks this to know it
  // must bundle the payment + given books into ONE combined offline action
  // instead of two, since there's no real payment id yet to hand off.
  const [offlinePaymentPayload, setOfflinePaymentPayload] = useState<Record<string, any> | null>(null);

  // Books that came back negative-stock after the last sync — surfaced as a
  // reconciliation banner rather than blocking anything (see the approved
  // "issue always succeeds, reconcile after sync" design).
  const [oversoldBooks, setOversoldBooks] = useState<string[]>([]);

  async function checkForOversoldBooks() {
    const { data } = await supabase.from("jsms_books").select("book_name, quantity").lt("quantity", 0);
    setOversoldBooks((data || []).map((row: any) => `${row.book_name} (${row.quantity})`));
  }

  const { online, pendingCount, syncing } = useOfflineStatus(OFFLINE_MODULE, async () => {
    if (!navigator.onLine) return;

    try {
      await loadEverything();
      await checkForOversoldBooks();
    } catch (error) {
      console.warn("Books: post-sync reload failed:", error);
    }
  });

  useEffect(() => {
    void loadEverything();
  }, []);

  useEffect(() => {
    const timer = setTimeout(async () => {
      const value = receiptSearch.trim();

      if (!value) {
        setReceiptSuggestions([]);
        return;
      }

      const suggestions = await getUniversalReceiptSuggestions(value);
      setReceiptSuggestions(suggestions);
      setShowReceiptSuggestions(true);
    }, 250);

    return () => clearTimeout(timer);
  }, [receiptSearch]);

  async function loadEverything() {
    setLoading(true);
    setLoadError("");

    const [userFromCache, settingsFromCache, coreFromCache, studentsFromCache] =
      await Promise.all([
        loadUser(),
        loadSettings(),
        loadCoreTables(),
        loadStudents(),
      ]);

    setShowingCachedData(
      [userFromCache, settingsFromCache, coreFromCache, studentsFromCache].some(Boolean)
    );

    setLoading(false);
  }

  async function loadUser() {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    const email = String(session?.user?.email || "");
    const userId = String(session?.user?.id || "");

    if (!email && !userId) return false;

    const teachersRes = await fetchWithCache(
      OFFLINE_MODULE,
      "teachers",
      () => supabase.from("teachers").select("*"),
      [] as any[]
    );

    const userRow =
      teachersRes.data.find((item) => item.auth_user_id === userId) ||
      teachersRes.data.find(
        (item) =>
          String(item.email || "").toLowerCase() === email.toLowerCase()
      ) ||
      null;

    const name =
      userRow?.full_name ||
      userRow?.name ||
      userRow?.teacher_name ||
      session?.user?.email ||
      "Admin";

    setCurrentUserName(String(name));
    return teachersRes.fromCache;
  }

  async function loadSettings() {
    const possibleTables = ["school_settings", "jsms_settings", "settings"];

    for (const table of possibleTables) {
      const result = await fetchWithCache(
        OFFLINE_MODULE,
        table,
        () => supabase.from(table).select("*").limit(1).maybeSingle(),
        null as any
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

  async function loadCoreTables() {
    const [
      booksRes,
      structuresRes,
      structureItemsRes,
      paymentsRes,
      paymentItemsRes,
      givenRes,
      supplierPurchasesRes,
      supplierItemsRes,
    ] = await Promise.all([
      fetchWithCache(
        OFFLINE_MODULE,
        "jsms_books",
        () => supabase.from("jsms_books").select("*").order("created_at", { ascending: false }),
        [] as Book[]
      ),

      fetchWithCache(
        OFFLINE_MODULE,
        "jsms_book_structures",
        () => supabase.from("jsms_book_structures").select("*").order("created_at", { ascending: false }),
        [] as BookStructure[]
      ),

      fetchWithCache(
        OFFLINE_MODULE,
        "jsms_book_structure_items",
        () => supabase.from("jsms_book_structure_items").select("*").order("created_at", { ascending: false }),
        [] as BookStructureItem[]
      ),

      fetchWithCache(
        OFFLINE_MODULE,
        "jsms_book_payments",
        () => supabase.from("jsms_book_payments").select("*").order("created_at", { ascending: false }),
        [] as BookPayment[]
      ),

      fetchWithCache(
        OFFLINE_MODULE,
        "jsms_book_payment_items",
        () => supabase.from("jsms_book_payment_items").select("*").order("created_at", { ascending: false }),
        [] as BookPaymentItem[]
      ),

      fetchWithCache(
        OFFLINE_MODULE,
        "jsms_books_given",
        () => supabase.from("jsms_books_given").select("*").order("created_at", { ascending: false }),
        [] as BookGiven[]
      ),

      fetchWithCache(
        OFFLINE_MODULE,
        "jsms_book_supplier_purchases",
        () => supabase.from("jsms_book_supplier_purchases").select("*").order("created_at", { ascending: false }),
        [] as SupplierPurchase[]
      ),

      fetchWithCache(
        OFFLINE_MODULE,
        "jsms_book_supplier_purchase_items",
        () => supabase.from("jsms_book_supplier_purchase_items").select("*").order("created_at", { ascending: false }),
        [] as SupplierPurchaseItem[]
      ),
    ]);

    setBooks(booksRes.data);
    setStructures(structuresRes.data);
    setStructureItems(structureItemsRes.data);
    setPayments(paymentsRes.data);
    setPaymentItems(paymentItemsRes.data);
    setBooksGiven(givenRes.data);
    setSupplierPurchases(supplierPurchasesRes.data);
    setSupplierItems(supplierItemsRes.data);

    return [
      booksRes,
      structuresRes,
      structureItemsRes,
      paymentsRes,
      paymentItemsRes,
      givenRes,
      supplierPurchasesRes,
      supplierItemsRes,
    ].some((result) => result.fromCache);
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
        [] as any[]
      );

      if (result.data && result.data.length > 0) {
        const normalized = normalizeStudents(result.data);

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
    return rows
      .map((row) => {
        const name =
          row.student_name ||
          row.full_name ||
          row.fullname ||
          row.name ||
          row.studentName ||
          row.fullName ||
          `${row.first_name || ""} ${row.last_name || ""}`.trim();

        const className =
          row.class_name ||
          row.class_id ||
          row.class ||
          row.current_class ||
          row.grade ||
          row.className ||
          row.student_class ||
          "";

        return {
          student_id: String(findRealJvsId(row) || ""),
          student_name: String(name || ""),
          class_name: String(className || ""),
        };
      })
      .filter((student) => student.student_name && student.class_name);
  }

  // currentTerm defaults to the "Current Term" placeholder and academicYear
  // to "" until loadSettings() finds a real school_settings row. Only scope
  // by term/year once we actually have a real current term, so we never
  // silently hide every structure/payment when settings failed to load.
  const hasTermScope = Boolean(currentTerm) && currentTerm !== "Current Term";

  const activeStructures = useMemo(() => {
    return structures.filter((item) => {
      if (item.is_active === false) return false;
      if (!hasTermScope) return true;

      // Structures created before term/year was tracked have a null term;
      // treat those as always eligible rather than hiding them.
      const sameTerm = !item.term || item.term === currentTerm;
      const sameYear =
        !academicYear || !item.academic_year || item.academic_year === academicYear;

      return sameTerm && sameYear;
    });
  }, [structures, hasTermScope, currentTerm, academicYear]);

  const selectedStructure = activeStructures.find(
    (item) => item.id === paymentForm.structure_id
  );

  const selectedSpecificBooks = books.filter((book) =>
    selectedSpecificBookIds.includes(book.id)
  );

  const specificBooksTotal = selectedSpecificBooks.reduce((sum, book) => {
    return sum + numberValue(book.selling_price);
  }, 0);

  const paymentTotal =
    paymentForm.payment_type === "full_structure"
      ? numberValue(selectedStructure?.full_amount)
      : specificBooksTotal;

  const paymentPaid = numberValue(paymentForm.amount_paid);
  const paymentBalance = paymentTotal - paymentPaid;

  const filteredClassPayments = useMemo(() => {
    if (!classFilter) return payments;

    return payments.filter((payment) => payment.class_name === classFilter);
  }, [payments, classFilter]);

  // Payments belonging to the current term/academic year, used for the
  // dashboard debt/pending stats so balances from previous terms don't
  // silently keep accumulating into "current" figures forever.
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
    const totalStock = books.reduce(
      (sum, book) => sum + numberValue(book.quantity),
      0
    );

    const lowStock = books.filter((book) => {
      const qty = numberValue(book.quantity);
      return qty > 0 && qty < 10;
    });

    const outOfStock = books.filter(
      (book) => numberValue(book.quantity) <= 0
    );

    const studentPayments = payments.reduce(
      (sum, payment) => sum + numberValue(payment.amount_paid),
      0
    );

    const studentDebt = currentTermPayments.reduce(
      (sum, payment) => sum + Math.max(numberValue(payment.balance), 0),
      0
    );

    const supplierDebt = supplierPurchases.reduce(
      (sum, purchase) => sum + Math.max(numberValue(purchase.balance), 0),
      0
    );

    const pendingBookStudents = currentTermPayments.filter((payment) => {
      const expected = getExpectedBooksForPayment(payment);
      const given = booksGiven.filter(
        (item) => item.payment_id === payment.id
      );

      if (expected.length === 0) return false;
      return getPendingBooks(expected, given).length > 0;
    }).length;

    return {
      totalStock,
      lowStock,
      outOfStock,
      studentPayments,
      studentDebt,
      supplierDebt,
      pendingBookStudents,
    };
  }, [
    books,
    payments,
    currentTermPayments,
    supplierPurchases,
    booksGiven,
    structureItems,
    paymentItems,
  ]);

  function getExpectedBooksForPayment(payment: BookPayment) {
    if (payment.payment_type === "full_structure") {
      return structureItems
        .filter((item) => item.structure_id === payment.structure_id)
        .map((item) => ({
          book_id: item.book_id,
          book_name: item.book_name,
          quantity: numberValue(item.expected_quantity) || 1,
        }));
    }

    return paymentItems
      .filter((item) => item.payment_id === payment.id)
      .map((item) => ({
        book_id: item.book_id,
        book_name: item.book_name,
        quantity: numberValue(item.quantity) || 1,
      }));
  }

  function getPendingBooks(
    expectedBooks: { book_id: string | null; book_name: string; quantity: number }[],
    givenBooks: BookGiven[]
  ) {
    return expectedBooks
      .map((expected) => {
        const givenQty = givenBooks
          .filter((given) => {
            if (expected.book_id && given.book_id) {
              return expected.book_id === given.book_id;
            }

            return (
              given.book_name.toLowerCase() ===
              expected.book_name.toLowerCase()
            );
          })
          .reduce((sum, item) => sum + numberValue(item.quantity_given), 0);

        const pendingQty = Math.max(numberValue(expected.quantity) - givenQty, 0);

        return {
          ...expected,
          pending_quantity: pendingQty,
        };
      })
      .filter((item) => item.pending_quantity > 0);
  }

  function getBooksStatus(payment: BookPayment) {
    const expected = getExpectedBooksForPayment(payment);
    const given = booksGiven.filter((item) => item.payment_id === payment.id);

    if (expected.length === 0) return "No Books Listed";
    if (given.length === 0) return "None Given";

    const pending = getPendingBooks(expected, given);

    if (pending.length === 0) return "All Given";
    return "Some Pending";
  }

  async function handleReceiptSearch(value?: string) {
    const receiptValue = String(value || receiptSearch).trim();

    if (!receiptValue) {
      alert("Enter receipt number first.");
      return;
    }

    setSearchingReceipt(true);
    setShowReceiptSuggestions(false);

    const result = await searchUniversalReceipt(receiptValue);

    setUniversalResult(result);
    setSearchingReceipt(false);
  }

  async function handleAddStructure() {
    const structureName = structureForm.structure_name.trim();
    const className = structureForm.class_name.trim();
    const amount = numberValue(structureForm.full_amount);

    if (!structureName || !className || amount <= 0) {
      alert("Fill structure name, class and amount.");
      return;
    }

    const { error } = await supabase.from("jsms_book_structures").insert({
      structure_name: structureName,
      class_name: className,
      term: currentTerm,
      academic_year: academicYear || null,
      full_amount: amount,
      notes: structureForm.notes.trim() || null,
      is_active: true,
    });

    if (error) {
      alert(`Could not save book structure: ${error.message}`);
      return;
    }

    setStructureForm({
      structure_name: "",
      class_name: "",
      full_amount: "",
      notes: "",
    });

    await loadEverything();
  }

  async function handleAddStructureItem() {
    const structureId = structureItemForm.structure_id;
    const selectedBook = books.find((book) => book.id === structureItemForm.book_id);

    const bookName =
      selectedBook?.book_name || structureItemForm.book_name.trim();

    const subject =
      selectedBook?.subject || structureItemForm.subject.trim() || null;

    const className =
      selectedBook?.class_name || structureItemForm.class_name || null;

    const individualPrice = selectedBook
      ? numberValue(selectedBook.selling_price)
      : numberValue(structureItemForm.individual_price);

    const expectedQuantity = numberValue(structureItemForm.expected_quantity);

    if (!structureId || !bookName || individualPrice <= 0 || expectedQuantity <= 0) {
      alert("Select structure, book/name, individual price and quantity.");
      return;
    }

    const { error } = await supabase.from("jsms_book_structure_items").insert({
      structure_id: structureId,
      book_id: selectedBook?.id || null,
      book_name: bookName,
      subject,
      class_name: className,
      individual_price: individualPrice,
      expected_quantity: expectedQuantity,
    });

    if (error) {
      alert(`Could not add book to structure: ${error.message}`);
      return;
    }

    setStructureItemForm({
      structure_id: structureId,
      book_id: "",
      book_name: "",
      subject: "",
      class_name: "",
      individual_price: "",
      expected_quantity: "1",
    });

    await loadEverything();
  }

  async function handleDeleteStructure(structure: BookStructure) {
    const yes = confirm(`Delete ${structure.structure_name}?`);
    if (!yes) return;

    const { error } = await supabase
      .from("jsms_book_structures")
      .delete()
      .eq("id", structure.id);

    if (error) {
      alert(`Could not delete structure: ${error.message}`);
      return;
    }

    await loadEverything();
  }

  function handlePaymentStudentPick(student: StudentOption) {
    setPaymentForm((prev) => ({
      ...prev,
      student_search: `${student.student_name} - ${student.class_name}`,
      student_id: student.student_id,
      student_name: student.student_name,
      class_name: student.class_name,
      structure_id: "",
    }));
  }

  function handleManualGivenStudentPick(student: StudentOption) {
    setManualGivenForm((prev) => ({
      ...prev,
      student_search: `${student.student_name} - ${student.class_name}`,
      student_id: student.student_id,
      student_name: student.student_name,
      class_name: student.class_name,
      payment_id: "",
    }));
  }

  async function handleRecordPayment() {
    const studentId = paymentForm.student_id.trim();
    const studentName = paymentForm.student_name.trim();
    const className = paymentForm.class_name.trim();
    const paid = numberValue(paymentForm.amount_paid);

    if (!studentId || !studentName || !className) {
      alert("Select student first.");
      return;
    }

    try {
      getLastFourStudentId(studentId);
    } catch {
      alert("Student ID must contain at least 4 numbers, like JVS97001.");
      return;
    }

    if (paid <= 0) {
      alert("Enter amount paid.");
      return;
    }

    let total = 0;
    let paidFor = "";
    let structureId: string | null = null;

    if (paymentForm.payment_type === "full_structure") {
      if (!selectedStructure) {
        alert("Select book structure.");
        return;
      }

      total = numberValue(selectedStructure.full_amount);
      paidFor = selectedStructure.structure_name;
      structureId = selectedStructure.id;
    } else {
      if (selectedSpecificBooks.length === 0) {
        alert("Select at least one book.");
        return;
      }

      total = specificBooksTotal;
      paidFor = selectedSpecificBooks.map((book) => book.book_name).join(", ");
    }

    if (paid > total) {
      alert("Amount paid cannot be more than total.");
      return;
    }

    const balance = total - paid;

    const requestPayload = {
      studentId,
      studentName,
      className,
      paymentType: paymentForm.payment_type,
      structureId,
      paidFor,
      totalAmount: total,
      amountPaid: paid,
      term: currentTerm,
      academicYear: academicYear || null,
      note: paymentForm.note.trim() || null,
      specificBooks:
        paymentForm.payment_type === "specific_books"
          ? selectedSpecificBooks.map((book) => ({
              id: book.id,
              book_name: book.book_name,
              selling_price: numberValue(book.selling_price),
            }))
          : [],
    };

    let paymentData: BookPayment | null = null;
    let wentOffline = false;

    if (navigator.onLine) {
      try {
        const response = await authedFetch("/api/books/record-payment", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestPayload),
        });

        const body = await response.json().catch(() => ({}));
        if (!response.ok) {
          alert(`Could not record payment: ${body?.error || "Unknown error"}`);
          return;
        }

        paymentData = body.payment as BookPayment;
      } catch (error: any) {
        if (!(error instanceof TypeError)) {
          alert(`Could not record payment: ${error?.message || "Unknown error"}`);
          return;
        }
        wentOffline = true;
      }
    } else {
      wentOffline = true;
    }

    if (wentOffline) {
      // Don't queue yet — the popup below still needs the given-books
      // selection, and both steps get bundled into ONE offline action once
      // the popup is confirmed (see saveBooksGivenFromPopup).
      setOfflinePaymentPayload(requestPayload);
      paymentData = {
        id: "local-pending-payment",
        student_id: studentId,
        student_name: studentName,
        class_name: className,
        receipt_number: "Pending sync",
        payment_type: paymentForm.payment_type,
        structure_id: structureId,
        paid_for: paidFor,
        item_name: paidFor,
        total_amount: total,
        amount_paid: paid,
        balance,
        receipt_issued_by: currentUserName,
        received_by: currentUserName,
        payment_note: paymentForm.note.trim() || null,
        term: currentTerm,
        academic_year: academicYear || null,
        created_at: new Date().toISOString(),
      };
    } else {
      setOfflinePaymentPayload(null);
    }

    if (!paymentData) return;

    const expectedBooks =
      paymentForm.payment_type === "full_structure"
        ? structureItems
            .filter((item) => item.structure_id === structureId)
            .map((item) => ({
              book_id: item.book_id,
              book_name: item.book_name,
              quantity: numberValue(item.expected_quantity) || 1,
            }))
        : selectedSpecificBooks.map((book) => ({
            book_id: book.id,
            book_name: book.book_name,
            quantity: 1,
          }));

    setPendingIssue({
      payment: paymentData,
      expectedBooks,
    });

    const initialSelections: Record<string, { checked: boolean; quantity: string }> =
      {};

    expectedBooks.forEach((book, index) => {
      initialSelections[`${book.book_id || book.book_name}-${index}`] = {
        checked: true,
        quantity: String(book.quantity || 1),
      };
    });

    setIssueSelections(initialSelections);

    setPaymentForm({
      student_search: "",
      student_id: "",
      student_name: "",
      class_name: "",
      payment_type: "full_structure",
      structure_id: "",
      amount_paid: "",
      note: "",
    });

    setSelectedSpecificBookIds([]);

    if (!wentOffline) {
      await loadEverything();
    }
  }

  async function saveBooksGivenFromPopup() {
    if (!pendingIssue) return;

    const rows = pendingIssue.expectedBooks
      .map((book, index) => {
        const key = `${book.book_id || book.book_name}-${index}`;
        const selection = issueSelections[key];

        if (!selection?.checked) return null;

        const qty = numberValue(selection.quantity);

        if (qty <= 0) return null;

        return {
          payment_id: pendingIssue.payment.id,
          receipt_number: pendingIssue.payment.receipt_number,
          student_id: pendingIssue.payment.student_id,
          student_name: pendingIssue.payment.student_name,
          class_name: pendingIssue.payment.class_name,
          structure_id: pendingIssue.payment.structure_id,
          book_id: book.book_id,
          book_name: book.book_name,
          quantity_given: qty,
          given_by: currentUserName,
          given_at: new Date().toISOString(),
          note: null,
        };
      })
      .filter(Boolean) as any[];

    if (rows.length === 0) {
      alert("Select at least one book given, or click Skip For Now.");
      return;
    }

    // Stock check against the LAST-SYNCED local cache only — this can be
    // stale (another device may have issued the same book while this one
    // was offline), and that's an accepted tradeoff: issuing is allowed to
    // proceed anyway, and any resulting oversell surfaces afterward via the
    // reconciliation banner rather than blocking staff at the shelf.
    const neededByBookId = new Map<string, number>();
    for (const row of rows) {
      if (!row.book_id) continue;
      neededByBookId.set(
        row.book_id,
        (neededByBookId.get(row.book_id) || 0) + numberValue(row.quantity_given)
      );
    }

    const givenItemsPayload = rows.map((row) => ({
      book_id: row.book_id,
      book_name: row.book_name,
      quantity_given: row.quantity_given,
    }));

    // The payment itself never reached the server (offline) — bundle it
    // with the given-books into one combined action instead of two.
    if (offlinePaymentPayload) {
      const offlineId = await queueOfflineAction(
        OFFLINE_MODULE,
        "record-payment-and-issue",
        "/api/books/record-payment-and-issue",
        { ...offlinePaymentPayload, givenItems: givenItemsPayload }
      );

      setBooksGiven((prev) => [
        ...rows.map(
          (row, index) =>
            ({
              ...row,
              id: `pending-${offlineId}-${index}`,
            }) as BookGiven
        ),
        ...prev,
      ]);

      applyOptimisticStockDecrement(neededByBookId);
      setOfflinePaymentPayload(null);
      setPendingIssue(null);
      setIssueSelections({});
      alert("Saved offline. Payment and books given will sync automatically once you're back online.");
      return;
    }

    const issuePayload = {
      paymentId: pendingIssue.payment.id,
      receiptNumber: pendingIssue.payment.receipt_number,
      studentId: pendingIssue.payment.student_id,
      studentName: pendingIssue.payment.student_name,
      className: pendingIssue.payment.class_name,
      structureId: pendingIssue.payment.structure_id,
      items: givenItemsPayload,
    };

    if (navigator.onLine) {
      try {
        const response = await authedFetch("/api/books/issue", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(issuePayload),
        });

        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body?.error || "Could not save books given.");

        if (Array.isArray(body.oversoldBooks) && body.oversoldBooks.length > 0) {
          setOversoldBooks((prev) => Array.from(new Set([...prev, ...body.oversoldBooks])));
        }

        for (const row of rows) {
          try {
            await notifyBookIssued({
              studentId: row.student_id,
              studentName: row.student_name,
              className: row.class_name || "",
              bookName:
                numberValue(row.quantity_given) > 1
                  ? `${row.book_name} x${row.quantity_given}`
                  : row.book_name,
            });
          } catch (notifyError) {
            console.error("Book issued notification failed:", notifyError);
          }
        }

        setPendingIssue(null);
        setIssueSelections({});
        await loadEverything();
        alert("Books given saved.");
        return;
      } catch (error: any) {
        if (!(error instanceof TypeError)) {
          alert(`Could not save books given: ${error?.message || "Unknown error"}`);
          return;
        }
        // fall through to offline queue on a genuine network failure
      }
    }

    await queueOfflineAction(OFFLINE_MODULE, "issue", "/api/books/issue", issuePayload);

    setBooksGiven((prev) => [
      ...rows.map((row, index) => ({ ...row, id: `pending-issue-${index}-${Date.now()}` }) as BookGiven),
      ...prev,
    ]);

    applyOptimisticStockDecrement(neededByBookId);
    setPendingIssue(null);
    setIssueSelections({});
    alert("Saved offline. Books given will sync automatically once you're back online.");
  }

  function applyOptimisticStockDecrement(neededByBookId: Map<string, number>) {
    setBooks((prev) =>
      prev.map((book) => {
        const qty = neededByBookId.get(book.id);
        if (!qty) return book;
        return { ...book, quantity: numberValue(book.quantity) - qty };
      })
    );
  }

  async function openManualBooksGivenPopup() {
    const payment = payments.find(
      (item) => item.id === manualGivenForm.payment_id
    );

    if (!payment) {
      alert("Select payment record first.");
      return;
    }

    const expected = getExpectedBooksForPayment(payment);
    const given = booksGiven.filter((item) => item.payment_id === payment.id);
    const pending = getPendingBooks(expected, given);

    if (pending.length === 0) {
      alert("No pending books for this payment.");
      return;
    }

    setPendingIssue({
      payment,
      expectedBooks: pending.map((item) => ({
        book_id: item.book_id,
        book_name: item.book_name,
        quantity: item.pending_quantity,
      })),
    });

    const initialSelections: Record<string, { checked: boolean; quantity: string }> =
      {};

    pending.forEach((book, index) => {
      initialSelections[`${book.book_id || book.book_name}-${index}`] = {
        checked: true,
        quantity: String(book.pending_quantity || 1),
      };
    });

    setIssueSelections(initialSelections);
  }

  async function handleAddBookToStock() {
    const bookName = stockForm.book_name.trim();
    const className = stockForm.class_name.trim();
    const quantity = numberValue(stockForm.quantity);
    const costPrice = numberValue(stockForm.cost_price);
    const sellingPrice = numberValue(stockForm.selling_price);

    if (!bookName || !className || quantity < 0 || sellingPrice <= 0) {
      alert("Fill book name, class, quantity and selling price.");
      return;
    }

    const { error } = await supabase.from("jsms_books").insert({
      book_name: bookName,
      class_name: className,
      subject: stockForm.subject.trim() || null,
      quantity,
      cost_price: costPrice,
      selling_price: sellingPrice,
    });

    if (error) {
      alert(`Could not add book: ${error.message}`);
      return;
    }

    setStockForm({
      book_name: "",
      class_name: "",
      subject: "",
      quantity: "",
      cost_price: "",
      selling_price: "",
    });

    await loadEverything();
  }

  async function handleRestock(book: Book) {
    const value = prompt(`Add how many copies to ${book.book_name}?`);
    if (!value) return;

    const qty = numberValue(value);

    if (qty <= 0) {
      alert("Enter valid quantity.");
      return;
    }

    if (navigator.onLine) {
      try {
        const response = await authedFetch("/api/books/restock", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ bookId: book.id, quantity: qty }),
        });

        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body?.error || "Could not restock.");

        await loadEverything();
        return;
      } catch (error: any) {
        if (!(error instanceof TypeError)) {
          alert(`Could not restock: ${error?.message || "Unknown error"}`);
          return;
        }
        // fall through to offline queue on a genuine network failure
      }
    }

    await queueOfflineAction(OFFLINE_MODULE, "restock", "/api/books/restock", {
      bookId: book.id,
      quantity: qty,
    });

    setBooks((prev) =>
      prev.map((item) => (item.id === book.id ? { ...item, quantity: numberValue(item.quantity) + qty } : item))
    );

    alert("Saved offline. Restock will sync automatically once you're back online.");
  }

  async function handleDeleteBook(book: Book) {
    const yes = confirm(`Delete ${book.book_name}?`);
    if (!yes) return;

    const { error } = await supabase.from("jsms_books").delete().eq("id", book.id);

    if (error) {
      alert(`Could not delete book: ${error.message}`);
      return;
    }

    await loadEverything();
  }

  function addSupplierTempItem() {
    const bookName = supplierItemForm.book_name.trim();
    const className = supplierItemForm.class_name.trim();
    const quantity = numberValue(supplierItemForm.quantity);
    const costPrice = numberValue(supplierItemForm.cost_price);
    const sellingPrice = numberValue(supplierItemForm.selling_price);

    if (!bookName || !className || quantity <= 0 || costPrice <= 0 || sellingPrice <= 0) {
      alert("Fill book name, class, quantity, cost price and selling price.");
      return;
    }

    setSupplierTempItems((prev) => [
      ...prev,
      {
        temp_id: crypto.randomUUID(),
        book_name: bookName,
        subject: supplierItemForm.subject.trim(),
        class_name: className,
        quantity: supplierItemForm.quantity,
        cost_price: supplierItemForm.cost_price,
        selling_price: supplierItemForm.selling_price,
      },
    ]);

    setSupplierItemForm({
      book_name: "",
      subject: "",
      class_name: "",
      quantity: "",
      cost_price: "",
      selling_price: "",
    });
  }

  async function handleSaveSupplierPurchase() {
    const supplierName = supplierForm.supplier_name.trim();

    if (!supplierName) {
      alert("Enter supplier name.");
      return;
    }

    if (supplierTempItems.length === 0) {
      alert("Add at least one book item.");
      return;
    }

    const totalAmount = supplierTempItems.reduce((sum, item) => {
      return sum + numberValue(item.quantity) * numberValue(item.cost_price);
    }, 0);

    const amountPaid = numberValue(supplierForm.amount_paid);

    if (amountPaid < 0 || amountPaid > totalAmount) {
      alert("Amount paid is not valid.");
      return;
    }

    const balance = totalAmount - amountPaid;
    const status = supplierStatus(totalAmount, amountPaid);

    const { data: purchaseData, error: purchaseError } = await supabase
      .from("jsms_book_supplier_purchases")
      .insert({
        supplier_name: supplierName,
        supplier_phone: supplierForm.supplier_phone.trim() || null,
        supplier_receipt_number:
          supplierForm.supplier_receipt_number.trim() || null,
        purchase_date:
          supplierForm.purchase_date || new Date().toISOString().slice(0, 10),
        bought_on_credit: supplierForm.bought_on_credit,
        total_amount: totalAmount,
        amount_paid: amountPaid,
        balance,
        payment_method: supplierForm.payment_method.trim() || null,
        payment_status: status,
        paid_by: currentUserName,
        notes: supplierForm.notes.trim() || null,
      })
      .select("*")
      .single();

    if (purchaseError || !purchaseData) {
      alert(`Could not save supplier purchase: ${purchaseError?.message || "Unknown error"}`);
      return;
    }

    const itemRows = supplierTempItems.map((item) => ({
      purchase_id: purchaseData.id,
      book_id: null,
      book_name: item.book_name,
      subject: item.subject || null,
      class_name: item.class_name,
      quantity: numberValue(item.quantity),
      cost_price: numberValue(item.cost_price),
      selling_price: numberValue(item.selling_price),
      total_cost: numberValue(item.quantity) * numberValue(item.cost_price),
    }));

    const { error: itemError } = await supabase
      .from("jsms_book_supplier_purchase_items")
      .insert(itemRows);

    if (itemError) {
      alert(`Supplier saved, but book items failed: ${itemError.message}`);
      return;
    }

    for (const item of supplierTempItems) {
      const existing = books.find((book) => {
        return (
          book.book_name.toLowerCase() === item.book_name.toLowerCase() &&
          String(book.class_name || "").toLowerCase() ===
            item.class_name.toLowerCase() &&
          String(book.subject || "").toLowerCase() ===
            item.subject.toLowerCase()
        );
      });

      if (existing) {
        await supabase
          .from("jsms_books")
          .update({
            quantity: numberValue(existing.quantity) + numberValue(item.quantity),
            cost_price: numberValue(item.cost_price),
            selling_price: numberValue(item.selling_price),
            supplier_name: supplierName,
          })
          .eq("id", existing.id);
      } else {
        await supabase.from("jsms_books").insert({
          book_name: item.book_name,
          class_name: item.class_name,
          subject: item.subject || null,
          quantity: numberValue(item.quantity),
          cost_price: numberValue(item.cost_price),
          selling_price: numberValue(item.selling_price),
          supplier_name: supplierName,
        });
      }
    }

    setSupplierForm({
      supplier_name: "",
      supplier_phone: "",
      supplier_receipt_number: "",
      purchase_date: "",
      bought_on_credit: false,
      amount_paid: "",
      payment_method: "",
      notes: "",
    });

    setSupplierTempItems([]);
    await loadEverything();
    alert("Supplier purchase saved and stock updated.");
  }

  async function handleAddSupplierPayment() {
    const purchase = supplierPurchases.find(
      (item) => item.id === supplierPaymentForm.purchase_id
    );

    if (!purchase) {
      alert("Select supplier purchase.");
      return;
    }

    const amount = numberValue(supplierPaymentForm.amount_paid);

    if (amount <= 0) {
      alert("Enter amount paid.");
      return;
    }

    if (amount > numberValue(purchase.balance)) {
      alert("Amount is more than supplier balance.");
      return;
    }

    const newPaid = numberValue(purchase.amount_paid) + amount;
    const newBalance = numberValue(purchase.balance) - amount;
    const newStatus = supplierStatus(numberValue(purchase.total_amount), newPaid);

    const { error: updateError } = await supabase
      .from("jsms_book_supplier_purchases")
      .update({
        amount_paid: newPaid,
        balance: newBalance,
        payment_status: newStatus,
        paid_by: currentUserName,
      })
      .eq("id", purchase.id);

    if (updateError) {
      alert(`Could not update supplier: ${updateError.message}`);
      return;
    }

    const { error: paymentError } = await supabase
      .from("jsms_book_supplier_payments")
      .insert({
        purchase_id: purchase.id,
        supplier_name: purchase.supplier_name,
        amount_paid: amount,
        payment_method: supplierPaymentForm.payment_method.trim() || null,
        paid_by: currentUserName,
        note: supplierPaymentForm.note.trim() || null,
      });

    if (paymentError) {
      alert(`Supplier updated, but payment history failed: ${paymentError.message}`);
      return;
    }

    setSupplierPaymentForm({
      purchase_id: "",
      amount_paid: "",
      payment_method: "",
      note: "",
    });

    await loadEverything();
  }

  const quickActions = [
    { key: "dashboard", title: "Dashboard", desc: "Overview", emoji: "📊" },
    {
      key: "structure",
      title: "Book Structure",
      desc: "Class books and prices",
      emoji: "📚",
    },
    {
      key: "payment",
      title: "Record Payment",
      desc: "Student book payments",
      emoji: "💰",
    },
    {
      key: "given",
      title: "Books Given",
      desc: "Books issued to students",
      emoji: "✅",
    },
    {
      key: "records",
      title: "Class Records",
      desc: "Payment and pending books",
      emoji: "🏫",
    },
    { key: "stock", title: "Stock", desc: "Physical books", emoji: "📦" },
    {
      key: "suppliers",
      title: "Suppliers",
      desc: "Purchases and credit",
      emoji: "🤝",
    },
  ] as const;

  const moduleDownloadStatus = useModuleLoadBadge(loading);

  return (
    <main className="min-h-screen bg-[#f7f3df] p-4 sm:p-6">
      <ModuleDownloadBadge status={moduleDownloadStatus} label="Books" />
      <section className="mx-auto max-w-7xl space-y-4">
        <div className="flex flex-col gap-3 rounded-3xl border border-yellow-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-wide text-yellow-700">
              JSMS Books 📚
            </p>

            <h1 className="text-2xl font-black text-gray-950">
              Books Dashboard
            </h1>

            <p className="mt-1 text-sm font-medium text-gray-500">
              Term: <span className="font-black">{currentTerm}</span>
              {academicYear ? (
                <>
                  {" "}
                  • Academic Year:{" "}
                  <span className="font-black">{academicYear}</span>
                </>
              ) : null}
              {" "}
              • Receipt issued by:{" "}
              <span className="font-black">{currentUserName}</span>
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <OfflineStatusPill online={online} pendingCount={pendingCount} syncing={syncing} />
              {showingCachedData && (
                <span className="text-xs font-semibold text-gray-500">Showing last synced data</span>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              href="/dashboard/admin"
              className="rounded-2xl border border-gray-200 bg-white px-4 py-2 text-sm font-black text-gray-700 shadow-sm hover:bg-gray-50"
            >
              ← Back
            </Link>

            <Link
              href="/dashboard/admin"
              className="rounded-2xl bg-gray-950 px-4 py-2 text-sm font-black text-white shadow-sm hover:bg-black"
            >
              JSMS Dashboard
            </Link>
          </div>
        </div>

        <div className="flex justify-end">
          <div className="relative flex w-full gap-2 rounded-2xl border border-yellow-200 bg-white px-3 py-2 shadow-sm sm:w-1/3">
            <input
              type="text"
              value={receiptSearch}
              onChange={(e) => {
                setReceiptSearch(e.target.value);
                setShowReceiptSuggestions(true);
              }}
              onFocus={() => setShowReceiptSuggestions(true)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleReceiptSearch();
              }}
              placeholder="Search receipt number"
              className="h-9 min-w-0 flex-1 rounded-xl border border-yellow-200 bg-[#fffdf6] px-3 text-xs font-semibold text-gray-900 outline-none focus:border-yellow-500"
            />

            <button
              type="button"
              onClick={() => void handleReceiptSearch()}
              disabled={searchingReceipt}
              className="h-9 rounded-xl bg-gray-950 px-4 text-xs font-black text-white hover:bg-black disabled:cursor-not-allowed disabled:opacity-60"
            >
              {searchingReceipt ? "..." : "Search"}
            </button>

            {showReceiptSuggestions && receiptSuggestions.length > 0 && (
              <div className="absolute left-0 right-0 top-12 z-40 max-h-64 overflow-y-auto rounded-2xl border border-yellow-200 bg-white shadow-xl">
                {receiptSuggestions.map((item) => (
                  <button
                    key={`${item.module}-${item.receipt_number}-${item.id}`}
                    type="button"
                    onClick={() => {
                      setReceiptSearch(item.receipt_number);
                      setShowReceiptSuggestions(false);
                      void handleReceiptSearch(item.receipt_number);
                    }}
                    className="block w-full border-b border-gray-100 px-4 py-3 text-left hover:bg-yellow-50"
                  >
                    <span className="block text-sm font-black text-gray-950">
                      {item.receipt_number}
                    </span>
                    <span className="block text-xs font-semibold text-gray-500">
                      {item.module} • {item.student_name || "-"} •{" "}
                      {money(item.amount_paid)}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {oversoldBooks.length > 0 && (
          <div className="rounded-3xl border border-amber-300 bg-amber-50 p-4 text-sm font-bold text-amber-800">
            ⚠ {oversoldBooks.length} book{oversoldBooks.length > 1 ? "s" : ""} oversold while offline — review
            stock: {oversoldBooks.join(", ")}
          </div>
        )}

        {loadError && (
          <div className="rounded-3xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">
            {loadError}
          </div>
        )}

        <div className="grid gap-5 lg:grid-cols-[270px_1fr]">
          <aside className="rounded-3xl border border-yellow-200 bg-white p-4 shadow-sm">
            <h2 className="text-lg font-black text-gray-950">Quick Actions</h2>

            <div className="mt-4 space-y-3">
              {quickActions.map((action) => (
                <button
                  key={action.key}
                  type="button"
                  onClick={() => setActiveSection(action.key)}
                  className={`flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition ${
                    activeSection === action.key
                      ? "border-yellow-400 bg-yellow-100"
                      : "border-gray-100 bg-[#fffdf6] hover:border-yellow-300 hover:bg-yellow-50"
                  }`}
                >
                  <span className="grid h-11 w-11 place-items-center rounded-2xl bg-white text-xl">
                    {action.emoji}
                  </span>

                  <span>
                    <span className="block text-sm font-black text-gray-950">
                      {action.title}
                    </span>
                    <span className="block text-xs font-medium text-gray-500">
                      {action.desc}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </aside>

          <div className="space-y-5">
            {loading ? (
              <Panel title="Loading">Loading books module...</Panel>
            ) : activeSection === "dashboard" ? (
              <DashboardSection
                stats={stats}
                structures={structures}
                payments={payments}
                books={books}
                supplierPurchases={supplierPurchases}
                setActiveSection={setActiveSection}
              />
            ) : activeSection === "structure" ? (
              <StructureSection
                structures={structures}
                structureItems={structureItems}
                books={books}
                structureForm={structureForm}
                setStructureForm={setStructureForm}
                structureItemForm={structureItemForm}
                setStructureItemForm={setStructureItemForm}
                currentTerm={currentTerm}
                handleAddStructure={handleAddStructure}
                handleAddStructureItem={handleAddStructureItem}
                handleDeleteStructure={handleDeleteStructure}
              />
            ) : activeSection === "payment" ? (
              <PaymentSection
                students={students}
                books={books}
                structures={activeStructures}
                paymentForm={paymentForm}
                setPaymentForm={setPaymentForm}
                selectedSpecificBookIds={selectedSpecificBookIds}
                setSelectedSpecificBookIds={setSelectedSpecificBookIds}
                selectedStructure={selectedStructure}
                selectedSpecificBooks={selectedSpecificBooks}
                paymentTotal={paymentTotal}
                paymentPaid={paymentPaid}
                paymentBalance={paymentBalance}
                currentTerm={currentTerm}
                handleStudentPick={handlePaymentStudentPick}
                handleRecordPayment={handleRecordPayment}
              />
            ) : activeSection === "given" ? (
              <BooksGivenSection
                students={students}
                payments={payments}
                booksGiven={booksGiven}
                manualGivenForm={manualGivenForm}
                setManualGivenForm={setManualGivenForm}
                handleStudentPick={handleManualGivenStudentPick}
                openManualBooksGivenPopup={openManualBooksGivenPopup}
              />
            ) : activeSection === "records" ? (
              <ClassRecordsSection
                payments={filteredClassPayments}
                booksGiven={booksGiven}
                classFilter={classFilter}
                setClassFilter={setClassFilter}
                getExpectedBooksForPayment={getExpectedBooksForPayment}
                getPendingBooks={getPendingBooks}
                getBooksStatus={getBooksStatus}
              />
            ) : activeSection === "stock" ? (
              <StockSection
                books={books}
                stockForm={stockForm}
                setStockForm={setStockForm}
                handleAddBookToStock={handleAddBookToStock}
                handleRestock={handleRestock}
                handleDeleteBook={handleDeleteBook}
              />
            ) : (
              <SuppliersSection
                supplierForm={supplierForm}
                setSupplierForm={setSupplierForm}
                supplierItemForm={supplierItemForm}
                setSupplierItemForm={setSupplierItemForm}
                supplierTempItems={supplierTempItems}
                setSupplierTempItems={setSupplierTempItems}
                supplierPurchases={supplierPurchases}
                supplierItems={supplierItems}
                supplierPaymentForm={supplierPaymentForm}
                setSupplierPaymentForm={setSupplierPaymentForm}
                addSupplierTempItem={addSupplierTempItem}
                handleSaveSupplierPurchase={handleSaveSupplierPurchase}
                handleAddSupplierPayment={handleAddSupplierPayment}
              />
            )}
          </div>
        </div>
      </section>

      {pendingIssue && (
        <BooksGivenPopup
          pendingIssue={pendingIssue}
          issueSelections={issueSelections}
          setIssueSelections={setIssueSelections}
          onSave={saveBooksGivenFromPopup}
          onSkip={() => {
            setPendingIssue(null);
            setIssueSelections({});
          }}
        />
      )}

      {universalResult && (
        <ReceiptModal
          result={universalResult}
          onClose={() => setUniversalResult(null)}
        />
      )}
    </main>
  );
}

function DashboardSection({
  stats,
  structures,
  payments,
  books,
  supplierPurchases,
  setActiveSection,
}: {
  stats: any;
  structures: BookStructure[];
  payments: BookPayment[];
  books: Book[];
  supplierPurchases: SupplierPurchase[];
  setActiveSection: (section: Section) => void;
}) {
  const cards = [
    {
      title: "Book Structures",
      value: String(structures.length),
      note: "Class book prices",
      emoji: "📚",
      section: "structure" as Section,
    },
    {
      title: "Student Payments",
      value: money(stats.studentPayments),
      note: "Money received",
      emoji: "💰",
      section: "payment" as Section,
    },
    {
      title: "Student Book Debt",
      value: money(stats.studentDebt),
      note: "Students owing",
      emoji: "🧾",
      section: "records" as Section,
    },
    {
      title: "Pending Books",
      value: String(stats.pendingBookStudents),
      note: "Students with pending books",
      emoji: "⏳",
      section: "given" as Section,
    },
    {
      title: "Stock Available",
      value: String(stats.totalStock),
      note: "Total physical books",
      emoji: "📦",
      section: "stock" as Section,
    },
    {
      title: "Supplier Debt",
      value: money(stats.supplierDebt),
      note: "Owing suppliers",
      emoji: "🤝",
      section: "suppliers" as Section,
    },
  ];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
        {cards.map((card) => (
          <button
            key={card.title}
            type="button"
            onClick={() => setActiveSection(card.section)}
            className="rounded-3xl border border-yellow-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-1 hover:shadow-md"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase text-gray-500">
                  {card.title}
                </p>
                <h3 className="mt-2 text-lg font-black text-gray-950 sm:text-xl">
                  {card.value}
                </h3>
                <p className="mt-1 text-xs font-semibold text-gray-500">
                  {card.note}
                </p>
              </div>
              <span className="rounded-2xl bg-yellow-100 px-3 py-2 text-xl">
                {card.emoji}
              </span>
            </div>
          </button>
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Panel title="Low Stock Alert">
          <SimpleTable
            headers={["Book", "Class", "Qty", "Status"]}
            rows={books
              .filter((book) => numberValue(book.quantity) < 10)
              .slice(0, 8)
              .map((book) => [
                book.book_name,
                book.class_name || "-",
                String(book.quantity),
                numberValue(book.quantity) <= 0 ? "Out of Stock" : "Low Stock",
              ])}
            empty="No low stock books."
          />
        </Panel>

        <Panel title="Recent Book Payments">
          <SimpleTable
            headers={["Receipt", "Student", "Paid For", "Amount", "Balance"]}
            rows={payments.slice(0, 8).map((payment) => [
              payment.receipt_number,
              payment.student_name,
              payment.paid_for || "-",
              money(payment.amount_paid),
              money(payment.balance),
            ])}
            empty="No book payments yet."
          />
        </Panel>
      </div>

      <Panel title="Supplier Balances">
        <SimpleTable
          headers={["Supplier", "Supplier Receipt", "Total", "Paid", "Balance", "Status"]}
          rows={supplierPurchases
            .filter((item) => numberValue(item.balance) > 0)
            .slice(0, 8)
            .map((item) => [
              item.supplier_name,
              item.supplier_receipt_number || "-",
              money(item.total_amount),
              money(item.amount_paid),
              money(item.balance),
              supplierStatusLabel(item.payment_status),
            ])}
          empty="No supplier balance."
        />
      </Panel>
    </div>
  );
}

function StructureSection({
  structures,
  structureItems,
  books,
  structureForm,
  setStructureForm,
  structureItemForm,
  setStructureItemForm,
  currentTerm,
  handleAddStructure,
  handleAddStructureItem,
  handleDeleteStructure,
}: {
  structures: BookStructure[];
  structureItems: BookStructureItem[];
  books: Book[];
  structureForm: any;
  setStructureForm: any;
  structureItemForm: any;
  setStructureItemForm: any;
  currentTerm: string;
  handleAddStructure: () => void;
  handleAddStructureItem: () => void;
  handleDeleteStructure: (structure: BookStructure) => void;
}) {
  return (
    <div className="space-y-5">
      <Panel title="Create Book Structure">
        <p className="mb-4 text-sm font-semibold text-gray-500">
          Full class books amount is separate from individual book prices.
        </p>

        <div className="grid gap-3 md:grid-cols-2">
          <TextInput
            placeholder="Structure name e.g. Class 1 Books"
            value={structureForm.structure_name}
            onChange={(value) =>
              setStructureForm((prev: any) => ({
                ...prev,
                structure_name: value,
              }))
            }
          />

          <SelectInput
            value={structureForm.class_name}
            onChange={(value) =>
              setStructureForm((prev: any) => ({
                ...prev,
                class_name: value,
              }))
            }
            placeholder="Select class"
            options={classOptions}
          />

          <TextInput
            placeholder="Full class books amount e.g. 200"
            type="number"
            value={structureForm.full_amount}
            onChange={(value) =>
              setStructureForm((prev: any) => ({
                ...prev,
                full_amount: value,
              }))
            }
          />

          <TextInput
            placeholder={`Term: ${currentTerm}`}
            value={structureForm.notes}
            onChange={(value) =>
              setStructureForm((prev: any) => ({
                ...prev,
                notes: value,
              }))
            }
          />
        </div>

        <ActionButton onClick={handleAddStructure}>
          Save Book Structure
        </ActionButton>
      </Panel>

      <Panel title="Add Books Inside Structure">
        <div className="grid gap-3 md:grid-cols-3">
          <select
            value={structureItemForm.structure_id}
            onChange={(e) =>
              setStructureItemForm((prev: any) => ({
                ...prev,
                structure_id: e.target.value,
              }))
            }
            className="h-11 rounded-2xl border border-yellow-200 bg-[#fffdf6] px-3 text-sm font-semibold outline-none"
          >
            <option value="">Select structure</option>
            {structures.map((structure) => (
              <option key={structure.id} value={structure.id}>
                {structure.structure_name} - {money(structure.full_amount)}
              </option>
            ))}
          </select>

          <select
            value={structureItemForm.book_id}
            onChange={(e) => {
              const book = books.find((item) => item.id === e.target.value);

              setStructureItemForm((prev: any) => ({
                ...prev,
                book_id: e.target.value,
                book_name: book?.book_name || prev.book_name,
                subject: book?.subject || prev.subject,
                class_name: book?.class_name || prev.class_name,
                individual_price: book
                  ? String(book.selling_price)
                  : prev.individual_price,
              }));
            }}
            className="h-11 rounded-2xl border border-yellow-200 bg-[#fffdf6] px-3 text-sm font-semibold outline-none"
          >
            <option value="">Select from stock</option>
            {books.map((book) => (
              <option key={book.id} value={book.id}>
                {book.book_name} - {book.class_name} - {money(book.selling_price)}
              </option>
            ))}
          </select>

          <TextInput
            placeholder="Or type book name"
            value={structureItemForm.book_name}
            onChange={(value) =>
              setStructureItemForm((prev: any) => ({
                ...prev,
                book_name: value,
              }))
            }
          />

          <TextInput
            placeholder="Subject"
            value={structureItemForm.subject}
            onChange={(value) =>
              setStructureItemForm((prev: any) => ({
                ...prev,
                subject: value,
              }))
            }
          />

          <SelectInput
            value={structureItemForm.class_name}
            onChange={(value) =>
              setStructureItemForm((prev: any) => ({
                ...prev,
                class_name: value,
              }))
            }
            placeholder="Book class"
            options={classOptions}
          />

          <TextInput
            placeholder="Individual price"
            type="number"
            value={structureItemForm.individual_price}
            onChange={(value) =>
              setStructureItemForm((prev: any) => ({
                ...prev,
                individual_price: value,
              }))
            }
          />

          <TextInput
            placeholder="Expected quantity"
            type="number"
            value={structureItemForm.expected_quantity}
            onChange={(value) =>
              setStructureItemForm((prev: any) => ({
                ...prev,
                expected_quantity: value,
              }))
            }
          />
        </div>

        <ActionButton onClick={handleAddStructureItem}>
          Add Book To Structure
        </ActionButton>
      </Panel>

      <Panel title="Book Structures">
        <SimpleTable
          headers={["Structure", "Class", "Amount", "Books Inside", "Action"]}
          rows={structures.map((structure) => {
            const items = structureItems.filter(
              (item) => item.structure_id === structure.id
            );

            return [
              structure.structure_name,
              structure.class_name,
              money(structure.full_amount),
              items.length
                ? items
                    .map((item) => `${item.book_name} (${money(item.individual_price)})`)
                    .join(", ")
                : "-",
              <button
                key={structure.id}
                type="button"
                onClick={() => handleDeleteStructure(structure)}
                className="rounded-xl bg-red-100 px-3 py-2 text-xs font-black text-red-700"
              >
                Delete
              </button>,
            ];
          })}
          empty="No book structures yet."
        />
      </Panel>
    </div>
  );
}

function PaymentSection({
  students,
  books,
  structures,
  paymentForm,
  setPaymentForm,
  selectedSpecificBookIds,
  setSelectedSpecificBookIds,
  selectedStructure,
  selectedSpecificBooks,
  paymentTotal,
  paymentPaid,
  paymentBalance,
  currentTerm,
  handleStudentPick,
  handleRecordPayment,
}: {
  students: StudentOption[];
  books: Book[];
  structures: BookStructure[];
  paymentForm: any;
  setPaymentForm: any;
  selectedSpecificBookIds: string[];
  setSelectedSpecificBookIds: React.Dispatch<React.SetStateAction<string[]>>;
  selectedStructure?: BookStructure;
  selectedSpecificBooks: Book[];
  paymentTotal: number;
  paymentPaid: number;
  paymentBalance: number;
  currentTerm: string;
  handleStudentPick: (student: StudentOption) => void;
  handleRecordPayment: () => void;
}) {
  return (
    <Panel title="Record Book Payment">
      <p className="mb-4 text-sm font-semibold text-gray-500">
        Payment records money only. Stock reduces only when books are given.
      </p>

      <div className="grid gap-3 md:grid-cols-2">
        <StudentSearchInput
          students={students}
          value={paymentForm.student_search}
          onTyping={(value) =>
            setPaymentForm((prev: any) => ({
              ...prev,
              student_search: value,
              student_id: "",
              student_name: "",
              class_name: "",
              structure_id: "",
            }))
          }
          onPick={handleStudentPick}
        />

        <TextInput
          placeholder="Student ID"
          value={paymentForm.student_id}
          onChange={(value) =>
            setPaymentForm((prev: any) => ({ ...prev, student_id: value }))
          }
        />

        <TextInput
          placeholder="Student name"
          value={paymentForm.student_name}
          onChange={(value) =>
            setPaymentForm((prev: any) => ({ ...prev, student_name: value }))
          }
        />

        <SelectInput
          value={paymentForm.class_name}
          onChange={(value) =>
            setPaymentForm((prev: any) => ({
              ...prev,
              class_name: value,
              structure_id: "",
            }))
          }
          placeholder="Select class"
          options={classOptions}
        />

        <select
          value={paymentForm.payment_type}
          onChange={(e) => {
            setPaymentForm((prev: any) => ({
              ...prev,
              payment_type: e.target.value as PaymentType,
              structure_id: "",
            }));
            setSelectedSpecificBookIds([]);
          }}
          className="h-11 rounded-2xl border border-yellow-200 bg-[#fffdf6] px-3 text-sm font-semibold outline-none"
        >
          <option value="full_structure">Full Class Books</option>
          <option value="specific_books">Specific Books</option>
        </select>

        {paymentForm.payment_type === "full_structure" ? (
          <select
            value={paymentForm.structure_id}
            onChange={(e) =>
              setPaymentForm((prev: any) => ({
                ...prev,
                structure_id: e.target.value,
              }))
            }
            className="h-11 rounded-2xl border border-yellow-200 bg-[#fffdf6] px-3 text-sm font-semibold outline-none"
          >
            <option value="">Select book structure</option>
            {structures
              .filter(
                (structure) =>
                  !paymentForm.class_name ||
                  structure.class_name === paymentForm.class_name
              )
              .map((structure) => (
                <option key={structure.id} value={structure.id}>
                  {structure.structure_name} - {money(structure.full_amount)}
                </option>
              ))}
          </select>
        ) : (
          <div className="rounded-2xl border border-yellow-200 bg-[#fffdf6] p-3 md:col-span-2">
            <p className="mb-2 text-sm font-black text-gray-950">
              Select specific books
            </p>

            <div className="grid gap-2 md:grid-cols-2">
              {books
                .filter(
                  (book) =>
                    !paymentForm.class_name ||
                    book.class_name === paymentForm.class_name
                )
                .map((book) => (
                  <label
                    key={book.id}
                    className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-gray-100 bg-white px-3 py-2 text-sm font-semibold"
                  >
                    <span>
                      {book.book_name}{" "}
                      <span className="text-xs text-gray-500">
                        {book.subject || ""}
                      </span>
                    </span>

                    <span className="flex items-center gap-2">
                      <span className="font-black">{money(book.selling_price)}</span>
                      <input
                        type="checkbox"
                        checked={selectedSpecificBookIds.includes(book.id)}
                        onChange={(e) => {
                          setSelectedSpecificBookIds((prev) => {
                            if (e.target.checked) return [...prev, book.id];
                            return prev.filter((id) => id !== book.id);
                          });
                        }}
                      />
                    </span>
                  </label>
                ))}
            </div>
          </div>
        )}

        <TextInput
          placeholder="Amount paid"
          type="number"
          value={paymentForm.amount_paid}
          onChange={(value) =>
            setPaymentForm((prev: any) => ({
              ...prev,
              amount_paid: value,
            }))
          }
        />

        <TextInput
          placeholder={`Note - ${currentTerm}`}
          value={paymentForm.note}
          onChange={(value) =>
            setPaymentForm((prev: any) => ({ ...prev, note: value }))
          }
        />
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-4">
        <Info
          label="Selected"
          value={
            paymentForm.payment_type === "full_structure"
              ? selectedStructure?.structure_name || "No structure selected"
              : selectedSpecificBooks.length
                ? selectedSpecificBooks.map((book) => book.book_name).join(", ")
                : "No books selected"
          }
        />
        <Info label="Total" value={money(paymentTotal)} />
        <Info label="Paid" value={money(paymentPaid)} />
        <Info label="Balance" value={money(paymentBalance)} />
      </div>

      <ActionButton onClick={handleRecordPayment}>
        Record Book Payment
      </ActionButton>
    </Panel>
  );
}

function BooksGivenSection({
  students,
  payments,
  booksGiven,
  manualGivenForm,
  setManualGivenForm,
  handleStudentPick,
  openManualBooksGivenPopup,
}: {
  students: StudentOption[];
  payments: BookPayment[];
  booksGiven: BookGiven[];
  manualGivenForm: any;
  setManualGivenForm: any;
  handleStudentPick: (student: StudentOption) => void;
  openManualBooksGivenPopup: () => void;
}) {
  return (
    <div className="space-y-5">
      <Panel title="Record Books Given">
        <div className="grid gap-3 md:grid-cols-2">
          <StudentSearchInput
            students={students}
            value={manualGivenForm.student_search}
            onTyping={(value) =>
              setManualGivenForm((prev: any) => ({
                ...prev,
                student_search: value,
                student_id: "",
                student_name: "",
                class_name: "",
                payment_id: "",
              }))
            }
            onPick={handleStudentPick}
          />

          <TextInput
            placeholder="Student ID"
            value={manualGivenForm.student_id}
            onChange={(value) =>
              setManualGivenForm((prev: any) => ({
                ...prev,
                student_id: value,
              }))
            }
          />

          <TextInput
            placeholder="Student name"
            value={manualGivenForm.student_name}
            onChange={(value) =>
              setManualGivenForm((prev: any) => ({
                ...prev,
                student_name: value,
              }))
            }
          />

          <SelectInput
            value={manualGivenForm.class_name}
            onChange={(value) =>
              setManualGivenForm((prev: any) => ({
                ...prev,
                class_name: value,
              }))
            }
            placeholder="Select class"
            options={classOptions}
          />

          <select
            value={manualGivenForm.payment_id}
            onChange={(e) =>
              setManualGivenForm((prev: any) => ({
                ...prev,
                payment_id: e.target.value,
              }))
            }
            className="h-11 rounded-2xl border border-yellow-200 bg-[#fffdf6] px-3 text-sm font-semibold outline-none md:col-span-2"
          >
            <option value="">Select student payment record</option>
            {payments
              .filter(
                (payment) =>
                  !manualGivenForm.student_id ||
                  payment.student_id === manualGivenForm.student_id
              )
              .map((payment) => (
                <option key={payment.id} value={payment.id}>
                  {payment.receipt_number} - {payment.paid_for} - Paid{" "}
                  {money(payment.amount_paid)} - Balance {money(payment.balance)}
                </option>
              ))}
          </select>
        </div>

        <ActionButton onClick={openManualBooksGivenPopup}>
          Select Books Given
        </ActionButton>
      </Panel>

      <Panel title="Books Given Records">
        <SimpleTable
          headers={["Date", "Student", "Receipt", "Book", "Qty", "Given By"]}
          rows={booksGiven.map((item) => [
            formatDate(item.given_at || item.created_at),
            item.student_name,
            item.receipt_number || "-",
            item.book_name,
            String(item.quantity_given),
            item.given_by || "-",
          ])}
          empty="No books given records yet."
        />
      </Panel>
    </div>
  );
}

function ClassRecordsSection({
  payments,
  booksGiven,
  classFilter,
  setClassFilter,
  getExpectedBooksForPayment,
  getPendingBooks,
  getBooksStatus,
}: {
  payments: BookPayment[];
  booksGiven: BookGiven[];
  classFilter: string;
  setClassFilter: (value: string) => void;
  getExpectedBooksForPayment: (payment: BookPayment) => {
    book_id: string | null;
    book_name: string;
    quantity: number;
  }[];
  getPendingBooks: (
    expectedBooks: { book_id: string | null; book_name: string; quantity: number }[],
    givenBooks: BookGiven[]
  ) => {
    book_id: string | null;
    book_name: string;
    quantity: number;
    pending_quantity: number;
  }[];
  getBooksStatus: (payment: BookPayment) => string;
}) {
  const [selectedPayment, setSelectedPayment] = useState<BookPayment | null>(
    null
  );

  return (
    <div className="space-y-5">
      <Panel title="Class Records">
        <SelectInput
          value={classFilter}
          onChange={setClassFilter}
          placeholder="All classes"
          options={classOptions}
        />
      </Panel>

      <Panel title="Student Book Records">
        <SimpleTable
          headers={[
            "Student",
            "Class",
            "Paid For",
            "Total",
            "Paid",
            "Balance",
            "Payment",
            "Books",
          ]}
          rows={payments.map((payment) => [
            <button
              key={payment.id}
              type="button"
              onClick={() => setSelectedPayment(payment)}
              className="font-black text-gray-950 underline"
            >
              {payment.student_name}
            </button>,
            payment.class_name || "-",
            payment.paid_for || "-",
            money(payment.total_amount),
            money(payment.amount_paid),
            money(payment.balance),
            paymentStatus(payment),
            getBooksStatus(payment),
          ])}
          empty="No class records yet."
        />
      </Panel>

      {selectedPayment && (
        <StudentBookDetailsPopup
          payment={selectedPayment}
          given={booksGiven.filter((item) => item.payment_id === selectedPayment.id)}
          expected={getExpectedBooksForPayment(selectedPayment)}
          pending={getPendingBooks(
            getExpectedBooksForPayment(selectedPayment),
            booksGiven.filter((item) => item.payment_id === selectedPayment.id)
          )}
          onClose={() => setSelectedPayment(null)}
        />
      )}
    </div>
  );
}

function StockSection({
  books,
  stockForm,
  setStockForm,
  handleAddBookToStock,
  handleRestock,
  handleDeleteBook,
}: {
  books: Book[];
  stockForm: any;
  setStockForm: any;
  handleAddBookToStock: () => void;
  handleRestock: (book: Book) => void;
  handleDeleteBook: (book: Book) => void;
}) {
  return (
    <div className="space-y-5">
      <Panel title="Add Book To Stock">
        <div className="grid gap-3 md:grid-cols-3">
          <TextInput
            placeholder="Book name"
            value={stockForm.book_name}
            onChange={(value) =>
              setStockForm((prev: any) => ({ ...prev, book_name: value }))
            }
          />

          <SelectInput
            value={stockForm.class_name}
            onChange={(value) =>
              setStockForm((prev: any) => ({ ...prev, class_name: value }))
            }
            placeholder="Select class"
            options={classOptions}
          />

          <TextInput
            placeholder="Subject"
            value={stockForm.subject}
            onChange={(value) =>
              setStockForm((prev: any) => ({ ...prev, subject: value }))
            }
          />

          <TextInput
            placeholder="Quantity"
            type="number"
            value={stockForm.quantity}
            onChange={(value) =>
              setStockForm((prev: any) => ({ ...prev, quantity: value }))
            }
          />

          <TextInput
            placeholder="Cost price"
            type="number"
            value={stockForm.cost_price}
            onChange={(value) =>
              setStockForm((prev: any) => ({ ...prev, cost_price: value }))
            }
          />

          <TextInput
            placeholder="Individual selling price"
            type="number"
            value={stockForm.selling_price}
            onChange={(value) =>
              setStockForm((prev: any) => ({ ...prev, selling_price: value }))
            }
          />
        </div>

        <ActionButton onClick={handleAddBookToStock}>
          Add Book To Stock
        </ActionButton>
      </Panel>

      <Panel title="Stock Records">
        <SimpleTable
          headers={["Book", "Class", "Subject", "Qty", "Price", "Status", "Action"]}
          rows={books.map((book) => [
            book.book_name,
            book.class_name || "-",
            book.subject || "-",
            String(book.quantity),
            money(book.selling_price),
            numberValue(book.quantity) <= 0
              ? "Out of Stock"
              : numberValue(book.quantity) < 10
                ? "Low Stock"
                : "In Stock",
            <div key={book.id} className="flex gap-2">
              <button
                type="button"
                onClick={() => handleRestock(book)}
                className="rounded-xl bg-yellow-100 px-3 py-2 text-xs font-black text-yellow-800"
              >
                Restock
              </button>

              <button
                type="button"
                onClick={() => handleDeleteBook(book)}
                className="rounded-xl bg-red-100 px-3 py-2 text-xs font-black text-red-700"
              >
                Delete
              </button>
            </div>,
          ])}
          empty="No stock yet."
        />
      </Panel>
    </div>
  );
}

function SuppliersSection({
  supplierForm,
  setSupplierForm,
  supplierItemForm,
  setSupplierItemForm,
  supplierTempItems,
  setSupplierTempItems,
  supplierPurchases,
  supplierItems,
  supplierPaymentForm,
  setSupplierPaymentForm,
  addSupplierTempItem,
  handleSaveSupplierPurchase,
  handleAddSupplierPayment,
}: {
  supplierForm: any;
  setSupplierForm: any;
  supplierItemForm: any;
  setSupplierItemForm: any;
  supplierTempItems: SupplierTempItem[];
  setSupplierTempItems: React.Dispatch<React.SetStateAction<SupplierTempItem[]>>;
  supplierPurchases: SupplierPurchase[];
  supplierItems: SupplierPurchaseItem[];
  supplierPaymentForm: any;
  setSupplierPaymentForm: any;
  addSupplierTempItem: () => void;
  handleSaveSupplierPurchase: () => void;
  handleAddSupplierPayment: () => void;
}) {
  const tempTotal = supplierTempItems.reduce((sum, item) => {
    return sum + numberValue(item.quantity) * numberValue(item.cost_price);
  }, 0);

  const tempPaid = numberValue(supplierForm.amount_paid);
  const tempBalance = tempTotal - tempPaid;

  return (
    <div className="space-y-5">
      <Panel title="Supplier Purchase">
        <div className="grid gap-3 md:grid-cols-3">
          <TextInput
            placeholder="Supplier name"
            value={supplierForm.supplier_name}
            onChange={(value) =>
              setSupplierForm((prev: any) => ({
                ...prev,
                supplier_name: value,
              }))
            }
          />

          <TextInput
            placeholder="Supplier phone"
            value={supplierForm.supplier_phone}
            onChange={(value) =>
              setSupplierForm((prev: any) => ({
                ...prev,
                supplier_phone: value,
              }))
            }
          />

          <TextInput
            placeholder="Supplier receipt number, if given"
            value={supplierForm.supplier_receipt_number}
            onChange={(value) =>
              setSupplierForm((prev: any) => ({
                ...prev,
                supplier_receipt_number: value,
              }))
            }
          />

          <TextInput
            placeholder="Purchase date"
            type="date"
            value={supplierForm.purchase_date}
            onChange={(value) =>
              setSupplierForm((prev: any) => ({
                ...prev,
                purchase_date: value,
              }))
            }
          />

          <TextInput
            placeholder="Amount paid to supplier"
            type="number"
            value={supplierForm.amount_paid}
            onChange={(value) =>
              setSupplierForm((prev: any) => ({
                ...prev,
                amount_paid: value,
              }))
            }
          />

          <TextInput
            placeholder="Payment method"
            value={supplierForm.payment_method}
            onChange={(value) =>
              setSupplierForm((prev: any) => ({
                ...prev,
                payment_method: value,
              }))
            }
          />

          <label className="flex h-11 items-center gap-2 rounded-2xl border border-yellow-200 bg-[#fffdf6] px-3 text-sm font-black">
            <input
              type="checkbox"
              checked={supplierForm.bought_on_credit}
              onChange={(e) =>
                setSupplierForm((prev: any) => ({
                  ...prev,
                  bought_on_credit: e.target.checked,
                }))
              }
            />
            Bought on credit
          </label>

          <TextInput
            placeholder="Note"
            value={supplierForm.notes}
            onChange={(value) =>
              setSupplierForm((prev: any) => ({
                ...prev,
                notes: value,
              }))
            }
          />
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <Info label="Total Cost" value={money(tempTotal)} />
          <Info label="Amount Paid" value={money(tempPaid)} />
          <Info label="Balance" value={money(tempBalance)} />
        </div>
      </Panel>

      <Panel title="Add Books From Supplier">
        <div className="grid gap-3 md:grid-cols-3">
          <TextInput
            placeholder="Book name"
            value={supplierItemForm.book_name}
            onChange={(value) =>
              setSupplierItemForm((prev: any) => ({
                ...prev,
                book_name: value,
              }))
            }
          />

          <TextInput
            placeholder="Subject"
            value={supplierItemForm.subject}
            onChange={(value) =>
              setSupplierItemForm((prev: any) => ({
                ...prev,
                subject: value,
              }))
            }
          />

          <SelectInput
            value={supplierItemForm.class_name}
            onChange={(value) =>
              setSupplierItemForm((prev: any) => ({
                ...prev,
                class_name: value,
              }))
            }
            placeholder="Select class"
            options={classOptions}
          />

          <TextInput
            placeholder="Quantity"
            type="number"
            value={supplierItemForm.quantity}
            onChange={(value) =>
              setSupplierItemForm((prev: any) => ({
                ...prev,
                quantity: value,
              }))
            }
          />

          <TextInput
            placeholder="Cost price"
            type="number"
            value={supplierItemForm.cost_price}
            onChange={(value) =>
              setSupplierItemForm((prev: any) => ({
                ...prev,
                cost_price: value,
              }))
            }
          />

          <TextInput
            placeholder="Individual selling price"
            type="number"
            value={supplierItemForm.selling_price}
            onChange={(value) =>
              setSupplierItemForm((prev: any) => ({
                ...prev,
                selling_price: value,
              }))
            }
          />
        </div>

        <ActionButton onClick={addSupplierTempItem}>Add Book Item</ActionButton>

        <div className="mt-4">
          <SimpleTable
            headers={["Book", "Class", "Qty", "Cost", "Selling", "Total", "Action"]}
            rows={supplierTempItems.map((item) => [
              item.book_name,
              item.class_name,
              item.quantity,
              money(numberValue(item.cost_price)),
              money(numberValue(item.selling_price)),
              money(numberValue(item.quantity) * numberValue(item.cost_price)),
              <button
                key={item.temp_id}
                type="button"
                onClick={() =>
                  setSupplierTempItems((prev) =>
                    prev.filter((x) => x.temp_id !== item.temp_id)
                  )
                }
                className="rounded-xl bg-red-100 px-3 py-2 text-xs font-black text-red-700"
              >
                Remove
              </button>,
            ])}
            empty="No supplier book items added yet."
          />
        </div>

        <ActionButton onClick={handleSaveSupplierPurchase}>
          Save Supplier Purchase
        </ActionButton>
      </Panel>

      <Panel title="Add Supplier Payment">
        <div className="grid gap-3 md:grid-cols-4">
          <select
            value={supplierPaymentForm.purchase_id}
            onChange={(e) =>
              setSupplierPaymentForm((prev: any) => ({
                ...prev,
                purchase_id: e.target.value,
              }))
            }
            className="h-11 rounded-2xl border border-yellow-200 bg-[#fffdf6] px-3 text-sm font-semibold outline-none"
          >
            <option value="">Select supplier balance</option>
            {supplierPurchases
              .filter((item) => numberValue(item.balance) > 0)
              .map((item) => (
                <option key={item.id} value={item.id}>
                  {item.supplier_name} - Balance {money(item.balance)}
                </option>
              ))}
          </select>

          <TextInput
            placeholder="Amount paid"
            type="number"
            value={supplierPaymentForm.amount_paid}
            onChange={(value) =>
              setSupplierPaymentForm((prev: any) => ({
                ...prev,
                amount_paid: value,
              }))
            }
          />

          <TextInput
            placeholder="Payment method"
            value={supplierPaymentForm.payment_method}
            onChange={(value) =>
              setSupplierPaymentForm((prev: any) => ({
                ...prev,
                payment_method: value,
              }))
            }
          />

          <TextInput
            placeholder="Note"
            value={supplierPaymentForm.note}
            onChange={(value) =>
              setSupplierPaymentForm((prev: any) => ({
                ...prev,
                note: value,
              }))
            }
          />
        </div>

        <ActionButton onClick={handleAddSupplierPayment}>
          Add Supplier Payment
        </ActionButton>
      </Panel>

      <Panel title="Supplier Records">
        <SimpleTable
          headers={["Supplier", "Receipt", "Total", "Paid", "Balance", "Status", "Books"]}
          rows={supplierPurchases.map((purchase) => {
            const items = supplierItems.filter(
              (item) => item.purchase_id === purchase.id
            );

            return [
              purchase.supplier_name,
              purchase.supplier_receipt_number || "-",
              money(purchase.total_amount),
              money(purchase.amount_paid),
              money(purchase.balance),
              supplierStatusLabel(purchase.payment_status),
              items.length
                ? items
                    .map((item) => `${item.book_name} × ${item.quantity}`)
                    .join(", ")
                : "-",
            ];
          })}
          empty="No supplier records yet."
        />
      </Panel>
    </div>
  );
}

function StudentSearchInput({
  students,
  value,
  onTyping,
  onPick,
}: {
  students: StudentOption[];
  value: string;
  onTyping: (value: string) => void;
  onPick: (student: StudentOption) => void;
}) {
  const [show, setShow] = useState(false);
  const searchText = value.toLowerCase().trim();

  const matches = students
    .filter((student) => {
      if (!searchText) return false;

      return (
        student.student_name.toLowerCase().includes(searchText) ||
        student.student_id.toLowerCase().includes(searchText) ||
        student.class_name.toLowerCase().includes(searchText)
      );
    })
    .slice(0, 12);

  return (
    <div className="relative md:col-span-2">
      <input
        type="text"
        value={value}
        onChange={(e) => {
          onTyping(e.target.value);
          setShow(true);
        }}
        onFocus={() => setShow(true)}
        placeholder="Start typing student name"
        className="h-11 w-full rounded-2xl border border-yellow-200 bg-[#fffdf6] px-3 text-sm font-semibold text-gray-900 outline-none focus:border-yellow-500"
      />

      {show && matches.length > 0 && (
        <div className="absolute z-30 mt-2 max-h-64 w-full overflow-y-auto rounded-2xl border border-yellow-200 bg-white shadow-xl">
          {matches.map((student) => (
            <button
              key={`${student.student_id}-${student.student_name}-${student.class_name}`}
              type="button"
              onClick={() => {
                onPick(student);
                setShow(false);
              }}
              className="block w-full border-b border-gray-100 px-4 py-3 text-left hover:bg-yellow-50"
            >
              <span className="block text-sm font-black text-gray-950">
                {student.student_name}
              </span>
              <span className="block text-xs font-semibold text-gray-500">
                {student.class_name} • {student.student_id || "No ID"}
              </span>
            </button>
          ))}
        </div>
      )}

      {show && searchText && matches.length === 0 && (
        <div className="absolute z-30 mt-2 w-full rounded-2xl border border-red-200 bg-white px-4 py-3 text-sm font-bold text-red-600 shadow-xl">
          No matching student found.
        </div>
      )}
    </div>
  );
}

function BooksGivenPopup({
  pendingIssue,
  issueSelections,
  setIssueSelections,
  onSave,
  onSkip,
}: {
  pendingIssue: PendingIssue;
  issueSelections: Record<string, { checked: boolean; quantity: string }>;
  setIssueSelections: React.Dispatch<
    React.SetStateAction<Record<string, { checked: boolean; quantity: string }>>
  >;
  onSave: () => void;
  onSkip: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-3xl bg-white p-5 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase text-yellow-700">
              Books Given Now
            </p>
            <h2 className="text-xl font-black text-gray-950">
              {pendingIssue.payment.student_name}
            </h2>
            <p className="text-sm font-semibold text-gray-500">
              Receipt: {pendingIssue.payment.receipt_number} • Paid{" "}
              {money(pendingIssue.payment.amount_paid)} • Balance{" "}
              {money(pendingIssue.payment.balance)}
            </p>
          </div>

          <button
            type="button"
            onClick={onSkip}
            className="rounded-full bg-gray-100 px-3 py-1 text-lg font-black text-gray-700 hover:bg-gray-200"
          >
            ×
          </button>
        </div>

        <div className="mt-4 space-y-3">
          {pendingIssue.expectedBooks.map((book, index) => {
            const key = `${book.book_id || book.book_name}-${index}`;
            const selected = issueSelections[key] || {
              checked: false,
              quantity: "1",
            };

            return (
              <div
                key={key}
                className="grid gap-3 rounded-2xl border border-yellow-200 bg-[#fffdf6] p-3 md:grid-cols-[1fr_110px_80px]"
              >
                <label className="flex items-center gap-3 text-sm font-black text-gray-950">
                  <input
                    type="checkbox"
                    checked={selected.checked}
                    onChange={(e) =>
                      setIssueSelections((prev) => ({
                        ...prev,
                        [key]: {
                          ...selected,
                          checked: e.target.checked,
                        },
                      }))
                    }
                  />
                  {book.book_name}
                </label>

                <input
                  type="number"
                  value={selected.quantity}
                  onChange={(e) =>
                    setIssueSelections((prev) => ({
                      ...prev,
                      [key]: {
                        ...selected,
                        quantity: e.target.value,
                      },
                    }))
                  }
                  className="h-10 rounded-xl border border-yellow-200 bg-white px-3 text-sm font-bold outline-none"
                />

                <span className="flex items-center text-xs font-bold text-gray-500">
                  Qty
                </span>
              </div>
            );
          })}
        </div>

        <div className="mt-5 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={onSave}
            className="rounded-2xl bg-gray-950 px-5 py-3 text-sm font-black text-white hover:bg-black"
          >
            Save Books Given
          </button>

          <button
            type="button"
            onClick={onSkip}
            className="rounded-2xl border border-gray-200 bg-white px-5 py-3 text-sm font-black text-gray-700 hover:bg-gray-50"
          >
            Skip For Now
          </button>
        </div>
      </div>
    </div>
  );
}

function StudentBookDetailsPopup({
  payment,
  expected,
  given,
  pending,
  onClose,
}: {
  payment: BookPayment;
  expected: { book_id: string | null; book_name: string; quantity: number }[];
  given: BookGiven[];
  pending: {
    book_id: string | null;
    book_name: string;
    quantity: number;
    pending_quantity: number;
  }[];
  onClose: () => void;
}) {
  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-3xl bg-white p-5 shadow-xl"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase text-yellow-700">
              Student Book Details
            </p>
            <h2 className="text-xl font-black text-gray-950">
              {payment.student_name}
            </h2>
            <p className="text-sm font-semibold text-gray-500">
              {payment.class_name} • {payment.receipt_number}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-gray-100 px-3 py-1 text-lg font-black text-gray-700 hover:bg-gray-200"
          >
            ×
          </button>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <Info label="Paid For" value={payment.paid_for || "-"} />
          <Info label="Total" value={money(payment.total_amount)} />
          <Info label="Paid" value={money(payment.amount_paid)} />
          <Info label="Balance" value={money(payment.balance)} />
        </div>

        <div className="mt-5 grid gap-5 md:grid-cols-3">
          <Panel title="Expected Books">
            <ListBox items={expected.map((item) => `${item.book_name} × ${item.quantity}`)} />
          </Panel>

          <Panel title="Books Given">
            <ListBox items={given.map((item) => `${item.book_name} × ${item.quantity_given}`)} />
          </Panel>

          <Panel title="Books Pending">
            <ListBox items={pending.map((item) => `${item.book_name} × ${item.pending_quantity}`)} />
          </Panel>
        </div>
      </div>
    </div>
  );
}

function ReceiptModal({
  result,
  onClose,
}: {
  result: UniversalReceiptResult;
  onClose: () => void;
}) {
  const searchedReceipt = result.searchedReceipt;
  const payments = result.studentPayments || [];

  const totalPaid = payments.reduce(
    (sum, payment) => sum + numberValue(payment.amount_paid),
    0
  );

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-3xl bg-white p-5 shadow-xl"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase text-yellow-700">
              Receipt Details
            </p>
            <h2 className="text-xl font-black text-gray-950">
              {searchedReceipt?.receipt_number || "Not Found"}
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-gray-100 px-3 py-1 text-lg font-black text-gray-700 hover:bg-gray-200"
          >
            ×
          </button>
        </div>

        {result.error ? (
          <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">
            {result.error}
          </div>
        ) : searchedReceipt ? (
          <div className="mt-4 space-y-4">
            <div className="grid gap-3 md:grid-cols-3">
              <Info label="Student" value={searchedReceipt.student_name} />
              <Info label="Student ID" value={searchedReceipt.student_id} />
              <Info label="Class" value={searchedReceipt.class_name} />
              <Info label="Found In" value={searchedReceipt.module} />
              <Info
                label="Receipt Amount"
                value={money(searchedReceipt.amount_paid)}
              />
              <Info label="Total Paid" value={money(totalPaid)} />
            </div>

            <Panel title="Searched Receipt">
              <UniversalTable payments={[searchedReceipt]} />
            </Panel>

            <Panel title="All Payments By This Student">
              <UniversalTable payments={payments} />
            </Panel>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function UniversalTable({ payments }: { payments: UniversalPayment[] }) {
  return (
    <SimpleTable
      headers={["Module", "Receipt", "Item", "Amount", "Term", "Date"]}
      rows={payments.map((payment) => [
        payment.module,
        payment.receipt_number,
        payment.item_name || "-",
        money(payment.amount_paid),
        payment.term || "-",
        formatDate(payment.created_at),
      ])}
      empty="No payments found."
    />
  );
}

function ListBox({ items }: { items: string[] }) {
  if (items.length === 0) {
    return <p className="text-sm font-semibold text-gray-500">None</p>;
  }

  return (
    <ul className="space-y-2 text-sm font-semibold text-gray-700">
      {items.map((item) => (
        <li key={item} className="rounded-xl bg-gray-50 px-3 py-2">
          {item}
        </li>
      ))}
    </ul>
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
    <div className="rounded-3xl border border-yellow-200 bg-white p-4 shadow-sm">
      <h2 className="mb-4 text-lg font-black text-gray-950">{title}</h2>
      {children}
    </div>
  );
}

function SimpleTable({
  headers,
  rows,
  empty,
}: {
  headers: string[];
  rows: (React.ReactNode | string | number)[][];
  empty: string;
}) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-gray-100">
      <table className="w-full text-left text-sm">
        <thead className="bg-gray-50 text-xs uppercase text-gray-500">
          <tr>
            {headers.map((header) => (
              <th key={header} className="whitespace-nowrap px-3 py-3">
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
                className="px-3 py-5 text-center text-sm font-semibold text-gray-500"
              >
                {empty}
              </td>
            </tr>
          ) : (
            rows.map((row, index) => (
              <tr key={index} className="border-t">
                {row.map((cell, cellIndex) => (
                  <td
                    key={cellIndex}
                    className="whitespace-nowrap px-3 py-3 text-gray-700"
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

function TextInput({
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  type?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="h-11 rounded-2xl border border-yellow-200 bg-[#fffdf6] px-3 text-sm font-semibold text-gray-900 outline-none focus:border-yellow-500"
    />
  );
}

function SelectInput({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-11 rounded-2xl border border-yellow-200 bg-[#fffdf6] px-3 text-sm font-semibold outline-none"
    >
      <option value="">{placeholder}</option>
      {options.map((item) => (
        <option key={item} value={item}>
          {item}
        </option>
      ))}
    </select>
  );
}

function ActionButton({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-4 rounded-2xl bg-gray-950 px-5 py-3 text-sm font-black text-white hover:bg-black"
    >
      {children}
    </button>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-gray-50 p-3">
      <p className="text-xs font-black uppercase text-gray-500">{label}</p>
      <p className="mt-1 font-bold text-gray-950">{value || "-"}</p>
    </div>
  );
}