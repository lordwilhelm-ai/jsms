"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type AnyRow = Record<string, any>;

// Temporary diagnostic page — NOT in ProtectedRoute's admin-only lists on
// purpose, so it's reachable no matter what role a login currently
// resolves to. Runs the EXACT same queries the real redirect logic uses
// (app/page.tsx's .single() lookup, and the fetch-all-then-find lookup
// ProtectedRoute/TeacherLoginModal use) so a mismatch is visible from one
// screenshot instead of guessing blind across multiple round trips.
export default function WhoAmIPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sessionInfo, setSessionInfo] = useState<{ email: string; userId: string } | null>(null);
  const [currentUrl, setCurrentUrl] = useState("");
  const [allRowsByAuthId, setAllRowsByAuthId] = useState<AnyRow[]>([]);
  const [matchesByEmail, setMatchesByEmail] = useState<AnyRow[]>([]);
  const [singleQueryResult, setSingleQueryResult] = useState<AnyRow | null>(null);
  const [singleQueryError, setSingleQueryError] = useState<string>("");
  const [allTeachersFindResult, setAllTeachersFindResult] = useState<AnyRow | null>(null);
  const [allTeachersCount, setAllTeachersCount] = useState(0);

  useEffect(() => {
    async function load() {
      try {
        setCurrentUrl(typeof window !== "undefined" ? window.location.href : "");

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

        // 1) ALL rows matching auth_user_id, no .single() — reveals a
        // duplicate row if one exists (a .find()/.single() lookup elsewhere
        // could then non-deterministically pick the wrong one).
        const { data: byId } = await supabase
          .from("teachers")
          .select("*")
          .eq("auth_user_id", userId);
        setAllRowsByAuthId(byId || []);

        // 2) Same email-based fallback lookup as before.
        const { data: byEmail } = await supabase
          .from("teachers")
          .select("*")
          .ilike("email", email);
        setMatchesByEmail(byEmail || []);

        // 3) The EXACT query app/page.tsx's post-login redirect runs,
        // including .single() — if 0 or 2+ rows match, this errors out
        // instead of returning a row.
        const singleRes = await supabase
          .from("teachers")
          .select("role")
          .eq("auth_user_id", userId)
          .limit(1)
          .single();
        setSingleQueryResult(singleRes.data || null);
        setSingleQueryError(singleRes.error ? JSON.stringify(singleRes.error) : "");

        // 4) The EXACT fetch-all-then-find approach ProtectedRoute/
        // TeacherLoginModal use.
        const { data: allTeachers } = await supabase.from("teachers").select("*");
        setAllTeachersCount((allTeachers || []).length);
        const found =
          (allTeachers || []).find((row: any) => row.auth_user_id === userId) ||
          (allTeachers || []).find(
            (row: any) => String(row.email || "").trim().toLowerCase() === email
          ) ||
          null;
        setAllTeachersFindResult(found);

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
    fontSize: "13px",
    whiteSpace: "pre-wrap",
    wordBreak: "break-all",
  };

  function summarize(row: AnyRow | null) {
    if (!row) return null;
    return {
      full_name: row.full_name,
      username: row.username,
      email: row.email,
      role: row.role,
      auth_user_id: row.auth_user_id,
      id: row.id,
    };
  }

  return (
    <div style={{ padding: "24px", maxWidth: "820px", margin: "0 auto" }}>
      <h1 style={{ fontFamily: "Arial, sans-serif", marginBottom: "16px" }}>
        Account Diagnostic (temporary)
      </h1>

      {loading && <p>Loading...</p>}
      {error && <p style={{ color: "#b91c1c" }}>{error}</p>}

      {!loading && !error && (
        <>
          <div style={box}>
            <strong>Current URL:</strong>
            {"\n"}{currentUrl}
          </div>

          <div style={box}>
            <strong>Your logged-in session:</strong>
            {"\n"}Email: {sessionInfo?.email}
            {"\n"}Auth User ID: {sessionInfo?.userId}
          </div>

          <div style={box}>
            <strong>
              ALL teacher rows matching your Auth User ID ({allRowsByAuthId.length} found —
              more than 1 means a duplicate account):
            </strong>
            {"\n"}
            {allRowsByAuthId.length > 0
              ? JSON.stringify(allRowsByAuthId.map(summarize), null, 2)
              : "NONE FOUND."}
          </div>

          <div style={box}>
            <strong>Total rows in `teachers` table you can read: {allTeachersCount}</strong>
            {"\n\n"}
            <strong>Row found by ProtectedRoute/login's fetch-all-then-find logic:</strong>
            {"\n"}
            {allTeachersFindResult ? JSON.stringify(summarize(allTeachersFindResult), null, 2) : "NONE FOUND."}
          </div>

          <div style={box}>
            <strong>Result of app/page.tsx's exact .single() lookup (used right after login):</strong>
            {"\n"}Data: {singleQueryResult ? JSON.stringify(singleQueryResult, null, 2) : "null"}
            {"\n"}Error: {singleQueryError || "none"}
          </div>

          <div style={box}>
            <strong>All teacher records with this email ({matchesByEmail.length} found):</strong>
            {"\n"}
            {matchesByEmail.length > 0
              ? JSON.stringify(matchesByEmail.map(summarize), null, 2)
              : "None found."}
          </div>

          <p style={{ fontFamily: "Arial, sans-serif", color: "#6b7280", fontSize: "13px" }}>
            Take a screenshot of this whole page (scroll to get everything) and share it.
          </p>
        </>
      )}
    </div>
  );
}
