"use client";

import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  getAllCachedTeachers,
  getAllPending,
  getAllTodayEntries,
  getTodayEntry,
  upsertTodayEntry,
  type CachedTeacher,
  type PendingRecord,
  type TodayEntry,
} from "@/lib/kiosk/db";
import {
  queuePendingRecord,
  refreshTeacherCache,
  refreshTodayCache,
  syncPendingRecords,
} from "@/lib/kiosk/sync";
import { comparePin } from "@/lib/kiosk/pin";
import { formatClock, formatDateLong, formatTime12, toIsoDate } from "@/lib/kiosk/format";
// NOTE: adjust this import to match your actual Supabase client path/export.
import { supabase } from "@/lib/supabase";

const COLORS = {
  bg: "#0a1120",
  bgDeep: "#050810",
  panel: "#111827",
  panelLight: "#1a2436",
  card: "#ffffff",
  gold: "#d4a017",
  goldBright: "#f0c443",
  goldDeep: "#8a6a0d",
  text: "#111827",
  muted: "#6b7280",
  border: "#e5e7eb",
  successBg: "#dcfce7",
  successText: "#166534",
  warningBg: "#fef3c7",
  warningText: "#a16207",
  dangerBg: "#fee2e2",
  dangerText: "#991b1b",
};

const FALLBACK_SCHOOL = {
  school_name: "JEFSEM VISION SCHOOL",
  motto: "Success in Excellence",
  logo_url:
    "https://res.cloudinary.com/dkgklk7f7/image/upload/v1775783020/y9boo9rqd5ohch90rvlp.png",
};

const SCHOOL_CACHE_KEY = "kiosk_school_settings_v1";

type Screen = "pin" | "invalid" | "status" | "success";

type SchoolInfo = {
  school_name: string;
  motto: string | null;
  logo_url: string | null;
};

function generateId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function computeCheckInStatus(now: Date): "Present" | "Late" {
  const totalMinutes = now.getHours() * 60 + now.getMinutes();
  return totalMinutes <= 7 * 60 + 30 ? "Present" : "Late";
}

