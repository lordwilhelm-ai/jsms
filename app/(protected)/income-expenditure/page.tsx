"use client";

import type React from "react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type AnyRow = Record<string, any>;
type ActiveTab = "dashboard" | "income" | "expense" | "transfer" | "reports" | "settings";
type ReportMode = "today" | "week" | "month" | "term" | "year" | "custom";

const COLORS = {
  bg: "#f7f4ec",
  dark: "#0f172a",
  darkSoft: "#111827",
  gold: "#d4a017",
  card: "#ffffff",
  text: "#111827",
  muted: "#6b7280",
  border: "#e5e7eb",
  successBg: "#dcfce7",
  successText: "#166534",
  warningBg: "#fef3c7",
  warningText: "#a16207",
  dangerBg: "#fee2e2",
  dangerText: "#991b1b",
  infoBg: "#eff6ff",
  infoText: "#1d4ed8",
};

const INCOME_CATEGORIES = ["Admission Forms", "Donations", "Other Income"];
const EXPENSE_CATEGORIES = ["Salary", "TNT", "Hardware", "Other Expenses"];

function getRole(row: AnyRow | null) {
  const raw = String(row?.role || "").trim().toLowerCase();
  if (
    raw === "owner" ||
    raw === "admin" ||
    raw === "headmaster" ||
    raw === "super_admin" ||
    raw === "superadmin"
  ) {
    return raw;
  }
  return "teacher";
}

function isAdminRole(role: string) {
  return (
    role === "owner" ||
    role === "admin" ||
    role === "headmaster" ||
    role === "super_admin" ||
    role === "superadmin"
  );
}

function numberValue(value: unknown) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

function formatMoney(value: number) {
  return `GHS ${value.toFixed(2)}`;
}

function toIsoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString();
}

