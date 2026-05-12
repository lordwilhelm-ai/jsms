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
    description: "Track and manage teacher attendance records",
    href: "/teacher-attendance",
    emoji: "📊",
  },
  {
    title: "Feeding",
    description: "Record feeding and attendance",
    href: "/feeding",
    emoji: "🍽️",
  },
  {
    title: "Students Database",
    description: "View student details and records",
    href: "/sds",
    emoji: "🎓",
  },
  {
    title: "Report Card",
    description: "Upload results and manage reports",
    href: "/report-card",
    emoji: "📘",
  },
  {
    title: "Fees",
    description: "View class fee information",
    href: "/fees/teacher",
    emoji: "💳",
  },
  {
    title: "Books",
    description: "View books given or sold to students in your class",
    href: "/books/teacher",
    emoji: "📚",
  },
  {
    title: "Uniforms",
    description: "View uniforms given or sold to students in your class",
    href: "/uniforms/teacher",
    emoji: "👕",
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
        background: "#f3f4f6",
        fontFamily: "Arial, sans-serif",
      }}
    >
      <header
        style={{
          height: "72px",
          background: "#ffffff",
          borderBottom: "1px solid #e5e7eb",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 16px",
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
            gap: "12px",
          }}
        >
          <div
            style={{
              width: "42px",
              height: "42px",
              borderRadius: "14px",
              overflow: "hidden",
              background: "#eef7fd",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
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
                fontSize: "17px",
                fontWeight: 800,
                color: "#111827",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {schoolName}
            </h1>

            <p
              style={{
                margin: "3px 0 0",
                fontSize: "11px",
                color: "#6b7280",
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
            background: "transparent",
            padding: 0,
            width: "40px",
            height: "40px",
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
              transition={{ duration: 0.2 }}
              onClick={() => setMenuOpen(false)}
              style={overlayStyle}
            />

            <motion.aside
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "tween", duration: 0.22 }}
              style={sideMenuStyle}
            >
              <div style={menuHeaderStyle}>
                <h2
                  style={{
                    margin: 0,
                    fontSize: "15px",
                    color: "#111827",
                    fontWeight: 800,
                  }}
                >
                  Menu
                </h2>

                <button
                  type="button"
                  onClick={() => setMenuOpen(false)}
                  aria-label="Close menu"
                  style={closeButtonStyle}
                >
                  ×
                </button>
              </div>

              <div
                style={{
                  padding: "14px",
                  display: "flex",
                  flexDirection: "column",
                  height: "100%",
                }}
              >
                <div style={{ display: "grid", gap: "8px" }}>
                  <LinkItem
                    href="/dashboard/teacher"
                    label="Dashboard"
                    onClick={() => setMenuOpen(false)}
                  />

                  <button
                    type="button"
                    onClick={openAboutModal}
                    style={menuButtonStyle}
                  >
                    About Me
                  </button>

                  <button
                    type="button"
                    onClick={openPasswordModal}
                    style={menuButtonStyle}
                  >
                    Change Password
                  </button>
                </div>

                <div style={{ marginTop: "auto", paddingTop: "18px" }}>
                  <LogoutButton
                    onDone={() => {
                      setMenuOpen(false);
                      setAboutOpen(false);
                      setPasswordOpen(false);
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
          <Modal title="About Me" onClose={() => setAboutOpen(false)}>
            <div
              style={{
                display: "grid",
                gap: "16px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "14px",
                }}
              >
                <div
                  style={{
                    width: "76px",
                    height: "76px",
                    borderRadius: "22px",
                    background: "#eef7fd",
                    overflow: "hidden",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
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
                    <span style={{ fontSize: "30px" }}>👤</span>
                  )}
                </div>

                <div style={{ minWidth: 0 }}>
                  <h3
                    style={{
                      margin: 0,
                      color: "#111827",
                      fontSize: "20px",
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
                      fontWeight: 700,
                      textTransform: "capitalize",
                    }}
                  >
                    {teacherInfo.role}
                  </p>
                </div>
              </div>

              <label
                style={{
                  display: "block",
                  background: "#f9fafb",
                  border: "1px dashed #cbd5e1",
                  borderRadius: "16px",
                  padding: "13px",
                  cursor: photoLoading ? "not-allowed" : "pointer",
                  color: "#111827",
                  fontSize: "13px",
                  fontWeight: 800,
                  textAlign: "center",
                }}
              >
                {photoLoading ? "Uploading..." : "Upload Profile Picture"}
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
          </Modal>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {passwordOpen && (
          <Modal title="Change Password" onClose={() => setPasswordOpen(false)}>
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
                  marginTop: "4px",
                }}
              >
                {passwordLoading ? "Changing..." : "Change Password"}
              </button>
            </div>
          </Modal>
        )}
      </AnimatePresence>

      <div
        style={{
          maxWidth: "900px",
          margin: "0 auto",
          padding: "22px 16px 30px",
        }}
      >
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          style={{
            background: "#ffffff",
            borderRadius: "30px",
            padding: "28px 24px",
            boxShadow: "0 4px 14px rgba(0,0,0,0.08)",
            marginBottom: "24px",
          }}
        >
          <h2
            style={{
              margin: 0,
              fontSize: "28px",
              lineHeight: 1.2,
              fontWeight: 800,
              color: "#111827",
            }}
          >
            Hello,{" "}
            <span style={{ color: "#1d9bf0" }}>
              {teacherInfo.full_name}
            </span>
          </h2>

          <p
            style={{
              margin: "14px 0 0",
              fontSize: "16px",
              lineHeight: 1.55,
              color: "#6b7280",
              maxWidth: "460px",
            }}
          >
            Welcome back. Choose the software you want to continue to.
          </p>
        </motion.div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            gap: "18px",
          }}
        >
          {softwareCards.map((card, index) => (
            <motion.div
              key={card.title}
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: index * 0.05 }}
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
                  whileTap={{ scale: 0.98 }}
                  whileHover={{ y: -4 }}
                  transition={{ type: "spring", stiffness: 260, damping: 18 }}
                  style={{
                    background: "#ffffff",
                    borderRadius: "28px",
                    padding: "22px",
                    minHeight: "220px",
                    boxShadow: "0 4px 14px rgba(0,0,0,0.08)",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                  }}
                >
                  <div>
                    <div
                      style={{
                        width: "64px",
                        height: "64px",
                        borderRadius: "18px",
                        background: "#eef7fd",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "28px",
                        marginBottom: "18px",
                      }}
                    >
                      {card.emoji}
                    </div>

                    <h3
                      style={{
                        margin: 0,
                        fontSize: "20px",
                        lineHeight: 1.25,
                        color: "#111827",
                        fontWeight: 800,
                      }}
                    >
                      {card.title}
                    </h3>

                    <p
                      style={{
                        margin: "14px 0 0",
                        fontSize: "14px",
                        lineHeight: 1.7,
                        color: "#6b7280",
                      }}
                    >
                      {card.description}
                    </p>
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

function Modal({
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
        transition={{ duration: 0.2 }}
        onClick={onClose}
        style={overlayStyle}
      />

      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.98 }}
        transition={{ type: "spring", stiffness: 240, damping: 22 }}
        style={modalStyle}
      >
        <div style={modalHeaderStyle}>
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

        <div style={{ padding: "16px" }}>{children}</div>
      </motion.div>
    </>
  );
}