export default function KioskPage() {
  const [screen, setScreen] = useState<Screen>("pin");
  const [pin, setPin] = useState("");
  const [now, setNow] = useState(new Date());
  const [isOnline, setIsOnline] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing] = useState(false);

  const [teacher, setTeacher] = useState<CachedTeacher | null>(null);
  const [entry, setEntry] = useState<TodayEntry | null>(null);
  const [successLabel, setSuccessLabel] = useState("");
  const [successTime, setSuccessTime] = useState("");

  const [liveBoard, setLiveBoard] = useState<TodayEntry[]>([]);
  const [school, setSchool] = useState<SchoolInfo>(FALLBACK_SCHOOL);

  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ---------------------------------------------------------------------
  // School branding — fetched from school_settings, cached for offline use
  // ---------------------------------------------------------------------
  useEffect(() => {
    try {
      const cached = localStorage.getItem(SCHOOL_CACHE_KEY);
      if (cached) setSchool(JSON.parse(cached));
    } catch {
      // ignore malformed cache
    }

    async function loadSchoolSettings() {
      const { data, error } = await supabase
        .from("school_settings")
        .select("school_name, motto, logo_url")
        .single();

      if (!error && data) {
        setSchool(data);
        try {
          localStorage.setItem(SCHOOL_CACHE_KEY, JSON.stringify(data));
        } catch {
          // storage full or unavailable — safe to ignore
        }
      }
    }

    void loadSchoolSettings();
  }, []);

  // ---------------------------------------------------------------------
  // Lock the kiosk down: no back navigation, no zoom, no context menu.
  // For a proper full-screen "app" feel when launched from a home-screen
  // shortcut, also set your manifest.json `"display": "fullscreen"` (or
  // "standalone") — this JS is the belt-and-braces layer on top of that.
  // ---------------------------------------------------------------------
  useEffect(() => {
    document.documentElement.style.overscrollBehavior = "none";
    document.body.style.overscrollBehavior = "none";
    document.body.style.touchAction = "manipulation";

    // Trap the back button: every time the user (or OS gesture) tries to
    // go back, immediately re-push the current state so they never leave.
    const trapState = { kiosk: true };
    history.pushState(trapState, "", window.location.href);

    function onPopState() {
      history.pushState(trapState, "", window.location.href);
    }

    function onContextMenu(e: MouseEvent) {
      e.preventDefault();
    }

    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const isTypingContext =
        target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA");

      // Block Alt+ArrowLeft / Backspace-as-back, but never block Backspace
      // while it's legitimately being used inside an input.
      if (e.altKey && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
        e.preventDefault();
      }
      if (e.key === "Backspace" && !isTypingContext) {
        e.preventDefault();
      }
    }

    function onBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = "";
    }

    window.addEventListener("popstate", onPopState);
    window.addEventListener("contextmenu", onContextMenu);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("beforeunload", onBeforeUnload);

    return () => {
      window.removeEventListener("popstate", onPopState);
      window.removeEventListener("contextmenu", onContextMenu);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, []);

  // Ask for real Fullscreen API coverage on the very first tap (browsers
  // require a user gesture before granting fullscreen).
  useEffect(() => {
    function requestFullscreenOnce() {
      const el = document.documentElement;
      if (!document.fullscreenElement && el.requestFullscreen) {
        el.requestFullscreen().catch(() => {
          // Fullscreen may be denied (e.g. iOS Safari) — the manifest
          // "display" mode still handles full coverage when added to
          // the home screen, so this is a soft-fail.
        });
      }
      window.removeEventListener("pointerdown", requestFullscreenOnce);
    }

    window.addEventListener("pointerdown", requestFullscreenOnce);
    return () => window.removeEventListener("pointerdown", requestFullscreenOnce);
  }, []);

  const reloadLiveBoard = useCallback(async () => {
    const entries = await getAllTodayEntries();
    entries.sort((a, b) => a.teacher_name.localeCompare(b.teacher_name));
    setLiveBoard(entries);
  }, []);

  const refreshPendingCount = useCallback(async () => {
    const pending = await getAllPending();
    setPendingCount(pending.length);
  }, []);

  const runSync = useCallback(async () => {
    if (!navigator.onLine) return;
    setSyncing(true);
    await refreshTeacherCache();
    await syncPendingRecords();
    await refreshTodayCache();
    await reloadLiveBoard();
    await refreshPendingCount();
    setSyncing(false);
  }, [reloadLiveBoard, refreshPendingCount]);

  useEffect(() => {
    const clockId = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(clockId);
  }, []);

  useEffect(() => {
    setIsOnline(navigator.onLine);

    const goOnline = () => {
      setIsOnline(true);
      void runSync();
    };

    const goOffline = () => setIsOnline(false);

    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);

    void runSync();
    void reloadLiveBoard();
    void refreshPendingCount();

    const syncId = setInterval(() => void runSync(), 30000);

    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
      clearInterval(syncId);
    };
  }, [runSync, reloadLiveBoard, refreshPendingCount]);

  const goToPinScreen = useCallback(() => {
    setScreen("pin");
    setPin("");
    setTeacher(null);
    setEntry(null);
    setSuccessLabel("");
    setSuccessTime("");
  }, []);

  const scheduleReset = useCallback(
    (ms: number) => {
      if (resetTimer.current) clearTimeout(resetTimer.current);
      resetTimer.current = setTimeout(goToPinScreen, ms);
    },
    [goToPinScreen]
  );

  useEffect(() => {
    return () => {
      if (resetTimer.current) clearTimeout(resetTimer.current);
    };
  }, []);

  const handlePinSubmit = useCallback(
    async (enteredPin: string) => {
      const cachedTeachers = await getAllCachedTeachers();
      let matched: CachedTeacher | null = null;

      for (const candidate of cachedTeachers) {
        const isMatch = await comparePin(enteredPin, candidate.pin_hash);
        if (isMatch) {
          matched = candidate;
          break;
        }
      }

      if (!matched) {
        setScreen("invalid");
        scheduleReset(2500);
        return;
      }

      const today = toIsoDate(new Date());
      const existing = await getTodayEntry(matched.teacher_id);
      const todaysEntry = existing && existing.attendance_date === today ? existing : null;

      setTeacher(matched);
      setEntry(todaysEntry);
      setScreen("status");
    },
    [scheduleReset]
  );

  function pressDigit(digit: string) {
    setPin((p) => {
      if (p.length >= 4) return p;
      const next = p + digit;
      if (next.length === 4) {
        setTimeout(() => void handlePinSubmit(next), 150);
      }
      return next;
    });
  }

  useEffect(() => {
    if (screen !== "pin") return;

    function onKeyDown(e: KeyboardEvent) {
      if (e.key >= "0" && e.key <= "9") {
        pressDigit(e.key);
      } else if (e.key === "Backspace") {
        setPin((p) => p.slice(0, -1));
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen]);

  function pressClear() {
    setPin("");
  }

  function pressBackspace() {
    setPin((p) => p.slice(0, -1));
  }

  async function handleCheckIn() {
    if (!teacher) return;

    const nowDate = new Date();
    const today = toIsoDate(nowDate);
    const offlineId = generateId();

    const newEntry: TodayEntry = {
      teacher_id: teacher.teacher_id,
      teacher_name: teacher.full_name,
      attendance_date: today,
      check_in_time: nowDate.toISOString(),
      check_out_time: null,
      check_in_status: computeCheckInStatus(nowDate),
      is_on_duty: false,
      offline_id: offlineId,
      synced: false,
    };

    const pendingRecord: PendingRecord = {
      offline_id: offlineId,
      teacher_id: teacher.teacher_id,
      teacher_name: teacher.full_name,
      attendance_date: today,
      check_in_time: newEntry.check_in_time,
      check_out_time: null,
      check_in_status: newEntry.check_in_status,
      is_on_duty: false,
      sync_status: "pending",
      created_at: nowDate.toISOString(),
    };

    await upsertTodayEntry(newEntry);
    await queuePendingRecord(pendingRecord);
    await reloadLiveBoard();
    await refreshPendingCount();

    setSuccessLabel("Checked In Successfully");
    setSuccessTime(formatTime12(newEntry.check_in_time));
    setScreen("success");
    scheduleReset(5000);

    void runSync();
  }

  async function handleCheckOut() {
    if (!teacher || !entry) return;

    const nowDate = new Date();
    const offlineId = entry.offline_id || generateId();

    const updatedEntry: TodayEntry = {
      ...entry,
      offline_id: offlineId,
      check_out_time: nowDate.toISOString(),
      synced: false,
    };

    const pendingRecord: PendingRecord = {
      offline_id: offlineId,
      teacher_id: teacher.teacher_id,
      teacher_name: teacher.full_name,
      attendance_date: updatedEntry.attendance_date,
      check_in_time: updatedEntry.check_in_time,
      check_out_time: updatedEntry.check_out_time,
      check_in_status: updatedEntry.check_in_status,
      is_on_duty: updatedEntry.is_on_duty,
      sync_status: "pending",
      created_at: nowDate.toISOString(),
    };

    await upsertTodayEntry(updatedEntry);
    await queuePendingRecord(pendingRecord);
    await reloadLiveBoard();
    await refreshPendingCount();

    setSuccessLabel("Checked Out Successfully");
    setSuccessTime(formatTime12(updatedEntry.check_out_time));
    setScreen("success");
    scheduleReset(5000);

    void runSync();
  }

  useEffect(() => {
    if (screen !== "status" || !teacher) return;
    if (entry?.check_in_time && entry?.check_out_time) {
      scheduleReset(4000);
    }
  }, [screen, teacher, entry, scheduleReset]);

  return (
    <main style={pageStyle}>
      <div style={vignetteStyle} />

      <div style={mainColumnStyle}>
        <header style={plaqueStyle}>
          <div style={plaqueGlowStyle} />

          <div style={crestWrapStyle}>
            <div style={crestRingStyle}>
              {school.logo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={school.logo_url} alt={school.school_name} style={crestImgStyle} />
              ) : (
                <span style={{ color: COLORS.gold, fontWeight: 800, fontSize: 22 }}>
                  {school.school_name.charAt(0)}
                </span>
              )}
            </div>
          </div>

          <div style={plaqueTextStyle}>
            <h1 style={schoolNameStyle}>{school.school_name}</h1>
            {school.motto && <p style={mottoStyle}>{school.motto}</p>}
            <p style={subEyebrowStyle}>Teacher Attendance Terminal</p>
          </div>

          <div style={headerRightStyle}>
            <div style={clockStyle}>{formatClock(now)}</div>
            <div style={dateStyle}>{formatDateLong(now)}</div>
            <div style={statusPillStyle(isOnline)}>
              {isOnline ? "Online" : "Offline"}
              {pendingCount > 0 ? ` • ${pendingCount} pending` : ""}
              {syncing ? " • Syncing..." : ""}
            </div>
          </div>
        </header>

        <section style={cardOuterStyle}>
          <div style={cardStyle}>
            {screen === "pin" && (
              <PinScreen pin={pin} onDigit={pressDigit} onClear={pressClear} onBackspace={pressBackspace} />
            )}

            {screen === "invalid" && <InvalidPinScreen />}

            {screen === "status" && teacher && (
              <StatusScreen
                teacher={teacher}
                now={now}
                entry={entry}
                onCheckIn={handleCheckIn}
                onCheckOut={handleCheckOut}
              />
            )}

            {screen === "success" && <SuccessScreen label={successLabel} time={successTime} />}
          </div>
        </section>
      </div>

      <aside style={sideColumnStyle}>
        <h2 style={sideTitleStyle}>Today&apos;s Attendance</h2>

        <div style={boardListStyle}>
          {liveBoard.length === 0 ? (
            <p style={{ color: "rgba(255,255,255,0.55)", fontSize: "13px" }}>
              No attendance recorded yet.
            </p>
          ) : (
            liveBoard.map((row) => (
              <div key={row.teacher_id} style={boardRowStyle}>
                <span>
                  {row.check_in_time ? "✓" : "⏳"} {row.teacher_name}
                </span>
                <span style={{ color: "rgba(255,255,255,0.7)" }}>
                  {row.check_in_time ? formatTime12(row.check_in_time) : ""}
                  {row.check_out_time ? ` → ${formatTime12(row.check_out_time)}` : ""}
                </span>
              </div>
            ))
          )}
        </div>
      </aside>
    </main>
  );
}

