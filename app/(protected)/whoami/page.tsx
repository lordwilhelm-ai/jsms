"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type AnyRow = Record<string, any>;

// Temporary diagnostic page — NOT in ProtectedRoute's admin-only lists on
// purpose, so it's reachable no matter what role a login currently
// resolves to. Shows exactly what teachers row(s) the logged-in session
// matches, in plain language, so a role/redirect problem can be diagnosed
// from a screenshot instead of guessing blind. Read-only, shows only the
// current user's own data (plus any other rows sharing their email, so a
// duplicate-account mismatch is visible too).
export default function WhoAmIPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sessionInfo, setSessionInfo] = useState<{ email: string; userId: string } | null>(null);
  const [matchByAuthId, setMatchByAuthId] = useState<AnyRow | null>(null);
  const [matchesByEmail, setMatchesByEmail] = useState<AnyRow[]>([]);

  useEffect(() => {
    async function load() {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session?.user) {
          setError("Not logged in.");
          setLoading(false);
          return;
        }

        const email = String(session.user.email || "").trim().toLowerCase();
        const userId = session.user.id;
        setSessionInfo({ email, userId });

        const { data: byId } = await supabase
          .from("teachers")
          .select("*")
          .eq("auth_user_id", userId);

        const { data: byEmail } = await supabase
          .from("teachers")
          .select("*")
          .ilike("email", email);

        setMatchByAuthId((byId && byId[0]) || null);
        setMatchesByEmail(byEmail || []);
        setLoading(false);
      } catch (err: any) {
        setError(err?.message || "Failed to load diagnostic info.");
        setLoading(false);
      }
    }

    void load();
  }, []);

  const box: React.CSSProperties = {
    background: "#fff",
    border: "1px solid #e5e7eb",
    borderRadius: "16px",
    padding: "20px",
    marginBottom: "16px",
    fontFamily: "monospace",
    fontSize: "14px",
    whiteSpace: "pre-wrap",
    wordBreak: "break-all",
  };

  return (
    <div style={{ padding: "24px", maxWidth: "760px", margin: "0 auto" }}>
      <h1 style={{ fontFamily: "Arial, sans-serif", marginBottom: "16px" }}>
        Account Diagnostic (temporary)
      </h1>

      {loading && <p>Loading...</p>}
      {error && <p style={{ color: "#b91c1c" }}>{error}</p>}

      {!loading && !error && (
        <>
          <div style={box}>
            <strong>Your logged-in session:</strong>
            {"\n"}Email: {sessionInfo?.email}
            {"\n"}Auth User ID: {sessionInfo?.userId}
          </div>

          <div style={box}>
            <strong>Teacher record matched by Auth User ID (this decides your dashboard):</strong>
            {"\n"}
            {matchByAuthId
              ? JSON.stringify(
                  {
                    full_name: matchByAuthId.full_name,
                    username: matchByAuthId.username,
                    email: matchByAuthId.email,
                    role: matchByAuthId.role,
                    auth_user_id: matchByAuthId.auth_user_id,
                    id: matchByAuthId.id,
                  },
                  null,
                  2
                )
              : "NONE FOUND — no teachers row has this auth_user_id."}
          </div>

          <div style={box}>
            <strong>All teacher records with this email ({matchesByEmail.length} found):</strong>
            {"\n"}
            {matchesByEmail.length > 0
              ? JSON.stringify(
                  matchesByEmail.map((row) => ({
                    full_name: row.full_name,
                    username: row.username,
                    email: row.email,
                    role: row.role,
                    auth_user_id: row.auth_user_id,
                    id: row.id,
                  })),
                  null,
                  2
                )
              : "None found."}
          </div>

          <p style={{ fontFamily: "Arial, sans-serif", color: "#6b7280", fontSize: "13px" }}>
            Take a screenshot of this page and share it — it shows exactly which teacher
            record your login is tied to and what role it has.
          </p>
        </>
      )}
    </div>
  );
}
