"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type TeacherRow = Record<string, any>;
type StudentRow = Record<string, any>;
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

function getStudentName(row: StudentRow) {
  const fullName = String(row.full_name || "").trim();
  if (fullName) return fullName;

  const first = String(row.first_name || "").trim();
  const other = String(row.other_name || "").trim();
  const last = String(row.last_name || "").trim();
  return `${first} ${other} ${last}`.replace(/\s+/g, " ").trim();
}

function getStudentIdValue(row: StudentRow) {
  return String(row.student_id || row.studentId || row.id || "").trim();
}

function getClassName(row: Record<string, any>) {
  return String(row.class_name || row.className || "").trim();
}

function normalizePhone(value: string) {
  return value.trim();
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

function makeStudentId(existingRows: StudentRow[]) {
  let newId = "";
  let duplicate = true;

  while (duplicate) {
    const randomNumber = Math.floor(100000 + Math.random() * 900000);
    newId = `JVS${randomNumber}`;
    duplicate = existingRows.some(
      (row) => getStudentIdValue(row).toLowerCase() === newId.toLowerCase()
    );
  }

  return newId;
}

export default function SDSAdminPage() {
  const router = useRouter();

  const [checkingUser, setCheckingUser] = useState(true);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [settingsRow, setSettingsRow] = useState<SettingsRow | null>(null);

  const [loading, setLoading] = useState(true);

  const [classFilter, setClassFilter] = useState("All");
  const [search, setSearch] = useState("");

  const [showAddModal, setShowAddModal] = useState(false);
  const [savingStudent, setSavingStudent] = useState(false);
  const [message, setMessage] = useState("");

  const [form, setForm] = useState({
    fullName: "",
    studentId: "",
    gender: "",
    dateOfBirth: "",
    age: "",
    className: "",

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
    status: "active",
  });

  useEffect(() => {
    let active = true;

    async function checkUserAndLoad() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!active) return;

      if (!session?.user) {
        router.replace("/");
        return;
      }

      const [teachersRes, studentsRes, classesRes, settingsRes] = await Promise.all([
        supabase.from("teachers").select("*"),
        supabase.from("students").select("*"),
        supabase.from("classes").select("*").order("class_order", { ascending: true }),
        supabase.from("school_settings").select("*").limit(1).maybeSingle(),
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

      if (role === "teacher") {
        router.replace("/sds/teacher");
        return;
      }

      setStudents(studentsRes.data || []);
      setClasses(classesRes.data || []);
      setSettingsRow(settingsRes.data || null);

      if (classesRes.data && classesRes.data.length > 0) {
        const firstClass = getClassName(classesRes.data[0]);
        setForm((prev) => ({
          ...prev,
          className: prev.className || firstClass,
        }));
      }

      setCheckingUser(false);
      setLoading(false);
    }

    void checkUserAndLoad();

    return () => {
      active = false;
    };
  }, [router]);

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
  const currentTerm = String(settingsRow?.current_term || "-");
  const academicYear = String(settingsRow?.academic_year || "-");

  const classOptions = useMemo(() => {
    const fromClasses = classes.map((row) => getClassName(row)).filter(Boolean);
    const fromStudents = students.map((row) => getClassName(row)).filter(Boolean);
    return Array.from(new Set([...fromClasses, ...fromStudents]));
  }, [classes, students]);

  const filteredStudents = useMemo(() => {
    return students.filter((student) => {
      const studentName = getStudentName(student);
      const studentId = getStudentIdValue(student);
      const className = getClassName(student);

      const matchesClass = classFilter === "All" ? true : className === classFilter;

      const text = search.trim().toLowerCase();
      const matchesSearch =
        !text ||
        studentName.toLowerCase().includes(text) ||
        studentId.toLowerCase().includes(text) ||
        className.toLowerCase().includes(text);

      return matchesClass && matchesSearch;
    });
  }, [students, classFilter, search]);

  function openAddStudentModal() {
    setMessage("");
    const generatedId = makeStudentId(students);

    setForm((prev) => ({
      ...prev,
      fullName: "",
      studentId: generatedId,
      gender: "",
      dateOfBirth: "",
      age: "",
      className: prev.className || classOptions[0] || "",
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
      status: "active",
    }));

    setShowAddModal(true);
  }

  async function handleAddStudent() {
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
      setSavingStudent(true);
      setMessage("");

      const payload = {
        full_name: form.fullName.trim(),
        student_id: form.studentId.trim(),
        gender: form.gender || null,
        date_of_birth: form.dateOfBirth || null,
        age: form.age ? Number(form.age) : null,
        class_name: form.className,
        father_name: form.fatherName.trim() || null,
        father_phone: normalizePhone(form.fatherPhone) || null,
        father_address: form.fatherAddress.trim() || null,
        mother_name: form.motherName.trim() || null,
        mother_phone: normalizePhone(form.motherPhone) || null,
        mother_address: form.motherAddress.trim() || null,
        stays_with: form.staysWith || null,
        guardian_name: form.guardianName.trim() || null,
        guardian_phone: normalizePhone(form.guardianPhone) || null,
        guardian_address: form.guardianAddress.trim() || null,
        emergency_contact: normalizePhone(form.emergencyContact) || null,
        health_condition: form.healthCondition.trim() || null,
        disability_support: form.disabilitySupport.trim() || null,
        health_note: form.healthNote.trim() || null,
        status: form.status || "active",
      };

      const { data, error } = await supabase
        .from("students")
        .insert([payload])
        .select()
        .single();

      if (error) {
        throw error;
      }

      setStudents((prev) =>
        [...prev, data].sort((a, b) => getStudentName(a).localeCompare(getStudentName(b)))
      );

      setShowAddModal(false);
      setMessage("");
      alert("Student added successfully.");
    } catch (error) {
      console.error(error);
      setMessage(
        error instanceof Error ? `Error: ${error.message}` : "Error: Failed to add student."
      );
    } finally {
      setSavingStudent(false);
    }
  }

  if (checkingUser || loading) {
    return <div style={{ padding: "24px" }}>Loading SDS...</div>;
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
          padding: "20px 24px",
          borderBottom: `6px solid ${COLORS.primary}`,
        }}
      >
        <div
          style={{
            maxWidth: "1400px",
            margin: "0 auto",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "start",
            gap: "12px",
            flexWrap: "wrap",
          }}
        >
          <div>
            <h1 style={{ margin: 0 }}>Student Data System</h1>
            <p style={{ margin: "6px 0 0", fontWeight: "bold" }}>{schoolName}</p>
            <p style={{ margin: "4px 0 0", opacity: 0.9 }}>{motto}</p>
            <p style={{ margin: "6px 0 0", fontSize: "13px", opacity: 0.9 }}>
              <strong>{academicYear}</strong> • <strong>{currentTerm}</strong>
            </p>
          </div>

          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <Link href="/dashboard/admin" style={topButtonStyle}>
              JSMS Dashboard
            </Link>
            <button type="button" onClick={openAddStudentModal} style={addButtonStyle}>
              Add Student
            </button>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: "1400px", margin: "0 auto", padding: "24px" }}>
        <div
          style={{
            background: COLORS.white,
            borderRadius: "16px",
            padding: "18px",
            boxShadow: "0 8px 22px rgba(0,0,0,0.06)",
            marginBottom: "20px",
          }}
        >
          <h3 style={{ marginTop: 0, color: COLORS.secondary }}>Filters</h3>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: "12px",
            }}
          >
            <div>
              <label style={labelStyle}>Class</label>
              <select
                value={classFilter}
                onChange={(e) => setClassFilter(e.target.value)}
                style={inputStyle}
              >
                <option value="All">All</option>
                {classOptions.map((className) => (
                  <option key={className} value={className}>
                    {className}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={labelStyle}>Search</label>
              <input
                type="text"
                placeholder="Name, ID, class"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={inputStyle}
              />
            </div>
          </div>
        </div>

        <div
          style={{
            background: COLORS.white,
            borderRadius: "16px",
            padding: "18px",
            boxShadow: "0 8px 22px rgba(0,0,0,0.06)",
            overflowX: "auto",
          }}
        >
          {filteredStudents.length === 0 ? (
            <p style={{ margin: 0, color: COLORS.muted }}>No students found.</p>
          ) : (
            <table style={tableStyle}>
              <thead>
                <tr style={{ background: "#fff7cc" }}>
                  <th style={thStyle}>Full Name</th>
                  <th style={thStyle}>Student ID</th>
                  <th style={thStyle}>Class</th>
                  <th style={thStyle}>Gender</th>
                  <th style={thStyle}>Age</th>
                  <th style={thStyle}>Status</th>
                  <th style={thStyle}>Open</th>
                </tr>
              </thead>

              <tbody>
                {filteredStudents.map((student) => (
                  <tr key={student.id}>
                    <td style={tdStyle}>{getStudentName(student)}</td>
                    <td style={tdStyle}>{getStudentIdValue(student)}</td>
                    <td style={tdStyle}>{getClassName(student)}</td>
                    <td style={tdStyle}>{String(student.gender || "-")}</td>
                    <td style={tdStyle}>{String(student.age || "-")}</td>
                    <td style={tdStyle}>{String(student.status || "active")}</td>
                    <td style={tdStyle}>
                      <Link
                        href={`/sds/admin/students/${student.id}`}
                        style={openLinkStyle}
                      >
                        Open Profile
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <p
          style={{
            textAlign: "center",
            marginTop: "20px",
            fontSize: "12px",
            color: "#666",
          }}
        >
          System developed by Lord Wilhelm (0593410452)
        </p>
      </div>

      {showAddModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "18px",
            zIndex: 1000,
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: "980px",
              maxHeight: "92vh",
              overflowY: "auto",
              background: COLORS.white,
              borderRadius: "24px",
              padding: "22px",
              boxShadow: "0 18px 40px rgba(0,0,0,0.16)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: "12px",
                alignItems: "start",
                marginBottom: "18px",
              }}
            >
              <div>
                <h2 style={{ margin: 0, color: COLORS.secondary }}>Add Student</h2>
                <p style={{ margin: "6px 0 0", color: COLORS.muted, fontSize: "13px" }}>
                  Create the student first. Full profile details and document uploads come on the profile page.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                style={closeButtonStyle}
              >
                Close
              </button>
            </div>

            <div style={{ display: "grid", gap: "18px" }}>
              <SectionCard title="Student Basic">
                <div style={gridStyle}>
                  <div>
                    <label style={labelStyle}>Full Name</label>
                    <input
                      value={form.fullName}
                      onChange={(e) =>
                        setForm((prev) => ({ ...prev, fullName: e.target.value }))
                      }
                      style={inputStyle}
                    />
                  </div>

                  <div>
                    <label style={labelStyle}>Student ID</label>
                    <input
                      value={form.studentId}
                      onChange={(e) =>
                        setForm((prev) => ({ ...prev, studentId: e.target.value }))
                      }
                      style={inputStyle}
                    />
                  </div>

                  <div>
                    <label style={labelStyle}>Gender</label>
                    <select
                      value={form.gender}
                      onChange={(e) =>
                        setForm((prev) => ({ ...prev, gender: e.target.value }))
                      }
                      style={inputStyle}
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
                      style={inputStyle}
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
                      style={inputStyle}
                    />
                  </div>

                  <div>
                    <label style={labelStyle}>Age</label>
                    <input value={form.age} readOnly style={{ ...inputStyle, background: "#f3f4f6" }} />
                  </div>

                  <div>
                    <label style={labelStyle}>Status</label>
                    <select
                      value={form.status}
                      onChange={(e) =>
                        setForm((prev) => ({ ...prev, status: e.target.value }))
                      }
                      style={inputStyle}
                    >
                      <option value="active">active</option>
                      <option value="inactive">inactive</option>
                    </select>
                  </div>
                </div>
              </SectionCard>

              <SectionCard title="Home / Contact">
                <div style={gridStyle}>
                  <div>
                    <label style={labelStyle}>Father Name</label>
                    <input
                      value={form.fatherName}
                      onChange={(e) =>
                        setForm((prev) => ({ ...prev, fatherName: e.target.value }))
                      }
                      style={inputStyle}
                    />
                  </div>

                  <div>
                    <label style={labelStyle}>Father Phone</label>
                    <input
                      value={form.fatherPhone}
                      onChange={(e) =>
                        setForm((prev) => ({ ...prev, fatherPhone: e.target.value }))
                      }
                      style={inputStyle}
                    />
                  </div>

                  <div style={{ gridColumn: "1 / -1" }}>
                    <label style={labelStyle}>Father Address</label>
                    <input
                      value={form.fatherAddress}
                      onChange={(e) =>
                        setForm((prev) => ({ ...prev, fatherAddress: e.target.value }))
                      }
                      style={inputStyle}
                    />
                  </div>

                  <div>
                    <label style={labelStyle}>Mother Name</label>
                    <input
                      value={form.motherName}
                      onChange={(e) =>
                        setForm((prev) => ({ ...prev, motherName: e.target.value }))
                      }
                      style={inputStyle}
                    />
                  </div>

                  <div>
                    <label style={labelStyle}>Mother Phone</label>
                    <input
                      value={form.motherPhone}
                      onChange={(e) =>
                        setForm((prev) => ({ ...prev, motherPhone: e.target.value }))
                      }
                      style={inputStyle}
                    />
                  </div>

                  <div style={{ gridColumn: "1 / -1" }}>
                    <label style={labelStyle}>Mother Address</label>
                    <input
                      value={form.motherAddress}
                      onChange={(e) =>
                        setForm((prev) => ({ ...prev, motherAddress: e.target.value }))
                      }
                      style={inputStyle}
                    />
                  </div>

                  <div>
                    <label style={labelStyle}>Stays With</label>
                    <select
                      value={form.staysWith}
                      onChange={(e) =>
                        setForm((prev) => ({ ...prev, staysWith: e.target.value }))
                      }
                      style={inputStyle}
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
                      style={inputStyle}
                    />
                  </div>

                  <div>
                    <label style={labelStyle}>Guardian Phone</label>
                    <input
                      value={form.guardianPhone}
                      onChange={(e) =>
                        setForm((prev) => ({ ...prev, guardianPhone: e.target.value }))
                      }
                      style={inputStyle}
                    />
                  </div>

                  <div style={{ gridColumn: "1 / -1" }}>
                    <label style={labelStyle}>Guardian Address</label>
                    <input
                      value={form.guardianAddress}
                      onChange={(e) =>
                        setForm((prev) => ({ ...prev, guardianAddress: e.target.value }))
                      }
                      style={inputStyle}
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
                      style={inputStyle}
                    />
                  </div>

                  <div>
                    <label style={labelStyle}>Disability / Special Support</label>
                    <input
                      value={form.disabilitySupport}
                      onChange={(e) =>
                        setForm((prev) => ({ ...prev, disabilitySupport: e.target.value }))
                      }
                      style={inputStyle}
                    />
                  </div>

                  <div style={{ gridColumn: "1 / -1" }}>
                    <label style={labelStyle}>Note</label>
                    <textarea
                      value={form.healthNote}
                      onChange={(e) =>
                        setForm((prev) => ({ ...prev, healthNote: e.target.value }))
                      }
                      style={{ ...inputStyle, minHeight: "90px", resize: "vertical" }}
                    />
                  </div>
                </div>
              </SectionCard>

              {message && (
                <p
                  style={{
                    margin: 0,
                    color: message.startsWith("Error:") ? COLORS.danger : "#065f46",
                    fontSize: "13px",
                    fontWeight: 700,
                  }}
                >
                  {message}
                </p>
              )}

              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={handleAddStudent}
                  disabled={savingStudent}
                  style={addButtonStyle}
                >
                  {savingStudent ? "Saving..." : "Save Student"}
                </button>

                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  style={cancelButtonStyle}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
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
        background: "#fafafa",
        border: "1px solid #e5e7eb",
        borderRadius: "16px",
        padding: "16px",
      }}
    >
      <h3 style={{ marginTop: 0, marginBottom: "14px", color: COLORS.secondary }}>{title}</h3>
      {children}
    </div>
  );
}

const gridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
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
};

const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: "14px",
};

const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "12px",
  borderBottom: "1px solid #e5e7eb",
};

const tdStyle: React.CSSProperties = {
  padding: "12px",
  borderBottom: "1px solid #f0f0f0",
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

const addButtonStyle: React.CSSProperties = {
  border: "none",
  background: COLORS.primary,
  color: COLORS.secondary,
  borderRadius: "12px",
  padding: "12px 16px",
  fontWeight: 800,
  fontSize: "13px",
  cursor: "pointer",
};

const cancelButtonStyle: React.CSSProperties = {
  border: "1px solid #d1d5db",
  background: "#ffffff",
  color: COLORS.secondary,
  borderRadius: "12px",
  padding: "12px 16px",
  fontWeight: 800,
  fontSize: "13px",
  cursor: "pointer",
};

const closeButtonStyle: React.CSSProperties = {
  border: "1px solid #d1d5db",
  background: "#ffffff",
  color: COLORS.secondary,
  borderRadius: "12px",
  padding: "10px 14px",
  fontWeight: 800,
  fontSize: "13px",
  cursor: "pointer",
};

const openLinkStyle: React.CSSProperties = {
  textDecoration: "none",
  color: "#b45309",
  fontWeight: 800,
};
