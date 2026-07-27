"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { supabase } from "@/lib/supabase";

type StaffRole = "owner" | "admin" | "headmaster" | "teacher" | "other_staff";

function getRole(row: Record<string, any> | null): StaffRole {
  const raw = String(row?.role || "").trim().toLowerCase();
  // "super_admin"/"superadmin" is a real, distinct role value used elsewhere
  // in this app's own login redirect (app/page.tsx, TeacherLoginModal.tsx)
  // but StaffRole only has four literal values — normalize it to "owner"
  // (the top tier) rather than passing the raw string through, since
  // `raw as StaffRole` would just be a type-lie: the runtime string
  // "super_admin" doesn't match any allowedRoles array anywhere (they only
  // ever list "owner"/"admin"/"headmaster"/"teacher" literally).
  if (raw === "super_admin" || raw === "superadmin") return "owner";
  if (raw === "owner" || raw === "admin" || raw === "headmaster") return raw as StaffRole;
  if (raw === "other_staff") return "other_staff";
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

// "other_staff" is support staff (e.g. security, cleaners) who only ever
// clock in/out — they get a login so they can be identified at the kiosk,
// but must never reach any other page, admin-only or not.
const KIOSK_PATH = "/teacher-attendance/kiosk";

// The admin-role lookup below is a live Supabase query, checked fresh on
// every navigation into an admin-only path whenever there's a connection —
// nothing about who can reach an admin page is ever decided from stale data
// while online; a real error while online still fails closed. The one
// exception is being genuinely offline (confirmed via navigator.onLine, not
// inferred from an error shape): with literally no network there is no way
// to verify anything live, so the last role this browser confirmed for this
// user is used instead of hard-blocking every admin page the moment
// connectivity drops.
const ROLE_CACHE_KEY = "jsms_admin_role_cache_v2";

function getCachedRole(userId: string): StaffRole | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(ROLE_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.userId !== userId) return null;
    return parsed?.role ?? null;
  } catch {
    return null;
  }
}

function setCachedRole(userId: string, role: StaffRole) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ROLE_CACHE_KEY, JSON.stringify({ userId, role }));
  } catch {
    // storage unavailable/full — role just won't be cached this time
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
      const isKioskPath = pathname === KIOSK_PATH;
      // Role has to be resolved on every path except the kiosk itself now —
      // not just admin-only ones — so an "other_staff" login can be caught
      // and redirected no matter where they try to go.
      const needsRoleCheck = !isKioskPath;
      if (needsRoleCheck) setChecking(true);

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

        if (needsRoleCheck) {
          const offline = typeof navigator !== "undefined" && navigator.onLine === false;
          let role: StaffRole;

          if (offline) {
            // No connection at all — can't run the live check, so fall back
            // to whatever this browser last confirmed for this exact user.
            const cachedRole = getCachedRole(session.user.id);

            if (!cachedRole) {
              // Never verified on this browser. Only admin-only paths need
              // to fail closed here — a plain, never-cached page shouldn't
              // block ordinary offline navigation just because we can't
              // rule out the rare case of an other_staff login that was
              // never seen online. Server-side authorization still rejects
              // other_staff on every real API call regardless.
              if (requiresAdmin) {
                router.replace("/dashboard/teacher");
                return;
              }
              setChecking(false);
              return;
            }

            role = cachedRole;
          } else {
            const { data: teachers, error: teachersError } = await supabase
              .from("teachers")
              .select("role,auth_user_id,login_email");

            if (!active) return;

            // Couldn't verify (real error while online) — deny access
            // outright, no fallback. Same as any other unverifiable case.
            if (teachersError) {
              router.replace("/dashboard/teacher");
              return;
            }

            // Fail CLOSED on no match — an authenticated account with no
            // corresponding teachers row is never treated as admin.
            const teacherRow =
              (teachers || []).find((row: any) => row.auth_user_id === session.user.id) ||
              (teachers || []).find(
                (row: any) =>
                  String(row.login_email || "").trim().toLowerCase() ===
                  String(session.user.email || "").trim().toLowerCase()
              ) ||
              null;

            role = getRole(teacherRow);
            setCachedRole(session.user.id, role);
          }

          // Kiosk-only lockdown: no matter what page this role tried to
          // reach, it only ever lands on the kiosk.
          if (role === "other_staff") {
            router.replace(KIOSK_PATH);
            return;
          }

          if (requiresAdmin && role === "teacher") {
            router.replace("/dashboard/teacher");
            return;
          }
        }

        setChecking(false);
      } catch (error) {
        console.error("Session check error:", error);

        if (typeof navigator !== "undefined" && navigator.onLine === false) {
          // Can't safely verify anything with no connection at all — leave
          // the user on whatever they're already looking at instead of
          // bouncing them to a login screen that itself needs internet.
          setChecking(false);
          return;
        }

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
        if (typeof navigator !== "undefined" && navigator.onLine === false) {
          // A background token-refresh attempt failing purely because
          // there's no connection isn't a real sign-out — don't bounce the
          // user to a login page they can't reach right now.
          return;
        }
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
