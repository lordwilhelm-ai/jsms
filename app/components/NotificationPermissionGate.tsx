"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import EnableNotificationsButton from "@/components/EnableNotificationsButton";

type GateStatus = "checking" | "allowed" | "blocked" | "unsupported";

function getStoredTeacherId() {
  if (typeof window === "undefined") return null;

  const possibleKeys = [
    "teacherId",
    "teacher_id",
    "teacherID",
    "jsms_teacher_id",
    "currentTeacherId",
  ];

  for (const key of possibleKeys) {
    const value = localStorage.getItem(key);
    if (value) return value;
  }

  try {
    const teacherRaw =
      localStorage.getItem("teacher") ||
      localStorage.getItem("teacherData") ||
      localStorage.getItem("currentTeacher");

    if (teacherRaw) {
      const parsed = JSON.parse(teacherRaw);
      return (
        parsed?.teacher_id ||
        parsed?.teacherId ||
        parsed?.id ||
        parsed?.teacherID ||
        null
      );
    }
  } catch {
    return null;
  }

  return null;
}

function getRoleFromPath(pathname: string) {
  const lower = pathname.toLowerCase();

  if (lower.includes("/teacher")) return "teacher";
  if (lower.includes("/headmaster")) return "headmaster";
  if (lower.includes("/admin")) return "admin";

  if (
    lower.includes("/admission") ||
    lower.includes("/fees") ||
    lower.includes("/books") ||
    lower.includes("/uniform") ||
    lower.includes("/settings") ||
    lower.includes("/students") ||
    lower.includes("/teachers") ||
    lower.includes("/classes") ||
    lower.includes("/subjects") ||
    lower.includes("/feeding") ||
    lower.includes("/dashboard")
  ) {
    return "admin";
  }

  return "staff";
}

async function hasActiveBrowserPushSubscription() {
  if (typeof window === "undefined") return false;

  if (!("Notification" in window)) return false;
  if (!("serviceWorker" in navigator)) return false;
  if (!("PushManager" in window)) return false;

  if (Notification.permission !== "granted") return false;

  try {
    const registration =
      (await navigator.serviceWorker.getRegistration()) ||
      (await navigator.serviceWorker.ready);

    if (!registration) return false;

    const subscription = await registration.pushManager.getSubscription();
    return !!subscription;
  } catch {
    return false;
  }
}

export default function NotificationPermissionGate({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  const [status, setStatus] = useState<GateStatus>("checking");
  const [teacherId, setTeacherId] = useState<string | null>(null);

  const role = useMemo(() => getRoleFromPath(pathname || ""), [pathname]);

  async function checkNotificationStatus() {
    setStatus("checking");

    if (typeof window === "undefined") return;

    if (
      !("Notification" in window) ||
      !("serviceWorker" in navigator) ||
      !("PushManager" in window)
    ) {
      setStatus("unsupported");
      return;
    }

    const savedTeacherId = getStoredTeacherId();
    setTeacherId(savedTeacherId);

    const ok = await hasActiveBrowserPushSubscription();

    setStatus(ok ? "allowed" : "blocked");
  }

  useEffect(() => {
    checkNotificationStatus();
  }, [pathname]);

  if (status === "checking") {
    return (
      <div style={styles.fullPage}>
        <div style={styles.card}>
          <div style={styles.icon}>🔔</div>
          <h1 style={styles.title}>Checking Notifications</h1>
          <p style={styles.text}>Please wait...</p>
        </div>
      </div>
    );
  }

  if (status === "unsupported") {
    return (
      <div style={styles.fullPage}>
        <div style={styles.card}>
          <div style={styles.icon}>⚠️</div>
          <h1 style={styles.title}>Browser Not Supported</h1>
          <p style={styles.text}>
            Use Chrome, Edge, or a modern Android browser.
          </p>

          <button style={styles.retryBtn} onClick={checkNotificationStatus}>
            Check Again
          </button>
        </div>
      </div>
    );
  }

  if (status === "blocked") {
    return (
      <div style={styles.fullPage}>
        <div style={styles.card}>
          <div style={styles.icon}>🔔</div>

          <h1 style={styles.title}>Enable Notifications</h1>

          <p style={styles.text}>Enable notification to continue.</p>

          <div style={styles.buttonWrap}>
            <EnableNotificationsButton
              role={role}
              userId={null}
              teacherId={role === "teacher" ? teacherId : null}
            />

            <button style={styles.retryBtn} onClick={checkNotificationStatus}>
              Continue
            </button>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

const styles: Record<string, React.CSSProperties> = {
  fullPage: {
    minHeight: "100vh",
    width: "100%",
    display: "grid",
    placeItems: "center",
    padding: "24px",
    background:
      "linear-gradient(135deg, #f7f3e8 0%, #eef7ef 45%, #ffffff 100%)",
    fontFamily: "Inter, Arial, sans-serif",
    color: "#102016",
  },

  card: {
    width: "100%",
    maxWidth: "430px",
    background: "#ffffff",
    borderRadius: "24px",
    padding: "28px",
    boxShadow: "0 24px 70px rgba(16,32,22,0.14)",
    border: "1px solid rgba(15,122,59,0.14)",
    textAlign: "center",
  },

  icon: {
    width: "64px",
    height: "64px",
    borderRadius: "20px",
    display: "grid",
    placeItems: "center",
    margin: "0 auto 16px",
    background: "#f4e7bd",
    fontSize: "30px",
  },

  title: {
    margin: "0 0 10px",
    fontSize: "26px",
    color: "#0f2a17",
  },

  text: {
    margin: "0 auto 18px",
    maxWidth: "360px",
    color: "#526157",
    fontSize: "15px",
    lineHeight: 1.5,
  },

  buttonWrap: {
    display: "grid",
    gap: "10px",
    justifyItems: "center",
  },

  retryBtn: {
    border: "1px solid #bfd0c5",
    background: "#ffffff",
    color: "#0f2a17",
    padding: "11px 18px",
    borderRadius: "12px",
    cursor: "pointer",
    fontWeight: 800,
  },
};