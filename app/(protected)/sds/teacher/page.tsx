"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type TeacherRow = Record<string, any>;
type StudentRow = Record<string, any>;
type SettingsRow = Record<string, any>;

const COLORS = {
  background: "#f8fafc",
  primary: "#f59e0b",
  secondary: "#111827",
  white: "#ffffff",
  text: "#111827",
  muted: "#6b7280",
  border: "#e5e7eb",
  cardBg: "#ffffff",
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

export default function SDSTeacherPage() {
  const router = useRouter();

  const [checkingUser, setCheckingUser] = useState(true);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [assignedClassIds, setAssignedClassIds] = useState<string[]>([]);
  const [classIdToNameMap, setClassIdToNameMap] = useState<Record<string, string>>({});
  const [assignedClassNames, setAssignedClassNames] = useState<string[]>([]);
  const [selectedClass, setSelectedClass] = useState<string>("");
  const [settingsRow, setSettingsRow] = useState<SettingsRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    let active = true;

    async function checkUserAndLoad() {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!active) return;

        if (!session?.user) {
          router.replace("/");
          return;
        }

        const [teachersRes, settingsRes, classesRes, studentsRes] = await Promise.all([
          supabase.from("teachers").select("*"),
          supabase.from("school_settings").select("*").limit(1).maybeSingle(),
          supabase.from("classes").select("*").order("class_order", { ascending: true }),
          supabase.from("students").select("*"),
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

        if (role !== "teacher") {
          router.replace("/sds/admin");
          return;
        }

        // Get teacher's assigned classes
        const assignResponse = await fetch(`/api/teacher-assignments/get?teacher_id=${userRow.id}`);
        const assignData = await assignResponse.json();

        if (!assignResponse.ok || assignData.error) {
          console.error("Failed to load teacher assignments:", assignData.error);
          setAssignedClassIds([]);
          setAssignedClassNames([]);
        } else {
          const classIds = assignData.class_ids || [];
          setAssignedClassIds(classIds);

          // Create mapping from class_id to class_name
          const idToNameMap: Record<string, string> = {};
          const classNames: string[] = [];
          
          (classesRes.data || []).forEach((cls: any) => {
            const classId = String(cls.id || "").trim();
            const className = String(cls.class_name || "").trim();
            idToNameMap[classId] = className;
            
            // Add to classNames only if teacher is assigned to this class
            if (classIds.includes(classId)) {
              classNames.push(className);
            }
          });

          setClassIdToNameMap(idToNameMap);
          setAssignedClassNames(classNames);
          
          // Set default selected class
          if (classNames.length > 0) {
            setSelectedClass(classNames[0]);
          }
        }

        setStudents(studentsRes.data || []);
        setSettingsRow(settingsRes.data || null);

        setCheckingUser(false);
        setLoading(false);
      } catch (error) {
        console.error("Error loading teacher SDS:", error);
        router.replace("/");
      }
    }

    void checkUserAndLoad();

    return () => {
      active = false;
    };
  }, [router]);

  const schoolName = String(settingsRow?.school_name || "School");
  const motto = String(settingsRow?.motto || "");

  // Filter students to only show those in the selected class
  const assignedStudents = useMemo(() => {
    if (!selectedClass) return [];

    return students.filter((student) => {
      const studentClass = getClassName(student);
      return studentClass === selectedClass;
    });
  }, [students, selectedClass]);

  // Further filter by search
  const filteredStudents = useMemo(() => {
    return assignedStudents.filter((student) => {
      const studentName = getStudentName(student);
      const studentId = getStudentIdValue(student);

      const text = search.trim().toLowerCase();
      if (!text) return true;

      return (
        studentName.toLowerCase().includes(text) ||
        studentId.toLowerCase().includes(text)
      );
    });
  }, [assignedStudents, search]);

  if (checkingUser || loading) {
    return (
      <div style={{
        minHeight: "100vh",
        background: COLORS.background,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "Arial, sans-serif",
      }}>
        <div style={{ textAlign: "center" }}>
          <div style={{
            width: "40px",
            height: "40px",
            border: `3px solid ${COLORS.primary}`,
            borderTop: "3px solid transparent",
            borderRadius: "50%",
            animation: "spin 1s linear infinite",
            margin: "0 auto 16px",
          }} />
          <p style={{ color: COLORS.text, margin: 0 }}>Loading Student Database...</p>
        </div>
        <style>{`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}</style>
      </div>
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
      {/* Mobile-friendly header */}
      <div
        style={{
          background: COLORS.secondary,
          color: COLORS.white,
          padding: "16px",
          position: "sticky",
          top: 0,
          zIndex: 10,
          boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
        }}
      >
        <div style={{ maxWidth: "100%", margin: "0 auto" }}>
          <div style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "8px",
          }}>
            <Link
              href="/dashboard/teacher"
              style={{
                textDecoration: "none",
                color: COLORS.white,
                fontSize: "18px",
                fontWeight: "bold",
              }}
            >
              ← Back
            </Link>
            <h1 style={{
              margin: 0,
              fontSize: "18px",
              fontWeight: "bold",
              textAlign: "center",
              flex: 1,
            }}>
              Student Database
            </h1>
          </div>

          <div style={{ textAlign: "center", marginBottom: "12px" }}>
            <p style={{ margin: "4px 0", fontSize: "14px", fontWeight: "bold" }}>
              {schoolName}
            </p>
            {motto && (
              <p style={{ margin: "2px 0", fontSize: "12px", opacity: 0.9 }}>
                {motto}
              </p>
            )}
          </div>

          {/* Class selector - only show if multiple classes */}
          {assignedClassNames.length > 1 && (
            <div style={{ marginBottom: "12px" }}>
              <select
                value={selectedClass}
                onChange={(e) => setSelectedClass(e.target.value)}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: "8px",
                  border: "none",
                  fontSize: "14px",
                  background: "rgba(255,255,255,0.2)",
                  color: COLORS.white,
                  fontWeight: "600",
                  outline: "none",
                  cursor: "pointer",
                }}
              >
                {assignedClassNames.map((className) => (
                  <option key={className} value={className} style={{ color: COLORS.text }}>
                    {className}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Search bar */}
          <div>
            <input
              type="text"
              placeholder="Search students..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: "8px",
                border: "none",
                fontSize: "14px",
                background: "rgba(255,255,255,0.1)",
                color: COLORS.white,
                outline: "none",
              }}
            />
          </div>
        </div>
      </div>

      {/* Content */}
      <div style={{ padding: "16px", maxWidth: "100%", margin: "0 auto" }}>
        {assignedClassNames.length === 0 ? (
          <div style={{
            textAlign: "center",
            padding: "40px 20px",
            background: COLORS.white,
            borderRadius: "12px",
            boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
          }}>
            <p style={{
              margin: 0,
              color: COLORS.muted,
              fontSize: "16px",
            }}>
              No classes assigned to you yet.
            </p>
            <p style={{
              margin: "8px 0 0",
              color: COLORS.muted,
              fontSize: "14px",
            }}>
              Contact your administrator to assign classes.
            </p>
          </div>
        ) : !selectedClass ? (
          <div style={{
            textAlign: "center",
            padding: "40px 20px",
            background: COLORS.white,
            borderRadius: "12px",
            boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
          }}>
            <p style={{
              margin: 0,
              color: COLORS.muted,
              fontSize: "16px",
            }}>
              Please select a class to view students.
            </p>
          </div>
        ) : filteredStudents.length === 0 ? (
          <div style={{
            textAlign: "center",
            padding: "40px 20px",
            background: COLORS.white,
            borderRadius: "12px",
            boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
          }}>
            <p style={{
              margin: 0,
              color: COLORS.muted,
              fontSize: "16px",
            }}>
              {search ? "No students found matching your search." : "No students in this class."}
            </p>
          </div>
        ) : (
          <div style={{ display: "grid", gap: "12px" }}>
            {filteredStudents.map((student) => (
              <div
                key={student.id}
                style={{
                  background: COLORS.white,
                  borderRadius: "12px",
                  padding: "16px",
                  boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
                  border: `1px solid ${COLORS.border}`,
                }}
              >
                <div style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  marginBottom: "12px",
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <h3 style={{
                      margin: "0 0 4px",
                      fontSize: "16px",
                      fontWeight: "bold",
                      color: COLORS.text,
                      wordBreak: "break-word",
                    }}>
                      {getStudentName(student)}
                    </h3>
                    <p style={{
                      margin: 0,
                      fontSize: "14px",
                      color: COLORS.primary,
                      fontWeight: "600",
                    }}>
                      ID: {getStudentIdValue(student)}
                    </p>
                  </div>
                  <div style={{
                    background: COLORS.primary,
                    color: COLORS.secondary,
                    padding: "4px 8px",
                    borderRadius: "6px",
                    fontSize: "12px",
                    fontWeight: "bold",
                    flexShrink: 0,
                  }}>
                    {getClassName(student)}
                  </div>
                </div>

                <div style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "8px",
                  marginBottom: "12px",
                  fontSize: "13px",
                }}>
                  <div>
                    <span style={{ color: COLORS.muted }}>Gender:</span>
                    <br />
                    <span style={{ fontWeight: "500" }}>
                      {String(student.gender || "Not set")}
                    </span>
                  </div>
                  <div>
                    <span style={{ color: COLORS.muted }}>Age:</span>
                    <br />
                    <span style={{ fontWeight: "500" }}>
                      {String(student.age || "Not set")}
                    </span>
                  </div>
                  <div>
                    <span style={{ color: COLORS.muted }}>Status:</span>
                    <br />
                    <span style={{
                      fontWeight: "500",
                      color: student.status === "active" ? "#10b981" : "#ef4444"
                    }}>
                      {String(student.status || "active")}
                    </span>
                  </div>
                  <div>
                    <span style={{ color: COLORS.muted }}>Emergency:</span>
                    <br />
                    <span style={{ fontWeight: "500" }}>
                      {String(student.emergency_contact || "Not set")}
                    </span>
                  </div>
                </div>

                <Link
                  href={`/sds/admin/students/${student.id}`}
                  style={{
                    display: "block",
                    textDecoration: "none",
                    background: COLORS.primary,
                    color: COLORS.secondary,
                    padding: "10px 16px",
                    borderRadius: "8px",
                    textAlign: "center",
                    fontSize: "14px",
                    fontWeight: "bold",
                    transition: "all 0.2s ease",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "#d97706";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = COLORS.primary;
                  }}
                >
                  View Full Profile
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{
        textAlign: "center",
        padding: "16px",
        color: COLORS.muted,
        fontSize: "12px",
      }}>
        <p style={{ margin: 0 }}>
          System developed by Lord Wilhelm
        </p>
      </div>
    </main>
  );
}