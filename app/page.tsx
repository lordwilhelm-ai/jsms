"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function Home() {
  const router = useRouter();

  const [schoolName, setSchoolName] = useState("JSMS");
  const [motto, setMotto] = useState("");
  const [logoUrl, setLogoUrl] = useState("");

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function loadSettings() {
      const { data } = await supabase
        .from("school_settings")
        .select("school_name, motto, logo_url")
        .limit(1)
        .single();

      if (data) {
        setSchoolName(data.school_name || "JSMS");
        setMotto(data.motto || "");
        setLogoUrl(data.logo_url || "");
      }
    }

    async function checkExistingSession() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const params = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
      const next = params?.get("next") || null;

      if (!session?.user?.id) return;

      const { data: teacher } = await supabase
        .from("teachers")
        .select("role")
        .eq("auth_user_id", session.user.id)
        .limit(1)
        .single();

      if (!teacher?.role) return;

      if (next && typeof next === "string" && next.startsWith("/")) {
        router.replace(next);
        return;
      }

      if (teacher.role === "teacher") {
        router.replace("/dashboard/teacher");
        return;
      }

      if (teacher.role === "admin") {
        router.replace("/dashboard/admin");
        return;
      }

      if (teacher.role === "headmaster") {
        router.replace("/dashboard/headmaster");
        return;
      }

      if (teacher.role === "super_admin") {
        router.replace("/dashboard/admin");
      }
    }

    loadSettings();
    checkExistingSession();
  }, [router]);

  async function handleLogin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setMessage("");

    try {
      const cleanIdentifier = identifier.trim().toLowerCase();
      const cleanPassword = password.trim();

      if (!cleanIdentifier) {
        throw new Error("Enter your username or phone.");
      }

      if (!cleanPassword) {
        throw new Error("Enter your password.");
      }

      const resolveResponse = await fetch("/api/auth/resolve-login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          identifier: cleanIdentifier,
        }),
      });

      const resolveData = await resolveResponse.json();

      if (!resolveResponse.ok) {
        throw new Error(resolveData.error || "Account not found.");
      }

      const loginEmail = resolveData.loginEmail;

      if (!loginEmail) {
        throw new Error("Login account not found.");
      }

      const { data: signInData, error: signInError } =
        await supabase.auth.signInWithPassword({
          email: loginEmail,
          password: cleanPassword,
        });

      if (signInError) {
        throw new Error(signInError.message);
      }

      const authUserId = signInData.user?.id;

      if (!authUserId) {
        throw new Error("Login failed.");
      }

      const { data: teacher, error: teacherError } = await supabase
        .from("teachers")
        .select("role")
        .eq("auth_user_id", authUserId)
        .limit(1)
        .single();

      if (teacherError) {
        throw new Error(teacherError.message);
      }

      if (!teacher?.role) {
        throw new Error("Role not found for this account.");
      }

      // respect next query param when present
      const paramsAfter = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
      const nextAfter = paramsAfter?.get("next") || null;
      if (nextAfter && nextAfter.startsWith("/")) {
        router.push(nextAfter);
        return;
      }

      if (teacher.role === "teacher") {
        router.push("/dashboard/teacher");
        return;
      }

      if (teacher.role === "admin") {
        router.push("/dashboard/admin");
        return;
      }

      if (teacher.role === "headmaster") {
        router.push("/dashboard/headmaster");
        return;
      }

      if (teacher.role === "super_admin") {
        router.push("/dashboard/admin");
        return;
      }

      throw new Error("Unknown role.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Login failed."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "linear-gradient(135deg, #064e3b 0%, #022c22 100%)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "20px",
        fontFamily: "Arial, sans-serif",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "420px",
          background: "#ffffff",
          borderRadius: "20px",
          padding: "28px 22px",
          boxShadow: "0 15px 40px rgba(0,0,0,0.25)",
        }}
      >
        <div style={{ textAlign: "center", marginBottom: "24px" }}>
          <div
            style={{
              width: "90px",
              height: "90px",
              margin: "0 auto 14px",
              borderRadius: "18px",
              background: "#f3f4f6",
              border: "2px solid #d4af37",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
            }}
          >
            {logoUrl ? (
              <img
                src={logoUrl}
                alt="School Logo"
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                }}
              />
            ) : (
              <span style={{ fontSize: "12px", color: "#6b7280" }}>
                Logo
              </span>
            )}
          </div>

          <h1
            style={{
              margin: 0,
              fontSize: "22px",
              color: "#064e3b",
              fontWeight: "bold",
            }}
          >
            {schoolName}
          </h1>

          <p
            style={{
              marginTop: "4px",
              color: "#6b7280",
              fontSize: "13px",
            }}
          >
            {motto}
          </p>

          <div style={{ marginTop: "18px" }}>
            <h2
              style={{
                margin: 0,
                fontSize: "20px",
                color: "#111827",
              }}
            >
              JSMS
            </h2>

            <p
              style={{
                marginTop: "4px",
                fontSize: "12px",
                color: "#6b7280",
              }}
            >
              Jefsem Student Management System
            </p>
          </div>
        </div>

        <form onSubmit={handleLogin} style={{ display: "grid", gap: "16px" }}>
          <div>
            <label style={labelStyle}>Username or Phone</label>
            <input
              type="text"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder="Enter username or phone"
              style={inputStyle}
            />
          </div>

          <div>
            <label style={labelStyle}>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              style={inputStyle}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              border: "none",
              background: "#064e3b",
              color: "#ffffff",
              padding: "14px",
              borderRadius: "12px",
              fontWeight: 700,
              fontSize: "15px",
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.75 : 1,
              marginTop: "4px",
            }}
          >
            {loading ? "Logging in..." : "Log In"}
          </button>

          {message && (
            <p
              style={{
                margin: 0,
                color: "#b91c1c",
                fontSize: "13px",
                textAlign: "center",
              }}
            >
              {message}
            </p>
          )}
        </form>
      </div>
    </main>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "13px 14px",
  borderRadius: "12px",
  border: "1px solid #d1d5db",
  outline: "none",
  fontSize: "14px",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  marginBottom: "6px",
  fontWeight: 600,
  color: "#111827",
  fontSize: "14px",
};
