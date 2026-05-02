"use client";

import type React from "react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type AnyRow = Record<string, any>;

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

function getRole(row: AnyRow | null) {
  return String(row?.role || "").trim().toLowerCase();
}

function isAdminRole(role: string) {
  return role === "admin" || role === "super_admin" || role === "superadmin";
}

function isTeacherRole(role: string) {
  return role === "teacher";
}

function getTeacherId(row: AnyRow | null) {
  if (!row) return "";
  return String(row.teacher_id || "").trim() || String(row.id || "").trim();
}

function getTeacherName(row: AnyRow | null) {
  return String(row?.full_name || row?.name || "Teacher");
}

function getTeacherClass(row: AnyRow | null) {
  if (!row) return "-";

  const possible =
    row.assigned_classes ||
    row.classes ||
    row.class_names ||
    row.class_name ||
    row.class ||
    row.assigned_class ||
    row.teacher_class ||
    row.level;

  if (Array.isArray(possible)) return possible.join(", ");
  return String(possible || "-");
}

function toIsoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString([], {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
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

function addDays(value: string, days: number) {
  const d = new Date(value);
  d.setDate(d.getDate() + days);
  return toIsoDate(d);
}

export default function DutyRosterPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [adminRow, setAdminRow] = useState<AnyRow | null>(null);
  const [teachers, setTeachers] = useState<AnyRow[]>([]);
  const [roster, setRoster] = useState<AnyRow[]>([]);

  const [selectedTeacherId, setSelectedTeacherId] = useState("");
  const [weekStart, setWeekStart] = useState(toIsoDate(startOfWeekMonday(new Date())));
  const [weekEnd, setWeekEnd] = useState(toIsoDate(endOfWeekSunday(new Date())));
  const [note, setNote] = useState("");

  const [search, setSearch] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
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

        const teachersRes = await supabase.from("teachers").select("*");

        if (!active) return;

        if (teachersRes.error) {
          throw teachersRes.error;
        }

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
          teacher_id: "",
          username: "",
          phone: "",
        };

        const finalUser = matchedUser || fallbackAdminUser;
        const role = getRole(finalUser);

        if (!isAdminRole(role)) {
          router.replace("/teacher-attendance");
          return;
        }

        const realTeachers = allUsers.filter((item) => isTeacherRole(getRole(item)));

        setAdminRow(finalUser);
        setTeachers(realTeachers);

        await loadRoster();
      } catch (error: any) {
        console.error(error);
        setMessage(error?.message || "Failed to load duty roster.");
        setMessageType("error");
      } finally {
        if (active) setLoading(false);
      }
    }

    async function loadRoster() {
      const { data, error } = await supabase
        .from("teacher_duty_roster")
        .select("*")
        .order("week_start_date", { ascending: false })
        .order("teacher_name", { ascending: true });

      if (error) throw error;
      if (active) setRoster(data || []);
    }

    void loadPage();

    return () => {
      active = false;
    };
  }, [router]);

  useEffect(() => {
    if (!weekStart) return;
    setWeekEnd(addDays(weekStart, 6));
  }, [weekStart]);

  const selectedTeacher = useMemo(() => {
    return teachers.find((teacher) => getTeacherId(teacher) === selectedTeacherId) || null;
  }, [teachers, selectedTeacherId]);

  const filteredRoster = useMemo(() => {
    const q = search.trim().toLowerCase();

    if (!q) return roster;

    return roster.filter((row) => {
      return (
        String(row.teacher_name || "").toLowerCase().includes(q) ||
        String(row.teacher_id || "").toLowerCase().includes(q) ||
        String(row.week_start_date || "").toLowerCase().includes(q) ||
        String(row.week_end_date || "").toLowerCase().includes(q)
      );
    });
  }, [roster, search]);

  async function reloadRoster() {
    const { data, error } = await supabase
      .from("teacher_duty_roster")
      .select("*")
      .order("week_start_date", { ascending: false })
      .order("teacher_name", { ascending: true });

    if (error) throw error;
    setRoster(data || []);
  }

  async function handleAssignDuty() {
    try {
      setActionLoading(true);
      setMessage("");

      if (!selectedTeacher) {
        setMessage("Select a teacher first.");
        setMessageType("error");
        return;
      }

      if (!weekStart || !weekEnd) {
        setMessage("Select week start and week end.");
        setMessageType("error");
        return;
      }

      const teacherId = getTeacherId(selectedTeacher);
      const teacherName = getTeacherName(selectedTeacher);

      const existing = roster.find(
        (row) =>
          String(row.teacher_id || "") === String(teacherId) &&
          String(row.week_start_date || "") === String(weekStart)
      );

      if (existing) {
        setMessage("This teacher is already assigned for that week.");
        setMessageType("error");
        return;
      }

      const payload = {
        teacher_id: teacherId,
        teacher_name: teacherName,
        week_start_date: weekStart,
        week_end_date: weekEnd,
        note: note.trim() || null,
      };

      const { error } = await supabase.from("teacher_duty_roster").insert(payload);

      if (error) throw error;

      await reloadRoster();

      setSelectedTeacherId("");
      setNote("");
      setMessage("Duty assigned successfully.");
      setMessageType("success");
    } catch (error: any) {
      console.error(error);
      setMessage(error?.message || "Failed to assign duty.");
      setMessageType("error");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleDeleteDuty(row: AnyRow) {
    const confirmed = window.confirm(
      `Remove ${String(row.teacher_name || "this teacher")} from duty roster?`
    );

    if (!confirmed) return;

    try {
      setActionLoading(true);
      setMessage("");

      const { error } = await supabase
        .from("teacher_duty_roster")
        .delete()
        .eq("id", row.id);

      if (error) throw error;

      await reloadRoster();

      setMessage("Duty assignment deleted.");
      setMessageType("success");
    } catch (error: any) {
      console.error(error);
      setMessage(error?.message || "Failed to delete duty assignment.");
      setMessageType("error");
    } finally {
      setActionLoading(false);
    }
  }

  if (loading) {
    return (
      <main style={loadingPageStyle}>
        <div style={loadingCardStyle}>Loading duty roster...</div>
      </main>
    );
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        background: COLORS.bg,
        fontFamily: "Arial, sans-serif",
        color: COLORS.text,
        padding: "12px",
      }}
    >
      <div style={{ maxWidth: "1100px", margin: "0 auto" }}>
        <div style={headerStyle}>
          <div style={headerFlexStyle}>
            <div>
              <p style={eyebrowStyle}>Admin Panel</p>
              <h1 style={{ margin: "4px 0 0", fontSize: "24px", lineHeight: 1.1 }}>
                Duty Roster
              </h1>
              <p style={headerNameStyle}>Assign weekly teacher duty</p>
            </div>

            <div style={headerRightStyle}>
              <Link href="/teacher-attendance" style={topButtonStyle}>
                Back
              </Link>
              <button onClick={() => window.print()} style={topButtonStyle}>
                Print
              </button>
            </div>
          </div>
        </div>

        {message && <MessageBox message={message} messageType={messageType} />}

        <div style={gridStyle}>
          <section style={sectionCardStyle}>
            <h3 style={sectionTitleStyle}>Assign Teacher</h3>

            <div style={{ display: "grid", gap: "10px" }}>
              <label style={labelStyle}>
                Teacher
                <select
                  value={selectedTeacherId}
                  onChange={(e) => setSelectedTeacherId(e.target.value)}
                  style={inputStyle}
                >
                  <option value="">Select teacher</option>
                  {teachers.map((teacher) => {
                    const teacherId = getTeacherId(teacher);

                    return (
                      <option key={teacherId} value={teacherId}>
                        {getTeacherName(teacher)} {getTeacherClass(teacher) !== "-" ? `— ${getTeacherClass(teacher)}` : ""}
                      </option>
                    );
                  })}
                </select>
              </label>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                <label style={labelStyle}>
                  Week Start
                  <input
                    type="date"
                    value={weekStart}
                    onChange={(e) => setWeekStart(e.target.value)}
                    style={inputStyle}
                  />
                </label>

                <label style={labelStyle}>
                  Week End
                  <input
                    type="date"
                    value={weekEnd}
                    onChange={(e) => setWeekEnd(e.target.value)}
                    style={inputStyle}
                  />
                </label>
              </div>

              <label style={labelStyle}>
                Note
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Optional note"
                  style={{ ...inputStyle, minHeight: "82px", resize: "vertical" }}
                />
              </label>

              <button
                onClick={handleAssignDuty}
                disabled={actionLoading}
                style={{
                  ...primaryButtonStyle,
                  opacity: actionLoading ? 0.65 : 1,
                  cursor: actionLoading ? "not-allowed" : "pointer",
                }}
              >
                {actionLoading ? "Saving..." : "Assign Duty"}
              </button>
            </div>
          </section>

          <section style={sectionCardStyle}>
            <h3 style={sectionTitleStyle}>Selected Teacher</h3>

            {!selectedTeacher ? (
              <p style={{ margin: 0, color: COLORS.muted, fontSize: "13px" }}>
                No teacher selected yet.
              </p>
            ) : (
              <div style={teacherPreviewStyle}>
                <div>
                  <p style={{ margin: 0, fontWeight: 900, color: COLORS.dark }}>
                    {getTeacherName(selectedTeacher)}
                  </p>
                  <p style={{ margin: "5px 0 0", color: COLORS.muted, fontSize: "12px" }}>
                    ID: {getTeacherId(selectedTeacher)}
                  </p>
                  <p style={{ margin: "5px 0 0", color: COLORS.muted, fontSize: "12px" }}>
                    Class: {getTeacherClass(selectedTeacher)}
                  </p>
                </div>

                <span style={badgeStyle}>Ready</span>
              </div>
            )}

            <div style={{ height: "12px" }} />

            <div style={noticeStyle}>
              Duty week is automatically set from Monday to Sunday. You can still edit the end date manually.
            </div>
          </section>
        </div>

        <div style={{ height: "12px" }} />

        <section style={sectionCardStyle}>
          <div style={sectionTopStyle}>
            <div>
              <h3 style={sectionTitleStyle}>Duty Roster List</h3>
              <p style={smallTextStyle}>
                Showing all assigned duty records. Search by teacher, ID, or week.
              </p>
            </div>

            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search roster..."
              style={searchInputStyle}
            />
          </div>

          <div style={tableWrapStyle}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>Teacher</th>
                  <th style={thStyle}>Week Start</th>
                  <th style={thStyle}>Week End</th>
                  <th style={thStyle}>Note</th>
                  <th style={thStyle}>Action</th>
                </tr>
              </thead>

              <tbody>
                {filteredRoster.length === 0 ? (
                  <tr>
                    <td style={tdStyle} colSpan={5}>
                      No duty roster records found.
                    </td>
                  </tr>
                ) : (
                  filteredRoster.map((row) => (
                    <tr key={String(row.id)}>
                      <td style={tdStyle}>
                        <strong>{String(row.teacher_name || "Teacher")}</strong>
                        <div style={tinyMutedStyle}>{String(row.teacher_id || "-")}</div>
                      </td>
                      <td style={tdStyle}>{formatDate(row.week_start_date)}</td>
                      <td style={tdStyle}>{formatDate(row.week_end_date)}</td>
                      <td style={tdStyle}>{String(row.note || "-")}</td>
                      <td style={tdStyle}>
                        <button
                          onClick={() => handleDeleteDuty(row)}
                          disabled={actionLoading}
                          style={deleteButtonStyle}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div style={mobileListStyle}>
            {filteredRoster.length === 0 ? (
              <p style={{ margin: 0, color: COLORS.muted, fontSize: "13px" }}>
                No duty roster records found.
              </p>
            ) : (
              filteredRoster.map((row) => (
                <div key={String(row.id)} style={mobileCardStyle}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "10px" }}>
                    <div>
                      <strong>{String(row.teacher_name || "Teacher")}</strong>
                      <div style={tinyMutedStyle}>{String(row.teacher_id || "-")}</div>
                    </div>

                    <button
                      onClick={() => handleDeleteDuty(row)}
                      disabled={actionLoading}
                      style={deleteButtonStyle}
                    >
                      Delete
                    </button>
                  </div>

                  <div style={mobileMiniGridStyle}>
                    <MiniCard label="Start" value={formatDate(row.week_start_date)} />
                    <MiniCard label="End" value={formatDate(row.week_end_date)} />
                  </div>

                  {row.note && (
                    <p style={{ margin: "8px 0 0", color: COLORS.muted, fontSize: "12px" }}>
                      {String(row.note)}
                    </p>
                  )}
                </div>
              ))
            )}
          </div>
        </section>
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

function MiniCard({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        border: `1px solid ${COLORS.border}`,
        borderRadius: "10px",
        padding: "8px",
        background: "#fff",
      }}
    >
      <p style={{ margin: 0, color: COLORS.muted, fontSize: "10px" }}>{label}</p>
      <p style={{ margin: "4px 0 0", fontWeight: 800, fontSize: "12px" }}>{value}</p>
    </div>
  );
}

const loadingPageStyle: React.CSSProperties = {
  minHeight: "100vh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: COLORS.bg,
  fontFamily: "Arial, sans-serif",
  padding: "20px",
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
  borderRadius: "18px",
  padding: "16px",
  border: `2px solid ${COLORS.gold}`,
  boxShadow: "0 12px 24px rgba(0,0,0,0.10)",
  marginBottom: "12px",
};

const headerFlexStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: "10px",
  alignItems: "flex-start",
};

