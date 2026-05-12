"use client";

import {
  ChangeEvent,
  CSSProperties,
  ReactNode,
  useEffect,
  useState,
} from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { supabase } from "@/lib/supabase";
import LogoutButton from "@/app/components/LogoutButton";

type TeacherInfo = {
  full_name: string;
  photo_url: string | null;
  role: string;
  teacher_id: string;
  username: string;
  phone: string;
};

const PROFILE_BUCKET = "teacher-photos";

const softwareCards = [
  {
    title: "Teacher Attendance",
    description: "Check in and out",
    href: "/teacher-attendance",
    emoji: "📊",
    bg: "#eef2ff",
    accent: "#4f46e5",
  },
  {
    title: "Feeding",
    description: "Feeding records",
    href: "/feeding",
    emoji: "🍽️",
    bg: "#fff7ed",
    accent: "#ea580c",
  },
  {
    title: "Students Database",
    description: "Student records",
    href: "/sds",
    emoji: "🎓",
    bg: "#ecfdf5",
    accent: "#059669",
  },
  {
    title: "Report Card",
    description: "Results and reports",
    href: "/report-card",
    emoji: "📘",
    bg: "#eff6ff",
    accent: "#2563eb",
  },
  {
    title: "Fees",
    description: "Class fee info",
    href: "/fees/teacher",
    emoji: "💳",
    bg: "#fefce8",
    accent: "#ca8a04",
  },
  {
    title: "Books",
    description: "Student books",
    href: "/books/teacher",
    emoji: "📚",
    bg: "#f5f3ff",
    accent: "#7c3aed",
  },
  {
    title: "Uniforms",
    description: "Student uniforms",
    href: "/uniforms/teacher",
    emoji: "👕",
    bg: "#f0fdfa",
    accent: "#0f766e",
  },
];

