"use client";

import {
  ChangeEvent,
  CSSProperties,
  ReactNode,
  useEffect,
  useMemo,
  useState,
} from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { supabase } from "@/lib/supabase";
import LogoutButton from "@/app/components/LogoutButton";

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

type DutyRow = {
  id?: string;
  teacher_id: string;
  teacher_name?: string | null;
  week_start_date: string;
  week_end_date: string;
};

type AnnouncementRow = {
  id: string;
  title?: string | null;
  message: string;
  sender_name?: string | null;
  created_at?: string | null;
  expires_at?: string | null;
};

const PROFILE_BUCKET = "teacher-photos";

const softwareCards = [
  {
    title: "Attendance",
    description: "Check in and out",
    href: "/teacher-attendance",
    emoji: "📊",
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
    description: "Uniforms issued",
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
  const [mustChangePassword, setMustChangePassword] = useState(false);

  const [loading, setLoading] = useState(true);
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

  const [currentDuty, setCurrentDuty] = useState<DutyRow | null>(null);
  const [nextDuty, setNextDuty] = useState<DutyRow | null>(null);
  const [announcements, setAnnouncements] = useState<AnnouncementRow[]>([]);

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState("");
  const [passwordError, setPasswordError] = useState("");

  const [photoLoading, setPhotoLoading] = useState(false);
  const [photoMessage, setPhotoMessage] = useState("");
  const [photoError, setPhotoError] = useState("");

  const firstName = useMemo(
    () => getFirstName(teacherInfo.full_name || teacherInfo.username || "Teacher"),
    [teacherInfo.full_name, teacherInfo.username]
  );

  useEffect(() => {
    let active = true;

    async function loadDashboardData() {
      try {
        setLoading(true);

        const {
          data: { session },
        } = await supabase.auth.getSession();

        const currentAuthUserId = session?.user?.id ?? "";
        if (!active) return;

        setAuthUserId(currentAuthUserId);

        const { data: settings } = await supabase
          .from("school_settings")
          .select("school_name")
          .limit(1)
          .maybeSingle();

        if (active && settings?.school_name) {
          setSchoolName(settings.school_name);
        }

        if (!currentAuthUserId) return;

        const { data: teacher, error: teacherError } = await supabase
          .from("teachers")
          .select("*")
          .eq("auth_user_id", currentAuthUserId)
          .limit(1)
          .maybeSingle();

        if (teacherError) throw teacherError;

        if (teacher && active) {
          const loadedTeacher: TeacherInfo = {
            id: String(teacher.id || ""),
            full_name: String(teacher.full_name || teacher.username || "Teacher"),
            photo_url: teacher.photo_url || null,
            role: String(teacher.role || "teacher"),
            teacher_id: String(teacher.teacher_id || ""),
            username: String(teacher.username || ""),
            phone: String(teacher.phone || ""),
            password_changed:
              typeof teacher.password_changed === "boolean"
                ? teacher.password_changed
                : true,
          };

          setTeacherInfo(loadedTeacher);

          if (loadedTeacher.teacher_id) {
            localStorage.setItem("jsms_teacher_id", loadedTeacher.teacher_id);
            localStorage.setItem("teacher_id", loadedTeacher.teacher_id);
            localStorage.setItem("jsms_role", "teacher");
          }

          if (loadedTeacher.password_changed === false) {
            setMustChangePassword(true);
            setPasswordOpen(true);
          }

          await Promise.all([
            loadDutyInfo(loadedTeacher.teacher_id),
            loadActiveAnnouncements(),
          ]);
        }
      } catch (error) {
        console.error("Dashboard data load error:", error);
      } finally {
        if (active) setLoading(false);
      }
    }

    loadDashboardData();

    return () => {
      active = false;
    };
  }, []);

  async function loadDutyInfo(teacherId: string) {
    if (!teacherId) return;

    const today = new Date();
    const todayText = toDateInput(today);

    const { data, error } = await supabase
      .from("teacher_duty_roster")
      .select("*")
      .eq("teacher_id", teacherId)
      .order("week_start_date", { ascending: true });

    if (error || !data) return;

    const rows = data as DutyRow[];

    const current =
      rows.find((row) => {
        return todayText >= row.week_start_date && todayText <= row.week_end_date;
      }) || null;

    const upcoming =
      rows.find((row) => {
        return row.week_start_date > todayText;
      }) || null;

    setCurrentDuty(current);
    setNextDuty(upcoming);
  }

  async function loadActiveAnnouncements() {
    try {
      const nowIso = new Date().toISOString();

      const { data, error } = await supabase
        .from("jsms_announcements")
        .select("*")
        .eq("is_deleted", false)
        .gt("expires_at", nowIso)
        .order("created_at", { ascending: false })
        .limit(3);

      if (error || !data) {
        setAnnouncements([]);
        return;
      }

      setAnnouncements(data as AnnouncementRow[]);
    } catch {
      setAnnouncements([]);
    }
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

      const updates: Record<string, unknown> = {
        password_changed: true,
        password_changed_at: new Date().toISOString(),
      };

      if (teacherInfo.id) {
        const { error: updateError } = await supabase
          .from("teachers")
          .update(updates)
          .eq("id", teacherInfo.id);

        if (updateError) {
          setPasswordError(updateError.message);
          return;
        }
      }

      setTeacherInfo((prev) => ({
        ...prev,
        password_changed: true,
      }));

      setMustChangePassword(false);
      setPasswordMessage("Password changed successfully.");
      setNewPassword("");
      setConfirmPassword("");

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

  if (loading) {
    return (
      <main style={loadingPageStyle}>
        <div style={loadingCardStyle}>Loading dashboard...</div>
      </main>
    );
  }

  return (
    <main style={pageStyle}>
      <header style={topHeaderStyle}>
        <div style={{ minWidth: 0 }}>
          <h1 style={schoolTitleStyle}>{schoolName}</h1>
          <p style={smallMutedStyle}>Teacher Dashboard</p>
        </div>

        <div style={headerActionsStyle}>
          <ProfileBubble teacherInfo={teacherInfo} />

          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-label="Open menu"
            style={menuIconButtonStyle}
          >
            <span style={hamburgerLineStyle} />
            <span style={hamburgerLineStyle} />
            <span style={hamburgerLineStyle} />
          </button>
        </div>
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
                  <h2 style={menuTitleStyle}>Menu</h2>
                  <p style={smallMutedStyle}>Quick actions</p>
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
                      style={imageCoverStyle}
                    />
                  ) : (
                    <span style={{ fontSize: "30px" }}>👤</span>
                  )}
                </div>

                <div style={{ minWidth: 0 }}>
                  <h3 style={profileNameStyle}>{teacherInfo.full_name}</h3>
                  <p style={profileRoleStyle}>{teacherInfo.role}</p>
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
              </div>
            </div>
          </BottomSheet>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {passwordOpen && (
          <BottomSheet
            title="🔐 Change Password"
            onClose={() => {
              if (!mustChangePassword) setPasswordOpen(false);
            }}
            locked={mustChangePassword}
          >
            <div style={{ display: "grid", gap: "12px" }}>
              {mustChangePassword && (
                <div style={forcePasswordNoticeStyle}>
                  Change your default password to continue.
                </div>
              )}

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

      <div style={contentWrapStyle}>
        <motion.section
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          style={greetingCardStyle}
        >
          <div>
            <p style={greetingMiniStyle}>{getGreeting()}</p>
            <h2 style={greetingTitleStyle}>{firstName}</h2>
            <p style={greetingSubStyle}>{formatToday()}</p>
          </div>

          <div style={greetingIconStyle}>✨</div>
        </motion.section>

        {(currentDuty || nextDuty || announcements.length > 0) && (
          <div style={noticeStackStyle}>
            {currentDuty && (
              <NoticeCard
                tone="duty"
                title="You are on duty this week"
                message={`${formatDate(currentDuty.week_start_date)} - ${formatDate(
                  currentDuty.week_end_date
                )}`}
              />
            )}

            {!currentDuty && nextDuty && (
              <NoticeCard
                tone="upcoming"
                title="Upcoming duty"
                message={`You will be on duty from ${formatDate(
                  nextDuty.week_start_date
                )} to ${formatDate(nextDuty.week_end_date)}.`}
              />
            )}

            {announcements.map((item) => (
              <NoticeCard
                key={item.id}
                tone="announcement"
                title={item.title || "Announcement"}
                message={item.message}
              />
            ))}
          </div>
        )}

        <div style={modulesGridStyle}>
          {softwareCards.map((card, index) => (
            <motion.div
              key={card.title}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, delay: index * 0.04 }}
            >
              <Link href={card.href} style={moduleLinkStyle}>
                <motion.div
                  whileTap={{ scale: 0.97 }}
                  transition={{ type: "spring", stiffness: 260, damping: 18 }}
                  style={moduleCardStyle}
                >
                  <div>
                    <div
                      style={{
                        ...moduleIconStyle,
                        background: card.bg,
                      }}
                    >
                      {card.emoji}
                    </div>

                    <h3 style={moduleTitleStyle}>{card.title}</h3>
                    <p style={moduleDescStyle}>{card.description}</p>
                  </div>

                  <div style={{ ...openTextStyle, color: card.accent }}>
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

function ProfileBubble({ teacherInfo }: { teacherInfo: TeacherInfo }) {
  return (
    <div style={profileBubbleStyle}>
      {teacherInfo.photo_url ? (
        <img
          src={teacherInfo.photo_url}
          alt={teacherInfo.full_name}
          style={imageCoverStyle}
        />
      ) : (
        <span style={{ fontSize: "18px" }}>👤</span>
      )}
    </div>
  );
}

function NoticeCard({
  title,
  message,
  tone,
}: {
  title: string;
  message: string;
  tone: "duty" | "upcoming" | "announcement";
}) {
  const palette =
    tone === "duty"
      ? {
          bg: "#fff7ed",
          border: "#fed7aa",
          title: "#9a3412",
          icon: "🛡️",
        }
      : tone === "upcoming"
      ? {
          bg: "#eef2ff",
          border: "#c7d2fe",
          title: "#3730a3",
          icon: "📌",
        }
      : {
          bg: "#ecfdf5",
          border: "#a7f3d0",
          title: "#047857",
          icon: "📢",
        };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      style={{
        background: palette.bg,
        border: `1px solid ${palette.border}`,
        borderRadius: "18px",
        padding: "13px",
        display: "flex",
        gap: "10px",
        alignItems: "flex-start",
      }}
    >
      <div style={noticeIconStyle}>{palette.icon}</div>

      <div style={{ minWidth: 0 }}>
        <p style={{ margin: 0, color: palette.title, fontWeight: 900, fontSize: "13px" }}>
          {title}
        </p>
        <p style={noticeMessageStyle}>{message}</p>
      </div>
    </motion.div>
  );
}

function BottomSheet({
  title,
  children,
  onClose,
  locked = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  locked?: boolean;
}) {
  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        onClick={locked ? undefined : onClose}
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
          <h2 style={sheetTitleStyle}>{title}</h2>

          {!locked && (
            <button type="button" onClick={onClose} style={closeButtonStyle}>
              ×
            </button>
          )}
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
    <div style={infoRowStyle}>
      <p style={infoLabelStyle}>{label}</p>
      <p style={infoValueStyle}>{value || "-"}</p>
    </div>
  );
}

function SuccessText({ text }: { text: string }) {
  return <p style={successTextStyle}>{text}</p>;
}

function ErrorText({ text }: { text: string }) {
  return <p style={errorTextStyle}>{text}</p>;
}

function getFirstName(name: string) {
  return String(name || "Teacher").trim().split(/\s+/)[0] || "Teacher";
}

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good Morning";
  if (hour < 17) return "Good Afternoon";
  return "Good Evening";
}

function formatToday() {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date());
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  try {
    return new Intl.DateTimeFormat("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function toDateInput(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const pageStyle: CSSProperties = {
  minHeight: "100vh",
  background: "linear-gradient(180deg, #f8fafc 0%, #eef2ff 100%)",
  fontFamily: "Arial, sans-serif",
};

const loadingPageStyle: CSSProperties = {
  ...pageStyle,
  display: "grid",
  placeItems: "center",
  padding: "16px",
};

const loadingCardStyle: CSSProperties = {
  background: "#ffffff",
  border: "1px solid #e5e7eb",
  boxShadow: "0 10px 28px rgba(15,23,42,0.08)",
  borderRadius: "18px",
  padding: "18px",
  fontWeight: 900,
  color: "#111827",
};

const topHeaderStyle: CSSProperties = {
  minHeight: "66px",
  background: "rgba(255,255,255,0.94)",
  backdropFilter: "blur(14px)",
  borderBottom: "1px solid #e5e7eb",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "0 14px",
  position: "sticky",
  top: 0,
  zIndex: 30,
};

const schoolTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: "16px",
  fontWeight: 900,
  color: "#111827",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
  maxWidth: "250px",
};

const smallMutedStyle: CSSProperties = {
  margin: "4px 0 0",
  color: "#6b7280",
  fontSize: "11px",
  fontWeight: 800,
};

const headerActionsStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "8px",
  flexShrink: 0,
};

const profileBubbleStyle: CSSProperties = {
  width: "40px",
  height: "40px",
  borderRadius: "14px",
  overflow: "hidden",
  background: "#eef2ff",
  border: "1px solid #e0e7ff",
  display: "grid",
  placeItems: "center",
  flexShrink: 0,
};

const imageCoverStyle: CSSProperties = {
  width: "100%",
  height: "100%",
  objectFit: "cover",
};

const menuIconButtonStyle: CSSProperties = {
  border: "none",
  background: "#f3f4f6",
  padding: 0,
  width: "40px",
  height: "40px",
  borderRadius: "14px",
  display: "grid",
  placeItems: "center",
  gap: "0",
  cursor: "pointer",
};

const hamburgerLineStyle: CSSProperties = {
  display: "block",
  width: "21px",
  height: "2.5px",
  background: "#111827",
  borderRadius: "999px",
  margin: "2px 0",
};

const contentWrapStyle: CSSProperties = {
  maxWidth: "520px",
  margin: "0 auto",
  padding: "16px 12px 34px",
};

const greetingCardStyle: CSSProperties = {
  background: "linear-gradient(135deg, #111827 0%, #1e3a8a 100%)",
  borderRadius: "26px",
  padding: "18px",
  boxShadow: "0 10px 30px rgba(15,23,42,0.18)",
  marginBottom: "14px",
  color: "#ffffff",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "12px",
};

const greetingMiniStyle: CSSProperties = {
  margin: 0,
  fontSize: "12px",
  fontWeight: 900,
  letterSpacing: "0.7px",
  textTransform: "uppercase",
  opacity: 0.78,
};

const greetingTitleStyle: CSSProperties = {
  margin: "6px 0 0",
  fontSize: "26px",
  lineHeight: 1.05,
  fontWeight: 900,
};

const greetingSubStyle: CSSProperties = {
  margin: "8px 0 0",
  color: "rgba(255,255,255,0.78)",
  fontSize: "13px",
  fontWeight: 700,
};

const greetingIconStyle: CSSProperties = {
  width: "54px",
  height: "54px",
  borderRadius: "20px",
  display: "grid",
  placeItems: "center",
  background: "rgba(255,255,255,0.14)",
  fontSize: "26px",
  flexShrink: 0,
};

const noticeStackStyle: CSSProperties = {
  display: "grid",
  gap: "9px",
  marginBottom: "14px",
};

const noticeIconStyle: CSSProperties = {
  width: "36px",
  height: "36px",
  borderRadius: "13px",
  background: "rgba(255,255,255,0.76)",
  display: "grid",
  placeItems: "center",
  fontSize: "18px",
  flexShrink: 0,
};

const noticeMessageStyle: CSSProperties = {
  margin: "5px 0 0",
  color: "#374151",
  fontSize: "12px",
  lineHeight: 1.45,
  fontWeight: 700,
};

const modulesGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: "12px",
};

