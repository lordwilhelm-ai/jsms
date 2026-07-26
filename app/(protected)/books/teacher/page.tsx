"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { authedFetch } from "@/lib/apiClient";

type TeacherRow = Record<string, any>;
type ClassRow = Record<string, any>;

type BookGiven = {
  id: string;
  payment_id: string | null;
  receipt_number: string | null;
  student_id: string;
  student_name: string;
  class_name: string | null;
  book_id: string | null;
  book_name: string;
  quantity_given: number;
  given_by: string | null;
  given_at: string | null;
  note: string | null;
  created_at: string;
};

type BookPayment = {
  id: string;
  student_id: string;
  student_name: string;
  class_name: string | null;
  receipt_number: string;
  total_amount: number;
  amount_paid: number;
  balance: number;
  paid_for: string | null;
  created_at: string;
};

type StudentBookRecord = {
  student_id: string;
  student_name: string;
  class_name: string;
  books: {
    key: string;
    book_name: string;
    quantity: number;
    latest_date: string | null;
  }[];
  total_paid: number;
  balance: number;
  payment_status: "paid" | "part" | "none";
  latest_receipt: string | null;
  latest_date: string | null;
};

function getRole(row: TeacherRow | null) {
  const raw = String(row?.role || "").trim().toLowerCase();
  if (raw === "owner" || raw === "admin" || raw === "headmaster" || raw === "super_admin" || raw === "superadmin") return raw;
  return "teacher";
}

function getTeacherName(row: TeacherRow | null) {
  return String(
    row?.full_name || row?.name || row?.teacher_name || row?.username || "Teacher"
  ).trim();
}

function money(value: number) {
  return `GHS ${Number(value || 0).toFixed(2)}`;
}

function numberValue(value: unknown) {
  const num = Number(value || 0);
  return Number.isFinite(num) ? num : 0;
}

function clean(value: unknown) {
  return String(value || "").trim();
}

function sameClass(a: string | null | undefined, b: string | null | undefined) {
  return clean(a).toLowerCase() === clean(b).toLowerCase();
}

function formatDate(value: string | null | undefined) {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function getBookDate(item: BookGiven) {
  return item.given_at || item.created_at || null;
}

function newerDate(a: string | null, b: string | null) {
  if (!a) return b;
  if (!b) return a;

  const aTime = new Date(a).getTime();
  const bTime = new Date(b).getTime();

  if (Number.isNaN(aTime)) return b;
  if (Number.isNaN(bTime)) return a;

  return bTime > aTime ? b : a;
}

function buildStudentBookRecords(
  booksGiven: BookGiven[],
  payments: BookPayment[]
): StudentBookRecord[] {
  const map = new Map<string, StudentBookRecord>();

  booksGiven.forEach((item) => {
    const studentId = clean(item.student_id);
    const className = clean(item.class_name);
    const key = `${studentId}__${className}`;

    if (!map.has(key)) {
      map.set(key, {
        student_id: studentId,
        student_name: clean(item.student_name),
        class_name: className,
        books: [],
        total_paid: 0,
        balance: 0,
        payment_status: "none",
        latest_receipt: null,
        latest_date: getBookDate(item),
      });
    }

    const record = map.get(key)!;
    record.latest_date = newerDate(record.latest_date, getBookDate(item));

    const bookKey = clean(item.book_id) || clean(item.book_name).toLowerCase();
    const existing = record.books.find((book) => book.key === bookKey);

    if (existing) {
      existing.quantity += numberValue(item.quantity_given) || 1;
      existing.latest_date = newerDate(existing.latest_date, getBookDate(item));
    } else {
      record.books.push({
        key: bookKey,
        book_name: clean(item.book_name),
        quantity: numberValue(item.quantity_given) || 1,
        latest_date: getBookDate(item),
      });
    }
  });

  map.forEach((record) => {
    const studentPayments = payments.filter(
      (payment) =>
        clean(payment.student_id) === record.student_id &&
        sameClass(payment.class_name, record.class_name)
    );

    record.total_paid = studentPayments.reduce(
      (sum, payment) => sum + numberValue(payment.amount_paid),
      0
    );

    record.balance = studentPayments.reduce(
      (sum, payment) => sum + Math.max(numberValue(payment.balance), 0),
      0
    );

    if (studentPayments.length === 0) {
      record.payment_status = "none";
      return;
    }

    record.payment_status = record.balance <= 0 ? "paid" : "part";

    const latestPayment = [...studentPayments].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )[0];

    record.latest_receipt = latestPayment?.receipt_number || null;
  });

  return [...map.values()].sort((a, b) => {
    const aTime = new Date(a.latest_date || "").getTime();
    const bTime = new Date(b.latest_date || "").getTime();
    return (Number.isNaN(bTime) ? 0 : bTime) - (Number.isNaN(aTime) ? 0 : aTime);
  });
}

