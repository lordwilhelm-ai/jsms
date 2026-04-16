"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import SDSFileUpload from "@/app/components/SDSFileUpload";

type TeacherRow = Record<string, any>;
type ClassRow = Record<string, any>;
type SettingsRow = Record<string, any>;

const COLORS = {
  background:
    "linear-gradient(135deg, #fffdf2 0%, #fff9db 25%, #fef3c7 55%, #fde68a 100%)",
  primary: "#f59e0b",
  secondary: "#111827",
  white: "#ffffff",
  text: "#111827",
  muted: "#6b7280",
  danger: "#b91c1c",
};

function getRole(row: TeacherRow | null) {
  const raw = String(row?.role || "").trim().toLowerCase();
  if (raw === "owner" || raw === "admin" || raw === "headmaster") return raw;
  return "teacher";
}

function calcAge(dateOfBirth: string) {
  if (!dateOfBirth) return "";
  const dob = new Date(`${dateOfBirth}T00:00:00`);
  if (Number.isNaN(dob.getTime())) return "";

  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const monthDiff = today.getMonth() - dob.getMonth();
  const dayDiff = today.getDate() - dob.getDate();

  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) {
    age -= 1;
  }

  return age >= 0 ? String(age) : "";
}

function getEmergencyContactFromStayWith(params: {
  staysWith: string;
  fatherPhone: string;
  motherPhone: string;
  guardianPhone: string;
}) {
  const { staysWith, fatherPhone, motherPhone, guardianPhone } = params;

  if (staysWith === "Both parents") return fatherPhone.trim();
  if (staysWith === "Father") return fatherPhone.trim();
  if (staysWith === "Mother") return motherPhone.trim();
  if (staysWith === "Guardian") return guardianPhone.trim();

  return "";
}

export default function SDSAdminStudentProfilePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const studentRowId = params?.id;

  const [checkingUser, setCheckingUser] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [userRole, setUserRole] = useState<"teacher" | "admin" | "other">("other");
  const [isAssignedStudent, setIsAssignedStudent] = useState(true);

  const [settingsRow, setSettingsRow] = useState<SettingsRow | null>(null);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [message, setMessage] = useState("");

  const [form, setForm] = useState({
    id: "",
    fullName: "",
    studentId: "",
    gender: "",
    dateOfBirth: "",
    age: "",
    className: "",
    photoUrl: "",

    fatherName: "",
    fatherPhone: "",
    fatherAddress: "",

    motherName: "",
    motherPhone: "",
    motherAddress: "",

    staysWith: "Both parents",

    guardianName: "",
    guardianPhone: "",
    guardianAddress: "",

    emergencyContact: "",

    healthCondition: "",
    disabilitySupport: "",
    healthNote: "",

    nhisImageUrl: "",
    weighingCardUrl: "",
    otherDocument1Url: "",
    otherDocument2Url: "",
    otherDocument3Url: "",

    status: "active",
  });

  useEffect(() => {
    let active = true;

    async function checkAndLoad() {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!active) return;

        if (!session?.user) {
          router.replace("/");
          return;
        }

        const [teachersRes, studentRes, settingsRes, classesRes] = await Promise.all([
          supabase.from("teachers").select("*"),
          supabase.from("students").select("*").eq("id", studentRowId).maybeSingle(),
          supabase.from("school_settings").select("*").limit(1).maybeSingle(),
          supabase.from("classes").select("*").order("class_order", { ascending: true }),
        ]);

        if (!active) return;

        if (teachersRes.error || !teachersRes.data || teachersRes.data.length === 0) {
          router.replace("/");
          return;
        }

        const userRow =
          teachersRes.data.find((item) => item.auth_user_id === session.user.id) ||
          teachersRes.data.find(
            (item) =>
              String(item.email || "").trim().toLowerCase() ===
              String(session.user.email || "").trim().toLowerCase()
          ) ||
          null;

        if (!userRow) {
          router.replace("/");
          return;
        }

        const role = getRole(userRow);
        setUserRole(role === "teacher" ? "teacher" : "admin");

        // If it's a teacher, verify they're assigned to this student's class
        if (role === "teacher") {
          try {
            const assignResponse = await fetch(`/api/teacher-assignments/get?teacher_id=${userRow.id}`);
            const assignData = await assignResponse.json();

            if (!assignResponse.ok || assignData.error) {
              setMessage("Error loading your class assignments.");
              setIsAssignedStudent(false);
              setCheckingUser(false);
              setLoading(false);
              return;
            }

            const classIds = assignData.class_ids || [];

            // Get the student's class name and check if teacher is assigned to it
            if (studentRes.data) {
              const studentClassName = String(studentRes.data.class_name || "").trim();
              
              // Find the class ID for this class name
              const assignedToClass = (classesRes.data || []).some((cls: any) => {
                const className = String(cls.class_name || "").trim();
                const classId = String(cls.id || "").trim();
                return className === studentClassName && classIds.includes(classId);
              });

              if (!assignedToClass) {
                setMessage("You don't have permission to view this student.");
                setIsAssignedStudent(false);
                setCheckingUser(false);
                setLoading(false);
                return;
              }
            }
          } catch (error) {
            console.error("Error checking teacher assignments:", error);
            setIsAssignedStudent(false);
            setCheckingUser(false);
            setLoading(false);
            return;
          }
        }

        if (studentRes.error || !studentRes.data) {
          setMessage(`Error: ${studentRes.error?.message || "Student not found."}`);
          setCheckingUser(false);
          setLoading(false);
          return;
        }

        const row = studentRes.data;

        setSettingsRow(settingsRes.data || null);
        setClasses(classesRes.data || []);
        setIsAssignedStudent(true);

        setForm({
          id: String(row.id || ""),
          fullName: String(row.full_name || ""),
          studentId: String(row.student_id || ""),
          gender: String(row.gender || ""),
          dateOfBirth: String(row.date_of_birth || ""),
          age: row.age ? String(row.age) : "",
          className: String(row.class_name || ""),
          photoUrl: String(row.photo_url || ""),

          fatherName: String(row.father_name || ""),
          fatherPhone: String(row.father_phone || ""),
          fatherAddress: String(row.father_address || ""),

          motherName: String(row.mother_name || ""),
          motherPhone: String(row.mother_phone || ""),
          motherAddress: String(row.mother_address || ""),

          staysWith: String(row.stays_with || "Both parents"),

          guardianName: String(row.guardian_name || ""),
          guardianPhone: String(row.guardian_phone || ""),
          guardianAddress: String(row.guardian_address || ""),

          emergencyContact: String(row.emergency_contact || ""),

          healthCondition: String(row.health_condition || ""),
          disabilitySupport: String(row.disability_support || ""),
          healthNote: String(row.health_note || ""),

          nhisImageUrl: String(row.nhis_image_url || ""),
          weighingCardUrl: String(row.weighing_card_url || ""),
          otherDocument1Url: String(row.other_document_1_url || ""),
          otherDocument2Url: String(row.other_document_2_url || ""),
          otherDocument3Url: String(row.other_document_3_url || ""),

          status: String(row.status || "active"),
        });

        setCheckingUser(false);
        setLoading(false);
      } catch (error) {
        console.error("Error loading student profile:", error);
        setMessage("Error loading student profile.");
        setCheckingUser(false);
        setLoading(false);
      }
    }

    void checkAndLoad();

    return () => {
      active = false;
    };
  }, [router, studentRowId]);

  useEffect(() => {
    setForm((prev) => ({
      ...prev,
      age: calcAge(prev.dateOfBirth),
    }));
  }, [form.dateOfBirth]);

  useEffect(() => {
    const emergency = getEmergencyContactFromStayWith({
      staysWith: form.staysWith,
      fatherPhone: form.fatherPhone,
      motherPhone: form.motherPhone,
      guardianPhone: form.guardianPhone,
    });

    setForm((prev) => ({
      ...prev,
      emergencyContact: emergency,
    }));
  }, [form.staysWith, form.fatherPhone, form.motherPhone, form.guardianPhone]);

  const schoolName = String(settingsRow?.school_name || "JEFSEM VISION SCHOOL");
  const motto = String(settingsRow?.motto || "Success in Excellence");
  const academicYear = String(settingsRow?.academic_year || "-");
  const currentTerm = String(settingsRow?.current_term || "-");

  const classOptions = useMemo(() => {
    return (classes || [])
      .map((row) => String(row.class_name || "").trim())
      .filter(Boolean);
  }, [classes]);

  async function handleSave() {
    // Teachers cannot save - read-only view
    if (userRole === "teacher") {
      setMessage("Error: You can only view student information. Contact an administrator to make changes.");
      return;
    }

    if (!form.fullName.trim()) {
      setMessage("Error: Full name is required.");
      return;
    }

    if (!form.studentId.trim()) {
      setMessage("Error: Student ID is required.");
      return;
    }

    if (!form.className.trim()) {
      setMessage("Error: Class is required.");
      return;
    }

    try {
      setSaving(true);
      setMessage("");

      const payload = {
        full_name: form.fullName.trim(),
        student_id: form.studentId.trim(),
        gender: form.gender || null,
        date_of_birth: form.dateOfBirth || null,
        age: form.age ? Number(form.age) : null,
        class_name: form.className.trim(),
        photo_url: form.photoUrl || null,

        father_name: form.fatherName.trim() || null,
        father_phone: form.fatherPhone.trim() || null,
        father_address: form.fatherAddress.trim() || null,

        mother_name: form.motherName.trim() || null,
        mother_phone: form.motherPhone.trim() || null,
        mother_address: form.motherAddress.trim() || null,

        stays_with: form.staysWith || null,

        guardian_name: form.guardianName.trim() || null,
        guardian_phone: form.guardianPhone.trim() || null,
        guardian_address: form.guardianAddress.trim() || null,

        emergency_contact: form.emergencyContact.trim() || null,

        health_condition: form.healthCondition.trim() || null,
        disability_support: form.disabilitySupport.trim() || null,
        health_note: form.healthNote.trim() || null,

        nhis_image_url: form.nhisImageUrl || null,
        weighing_card_url: form.weighingCardUrl || null,
        other_document_1_url: form.otherDocument1Url || null,
        other_document_2_url: form.otherDocument2Url || null,
        other_document_3_url: form.otherDocument3Url || null,

        status: form.status || "active",
      };

      const { error } = await supabase
        .from("students")
        .update(payload)
        .eq("id", form.id);

      if (error) {
        console.error("Supabase update error:", error);
        setMessage(`Error: ${error.message}`);
        return;
      }

      alert("Student profile updated successfully.");
    } catch (error) {
      console.error("Save student profile error:", error);

      if (error instanceof Error) {
        setMessage(`Error: ${error.message}`);
      } else {
        setMessage("Error: Failed to save student profile.");
      }
    } finally {
      setSaving(false);
    }
  }

  if (checkingUser || loading) {
    return <div style={{ padding: "24px" }}>Loading student profile...</div>;
  }

  if (!isAssignedStudent) {
    return (
      <main
        style={{
          minHeight: "100vh",
          background: COLORS.background,
          fontFamily: "Arial, sans-serif",
          color: COLORS.text,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "24px",
        }}
      >
        <div
          style={{
            textAlign: "center",
            background: COLORS.white,
            borderRadius: "16px",
            padding: "40px",
            maxWidth: "400px",
            boxShadow: "0 10px 28px rgba(0,0,0,0.08)",
          }}
        >
          <h2 style={{ margin: "0 0 12px", color: COLORS.danger }}>Access Denied</h2>
          <p style={{ margin: "0 0 24px", color: COLORS.muted }}>{message}</p>
          <Link
            href={userRole === "teacher" ? "/sds/teacher" : "/sds/admin"}
            style={{
              display: "inline-block",
              textDecoration: "none",
              background: COLORS.primary,
              color: COLORS.secondary,
              padding: "10px 20px",
              borderRadius: "8px",
              fontWeight: "bold",
            }}
          >
            Go Back
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        background: COLORS.background,
        fontFamily: "Arial, sans-serif",
        color: COLORS.text,
      }}
    >
      <div
        style={{
          background: COLORS.secondary,
          color: COLORS.white,
          padding: "16px",
          borderBottom: `6px solid ${COLORS.primary}`,
        }}
      >
        <div
          style={{
            maxWidth: "1300px",
            margin: "0 auto",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "start",
            gap: "12px",
            flexWrap: "wrap",
          }}
        >
          <div>
            <h1 style={{ margin: 0, fontSize: "clamp(18px, 5vw, 28px)" }}>Student Profile</h1>
            <p style={{ margin: "6px 0 0", fontWeight: "bold", fontSize: "clamp(12px, 4vw, 16px)" }}>{schoolName}</p>
            <p style={{ margin: "4px 0 0", opacity: 0.9, fontSize: "clamp(11px, 3vw, 14px)" }}>{motto}</p>
            <p style={{ margin: "6px 0 0", fontSize: "11px", opacity: 0.9 }}>
              <strong>{academicYear}</strong> • <strong>{currentTerm}</strong>
            </p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "auto auto", gap: "8px", width: "100%", maxWidth: "300px" }}>
            <Link
              href={userRole === "teacher" ? "/sds/teacher" : "/sds/admin"}
              style={{...topButtonStyle, fontSize: "12px", padding: "10px 12px"}}
            >
              Back to SDS
            </Link>
            {userRole === "admin" && (
              <button type="button" onClick={handleSave} disabled={saving} style={{...saveButtonStyle, fontSize: "12px", padding: "10px 12px"}}>
                {saving ? "Saving..." : "Save"}
              </button>
            )}
            {userRole === "teacher" && (
              <div style={{
                padding: "8px 12px",
                background: "#f3f4f6",
                borderRadius: "8px",
                fontSize: "11px",
                fontWeight: "bold",
                color: COLORS.muted,
                gridColumn: "1 / -1",
                textAlign: "center",
              }}>
                📖 View Only
              </div>
            )}
          </div>
        </div>
      </div>

      <div style={{ maxWidth: "1300px", margin: "0 auto", padding: "12px" }}>
        <div
          style={{
            background: COLORS.white,
            borderRadius: "22px",
            padding: "16px",
            boxShadow: "0 10px 28px rgba(0,0,0,0.08)",
            marginBottom: "16px",
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
              gap: "16px",
              alignItems: "start",
            }}
          >
            <div>
              {form.photoUrl ? (
                <img
                  src={form.photoUrl}
                  alt={form.fullName || "Student"}
                  style={{
                    width: "100%",
                    maxWidth: "220px",
                    height: "auto",
                    aspectRatio: "1",
                    objectFit: "cover",
                    borderRadius: "18px",
                    border: "1px solid #ddd",
                  }}
                />
              ) : (
                <div
                  style={{
                    width: "100%",
                    maxWidth: "220px",
                    aspectRatio: "1",
                    borderRadius: "18px",
                    border: "1px dashed #d1d5db",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#6b7280",
                    background: "#fafafa",
                    textAlign: "center",
                    padding: "12px",
                    fontSize: "12px",
                  }}
                >
                  No student photo
                </div>
              )}
            </div>

            <div>
              <h2 style={{ margin: 0, color: COLORS.secondary, fontSize: "clamp(16px, 5vw, 24px)" }}>
                {form.fullName || "Unnamed Student"}
              </h2>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
                  gap: "8px",
                  marginTop: "12px",
                }}
              >
                <InfoBadge label="Student ID" value={form.studentId || "-"} />
                <InfoBadge label="Class" value={form.className || "-"} />
                <InfoBadge label="Gender" value={form.gender || "-"} />
                <InfoBadge label="Age" value={form.age || "-"} />
                <InfoBadge label="Status" value={form.status || "-"} />
              </div>
            </div>
          </div>
        </div>

        {message && (
          <p
            style={{
              margin: "0 0 16px",
              color: message.startsWith("Error:") ? COLORS.danger : "#065f46",
              fontSize: "13px",
              fontWeight: 700,
            }}
          >
            {message}
          </p>
        )}

        <div style={{ display: "grid", gap: "18px" }}>
          <SectionCard title="Basic Info">
            <div style={gridStyle}>
              <div>
                <label style={labelStyle}>Full Name</label>
                <input
                  value={form.fullName}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, fullName: e.target.value }))
                  }
                  disabled={userRole === "teacher"}
                  style={{...inputStyle, background: userRole === "teacher" ? "#f3f4f6" : inputStyle.background}}
                />
              </div>

              <div>
                <label style={labelStyle}>Student ID</label>
                <input
                  value={form.studentId}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, studentId: e.target.value }))
                  }
                  disabled={userRole === "teacher"}
                  style={{...inputStyle, background: userRole === "teacher" ? "#f3f4f6" : inputStyle.background}}
                />
              </div>

              <div>
                <label style={labelStyle}>Gender</label>
                <select
                  value={form.gender}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, gender: e.target.value }))
                  }
                  disabled={userRole === "teacher"}
                  style={{...inputStyle, background: userRole === "teacher" ? "#f3f4f6" : inputStyle.background}}
                >
                  <option value="">Select</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                </select>
              </div>

              <div>
                <label style={labelStyle}>Class</label>
                <select
                  value={form.className}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, className: e.target.value }))
                  }
                  disabled={userRole === "teacher"}
                  style={{...inputStyle, background: userRole === "teacher" ? "#f3f4f6" : inputStyle.background}}
                >
                  <option value="">Select Class</option>
                  {classOptions.map((className) => (
                    <option key={className} value={className}>
                      {className}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={labelStyle}>Date of Birth</label>
                <input
                  type="date"
                  value={form.dateOfBirth}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, dateOfBirth: e.target.value }))
                  }
                  disabled={userRole === "teacher"}
                  style={{...inputStyle, background: userRole === "teacher" ? "#f3f4f6" : inputStyle.background}}
                />
              </div>

              <div>
                <label style={labelStyle}>Age</label>
                <input
                  value={form.age}
                  readOnly
                  style={{ ...inputStyle, background: "#f3f4f6" }}
                />
              </div>

              <div>
                <label style={labelStyle}>Status</label>
                <select
                  value={form.status}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, status: e.target.value }))
                  }
                  disabled={userRole === "teacher"}
                  style={{...inputStyle, background: userRole === "teacher" ? "#f3f4f6" : inputStyle.background}}
                >
                  <option value="active">active</option>
                  <option value="inactive">inactive</option>
                </select>
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Family / Home Info">
            <div style={gridStyle}>
              <div>
                <label style={labelStyle}>Father Name</label>
                <input
                  value={form.fatherName}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, fatherName: e.target.value }))
                  }
                  disabled={userRole === "teacher"}
                  style={{...inputStyle, background: userRole === "teacher" ? "#f3f4f6" : inputStyle.background}}
                />
              </div>

              <div>
                <label style={labelStyle}>Father Phone</label>
                <input
                  value={form.fatherPhone}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, fatherPhone: e.target.value }))
                  }
                  disabled={userRole === "teacher"}
                  style={{...inputStyle, background: userRole === "teacher" ? "#f3f4f6" : inputStyle.background}}
                />
              </div>

              <div style={{ gridColumn: "1 / -1" }}>
                <label style={labelStyle}>Father Address</label>
                <input
                  value={form.fatherAddress}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, fatherAddress: e.target.value }))
                  }
                  disabled={userRole === "teacher"}
                  style={{...inputStyle, background: userRole === "teacher" ? "#f3f4f6" : inputStyle.background}}
                />
              </div>

              <div>
                <label style={labelStyle}>Mother Name</label>
                <input
                  value={form.motherName}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, motherName: e.target.value }))
                  }
                  disabled={userRole === "teacher"}
                  style={{...inputStyle, background: userRole === "teacher" ? "#f3f4f6" : inputStyle.background}}
                />
              </div>

              <div>
                <label style={labelStyle}>Mother Phone</label>
                <input
                  value={form.motherPhone}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, motherPhone: e.target.value }))
                  }
                  disabled={userRole === "teacher"}
                  style={{...inputStyle, background: userRole === "teacher" ? "#f3f4f6" : inputStyle.background}}
                />
              </div>

              <div style={{ gridColumn: "1 / -1" }}>
                <label style={labelStyle}>Mother Address</label>
                <input
                  value={form.motherAddress}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, motherAddress: e.target.value }))
                  }
                  disabled={userRole === "teacher"}
                  style={{...inputStyle, background: userRole === "teacher" ? "#f3f4f6" : inputStyle.background}}
                />
              </div>

              <div>
                <label style={labelStyle}>Stays With</label>
                <select
                  value={form.staysWith}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, staysWith: e.target.value }))
                  }
                  disabled={userRole === "teacher"}
                  style={{...inputStyle, background: userRole === "teacher" ? "#f3f4f6" : inputStyle.background}}
                >
                  <option value="Both parents">Both parents</option>
                  <option value="Father">Father</option>
                  <option value="Mother">Mother</option>
                  <option value="Guardian">Guardian</option>
                </select>
              </div>

              <div>
                <label style={labelStyle}>Emergency Contact</label>
                <input
                  value={form.emergencyContact}
                  readOnly
                  style={{ ...inputStyle, background: "#f3f4f6" }}
                />
              </div>

              <div>
                <label style={labelStyle}>Guardian Name</label>
                <input
                  value={form.guardianName}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, guardianName: e.target.value }))
                  }
                  disabled={userRole === "teacher"}
                  style={{...inputStyle, background: userRole === "teacher" ? "#f3f4f6" : inputStyle.background}}
                />
              </div>

              <div>
                <label style={labelStyle}>Guardian Phone</label>
                <input
                  value={form.guardianPhone}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, guardianPhone: e.target.value }))
                  }
                  disabled={userRole === "teacher"}
                  style={{...inputStyle, background: userRole === "teacher" ? "#f3f4f6" : inputStyle.background}}
                />
              </div>

              <div style={{ gridColumn: "1 / -1" }}>
                <label style={labelStyle}>Guardian Address</label>
                <input
                  value={form.guardianAddress}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, guardianAddress: e.target.value }))
                  }
                  disabled={userRole === "teacher"}
                  style={{...inputStyle, background: userRole === "teacher" ? "#f3f4f6" : inputStyle.background}}
                />
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Health">
            <div style={gridStyle}>
              <div>
                <label style={labelStyle}>Health Condition</label>
                <input
                  value={form.healthCondition}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, healthCondition: e.target.value }))
                  }
                  disabled={userRole === "teacher"}
                  style={{...inputStyle, background: userRole === "teacher" ? "#f3f4f6" : inputStyle.background}}
                />
              </div>

              <div>
                <label style={labelStyle}>Disability / Special Support</label>
                <input
                  value={form.disabilitySupport}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, disabilitySupport: e.target.value }))
                  }
                  disabled={userRole === "teacher"}
                  style={{...inputStyle, background: userRole === "teacher" ? "#f3f4f6" : inputStyle.background}}
                />
              </div>

              <div style={{ gridColumn: "1 / -1" }}>
                <label style={labelStyle}>Note</label>
                <textarea
                  value={form.healthNote}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, healthNote: e.target.value }))
                  }
                  disabled={userRole === "teacher"}
                  style={{ ...inputStyle, minHeight: "100px", resize: "vertical", background: userRole === "teacher" ? "#f3f4f6" : inputStyle.background }}
                />
              </div>
            </div>
          </SectionCard>

          {userRole === "admin" && (
            <SectionCard title="Documents / Uploads">
              <div style={uploadGridStyle}>
              <SDSFileUpload
                label="Student Photo"
                value={form.photoUrl}
                accept="image/*"
                folder="jsms/sds/student-photos"
                onUploaded={(url) =>
                  setForm((prev) => ({ ...prev, photoUrl: url }))
                }
              />

              <SDSFileUpload
                label="NHIS Picture"
                value={form.nhisImageUrl}
                accept="image/*,.pdf"
                folder="jsms/sds/nhis"
                onUploaded={(url) =>
                  setForm((prev) => ({ ...prev, nhisImageUrl: url }))
                }
              />

              <SDSFileUpload
                label="Weighing Card"
                value={form.weighingCardUrl}
                accept="image/*,.pdf"
                folder="jsms/sds/weighing-card"
                onUploaded={(url) =>
                  setForm((prev) => ({ ...prev, weighingCardUrl: url }))
                }
              />

              <SDSFileUpload
                label="Other Document 1"
                value={form.otherDocument1Url}
                accept="image/*,.pdf,.doc,.docx"
                folder="jsms/sds/other-documents"
                onUploaded={(url) =>
                  setForm((prev) => ({ ...prev, otherDocument1Url: url }))
                }
              />

              <SDSFileUpload
                label="Other Document 2"
                value={form.otherDocument2Url}
                accept="image/*,.pdf,.doc,.docx"
                folder="jsms/sds/other-documents"
                onUploaded={(url) =>
                  setForm((prev) => ({ ...prev, otherDocument2Url: url }))
                }
              />

              <SDSFileUpload
                label="Other Document 3"
                value={form.otherDocument3Url}
                accept="image/*,.pdf,.doc,.docx"
                folder="jsms/sds/other-documents"
                onUploaded={(url) =>
                  setForm((prev) => ({ ...prev, otherDocument3Url: url }))
                }
              />
            </div>
            </SectionCard>
          )}
        </div>
      </div>
    </main>
  );
}

