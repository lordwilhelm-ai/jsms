"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function ProtectedRoute({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    async function checkSession() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.user?.id) {
        router.replace("/");
        return;
      }

      const { data: teacher } = await supabase
        .from("teachers")
        .select("role")
        .eq("auth_user_id", session.user.id)
        .limit(1)
        .single();

      if (!teacher?.role) {
        router.replace("/");
        return;
      }

      const role = teacher.role;

      if (pathname.startsWith("/dashboard/teacher") && role !== "teacher") {
        router.replace("/");
        return;
      }

      if (pathname.startsWith("/dashboard/admin") && role !== "admin" && role !== "super_admin") {
        router.replace("/");
        return;
      }

      if (pathname.startsWith("/dashboard/headmaster") && role !== "headmaster") {
        router.replace("/");
        return;
      }

      setChecking(false);
    }

    checkSession();
  }, [pathname, router]);

  if (checking) {
    return (
      <main
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "Arial, sans-serif",
        }}
      >
        Checking access...
      </main>
    );
  }

  return <>{children}</>;
}
