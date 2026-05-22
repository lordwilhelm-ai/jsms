"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type ResetTeacher = {
  id: string;
  teacher_id?: string | null;
  full_name?: string | null;
  name?: string | null;
  teacher_name?: string | null;
  phone?: string | null;
  role?: string | null;
};

type ResetQuestion = {
  id: string;
  question: string;
  options: string[];
};

type ResetStep = "phone" | "confirm" | "questions" | "password" | "done";

export default function Home() {
  const router = useRouter();

  const [schoolName, setSchoolName] = useState("JSMS");
  const [motto, setMotto] = useState("");
  const [logoUrl, setLogoUrl] = useState("");

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const [resetOpen, setResetOpen] = useState(false);
  const [resetStep, setResetStep] = useState<ResetStep>("phone");
  const [resetPhone, setResetPhone] = useState("");
  const [resetTeacher, setResetTeacher] = useState<ResetTeacher | null>(null);
  const [resetQuestions, setResetQuestions] = useState<ResetQuestion[]>([]);
  const [resetToken, setResetToken] = useState("");
  const [resetAnswers, setResetAnswers] = useState<Record<string, string>>({});
  const [resetPassword, setResetPassword] = useState("");
  const [resetPassword2, setResetPassword2] = useState("");
  const [resetLoading, setResetLoading] = useState(false);
  const [resetMessage, setResetMessage] = useState("");

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

      const params =
        typeof window !== "undefined"
          ? new URLSearchParams(window.location.search)
          : null;
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

  function openResetModal() {
    setResetOpen(true);
    setResetStep("phone");
    setResetPhone("");
    setResetTeacher(null);
    setResetQuestions([]);
    setResetToken("");
    setResetAnswers({});
    setResetPassword("");
    setResetPassword2("");
    setResetMessage("");
  }

  function closeResetModal() {
    setResetOpen(false);
    setResetLoading(false);
  }

  function getResetTeacherName(row: ResetTeacher | null) {
    if (!row) return "Teacher";

    return (
      String(row.full_name || row.teacher_name || row.name || "").trim() ||
      "Teacher"
    );
  }

  function formatPhone(value: string) {
    return value.replace(/\s+/g, "").trim();
  }

  async function lookupTeacherAccount() {
    setResetLoading(true);
    setResetMessage("");

    try {
      const cleanPhone = formatPhone(resetPhone);

      if (!cleanPhone) {
        throw new Error("Enter your phone number.");
      }

      const response = await fetch("/api/auth/teacher-password-reset", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "lookup",
          phone: cleanPhone,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Account not found.");
      }

      setResetTeacher(data.teacher);
      setResetStep("confirm");
    } catch (error) {
      setResetMessage(
        error instanceof Error ? error.message : "Could not find account."
      );
    } finally {
      setResetLoading(false);
    }
  }

  async function loadResetQuestions() {
    if (!resetTeacher?.id) {
      setResetMessage("Teacher account not found.");
      return;
    }

    setResetLoading(true);
    setResetMessage("");

    try {
      const response = await fetch("/api/auth/teacher-password-reset", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "questions",
          teacherId: resetTeacher.id,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Could not load questions.");
      }

      setResetQuestions(data.questions || []);
      setResetToken(data.token || "");
      setResetAnswers({});
      setResetStep("questions");
    } catch (error) {
      setResetMessage(
        error instanceof Error ? error.message : "Could not load questions."
      );
    } finally {
      setResetLoading(false);
    }
  }

  async function verifyResetAnswers() {
    setResetLoading(true);
    setResetMessage("");

    try {
      if (resetQuestions.length !== 5) {
        throw new Error("Reset questions could not be loaded.");
      }

      const missing = resetQuestions.some((question) => !resetAnswers[question.id]);

      if (missing) {
        throw new Error("Answer all 5 questions.");
      }

      const response = await fetch("/api/auth/teacher-password-reset", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "verify",
          token: resetToken,
          answers: resetAnswers,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Some answers are incorrect.");
      }

      setResetToken(data.token || resetToken);
      setResetStep("password");
    } catch (error) {
      setResetMessage(
        error instanceof Error ? error.message : "Some answers are incorrect."
      );
    } finally {
      setResetLoading(false);
    }
  }

  async function saveNewPassword() {
    setResetLoading(true);
    setResetMessage("");

    try {
      if (!resetPassword || resetPassword.length < 6) {
        throw new Error("Password must be at least 6 characters.");
      }

      if (resetPassword !== resetPassword2) {
        throw new Error("Passwords do not match.");
      }

      const response = await fetch("/api/auth/teacher-password-reset", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "update",
          token: resetToken,
          newPassword: resetPassword,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Password could not be updated.");
      }

      setResetStep("done");
      setResetMessage("");
      setPassword("");
      setIdentifier(resetTeacher?.phone || resetTeacher?.teacher_id || "");
    } catch (error) {
      setResetMessage(
        error instanceof Error ? error.message : "Password could not be updated."
      );
    } finally {
      setResetLoading(false);
    }
  }

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

      const paramsAfter =
        typeof window !== "undefined"
          ? new URLSearchParams(window.location.search)
          : null;
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
      setMessage(error instanceof Error ? error.message : "Login failed.");
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

            <button
              type="button"
              onClick={openResetModal}
              style={forgotButtonStyle}
            >
              Forgot password?
            </button>
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

      {resetOpen && (
        <div style={modalOverlayStyle}>
          <div style={modalCardStyle}>
            <div style={modalHeaderStyle}>
              <div>
                <h2 style={{ margin: 0, color: "#111827", fontSize: "20px" }}>
                  Reset Password
                </h2>
                <p style={{ margin: "4px 0 0", color: "#6b7280", fontSize: "13px" }}>
                  Teacher password recovery
                </p>
              </div>

              <button type="button" onClick={closeResetModal} style={closeButtonStyle}>
                ×
              </button>
            </div>

            {resetStep === "phone" && (
              <div style={modalBodyStyle}>
                <p style={helpTextStyle}>
                  Enter your phone number. If it exists in JSMS, your account will
                  appear for confirmation.
                </p>

                <label style={labelStyle}>Phone Number</label>
                <input
                  type="text"
                  value={resetPhone}
                  onChange={(e) => setResetPhone(e.target.value)}
                  placeholder="Enter your phone number"
                  style={inputStyle}
                />

                <button
                  type="button"
                  onClick={lookupTeacherAccount}
                  disabled={resetLoading}
                  style={primaryModalButtonStyle}
                >
                  {resetLoading ? "Checking..." : "Find Account"}
                </button>
              </div>
            )}

            {resetStep === "confirm" && resetTeacher && (
              <div style={modalBodyStyle}>
                <p style={helpTextStyle}>Confirm that this is your account.</p>

                <div style={accountCardStyle}>
                  <strong>{getResetTeacherName(resetTeacher)}</strong>
                  <span>Teacher ID: {resetTeacher.teacher_id || "N/A"}</span>
                  <span>Phone: {resetTeacher.phone || resetPhone}</span>
                  <span>Role: {resetTeacher.role || "teacher"}</span>
                </div>

                <button
                  type="button"
                  onClick={loadResetQuestions}
                  disabled={resetLoading}
                  style={primaryModalButtonStyle}
                >
                  {resetLoading ? "Preparing..." : "This is my account"}
                </button>

                <button
                  type="button"
                  onClick={() => setResetStep("phone")}
                  style={secondaryModalButtonStyle}
                >
                  Use another number
                </button>
              </div>
            )}

            {resetStep === "questions" && (
              <div style={modalBodyStyle}>
                <p style={helpTextStyle}>
                  Answer all 5 questions correctly. Questions and options change every time.
                </p>

                <div style={{ display: "grid", gap: "14px" }}>
                  {resetQuestions.map((question, index) => (
                    <div key={question.id} style={questionBoxStyle}>
                      <p style={questionTitleStyle}>
                        {index + 1}. {question.question}
                      </p>

                      <div style={{ display: "grid", gap: "8px" }}>
                        {question.options.map((option) => (
                          <label key={option} style={optionLabelStyle}>
                            <input
                              type="radio"
                              name={question.id}
                              value={option}
                              checked={resetAnswers[question.id] === option}
                              onChange={() =>
                                setResetAnswers((prev) => ({
                                  ...prev,
                                  [question.id]: option,
                                }))
                              }
                            />
                            <span>{option}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={verifyResetAnswers}
                  disabled={resetLoading}
                  style={primaryModalButtonStyle}
                >
                  {resetLoading ? "Checking..." : "Continue"}
                </button>
              </div>
            )}

            {resetStep === "password" && (
              <div style={modalBodyStyle}>
                <p style={helpTextStyle}>
                  Verification passed. Enter your new password.
                </p>

                <label style={labelStyle}>New Password</label>
                <input
                  type="password"
                  value={resetPassword}
                  onChange={(e) => setResetPassword(e.target.value)}
                  placeholder="Enter new password"
                  style={inputStyle}
                />

                <label style={labelStyle}>Confirm New Password</label>
                <input
                  type="password"
                  value={resetPassword2}
                  onChange={(e) => setResetPassword2(e.target.value)}
                  placeholder="Confirm new password"
                  style={inputStyle}
                />

                <button
                  type="button"
                  onClick={saveNewPassword}
                  disabled={resetLoading}
                  style={primaryModalButtonStyle}
                >
                  {resetLoading ? "Saving..." : "Save New Password"}
                </button>
              </div>
            )}

            {resetStep === "done" && (
              <div style={modalBodyStyle}>
                <div style={successBoxStyle}>
                  Password updated successfully. You can now log in with your new password.
                </div>

                <button
                  type="button"
                  onClick={closeResetModal}
                  style={primaryModalButtonStyle}
                >
                  Back to Login
                </button>
              </div>
            )}

            {resetMessage && (
              <p
                style={{
                  margin: "14px 0 0",
                  color: "#b91c1c",
                  fontSize: "13px",
                  textAlign: "center",
                  fontWeight: 600,
                }}
              >
                {resetMessage}
              </p>
            )}
          </div>
        </div>
      )}
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

const forgotButtonStyle: React.CSSProperties = {
  border: "none",
  background: "transparent",
  color: "#047857",
  fontWeight: 700,
  cursor: "pointer",
  fontSize: "13px",
  padding: "8px 0 0",
};

const modalOverlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.65)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "18px",
  zIndex: 9999,
};

const modalCardStyle: React.CSSProperties = {
  width: "100%",
  maxWidth: "620px",
  maxHeight: "88vh",
  overflowY: "auto",
  background: "#ffffff",
  borderRadius: "20px",
  padding: "20px",
  boxShadow: "0 20px 60px rgba(0,0,0,0.35)",
};

const modalHeaderStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: "16px",
  borderBottom: "1px solid #e5e7eb",
  paddingBottom: "14px",
};

const modalBodyStyle: React.CSSProperties = {
  display: "grid",
  gap: "14px",
  marginTop: "16px",
};

const closeButtonStyle: React.CSSProperties = {
  width: "36px",
  height: "36px",
  borderRadius: "999px",
  border: "none",
  background: "#f3f4f6",
  color: "#111827",
  fontSize: "24px",
  lineHeight: "24px",
  cursor: "pointer",
};

const primaryModalButtonStyle: React.CSSProperties = {
  border: "none",
  background: "#064e3b",
  color: "#ffffff",
  padding: "13px 14px",
  borderRadius: "12px",
  fontWeight: 800,
  cursor: "pointer",
  fontSize: "14px",
};

const secondaryModalButtonStyle: React.CSSProperties = {
  border: "1px solid #d1d5db",
  background: "#ffffff",
  color: "#111827",
  padding: "12px 14px",
  borderRadius: "12px",
  fontWeight: 700,
  cursor: "pointer",
  fontSize: "14px",
};

const helpTextStyle: React.CSSProperties = {
  margin: 0,
  color: "#4b5563",
  fontSize: "13px",
  lineHeight: 1.6,
};

const accountCardStyle: React.CSSProperties = {
  display: "grid",
  gap: "7px",
  padding: "14px",
  borderRadius: "14px",
  background: "#f0fdf4",
  border: "1px solid #bbf7d0",
  color: "#064e3b",
  fontSize: "14px",
};

const questionBoxStyle: React.CSSProperties = {
  padding: "14px",
  border: "1px solid #e5e7eb",
  borderRadius: "14px",
  background: "#f9fafb",
};

const questionTitleStyle: React.CSSProperties = {
  margin: "0 0 10px",
  color: "#111827",
  fontWeight: 800,
  fontSize: "14px",
  lineHeight: 1.5,
};

const optionLabelStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "8px",
  padding: "10px",
  borderRadius: "10px",
  background: "#ffffff",
  border: "1px solid #e5e7eb",
  cursor: "pointer",
  fontSize: "14px",
};

const successBoxStyle: React.CSSProperties = {
  padding: "14px",
  borderRadius: "14px",
  background: "#ecfdf5",
  border: "1px solid #a7f3d0",
  color: "#065f46",
  fontWeight: 700,
  fontSize: "14px",
};