function PinScreen({
  pin,
  onDigit,
  onClear,
  onBackspace,
}: {
  pin: string;
  onDigit: (digit: string) => void;
  onClear: () => void;
  onBackspace: () => void;
}) {
  return (
    <div style={centerColStyle}>
      <p style={promptStyle}>Enter PIN</p>

      <div style={dotsRowStyle}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} style={dotStyle(i < pin.length)} />
        ))}
      </div>

      <div style={keypadStyle}>
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((digit) => (
          <button key={digit} style={keyStyle} onClick={() => onDigit(digit)}>
            {digit}
          </button>
        ))}
        <button style={keySecondaryStyle} onClick={onClear}>
          Clear
        </button>
        <button style={keyStyle} onClick={() => onDigit("0")}>
          0
        </button>
        <button style={keySecondaryStyle} onClick={onBackspace}>
          ⌫
        </button>
      </div>
    </div>
  );
}

function InvalidPinScreen() {
  return (
    <div style={centerColStyle}>
      <p style={{ ...promptStyle, color: COLORS.dangerText }}>Invalid PIN</p>
      <p style={{ color: COLORS.muted, fontSize: "16px" }}>Please try again.</p>
    </div>
  );
}

function StatusScreen({
  teacher,
  now,
  entry,
  onCheckIn,
  onCheckOut,
}: {
  teacher: CachedTeacher;
  now: Date;
  entry: TodayEntry | null;
  onCheckIn: () => void;
  onCheckOut: () => void;
}) {
  const hasCheckedIn = Boolean(entry?.check_in_time);
  const hasCheckedOut = Boolean(entry?.check_out_time);

  return (
    <div style={centerColStyle}>
      <p style={welcomeEyebrowStyle}>Welcome</p>
      <h2 style={welcomeNameStyle}>{teacher.full_name.toUpperCase()}</h2>
      <p style={{ color: COLORS.muted, marginBottom: "18px" }}>
        {formatDateLong(now)} • {formatClock(now)}
      </p>

      {!hasCheckedIn && (
        <>
          <div style={statusBadgeStyle(COLORS.warningBg, COLORS.warningText)}>Not Checked In</div>
          <button style={actionButtonStyle} onClick={onCheckIn}>
            CHECK IN
          </button>
        </>
      )}

      {hasCheckedIn && !hasCheckedOut && (
        <>
          <div style={statusBadgeStyle(COLORS.successBg, COLORS.successText)}>
            Checked In at {formatTime12(entry?.check_in_time)}
          </div>
          <button style={actionButtonStyle} onClick={onCheckOut}>
            CHECK OUT
          </button>
        </>
      )}

      {hasCheckedIn && hasCheckedOut && (
        <>
          <div style={statusBadgeStyle(COLORS.successBg, COLORS.successText)}>
            Checked In {formatTime12(entry?.check_in_time)}
          </div>
          <div style={{ height: "8px" }} />
          <div style={statusBadgeStyle(COLORS.successBg, COLORS.successText)}>
            Checked Out {formatTime12(entry?.check_out_time)}
          </div>
          <p style={{ marginTop: "16px", color: COLORS.muted }}>Attendance Completed</p>
        </>
      )}
    </div>
  );
}

