"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type AnyRow = Record<string, any>;

const SCHOOL_LAT = 5.144163;
const SCHOOL_LNG = -1.281675;
const ALLOWED_RADIUS_METERS = 180;
const MAX_GPS_ACCURACY_METERS = 100;

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

function formatDate(value?: string | null) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString();
}

function formatDateLong(value?: string | null) {
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

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString();
}

function formatTime(value?: string | null) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function getRole(row: AnyRow | null) {
  return String(row?.role || "").trim().toLowerCase();
}

function toIsoDate(date: Date) {
  return date.toISOString().slice(0, 10);
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

function nextWeekStart(date: Date) {
  const start = startOfWeekMonday(date);
  start.setDate(start.getDate() + 7);
  return start;
}

function nextWeekEnd(date: Date) {
  const start = nextWeekStart(date);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return end;
}

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
  const toRad = (n: number) => (n * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function getCurrentPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("This device does not support location access."));
      return;
    }

    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 20000,
      maximumAge: 0,
    });
  });
}

function getCheckInStatus(now: Date, isOnDuty: boolean) {
  const totalMinutes = now.getHours() * 60 + now.getMinutes();
  const deadline = 7 * 60 + 30;

  if (isOnDuty) {
    return totalMinutes < deadline ? "Present" : "Late";
  }

  return totalMinutes <= deadline ? "Present" : "Late";
}

function statusStyles(status?: string | null) {
  const s = String(status || "").trim().toLowerCase();

  if (s === "present" || s === "checked out") {
    return { bg: COLORS.successBg, color: COLORS.successText };
  }
  if (s === "late") {
    return { bg: COLORS.warningBg, color: COLORS.warningText };
  }
  if (s === "absent" || s === "missing checkout") {
    return { bg: COLORS.dangerBg, color: COLORS.dangerText };
  }

  return { bg: COLORS.infoBg, color: COLORS.infoText };
}