export default function TeacherDashboardPageClient() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);

  const [schoolName, setSchoolName] = useState("School");
  const [authUserId, setAuthUserId] = useState("");

  const [teacherInfo, setTeacherInfo] = useState<TeacherInfo>({
    full_name: "Teacher",
    photo_url: null,
    role: "teacher",
    teacher_id: "",
    username: "",
    phone: "",
  });

  const [assignedClasses, setAssignedClasses] = useState<string[]>([]);
  const [assignedSubjects, setAssignedSubjects] = useState<string[]>([]);

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState("");
  const [passwordError, setPasswordError] = useState("");

  const [photoLoading, setPhotoLoading] = useState(false);
  const [photoMessage, setPhotoMessage] = useState("");
  const [photoError, setPhotoError] = useState("");

  useEffect(() => {
    async function loadDashboardData() {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        const currentAuthUserId = session?.user?.id ?? "";
        setAuthUserId(currentAuthUserId);

        const { data: settings } = await supabase
          .from("school_settings")
          .select("school_name")
          .limit(1)
          .single();

        if (settings?.school_name) {
          setSchoolName(settings.school_name);
        }

        if (!currentAuthUserId) return;

        const { data: teacher } = await supabase
          .from("teachers")
          .select("full_name, photo_url, role, teacher_id, username, phone")
          .eq("auth_user_id", currentAuthUserId)
          .limit(1)
          .single();

        if (teacher) {
          const loadedTeacher: TeacherInfo = {
            full_name: teacher.full_name ?? "Teacher",
            photo_url: teacher.photo_url ?? null,
            role: teacher.role ?? "teacher",
            teacher_id: teacher.teacher_id ?? "",
            username: teacher.username ?? "",
            phone: teacher.phone ?? "",
          };

          setTeacherInfo(loadedTeacher);
          await loadTeacherAssignments(
            currentAuthUserId,
            loadedTeacher.teacher_id
          );
        }
      } catch (error) {
        console.error("Dashboard data load error:", error);
      }
    }

    loadDashboardData();
  }, []);

  async function loadTeacherAssignments(
    currentAuthUserId: string,
    teacherId: string
  ) {
    const classResults: string[] = [];
    const subjectResults: string[] = [];

    const classColumns = [
      "assigned_classes",
      "classes",
      "class_names",
      "class_name",
      "assigned_class",
      "class_assigned",
      "class_teacher_of",
    ];

    const subjectColumns = [
      "assigned_subjects",
      "subjects",
      "subject_names",
      "subject_name",
      "assigned_subject",
      "subject_assigned",
    ];

    for (const column of classColumns) {
      const value = await readTeacherColumn(column, currentAuthUserId);
      classResults.push(...normalizeList(value));
    }

    for (const column of subjectColumns) {
      const value = await readTeacherColumn(column, currentAuthUserId);
      subjectResults.push(...normalizeList(value));
    }

    const relationTables = [
      "teacher_assignments",
      "teacher_classes",
      "teacher_subjects",
      "class_teachers",
      "subject_teachers",
    ];

    for (const table of relationTables) {
      const rows = await readAssignmentTable(
        table,
        teacherId,
        currentAuthUserId
      );

      rows.forEach((row) => {
        classResults.push(
          ...normalizeList(row.class_name),
          ...normalizeList(row.class),
          ...normalizeList(row.classes),
          ...normalizeList(row.assigned_class),
          ...normalizeList(row.assigned_classes)
        );

        subjectResults.push(
          ...normalizeList(row.subject_name),
          ...normalizeList(row.subject),
          ...normalizeList(row.subjects),
          ...normalizeList(row.assigned_subject),
          ...normalizeList(row.assigned_subjects)
        );
      });
    }

    setAssignedClasses(uniqueCleanList(classResults));
    setAssignedSubjects(uniqueCleanList(subjectResults));
  }

  async function readTeacherColumn(column: string, currentAuthUserId: string) {
    try {
      const { data, error } = await supabase
        .from("teachers")
        .select(column)
        .eq("auth_user_id", currentAuthUserId)
        .limit(1)
        .maybeSingle();

      if (error || !data) return null;

      const row = data as unknown as Record<string, unknown>;

      return row[column] ?? null;
    } catch {
      return null;
    }
  }

  async function readAssignmentTable(
    table: string,
    teacherId: string,
    currentAuthUserId: string
  ) {
    try {
      const teacherFilters = [
        { column: "teacher_id", value: teacherId },
        { column: "auth_user_id", value: currentAuthUserId },
      ];

      for (const filter of teacherFilters) {
        if (!filter.value) continue;

        const { data, error } = await supabase
          .from(table)
          .select("*")
          .eq(filter.column, filter.value);

        if (!error && data) {
          return data as Record<string, unknown>[];
        }
      }

      return [];
    } catch {
      return [];
    }
  }

  function normalizeList(value: unknown): string[] {
    if (!value) return [];

    if (Array.isArray(value)) {
      return value.flatMap((item) => normalizeList(item)).filter(Boolean);
    }

    if (typeof value === "object") {
      const item = value as Record<string, unknown>;

      return [
        ...normalizeList(item.name),
        ...normalizeList(item.title),
        ...normalizeList(item.class_name),
        ...normalizeList(item.subject_name),
      ];
    }

    if (typeof value === "string") {
      return value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
    }

    return [String(value)];
  }

  function uniqueCleanList(items: string[]) {
    return Array.from(
      new Set(
        items
          .map((item) => item.trim())
          .filter(
            (item) => item && item !== "-" && item.toLowerCase() !== "null"
          )
      )
    );
  }

  function openAboutModal() {
    setMenuOpen(false);
    setAboutOpen(true);
    setPhotoMessage("");
    setPhotoError("");
  }

  function openPasswordModal() {
    setMenuOpen(false);
    setPasswordOpen(true);
    setNewPassword("");
    setConfirmPassword("");
    setPasswordMessage("");
    setPasswordError("");
  }

  async function handlePasswordChange() {
    setPasswordMessage("");
    setPasswordError("");

    if (!newPassword.trim()) {
      setPasswordError("Enter the new password.");
      return;
    }

    if (newPassword.length < 6) {
      setPasswordError("Password must be at least 6 characters.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError("Passwords do not match.");
      return;
    }

    try {
      setPasswordLoading(true);

      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) {
        setPasswordError(error.message);
        return;
      }

      setPasswordMessage("Password changed successfully.");
      setNewPassword("");
      setConfirmPassword("");
    } catch (error) {
      console.error("Password change error:", error);
      setPasswordError("Could not change password. Try again.");
    } finally {
      setPasswordLoading(false);
    }
  }

  async function handleProfilePictureUpload(
    event: ChangeEvent<HTMLInputElement>
  ) {
    const file = event.target.files?.[0];

    setPhotoMessage("");
    setPhotoError("");

    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setPhotoError("Please select an image file.");
      return;
    }

    if (!authUserId) {
      setPhotoError("You are not properly logged in.");
      return;
    }

    try {
      setPhotoLoading(true);

      const fileExt = file.name.split(".").pop() || "jpg";
      const safeTeacherId = teacherInfo.teacher_id || authUserId;
      const filePath = `${safeTeacherId}/${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from(PROFILE_BUCKET)
        .upload(filePath, file, {
          cacheControl: "3600",
          upsert: true,
        });

      if (uploadError) {
        setPhotoError(
          `Upload failed. Make sure Supabase Storage bucket "${PROFILE_BUCKET}" exists and is public.`
        );
        return;
      }

      const { data: publicUrlData } = supabase.storage
        .from(PROFILE_BUCKET)
        .getPublicUrl(filePath);

      const photoUrl = publicUrlData.publicUrl;

      const { error: updateError } = await supabase
        .from("teachers")
        .update({ photo_url: photoUrl })
        .eq("auth_user_id", authUserId);

      if (updateError) {
        setPhotoError(updateError.message);
        return;
      }

      setTeacherInfo((prev) => ({
        ...prev,
        photo_url: photoUrl,
      }));

      setPhotoMessage("Profile picture updated.");
    } catch (error) {
      console.error("Profile picture upload error:", error);
      setPhotoError("Could not upload profile picture. Try again.");
    } finally {
      setPhotoLoading(false);
      event.target.value = "";
    }
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "linear-gradient(180deg, #f8fafc 0%, #eef2ff 100%)",
        fontFamily: "Arial, sans-serif",
      }}
    >
      <header
        style={{
          height: "66px",
          background: "#ffffff",
          borderBottom: "1px solid #e5e7eb",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 14px",
          position: "sticky",
          top: 0,
          zIndex: 30,
        }}
      >
        <div
          style={{
            minWidth: 0,
            display: "flex",
            alignItems: "center",
            gap: "10px",
          }}
        >
          <div
            style={{
              width: "40px",
              height: "40px",
              borderRadius: "14px",
              overflow: "hidden",
              background: "#eef2ff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              border: "1px solid #e0e7ff",
            }}
          >
            {teacherInfo.photo_url ? (
              <img
                src={teacherInfo.photo_url}
                alt={teacherInfo.full_name}
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                }}
              />
            ) : (
              <span style={{ fontSize: "18px" }}>👤</span>
            )}
          </div>

          <div style={{ minWidth: 0 }}>
            <h1
              style={{
                margin: 0,
                fontSize: "15px",
                fontWeight: 900,
                color: "#111827",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                maxWidth: "235px",
              }}
            >
              {schoolName}
            </h1>

            <p
              style={{
                margin: "3px 0 0",
                fontSize: "11px",
                color: "#6b7280",
                fontWeight: 700,
              }}
            >
              Teacher Dashboard
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setMenuOpen(true)}
          aria-label="Open menu"
          style={{
            border: "none",
            background: "#f3f4f6",
            padding: 0,
            width: "40px",
            height: "40px",
            borderRadius: "14px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            flexShrink: 0,
          }}
        >
          <div style={{ display: "grid", gap: "4px" }}>
            <span style={hamburgerLineStyle} />
            <span style={hamburgerLineStyle} />
            <span style={hamburgerLineStyle} />
          </div>
        </button>
      </header>

      <AnimatePresence>
        {menuOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              onClick={() => setMenuOpen(false)}
              style={overlayStyle}
            />

            <motion.aside
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "tween", duration: 0.2 }}
              style={sideMenuStyle}
            >
              <div style={menuHeaderStyle}>
                <div>
                  <h2
                    style={{
                      margin: 0,
                      fontSize: "17px",
                      color: "#111827",
                      fontWeight: 900,
                    }}
                  >
                    ☰ Menu
                  </h2>
                  <p
                    style={{
                      margin: "4px 0 0",
                      fontSize: "11px",
                      color: "#6b7280",
                      fontWeight: 700,
                    }}
                  >
                    Quick actions
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setMenuOpen(false)}
                  aria-label="Close menu"
                  style={closeButtonStyle}
                >
                  ×
                </button>
              </div>

              <div style={{ padding: "14px", display: "grid", gap: "10px" }}>
                <LinkItem
                  href="/dashboard/teacher"
                  label="🏠 Dashboard"
                  bg="#eef2ff"
                  color="#3730a3"
                  onClick={() => setMenuOpen(false)}
                />

                <button
                  type="button"
                  onClick={openAboutModal}
                  style={{
                    ...menuButtonStyle,
                    background: "#ecfdf5",
                    color: "#047857",
                    borderColor: "#a7f3d0",
                  }}
                >
                  👤 About Me
                </button>

                <button
                  type="button"
                  onClick={openPasswordModal}
                  style={{
                    ...menuButtonStyle,
                    background: "#fff7ed",
                    color: "#c2410c",
                    borderColor: "#fed7aa",
                  }}
                >
                  🔐 Change Password
                </button>

                <div>
                  <LogoutButton
                    onDone={() => {
                      setMenuOpen(false);
                      setAboutOpen(false);
                      setPasswordOpen(false);
                    }}
                    style={{
                      width: "100%",
                      background: "#b91c1c",
                      color: "#ffffff",
                      borderRadius: "16px",
                      padding: "13px 14px",
                      fontWeight: 900,
                      fontSize: "13px",
                    }}
                  />
                </div>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {aboutOpen && (
          <BottomSheet title="👤 About Me" onClose={() => setAboutOpen(false)}>
            <div style={{ display: "grid", gap: "14px" }}>
              <div style={profileTopStyle}>
                <div style={profileImageStyle}>
                  {teacherInfo.photo_url ? (
                    <img
                      src={teacherInfo.photo_url}
                      alt={teacherInfo.full_name}
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                      }}
                    />
                  ) : (
                    <span style={{ fontSize: "30px" }}>👤</span>
                  )}
                </div>

                <div style={{ minWidth: 0 }}>
                  <h3
                    style={{
                      margin: 0,
                      color: "#111827",
                      fontSize: "19px",
                      fontWeight: 900,
                      lineHeight: 1.2,
                    }}
                  >
                    {teacherInfo.full_name}
                  </h3>

                  <p
                    style={{
                      margin: "6px 0 0",
                      color: "#6b7280",
                      fontSize: "13px",
                      fontWeight: 800,
                      textTransform: "capitalize",
                    }}
                  >
                    {teacherInfo.role}
                  </p>
                </div>
              </div>

              <label style={uploadButtonStyle}>
                {photoLoading ? "⏳ Uploading..." : "📷 Add Profile Picture"}
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleProfilePictureUpload}
                  disabled={photoLoading}
                  style={{ display: "none" }}
                />
              </label>

              {photoMessage && <SuccessText text={photoMessage} />}
              {photoError && <ErrorText text={photoError} />}

              <div style={infoGridStyle}>
                <InfoRow label="Full Name" value={teacherInfo.full_name} />
                <InfoRow label="Teacher ID" value={teacherInfo.teacher_id} />
                <InfoRow label="Username" value={teacherInfo.username} />
                <InfoRow label="Phone" value={teacherInfo.phone} />
                <InfoRow label="Role" value={teacherInfo.role} />
                <InfoRow
                  label="Class(es) Assigned"
                  value={
                    assignedClasses.length > 0
                      ? assignedClasses.join(", ")
                      : "No class assigned yet"
                  }
                />
                <InfoRow
                  label="Subject(s)"
                  value={
                    assignedSubjects.length > 0
                      ? assignedSubjects.join(", ")
                      : "No subject assigned yet"
                  }
                />
              </div>
            </div>
          </BottomSheet>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {passwordOpen && (
          <BottomSheet
            title="🔐 Change Password"
            onClose={() => setPasswordOpen(false)}
          >
            <div style={{ display: "grid", gap: "12px" }}>
              <div>
                <label style={labelStyle}>New Password</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  placeholder="Enter new password"
                  style={inputStyle}
                />
              </div>

              <div>
                <label style={labelStyle}>Confirm Password</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  placeholder="Confirm new password"
                  style={inputStyle}
                />
              </div>

              {passwordMessage && <SuccessText text={passwordMessage} />}
              {passwordError && <ErrorText text={passwordError} />}

              <button
                type="button"
                onClick={handlePasswordChange}
                disabled={passwordLoading}
                style={{
                  border: "none",
                  background: passwordLoading ? "#9ca3af" : "#111827",
                  color: "#ffffff",
                  borderRadius: "16px",
                  padding: "13px 16px",
                  fontWeight: 900,
                  fontSize: "14px",
                  cursor: passwordLoading ? "not-allowed" : "pointer",
                  marginTop: "2px",
                }}
              >
                {passwordLoading ? "Changing..." : "Change Password"}
              </button>
            </div>
          </BottomSheet>
        )}
      </AnimatePresence>

      <div
        style={{
          maxWidth: "520px",
          margin: "0 auto",
          padding: "16px 12px 28px",
        }}
      >
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          style={{
            background: "linear-gradient(135deg, #111827 0%, #1e3a8a 100%)",
            borderRadius: "24px",
            padding: "18px",
            boxShadow: "0 8px 24px rgba(15,23,42,0.18)",
            marginBottom: "16px",
            color: "#ffffff",
          }}
        >
          <p
            style={{
              margin: 0,
              fontSize: "11px",
              fontWeight: 900,
              letterSpacing: "0.8px",
              textTransform: "uppercase",
              opacity: 0.75,
            }}
          >
            Welcome back
          </p>

          <h2
            style={{
              margin: "7px 0 0",
              fontSize: "22px",
              lineHeight: 1.2,
              fontWeight: 900,
            }}
          >
            {teacherInfo.full_name}
          </h2>

          <p
            style={{
              margin: "9px 0 0",
              fontSize: "13px",
              lineHeight: 1.5,
              color: "rgba(255,255,255,0.78)",
            }}
          >
            Choose what you want to continue.
          </p>
        </motion.div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
            gap: "12px",
          }}
        >
          {softwareCards.map((card, index) => (
            <motion.div
              key={card.title}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, delay: index * 0.04 }}
            >
              <Link
                href={card.href}
                style={{
                  textDecoration: "none",
                  color: "inherit",
                  display: "block",
                  height: "100%",
                }}
              >
                <motion.div
                  whileTap={{ scale: 0.97 }}
                  transition={{ type: "spring", stiffness: 260, damping: 18 }}
                  style={{
                    background: "#ffffff",
                    borderRadius: "22px",
                    padding: "14px",
                    minHeight: "150px",
                    boxShadow: "0 6px 18px rgba(15,23,42,0.08)",
                    border: "1px solid #e5e7eb",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                  }}
                >
                  <div>
                    <div
                      style={{
                        width: "48px",
                        height: "48px",
                        borderRadius: "16px",
                        background: card.bg,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "24px",
                        marginBottom: "12px",
                      }}
                    >
                      {card.emoji}
                    </div>

                    <h3
                      style={{
                        margin: 0,
                        fontSize: "15px",
                        lineHeight: 1.2,
                        color: "#111827",
                        fontWeight: 900,
                      }}
                    >
                      {card.title}
                    </h3>

                    <p
                      style={{
                        margin: "8px 0 0",
                        fontSize: "11px",
                        lineHeight: 1.45,
                        color: "#6b7280",
                        fontWeight: 700,
                      }}
                    >
                      {card.description}
                    </p>
                  </div>

                  <div
                    style={{
                      marginTop: "12px",
                      color: card.accent,
                      fontSize: "11px",
                      fontWeight: 900,
                    }}
                  >
                    Open →
                  </div>
                </motion.div>
              </Link>
            </motion.div>
          ))}
        </div>
      </div>
    </main>
  );
}

function BottomSheet({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        onClick={onClose}
        style={overlayStyle}
      />

      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "tween", duration: 0.22 }}
        style={bottomSheetStyle}
      >
        <div style={sheetHandleStyle} />

        <div style={sheetHeaderStyle}>
          <h2
            style={{
              margin: 0,
              color: "#111827",
              fontSize: "18px",
              fontWeight: 900,
            }}
          >
            {title}
          </h2>

          <button type="button" onClick={onClose} style={closeButtonStyle}>
            ×
          </button>
        </div>

        <div style={{ padding: "4px 16px 18px" }}>{children}</div>
      </motion.div>
    </>
  );
}

function LinkItem({
  href,
  label,
  bg,
  color,
  onClick,
}: {
  href: string;
  label: string;
  bg: string;
  color: string;
  onClick?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      style={{
        textDecoration: "none",
        background: bg,
        color,
        border: "1px solid rgba(0,0,0,0.06)",
        borderRadius: "16px",
        padding: "13px 14px",
        fontWeight: 900,
        fontSize: "13px",
        lineHeight: 1.35,
      }}
    >
      {label}
    </Link>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        background: "#ffffff",
        border: "1px solid #e5e7eb",
        borderRadius: "14px",
        padding: "10px",
      }}
    >
      <p
        style={{
          margin: 0,
          fontSize: "9px",
          color: "#6b7280",
          marginBottom: "4px",
          fontWeight: 900,
          textTransform: "uppercase",
          letterSpacing: "0.4px",
        }}
      >
        {label}
      </p>

      <p
        style={{
          margin: 0,
          fontSize: "12px",
          color: "#111827",
          fontWeight: 800,
          lineHeight: 1.45,
          textTransform: label === "Role" ? "capitalize" : "none",
        }}
      >
        {value || "-"}
      </p>
    </div>
  );
}

function SuccessText({ text }: { text: string }) {
  return (
    <p
      style={{
        margin: 0,
        background: "#ecfdf5",
        color: "#047857",
        border: "1px solid #a7f3d0",
        borderRadius: "14px",
        padding: "10px 12px",
        fontSize: "12px",
        fontWeight: 800,
      }}
    >
      {text}
    </p>
  );
}

function ErrorText({ text }: { text: string }) {
  return (
    <p
      style={{
        margin: 0,
        background: "#fef2f2",
        color: "#b91c1c",
        border: "1px solid #fecaca",
        borderRadius: "14px",
        padding: "10px 12px",
        fontSize: "12px",
        fontWeight: 800,
      }}
    >
      {text}
    </p>
  );
}

const hamburgerLineStyle: CSSProperties = {
  display: "block",
  width: "21px",
  height: "2.5px",
  background: "#111827",
  borderRadius: "999px",
};

const overlayStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(15,23,42,0.42)",
  zIndex: 40,
};

const sideMenuStyle: CSSProperties = {
  position: "fixed",
  top: 0,
  right: 0,
  width: "78%",
  maxWidth: "300px",
  height: "100vh",
  background: "#ffffff",
  zIndex: 50,
  boxShadow: "-12px 0 34px rgba(0,0,0,0.18)",
  display: "flex",
  flexDirection: "column",
};

const menuHeaderStyle: CSSProperties = {
  height: "72px",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "0 16px",
  borderBottom: "1px solid #e5e7eb",
};

const menuButtonStyle: CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: "16px",
  padding: "13px 14px",
  fontWeight: 900,
  fontSize: "13px",
  cursor: "pointer",
  textAlign: "left",
};

const closeButtonStyle: CSSProperties = {
  border: "none",
  background: "#f3f4f6",
  fontSize: "24px",
  lineHeight: 1,
  cursor: "pointer",
  color: "#111827",
  width: "34px",
  height: "34px",
  borderRadius: "12px",
};

const bottomSheetStyle: CSSProperties = {
  position: "fixed",
  left: 0,
  right: 0,
  bottom: 0,
  width: "100%",
  maxHeight: "88vh",
  overflowY: "auto",
  background: "#ffffff",
  borderTopLeftRadius: "28px",
  borderTopRightRadius: "28px",
  boxShadow: "0 -20px 50px rgba(0,0,0,0.24)",
  zIndex: 60,
};

const sheetHandleStyle: CSSProperties = {
  width: "48px",
  height: "5px",
  borderRadius: "999px",
  background: "#d1d5db",
  margin: "10px auto 6px",
};

const sheetHeaderStyle: CSSProperties = {
  position: "sticky",
  top: 0,
  background: "#ffffff",
  zIndex: 2,
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "10px 16px 14px",
  borderBottom: "1px solid #f3f4f6",
};

const profileTopStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "13px",
  background: "linear-gradient(135deg, #eef2ff 0%, #ecfeff 100%)",
  borderRadius: "20px",
  padding: "13px",
};

const profileImageStyle: CSSProperties = {
  width: "72px",
  height: "72px",
  borderRadius: "22px",
  background: "#ffffff",
  overflow: "hidden",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
  border: "1px solid #e5e7eb",
};

const uploadButtonStyle: CSSProperties = {
  display: "block",
  background: "#111827",
  border: "none",
  borderRadius: "16px",
  padding: "13px",
  cursor: "pointer",
  color: "#ffffff",
  fontSize: "13px",
  fontWeight: 900,
  textAlign: "center",
};

const infoGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: "10px",
  background: "#f8fafc",
  border: "1px solid #e5e7eb",
  borderRadius: "18px",
  padding: "10px",
};

const labelStyle: CSSProperties = {
  display: "block",
  fontSize: "12px",
  color: "#374151",
  fontWeight: 900,
  marginBottom: "6px",
};

const inputStyle: CSSProperties = {
  width: "100%",
  border: "1px solid #d1d5db",
  borderRadius: "14px",
  padding: "12px 13px",
  fontSize: "14px",
  outline: "none",
  boxSizing: "border-box",
};