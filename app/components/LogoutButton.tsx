"use client";

import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function LogoutButton({
  label = "Log Out",
  style,
  onDone,
}: {
  label?: string;
  style?: React.CSSProperties;
  onDone?: () => void;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleLogout() {
    try {
      setLoading(true);
      await supabase.auth.signOut();
      onDone?.();
      router.replace("/");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      disabled={loading}
      style={{
        border: "none",
        background: "#111827",
        color: "#ffffff",
        borderRadius: "16px",
        padding: "13px 14px",
        fontWeight: 700,
        fontSize: "13px",
        cursor: loading ? "not-allowed" : "pointer",
        textAlign: "left",
        opacity: loading ? 0.7 : 1,
        ...style,
      }}
    >
      {loading ? "Logging out..." : label}
    </button>
  );
}