function SuccessScreen({ label, time }: { label: string; time: string }) {
  return (
    <div style={centerColStyle}>
      <div style={statusBadgeStyle(COLORS.successBg, COLORS.successText)}>{label}</div>
      <p style={{ fontSize: "34px", fontWeight: 800, color: COLORS.text, marginTop: "10px" }}>
        {time}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const pageStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  height: "100dvh",
  width: "100vw",
  display: "flex",
  overflow: "hidden",
  background: `radial-gradient(1200px 800px at 20% -10%, #14213d 0%, ${COLORS.bg} 45%, ${COLORS.bgDeep} 100%)`,
  fontFamily: "'Segoe UI', Arial, sans-serif",
};

const vignetteStyle: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  pointerEvents: "none",
  boxShadow: "inset 0 0 180px rgba(0,0,0,0.55)",
};

const mainColumnStyle: React.CSSProperties = {
  flex: 1,
  display: "flex",
  flexDirection: "column",
  padding: "22px 24px",
  minWidth: 0,
};

const sideColumnStyle: React.CSSProperties = {
  width: "320px",
  flexShrink: 0,
  background: `linear-gradient(180deg, ${COLORS.panelLight} 0%, ${COLORS.panel} 100%)`,
  padding: "24px 18px",
  borderLeft: "1px solid rgba(212,160,23,0.15)",
  boxShadow: "inset 6px 0 24px rgba(0,0,0,0.35)",
  color: "#fff",
  overflow: "hidden",
};

