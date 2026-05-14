"use client";

import Link from "next/link";
import type { CSSProperties } from "react";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type AnyRow = Record<string, any>;

type FeeItem = {
  id: string;
  level_group: string;
  item_name: string;
  category: string;
  amount: number;
  sort_order: number;
  is_active: boolean;
  created_at?: string;
};

type ItemForm = {
  id?: string;
  item_name: string;
  category: string;
  amount: string;
};

const COLORS = {
  bg: "#f8f5ee",
  sidebar: "#0f172a",
  sidebarSoft: "#111827",
  gold: "#d4a017",
  goldSoft: "#f5e7b7",
  card: "#ffffff",
  text: "#111827",
  muted: "#6b7280",
  border: "#e5e7eb",
  success: "#166534",
  danger: "#991b1b",
  blue: "#1d4ed8",
  orange: "#9a3412",
};

const LEVEL_GROUPS = ["Playroom", "KG", "Lower Primary", "Upper Primary", "JHS"];

const DEFAULT_NEW_STUDENT_ITEMS: Record<string, { item_name: string; category: string }[]> = {
  Playroom: [
    { item_name: "Admission Fee", category: "General" },
    { item_name: "Centre Keeping Fee", category: "General" },
    { item_name: "P.T.A Dues", category: "General" },
    { item_name: "Motivation Fee", category: "General" },
    { item_name: "Maintenance Fee", category: "General" },
    { item_name: "First Aid Fee", category: "General" },
    { item_name: "Development Fee", category: "General" },
    { item_name: "Sports and Community Dev't", category: "General" },
    { item_name: "Lacoste", category: "Uniform" },
    { item_name: "Mon to Wed Wear", category: "Uniform" },
    { item_name: "Fri Wear", category: "Uniform" },
    { item_name: "Stationery Fee", category: "Stationery" },
    { item_name: "Printing Fee", category: "Printing" },
  ],
  KG: [
    { item_name: "Admission Fee", category: "General" },
    { item_name: "Tuition Fee", category: "General" },
    { item_name: "P.T.A Dues", category: "General" },
    { item_name: "Motivation Fee", category: "General" },
    { item_name: "Maintenance Fee", category: "General" },
    { item_name: "First Aid Fee", category: "General" },
    { item_name: "Development Fee", category: "General" },
    { item_name: "Sports and Community Dev't", category: "General" },
    { item_name: "Lacoste", category: "Uniform" },
    { item_name: "Mon to Wed Wear", category: "Uniform" },
    { item_name: "Fri Wear", category: "Uniform" },
    { item_name: "Stationery Fee", category: "Stationery" },
    { item_name: "Printing Fee", category: "Printing" },
  ],
  "Lower Primary": [
    { item_name: "Admission Fee", category: "General" },
    { item_name: "Tuition Fee", category: "General" },
    { item_name: "P.T.A Dues", category: "General" },
    { item_name: "Motivation Fee", category: "General" },
    { item_name: "Maintenance Fee", category: "General" },
    { item_name: "First Aid Fee", category: "General" },
    { item_name: "Development Fee", category: "General" },
    { item_name: "Sports and Community Dev't", category: "General" },
    { item_name: "Lacoste", category: "Uniform" },
    { item_name: "Mon to Wed Wear", category: "Uniform" },
    { item_name: "Fri Wear", category: "Uniform" },
    { item_name: "Stationery Fee", category: "Stationery" },
    { item_name: "Printing Fee", category: "Printing" },
  ],
  "Upper Primary": [
    { item_name: "Admission Fee", category: "General" },
    { item_name: "Tuition Fee", category: "General" },
    { item_name: "P.T.A Dues", category: "General" },
    { item_name: "Motivation Fee", category: "General" },
    { item_name: "Maintenance Fee", category: "General" },
    { item_name: "First Aid Fee", category: "General" },
    { item_name: "Development Fee", category: "General" },
    { item_name: "Sports and Community Dev't", category: "General" },
    { item_name: "Lacoste", category: "Uniform" },
    { item_name: "Mon to Wed Wear", category: "Uniform" },
    { item_name: "Fri Wear", category: "Uniform" },
    { item_name: "Stationery Fee", category: "Stationery" },
    { item_name: "Printing Fee", category: "Printing" },
  ],
  JHS: [
    { item_name: "Admission Fee", category: "General" },
    { item_name: "Tuition Fee", category: "General" },
    { item_name: "P.T.A Dues", category: "General" },
    { item_name: "Motivation Fee", category: "General" },
    { item_name: "Maintenance Fee", category: "General" },
    { item_name: "First Aid Fee", category: "General" },
    { item_name: "Development Fee", category: "General" },
    { item_name: "Sports and Community Dev't", category: "General" },
    { item_name: "Lacoste", category: "Uniform" },
    { item_name: "Mon to Wed Wear", category: "Uniform" },
    { item_name: "Fri Wear", category: "Uniform" },
    { item_name: "Stationery Fee", category: "Stationery" },
    { item_name: "Printing Fee", category: "Printing" },
  ],
};

