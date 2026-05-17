"use client";

import { ChangeEvent, CSSProperties, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { supabase } from "@/lib/supabase";
import LogoutButton from "@/app/components/LogoutButton";
import TeacherAnnouncementBanner from "@/components/TeacherAnnouncementBanner";

type TeacherInfo = {
  id: string;
  full_name: string;
  photo_url: string | null;
  role: string;
  teacher_id: string;
  username: string;
  phone: string;
  password_changed?: boolean | null;
};

type ClassRow = {
  id: string;
  name?: string | null;
  class_name?: string | null;
  class_order?: number | null;
};

type SubjectRow = {
  id: string;
  name?: string | null;
  subject_name?: string | null;
};

const PROFILE_BUCKET = "teacher-photos";

const softwareCards = [
  {
    title: "Attendance",
    description: "Check in/out",
    href: "/teacher-attendance",
    emoji: "📍",
    bg: "#eef2ff",
    accent: "#4f46e5",
  },
  {
    title: "Feeding",
    description: "Daily feeding",
    href: "/feeding",
    emoji: "🍽️",
    bg: "#fff7ed",
    accent: "#ea580c",
  },
  {
    title: "Students",
    description: "Class records",
    href: "/sds",
    emoji: "🎓",
    bg: "#ecfdf5",
    accent: "#059669",
  },
  {
    title: "Report Card",
    description: "Results",
    href: "/report-card",
    emoji: "📘",
    bg: "#eff6ff",
    accent: "#2563eb",
  },
  {
    title: "Fees",
    description: "Fee status",
    href: "/fees/teacher",
    emoji: "💳",
    bg: "#fefce8",
    accent: "#ca8a04",
  },
  {
    title: "Books",
    description: "Books issued",
    href: "/books/teacher",
    emoji: "📚",
    bg: "#f5f3ff",
    accent: "#7c3aed",
  },
  {
    title: "Uniforms",
    description: "Uniforms",
    href: "/uniforms/teacher",
    emoji: "👕",
    bg: "#f0fdfa",
    accent: "#0f766e",
  },
];

function firstName(name: string) {
  const clean = (name || "Teacher").trim();
  return clean.split(/\s+/)[0] || "Teacher";
}

function greeting() {
  const hour = new Date().getHours();

  if (hour < 12) return "Good Morning";
  if (hour < 17) return "Good Afternoon";
  return "Good Evening";
}

function classLabel(row: ClassRow) {
  return row.class_name || row.name || "Class";
}

function subjectLabel(row: SubjectRow) {
  return row.subject_name || row.name || "Subject";
}

function uniqueCleanList(items: string[]) {
  return Array.from(
    new Set(
      items
        .map((item) => item.trim())
        .filter((item) => item && item !== "-" && item.toLowerCase() !== "null")
    )
  );
}

async function tableExists(table: string) {
  const { error } = await supabase.from(table).select("*").limit(1);
  return !error;
}

export default function TeacherDashboardPageClient() {
  const [loading, setLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [passwordForced, setPasswordForced] = useState(false);

  const [schoolName, setSchoolName] = useState("School");
  const [authUserId, setAuthUserId] = useState("");

  const [teacherInfo, setTeacherInfo] = useState<TeacherInfo>({
    id: "",
    full_name: "Teacher",
    photo_url: null,
    role: "teacher",
    teacher_id: "",
    username: "",
    phone: "",
    password_changed: true,
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

  const teacherFirstName = useMemo(
    () => firstName(teacherInfo.full_name || teacherInfo.username || "Teacher"),
    [teacherInfo.full_name, teacherInfo.username]
  );

  const hasAssignments = assignedClasses.length > 0 || assignedSubjects.length > 0;

  useEffect(() => {
    loadDashboardData();
  }, []);

  async function loadDashboardData() {
    setLoading(true);

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
        .maybeSingle();

      if (settings?.school_name) {
        setSchoolName(settings.school_name);
      }

      if (!currentAuthUserId) return;

      const { data: teacher, error: teacherError } = await supabase
        .from("teachers")
        .select("*")
        .eq("auth_user_id", currentAuthUserId)
        .limit(1)
        .maybeSingle();

      if (teacherError) {
        console.error("Teacher load error:", teacherError);
        return;
      }

      if (!teacher) return;

      const loadedTeacher: TeacherInfo = {
        id: teacher.id ?? "",
        full_name: teacher.full_name ?? teacher.username ?? "Teacher",
        photo_url: teacher.photo_url ?? null,
        role: teacher.role ?? "teacher",
        teacher_id: teacher.teacher_id ?? "",
        username: teacher.username ?? "",
        phone: teacher.phone ?? "",
        password_changed:
          typeof teacher.password_changed === "boolean"
            ? teacher.password_changed
            : typeof teacher.has_changed_password === "boolean"
              ? teacher.has_changed_password
              : true,
      };

      setTeacherInfo(loadedTeacher);
      saveTeacherForGlobalFeatures(loadedTeacher);

      const assignments = await loadTeacherAssignments(loadedTeacher);
      setAssignedClasses(assignments.classes);
      setAssignedSubjects(assignments.subjects);

      if (loadedTeacher.password_changed === false) {
        setPasswordForced(true);
        setPasswordOpen(true);
      }
    } catch (error) {
      console.error("Dashboard data load error:", error);
    } finally {
      setLoading(false);
    }
  }

  function saveTeacherForGlobalFeatures(teacher: TeacherInfo) {
    if (typeof window === "undefined") return;

    const payload = {
      id: teacher.id,
      teacher_id: teacher.teacher_id,
      teacherId: teacher.teacher_id,
      full_name: teacher.full_name,
      username: teacher.username,
      phone: teacher.phone,
      role: "teacher",
      photo_url: teacher.photo_url,
    };

    localStorage.setItem("teacher_id", teacher.teacher_id || "");
    localStorage.setItem("teacherId", teacher.teacher_id || "");
    localStorage.setItem("jsms_teacher_id", teacher.teacher_id || "");
    localStorage.setItem("jsms_role", "teacher");
    localStorage.setItem("teacher", JSON.stringify(payload));
    localStorage.setItem("currentTeacher", JSON.stringify(payload));
  }

  async function loadTeacherAssignments(teacher: TeacherInfo) {
    const classResults: string[] = [];
    const subjectResults: string[] = [];

    const classMap = new Map<string, ClassRow>();

    // Correct JSMS mapping:
    // teacher_class_assignments.teacher_id stores teachers.id UUID.
    const assignmentTables = ["teacher_class_assignments", "teacher_classes"];

    for (const table of assignmentTables) {
      try {
        const { data, error } = await supabase
          .from(table)
          .select("class_id")
          .eq("teacher_id", teacher.id);

        if (!error && data) {
          const classIds = (data as { class_id: string | null }[])
            .map((row) => row.class_id)
            .filter(Boolean) as string[];

          if (classIds.length > 0) {
            const { data: classesData } = await supabase
              .from("classes")
              .select("id, name, class_name, class_order")
              .in("id", classIds)
              .order("class_order", { ascending: true });

            (classesData || []).forEach((row: ClassRow) => {
              classMap.set(row.id, row);
              classResults.push(classLabel(row));
            });
          }
        }
      } catch (error) {
        console.warn(`Could not read ${table}`, error);
      }
    }

    // Older fallback from teachers.assigned_classes if used anywhere.
    try {
      const { data } = await supabase
        .from("teachers")
        .select("assigned_classes")
        .eq("id", teacher.id)
        .limit(1)
        .maybeSingle();

      const raw = (data as { assigned_classes?: unknown } | null)?.assigned_classes;

      if (Array.isArray(raw)) {
        raw.forEach((item) => classResults.push(String(item)));
      } else if (typeof raw === "string") {
        raw.split(",").forEach((item) => classResults.push(item.trim()));
      }
    } catch {
      // ignore
    }

    const assignedClassIds = Array.from(classMap.keys());

    // If no subject-specific table exists, show subjects attached to assigned classes.
    if (assignedClassIds.length > 0) {
      try {
        const { data: classSubjects, error } = await supabase
          .from("class_subjects")
          .select("subject_id, class_id")
          .in("class_id", assignedClassIds);

        if (!error && classSubjects && classSubjects.length > 0) {
          const subjectIds = Array.from(
            new Set(
              (classSubjects as { subject_id: string | null }[])
                .map((row) => row.subject_id)
                .filter(Boolean) as string[]
            )
          );

          if (subjectIds.length > 0) {
            const { data: subjects } = await supabase
              .from("subjects")
              .select("id, name, subject_name")
              .in("id", subjectIds);

            (subjects || []).forEach((row: SubjectRow) => {
              subjectResults.push(subjectLabel(row));
            });
          }
        }
      } catch {
        // subject table may differ. ignore.
      }
    }

    // Subject assignment fallbacks, if any exists.
    const maybeSubjectTables = [
      "teacher_subject_assignments",
      "teacher_subjects",
      "subject_teachers",
    ];

    for (const table of maybeSubjectTables) {
      try {
        const exists = await tableExists(table);
        if (!exists) continue;

        const { data } = await supabase
          .from(table)
          .select("*")
          .or(`teacher_id.eq.${teacher.id},teacher_id.eq.${teacher.teacher_id}`);

        (data || []).forEach((row: Record<string, unknown>) => {
          ["subject_name", "subject", "subjects", "assigned_subject", "assigned_subjects"].forEach(
            (key) => {
              const value = row[key];

              if (Array.isArray(value)) {
                value.forEach((item) => subjectResults.push(String(item)));
              } else if (typeof value === "string") {
                value.split(",").forEach((item) => subjectResults.push(item.trim()));
              }
            }
          );
        });
      } catch {
        // ignore fallback table errors
      }
    }

    return {
      classes: uniqueCleanList(classResults),
      subjects: uniqueCleanList(subjectResults),
    };
  }

  function openAboutModal() {
    setMenuOpen(false);
    setAboutOpen(true);
    setPhotoMessage("");
    setPhotoError("");
  }

  function openPasswordModal(force = false) {
    setMenuOpen(false);
    setPasswordForced(force);
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

      await markPasswordChanged();

      setPasswordMessage("Password changed successfully.");
      setNewPassword("");
      setConfirmPassword("");

      setTeacherInfo((prev) => ({ ...prev, password_changed: true }));
      setPasswordForced(false);

      setTimeout(() => {
        setPasswordOpen(false);
        setPasswordMessage("");
      }, 700);
    } catch (error) {
      console.error("Password change error:", error);
      setPasswordError("Could not change password. Try again.");
    } finally {
      setPasswordLoading(false);
    }
  }

  async function markPasswordChanged() {
    if (!teacherInfo.id && !authUserId) return;

    const updatePayloads: Record<string, unknown>[] = [
      {
        password_changed: true,
        password_changed_at: new Date().toISOString(),
        force_password_change: false,
      },
      {
        has_changed_password: true,
        password_changed_at: new Date().toISOString(),
        force_password_change: false,
      },
      {
        password_changed: true,
      },
    ];

    for (const payload of updatePayloads) {
      const query = supabase.from("teachers").update(payload);

      const { error } = teacherInfo.id
        ? await query.eq("id", teacherInfo.id)
        : await query.eq("auth_user_id", authUserId);

      if (!error) return;
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

      const updatedTeacher = {
        ...teacherInfo,
        photo_url: photoUrl,
      };

      setTeacherInfo(updatedTeacher);
      saveTeacherForGlobalFeatures(updatedTeacher);

      setPhotoMessage("Profile picture updated.");
    } catch (error) {
      console.error("Profile picture upload error:", error);
      setPhotoError("Could not upload profile picture. Try again.");
    } finally {
      setPhotoLoading(false);
      event.target.value = "";
    }
  }

  if (loading) {
    return (
      <main style={styles.loadingPage}>
        <motion.div
          style={styles.loadingCard}
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div style={styles.loadingIcon}>🎓</div>
          <h2 style={{ margin: 0 }}>Opening dashboard...</h2>
        </motion.div>
      </main>
    );
  }

  return (
    <main style={styles.page}>
      <div style={styles.bgCircleOne} />
      <div style={styles.bgCircleTwo} />

      <header style={styles.header}>
        <div style={styles.profileRow}>
          <div style={styles.avatar}>
            {teacherInfo.photo_url ? (
              <img
                src={teacherInfo.photo_url}
                alt={teacherInfo.full_name}
                style={styles.avatarImg}
              />
            ) : (
              <span>{teacherFirstName.charAt(0).toUpperCase()}</span>
            )}
          </div>

          <div style={{ minWidth: 0 }}>
            <p style={styles.schoolName}>{schoolName}</p>
            <h1 style={styles.greeting}>
              {greeting()}, {teacherFirstName}
            </h1>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setMenuOpen(true)}
          style={styles.menuButton}
          aria-label="Open menu"
        >
          ☰
        </button>
      </header>

      <section style={styles.heroCard}>
        <div>
          <p style={styles.heroLabel}>Teacher Dashboard</p>
          <h2 style={styles.heroTitle}>Your school tools are ready.</h2>
        </div>

        <div style={styles.heroStats}>
          <div style={styles.heroStat}>
            <b>{assignedClasses.length}</b>
            <span>Class(es)</span>
          </div>
          <div style={styles.heroStat}>
            <b>{assignedSubjects.length}</b>
            <span>Subject(s)</span>
          </div>
        </div>
      </section>

      <TeacherAnnouncementBanner />

      {!hasAssignments && (
        <section style={styles.noticeCard}>
          <b>Assignment not found.</b>
          <span>
            Your assigned class(es) or subjects are not showing yet. Contact admin
            if this is wrong.
          </span>
        </section>
      )}

      <section style={styles.quickInfoGrid}>
        <InfoCard
          icon="🏫"
          title="Class(es)"
          value={assignedClasses.length ? assignedClasses.join(", ") : "Not assigned"}
        />
        <InfoCard
          icon="📚"
          title="Subject(s)"
          value={assignedSubjects.length ? assignedSubjects.join(", ") : "Not assigned"}
        />
      </section>

      <section style={styles.cardGrid}>
        {softwareCards.map((card, index) => (
          <motion.div
            key={card.href}
            initial={{ opacity: 0, y: 18, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ delay: index * 0.045, duration: 0.28 }}
          >
            <Link href={card.href} style={{ textDecoration: "none" }}>
              <article
                style={{
                  ...styles.softwareCard,
                  background: card.bg,
                  borderColor: `${card.accent}22`,
                }}
              >
                <div
                  style={{
                    ...styles.softwareIcon,
                    background: "#ffffff",
                    color: card.accent,
                  }}
                >
                  {card.emoji}
                </div>

                <div>
                  <h3 style={styles.cardTitle}>{card.title}</h3>
                  <p style={styles.cardText}>{card.description}</p>
                </div>
              </article>
            </Link>
          </motion.div>
        ))}
      </section>

      <AnimatePresence>
        {menuOpen && (
          <ModalShell onClose={() => setMenuOpen(false)}>
            <motion.div
              style={styles.sideMenu}
              initial={{ x: 90, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 90, opacity: 0 }}
            >
              <div style={styles.sideTop}>
                <div style={styles.smallAvatar}>
                  {teacherInfo.photo_url ? (
                    <img
                      src={teacherInfo.photo_url}
                      alt={teacherInfo.full_name}
                      style={styles.avatarImg}
                    />
                  ) : (
                    teacherFirstName.charAt(0).toUpperCase()
                  )}
                </div>

                <div>
                  <b>{teacherFirstName}</b>
                  <p style={styles.muted}>{teacherInfo.teacher_id || "Teacher"}</p>
                </div>
              </div>

              <button style={styles.menuItem} onClick={() => setMenuOpen(false)}>
                🏠 Dashboard
              </button>
              <button style={styles.menuItem} onClick={openAboutModal}>
                👤 About me
              </button>
              <button style={styles.menuItem} onClick={() => openPasswordModal(false)}>
                🔐 Change password
              </button>

              <label style={styles.menuItem}>
                📷 Add profile picture
                <input
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={handleProfilePictureUpload}
                  disabled={photoLoading}
                />
              </label>

              {photoLoading && <p style={styles.helpMessage}>Uploading picture...</p>}
              {photoMessage && <p style={styles.successMessage}>{photoMessage}</p>}
              {photoError && <p style={styles.errorMessage}>{photoError}</p>}

              <div style={styles.logoutWrap}>
                <LogoutButton />
              </div>
            </motion.div>
          </ModalShell>
        )}

        {aboutOpen && (
          <ModalShell onClose={() => setAboutOpen(false)}>
            <motion.div
              style={styles.modalCard}
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 18 }}
            >
              <div style={styles.modalHeader}>
                <h2 style={styles.modalTitle}>About me</h2>
                <button style={styles.iconButton} onClick={() => setAboutOpen(false)}>
                  ✕
                </button>
              </div>

              <div style={styles.aboutProfile}>
                <div style={styles.bigAvatar}>
                  {teacherInfo.photo_url ? (
                    <img
                      src={teacherInfo.photo_url}
                      alt={teacherInfo.full_name}
                      style={styles.avatarImg}
                    />
                  ) : (
                    teacherFirstName.charAt(0).toUpperCase()
                  )}
                </div>

                <div>
                  <h3 style={{ margin: 0 }}>{teacherInfo.full_name}</h3>
                  <p style={styles.muted}>{teacherInfo.phone || "No phone saved"}</p>
                </div>
              </div>

              <DetailRow label="Teacher ID" value={teacherInfo.teacher_id || "—"} />
              <DetailRow label="Username" value={teacherInfo.username || "—"} />
              <DetailRow
                label="Class(es)"
                value={assignedClasses.length ? assignedClasses.join(", ") : "Not assigned"}
              />
              <DetailRow
                label="Subject(s)"
                value={assignedSubjects.length ? assignedSubjects.join(", ") : "Not assigned"}
              />
            </motion.div>
          </ModalShell>
        )}

        {passwordOpen && (
          <ModalShell
            onClose={() => {
              if (!passwordForced) setPasswordOpen(false);
            }}
          >
            <motion.div
              style={styles.modalCard}
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 18 }}
            >
              <div style={styles.modalHeader}>
                <h2 style={styles.modalTitle}>
                  {passwordForced ? "Change password to continue" : "Change password"}
                </h2>

                {!passwordForced && (
                  <button
                    style={styles.iconButton}
                    onClick={() => setPasswordOpen(false)}
                  >
                    ✕
                  </button>
                )}
              </div>

              {passwordForced && (
                <p style={styles.forceText}>
                  Please set your own password before using the dashboard.
                </p>
              )}

              <label style={styles.inputGroup}>
                <span>New password</span>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  style={styles.input}
                  placeholder="Enter new password"
                />
              </label>

              <label style={styles.inputGroup}>
                <span>Confirm password</span>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  style={styles.input}
                  placeholder="Confirm new password"
                />
              </label>

              {passwordError && <p style={styles.errorMessage}>{passwordError}</p>}
              {passwordMessage && (
                <p style={styles.successMessage}>{passwordMessage}</p>
              )}

              <button
                type="button"
                onClick={handlePasswordChange}
                disabled={passwordLoading}
                style={styles.primaryButton}
              >
                {passwordLoading ? "Saving..." : "Save password"}
              </button>
            </motion.div>
          </ModalShell>
        )}
      </AnimatePresence>
    </main>
  );
}

