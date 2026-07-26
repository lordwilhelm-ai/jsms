"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { supabase } from "@/lib/supabase";

type StaffRole = "owner" | "admin" | "headmaster" | "teacher";

function getRole(row: Record<string, any> | null): StaffRole {
  const raw = String(row?.role || "").trim().toLowerCase();
  if (raw === "owner" || raw === "admin" || raw === "headmaster") return raw as StaffRole;
  return "teacher";
}

// Paths whose ENTIRE subtree is owner/admin/headmaster only — a plain
// "teacher" role is bounced to their dashboard before the page ever renders.
// Everything else under (protected) is open to any authenticated staff
// member. This is the one shared gate for every admin-only screen in the
// app (previously each page had to remember to redirect non-admins itself,
// and several — Books, Uniforms admin, Feeding admin, Income & Expenditure,
// Admission, Teachers, Classes, Subjects, Settings, Students — simply never
// did, so any logged-in teacher could open them by URL).
//
// IMPORTANT: this only stops UI navigation. It is NOT a substitute for
// server-side authorization — every mutation these pages trigger must also
// be enforced by the API route / requireStaffRole, since a client-side
// redirect never stops a direct fetch or Supabase call.
const ADMIN_ONLY_PREFIXES = [
  "/uniforms/admin",
  "/feeding/admin",
  "/fees/admin",
  "/report-card/admin",
  "/sds/admin",
  "/teachers",
  "/teacher-attendance/duty-roster",
  "/teacher-attendance/location-settings",
  "/teacher-attendance/records",
];

const ADMIN_ONLY_EXACT = [
  "/books",
  "/students",
  "/classes",
  "/subjects",
  "/settings",
  "/income-expenditure",
  "/admission",
  "/dashboard/admin",
  "/dashboard/headmaster",
];

function isAdminOnlyPath(pathname: string) {
  if (ADMIN_ONLY_EXACT.includes(pathname)) return true;
  return ADMIN_ONLY_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

// The admin-role lookup below is a live Supabase query on every navigation
// into an admin-only path, with no offline fallback — meaning a genuinely
// offline admin would otherwise get bounced to the teacher dashboard (or
// signed out) the moment connectivity drops, even on a page they were
// already verified for minutes earlier. Cache the last-verified role per
// user (a plain role string, not sensitive like the kiosk's PIN hashes) so
// a network failure here falls back to "last known good" instead of
// treating "couldn't check" the same as "not an admin".
const ADMIN_ROLE_CACHE_KEY = "jsms_admin_role_cache_v1";

function getCachedRole(userId: string): StaffRole | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(ADMIN_ROLE_CACHE_KEY);
    if (!raw) return null;
    const map = JSON.parse(raw) as Record<string, StaffRole>;
    return map[userId] || null;
  } catch {
    return null;
  }
}

function setCachedRole(userId: string, role: StaffRole) {
  if (typeof window === "undefined") return;

  try {
    const raw = window.localStorage.getItem(ADMIN_ROLE_CACHE_KEY);
    const map = raw ? (JSON.parse(raw) as Record<string, StaffRole>) : {};
    map[userId] = role;
    window.localStorage.setItem(ADMIN_ROLE_CACHE_KEY, JSON.stringify(map));
  } catch {
    // best-effort only
  }
}

export default function ProtectedRoute({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let active = true;

    async function checkSession() {
      const requiresAdmin = isAdminOnlyPath(pathname);
      if (requiresAdmin) setChecking(true);

      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!active) return;

        if (!session || !session.user) {
          // ensure any partial/invalid sessions are cleared and redirect
          try {
            await supabase.auth.signOut();
          } catch (e) {
            // ignore signOut errors
          }
          // include return path so user can be sent back after login
          const returnPath = typeof window !== "undefined" ? window.location.pathname + window.location.search : "/";
          router.replace(`/?next=${encodeURIComponent(returnPath)}`);
          return;
        }

        if (requiresAdmin) {
          let role: StaffRole | null = null;

          try {
            const { data: teachers, error: teachersError } = await supabase
              .from("teachers")
              .select("role,auth_user_id,email");

            if (teachersError) throw teachersError;

            if (!active) return;

            // Fail CLOSED on no match — an authenticated account with no
            // corresponding teachers row is never treated as admin.
            const teacherRow =
              (teachers || []).find((row: any) => row.auth_user_id === session.user.id) ||
              (teachers || []).find(
                (row: any) =>
                  String(row.email || "").trim().toLowerCase() ===
                  String(session.user.email || "").trim().toLowerCase()
              ) ||
              null;

            role = getRole(teacherRow);
            setCachedRole(session.user.id, role);
          } catch (roleCheckError) {
            if (!active) return;

            // Couldn't reach the server to verify (offline, most likely) —
            // fall back to whatever role we last verified for this exact
            // user, rather than treating "couldn't check" as "not admin".
            // A user who's never been verified before still fails closed.
            console.warn("Role check failed, using cached role if available:", roleCheckError);
            role = getCachedRole(session.user.id);

            if (!role) {
              router.replace("/dashboard/teacher");
              return;
            }
          }

          if (role === "teacher") {
            router.replace("/dashboard/teacher");
            return;
          }
        }

        setChecking(false);
      } catch (error) {
        console.error("Session check error:", error);
        // If there's an auth error (like invalid refresh token), sign out and redirect
        await supabase.auth.signOut();
        router.replace("/");
      }
    }

    checkSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        // when session ends, send to login (no next)
        router.replace("/");
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [router, pathname]);

  if (checking) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#fffdf2",
          fontFamily: "Arial, sans-serif",
        }}
      >
        Checking access...
      </div>
    );
  }

  return <>{children}</>;
}