const moduleLinkStyle: CSSProperties = {
  textDecoration: "none",
  color: "inherit",
  display: "block",
  height: "100%",
};

const moduleCardStyle: CSSProperties = {
  background: "#ffffff",
  borderRadius: "22px",
  padding: "14px",
  minHeight: "150px",
  boxShadow: "0 6px 18px rgba(15,23,42,0.08)",
  border: "1px solid #e5e7eb",
  display: "flex",
  flexDirection: "column",
  justifyContent: "space-between",
};

const moduleIconStyle: CSSProperties = {
  width: "48px",
  height: "48px",
  borderRadius: "16px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: "24px",
  marginBottom: "12px",
};

const moduleTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: "15px",
  lineHeight: 1.2,
  color: "#111827",
  fontWeight: 900,
};

const moduleDescStyle: CSSProperties = {
  margin: "8px 0 0",
  fontSize: "11px",
  lineHeight: 1.45,
  color: "#6b7280",
  fontWeight: 700,
};

const openTextStyle: CSSProperties = {
  marginTop: "12px",
  fontSize: "11px",
  fontWeight: 900,
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

const menuTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: "17px",
  color: "#111827",
  fontWeight: 900,
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

const sheetTitleStyle: CSSProperties = {
  margin: 0,
  color: "#111827",
  fontSize: "18px",
  fontWeight: 900,
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

const profileNameStyle: CSSProperties = {
  margin: 0,
  color: "#111827",
  fontSize: "19px",
  fontWeight: 900,
  lineHeight: 1.2,
};

const profileRoleStyle: CSSProperties = {
  margin: "6px 0 0",
  color: "#6b7280",
  fontSize: "13px",
  fontWeight: 800,
  textTransform: "capitalize",
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

const infoRowStyle: CSSProperties = {
  background: "#ffffff",
  border: "1px solid #e5e7eb",
  borderRadius: "14px",
  padding: "10px",
};

const infoLabelStyle: CSSProperties = {
  margin: 0,
  fontSize: "9px",
  color: "#6b7280",
  marginBottom: "4px",
  fontWeight: 900,
  textTransform: "uppercase",
  letterSpacing: "0.4px",
};

const infoValueStyle: CSSProperties = {
  margin: 0,
  fontSize: "12px",
  color: "#111827",
  fontWeight: 800,
  lineHeight: 1.45,
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

const successTextStyle: CSSProperties = {
  margin: 0,
  background: "#ecfdf5",
  color: "#047857",
  border: "1px solid #a7f3d0",
  borderRadius: "14px",
  padding: "10px 12px",
  fontSize: "12px",
  fontWeight: 800,
};

const errorTextStyle: CSSProperties = {
  margin: 0,
  background: "#fef2f2",
  color: "#b91c1c",
  border: "1px solid #fecaca",
  borderRadius: "14px",
  padding: "10px 12px",
  fontSize: "12px",
  fontWeight: 800,
};

const forcePasswordNoticeStyle: CSSProperties = {
  background: "#fff7ed",
  border: "1px solid #fed7aa",
  color: "#9a3412",
  borderRadius: "14px",
  padding: "10px 12px",
  fontSize: "12px",
  fontWeight: 900,
};