const eyebrowStyle: React.CSSProperties = {
  margin: 0,
  fontSize: "10px",
  textTransform: "uppercase",
  letterSpacing: "1px",
  color: "rgba(255,255,255,0.72)",
};

const headerNameStyle: React.CSSProperties = {
  margin: "5px 0 0",
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
  borderRadius: "9px",
  padding: "8px 11px",
  background: "rgba(255,255,255,0.06)",
  color: "#fff",
  fontWeight: 800,
  fontSize: "12px",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
};

const gridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1.2fr) minmax(280px, 0.8fr)",
  gap: "12px",
};

const sectionCardStyle: React.CSSProperties = {
  background: COLORS.card,
  borderRadius: "15px",
  border: `1px solid ${COLORS.border}`,
  boxShadow: "0 6px 16px rgba(0,0,0,0.04)",
  padding: "14px",
};

const sectionTitleStyle: React.CSSProperties = {
  marginTop: 0,
  marginBottom: "9px",
  color: COLORS.dark,
  fontSize: "17px",
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
  width: "100%",
  border: "none",
  background: COLORS.gold,
  color: COLORS.dark,
  borderRadius: "11px",
  padding: "12px",
  fontWeight: 900,
  fontSize: "14px",
};

const teacherPreviewStyle: React.CSSProperties = {
  border: `1px solid ${COLORS.border}`,
  borderRadius: "14px",
  padding: "12px",
  display: "flex",
  justifyContent: "space-between",
  gap: "10px",
  alignItems: "flex-start",
};