function LinkItem({
  href,
  label,
  onClick,
}: {
  href: string;
  label: string;
  onClick?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      style={{
        textDecoration: "none",
        color: "#111827",
        background: "#f9fafb",
        border: "1px solid #e5e7eb",
        borderRadius: "14px",
        padding: "12px 13px",
        fontWeight: 800,
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
    <div>
      <p
        style={{
          margin: 0,
          fontSize: "10px",
          color: "#6b7280",
          marginBottom: "4px",
          fontWeight: 800,
          textTransform: "uppercase",
          letterSpacing: "0.4px",
        }}
      >
        {label}
      </p>

      <p
        style={{
          margin: 0,
          fontSize: "13px",
          color: "#111827",
          fontWeight: 700,
          lineHeight: 1.5,
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
  width: "23px",
  height: "2.5px",
  background: "#111827",
  borderRadius: "999px",
};

const overlayStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.32)",
  zIndex: 40,
};

const sideMenuStyle: CSSProperties = {
  position: "fixed",
  top: 0,
  right: 0,
  width: "76%",
  maxWidth: "285px",
  height: "100vh",
  background: "#ffffff",
  zIndex: 50,
  boxShadow: "-10px 0 30px rgba(0,0,0,0.16)",
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
  background: "#f9fafb",
  color: "#111827",
  borderRadius: "14px",
  padding: "12px 13px",
  fontWeight: 800,
  fontSize: "13px",
  cursor: "pointer",
  textAlign: "left",
};

const closeButtonStyle: CSSProperties = {
  border: "none",
  background: "transparent",
  fontSize: "28px",
  lineHeight: 1,
  cursor: "pointer",
  color: "#111827",
};

const modalStyle: CSSProperties = {
  position: "fixed",
  left: "50%",
  top: "50%",
  transform: "translate(-50%, -50%)",
  width: "calc(100% - 28px)",
  maxWidth: "440px",
  maxHeight: "86vh",
  overflowY: "auto",
  background: "#ffffff",
  borderRadius: "24px",
  boxShadow: "0 24px 60px rgba(0,0,0,0.25)",
  zIndex: 60,
};

const modalHeaderStyle: CSSProperties = {
  position: "sticky",
  top: 0,
  background: "#ffffff",
  zIndex: 2,
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "16px",
  borderBottom: "1px solid #e5e7eb",
};

const infoGridStyle: CSSProperties = {
  display: "grid",
  gap: "12px",
  background: "#f8fafc",
  border: "1px solid #e5e7eb",
  borderRadius: "18px",
  padding: "14px",
};

const labelStyle: CSSProperties = {
  display: "block",
  fontSize: "12px",
  color: "#374151",
  fontWeight: 800,
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