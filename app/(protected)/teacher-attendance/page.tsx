"use client";

import type React from "react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { authedFetch } from "@/lib/apiClient";
import { fetchWithCache } from "@/lib/offline/cachedQuery";
import { useModuleLoadBadge } from "@/lib/offline/useModulePrefetch";
import ModuleDownloadBadge from "@/app/components/ModuleDownloadBadge";
import { haversineMeters } from "@/lib/geo";

const OFFLINE_MODULE = "teacher-attendance";
import {
  getGhanaDateString,
  getGhanaEndOfWeekSunday,
  getGhanaNextWeekEnd,
  getGhanaNextWeekStart,
  getGhanaStartOfWeekMonday,
} from "@/lib/ghanaTime";

type AnyRow = Record<string, any>;

type AttendanceLocationSettings = {
  schoolLat: number;
  schoolLng: number;
  allowedRadiusMeters: number;
  maxGpsAccuracyMeters: number;
};

const DEFAULT_ATTENDANCE_SETTINGS: AttendanceLocationSettings = {
  schoolLat: 5.144163,
  schoolLng: -1.281675,
  allowedRadiusMeters: 180,
  maxGpsAccuracyMeters: 100,
};

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

function isAdminRole(role: string) {
  return role === "admin" || role === "super_admin" || role === "superadmin";
}

