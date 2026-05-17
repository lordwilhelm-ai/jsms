"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { enableJsmsPushNotifications } from "@/lib/pushNotifications";

type Props = {
  userId?: string | null;
  teacherId?: string | null;
  role?: string;
};

function safeJsonParse(value: string | null) {
  if (!value) return null;

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function findTeacherIdInObject(obj: any): string | null {
  if (!obj || typeof obj !== "object") return null;

  const possibleKeys = [
    "teacher_id",
    "teacherId",
    "teacherID",
    "teacher_code",
    "teacherCode",
    "staff_id",
    "staffId",
  ];

  for (const key of possibleKeys) {
    const value = obj?.[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }

  if (obj.teacher && typeof obj.teacher === "object") {
    const found = findTeacherIdInObject(obj.teacher);
    if (found) return found;
  }

  if (obj.user && typeof obj.user === "object") {
    const found = findTeacherIdInObject(obj.user);
    if (found) return found;
  }

  if (obj.profile && typeof obj.profile === "object") {
    const found = findTeacherIdInObject(obj.profile);
    if (found) return found;
  }

  return null;
}

function getStoredTeacherId(): string | null {
  if (typeof window === "undefined") return null;

  const directKeys = [
    "teacherId",
    "teacher_id",
    "teacherID",
    "jsms_teacher_id",
    "currentTeacherId",
    "staff_id",
    "staffId",
  ];

  for (const key of directKeys) {
    const value = localStorage.getItem(key);
    if (value && value.trim()) return value.trim();
  }

  const objectKeys = [
    "teacher",
    "teacherData",
    "currentTeacher",
    "loggedInTeacher",
    "jsmsTeacher",
    "jsms_user",
    "user",
    "currentUser",
    "profile",
  ];

  for (const key of objectKeys) {
    const parsed = safeJsonParse(localStorage.getItem(key));
    const found = findTeacherIdInObject(parsed);
    if (found) return found;
  }

  return null;
}

function getStoredRole(fallbackRole: string) {
  if (typeof window === "undefined") return fallbackRole || "admin";

  const directKeys = ["role", "userRole", "jsms_role", "account_role"];

  for (const key of directKeys) {
    const value = localStorage.getItem(key);
    if (value && value.trim()) return value.trim().toLowerCase();
  }

  const objectKeys = [
    "teacher",
    "teacherData",
    "currentTeacher",
    "loggedInTeacher",
    "jsmsTeacher",
    "jsms_user",
    "user",
    "currentUser",
    "profile",
  ];

  for (const key of objectKeys) {
    const parsed = safeJsonParse(localStorage.getItem(key));
    const value =
      parsed?.role ||
      parsed?.user_role ||
      parsed?.account_role ||
      parsed?.profile?.role ||
      parsed?.user?.role;

    if (typeof value === "string" && value.trim()) {
      return value.trim().toLowerCase();
    }
  }

  return fallbackRole || "admin";
}

async function findTeacherIdFromDatabase() {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const authUser = session?.user;
  const authUserId = authUser?.id || null;
  const authEmail = authUser?.email?.toLowerCase() || null;
  const authPhone =
    (authUser?.user_metadata?.phone as string | undefined) ||
    (authUser?.phone as string | undefined) ||
    null;

  if (!authUserId && !authEmail && !authPhone) return null;

  const { data, error } = await supabase.from("teachers").select("*").limit(1000);

  if (error || !data) return null;

  const match = data.find((teacher: any) => {
    const possibleUserIds = [
      teacher.user_id,
      teacher.auth_user_id,
      teacher.auth_id,
      teacher.supabase_user_id,
      teacher.profile_id,
    ]
      .filter(Boolean)
      .map(String);

    const possibleEmails = [
      teacher.email,
      teacher.teacher_email,
      teacher.personal_email,
      teacher.login_email,
    ]
      .filter(Boolean)
      .map((x) => String(x).toLowerCase());

    const possiblePhones = [
      teacher.phone,
      teacher.phone_number,
      teacher.teacher_phone,
      teacher.contact,
      teacher.contact_number,
    ]
      .filter(Boolean)
      .map(String);

    return (
      (authUserId && possibleUserIds.includes(authUserId)) ||
      (authEmail && possibleEmails.includes(authEmail)) ||
      (authPhone && possiblePhones.includes(authPhone))
    );
  });

  if (!match) return null;

  return (
    match.teacher_id ||
    match.teacherId ||
    match.teacherID ||
    match.teacher_code ||
    match.staff_id ||
    match.id ||
    null
  );
}

export default function EnableNotificationsButton({
  userId = null,
  teacherId = null,
  role = "admin",
}: Props) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function handleEnable() {
    setLoading(true);
    setMessage("");
    setError("");

    try {
      const finalRole = getStoredRole(role);
      let finalTeacherId = teacherId;

      if (finalRole === "teacher") {
        finalTeacherId = teacherId || getStoredTeacherId();

        if (!finalTeacherId) {
          finalTeacherId = await findTeacherIdFromDatabase();
        }

        if (!finalTeacherId) {
          throw new Error(
            "Teacher ID not found for this account. Open the teacher dashboard once, then try again."
          );
        }
      }

      await enableJsmsPushNotifications({
        userId,
        teacherId: finalRole === "teacher" ? finalTeacherId : null,
        role: finalRole,
        deviceName: `${finalRole} browser`,
      });

      setMessage("Notifications enabled.");
    } catch (err: any) {
      console.error(err);
      setError(err?.message || "Could not enable notifications.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 6,
        alignItems: "center",
      }}
    >
      <button
        type="button"
        onClick={handleEnable}
        disabled={loading}
        style={{
          border: "1px solid #bbd8c4",
          background: "#0f7a3b",
          color: "#ffffff",
          padding: "10px 14px",
          borderRadius: 12,
          cursor: loading ? "not-allowed" : "pointer",
          fontWeight: 900,
          fontSize: 13,
        }}
      >
        {loading ? "Enabling..." : "🔔 Enable Notifications"}
      </button>

      {message && (
        <span style={{ color: "#166534", fontSize: 12, fontWeight: 800 }}>
          {message}
        </span>
      )}

      {error && (
        <span
          style={{
            color: "#991b1b",
            fontSize: 12,
            fontWeight: 800,
            maxWidth: 300,
            textAlign: "center",
          }}
        >
          ⚠️ {error}
        </span>
      )}
    </div>
  );
}