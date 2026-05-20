"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { FiFileText, FiLoader, FiShield, FiUser } from "react-icons/fi";
import { supabase } from "@/lib/supabase";

type TeacherRow = Record<string, any>;

function cleanText(value: unknown) {
  return String(value || "").trim();
}

function cleanLower(value: unknown) {
  return cleanText(value).toLowerCase();
}

function normalizeRole(role: unknown) {
  const value = cleanLower(role);

  if (value === "owner") return "owner";
  if (value === "admin") return "admin";
  if (value === "headmaster") return "headmaster";
  if (value === "teacher") return "teacher";

  return value;
}

function getSavedUserRole() {
  if (typeof window === "undefined") return "";

  const keys = [
    "jvs_user",
    "jsms_user",
    "currentUser",
    "loggedInUser",
    "sessionUser",
    "teacher",
    "user",
    "authUser",
    "profile",
  ];

  for (const key of keys) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) continue;

      const parsed = JSON.parse(raw);
      const role = normalizeRole(parsed?.role);

      if (role) return role;
    } catch {
      // ignore bad localStorage data
    }
  }

  return "";
}

export default function ReportCardEntryPage() {
  const router = useRouter();

  const [status, setStatus] = useState("Opening Report Card module...");

  useEffect(() => {
    async function redirectByRole() {
      setStatus("Checking your account...");

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.user) {
        const savedRole = getSavedUserRole();

        if (savedRole === "teacher") {
          router.replace("/report-card/teacher");
          return;
        }

        if (
          savedRole === "admin" ||
          savedRole === "headmaster" ||
          savedRole === "owner"
        ) {
          router.replace("/report-card/admin");
          return;
        }

        router.replace("/");
        return;
      }

      setStatus("Checking your role...");

      const { data: teachers } = await supabase.from("teachers").select("*");

      const teacherRow: TeacherRow | null =
        teachers?.find((item: any) => item.auth_user_id === session.user.id) ||
        teachers?.find(
          (item: any) =>
            cleanLower(item.email) === cleanLower(session.user.email)
        ) ||
        null;

      const teacherRole = normalizeRole(teacherRow?.role);

      if (teacherRow && teacherRole === "teacher") {
        router.replace("/report-card/teacher");
        return;
      }

      if (
        teacherRole === "admin" ||
        teacherRole === "headmaster" ||
        teacherRole === "owner"
      ) {
        router.replace("/report-card/admin");
        return;
      }

      const savedRole = getSavedUserRole();

      if (savedRole === "teacher") {
        router.replace("/report-card/teacher");
        return;
      }

      if (
        savedRole === "admin" ||
        savedRole === "headmaster" ||
        savedRole === "owner"
      ) {
        router.replace("/report-card/admin");
        return;
      }

      router.replace("/report-card/teacher");
    }

    redirectByRole();
  }, [router]);

  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4">
      <div className="w-full max-w-md rounded-[28px] border border-sky-100 bg-white p-6 text-center shadow-sm">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-3xl bg-sky-50 text-sky-600">
          <FiFileText size={30} />
        </div>

        <h1 className="text-2xl font-extrabold text-gray-900">Report Card</h1>
        <p className="mt-2 text-sm font-semibold text-gray-500">{status}</p>

        <div className="mt-6 flex items-center justify-center gap-2 text-sm font-bold text-sky-600">
          <FiLoader className="animate-spin" size={18} />
          Please wait
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-emerald-50 px-4 py-3 text-emerald-700">
            <FiUser className="mx-auto mb-2" size={20} />
            <p className="text-xs font-black">Teacher</p>
          </div>

          <div className="rounded-2xl bg-amber-50 px-4 py-3 text-amber-700">
            <FiShield className="mx-auto mb-2" size={20} />
            <p className="text-xs font-black">Admin</p>
          </div>
        </div>
      </div>
    </div>
  );
}