function getRole(row: AnyRow | null) {
  const raw = String(row?.role || "").trim().toLowerCase();
  if (raw === "owner" || raw === "admin" || raw === "headmaster") return raw;
  return "teacher";
}

function getClassName(row: AnyRow) {
  return String(row.class_name || row.className || row.name || "").trim();
}

function getLevelGroupFromClassName(className: string) {
  const name = className.trim().toLowerCase();

  if (name.includes("playroom")) return "Playroom";
  if (name.startsWith("kg")) return "KG";

  if (["class 1", "class 2", "class 3"].includes(name)) return "Lower Primary";
  if (["class 4", "class 5", "class 6"].includes(name)) return "Upper Primary";

  if (name.startsWith("jhs")) return "JHS";

  return "Other";
}

function getLevelGroup(row: AnyRow) {
  return String(row.fee_level_group || "").trim() || getLevelGroupFromClassName(getClassName(row));
}

function numberValue(value: unknown) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

function formatMoney(value: number) {
  return `GHS ${Number(value || 0).toFixed(2)}`;
}

export default function FeesStructurePage() {
  const router = useRouter();

  const [checkingUser, setCheckingUser] = useState(true);
  const [loading, setLoading] = useState(true);
  const [savingLevel, setSavingLevel] = useState("");
  const [savingItem, setSavingItem] = useState(false);
  const [seedingLevel, setSeedingLevel] = useState("");
  const [settingsRow, setSettingsRow] = useState<AnyRow | null>(null);
  const [classes, setClasses] = useState<AnyRow[]>([]);
  const [newStudentItems, setNewStudentItems] = useState<FeeItem[]>([]);
  const [formRows, setFormRows] = useState<Record<string, AnyRow>>({});
  const [message, setMessage] = useState("");

  const [activeLevel, setActiveLevel] = useState("");
  const [itemForm, setItemForm] = useState<ItemForm>({
    item_name: "",
    category: "General",
    amount: "",
  });

  useEffect(() => {
    let active = true;

    async function checkAndLoad() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!active) return;

      if (!session?.user) {
        router.replace("/");
        return;
      }

      const [teachersRes, settingsRes, classesRes, itemsRes] = await Promise.all([
        supabase.from("teachers").select("*"),
        supabase.from("school_settings").select("*").limit(1).maybeSingle(),
        supabase.from("classes").select("*"),
        supabase
          .from("new_student_fee_items")
          .select("*")
          .eq("is_active", true)
          .order("level_group", { ascending: true })
          .order("sort_order", { ascending: true })
          .order("created_at", { ascending: true }),
      ]);

      if (!active) return;

      if (teachersRes.error || !teachersRes.data || teachersRes.data.length === 0) {
        router.replace("/");
        return;
      }

      const userRow =
        teachersRes.data.find((item) => item.auth_user_id === session.user.id) ||
        teachersRes.data.find(
          (item) =>
            String(item.email || "").trim().toLowerCase() ===
            String(session.user.email || "").trim().toLowerCase()
        ) ||
        null;

      if (!userRow) {
        router.replace("/");
        return;
      }

      const role = getRole(userRow);

      if (role === "teacher") {
        router.replace("/fees/teacher");
        return;
      }

      if (classesRes.error) throw classesRes.error;
      if (itemsRes.error) throw itemsRes.error;

      const classRows = classesRes.data || [];
      const nextForms: Record<string, AnyRow> = {};

      LEVEL_GROUPS.forEach((level) => {
        const sampleClass =
          classRows.find((row) => getLevelGroup(row) === level) ||
          classRows.find((row) => getLevelGroupFromClassName(getClassName(row)) === level);

        nextForms[level] = {
          fee_returning: String(numberValue(sampleClass?.fee_returning)),
          fee_lacoste: String(numberValue(sampleClass?.fee_lacoste)),
          fee_monwed: String(numberValue(sampleClass?.fee_monwed)),
          fee_friday: String(numberValue(sampleClass?.fee_friday)),
        };
      });

      setSettingsRow(settingsRes.data || null);
      setClasses(classRows);
      setNewStudentItems((itemsRes.data || []) as FeeItem[]);
      setFormRows(nextForms);
      setCheckingUser(false);
      setLoading(false);
    }

    void checkAndLoad().catch((error) => {
      console.error(error);
      setMessage(error instanceof Error ? `Error: ${error.message}` : "Error: Failed to load.");
      setCheckingUser(false);
      setLoading(false);
    });

    return () => {
      active = false;
    };
  }, [router]);

  const schoolName = String(settingsRow?.school_name || "JEFSEM VISION SCHOOL");
  const academicYear = String(settingsRow?.academic_year || "");
  const currentTerm = String(settingsRow?.current_term || "");

  const sortedClasses = useMemo(() => {
    return [...classes].sort((a, b) => getClassName(a).localeCompare(getClassName(b)));
  }, [classes]);

  const levelCards = useMemo(() => {
    return LEVEL_GROUPS.map((level) => {
      const levelClasses = sortedClasses.filter((row) => getLevelGroup(row) === level);
      const items = newStudentItems
        .filter((item) => item.level_group === level && item.is_active)
        .sort((a, b) => {
          if (Number(a.sort_order || 0) !== Number(b.sort_order || 0)) {
            return Number(a.sort_order || 0) - Number(b.sort_order || 0);
          }
          return String(a.item_name).localeCompare(String(b.item_name));
        });

      const newTotal = items.reduce((sum, item) => sum + numberValue(item.amount), 0);
      const form = formRows[level] || {};
      const continuingUniformTotal =
        numberValue(form.fee_lacoste) +
        numberValue(form.fee_monwed) +
        numberValue(form.fee_friday);

      return {
        level,
        classes: levelClasses,
        items,
        newTotal,
        continuingUniformTotal,
      };
    });
  }, [sortedClasses, newStudentItems, formRows]);

  const activeLevelData = useMemo(() => {
    if (!activeLevel) return null;
    return levelCards.find((item) => item.level === activeLevel) || null;
  }, [activeLevel, levelCards]);

  function updateLevelField(level: string, field: string, value: string) {
    setFormRows((prev) => ({
      ...prev,
      [level]: {
        ...(prev[level] || {}),
        [field]: value,
      },
    }));
  }

  function resetItemForm() {
    setItemForm({
      item_name: "",
      category: "General",
      amount: "",
    });
  }

  function startEditItem(item: FeeItem) {
    setItemForm({
      id: item.id,
      item_name: item.item_name,
      category: item.category,
      amount: String(numberValue(item.amount)),
    });
  }

  async function saveLevelFees(level: string) {
    const form = formRows[level];
    if (!form) return;

    const affectedClasses = sortedClasses.filter((row) => getLevelGroup(row) === level);

    if (affectedClasses.length === 0) {
      setMessage(`Error: No classes found under ${level}.`);
      return;
    }

    try {
      setSavingLevel(level);
      setMessage("");

      const payload = {
        fee_level_group: level,
        fee_returning: numberValue(form.fee_returning),
        fee_lacoste: numberValue(form.fee_lacoste),
        fee_monwed: numberValue(form.fee_monwed),
        fee_friday: numberValue(form.fee_friday),
      };

      const ids = affectedClasses.map((row) => row.id);

      const { error } = await supabase.from("classes").update(payload).in("id", ids);

      if (error) throw error;

      setClasses((prev) =>
        prev.map((item) =>
          ids.includes(item.id)
            ? {
                ...item,
                ...payload,
              }
            : item
        )
      );

      setMessage(`${level} continuing fees and uniform prices updated.`);
    } catch (error) {
      console.error(error);
      setMessage(
        error instanceof Error ? `Error: ${error.message}` : "Error: Failed to save fee structure."
      );
    } finally {
      setSavingLevel("");
    }
  }

  async function saveAllLevels() {
    try {
      setMessage("");

      for (const level of LEVEL_GROUPS) {
        const form = formRows[level];
        const affectedClasses = sortedClasses.filter((row) => getLevelGroup(row) === level);

        if (!form || affectedClasses.length === 0) continue;

        setSavingLevel(level);

        const payload = {
          fee_level_group: level,
          fee_returning: numberValue(form.fee_returning),
          fee_lacoste: numberValue(form.fee_lacoste),
          fee_monwed: numberValue(form.fee_monwed),
          fee_friday: numberValue(form.fee_friday),
        };

        const ids = affectedClasses.map((row) => row.id);

        const { error } = await supabase.from("classes").update(payload).in("id", ids);
        if (error) throw error;
      }

      setClasses((prev) =>
        prev.map((row) => {
          const level = getLevelGroup(row);
          const form = formRows[level] || {};
          if (!LEVEL_GROUPS.includes(level)) return row;

          return {
            ...row,
            fee_level_group: level,
            fee_returning: numberValue(form.fee_returning),
            fee_lacoste: numberValue(form.fee_lacoste),
            fee_monwed: numberValue(form.fee_monwed),
            fee_friday: numberValue(form.fee_friday),
          };
        })
      );

      setMessage("All level fee structures updated.");
    } catch (error) {
      console.error(error);
      setMessage(
        error instanceof Error ? `Error: ${error.message}` : "Error: Failed to save all levels."
      );
    } finally {
      setSavingLevel("");
    }
  }

  async function saveNewStudentItem() {
    if (!activeLevel) return;

    const itemName = itemForm.item_name.trim();
    const category = itemForm.category.trim() || "General";
    const amount = numberValue(itemForm.amount);

    if (!itemName) {
      setMessage("Error: Item name is required.");
      return;
    }

    try {
      setSavingItem(true);
      setMessage("");

      if (itemForm.id) {
        const payload = {
          item_name: itemName,
          category,
          amount,
        };

        const { error } = await supabase
          .from("new_student_fee_items")
          .update(payload)
          .eq("id", itemForm.id);

        if (error) throw error;

        setNewStudentItems((prev) =>
          prev.map((item) => (item.id === itemForm.id ? { ...item, ...payload } : item))
        );

        setMessage(`${itemName} updated.`);
      } else {
        const currentItems = newStudentItems.filter((item) => item.level_group === activeLevel);
        const payload = {
          level_group: activeLevel,
          item_name: itemName,
          category,
          amount,
          sort_order: currentItems.length + 1,
          is_active: true,
        };

        const { data, error } = await supabase
          .from("new_student_fee_items")
          .insert(payload)
          .select("*")
          .single();

        if (error) throw error;

        setNewStudentItems((prev) => [...prev, data as FeeItem]);
        setMessage(`${itemName} added to ${activeLevel}.`);
      }

      resetItemForm();
    } catch (error) {
      console.error(error);
      setMessage(error instanceof Error ? `Error: ${error.message}` : "Error: Failed to save item.");
    } finally {
      setSavingItem(false);
    }
  }

  async function deleteNewStudentItem(item: FeeItem) {
    const confirmed = window.confirm(`Remove "${item.item_name}" from ${item.level_group}?`);
    if (!confirmed) return;

    try {
      setSavingItem(true);
      setMessage("");

      const { error } = await supabase
        .from("new_student_fee_items")
        .update({ is_active: false })
        .eq("id", item.id);

      if (error) throw error;

      setNewStudentItems((prev) => prev.filter((row) => row.id !== item.id));
      setMessage(`${item.item_name} removed.`);
    } catch (error) {
      console.error(error);
      setMessage(
        error instanceof Error ? `Error: ${error.message}` : "Error: Failed to remove item."
      );
    } finally {
      setSavingItem(false);
    }
  }

  async function seedDefaultItems(level: string) {
    const existing = newStudentItems.filter((item) => item.level_group === level && item.is_active);

    if (existing.length > 0) {
      setMessage(`Error: ${level} already has new student items.`);
      return;
    }

    try {
      setSeedingLevel(level);
      setMessage("");

      const defaults = DEFAULT_NEW_STUDENT_ITEMS[level] || [];
      const payload = defaults.map((item, index) => ({
        level_group: level,
        item_name: item.item_name,
        category: item.category,
        amount: 0,
        sort_order: index + 1,
        is_active: true,
      }));

      const { data, error } = await supabase
        .from("new_student_fee_items")
        .insert(payload)
        .select("*");

      if (error) throw error;

      setNewStudentItems((prev) => [...prev, ...((data || []) as FeeItem[])]);
      setMessage(`Default new student structure added for ${level}. Enter the amounts now.`);
    } catch (error) {
      console.error(error);
      setMessage(
        error instanceof Error ? `Error: ${error.message}` : "Error: Failed to add defaults."
      );
    } finally {
      setSeedingLevel("");
    }
  }

  if (checkingUser || loading) {
    return <div style={{ padding: "24px" }}>Loading fee structure...</div>;
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        background: COLORS.bg,
        fontFamily: "Arial, sans-serif",
        color: COLORS.text,
      }}
    >
      <div style={{ display: "flex", minHeight: "100vh" }}>
        <aside
          style={{
            width: "290px",
            background: `linear-gradient(180deg, ${COLORS.sidebar} 0%, ${COLORS.sidebarSoft} 100%)`,
            color: "#fff",
            padding: "24px 18px",
            borderRight: `4px solid ${COLORS.gold}`,
            position: "sticky",
            top: 0,
            alignSelf: "flex-start",
            minHeight: "100vh",
          }}
        >
          <div style={{ marginBottom: "24px" }}>
            <p style={{ margin: 0, fontSize: "12px", opacity: 0.8 }}>Fees Module</p>
            <h1 style={{ margin: "6px 0 0", fontSize: "24px", lineHeight: 1.2 }}>
              Fee Structure
            </h1>
            <p style={{ margin: "10px 0 0", fontSize: "13px", opacity: 0.85 }}>
              {schoolName}
            </p>
            <p style={{ margin: "4px 0 0", fontSize: "12px", color: COLORS.goldSoft }}>
              {academicYear || "-"} • {currentTerm || "-"}
            </p>
          </div>

          <div style={{ display: "grid", gap: "10px" }}>
            <ActionLink href="/fees/admin" label="Dashboard" />
            <ActionLink href="/fees/admin/record-payment" label="Record Payment" />
            <ActionLink href="/fees/admin/fee-structure" label="Fee Structure" />
            <ActionLink href="/fees/admin/student-accounts" label="Student Accounts" />
            <ActionLink href="/fees/admin/debtors" label="Debtors" />
            <ActionLink href="/fees/admin/receipts" label="Receipts" />
            <ActionLink href="/fees/admin/reports" label="Reports" />
            <ActionLink href="/fees/admin/fee-reminder" label="Fee Reminder" />
          </div>

          <div
            style={{
              marginTop: "28px",
              padding: "14px",
              borderRadius: "14px",
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.1)",
            }}
          >
            <p style={{ margin: 0, fontSize: "12px", color: COLORS.goldSoft }}>
              Structure Logic
            </p>
            <p style={{ margin: "8px 0 0", fontSize: "13px", lineHeight: 1.5 }}>
              New student fees use a flexible breakdown. Continuing students keep one fee total.
              Uniform prices for continuing students are separate.
            </p>
          </div>
        </aside>

        <section style={{ flex: 1, padding: "24px" }}>
          <div
            style={{
              background: `linear-gradient(135deg, ${COLORS.sidebar} 0%, #1f2937 100%)`,
              color: "#fff",
              padding: "24px",
              borderRadius: "22px",
              marginBottom: "24px",
              border: `2px solid ${COLORS.gold}`,
              boxShadow: "0 18px 35px rgba(0,0,0,0.08)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: "16px",
                flexWrap: "wrap",
                alignItems: "center",
              }}
            >
              <div>
                <h2 style={{ margin: 0, fontSize: "30px" }}>Fee Structure Setup</h2>
                <p style={{ margin: "8px 0 0", color: "#d1d5db" }}>
                  Manage continuing fees, new student breakdowns, and continuing uniform prices.
                </p>
              </div>

              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                <Link href="/fees/admin" style={topButtonStyle()}>
                  Back to Dashboard
                </Link>
                <button
                  onClick={saveAllLevels}
                  disabled={Boolean(savingLevel)}
                  style={primaryButtonStyle}
                >
                  {savingLevel ? "Saving..." : "Save All Levels"}
                </button>
              </div>
            </div>
          </div>

          {message && (
            <div
              style={{
                background: message.startsWith("Error:") ? "#fee2e2" : "#dcfce7",
                color: message.startsWith("Error:") ? COLORS.danger : COLORS.success,
                borderRadius: "14px",
                padding: "14px 16px",
                marginBottom: "20px",
                fontWeight: "bold",
              }}
            >
              {message}
            </div>
          )}

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(330px, 1fr))",
              gap: "18px",
            }}
          >
            {levelCards.map((card) => {
              const form = formRows[card.level] || {};

              return (
                <div
                  key={card.level}
                  style={{
                    background: COLORS.card,
                    borderRadius: "20px",
                    border: `1px solid ${COLORS.border}`,
                    boxShadow: "0 10px 25px rgba(0,0,0,0.06)",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      padding: "18px 18px 14px",
                      background: "#fffaf0",
                      borderBottom: `1px solid ${COLORS.border}`,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: "12px",
                        alignItems: "start",
                        flexWrap: "wrap",
                      }}
                    >
                      <div>
                        <h3 style={{ margin: 0, color: COLORS.sidebar }}>{card.level}</h3>
                        <p style={{ margin: "6px 0 0", color: COLORS.muted, fontSize: "13px" }}>
                          Classes:{" "}
                          {card.classes.length > 0
                            ? card.classes.map((row) => getClassName(row)).join(", ")
                            : "No class linked"}
                        </p>
                      </div>

                      <button
                        onClick={() => saveLevelFees(card.level)}
                        disabled={savingLevel === card.level}
                        style={primaryButtonStyle}
                      >
                        {savingLevel === card.level ? "Saving..." : "Save"}
                      </button>
                    </div>
                  </div>

                  <div style={{ padding: "18px" }}>
                    <div
                      style={{
                        marginBottom: "16px",
                        padding: "14px",
                        borderRadius: "14px",
                        background: "#f9fafb",
                        border: `1px solid ${COLORS.border}`,
                      }}
                    >
                      <p style={sectionTitleStyle}>Continuing Student Fee</p>

                      <FieldBox
                        label="Normal Continuing Fee"
                        value={form.fee_returning || ""}
                        onChange={(value) =>
                          updateLevelField(card.level, "fee_returning", value)
                        }
                      />

                      <p style={{ margin: "10px 0 0", color: COLORS.muted, fontSize: "13px" }}>
                        This is the simple fee total for old/continuing students.
                      </p>
                    </div>

                    <div
                      style={{
                        marginBottom: "16px",
                        padding: "14px",
                        borderRadius: "14px",
                        background: "#f9fafb",
                        border: `1px solid ${COLORS.border}`,
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: "10px",
                          flexWrap: "wrap",
                        }}
                      >
                        <div>
                          <p style={sectionTitleStyle}>New Student Structure</p>
                          <p style={{ margin: "4px 0 0", color: COLORS.muted, fontSize: "13px" }}>
                            Total: <b>{formatMoney(card.newTotal)}</b> • {card.items.length} item(s)
                          </p>
                        </div>

                        <button
                          onClick={() => {
                            setActiveLevel(card.level);
                            resetItemForm();
                          }}
                          style={secondaryButtonStyle}
                        >
                          Manage Breakdown
                        </button>
                      </div>

                      {card.items.length === 0 && (
                        <button
                          onClick={() => seedDefaultItems(card.level)}
                          disabled={seedingLevel === card.level}
                          style={{
                            ...lightButtonStyle,
                            marginTop: "12px",
                            width: "100%",
                          }}
                        >
                          {seedingLevel === card.level
                            ? "Adding..."
                            : "Add Default New Student Items"}
                        </button>
                      )}
                    </div>

                    <div
                      style={{
                        padding: "14px",
                        borderRadius: "14px",
                        background: "#f9fafb",
                        border: `1px solid ${COLORS.border}`,
                      }}
                    >
                      <p style={sectionTitleStyle}>Continuing Uniform Prices</p>
                      <p style={{ margin: "0 0 10px", color: COLORS.muted, fontSize: "13px" }}>
                        These prices will be used later in the Uniform module for continuing students.
                      </p>

                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                          gap: "12px",
                        }}
                      >
                        <FieldBox
                          label="Lacoste"
                          value={form.fee_lacoste || ""}
                          onChange={(value) => updateLevelField(card.level, "fee_lacoste", value)}
                        />
                        <FieldBox
                          label="Mon-Wed"
                          value={form.fee_monwed || ""}
                          onChange={(value) => updateLevelField(card.level, "fee_monwed", value)}
                        />
                        <FieldBox
                          label="Friday"
                          value={form.fee_friday || ""}
                          onChange={(value) => updateLevelField(card.level, "fee_friday", value)}
                        />
                      </div>

                      <p style={{ margin: "12px 0 0", color: COLORS.orange, fontSize: "13px" }}>
                        Uniform total: <b>{formatMoney(card.continuingUniformTotal)}</b>
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      {activeLevelData && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15,23,42,0.55)",
            zIndex: 50,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "18px",
          }}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: "22px",
              width: "min(980px, 100%)",
              maxHeight: "92vh",
              overflow: "auto",
              boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
            }}
          >
            <div
              style={{
                padding: "20px",
                borderBottom: `1px solid ${COLORS.border}`,
                background: "#fffaf0",
                display: "flex",
                justifyContent: "space-between",
                gap: "14px",
                alignItems: "start",
              }}
            >
              <div>
                <h2 style={{ margin: 0, color: COLORS.sidebar }}>
                  {activeLevelData.level} New Student Breakdown
                </h2>
                <p style={{ margin: "8px 0 0", color: COLORS.muted }}>
                  Total New Student Fee: <b>{formatMoney(activeLevelData.newTotal)}</b>
                </p>
              </div>

              <button
                onClick={() => {
                  setActiveLevel("");
                  resetItemForm();
                }}
                style={dangerOutlineButtonStyle}
              >
                Close
              </button>
            </div>

            <div style={{ padding: "20px" }}>
              <div
                style={{
                  padding: "14px",
                  border: `1px solid ${COLORS.border}`,
                  borderRadius: "16px",
                  background: "#f9fafb",
                  marginBottom: "18px",
                }}
              >
                <p style={sectionTitleStyle}>
                  {itemForm.id ? "Edit Fee Item" : "Add Fee Item"}
                </p>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "2fr 1fr 1fr auto auto",
                    gap: "12px",
                    alignItems: "end",
                  }}
                >
                  <TextFieldBox
                    label="Item Name"
                    value={itemForm.item_name}
                    onChange={(value) => setItemForm((prev) => ({ ...prev, item_name: value }))}
                    placeholder="Example: Admission Fee"
                  />

                  <TextFieldBox
                    label="Category"
                    value={itemForm.category}
                    onChange={(value) => setItemForm((prev) => ({ ...prev, category: value }))}
                    placeholder="General"
                  />

                  <FieldBox
                    label="Amount"
                    value={itemForm.amount}
                    onChange={(value) => setItemForm((prev) => ({ ...prev, amount: value }))}
                  />

                  <button
                    onClick={saveNewStudentItem}
                    disabled={savingItem}
                    style={primaryButtonStyle}
                  >
                    {savingItem ? "Saving..." : itemForm.id ? "Update" : "Add"}
                  </button>

                  {itemForm.id && (
                    <button onClick={resetItemForm} style={lightButtonStyle}>
                      Cancel
                    </button>
                  )}
                </div>
              </div>

              {activeLevelData.items.length === 0 ? (
                <div
                  style={{
                    padding: "18px",
                    borderRadius: "14px",
                    border: `1px dashed ${COLORS.border}`,
                    color: COLORS.muted,
                    textAlign: "center",
                  }}
                >
                  No new student items yet.
                </div>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table
                    style={{
                      width: "100%",
                      borderCollapse: "collapse",
                      background: "#fff",
                      border: `1px solid ${COLORS.border}`,
                      borderRadius: "14px",
                      overflow: "hidden",
                    }}
                  >
                    <thead>
                      <tr style={{ background: COLORS.sidebar, color: "#fff" }}>
                        <th style={thStyle}>#</th>
                        <th style={thStyle}>Item Name</th>
                        <th style={thStyle}>Category</th>
                        <th style={thStyle}>Amount</th>
                        <th style={thStyle}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeLevelData.items.map((item, index) => (
                        <tr key={item.id}>
                          <td style={tdStyle}>{index + 1}</td>
                          <td style={tdStyle}>{item.item_name}</td>
                          <td style={tdStyle}>{item.category}</td>
                          <td style={tdStyle}>{formatMoney(numberValue(item.amount))}</td>
                          <td style={tdStyle}>
                            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                              <button onClick={() => startEditItem(item)} style={smallButtonStyle}>
                                Edit
                              </button>
                              <button
                                onClick={() => deleteNewStudentItem(item)}
                                style={smallDangerButtonStyle}
                              >
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function FieldBox({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <input
        type="number"
        min="0"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={inputStyle}
      />
    </div>
  );
}

function TextFieldBox({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        style={inputStyle}
      />
    </div>
  );
}

function ActionLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      style={{
        textDecoration: "none",
        background: "rgba(255,255,255,0.06)",
        color: "#fff",
        padding: "14px 16px",
        borderRadius: "14px",
        fontWeight: "bold",
        border: "1px solid rgba(255,255,255,0.08)",
        display: "block",
      }}
    >
      {label}
    </Link>
  );
}

function topButtonStyle(): CSSProperties {
  return {
    textDecoration: "none",
    border: `1px solid rgba(255,255,255,0.15)`,
    borderRadius: "10px",
    padding: "10px 12px",
    background: "rgba(255,255,255,0.06)",
    color: "#fff",
    cursor: "pointer",
    fontWeight: "bold",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
  };
}

const sectionTitleStyle: CSSProperties = {
  margin: "0 0 10px",
  fontWeight: "bold",
  color: COLORS.sidebar,
};

const labelStyle: CSSProperties = {
  display: "block",
  marginBottom: "6px",
  fontWeight: "bold",
  fontSize: "13px",
  color: COLORS.muted,
};

const inputStyle: CSSProperties = {
  width: "100%",
  padding: "12px",
  borderRadius: "12px",
  border: `1px solid ${COLORS.border}`,
  fontSize: "14px",
  outline: "none",
  background: "#fff",
};

const thStyle: CSSProperties = {
  textAlign: "left",
  padding: "12px",
  fontSize: "13px",
  borderBottom: `1px solid ${COLORS.border}`,
};

const tdStyle: CSSProperties = {
  padding: "12px",
  borderBottom: `1px solid ${COLORS.border}`,
  fontSize: "14px",
  verticalAlign: "top",
};

const primaryButtonStyle: CSSProperties = {
  border: "none",
  background: COLORS.gold,
  color: COLORS.sidebar,
  borderRadius: "12px",
  padding: "12px 16px",
  fontWeight: "bold",
  cursor: "pointer",
};

const secondaryButtonStyle: CSSProperties = {
  border: "none",
  background: COLORS.sidebar,
  color: "#fff",
  borderRadius: "12px",
  padding: "11px 14px",
  fontWeight: "bold",
  cursor: "pointer",
};

const lightButtonStyle: CSSProperties = {
  border: `1px solid ${COLORS.border}`,
  background: "#fff",
  color: COLORS.sidebar,
  borderRadius: "12px",
  padding: "12px 14px",
  fontWeight: "bold",
  cursor: "pointer",
};

const smallButtonStyle: CSSProperties = {
  border: "none",
  background: "#dbeafe",
  color: COLORS.blue,
  borderRadius: "10px",
  padding: "8px 10px",
  fontWeight: "bold",
  cursor: "pointer",
};

const smallDangerButtonStyle: CSSProperties = {
  border: "none",
  background: "#fee2e2",
  color: COLORS.danger,
  borderRadius: "10px",
  padding: "8px 10px",
  fontWeight: "bold",
  cursor: "pointer",
};

const dangerOutlineButtonStyle: CSSProperties = {
  border: `1px solid #fecaca`,
  background: "#fff",
  color: COLORS.danger,
  borderRadius: "12px",
  padding: "10px 14px",
  fontWeight: "bold",
  cursor: "pointer",
};