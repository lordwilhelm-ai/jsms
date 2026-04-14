"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function Home() {
  const router = useRouter();

  const [schoolName] = useState("JSMS Login");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function handleLogin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setMessage("");

    try {
      const cleanIdentifier = identifier.trim().toLowerCase();

      if (!cleanIdentifier) {
        throw new Error("Enter your username or phone.");
      }

      if (!password.trim()) {
        throw new Error("Enter your password.");
      }

      // Step 1: resolve username/phone to hidden login email
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
        throw new Error(resolveData.error || "Could not find account.");
      }

      const loginEmail = resolveData.loginEmail;

      if (!loginEmail) {
        throw new Error("Login email not found.");
      }

      // Step 2: sign in with Supabase Auth
      const { data: signInData, error: signInError } =
        await supabase.auth.signInWithPassword({
          email: loginEmail,
          password,
        });

      if (signInError) {
        throw new Error(signInError.message);
      }

      const authUserId = signInData.user?.id;

      if (!authUserId) {
        throw new Error("Login failed. No user found.");
      }

      // Step 3: get teacher record and role
      const { data: teacher, error: teacherError } = await supabase
        .from("teachers")
        .select("role")
        .eq("auth_user_id", authUserId)
        .eq("is_active", true)
        .limit(1)
        .single();

      if (teacherError) {
        throw new Error(teacherError.message);
      }

      if (!teacher?.role) {
        throw new Error("Role not found for this account.");
      }

      // Step 4: redirect by role
      if (teacher.role === "teacher") {
        router.push("/dashboard/teacher");
      } else if (teacher.role === "admin") {
        router.push("/dashboard/admin");
      } else if (teacher.role === "headmaster") {
        router.push("/dashboard/headmaster");
      } else if (teacher.role === "super_admin") {
        router.push("/dashboard/admin");
      } else {
        throw new Error("Unknown role.");
      }
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
          <h1
            style={{
              margin: 0,
              fontSize: "24px",
              color: "#064e3b",
              fontWeight: "bold",
            }}
          >
            {schoolName}
          </h1>

          <p
            style={{
              marginTop: "8px",
              fontSize: "13px",
              color: "#6b7280",
            }}
          >
            Sign in with your username or phone
          </p>
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
