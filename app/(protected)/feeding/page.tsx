"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type TeacherRow = Record<string, any>;

function getRole(row: TeacherRow | null) {
  const raw = String(row?.role || "").trim().toLowerCase();
  if (raw === "owner" || raw === "admin" || raw === "headmaster") return raw;
  return "teacher";
}

export default function FeedingEntryPage() {
  const router = useRouter();

  useEffect(() => {
    let active = true;

    async function openCorrectFeedingPage() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!active) return;

      if (!session?.user) {
        router.replace("/");
        return;
      }

      const { data: teachers, error } = await supabase.from("teachers").select("*");

      if (!active) return;

      if (error || !teachers || teachers.length === 0) {
        router.replace("/");
        return;
      }

      const currentTeacher =
        teachers.find((row) => row.auth_user_id === session.user.id) ||
        teachers.find(
          (row) =>
            String(row.email || "").trim().toLowerCase() ===
            String(session.user.email || "").trim().toLowerCase()
        ) ||
        null;

      if (!currentTeacher) {
        router.replace("/");
        return;
      }

      const role = getRole(currentTeacher);

      if (role === "owner" || role === "admin" || role === "headmaster") {
        router.replace("/feeding/admin");
        return;
      }

      router.replace("/feeding/teacher");
    }

    openCorrectFeedingPage();

    return () => {
      active = false;
    };
  }, [router]);

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background:
          "linear-gradient(135deg, #fffdf2 0%, #fff9db 25%, #fef3c7 55%, #fde68a 100%)",
        fontFamily: "Arial, sans-serif",
        color: "#111827",
      }}
    >
      Opening Feeding...
    </main>
  );
}