function isTeacherRole(role: string) {
  return role === "teacher";
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

function statusStyles(status?: string | null) {
  const s = String(status || "").trim().toLowerCase();

  if (s === "present" || s === "checked out") {
    return { bg: COLORS.successBg, color: COLORS.successText };
  }

  if (s === "late") {
    return { bg: COLORS.warningBg, color: COLORS.warningText };
  }

  if (s === "absent" || s === "missing checkout" || s === "not marked") {
    return { bg: COLORS.dangerBg, color: COLORS.dangerText };
  }

  return { bg: COLORS.infoBg, color: COLORS.infoText };
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

function getAttendanceLocationSettings(row: AnyRow | null): AttendanceLocationSettings {
  if (!row) return DEFAULT_ATTENDANCE_SETTINGS;

  return {
    schoolLat: Number(row.school_lat ?? DEFAULT_ATTENDANCE_SETTINGS.schoolLat),
    schoolLng: Number(row.school_lng ?? DEFAULT_ATTENDANCE_SETTINGS.schoolLng),
    allowedRadiusMeters: Number(
      row.allowed_radius_meters ?? DEFAULT_ATTENDANCE_SETTINGS.allowedRadiusMeters
    ),
    maxGpsAccuracyMeters: Number(
      row.max_gps_accuracy_meters ?? DEFAULT_ATTENDANCE_SETTINGS.maxGpsAccuracyMeters
    ),
  };
}

const AUTO_REFRESH_MS = 30000;

export default function TeacherAttendancePage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [currentUserRow, setCurrentUserRow] = useState<AnyRow | null>(null);
  const [settingsRow, setSettingsRow] = useState<AnyRow | null>(null);
  const [attendanceSettings, setAttendanceSettings] =
    useState<AttendanceLocationSettings>(DEFAULT_ATTENDANCE_SETTINGS);

  const [allTeachers, setAllTeachers] = useState<AnyRow[]>([]);
  const [todayAllAttendance, setTodayAllAttendance] = useState<AnyRow[]>([]);
  const [todayAttendance, setTodayAttendance] = useState<AnyRow | null>(null);
  const [attendanceHistory, setAttendanceHistory] = useState<AnyRow[]>([]);
  const [dutyThisWeek, setDutyThisWeek] = useState<AnyRow[]>([]);
  const [dutyNextWeek, setDutyNextWeek] = useState<AnyRow[]>([]);

  const [actionLoading, setActionLoading] = useState<"checkin" | "checkout" | "">("");
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error" | "info">("info");
  const [distanceMeters, setDistanceMeters] = useState<number | null>(null);
  const [gpsAccuracy, setGpsAccuracy] = useState<number | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const [showingCachedData, setShowingCachedData] = useState(false);

  const currentUserRowRef = useRef<AnyRow | null>(null);
  const roleRef = useRef<string>("");
  const teacherIdRef = useRef<string>("");

  const fetchAllData = useCallback(async (isBackground: boolean) => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.user) {
        if (!isBackground) router.replace("/");
        return;
      }

      const [teachersRes, settingsRes, attendanceSettingsRes] = await Promise.all([
        fetchWithCache(OFFLINE_MODULE, "teachers", () => supabase.from("teachers").select("*"), [] as AnyRow[]),
        fetchWithCache(OFFLINE_MODULE, "school_settings", () => supabase.from("school_settings").select("*").limit(1).maybeSingle(), null as any),
        fetchWithCache(OFFLINE_MODULE, "teacher_attendance_settings", () => supabase.from("teacher_attendance_settings").select("*").limit(1).maybeSingle(), null as any),
      ]);

      const teachers = teachersRes.data || [];

      const matchedUser =
        teachers.find((item) => item.auth_user_id === session.user.id) ||
        teachers.find(
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

      const today = getGhanaDateString();
      const weekStart = getGhanaStartOfWeekMonday(today);
      const weekEnd = getGhanaEndOfWeekSunday(today);
      const nextStart = getGhanaNextWeekStart(today);
      const nextEnd = getGhanaNextWeekEnd(today);

      const realTeachers = teachers.filter((item) => isTeacherRole(getRole(item)));

      setCurrentUserRow(finalUser);
      currentUserRowRef.current = finalUser;
      roleRef.current = role;
      setSettingsRow(settingsRes.data || null);
      setAttendanceSettings(getAttendanceLocationSettings(attendanceSettingsRes.data || null));
      setAllTeachers(realTeachers);

      if (isAdminRole(role)) {
        const [todayAllRes, dutyThisRes, dutyNextRes] = await Promise.all([
          fetchWithCache(
            OFFLINE_MODULE,
            `teacher_attendance:${today}`,
            () => supabase.from("teacher_attendance").select("*").eq("attendance_date", today).order("teacher_name", { ascending: true }),
            [] as AnyRow[]
          ),
          fetchWithCache(
            OFFLINE_MODULE,
            `duty_roster:this:${weekStart}`,
            () => supabase.from("teacher_duty_roster").select("*").gte("week_start_date", weekStart).lte("week_start_date", weekEnd).order("week_start_date", { ascending: true }),
            [] as AnyRow[]
          ),
          fetchWithCache(
            OFFLINE_MODULE,
            `duty_roster:next:${nextStart}`,
            () => supabase.from("teacher_duty_roster").select("*").gte("week_start_date", nextStart).lte("week_start_date", nextEnd).order("week_start_date", { ascending: true }),
            [] as AnyRow[]
          ),
        ]);

        setTodayAllAttendance(todayAllRes.data || []);
        setDutyThisWeek(dutyThisRes.data || []);
        setDutyNextWeek(dutyNextRes.data || []);
        setLastSyncedAt(new Date());
        setShowingCachedData([teachersRes, settingsRes, attendanceSettingsRes, todayAllRes, dutyThisRes, dutyNextRes].some((r) => r.fromCache));
        return;
      }

      if (!isTeacherRole(role)) {
        if (!isBackground) router.replace("/dashboard");
        return;
      }

      const teacherId = getTeacherId(finalUser);
      teacherIdRef.current = teacherId;

      const [todayRes, historyRes, dutyThisRes, dutyNextRes] = await Promise.all([
        fetchWithCache(
          OFFLINE_MODULE,
          `teacher_attendance:${teacherId}:${today}`,
          () => supabase.from("teacher_attendance").select("*").eq("teacher_id", teacherId).eq("attendance_date", today).maybeSingle(),
          null as any
        ),
        fetchWithCache(
          OFFLINE_MODULE,
          `teacher_attendance_history:${teacherId}`,
          () => supabase.from("teacher_attendance").select("*").eq("teacher_id", teacherId).order("attendance_date", { ascending: false }).limit(30),
          [] as AnyRow[]
        ),
        fetchWithCache(
          OFFLINE_MODULE,
          `duty_roster:${teacherId}:this:${weekStart}`,
          () => supabase.from("teacher_duty_roster").select("*").eq("teacher_id", teacherId).gte("week_start_date", weekStart).lte("week_start_date", weekEnd).order("week_start_date", { ascending: true }),
          [] as AnyRow[]
        ),
        fetchWithCache(
          OFFLINE_MODULE,
          `duty_roster:${teacherId}:next:${nextStart}`,
          () => supabase.from("teacher_duty_roster").select("*").eq("teacher_id", teacherId).gte("week_start_date", nextStart).lte("week_start_date", nextEnd).order("week_start_date", { ascending: true }),
          [] as AnyRow[]
        ),
      ]);

      setTodayAttendance(todayRes.data || null);
      setAttendanceHistory(historyRes.data || []);
      setDutyThisWeek(dutyThisRes.data || []);
      setDutyNextWeek(dutyNextRes.data || []);
      setLastSyncedAt(new Date());
      setShowingCachedData([teachersRes, settingsRes, attendanceSettingsRes, todayRes, historyRes, dutyThisRes, dutyNextRes].some((r) => r.fromCache));
    } catch (error) {
      console.error(error);
      if (!isBackground) {
        setMessage("Failed to load attendance page.");
        setMessageType("error");
      }
    } finally {
      if (!isBackground) setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    let active = true;

    (async () => {
      if (!active) return;
      await fetchAllData(false);
    })();

    return () => {
      active = false;
    };
  }, [fetchAllData]);

  useEffect(() => {
    const attendanceChannel = supabase
      .channel("teacher_attendance_live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "teacher_attendance" },
        () => {
          void fetchAllData(true);
        }
      )
      .subscribe();

    const dutyChannel = supabase
      .channel("teacher_duty_roster_live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "teacher_duty_roster" },
        () => {
          void fetchAllData(true);
        }
      )
      .subscribe();

    const teachersChannel = supabase
      .channel("teachers_live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "teachers" },
        () => {
          void fetchAllData(true);
        }
      )
      .subscribe();

    const settingsChannel = supabase
      .channel("attendance_settings_live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "teacher_attendance_settings" },
        () => {
          void fetchAllData(true);
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "school_settings" },
        () => {
          void fetchAllData(true);
        }
      )
      .subscribe();

    const intervalId = window.setInterval(() => {
      void fetchAllData(true);
    }, AUTO_REFRESH_MS);

    function onVisibilityChange() {
      if (document.visibilityState === "visible") {
        void fetchAllData(true);
      }
    }

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("focus", onVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("focus", onVisibilityChange);
      supabase.removeChannel(attendanceChannel);
      supabase.removeChannel(dutyChannel);
      supabase.removeChannel(teachersChannel);
      supabase.removeChannel(settingsChannel);
    };
  }, [fetchAllData]);

  const role = getRole(currentUserRow);
  const teacherId = useMemo(() => getTeacherId(currentUserRow), [currentUserRow]);
  const teacherName = useMemo(() => getTeacherName(currentUserRow), [currentUserRow]);

  const academicYear = String(settingsRow?.academic_year || "");
  const currentTerm = String(settingsRow?.current_term || "");
  const todayLong = formatDateLong(new Date().toISOString());

  const isOnDutyThisWeek = dutyThisWeek.some((row) => String(row.teacher_id) === String(teacherId));
  const isOnDutyNextWeek = dutyNextWeek.some((row) => String(row.teacher_id) === String(teacherId));

  const canCheckIn = !todayAttendance?.check_in_time;
  const canCheckOut = Boolean(todayAttendance?.check_in_time) && !todayAttendance?.check_out_time;

  async function reloadAttendanceData() {
    if (!teacherId) return;

    const today = getGhanaDateString();

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
    setLastSyncedAt(new Date());
  }

  async function readLocationAndValidate(mode: "checkin" | "checkout") {
    try {
      const position = await getCurrentPosition();
      const lat = position.coords.latitude;
      const lng = position.coords.longitude;
      const accuracy = Number(position.coords.accuracy || 0);

      const distance = haversineMeters(
        lat,
        lng,
        attendanceSettings.schoolLat,
        attendanceSettings.schoolLng
      );

      setDistanceMeters(distance);
      setGpsAccuracy(accuracy);

      if (!Number.isFinite(accuracy) || accuracy > attendanceSettings.maxGpsAccuracyMeters) {
        return {
          ok: false as const,
          error: `Location not accurate enough yet. Current GPS accuracy is ${Math.round(
            accuracy || 0
          )}m. Use a phone, move to an open area, and try again.`,
        };
      }

      if (distance > attendanceSettings.allowedRadiusMeters) {
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
        accuracy,
      };
    } catch (error: any) {
      return {
        ok: false as const,
        error: error?.message || "Unable to get location.",
      };
    }
  }

  // Check-in/out now go through server API routes (see
  // app/api/teacher-attendance/check-in and /check-out) instead of writing
  // straight to Supabase from the browser. The server resolves the teacher
  // identity from the authenticated session and re-validates the geofence,
  // rather than trusting a client-supplied teacher_id/pass-fail judgment.
  // readLocationAndValidate above still runs first purely so the UI can show
  // an immediate "you're too far away" message without a network round trip.
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

      const { lat, lng, accuracy } = locationResult;

      const response = await authedFetch("/api/teacher-attendance/check-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ latitude: lat, longitude: lng, accuracy }),
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(result?.error || "Check-in failed.");
      }

      await reloadAttendanceData();

      const resultMessage = String(result?.message || "Check-in recorded successfully.");
      setMessage(resultMessage);
      setMessageType(resultMessage.toLowerCase().includes("late") ? "info" : "success");
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

      const { lat, lng, accuracy } = locationResult;

      const response = await authedFetch("/api/teacher-attendance/check-out", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ latitude: lat, longitude: lng, accuracy }),
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(result?.error || "Check-out failed.");
      }

      await reloadAttendanceData();

      setMessage(String(result?.message || "Check-out recorded successfully."));
      setMessageType("success");
    } catch (error: any) {
      console.error(error);
      setMessage(error?.message || "Check-out failed.");
      setMessageType("error");
    } finally {
      setActionLoading("");
    }
  }

  const moduleDownloadStatus = useModuleLoadBadge(loading);

  if (loading) {
    return (
      <main style={loadingPageStyle}>
        <div style={loadingCardStyle}>Loading teacher attendance...</div>
      </main>
    );
  }

  if (isAdminRole(role)) {
    return (
      <AdminTeacherAttendanceView
        currentUserRow={currentUserRow}
        settingsRow={settingsRow}
        teachers={allTeachers}
        todayAttendance={todayAllAttendance}
        dutyThisWeek={dutyThisWeek}
        dutyNextWeek={dutyNextWeek}
        attendanceSettings={attendanceSettings}
        lastSyncedAt={lastSyncedAt}
        showingCachedData={showingCachedData}
        moduleDownloadStatus={moduleDownloadStatus}
      />
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
      <ModuleDownloadBadge status={moduleDownloadStatus} label="Teacher Attendance" />
      <div style={{ maxWidth: "500px", margin: "0 auto" }}>
        <div style={teacherHeaderStyle}>
          <div style={headerFlexStyle}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <p style={eyebrowStyle}>Teacher Attendance</p>
              <h1 style={{ margin: "4px 0 0", fontSize: "23px", lineHeight: 1.05 }}>
                My Attendance
              </h1>
              <p style={headerNameStyle}>{teacherName}</p>
            </div>

            <div style={headerRightStyle}>
              <Link href="/dashboard/teacher" style={topButtonStyle}>
                Back
              </Link>

              <div style={headerDateStyle}>
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

        {message && <MessageBox message={message} messageType={messageType} />}

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

        <div style={miniGridStyle}>
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

          <div style={smallInfoStyle}>
            Check-in and check-out work only inside the school radius of{" "}
            <strong>{attendanceSettings.allowedRadiusMeters} meters</strong>.
          </div>

          {gpsAccuracy !== null && (
            <div style={{ marginTop: "5px", fontSize: "11px", color: COLORS.muted }}>
              GPS accuracy: {Math.round(gpsAccuracy)}m
            </div>
          )}

          {lastSyncedAt && (
            <div style={{ marginTop: "5px", fontSize: "11px", color: COLORS.muted }}>
              Last synced: {formatTime(lastSyncedAt.toISOString())}
            </div>
          )}
        </div>

        <div style={{ height: "8px" }} />

        <TeacherHistoryCard attendanceHistory={attendanceHistory} />
      </div>
    </main>
  );
}