function startOfWeekMonday(date: Date) {
  const copy = new Date(date);
  const day = copy.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  copy.setDate(copy.getDate() + diff);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function endOfWeekSunday(date: Date) {
  const start = startOfWeekMonday(date);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return end;
}

function lastMonthSameDay(date: Date) {
  const copy = new Date(date);
  copy.setMonth(copy.getMonth() - 1);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function startOfYear(date: Date) {
  return new Date(date.getFullYear(), 0, 1);
}

function endOfYear(date: Date) {
  return new Date(date.getFullYear(), 11, 31);
}

function getSettingDate(settings: AnyRow | null, names: string[]) {
  for (const name of names) {
    const value = settings?.[name];
    if (value) return String(value).slice(0, 10);
  }
  return "";
}

function getDateRange(mode: ReportMode, settings: AnyRow | null) {
  const now = new Date();

  if (mode === "today") {
    const today = toIsoDate(now);
    return { start: today, end: today };
  }

  if (mode === "week") {
    return {
      start: toIsoDate(startOfWeekMonday(now)),
      end: toIsoDate(endOfWeekSunday(now)),
    };
  }

  if (mode === "month") {
    return {
      start: toIsoDate(lastMonthSameDay(now)),
      end: toIsoDate(now),
    };
  }

  if (mode === "term") {
    return {
      start:
        getSettingDate(settings, [
          "current_term_start_date",
          "term_start_date",
          "current_term_start",
          "term_start",
        ]) || toIsoDate(startOfWeekMonday(now)),
      end:
        getSettingDate(settings, [
          "current_term_end_date",
          "term_end_date",
          "current_term_end",
          "term_end",
        ]) || toIsoDate(endOfWeekSunday(now)),
    };
  }

  if (mode === "year") {
    return {
      start:
        getSettingDate(settings, [
          "academic_year_start_date",
          "year_start_date",
          "academic_start_date",
          "academic_year_start",
        ]) || toIsoDate(startOfYear(now)),
      end:
        getSettingDate(settings, [
          "academic_year_end_date",
          "year_end_date",
          "academic_end_date",
          "academic_year_end",
        ]) || toIsoDate(endOfYear(now)),
    };
  }

  return {
    start: toIsoDate(startOfWeekMonday(now)),
    end: toIsoDate(endOfWeekSunday(now)),
  };
}

function getTeacherName(row: AnyRow | null) {
  return String(row?.full_name || row?.name || "Admin");
}

export default function IncomeExpenditurePage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<ActiveTab>("dashboard");

  const [adminRow, setAdminRow] = useState<AnyRow | null>(null);
  const [settingsRow, setSettingsRow] = useState<AnyRow | null>(null);
  const [financeSettings, setFinanceSettings] = useState<AnyRow | null>(null);

  const [transactions, setTransactions] = useState<AnyRow[]>([]);
  const [financeItems, setFinanceItems] = useState<AnyRow[]>([]);
  const [feePayments, setFeePayments] = useState<AnyRow[]>([]);
  const [bookSummary, setBookSummary] = useState<AnyRow | null>(null);
  const [uniformSummary, setUniformSummary] = useState<AnyRow | null>(null);

  const [incomeCategory, setIncomeCategory] = useState("Admission Forms");
  const [incomeItem, setIncomeItem] = useState("Admission Forms");
  const [incomeAmount, setIncomeAmount] = useState("");
  const [incomeLocation, setIncomeLocation] = useState<"cash" | "bank">("cash");
  const [incomeDate, setIncomeDate] = useState(toIsoDate(new Date()));
  const [incomeDescription, setIncomeDescription] = useState("");

  const [expenseCategory, setExpenseCategory] = useState("Hardware");
  const [expenseItem, setExpenseItem] = useState("");
  const [expenseAmount, setExpenseAmount] = useState("");
  const [expenseLocation, setExpenseLocation] = useState<"cash" | "bank">("cash");
  const [expenseDate, setExpenseDate] = useState(toIsoDate(new Date()));
  const [expenseDescription, setExpenseDescription] = useState("");

  const [transferFrom, setTransferFrom] = useState<"cash" | "bank">("cash");
  const [transferTo, setTransferTo] = useState<"cash" | "bank">("bank");
  const [transferAmount, setTransferAmount] = useState("");
  const [transferDate, setTransferDate] = useState(toIsoDate(new Date()));
  const [transferDescription, setTransferDescription] = useState("");

  const [openingBank, setOpeningBank] = useState("0");
  const [openingCash, setOpeningCash] = useState("0");

  const [reportMode, setReportMode] = useState<ReportMode>("term");
  const [reportStart, setReportStart] = useState("");
  const [reportEnd, setReportEnd] = useState("");
  const [search, setSearch] = useState("");

  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error" | "info">("info");

  useEffect(() => {
    let active = true;

    async function loadPage() {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!active) return;

        if (!session?.user) {
          router.replace("/");
          return;
        }

        const [
          teachersRes,
          schoolSettingsRes,
          financeSettingsRes,
          transactionsRes,
          itemsRes,
          feesRes,
          booksRes,
          uniformsRes,
        ] = await Promise.all([
          supabase.from("teachers").select("*"),
          supabase.from("school_settings").select("*").limit(1).maybeSingle(),
          supabase.from("finance_settings").select("*").limit(1).maybeSingle(),
          supabase
            .from("finance_transactions")
            .select("*")
            .order("transaction_date", { ascending: false }),
          supabase
            .from("finance_items")
            .select("*")
            .order("category", { ascending: true })
            .order("item_name", { ascending: true }),
          supabase.from("fee_payments").select("*").order("payment_date", { ascending: false }),
          supabase.from("book_profit_summary").select("*").limit(1).maybeSingle(),
          supabase.from("uniform_profit_summary").select("*").limit(1).maybeSingle(),
        ]);

        if (!active) return;

        if (teachersRes.error) throw teachersRes.error;
        if (schoolSettingsRes.error) throw schoolSettingsRes.error;
        if (financeSettingsRes.error) throw financeSettingsRes.error;
        if (transactionsRes.error) throw transactionsRes.error;
        if (itemsRes.error) throw itemsRes.error;
        if (feesRes.error) throw feesRes.error;
        if (booksRes.error) throw booksRes.error;
        if (uniformsRes.error) throw uniformsRes.error;

        const allUsers = teachersRes.data || [];
        const matchedUser =
          allUsers.find((item) => item.auth_user_id === session.user.id) ||
          allUsers.find(
            (item) =>
              String(item.email || "").trim().toLowerCase() ===
              String(session.user.email || "").trim().toLowerCase()
          ) ||
          null;

        const fallbackAdminUser = {
          id: session.user.id,
          auth_user_id: session.user.id,
          email: session.user.email || "",
          full_name: "Admin",
          role: "admin",
        };

        const finalUser = matchedUser || fallbackAdminUser;

        if (!isAdminRole(getRole(finalUser))) {
          router.replace("/dashboard");
          return;
        }

        const settings = schoolSettingsRes.data || null;
        const financeSetting = financeSettingsRes.data || {
          opening_bank_balance: 0,
          opening_cash_balance: 0,
        };
        const range = getDateRange("term", settings);

        setAdminRow(finalUser);
        setSettingsRow(settings);
        setFinanceSettings(financeSetting);
        setOpeningBank(String(financeSetting.opening_bank_balance ?? 0));
        setOpeningCash(String(financeSetting.opening_cash_balance ?? 0));
        setTransactions(transactionsRes.data || []);
        setFinanceItems(itemsRes.data || []);
        setFeePayments(feesRes.data || []);
        setBookSummary(booksRes.data || null);
        setUniformSummary(uniformsRes.data || null);
        setReportStart(range.start);
        setReportEnd(range.end);
      } catch (error: any) {
        console.error(error);
        setMessage(error?.message || "Failed to load finance module.");
        setMessageType("error");
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadPage();

    return () => {
      active = false;
    };
  }, [router]);

  async function reloadData() {
    const [financeSettingsRes, transactionsRes, itemsRes, feesRes, booksRes, uniformsRes] =
      await Promise.all([
        supabase.from("finance_settings").select("*").limit(1).maybeSingle(),
        supabase
          .from("finance_transactions")
          .select("*")
          .order("transaction_date", { ascending: false }),
        supabase
          .from("finance_items")
          .select("*")
          .order("category", { ascending: true })
          .order("item_name", { ascending: true }),
        supabase.from("fee_payments").select("*").order("payment_date", { ascending: false }),
        supabase.from("book_profit_summary").select("*").limit(1).maybeSingle(),
        supabase.from("uniform_profit_summary").select("*").limit(1).maybeSingle(),
      ]);

    if (financeSettingsRes.error) throw financeSettingsRes.error;
    if (transactionsRes.error) throw transactionsRes.error;
    if (itemsRes.error) throw itemsRes.error;
    if (feesRes.error) throw feesRes.error;
    if (booksRes.error) throw booksRes.error;
    if (uniformsRes.error) throw uniformsRes.error;

    setFinanceSettings(financeSettingsRes.data || null);
    setTransactions(transactionsRes.data || []);
    setFinanceItems(itemsRes.data || []);
    setFeePayments(feesRes.data || []);
    setBookSummary(booksRes.data || null);
    setUniformSummary(uniformsRes.data || null);
  }

  const schoolName = String(settingsRow?.school_name || "JSMS");
  const academicYear = String(settingsRow?.academic_year || "");
  const currentTerm = String(settingsRow?.current_term || "");
  const adminName = getTeacherName(adminRow);

  const currentTermFees = useMemo(() => {
    return feePayments.filter(
      (row) =>
        String(row.academic_year || "") === academicYear &&
        String(row.term || "") === currentTerm
    );
  }, [feePayments, academicYear, currentTerm]);

  const schoolFeesIncome = useMemo(() => {
    return currentTermFees.reduce((sum, row) => sum + numberValue(row.amount_paid), 0);
  }, [currentTermFees]);

  const bookProfit = numberValue(bookSummary?.total_profit);
  const uniformProfit = numberValue(uniformSummary?.total_profit);

  const incomeItems = useMemo(() => {
    return financeItems.filter((item) => String(item.type || "") === "income");
  }, [financeItems]);

  const expenseItems = useMemo(() => {
    return financeItems.filter((item) => String(item.type || "") === "expense");
  }, [financeItems]);

  const incomeItemsForCategory = useMemo(() => {
    return incomeItems.filter((item) => String(item.category || "") === incomeCategory);
  }, [incomeItems, incomeCategory]);

  const expenseItemsForCategory = useMemo(() => {
    return expenseItems.filter((item) => String(item.category || "") === expenseCategory);
  }, [expenseItems, expenseCategory]);

  useEffect(() => {
    const first = incomeItemsForCategory[0]?.item_name;
    if (first && !incomeItem) setIncomeItem(String(first));
  }, [incomeItemsForCategory, incomeItem]);

  useEffect(() => {
    const first = expenseItemsForCategory[0]?.item_name;
    if (first && !expenseItem) setExpenseItem(String(first));
  }, [expenseItemsForCategory, expenseItem]);

  const financeSummary = useMemo(() => {
    const openingBankBalance = numberValue(financeSettings?.opening_bank_balance);
    const openingCashBalance = numberValue(financeSettings?.opening_cash_balance);

    const manualIncome = transactions.filter((row) => String(row.type || "") === "income");
    const expenses = transactions.filter((row) => String(row.type || "") === "expense");
    const transfers = transactions.filter((row) => String(row.type || "") === "transfer");

    const manualIncomeTotal = manualIncome.reduce((sum, row) => sum + numberValue(row.amount), 0);
    const expenseTotal = expenses.reduce((sum, row) => sum + numberValue(row.amount), 0);

    const cashIncome = manualIncome
      .filter((row) => String(row.money_location || "") === "cash")
      .reduce((sum, row) => sum + numberValue(row.amount), 0);

    const bankIncome = manualIncome
      .filter((row) => String(row.money_location || "") === "bank")
      .reduce((sum, row) => sum + numberValue(row.amount), 0);

    const cashExpense = expenses
      .filter((row) => String(row.money_location || "") === "cash")
      .reduce((sum, row) => sum + numberValue(row.amount), 0);

    const bankExpense = expenses
      .filter((row) => String(row.money_location || "") === "bank")
      .reduce((sum, row) => sum + numberValue(row.amount), 0);

    const cashToBank = transfers
      .filter(
        (row) =>
          String(row.from_location || "") === "cash" &&
          String(row.to_location || "") === "bank"
      )
      .reduce((sum, row) => sum + numberValue(row.amount), 0);

    const bankToCash = transfers
      .filter(
        (row) =>
          String(row.from_location || "") === "bank" &&
          String(row.to_location || "") === "cash"
      )
      .reduce((sum, row) => sum + numberValue(row.amount), 0);

    const currentCash =
      openingCashBalance + schoolFeesIncome + cashIncome - cashExpense - cashToBank + bankToCash;

    const currentBank = openingBankBalance + bankIncome - bankExpense + cashToBank - bankToCash;

    const totalAvailable = currentCash + currentBank;
    const totalIncome = schoolFeesIncome + manualIncomeTotal + bookProfit + uniformProfit;
    const netBalance = totalIncome - expenseTotal;

    return {
      openingBankBalance,
      openingCashBalance,
      schoolFeesIncome,
      manualIncomeTotal,
      bookProfit,
      uniformProfit,
      totalIncome,
      expenseTotal,
      netBalance,
      currentCash,
      currentBank,
      totalAvailable,
      cashToBank,
      bankToCash,
    };
  }, [financeSettings, transactions, schoolFeesIncome, bookProfit, uniformProfit]);

  const reportRange = useMemo(() => {
    return { start: reportStart, end: reportEnd };
  }, [reportStart, reportEnd]);

  const reportTransactions = useMemo(() => {
    const q = search.trim().toLowerCase();

    return transactions
      .filter((row) => {
        const date = String(row.transaction_date || "").slice(0, 10);
        return date >= reportRange.start && date <= reportRange.end;
      })
      .filter((row) => {
        if (!q) return true;

        return (
          String(row.type || "").toLowerCase().includes(q) ||
          String(row.category || "").toLowerCase().includes(q) ||
          String(row.item_name || "").toLowerCase().includes(q) ||
          String(row.description || "").toLowerCase().includes(q) ||
          String(row.money_location || "").toLowerCase().includes(q) ||
          String(row.from_location || "").toLowerCase().includes(q) ||
          String(row.to_location || "").toLowerCase().includes(q)
        );
      });
  }, [transactions, reportRange, search]);

  const reportFees = useMemo(() => {
    return feePayments.filter((row) => {
      const date = String(row.payment_date || row.created_at || "").slice(0, 10);
      return date >= reportRange.start && date <= reportRange.end;
    });
  }, [feePayments, reportRange]);

  const reportSummary = useMemo(() => {
    const manualIncome = reportTransactions
      .filter((row) => String(row.type || "") === "income")
      .reduce((sum, row) => sum + numberValue(row.amount), 0);

    const expense = reportTransactions
      .filter((row) => String(row.type || "") === "expense")
      .reduce((sum, row) => sum + numberValue(row.amount), 0);

    const transfer = reportTransactions
      .filter((row) => String(row.type || "") === "transfer")
      .reduce((sum, row) => sum + numberValue(row.amount), 0);

    const fees = reportFees.reduce((sum, row) => sum + numberValue(row.amount_paid), 0);

    return {
      fees,
      manualIncome,
      expense,
      transfer,
      totalIncome: fees + manualIncome,
    };
  }, [reportTransactions, reportFees]);

  function handleReportModeChange(nextMode: ReportMode) {
    setReportMode(nextMode);

    if (nextMode === "custom") return;

    const range = getDateRange(nextMode, settingsRow);
    setReportStart(range.start);
    setReportEnd(range.end);
  }

  async function ensureFinanceItem(type: "income" | "expense", category: string, itemName: string) {
    const cleanName = itemName.trim();
    if (!cleanName) return;

    const exists = financeItems.some(
      (item) =>
        String(item.type || "") === type &&
        String(item.category || "") === category &&
        String(item.item_name || "").trim().toLowerCase() === cleanName.toLowerCase()
    );

    if (exists) return;

    const { error } = await supabase.from("finance_items").insert({
      type,
      category,
      item_name: cleanName,
    });

    if (error && !String(error.message || "").toLowerCase().includes("duplicate")) {
      throw error;
    }
  }

  async function handleSaveIncome() {
    try {
      setSaving(true);
      setMessage("");

      const amount = numberValue(incomeAmount);

      if (amount <= 0) {
        setMessage("Enter a valid income amount.");
        setMessageType("error");
        return;
      }

      if (!incomeItem.trim()) {
        setMessage("Enter or select an income item.");
        setMessageType("error");
        return;
      }

      await ensureFinanceItem("income", incomeCategory, incomeItem);

      const { error } = await supabase.from("finance_transactions").insert({
        type: "income",
        category: incomeCategory,
        item_name: incomeItem.trim(),
        amount,
        money_location: incomeLocation,
        from_location: null,
        to_location: null,
        transaction_date: incomeDate,
        description: incomeDescription.trim() || null,
        recorded_by: adminName,
      });

      if (error) throw error;

      setIncomeAmount("");
      setIncomeDescription("");
      setMessage("Income saved successfully.");
      setMessageType("success");
      await reloadData();
    } catch (error: any) {
      console.error(error);
      setMessage(error?.message || "Failed to save income.");
      setMessageType("error");
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveExpense() {
    try {
      setSaving(true);
      setMessage("");

      const amount = numberValue(expenseAmount);

      if (amount <= 0) {
        setMessage("Enter a valid expense amount.");
        setMessageType("error");
        return;
      }

      if (!expenseItem.trim()) {
        setMessage("Enter or select an expenditure item.");
        setMessageType("error");
        return;
      }

      await ensureFinanceItem("expense", expenseCategory, expenseItem);

      const { error } = await supabase.from("finance_transactions").insert({
        type: "expense",
        category: expenseCategory,
        item_name: expenseItem.trim(),
        amount,
        money_location: expenseLocation,
        from_location: null,
        to_location: null,
        transaction_date: expenseDate,
        description: expenseDescription.trim() || null,
        recorded_by: adminName,
      });

      if (error) throw error;

      setExpenseAmount("");
      setExpenseDescription("");
      setMessage("Expenditure saved successfully.");
      setMessageType("success");
      await reloadData();
    } catch (error: any) {
      console.error(error);
      setMessage(error?.message || "Failed to save expenditure.");
      setMessageType("error");
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveTransfer() {
    try {
      setSaving(true);
      setMessage("");

      const amount = numberValue(transferAmount);

      if (amount <= 0) {
        setMessage("Enter a valid transfer amount.");
        setMessageType("error");
        return;
      }

      if (transferFrom === transferTo) {
        setMessage("Transfer source and destination cannot be the same.");
        setMessageType("error");
        return;
      }

      const { error } = await supabase.from("finance_transactions").insert({
        type: "transfer",
        category: transferFrom === "cash" ? "Cash to Bank Deposit" : "Bank to Cash Withdrawal",
        item_name: transferFrom === "cash" ? "Cash to Bank" : "Bank to Cash",
        amount,
        money_location: null,
        from_location: transferFrom,
        to_location: transferTo,
        transaction_date: transferDate,
        description: transferDescription.trim() || null,
        recorded_by: adminName,
      });

      if (error) throw error;

      setTransferAmount("");
      setTransferDescription("");
      setMessage("Transfer saved successfully. This is not counted as income.");
      setMessageType("success");
      await reloadData();
    } catch (error: any) {
      console.error(error);
      setMessage(error?.message || "Failed to save transfer.");
      setMessageType("error");
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveSettings() {
    try {
      setSaving(true);
      setMessage("");

      const bank = numberValue(openingBank);
      const cash = numberValue(openingCash);

      const payload = {
        opening_bank_balance: bank,
        opening_cash_balance: cash,
        updated_at: new Date().toISOString(),
      };

      if (financeSettings?.id) {
        const { error } = await supabase
          .from("finance_settings")
          .update(payload)
          .eq("id", financeSettings.id);

        if (error) throw error;
      } else {
        const { error } = await supabase.from("finance_settings").insert(payload);
        if (error) throw error;
      }

      setMessage("Opening balances saved successfully.");
      setMessageType("success");
      await reloadData();
    } catch (error: any) {
      console.error(error);
      setMessage(error?.message || "Failed to save opening balances.");
      setMessageType("error");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteTransaction(row: AnyRow) {
    const confirmed = window.confirm("Delete this finance transaction?");
    if (!confirmed) return;

    try {
      setSaving(true);
      const { error } = await supabase.from("finance_transactions").delete().eq("id", row.id);
      if (error) throw error;

      setMessage("Transaction deleted.");
      setMessageType("success");
      await reloadData();
    } catch (error: any) {
      console.error(error);
      setMessage(error?.message || "Failed to delete transaction.");
      setMessageType("error");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <main style={loadingPageStyle}>
        <div style={loadingCardStyle}>Loading income and expenditure...</div>
      </main>
    );
  }

  return (
    <main style={pageStyle}>
      <style jsx global>{`
        @media print {
          .no-print {
            display: none !important;
          }

          body,
          main {
            background: #fff !important;
          }

          .print-card {
            box-shadow: none !important;
            border: 1px solid #ddd !important;
          }
        }
      `}</style>

      <div style={{ maxWidth: "1250px", margin: "0 auto" }}>
        <div style={headerStyle} className="no-print">
          <div style={headerFlexStyle}>
            <div>
              <p style={eyebrowStyle}>JSMS Finance</p>
              <h1 style={{ margin: "6px 0 0", fontSize: "27px", lineHeight: 1.1 }}>
                Income & Expenditure
              </h1>
              <p style={headerNameStyle}>
                {schoolName} • {academicYear || "-"} • {currentTerm || "-"}
              </p>
            </div>

            <div style={headerRightStyle}>
              <Link href="/dashboard/admin" style={topButtonStyle}>
                JSMS Dashboard
              </Link>
              <Link href="/income-expenditure/books" style={topButtonStyle}>
                Books
              </Link>
              <Link href="/income-expenditure/uniforms" style={topButtonStyle}>
                Uniforms
              </Link>
              <button onClick={() => window.print()} style={topButtonStyle}>
                Print
              </button>
            </div>
          </div>
        </div>

        {message && (
          <div className="no-print">
            <MessageBox message={message} messageType={messageType} />
          </div>
        )}

        <div style={tabWrapStyle} className="no-print">
          <TabButton label="Dashboard" active={activeTab === "dashboard"} onClick={() => setActiveTab("dashboard")} />
          <TabButton label="Add Income" active={activeTab === "income"} onClick={() => setActiveTab("income")} />
          <TabButton label="Add Expenditure" active={activeTab === "expense"} onClick={() => setActiveTab("expense")} />
          <TabButton label="Transfers" active={activeTab === "transfer"} onClick={() => setActiveTab("transfer")} />
          <TabButton label="Reports" active={activeTab === "reports"} onClick={() => setActiveTab("reports")} />
          <TabButton label="Settings" active={activeTab === "settings"} onClick={() => setActiveTab("settings")} />
        </div>

        {activeTab === "dashboard" && (
          <>
            <div style={statsGridStyle}>
              <StatCard label="Money at Bank" value={formatMoney(financeSummary.currentBank)} tone="info" />
              <StatCard label="Money at Hand" value={formatMoney(financeSummary.currentCash)} tone="warning" />
              <StatCard label="Total Available" value={formatMoney(financeSummary.totalAvailable)} tone="success" />
              <StatCard label="School Fees" value={formatMoney(financeSummary.schoolFeesIncome)} tone="success" />
              <StatCard label="Manual Income" value={formatMoney(financeSummary.manualIncomeTotal)} tone="info" />
              <StatCard label="Books Profit" value={formatMoney(financeSummary.bookProfit)} tone="success" />
              <StatCard label="Uniforms Profit" value={formatMoney(financeSummary.uniformProfit)} tone="success" />
              <StatCard label="Total Expenditure" value={formatMoney(financeSummary.expenseTotal)} tone="danger" />
              <StatCard label="Net Income - Expense" value={formatMoney(financeSummary.netBalance)} tone="info" />
            </div>

            <div style={{ height: "12px" }} />

            <section style={sectionCardStyle}>
              <h3 style={sectionTitleStyle}>Finance Modules</h3>
              <div style={moduleGridStyle}>
                <ModuleCard
                  title="Books"
                  description="Books stock, sales, cost, and profit will be handled here."
                  href="/income-expenditure/books"
                  emoji="📚"
                />
                <ModuleCard
                  title="Uniforms"
                  description="Uniform stock, sales, cost, and profit will be handled here."
                  href="/income-expenditure/uniforms"
                  emoji="👕"
                />
              </div>
            </section>

            <div style={{ height: "12px" }} />

            <section style={sectionCardStyle}>
              <h3 style={sectionTitleStyle}>Recent Finance Transactions</h3>
              <TransactionsTable
                rows={transactions.slice(0, 10)}
                onDelete={handleDeleteTransaction}
                saving={saving}
              />
            </section>
          </>
        )}

        {activeTab === "income" && (
          <section style={sectionCardStyle}>
            <h3 style={sectionTitleStyle}>Add Income</h3>
            <p style={smallTextStyle}>
              School fees are pulled automatically from the Fees module. Use this form for Admission Forms, Donations, and Other Income.
            </p>

            <div style={formGridStyle}>
              <label style={labelStyle}>
                Income Category
                <select
                  value={incomeCategory}
                  onChange={(e) => {
                    setIncomeCategory(e.target.value);
                    const first = financeItems.find(
                      (item) =>
                        String(item.type) === "income" &&
                        String(item.category) === e.target.value
                    );
                    setIncomeItem(first ? String(first.item_name) : e.target.value);
                  }}
                  style={inputStyle}
                >
                  {INCOME_CATEGORIES.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </label>

              <label style={labelStyle}>
                Income Item
                <input
                  list="income-items"
                  value={incomeItem}
                  onChange={(e) => setIncomeItem(e.target.value)}
                  placeholder="Type or select item"
                  style={inputStyle}
                />
                <datalist id="income-items">
                  {incomeItemsForCategory.map((item) => (
                    <option key={String(item.id)} value={String(item.item_name)} />
                  ))}
                </datalist>
              </label>

              <label style={labelStyle}>
                Amount
                <input
                  value={incomeAmount}
                  onChange={(e) => setIncomeAmount(e.target.value)}
                  placeholder="0.00"
                  style={inputStyle}
                />
              </label>

              <label style={labelStyle}>
                Money Received Into
                <select
                  value={incomeLocation}
                  onChange={(e) => setIncomeLocation(e.target.value as "cash" | "bank")}
                  style={inputStyle}
                >
                  <option value="cash">Money at Hand</option>
                  <option value="bank">Money at Bank</option>
                </select>
              </label>

              <label style={labelStyle}>
                Date
                <input
                  type="date"
                  value={incomeDate}
                  onChange={(e) => setIncomeDate(e.target.value)}
                  style={inputStyle}
                />
              </label>

              <label style={labelStyle}>
                Description
                <input
                  value={incomeDescription}
                  onChange={(e) => setIncomeDescription(e.target.value)}
                  placeholder="Optional"
                  style={inputStyle}
                />
              </label>
            </div>

            <button
              onClick={handleSaveIncome}
              disabled={saving}
              style={{
                ...primaryButtonStyle,
                opacity: saving ? 0.65 : 1,
                cursor: saving ? "not-allowed" : "pointer",
              }}
            >
              {saving ? "Saving..." : "Save Income"}
            </button>
          </section>
        )}

        {activeTab === "expense" && (
          <section style={sectionCardStyle}>
            <h3 style={sectionTitleStyle}>Add Expenditure</h3>
            <p style={smallTextStyle}>
              Select whether the expense was paid from Money at Hand or Money at Bank. Items you type are saved for next time.
            </p>

            <div style={formGridStyle}>
              <label style={labelStyle}>
                Expenditure Category
                <select
                  value={expenseCategory}
                  onChange={(e) => {
                    setExpenseCategory(e.target.value);
                    const first = financeItems.find(
                      (item) =>
                        String(item.type) === "expense" &&
                        String(item.category) === e.target.value
                    );
                    setExpenseItem(first ? String(first.item_name) : "");
                  }}
                  style={inputStyle}
                >
                  {EXPENSE_CATEGORIES.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </label>

              <label style={labelStyle}>
                Expenditure Item
                <input
                  list="expense-items"
                  value={expenseItem}
                  onChange={(e) => setExpenseItem(e.target.value)}
                  placeholder="Example: Cutlass"
                  style={inputStyle}
                />
                <datalist id="expense-items">
                  {expenseItemsForCategory.map((item) => (
                    <option key={String(item.id)} value={String(item.item_name)} />
                  ))}
                </datalist>
              </label>

              <label style={labelStyle}>
                Amount
                <input
                  value={expenseAmount}
                  onChange={(e) => setExpenseAmount(e.target.value)}
                  placeholder="0.00"
                  style={inputStyle}
                />
              </label>

              <label style={labelStyle}>
                Paid From
                <select
                  value={expenseLocation}
                  onChange={(e) => setExpenseLocation(e.target.value as "cash" | "bank")}
                  style={inputStyle}
                >
                  <option value="cash">Money at Hand</option>
                  <option value="bank">Money at Bank</option>
                </select>
              </label>

              <label style={labelStyle}>
                Date
                <input
                  type="date"
                  value={expenseDate}
                  onChange={(e) => setExpenseDate(e.target.value)}
                  style={inputStyle}
                />
              </label>

              <label style={labelStyle}>
                Description
                <input
                  value={expenseDescription}
                  onChange={(e) => setExpenseDescription(e.target.value)}
                  placeholder="Optional"
                  style={inputStyle}
                />
              </label>
            </div>

            <button
              onClick={handleSaveExpense}
              disabled={saving}
              style={{
                ...primaryButtonStyle,
                opacity: saving ? 0.65 : 1,
                cursor: saving ? "not-allowed" : "pointer",
              }}
            >
              {saving ? "Saving..." : "Save Expenditure"}
            </button>
          </section>
        )}

        {activeTab === "transfer" && (
          <section style={sectionCardStyle}>
            <h3 style={sectionTitleStyle}>Transfer Money</h3>
            <p style={smallTextStyle}>
              Use this when cash is deposited to bank or money is withdrawn from bank. Transfers are not counted as income.
            </p>

            <div style={formGridStyle}>
              <label style={labelStyle}>
                From
                <select
                  value={transferFrom}
                  onChange={(e) => {
                    const value = e.target.value as "cash" | "bank";
                    setTransferFrom(value);
                    setTransferTo(value === "cash" ? "bank" : "cash");
                  }}
                  style={inputStyle}
                >
                  <option value="cash">Money at Hand</option>
                  <option value="bank">Money at Bank</option>
                </select>
              </label>

              <label style={labelStyle}>
                To
                <select
                  value={transferTo}
                  onChange={(e) => setTransferTo(e.target.value as "cash" | "bank")}
                  style={inputStyle}
                >
                  <option value="bank">Money at Bank</option>
                  <option value="cash">Money at Hand</option>
                </select>
              </label>

              <label style={labelStyle}>
                Amount
                <input
                  value={transferAmount}
                  onChange={(e) => setTransferAmount(e.target.value)}
                  placeholder="0.00"
                  style={inputStyle}
                />
              </label>

              <label style={labelStyle}>
                Date
                <input
                  type="date"
                  value={transferDate}
                  onChange={(e) => setTransferDate(e.target.value)}
                  style={inputStyle}
                />
              </label>

              <label style={labelStyle}>
                Description
                <input
                  value={transferDescription}
                  onChange={(e) => setTransferDescription(e.target.value)}
                  placeholder="Example: Deposited fees into bank"
                  style={inputStyle}
                />
              </label>
            </div>

            <button
              onClick={handleSaveTransfer}
              disabled={saving}
              style={{
                ...primaryButtonStyle,
                opacity: saving ? 0.65 : 1,
                cursor: saving ? "not-allowed" : "pointer",
              }}
            >
              {saving ? "Saving..." : "Save Transfer"}
            </button>
          </section>
        )}

        {activeTab === "reports" && (
          <>
            <section style={sectionCardStyle} className="no-print">
              <h3 style={sectionTitleStyle}>Reports</h3>

              <div style={formGridStyle}>
                <label style={labelStyle}>
                  Report Range
                  <select
                    value={reportMode}
                    onChange={(e) => handleReportModeChange(e.target.value as ReportMode)}
                    style={inputStyle}
                  >
                    <option value="today">Today</option>
                    <option value="week">This Week</option>
                    <option value="month">This Month</option>
                    <option value="term">Term</option>
                    <option value="year">Academic Year</option>
                    <option value="custom">Custom Date Range</option>
                  </select>
                </label>

                <label style={labelStyle}>
                  Start Date
                  <input
                    type="date"
                    value={reportStart}
                    onChange={(e) => {
                      setReportStart(e.target.value);
                      setReportMode("custom");
                    }}
                    style={inputStyle}
                  />
                </label>

                <label style={labelStyle}>
                  End Date
                  <input
                    type="date"
                    value={reportEnd}
                    onChange={(e) => {
                      setReportEnd(e.target.value);
                      setReportMode("custom");
                    }}
                    style={inputStyle}
                  />
                </label>

                <label style={labelStyle}>
                  Search
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search category, item, location..."
                    style={inputStyle}
                  />
                </label>
              </div>

              <button onClick={() => window.print()} style={secondaryButtonStyle}>
                Print Report
              </button>
            </section>

            <div style={{ height: "12px" }} />

            <section style={sectionCardStyle} className="print-card">
              <h3 style={sectionTitleStyle}>
                Finance Report: {formatDate(reportStart)} to {formatDate(reportEnd)}
              </h3>

              <div style={statsGridStyle}>
                <StatCard label="Fees Collected" value={formatMoney(reportSummary.fees)} tone="success" />
                <StatCard label="Manual Income" value={formatMoney(reportSummary.manualIncome)} tone="info" />
                <StatCard label="Total Income" value={formatMoney(reportSummary.totalIncome)} tone="success" />
                <StatCard label="Expenditure" value={formatMoney(reportSummary.expense)} tone="danger" />
                <StatCard label="Transfers" value={formatMoney(reportSummary.transfer)} tone="warning" />
              </div>

              <div style={{ height: "12px" }} />

              <TransactionsTable rows={reportTransactions} onDelete={handleDeleteTransaction} saving={saving} />
            </section>
          </>
        )}

        {activeTab === "settings" && (
          <section style={sectionCardStyle}>
            <h3 style={sectionTitleStyle}>Opening Balances</h3>
            <p style={smallTextStyle}>
              Enter the amount the school already had before using this module. This prevents wrong balances.
            </p>

            <div style={formGridStyle}>
              <label style={labelStyle}>
                Opening Money at Bank
                <input
                  value={openingBank}
                  onChange={(e) => setOpeningBank(e.target.value)}
                  placeholder="0.00"
                  style={inputStyle}
                />
              </label>

              <label style={labelStyle}>
                Opening Money at Hand
                <input
                  value={openingCash}
                  onChange={(e) => setOpeningCash(e.target.value)}
                  placeholder="0.00"
                  style={inputStyle}
                />
              </label>
            </div>

            <button
              onClick={handleSaveSettings}
              disabled={saving}
              style={{
                ...primaryButtonStyle,
                opacity: saving ? 0.65 : 1,
                cursor: saving ? "not-allowed" : "pointer",
              }}
            >
              {saving ? "Saving..." : "Save Opening Balances"}
            </button>
          </section>
        )}
      </div>
    </main>
  );
}

function MessageBox({
  message,
  messageType,
}: {
  message: string;
  messageType: "success" | "error" | "info";
}) {
  return (
    <div
      style={{
        background:
          messageType === "success"
            ? COLORS.successBg
            : messageType === "error"
            ? COLORS.dangerBg
            : COLORS.infoBg,
        color:
          messageType === "success"
            ? COLORS.successText
            : messageType === "error"
            ? COLORS.dangerText
            : COLORS.infoText,
        borderRadius: "12px",
        padding: "12px 14px",
        marginBottom: "12px",
        fontWeight: 800,
        fontSize: "13px",
      }}
    >
      {message}
    </div>
  );
}

function TabButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        border: active ? `2px solid ${COLORS.gold}` : `1px solid ${COLORS.border}`,
        background: active ? COLORS.dark : "#fff",
        color: active ? "#fff" : COLORS.dark,
        borderRadius: "12px",
        padding: "10px 12px",
        fontWeight: 900,
        fontSize: "13px",
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "success" | "warning" | "danger" | "info";
}) {
  const color =
    tone === "success"
      ? COLORS.successText
      : tone === "warning"
      ? COLORS.warningText
      : tone === "danger"
      ? COLORS.dangerText
      : COLORS.infoText;

  const bg =
    tone === "success"
      ? COLORS.successBg
      : tone === "warning"
      ? COLORS.warningBg
      : tone === "danger"
      ? COLORS.dangerBg
      : COLORS.infoBg;

  return (
    <div style={statCardStyle} className="print-card">
      <div
        style={{
          width: "34px",
          height: "34px",
          borderRadius: "12px",
          background: bg,
          color,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontWeight: 900,
        }}
      >
        •
      </div>
      <div>
        <p style={{ margin: 0, color: COLORS.muted, fontSize: "12px" }}>{label}</p>
        <h2 style={{ margin: "4px 0 0", color: COLORS.dark, fontSize: "21px" }}>{value}</h2>
      </div>
    </div>
  );
}

function ModuleCard({
  title,
  description,
  href,
  emoji,
}: {
  title: string;
  description: string;
  href: string;
  emoji: string;
}) {
  return (
    <Link href={href} style={{ textDecoration: "none", color: "inherit" }}>
      <div style={moduleCardStyle}>
        <div style={{ fontSize: "28px" }}>{emoji}</div>
        <div>
          <h3 style={{ margin: 0, color: COLORS.dark }}>{title}</h3>
          <p style={{ margin: "7px 0 0", color: COLORS.muted, fontSize: "13px", lineHeight: 1.5 }}>
            {description}
          </p>
        </div>
      </div>
    </Link>
  );
}

function TransactionsTable({
  rows,
  onDelete,
  saving,
}: {
  rows: AnyRow[];
  onDelete: (row: AnyRow) => void;
  saving: boolean;
}) {
  if (rows.length === 0) {
    return <p style={{ margin: 0, color: COLORS.muted, fontSize: "13px" }}>No transactions found.</p>;
  }

  return (
    <div style={tableWrapStyle}>
      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={thStyle}>Date</th>
            <th style={thStyle}>Type</th>
            <th style={thStyle}>Category</th>
            <th style={thStyle}>Item</th>
            <th style={thStyle}>Amount</th>
            <th style={thStyle}>Location / Transfer</th>
            <th style={thStyle}>Description</th>
            <th style={thStyle} className="no-print">
              Action
            </th>
          </tr>
        </thead>

        <tbody>
          {rows.map((row) => {
            const type = String(row.type || "");
            const location =
              type === "transfer"
                ? `${String(row.from_location || "-")} → ${String(row.to_location || "-")}`
                : String(row.money_location || "-");

            return (
              <tr key={String(row.id)}>
                <td style={tdStyle}>{formatDate(row.transaction_date)}</td>
                <td style={tdStyle}>{type}</td>
                <td style={tdStyle}>{String(row.category || "-")}</td>
                <td style={tdStyle}>{String(row.item_name || "-")}</td>
                <td style={tdStyle}>{formatMoney(numberValue(row.amount))}</td>
                <td style={tdStyle}>{location}</td>
                <td style={tdStyle}>{String(row.description || "-")}</td>
                <td style={tdStyle} className="no-print">
                  <button onClick={() => onDelete(row)} disabled={saving} style={deleteButtonStyle}>
                    Delete
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const pageStyle: React.CSSProperties = {
  minHeight: "100vh",
  background: COLORS.bg,
  fontFamily: "Arial, sans-serif",
  color: COLORS.text,
  padding: "12px",
};

const loadingPageStyle: React.CSSProperties = {
  ...pageStyle,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const loadingCardStyle: React.CSSProperties = {
  background: COLORS.card,
  borderRadius: "18px",
  padding: "18px 22px",
  border: `1px solid ${COLORS.border}`,
  boxShadow: "0 10px 24px rgba(0,0,0,0.06)",
  fontWeight: 700,
};

const headerStyle: React.CSSProperties = {
  background: `linear-gradient(135deg, ${COLORS.dark} 0%, ${COLORS.darkSoft} 100%)`,
  color: "#fff",
  borderRadius: "20px",
  padding: "18px",
  border: `2px solid ${COLORS.gold}`,
  boxShadow: "0 12px 24px rgba(0,0,0,0.10)",
  marginBottom: "12px",
};

const headerFlexStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: "12px",
  alignItems: "flex-start",
  flexWrap: "wrap",
};

const eyebrowStyle: React.CSSProperties = {
  margin: 0,
  fontSize: "10px",
  textTransform: "uppercase",
  letterSpacing: "1px",
  color: "rgba(255,255,255,0.72)",
};

const headerNameStyle: React.CSSProperties = {
  margin: "6px 0 0",
  color: "rgba(255,255,255,0.88)",
  fontSize: "13px",
  fontWeight: 700,
};

const headerRightStyle: React.CSSProperties = {
  display: "flex",
  gap: "8px",
  alignItems: "center",
  flexWrap: "wrap",
  justifyContent: "flex-end",
};

const topButtonStyle: React.CSSProperties = {
  textDecoration: "none",
  border: "1px solid rgba(255,255,255,0.15)",
  borderRadius: "10px",
  padding: "9px 11px",
  background: "rgba(255,255,255,0.06)",
  color: "#fff",
  fontWeight: 800,
  fontSize: "12px",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
};

const tabWrapStyle: React.CSSProperties = {
  display: "flex",
  gap: "8px",
  flexWrap: "wrap",
  marginBottom: "12px",
};

const statsGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(185px, 1fr))",
  gap: "10px",
};

const statCardStyle: React.CSSProperties = {
  background: COLORS.card,
  border: `1px solid ${COLORS.border}`,
  borderRadius: "14px",
  padding: "12px",
  display: "flex",
  alignItems: "center",
  gap: "10px",
  boxShadow: "0 6px 16px rgba(0,0,0,0.04)",
};

const sectionCardStyle: React.CSSProperties = {
  background: COLORS.card,
  borderRadius: "16px",
  border: `1px solid ${COLORS.border}`,
  boxShadow: "0 6px 16px rgba(0,0,0,0.04)",
  padding: "14px",
};

const sectionTitleStyle: React.CSSProperties = {
  marginTop: 0,
  marginBottom: "9px",
  color: COLORS.dark,
  fontSize: "18px",
};

const smallTextStyle: React.CSSProperties = {
  color: COLORS.muted,
  fontSize: "13px",
  lineHeight: 1.5,
  marginTop: "-4px",
};

const formGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: "10px",
  marginBottom: "12px",
};

const labelStyle: React.CSSProperties = {
  display: "grid",
  gap: "5px",
  color: COLORS.dark,
  fontWeight: 800,
  fontSize: "12px",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  border: `1px solid ${COLORS.border}`,
  borderRadius: "11px",
  padding: "11px 12px",
  outline: "none",
  fontSize: "13px",
  background: "#fff",
  color: COLORS.dark,
};

const primaryButtonStyle: React.CSSProperties = {
  border: "none",
  background: COLORS.gold,
  color: COLORS.dark,
  borderRadius: "11px",
  padding: "11px 14px",
  fontWeight: 900,
  fontSize: "13px",
};

const secondaryButtonStyle: React.CSSProperties = {
  border: `1px solid ${COLORS.border}`,
  background: "#fff",
  color: COLORS.dark,
  borderRadius: "11px",
  padding: "11px 14px",
  fontWeight: 900,
  fontSize: "13px",
  cursor: "pointer",
  marginTop: "10px",
};

const moduleGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
  gap: "10px",
};

const moduleCardStyle: React.CSSProperties = {
  border: `1px solid ${COLORS.border}`,
  borderRadius: "15px",
  padding: "14px",
  display: "flex",
  gap: "12px",
  alignItems: "flex-start",
  background: "#fff",
};

const tableWrapStyle: React.CSSProperties = {
  width: "100%",
  overflowX: "auto",
};

const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  minWidth: "900px",
};

const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "10px",
  borderBottom: `1px solid ${COLORS.border}`,
  color: COLORS.muted,
  fontSize: "12px",
  background: "#fafafa",
};

const tdStyle: React.CSSProperties = {
  padding: "10px",
  borderBottom: `1px solid ${COLORS.border}`,
  fontSize: "13px",
  verticalAlign: "top",
};

const deleteButtonStyle: React.CSSProperties = {
  border: "none",
  background: COLORS.dangerBg,
  color: COLORS.dangerText,
  borderRadius: "9px",
  padding: "7px 10px",
  fontWeight: 900,
  fontSize: "12px",
  cursor: "pointer",
};