const badgeStyle: React.CSSProperties = {
  background: COLORS.successBg,
  color: COLORS.successText,
  padding: "5px 8px",
  borderRadius: "999px",
  fontSize: "11px",
  fontWeight: 900,
};

const noticeStyle: React.CSSProperties = {
  background: COLORS.infoBg,
  color: COLORS.infoText,
  borderRadius: "11px",
  padding: "10px",
  fontWeight: 700,
  fontSize: "12px",
  lineHeight: 1.5,
};

const sectionTopStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: "12px",
  alignItems: "flex-start",
  flexWrap: "wrap",
};

const smallTextStyle: React.CSSProperties = {
  margin: "-3px 0 8px",
  color: COLORS.muted,
  fontSize: "12px",
};

const searchInputStyle: React.CSSProperties = {
  width: "100%",
  maxWidth: "320px",
  border: `1px solid ${COLORS.border}`,
  borderRadius: "11px",
  padding: "10px 12px",
  outline: "none",
  fontSize: "13px",
};

const tableWrapStyle: React.CSSProperties = {
  width: "100%",
  overflowX: "auto",
};

const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  minWidth: "760px",
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

const tinyMutedStyle: React.CSSProperties = {
  color: COLORS.muted,
  fontSize: "11px",
  marginTop: "2px",
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

const mobileListStyle: React.CSSProperties = {
  display: "none",
  gap: "8px",
};

const mobileCardStyle: React.CSSProperties = {
  border: `1px solid ${COLORS.border}`,
  borderRadius: "12px",
  padding: "10px",
  background: "#fff",
};

const mobileMiniGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: "8px",
  marginTop: "8px",
};