function AdminTeacherAttendanceView({
  currentUserRow,
  settingsRow,
  teachers,
  todayAttendance,
  dutyThisWeek,
  dutyNextWeek,
  attendanceSettings,
  lastSyncedAt,
  showingCachedData,
  moduleDownloadStatus,
}: {
  currentUserRow: AnyRow | null;
  settingsRow: AnyRow | null;
  teachers: AnyRow[];
  todayAttendance: AnyRow[];
  dutyThisWeek: AnyRow[];
  dutyNextWeek: AnyRow[];
  attendanceSettings: AttendanceLocationSettings;
  lastSyncedAt: Date | null;
  showingCachedData: boolean;
  moduleDownloadStatus: import("@/lib/offline/useModulePrefetch").ModulePrefetchStatus;
}) {
  const [search, setSearch] = useState("");

  const todayLong = formatDateLong(new Date().toISOString());
  const academicYear = String(settingsRow?.academic_year || "");
  const currentTerm = String(settingsRow?.current_term || "");
  const adminName = getTeacherName(currentUserRow);

  const attendanceByTeacherId = useMemo(() => {
    const map = new Map<string, AnyRow>();

    todayAttendance.forEach((row) => {
      const id = String(row.teacher_id || "").trim();
      if (id) map.set(id, row);
    });

    return map;
  }, [todayAttendance]);

  const rows = useMemo(() => {
    return teachers.map((teacher) => {
      const teacherId = getTeacherId(teacher);
      const attendance = attendanceByTeacherId.get(teacherId) || null;
      const isOnDuty = dutyThisWeek.some(
        (duty) => String(duty.teacher_id || "").trim() === String(teacherId)
      );

      let status = "Not Marked";

      if (attendance?.check_in_time) {
        status = String(attendance.check_in_status || "Present");
      }

      if (attendance?.check_out_time) {
        status = "Checked Out";
      }

      return {
        teacher,
        teacherId,
        attendance,
        isOnDuty,
        status,
      };
    });
  }, [teachers, attendanceByTeacherId, dutyThisWeek]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();

    if (!q) return rows;

    return rows.filter((row) => {
      const name = getTeacherName(row.teacher).toLowerCase();
      const classes = getTeacherClass(row.teacher).toLowerCase();
      const status = row.status.toLowerCase();

      return name.includes(q) || classes.includes(q) || status.includes(q);
    });
  }, [rows, search]);

  const totalTeachers = teachers.length;
  const checkedIn = rows.filter((row) => row.attendance?.check_in_time).length;
  const checkedOut = rows.filter((row) => row.attendance?.check_out_time).length;
  const late = rows.filter(
    (row) => String(row.attendance?.check_in_status || "").toLowerCase() === "late"
  ).length;
  const notMarked = Math.max(totalTeachers - checkedIn, 0);
  const onDutyThisWeek = dutyThisWeek.length;
  const onDutyNextWeek = dutyNextWeek.length;

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
      <ModuleDownloadBadge status={moduleDownloadStatus} label="Teacher Attendance" />
      <div style={{ maxWidth: "1150px", margin: "0 auto" }}>
        <div style={adminHeaderStyle}>
          <div style={headerFlexStyle}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <p style={eyebrowStyle}>Admin Panel</p>
              <h1 style={{ margin: "4px 0 0", fontSize: "24px", lineHeight: 1.05 }}>
                Teacher Attendance
              </h1>
              <p style={headerNameStyle}>Welcome, {adminName}</p>
            </div>

            <div style={headerRightStyle}>
              <Link href="/dashboard/admin" style={topButtonStyle}>
                Back
              </Link>

              <div style={headerDateStyle}>
                <div>{todayLong}</div>
                <div style={{ color: "#f5e7b7", fontWeight: 700 }}>
                  {academicYear}
                  {academicYear && currentTerm ? " • " : ""}
                  {currentTerm}
                </div>
                {lastSyncedAt && (
                  <div style={{ marginTop: "3px" }}>
                    Live • synced {formatTime(lastSyncedAt.toISOString())}
                  </div>
                )}
                {showingCachedData && (
                  <div style={{ marginTop: "3px" }}>Showing last synced data</div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div style={adminStatsGridStyle}>
          <AdminStatCard label="Total Teachers" value={String(totalTeachers)} tone="info" />
          <AdminStatCard label="Checked In" value={String(checkedIn)} tone="success" />
          <AdminStatCard label="Not Checked In" value={String(notMarked)} tone="danger" />
          <AdminStatCard label="Checked Out" value={String(checkedOut)} tone="success" />
          <AdminStatCard label="Late" value={String(late)} tone="warning" />
          <AdminStatCard label="On Duty This Week" value={String(onDutyThisWeek)} tone="info" />
        </div>

        <div style={{ height: "10px" }} />

        <div style={sectionCardStyle}>
          <div style={adminSectionTopStyle}>
            <div>
              <h3 style={sectionTitleStyle}>Quick Actions</h3>
              <p style={adminSubTextStyle}>
                Teachers are managed from JSMS. This side only monitors attendance and duty.
              </p>
            </div>
          </div>

          <div style={adminActionsGridStyle}>
            <Link href="/teacher-attendance/duty-roster" style={adminActionButtonStyle}>
              Duty Roster
            </Link>

            <Link href="/teacher-attendance/records" style={adminActionButtonStyle}>
              Records / Print
            </Link>

            <Link href="/teacher-attendance/location-settings" style={adminActionButtonStyle}>
              Location Settings
            </Link>

            <button onClick={() => window.print()} style={adminActionButtonStyle}>
              Print Today
            </button>
          </div>
        </div>

        <div style={{ height: "10px" }} />

        <div style={sectionCardStyle}>
          <div style={adminSectionTopStyle}>
            <div>
              <h3 style={sectionTitleStyle}>Today&apos;s Attendance</h3>
              <p style={adminSubTextStyle}>
                Live list of teachers who have checked in or not checked in today.
              </p>
            </div>

            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search teacher, class, status..."
              style={searchInputStyle}
            />
          </div>

          <div className="hidden md:block" style={desktopTableWrapStyle}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>Teacher</th>
                  <th style={thStyle}>Class</th>
                  <th style={thStyle}>Duty</th>
                  <th style={thStyle}>Check In</th>
                  <th style={thStyle}>Check Out</th>
                  <th style={thStyle}>Status</th>
                </tr>
              </thead>

              <tbody>
                {filteredRows.length === 0 ? (
                  <tr>
                    <td style={tdStyle} colSpan={6}>
                      No teacher found.
                    </td>
                  </tr>
                ) : (
                  filteredRows.map((row) => {
                    const badge = statusStyles(row.status);

                    return (
                      <tr key={row.teacherId}>
                        <td style={tdStyle}>
                          <strong>{getTeacherName(row.teacher)}</strong>
                          <div style={tinyMutedStyle}>{row.teacherId}</div>
                        </td>
                        <td style={tdStyle}>{getTeacherClass(row.teacher)}</td>
                        <td style={tdStyle}>{row.isOnDuty ? "Yes" : "No"}</td>
                        <td style={tdStyle}>{formatTime(row.attendance?.check_in_time)}</td>
                        <td style={tdStyle}>{formatTime(row.attendance?.check_out_time)}</td>
                        <td style={tdStyle}>
                          <span
                            style={{
                              background: badge.bg,
                              color: badge.color,
                              padding: "5px 8px",
                              borderRadius: "999px",
                              fontSize: "11px",
                              fontWeight: 800,
                              display: "inline-flex",
                            }}
                          >
                            {row.status}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="flex md:hidden" style={mobileCardsWrapStyle}>
            {filteredRows.length === 0 ? (
              <p style={{ margin: 0, color: COLORS.muted, fontSize: "13px" }}>
                No teacher found.
              </p>
            ) : (
              filteredRows.map((row) => {
                const badge = statusStyles(row.status);

                return (
                  <div key={row.teacherId} style={adminTeacherCardStyle}>
                    <div style={adminTeacherCardTopStyle}>
                      <div>
                        <strong>{getTeacherName(row.teacher)}</strong>
                        <div style={tinyMutedStyle}>{getTeacherClass(row.teacher)}</div>
                      </div>

                      <span
                        style={{
                          background: badge.bg,
                          color: badge.color,
                          padding: "5px 8px",
                          borderRadius: "999px",
                          fontSize: "11px",
                          fontWeight: 800,
                        }}
                      >
                        {row.status}
                      </span>
                    </div>

                    <div style={mobileMiniGridStyle}>
                      <MiniCard label="Duty" value={row.isOnDuty ? "Yes" : "No"} compact />
                      <MiniCard
                        label="Check In"
                        value={formatTime(row.attendance?.check_in_time)}
                        compact
                      />
                      <MiniCard
                        label="Check Out"
                        value={formatTime(row.attendance?.check_out_time)}
                        compact
                      />
                      <MiniCard label="ID" value={row.teacherId || "-"} compact />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div style={{ height: "10px" }} />

        <div style={sectionCardStyle}>
          <h3 style={sectionTitleStyle}>Duty Summary</h3>

          <div style={adminStatsGridStyle}>
            <AdminStatCard label="This Week" value={String(onDutyThisWeek)} tone="warning" />
            <AdminStatCard label="Next Week" value={String(onDutyNextWeek)} tone="info" />
            <AdminStatCard
              label="School Radius"
              value={`${attendanceSettings.allowedRadiusMeters}m`}
              tone="success"
            />
          </div>
        </div>
      </div>
    </main>
  );
}

function TeacherHistoryCard({ attendanceHistory }: { attendanceHistory: AnyRow[] }) {
  return (
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
              <div key={String(row.id)} style={historyRowStyle}>
                <div style={historyTopStyle}>
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

                <div style={mobileMiniGridStyle}>
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

      <div style={miniCardValueWrapStyle}>
        <p
          style={{
            margin: "4px 0 0",
            fontWeight: 800,
            color: COLORS.dark,
            fontSize: compact ? "12px" : "16px",
            lineHeight: 1.2,
            wordBreak: "break-word",
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

function AdminStatCard({
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
    <div style={adminStatCardStyle}>
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
        <h2 style={{ margin: "3px 0 0", color: COLORS.dark, fontSize: "22px" }}>{value}</h2>
      </div>
    </div>
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
        borderRadius: "10px",
        padding: "11px 13px",
        marginBottom: "10px",
        fontWeight: 700,
        fontSize: "14px",
      }}
    >
      {message}
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

const teacherHeaderStyle: React.CSSProperties = {
  background: `linear-gradient(135deg, ${COLORS.dark} 0%, ${COLORS.darkSoft} 100%)`,
  color: "#fff",
  borderRadius: "16px",
  padding: "12px 14px",
  border: `2px solid ${COLORS.gold}`,
  boxShadow: "0 12px 24px rgba(0,0,0,0.10)",
  marginBottom: "10px",
};

const adminHeaderStyle: React.CSSProperties = {
  ...teacherHeaderStyle,
  borderRadius: "18px",
  padding: "16px",
};

const headerFlexStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: "10px",
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
  margin: "4px 0 0",
  color: "rgba(255,255,255,0.92)",
  fontSize: "13px",
  fontWeight: 700,
};

const headerRightStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-end",
  gap: "5px",
  flexShrink: 0,
};

const headerDateStyle: React.CSSProperties = {
  textAlign: "right",
  fontSize: "11px",
  lineHeight: 1.35,
  color: "rgba(255,255,255,0.82)",
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

const miniGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: "8px",
  marginBottom: "10px",
};

const mobileMiniGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: "7px",
};

const miniCardValueWrapStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: "6px",
  alignItems: "center",
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

const smallInfoStyle: React.CSSProperties = {
  marginTop: "9px",
  fontSize: "12px",
  color: COLORS.muted,
  lineHeight: 1.45,
};

const historyRowStyle: React.CSSProperties = {
  border: `1px solid ${COLORS.border}`,
  borderRadius: "10px",
  padding: "10px",
  background: "#fff",
};

const historyTopStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: "8px",
  alignItems: "center",
  marginBottom: "7px",
};

const adminStatsGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
  gap: "10px",
};

const adminStatCardStyle: React.CSSProperties = {
  background: COLORS.card,
  border: `1px solid ${COLORS.border}`,
  borderRadius: "14px",
  padding: "12px",
  display: "flex",
  alignItems: "center",
  gap: "10px",
  boxShadow: "0 6px 16px rgba(0,0,0,0.04)",
};

const adminSectionTopStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: "12px",
  alignItems: "flex-start",
  flexWrap: "wrap",
};

const adminSubTextStyle: React.CSSProperties = {
  margin: "-3px 0 8px",
  color: COLORS.muted,
  fontSize: "12px",
};

const adminActionsGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
  gap: "8px",
};

const adminActionButtonStyle: React.CSSProperties = {
  textDecoration: "none",
  border: `1px solid ${COLORS.border}`,
  background: "#fff",
  color: COLORS.dark,
  borderRadius: "11px",
  padding: "11px",
  fontWeight: 800,
  fontSize: "13px",
  textAlign: "center",
  cursor: "pointer",
};

const searchInputStyle: React.CSSProperties = {
  width: "100%",
  maxWidth: "320px",
  border: `1px solid ${COLORS.border}`,
  borderRadius: "11px",
  padding: "10px 12px",
  outline: "none",
  fontSize: "16px",
};

const desktopTableWrapStyle: React.CSSProperties = {
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

const mobileCardsWrapStyle: React.CSSProperties = {
  flexDirection: "column",
  gap: "8px",
};

const adminTeacherCardStyle: React.CSSProperties = {
  border: `1px solid ${COLORS.border}`,
  borderRadius: "12px",
  padding: "10px",
  background: "#fff",
};

const adminTeacherCardTopStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: "8px",
  alignItems: "flex-start",
  marginBottom: "8px",
};
