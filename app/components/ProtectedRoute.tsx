"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function ProtectedRoute({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let active = true;

    async function checkSession() {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        // debug: log session shape to help track unexpected redirects
        try {
          // eslint-disable-next-line no-console
          console.debug("ProtectedRoute session:", session);
        } catch (e) {}

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
  }, [router]);

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