function InfoBadge({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        background: "#fafafa",
        border: "1px solid #e5e7eb",
        borderRadius: "14px",
        padding: "12px",
      }}
    >
      <p style={{ margin: 0, fontSize: "12px", color: "#6b7280" }}>{label}</p>
      <p style={{ margin: "6px 0 0", fontWeight: 800, color: "#111827" }}>{value}</p>
    </div>
  );
}

function SectionCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        background: COLORS.white,
        borderRadius: "20px",
        padding: "20px",
        boxShadow: "0 10px 28px rgba(0,0,0,0.08)",
      }}
    >
      <h3 style={{ marginTop: 0, marginBottom: "16px", color: COLORS.secondary }}>{title}</h3>
      {children}
    </div>
  );
}

const gridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
  gap: "12px",
};

const uploadGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
  gap: "12px",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  marginBottom: "6px",
  fontWeight: "bold",
  fontSize: "14px",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "12px",
  borderRadius: "10px",
  border: "1px solid #ddd",
  fontSize: "14px",
  outline: "none",
  minHeight: "44px",
};

const topButtonStyle: React.CSSProperties = {
  textDecoration: "none",
  border: "none",
  borderRadius: "10px",
  padding: "10px 14px",
  background: "#1f2937",
  color: "#ffffff",
  cursor: "pointer",
  fontWeight: "bold",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
};

const saveButtonStyle: React.CSSProperties = {
  border: "none",
  background: COLORS.primary,
  color: COLORS.secondary,
  borderRadius: "12px",
  padding: "10px 16px",
  fontWeight: 800,
  fontSize: "13px",
  cursor: "pointer",
};