export default function TeacherAttendancePage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [teacherRow, setTeacherRow] = useState<AnyRow | null>(null);
  const [settingsRow, setSettingsRow] = useState<AnyRow | null>(null);
  const [todayAttendance, setTodayAttendance] = useState<AnyRow | null>(null);
  const [attendanceHistory, setAttendanceHistory] = useState<AnyRow[]>([]);
  const [dutyThisWeek, setDutyThisWeek] = useState<AnyRow[]>([]);
  const [dutyNextWeek, setDutyNextWeek] = useState<AnyRow[]>([]);
  const [actionLoading, setActionLoading] = useState<"checkin" | "checkout" | "">("");
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error" | "info">("info");
  const [distanceMeters, setDistanceMeters] = useState<number | null>(null);
  const [gpsAccuracy, setGpsAccuracy] = useState<number | null>(null);

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

        const [teachersRes, settingsRes] = await Promise.all([
          supabase.from("teachers").select("*"),
          supabase.from("school_settings").select("*").limit(1).maybeSingle(),
        ]);

        if (!active) return;

        const teachers = teachersRes.data || [];
        const teacherError = teachersRes.error;

        if (teacherError || teachers.length === 0) {
          router.replace("/");
          return;
        }

        const matchedTeacher =
          teachers.find((item) => item.auth_user_id === session.user.id) ||
          teachers.find(
            (item) =>
              String(item.email || "").trim().toLowerCase() ===
              String(session.user.email || "").trim().toLowerCase()
          ) ||
          null;

        if (!matchedTeacher) {
          router.replace("/");
          return;
        }

        if (getRole(matchedTeacher) !== "teacher") {
          router.replace("/dashboard/admin");
          return;
        }

        const teacherId =
          String(matchedTeacher.teacher_id || "").trim() ||
          String(matchedTeacher.id || "").trim();

        const now = new Date();
        const today = toIsoDate(now);
        const weekStart = toIsoDate(startOfWeekMonday(now));
        const weekEnd = toIsoDate(endOfWeekSunday(now));
        const nextStart = toIsoDate(nextWeekStart(now));
        const nextEnd = toIsoDate(nextWeekEnd(now));

        const [todayRes, historyRes, dutyThisRes, dutyNextRes] = await Promise.all([
          supabase
            .from("teacher_attendance")
            .select("*")
            .eq("teacher_id", teacherId)
            .eq("attendance_date", today)
            .maybeSingle(),
          supabase
            .from("teacher_attendance")
            .select("*")
            .eq("teacher_id", teacherId)
            .order("attendance_date", { ascending: false })
            .limit(30),
          supabase
            .from("teacher_duty_roster")
            .select("*")
            .eq("teacher_id", teacherId)
            .gte("week_start_date", weekStart)
            .lte("week_start_date", weekEnd)
            .order("week_start_date", { ascending: true }),
          supabase
            .from("teacher_duty_roster")
            .select("*")
            .eq("teacher_id", teacherId)
            .gte("week_start_date", nextStart)
            .lte("week_start_date", nextEnd)
            .order("week_start_date", { ascending: true }),
        ]);

        if (!active) return;

        setTeacherRow(matchedTeacher);
        setSettingsRow(settingsRes.data || null);
        setTodayAttendance(todayRes.data || null);
        setAttendanceHistory(historyRes.data || []);
        setDutyThisWeek(dutyThisRes.data || []);
        setDutyNextWeek(dutyNextRes.data || []);
      } catch (error) {
        console.error(error);
        setMessage("Failed to load attendance page.");
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

  const teacherId = useMemo(() => {
    if (!teacherRow) return "";
    return String(teacherRow.teacher_id || "").trim() || String(teacherRow.id || "").trim();
  }, [teacherRow]);

  const teacherName = useMemo(() => String(teacherRow?.full_name || "Teacher"), [teacherRow]);

  const academicYear = String(settingsRow?.academic_year || "");
  const currentTerm = String(settingsRow?.current_term || "");
  const todayLong = formatDateLong(new Date().toISOString());

  const isOnDutyThisWeek = dutyThisWeek.length > 0;
  const isOnDutyNextWeek = dutyNextWeek.length > 0;

  const canCheckIn = !todayAttendance?.check_in_time;
  const canCheckOut = Boolean(todayAttendance?.check_in_time) && !todayAttendance?.check_out_time;

  async function reloadAttendanceData() {
    if (!teacherId) return;

    const now = new Date();
    const today = toIsoDate(now);

    const [todayRes, historyRes] = await Promise.all([
      supabase
        .from("teacher_attendance")
        .select("*")
        .eq("teacher_id", teacherId)
        .eq("attendance_date", today)
        .maybeSingle(),
      supabase
        .from("teacher_attendance")
        .select("*")
        .eq("teacher_id", teacherId)
        .order("attendance_date", { ascending: false })
        .limit(30),
    ]);

    setTodayAttendance(todayRes.data || null);
    setAttendanceHistory(historyRes.data || []);
  }

  async function readLocationAndValidate(mode: "checkin" | "checkout") {
    try {
      const position = await getCurrentPosition();
      const lat = position.coords.latitude;
      const lng = position.coords.longitude;
      const accuracy = Number(position.coords.accuracy || 0);
      const distance = haversineMeters(lat, lng, SCHOOL_LAT, SCHOOL_LNG);

      setDistanceMeters(distance);
      setGpsAccuracy(accuracy);

      if (!Number.isFinite(accuracy) || accuracy > MAX_GPS_ACCURACY_METERS) {
        return {
          ok: false as const,
          error: `Location not accurate enough yet. Current GPS accuracy is ${Math.round(
            accuracy || 0
          )}m. Use a phone, move to an open area, and try again.`,
        };
      }

      if (distance > ALLOWED_RADIUS_METERS) {
        return {
          ok: false as const,
          error: `You must be on school premises to ${
            mode === "checkin" ? "check in" : "check out"
          }. Distance: ${Math.round(distance)}m`,
        };
      }

      return {
        ok: true as const,
        lat,
        lng,
      };
    } catch (error: any) {
      return {
        ok: false as const,
        error: error?.message || "Unable to get location.",
      };
    }
  }

  async function handleCheckIn() {
    if (!teacherId) return;

    try {
      setActionLoading("checkin");
      setMessage("");

      const locationResult = await readLocationAndValidate("checkin");

      if (!locationResult.ok) {
        setMessage(locationResult.error);
        setMessageType("error");
        return;
      }

      const { lat, lng } = locationResult;

      const now = new Date();
      const attendanceDate = toIsoDate(now);
      const checkInTime = now.toISOString();
      const checkInStatus = getCheckInStatus(now, isOnDutyThisWeek);

      const payload = {
        teacher_id: teacherId,
        teacher_name: teacherName,
        attendance_date: attendanceDate,
        check_in_time: checkInTime,
        check_in_status: checkInStatus,
        is_on_duty: isOnDutyThisWeek,
        latitude: lat,
        longitude: lng,
        marked_by: teacherName,
      };

      const { error } = await supabase
        .from("teacher_attendance")
        .upsert(payload, { onConflict: "teacher_id,attendance_date" });

      if (error) throw error;

      await reloadAttendanceData();

      setMessage(
        checkInStatus === "Late"
          ? "Check-in recorded. You are marked late."
          : "Check-in recorded successfully."
      );
      setMessageType(checkInStatus === "Late" ? "info" : "success");
    } catch (error: any) {
      console.error(error);
      setMessage(error?.message || "Check-in failed.");
      setMessageType("error");
    } finally {
      setActionLoading("");
    }
  }

  async function handleCheckOut() {
    if (!teacherId || !todayAttendance?.id) return;

    try {
      setActionLoading("checkout");
      setMessage("");

      const locationResult = await readLocationAndValidate("checkout");

      if (!locationResult.ok) {
        setMessage(locationResult.error);
        setMessageType("error");
        return;
      }

      const { lat, lng } = locationResult;

      const now = new Date();
      const checkOutTime = now.toISOString();

      const { error } = await supabase
        .from("teacher_attendance")
        .update({
          check_out_time: checkOutTime,
          latitude: lat,
          longitude: lng,
        })
        .eq("id", todayAttendance.id);

      if (error) throw error;

      await reloadAttendanceData();

      setMessage("Check-out recorded successfully.");
      setMessageType("success");
    } catch (error: any) {
      console.error(error);
      setMessage(error?.message || "Check-out failed.");
      setMessageType("error");
    } finally {
      setActionLoading("");
    }
  }

  if (loading) {
    return (
      <main style={loadingPageStyle}>
        <div style={loadingCardStyle}>Loading teacher attendance...</div>
      </main>
    );
  }

  const todayStatusStyle = statusStyles(todayAttendance?.check_in_status);

  return (
    <main
      style={{
        minHeight: "100vh",
        background: COLORS.bg,
        fontFamily: "Arial, sans-serif",
        color: COLORS.text,
        padding: "10px",
      }}
    >
      <div style={{ maxWidth: "500px", margin: "0 auto" }}>
        <div
          style={{
            background: `linear-gradient(135deg, ${COLORS.dark} 0%, ${COLORS.darkSoft} 100%)`,
            color: "#fff",
            borderRadius: "16px",
            padding: "12px 14px",
            border: `2px solid ${COLORS.gold}`,
            boxShadow: "0 12px 24px rgba(0,0,0,0.10)",
            marginBottom: "10px",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: "10px",
              alignItems: "flex-start",
            }}
          >
            <div style={{ minWidth: 0, flex: 1 }}>
              <p
                style={{
                  margin: 0,
                  fontSize: "10px",
                  textTransform: "uppercase",
                  letterSpacing: "1px",
                  color: "rgba(255,255,255,0.72)",
                }}
              >
                Teacher Attendance
              </p>
              <h1 style={{ margin: "4px 0 0", fontSize: "23px", lineHeight: 1.05 }}>
                My Attendance
              </h1>
              <p
                style={{
                  margin: "4px 0 0",
                  color: "rgba(255,255,255,0.92)",
                  fontSize: "13px",
                  fontWeight: 700,
                }}
              >
                {teacherName}
              </p>
            </div>

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-end",
                gap: "5px",
                flexShrink: 0,
              }}
            >
              <Link href="/dashboard/teacher" style={topButtonStyle}>
                Back
              </Link>

              <div
                style={{
                  textAlign: "right",
                  fontSize: "11px",
                  lineHeight: 1.35,
                  color: "rgba(255,255,255,0.82)",
                }}
              >
                <div>{todayLong}</div>
                <div style={{ color: "#f5e7b7", fontWeight: 700 }}>
                  {academicYear}
                  {academicYear && currentTerm ? " • " : ""}
                  {currentTerm}
                </div>
              </div>
            </div>
          </div>
        </div>

        {message && (
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
              borderRadius: "10px",
              padding: "11px 13px",
              marginBottom: "10px",
              fontWeight: 700,
              fontSize: "14px",
            }}
          >
            {message}
          </div>
        )}

        <div style={sectionCardStyle}>
          <h3 style={sectionTitleStyle}>Duty Notice</h3>

          {isOnDutyThisWeek ? (
            <div style={warningNoticeStyle}>
              You are on duty this week. Check-in must be before 7:30 AM.
            </div>
          ) : (
            <div style={infoNoticeStyle}>You are not on duty this week.</div>
          )}

          {dutyThisWeek.length > 0 && (
            <div style={noticeMetaStyle}>
              This week: {formatDate(dutyThisWeek[0]?.week_start_date)} -{" "}
              {formatDate(dutyThisWeek[0]?.week_end_date)}
            </div>
          )}

          {isOnDutyNextWeek && (
            <>
              <div style={{ ...infoNoticeStyle, marginTop: "7px" }}>
                You are scheduled for duty next week.
              </div>
              <div style={noticeMetaStyle}>
                Next week: {formatDate(dutyNextWeek[0]?.week_start_date)} -{" "}
                {formatDate(dutyNextWeek[0]?.week_end_date)}
              </div>
            </>
          )}
        </div>

        <div style={{ height: "8px" }} />

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
            gap: "8px",
            marginBottom: "10px",
          }}
        >
          <MiniCard
            label="Status"
            value={todayAttendance?.check_in_status || "Not Marked"}
            badge={todayStatusStyle}
          />
          <MiniCard label="Check In" value={formatTime(todayAttendance?.check_in_time)} />
          <MiniCard label="Check Out" value={formatTime(todayAttendance?.check_out_time)} />
          <MiniCard
            label="Distance"
            value={distanceMeters === null ? "-" : `${Math.round(distanceMeters)}m`}
          />
        </div>

        <div style={sectionCardStyle}>
          <h3 style={sectionTitleStyle}>Today's Actions</h3>

          <div style={{ display: "grid", gap: "8px" }}>
            <button
              onClick={handleCheckIn}
              disabled={!canCheckIn || actionLoading !== ""}
              style={{
                ...bigPrimaryButtonStyle,
                opacity: !canCheckIn || actionLoading !== "" ? 0.55 : 1,
                cursor: !canCheckIn || actionLoading !== "" ? "not-allowed" : "pointer",
              }}
            >
              {actionLoading === "checkin" ? "Checking In..." : "Check In"}
            </button>

            <button
              onClick={handleCheckOut}
              disabled={!canCheckOut || actionLoading !== ""}
              style={{
                ...bigSecondaryButtonStyle,
                opacity: !canCheckOut || actionLoading !== "" ? 0.55 : 1,
                cursor: !canCheckOut || actionLoading !== "" ? "not-allowed" : "pointer",
              }}
            >
              {actionLoading === "checkout" ? "Checking Out..." : "Check Out"}
            </button>
          </div>

          <div
            style={{
              marginTop: "9px",
              fontSize: "12px",
              color: COLORS.muted,
              lineHeight: 1.45,
            }}
          >
            Check-in and check-out work only inside the school radius of{" "}
            <strong>{ALLOWED_RADIUS_METERS} meters</strong>.
          </div>

          {gpsAccuracy !== null && (
            <div style={{ marginTop: "5px", fontSize: "11px", color: COLORS.muted }}>
              GPS accuracy: {Math.round(gpsAccuracy)}m
            </div>
          )}
        </div>

        <div style={{ height: "8px" }} />

        <div style={sectionCardStyle}>
          <h3 style={sectionTitleStyle}>Attendance History</h3>

          {attendanceHistory.length === 0 ? (
            <p style={{ margin: 0, color: COLORS.muted, fontSize: "13px" }}>
              No attendance history yet.
            </p>
          ) : (
            <div style={{ display: "grid", gap: "8px" }}>
              {attendanceHistory.map((row) => {
                const rowStatusStyle = statusStyles(row.check_in_status);

                return (
                  <div
                    key={String(row.id)}
                    style={{
                      border: `1px solid ${COLORS.border}`,
                      borderRadius: "10px",
                      padding: "10px",
                      background: "#fff",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: "8px",
                        alignItems: "center",
                        marginBottom: "7px",
                      }}
                    >
                      <strong style={{ fontSize: "13px" }}>{formatDate(row.attendance_date)}</strong>
                      <span
                        style={{
                          background: rowStatusStyle.bg,
                          color: rowStatusStyle.color,
                          padding: "4px 8px",
                          borderRadius: "999px",
                          fontSize: "10px",
                          fontWeight: 700,
                        }}
                      >
                        {String(row.check_in_status || "No Status")}
                      </span>
                    </div>

                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                        gap: "7px",
                      }}
                    >
                      <MiniCard label="In" value={formatTime(row.check_in_time)} compact />
                      <MiniCard label="Out" value={formatTime(row.check_out_time)} compact />
                      <MiniCard label="Duty" value={row.is_on_duty ? "Yes" : "No"} compact />
                      <MiniCard label="Time" value={formatDateTime(row.check_in_time)} compact />
                    </div>

                    {row.note && (
                      <div style={{ marginTop: "7px", color: COLORS.muted, fontSize: "11px" }}>
                        {String(row.note)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

function MiniCard({
  label,
  value,
  badge,
  compact = false,
}: {
  label: string;
  value: string;
  badge?: { bg: string; color: string };
  compact?: boolean;
}) {
  return (
    <div
      style={{
        background: COLORS.card,
        borderRadius: compact ? "9px" : "10px",
        border: `1px solid ${COLORS.border}`,
        boxShadow: compact ? "none" : "0 4px 12px rgba(0,0,0,0.03)",
        padding: compact ? "8px 9px" : "9px 10px",
        minHeight: compact ? "auto" : "64px",
      }}
    >
      <p
        style={{
          margin: 0,
          fontSize: compact ? "10px" : "11px",
          color: COLORS.muted,
        }}
      >
        {label}
      </p>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: "6px",
          alignItems: "center",
        }}
      >
        <p
          style={{
            margin: "4px 0 0",
            fontWeight: 800,
            color: COLORS.dark,
            fontSize: compact ? "12px" : "16px",
            lineHeight: 1.2,
          }}
        >
          {value}
        </p>

        {badge && (
          <span
            style={{
              background: badge.bg,
              color: badge.color,
              padding: "3px 6px",
              borderRadius: "999px",
              fontSize: "10px",
              fontWeight: 700,
              marginTop: "4px",
            }}
          >
            •
          </span>
        )}
      </div>
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

const topButtonStyle: React.CSSProperties = {
  textDecoration: "none",
  border: "1px solid rgba(255,255,255,0.15)",
  borderRadius: "9px",
  padding: "7px 10px",
  background: "rgba(255,255,255,0.06)",
  color: "#fff",
  fontWeight: 700,
  fontSize: "12px",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
};

const sectionCardStyle: React.CSSProperties = {
  background: COLORS.card,
  borderRadius: "14px",
  border: `1px solid ${COLORS.border}`,
  boxShadow: "0 6px 16px rgba(0,0,0,0.04)",
  padding: "12px",
};

const sectionTitleStyle: React.CSSProperties = {
  marginTop: 0,
  marginBottom: "9px",
  color: COLORS.dark,
  fontSize: "16px",
};

const bigPrimaryButtonStyle: React.CSSProperties = {
  width: "100%",
  border: "none",
  background: COLORS.gold,
  color: COLORS.dark,
  borderRadius: "10px",
  padding: "12px",
  fontWeight: 800,
  fontSize: "15px",
};

const bigSecondaryButtonStyle: React.CSSProperties = {
  width: "100%",
  border: `1px solid ${COLORS.border}`,
  background: "#fff",
  color: COLORS.dark,
  borderRadius: "10px",
  padding: "12px",
  fontWeight: 800,
  fontSize: "15px",
};

const warningNoticeStyle: React.CSSProperties = {
  background: COLORS.warningBg,
  color: COLORS.warningText,
  borderRadius: "9px",
  padding: "9px 10px",
  fontWeight: 700,
  fontSize: "13px",
};

const infoNoticeStyle: React.CSSProperties = {
  background: COLORS.infoBg,
  color: COLORS.infoText,
  borderRadius: "9px",
  padding: "9px 10px",
  fontWeight: 700,
  fontSize: "13px",
};

const noticeMetaStyle: React.CSSProperties = {
  fontSize: "11px",
  color: COLORS.muted,
  marginTop: "5px",
};