export default function BooksTeacherPage() {
  const router = useRouter();

  const [checkingUser, setCheckingUser] = useState(true);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [teacherName, setTeacherName] = useState("Teacher");
  const [assignedClassNames, setAssignedClassNames] = useState<string[]>([]);

  const [booksGiven, setBooksGiven] = useState<BookGiven[]>([]);
  const [payments, setPayments] = useState<BookPayment[]>([]);

  const [search, setSearch] = useState("");
  const [classFilter, setClassFilter] = useState("");

  useEffect(() => {
    let active = true;

    async function loadTeacherAndData() {
      try {
        setCheckingUser(true);
        setLoadError(null);

        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!active) return;

        if (!session?.user) {
          router.replace("/");
          return;
        }

        const [teachersRes, classesRes] = await Promise.all([
          supabase.from("teachers").select("*"),
          supabase.from("classes").select("*").order("class_order", { ascending: true }),
        ]);

        if (!active) return;

        if (teachersRes.error) {
          setLoadError(teachersRes.error.message);
          setCheckingUser(false);
          return;
        }

        const teacherRow =
          (teachersRes.data || []).find(
            (item: any) => String(item.auth_user_id || "") === String(session.user.id)
          ) ||
          (teachersRes.data || []).find(
            (item: any) =>
              String(item.email || "").trim().toLowerCase() ===
              String(session.user.email || "").trim().toLowerCase()
          ) ||
          null;

        if (!teacherRow) {
          router.replace("/");
          return;
        }

        const role = getRole(teacherRow);

        if (role === "owner" || role === "admin" || role === "headmaster" || role === "super_admin" || role === "superadmin") {
          router.replace("/books");
          return;
        }

        setTeacherName(getTeacherName(teacherRow));

        const assignmentRes = await authedFetch(
          `/api/teacher-assignments/get?teacher_id=${teacherRow.id}`
        );
        const assignmentData = await assignmentRes.json().catch(() => ({}));

        if (!assignmentRes.ok || assignmentData.error) {
          setLoadError(assignmentData.error || "Failed to load assigned classes.");
          setAssignedClassNames([]);
          setCheckingUser(false);
          return;
        }

        const classIds = Array.isArray(assignmentData.class_ids)
          ? assignmentData.class_ids.map((id: unknown) => String(id))
          : [];

        const classNames = ((classesRes.data || []) as ClassRow[])
          .filter((cls) => classIds.includes(String(cls.id || "")))
          .map((cls) => clean(cls.class_name || cls.name))
          .filter(Boolean);

        setAssignedClassNames(classNames);
        setClassFilter(classNames[0] || "");
        setCheckingUser(false);

        await loadBooksData(classNames);
      } catch (error: any) {
        setLoadError(error?.message || "Failed to load teacher books view.");
        setCheckingUser(false);
      }
    }

    void loadTeacherAndData();

    return () => {
      active = false;
    };
  }, [router]);

  async function loadBooksData(classes: string[] = assignedClassNames) {
    if (classes.length === 0) {
      setBooksGiven([]);
      setPayments([]);
      return;
    }

    try {
      setLoading(true);
      setLoadError(null);

      const [givenRes, paymentsRes] = await Promise.all([
        supabase
          .from("jsms_books_given")
          .select("*")
          .order("created_at", { ascending: false }),
        supabase
          .from("jsms_book_payments")
          .select("*")
          .order("created_at", { ascending: false }),
      ]);

      if (givenRes.error) throw givenRes.error;
      if (paymentsRes.error) throw paymentsRes.error;

      const allowed = classes.map((item) => item.toLowerCase());

      const filteredGiven = ((givenRes.data || []) as BookGiven[]).filter((item) =>
        allowed.includes(clean(item.class_name).toLowerCase())
      );

      const filteredPayments = ((paymentsRes.data || []) as BookPayment[]).filter((item) =>
        allowed.includes(clean(item.class_name).toLowerCase())
      );

      setBooksGiven(filteredGiven);
      setPayments(filteredPayments);
    } catch (error: any) {
      setLoadError(error?.message || "Failed to load book records.");
    } finally {
      setLoading(false);
    }
  }

  const records = useMemo(() => {
    const all = buildStudentBookRecords(booksGiven, payments);
    const q = search.trim().toLowerCase();

    return all.filter((record) => {
      const matchesClass = !classFilter || sameClass(record.class_name, classFilter);
      const matchesSearch =
        !q ||
        record.student_name.toLowerCase().includes(q) ||
        record.student_id.toLowerCase().includes(q) ||
        record.books.some((book) => book.book_name.toLowerCase().includes(q));

      return matchesClass && matchesSearch;
    });
  }, [booksGiven, payments, search, classFilter]);

  if (checkingUser) {
    return (
      <main className="min-h-screen bg-[#f7f3df] p-4">
        <div className="rounded-3xl bg-white p-5 text-center text-sm font-black text-gray-700 shadow-sm">
          Loading books...
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f7f3df] px-3 py-4">
      <section className="mx-auto max-w-2xl space-y-3">
        <header className="rounded-3xl border border-yellow-200 bg-white p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-black uppercase tracking-wide text-yellow-700">
                JSMS Books 📚
              </p>
              <h1 className="mt-1 text-xl font-black text-gray-950">Books Received</h1>
              <p className="mt-1 text-xs font-semibold text-gray-500">{teacherName}</p>
            </div>

            <Link
              href="/dashboard/teacher"
              className="rounded-2xl bg-gray-950 px-3 py-2 text-xs font-black text-white shadow-sm"
            >
              Dashboard
            </Link>
          </div>
        </header>

        {loadError ? (
          <div className="rounded-3xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">
            {loadError}
          </div>
        ) : null}

        {assignedClassNames.length === 0 ? (
          <div className="rounded-3xl border border-orange-200 bg-orange-50 p-4 text-sm font-bold text-orange-800">
            No assigned class found for this account.
          </div>
        ) : (
          <>
            <section className="rounded-3xl border border-yellow-200 bg-white p-3 shadow-sm">
              <div className="grid gap-2">
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search student or book..."
                  className="h-11 rounded-2xl border border-yellow-200 bg-[#fffdf6] px-3 text-base font-bold outline-none"
                />

                <select
                  value={classFilter}
                  onChange={(e) => setClassFilter(e.target.value)}
                  className="h-11 rounded-2xl border border-yellow-200 bg-[#fffdf6] px-3 text-base font-bold outline-none"
                >
                  <option value="">All assigned classes</option>
                  {assignedClassNames.map((className) => (
                    <option key={className} value={className}>
                      {className}
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="button"
                onClick={() => void loadBooksData()}
                className="mt-2 w-full rounded-2xl bg-yellow-500 px-4 py-3 text-base font-black text-white shadow-sm active:scale-[0.99]"
              >
                {loading ? "Refreshing..." : "Refresh"}
              </button>
            </section>

            <section className="space-y-3">
              {loading ? (
                <div className="rounded-3xl bg-white p-5 text-center text-sm font-black text-gray-500 shadow-sm">
                  Loading records...
                </div>
              ) : records.length === 0 ? (
                <div className="rounded-3xl bg-white p-5 text-center text-sm font-black text-gray-500 shadow-sm">
                  No books received yet.
                </div>
              ) : (
                records.map((record) => (
                  <StudentBookCard key={`${record.student_id}-${record.class_name}`} record={record} />
                ))
              )}
            </section>
          </>
        )}
      </section>
    </main>
  );
}

function StudentBookCard({ record }: { record: StudentBookRecord }) {
  const paid = record.payment_status === "paid";
  const noPayment = record.payment_status === "none";

  return (
    <article className="rounded-3xl border border-yellow-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-black text-gray-950">{record.student_name}</h2>
          <p className="mt-1 text-xs font-bold text-gray-500">
            {record.student_id} • {record.class_name}
          </p>
        </div>

        <span
          className={
            paid
              ? "rounded-full bg-green-100 px-3 py-1 text-[11px] font-black text-green-700"
              : noPayment
                ? "rounded-full bg-gray-100 px-3 py-1 text-[11px] font-black text-gray-700"
                : "rounded-full bg-red-100 px-3 py-1 text-[11px] font-black text-red-700"
          }
        >
          {paid ? "Paid" : noPayment ? "Not Paid" : "Part Paid"}
        </span>
      </div>

      {!paid && !noPayment ? (
        <p className="mt-2 text-xs font-black text-red-700">
          Outstanding: {money(record.balance)}
        </p>
      ) : null}

      {record.latest_receipt ? (
        <p className="mt-1 text-[11px] font-bold text-gray-400">
          Receipt: {record.latest_receipt}
        </p>
      ) : null}

      <div className="mt-3 rounded-2xl bg-[#fffdf6] p-3">
        <p className="mb-2 text-xs font-black uppercase tracking-wide text-gray-500">
          Books Received
        </p>

        <div className="space-y-2">
          {record.books.map((book) => (
            <div
              key={book.key}
              className="flex items-center justify-between gap-3 rounded-2xl bg-white px-3 py-2 text-sm shadow-sm"
            >
              <span className="font-black text-gray-900">{book.book_name}</span>
              <span className="shrink-0 rounded-full bg-yellow-100 px-2 py-1 text-xs font-black text-yellow-800">
                x{book.quantity}
              </span>
            </div>
          ))}
        </div>
      </div>

      {record.latest_date ? (
        <p className="mt-3 text-right text-[11px] font-bold text-gray-400">
          Last issued: {formatDate(record.latest_date)}
        </p>
      ) : null}
    </article>
  );
}
