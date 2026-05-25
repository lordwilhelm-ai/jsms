"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type AnyRow = Record<string, any>;

function cleanRole(row: AnyRow | null) {
  const role = String(row?.role || "").trim().toLowerCase();

  if (role === "owner") return "admin";
  if (role === "admin") return "admin";
  if (role === "headmaster") return "admin";
  if (role === "super_admin") return "admin";
  if (role === "superadmin") return "admin";

  return "teacher";
}

export default function UniformsRedirectPage() {
  const router = useRouter();
  const [message, setMessage] = useState("Checking your uniform access...");

  useEffect(() => {
    let active = true;

    async function checkRoleAndRedirect() {
      try {
        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession();

        if (!active) return;

        if (sessionError || !session?.user) {
          router.replace("/");
          return;
        }

        const { data: teachers, error: teacherError } = await supabase
          .from("teachers")
          .select("*");

        if (!active) return;

        if (teacherError) {
          throw teacherError;
        }

        const userRow =
          (teachers || []).find(
            (item) => String(item.auth_user_id || "") === String(session.user.id)
          ) ||
          (teachers || []).find(
            (item) =>
              String(item.email || "").trim().toLowerCase() ===
              String(session.user.email || "").trim().toLowerCase()
          ) ||
          null;

        if (!userRow) {
          router.replace("/");
          return;
        }

        const role = cleanRole(userRow);

        if (role === "admin") {
          router.replace("/uniforms/admin");
          return;
        }

        router.replace("/uniforms/teacher");
      } catch (error: any) {
        console.error("Uniform role redirect error:", error);
        if (!active) return;
        setMessage(error?.message || "Could not check your uniform access.");
      }
    }

    checkRoleAndRedirect();

    return () => {
      active = false;
    };
  }, [router]);

  return (
    <main className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-yellow-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md rounded-3xl border border-emerald-100 bg-white/90 p-6 text-center shadow-xl">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-100 text-2xl">
          👕
        </div>

        <h1 className="text-xl font-black text-slate-900">Uniform Module</h1>

        <p className="mt-2 text-sm font-semibold text-slate-600">{message}</p>

        <div className="mt-5 h-2 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full w-1/2 animate-pulse rounded-full bg-emerald-600" />
        </div>
      </div>
    </main>
  );
}