const plaqueStyle: React.CSSProperties = {
  position: "relative",
  display: "flex",
  alignItems: "center",
  gap: "18px",
  color: "#fff",
  marginBottom: "18px",
  padding: "16px 22px",
  borderRadius: "18px",
  background: "linear-gradient(180deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 100%)",
  border: "1px solid rgba(212,160,23,0.25)",
  boxShadow:
    "0 18px 40px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.08), inset 0 -1px 0 rgba(0,0,0,0.4)",
  overflow: "hidden",
};

const plaqueGlowStyle: React.CSSProperties = {
  position: "absolute",
  top: "-60%",
  left: "-10%",
  width: "260px",
  height: "260px",
  borderRadius: "50%",
  background: "radial-gradient(circle, rgba(240,196,67,0.28) 0%, rgba(240,196,67,0) 70%)",
  pointerEvents: "none",
};

const crestWrapStyle: React.CSSProperties = {
  position: "relative",
  flexShrink: 0,
};

const crestRingStyle: React.CSSProperties = {
  width: "62px",
  height: "62px",
  borderRadius: "50%",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: `linear-gradient(145deg, ${COLORS.goldBright} 0%, ${COLORS.gold} 55%, ${COLORS.goldDeep} 100%)`,
  boxShadow:
    "0 6px 14px rgba(0,0,0,0.5), inset 0 2px 2px rgba(255,255,255,0.5), inset 0 -3px 4px rgba(0,0,0,0.35)",
  padding: "3px",
};

const crestImgStyle: React.CSSProperties = {
  width: "100%",
  height: "100%",
  objectFit: "cover",
  borderRadius: "50%",
  border: "2px solid rgba(10,17,32,0.9)",
  background: "#fff",
};

const plaqueTextStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
};

const schoolNameStyle: React.CSSProperties = {
  margin: 0,
  fontSize: "24px",
  fontWeight: 800,
  letterSpacing: "0.5px",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
  textShadow: "0 2px 6px rgba(0,0,0,0.4)",
};

const mottoStyle: React.CSSProperties = {
  margin: "2px 0 0",
  fontSize: "13px",
  fontStyle: "italic",
  color: "rgba(240,196,67,0.85)",
};

const subEyebrowStyle: React.CSSProperties = {
  margin: "6px 0 0",
  fontSize: "11px",
  letterSpacing: "1.5px",
  textTransform: "uppercase",
  color: "rgba(255,255,255,0.5)",
};

const headerRightStyle: React.CSSProperties = {
  textAlign: "right",
  flexShrink: 0,
};

const clockStyle: React.CSSProperties = {
  fontSize: "26px",
  fontWeight: 800,
  fontVariantNumeric: "tabular-nums",
};

const dateStyle: React.CSSProperties = {
  fontSize: "13px",
  color: "rgba(255,255,255,0.7)",
  marginTop: "2px",
};