function InfoCard({
  icon,
  title,
  value,
}: {
  icon: string;
  title: string;
  value: string;
}) {
  return (
    <motion.article
      style={styles.infoCard}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <span style={styles.infoIcon}>{icon}</span>
      <div>
        <p style={styles.infoTitle}>{title}</p>
        <p style={styles.infoValue}>{value}</p>
      </div>
    </motion.article>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={styles.detailRow}>
      <span>{label}</span>
      <b>{value}</b>
    </div>
  );
}

function ModalShell({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <motion.div
      style={styles.overlay}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onMouseDown={onClose}
    >
      <div onMouseDown={(event) => event.stopPropagation()}>{children}</div>
    </motion.div>
  );
}

const styles: Record<string, CSSProperties> = {
  page: {
    minHeight: "100vh",
    position: "relative",
    overflowX: "hidden",
    padding: "14px 14px 90px",
    background:
      "radial-gradient(circle at top left, #dcfce7 0, transparent 28%), linear-gradient(180deg, #f7f3e8 0%, #eef7ef 45%, #ffffff 100%)",
    fontFamily: "Inter, Arial, sans-serif",
    color: "#0f2a17",
  },
  loadingPage: {
    minHeight: "100vh",
    display: "grid",
    placeItems: "center",
    background:
      "linear-gradient(180deg, #f7f3e8 0%, #eef7ef 45%, #ffffff 100%)",
    fontFamily: "Inter, Arial, sans-serif",
  },
  loadingCard: {
    background: "#ffffff",
    borderRadius: 24,
    padding: 24,
    boxShadow: "0 18px 55px rgba(16,32,22,0.12)",
    textAlign: "center",
  },
  loadingIcon: {
    width: 58,
    height: 58,
    borderRadius: 18,
    background: "#f4e7bd",
    display: "grid",
    placeItems: "center",
    margin: "0 auto 12px",
    fontSize: 26,
  },
  bgCircleOne: {
    position: "absolute",
    top: -80,
    right: -70,
    width: 180,
    height: 180,
    borderRadius: "999px",
    background: "rgba(15,122,59,0.13)",
    pointerEvents: "none",
  },
  bgCircleTwo: {
    position: "absolute",
    top: 160,
    left: -100,
    width: 220,
    height: 220,
    borderRadius: "999px",
    background: "rgba(199,153,47,0.14)",
    pointerEvents: "none",
  },
  header: {
    position: "relative",
    zIndex: 2,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 16,
  },
  profileRow: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    minWidth: 0,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 18,
    overflow: "hidden",
    background: "#0f7a3b",
    color: "#ffffff",
    display: "grid",
    placeItems: "center",
    fontWeight: 900,
    fontSize: 20,
    flexShrink: 0,
    boxShadow: "0 12px 25px rgba(15,122,59,0.22)",
  },
  avatarImg: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
  },
  schoolName: {
    margin: 0,
    color: "#637067",
    fontSize: 12,
    fontWeight: 800,
    maxWidth: 230,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  greeting: {
    margin: "3px 0 0",
    fontSize: 22,
    lineHeight: 1.1,
    color: "#0f2a17",
  },
  menuButton: {
    width: 44,
    height: 44,
    borderRadius: 16,
    border: "1px solid rgba(15,122,59,0.18)",
    background: "#ffffff",
    color: "#0f2a17",
    fontSize: 22,
    cursor: "pointer",
    boxShadow: "0 12px 30px rgba(16,32,22,0.08)",
  },
  heroCard: {
    position: "relative",
    zIndex: 2,
    borderRadius: 26,
    padding: 18,
    background: "linear-gradient(135deg, #0f7a3b, #0f2a17)",
    color: "#ffffff",
    boxShadow: "0 20px 45px rgba(15,42,23,0.22)",
    marginBottom: 14,
    overflow: "hidden",
  },
  heroLabel: {
    margin: 0,
    opacity: 0.8,
    fontSize: 12,
    fontWeight: 900,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  },
  heroTitle: {
    margin: "6px 0 14px",
    fontSize: 21,
    lineHeight: 1.2,
  },
  heroStats: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 10,
  },
  heroStat: {
    background: "rgba(255,255,255,0.13)",
    border: "1px solid rgba(255,255,255,0.16)",
    borderRadius: 18,
    padding: 12,
    display: "grid",
    gap: 2,
  },
  noticeCard: {
    position: "relative",
    zIndex: 2,
    display: "grid",
    gap: 4,
    background: "#fff7ed",
    border: "1px solid #fed7aa",
    borderRadius: 18,
    padding: 14,
    marginBottom: 14,
    color: "#9a3412",
    fontSize: 13,
  },
  quickInfoGrid: {
    position: "relative",
    zIndex: 2,
    display: "grid",
    gridTemplateColumns: "1fr",
    gap: 10,
    marginBottom: 14,
  },
  infoCard: {
    background: "rgba(255,255,255,0.92)",
    border: "1px solid rgba(15,122,59,0.12)",
    borderRadius: 20,
    padding: 14,
    display: "flex",
    alignItems: "flex-start",
    gap: 12,
    boxShadow: "0 12px 30px rgba(16,32,22,0.06)",
  },
  infoIcon: {
    width: 42,
    height: 42,
    borderRadius: 16,
    background: "#f4e7bd",
    display: "grid",
    placeItems: "center",
    fontSize: 20,
    flexShrink: 0,
  },
  infoTitle: {
    margin: "0 0 4px",
    color: "#637067",
    fontSize: 12,
    fontWeight: 900,
  },
  infoValue: {
    margin: 0,
    color: "#0f2a17",
    fontSize: 14,
    fontWeight: 800,
    lineHeight: 1.35,
  },
  cardGrid: {
    position: "relative",
    zIndex: 2,
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 12,
  },
  softwareCard: {
    minHeight: 126,
    border: "1px solid",
    borderRadius: 22,
    padding: 14,
    display: "grid",
    alignContent: "space-between",
    gap: 12,
    boxShadow: "0 12px 28px rgba(16,32,22,0.07)",
  },
  softwareIcon: {
    width: 43,
    height: 43,
    borderRadius: 16,
    display: "grid",
    placeItems: "center",
    fontSize: 22,
    boxShadow: "0 8px 18px rgba(16,32,22,0.08)",
  },
  cardTitle: {
    margin: 0,
    color: "#102016",
    fontSize: 14,
    lineHeight: 1.15,
  },
  cardText: {
    margin: "5px 0 0",
    color: "#526157",
    fontSize: 12,
    lineHeight: 1.3,
  },
  overlay: {
    position: "fixed",
    inset: 0,
    zIndex: 80,
    background: "rgba(15,23,42,0.36)",
    backdropFilter: "blur(7px)",
    display: "grid",
    placeItems: "center",
    padding: 16,
  },
  sideMenu: {
    width: "min(88vw, 360px)",
    maxHeight: "90vh",
    overflowY: "auto",
    background: "#ffffff",
    borderRadius: 24,
    padding: 18,
    boxShadow: "0 24px 70px rgba(15,23,42,0.26)",
    display: "grid",
    gap: 10,
  },
  sideTop: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    paddingBottom: 10,
    borderBottom: "1px solid #edf2ee",
    marginBottom: 4,
  },
  smallAvatar: {
    width: 46,
    height: 46,
    borderRadius: 17,
    overflow: "hidden",
    background: "#0f7a3b",
    color: "#ffffff",
    display: "grid",
    placeItems: "center",
    fontWeight: 900,
  },
  menuItem: {
    width: "100%",
    border: "1px solid #e4ebe6",
    background: "#f9fbf9",
    color: "#0f2a17",
    borderRadius: 16,
    padding: "13px 14px",
    textAlign: "left",
    fontWeight: 900,
    cursor: "pointer",
    fontSize: 14,
  },
  logoutWrap: {
    marginTop: 4,
  },
  modalCard: {
    width: "min(92vw, 430px)",
    maxHeight: "90vh",
    overflowY: "auto",
    background: "#ffffff",
    borderRadius: 24,
    padding: 20,
    boxShadow: "0 24px 70px rgba(15,23,42,0.26)",
  },
  modalHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 16,
  },
  modalTitle: {
    margin: 0,
    fontSize: 21,
    color: "#0f2a17",
  },
  iconButton: {
    width: 38,
    height: 38,
    borderRadius: 14,
    border: "1px solid #e5e7eb",
    background: "#ffffff",
    cursor: "pointer",
    fontWeight: 900,
  },
  aboutProfile: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    marginBottom: 14,
  },
  bigAvatar: {
    width: 64,
    height: 64,
    borderRadius: 22,
    overflow: "hidden",
    background: "#0f7a3b",
    color: "#ffffff",
    display: "grid",
    placeItems: "center",
    fontWeight: 900,
    fontSize: 24,
    flexShrink: 0,
  },
  detailRow: {
    display: "grid",
    gap: 5,
    padding: "12px 0",
    borderBottom: "1px solid #edf2ee",
    color: "#526157",
    fontSize: 13,
  },
  inputGroup: {
    display: "grid",
    gap: 7,
    marginBottom: 12,
    fontSize: 13,
    fontWeight: 900,
    color: "#26352b",
  },
  input: {
    width: "100%",
    padding: "12px 13px",
    borderRadius: 14,
    border: "1px solid #ccd8cf",
    outline: "none",
    fontSize: 14,
  },
  primaryButton: {
    width: "100%",
    border: "none",
    background: "linear-gradient(135deg, #0f7a3b, #0f2a17)",
    color: "#ffffff",
    borderRadius: 15,
    padding: "13px 14px",
    cursor: "pointer",
    fontWeight: 900,
    marginTop: 6,
  },
  forceText: {
    margin: "0 0 14px",
    background: "#fff7ed",
    border: "1px solid #fed7aa",
    color: "#9a3412",
    borderRadius: 14,
    padding: 12,
    fontSize: 13,
    fontWeight: 800,
  },
  muted: {
    margin: "3px 0 0",
    color: "#6b7280",
    fontSize: 12,
  },
  helpMessage: {
    margin: 0,
    color: "#4b5563",
    fontSize: 12,
    fontWeight: 800,
  },
  successMessage: {
    margin: 0,
    color: "#166534",
    fontSize: 12,
    fontWeight: 900,
  },
  errorMessage: {
    margin: 0,
    color: "#991b1b",
    fontSize: 12,
    fontWeight: 900,
  },
};
