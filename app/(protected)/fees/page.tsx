"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

function getRole(row: Record<string, any> | null) {
  const raw = String(row?.role || "").trim().toLowerCase();
  if (raw === "owner" || raw === "admin" || raw === "headmaster") return raw;
  return "teacher";
}

export default function FeesPage() {
  const router = useRouter();

  useEffect(() => {
    let active = true;

    async function openFees() {
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

      const userRow =
        teachers.find((item) => item.auth_user_id === session.user.id) ||
        teachers.find(
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

      router.replace("/fees/admin");
    }

    void openFees();

    return () => {
      active = false;
    };
  }, [router]);

  return <div style={{ padding: "24px" }}>Opening fees...</div>;
}