function statusPillStyle(online: boolean): React.CSSProperties {
  return {
    marginTop: "8px",
    display: "inline-block",
    fontSize: "11px",
    fontWeight: 700,
    padding: "4px 10px",
    borderRadius: "999px",
    background: online ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.18)",
    color: online ? "#4ade80" : "#f87171",
    border: `1px solid ${online ? "rgba(74,222,128,0.3)" : "rgba(248,113,113,0.3)"}`,
  };
}

const cardOuterStyle: React.CSSProperties = {
  flex: 1,
  display: "flex",
  minHeight: 0,
};

const cardStyle: React.CSSProperties = {
  flex: 1,
  background: `linear-gradient(180deg, #ffffff 0%, #fbfbfc 100%)`,
  borderRadius: "24px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "32px",
  boxShadow:
    "0 30px 60px rgba(0,0,0,0.5), 0 2px 0 rgba(255,255,255,0.6) inset, 0 -6px 18px rgba(0,0,0,0.06) inset",
  border: "1px solid rgba(255,255,255,0.4)",
};

const centerColStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  textAlign: "center",
  width: "100%",
  maxWidth: "380px",
};

const promptStyle: React.CSSProperties = {
  fontSize: "22px",
  fontWeight: 800,
  color: COLORS.text,
  marginBottom: "14px",
};

const dotsRowStyle: React.CSSProperties = {
  display: "flex",
  gap: "14px",
  marginBottom: "26px",
};

function dotStyle(filled: boolean): React.CSSProperties {
  return {
    width: "20px",
    height: "20px",
    borderRadius: "50%",
    border: `2px solid ${COLORS.gold}`,
    background: filled
      ? `linear-gradient(145deg, ${COLORS.goldBright}, ${COLORS.goldDeep})`
      : "transparent",
    boxShadow: filled ? "0 2px 6px rgba(212,160,23,0.5)" : "none",
    transition: "background 0.15s ease",
  };
}

const keypadStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, 1fr)",
  gap: "12px",
  width: "100%",
};

const keyStyle: React.CSSProperties = {
  padding: "18px",
  fontSize: "22px",
  fontWeight: 700,
  borderRadius: "14px",
  border: `1px solid ${COLORS.border}`,
  background: "linear-gradient(180deg, #ffffff 0%, #f3f4f6 100%)",
  boxShadow:
    "0 4px 0 rgba(0,0,0,0.08), 0 6px 12px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.9)",
  color: COLORS.text,
  cursor: "pointer",
  transition: "transform 0.08s ease, box-shadow 0.08s ease",
};

const keySecondaryStyle: React.CSSProperties = {
  ...keyStyle,
  fontSize: "15px",
  fontWeight: 700,
  color: COLORS.muted,
  background: "linear-gradient(180deg, #f9fafb 0%, #eef0f3 100%)",
};

const welcomeEyebrowStyle: React.CSSProperties = {
  margin: 0,
  fontSize: "13px",
  color: COLORS.muted,
  textTransform: "uppercase",
  letterSpacing: "1px",
};

const welcomeNameStyle: React.CSSProperties = {
  margin: "6px 0 4px",
  fontSize: "30px",
};

function statusBadgeStyle(bg: string, color: string): React.CSSProperties {
  return {
    background: bg,
    color,
    padding: "10px 16px",
    borderRadius: "999px",
    fontWeight: 800,
    fontSize: "15px",
    boxShadow: "0 2px 6px rgba(0,0,0,0.08)",
  };
}

const actionButtonStyle: React.CSSProperties = {
  marginTop: "22px",
  border: "none",
  background: `linear-gradient(180deg, ${COLORS.goldBright} 0%, ${COLORS.gold} 60%, ${COLORS.goldDeep} 100%)`,
  color: "#1a1305",
  fontWeight: 800,
  fontSize: "18px",
  padding: "16px 40px",
  borderRadius: "16px",
  cursor: "pointer",
  boxShadow:
    "0 6px 0 rgba(138,106,13,0.6), 0 10px 20px rgba(212,160,23,0.35), inset 0 1px 0 rgba(255,255,255,0.5)",
};

const sideTitleStyle: React.CSSProperties = {
  margin: "0 0 14px",
  fontSize: "16px",
  color: COLORS.goldBright,
  letterSpacing: "0.5px",
};

const boardListStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "8px",
  maxHeight: "calc(100dvh - 90px)",
  overflowY: "auto",
};

const boardRowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  fontSize: "13px",
  padding: "8px 0",
  borderBottom: "1px solid rgba(255,255,255,0.08)",
};
