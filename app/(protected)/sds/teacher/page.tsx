"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { authedFetch } from "@/lib/apiClient";

type AnyRow = Record<string, any>;

type TeacherRow = {
  id: string;
  teacher_id: string;
  full_name: string;
  username?: string | null;
  login_email?: string | null;
  auth_user_id?: string | null;
  photo_url?: string | null;
  role?: string | null;
};

type ClassRow = {
  id: string;
  class_name?: string | null;
  name?: string | null;
  class_order?: number | null;
};

type StudentRow = AnyRow;

const COLORS = {
  page: "#f4f8f0",
  deep: "#063f1d",
  green: "#0f7a3b",
  gold: "#f4d35e",
  white: "#ffffff",
  text: "#102016",
  muted: "#6b7280",
  border: "#d9e6dc",
  soft: "#eef7ef",
  danger: "#991b1b",
};

function valueOf(row: AnyRow | null | undefined, keys: string[], fallback = "") {
  if (!row) return fallback;
  for (const key of keys) {
    const value = row[key];
    if (value !== null && value !== undefined && String(value).trim() !== "") {
      return String(value).trim();
    }
  }
  return fallback;
}

function getClassName(row: AnyRow | null | undefined) {
  return valueOf(row, ["class_name", "name", "class", "student_class"], "");
}

function getStudentName(row: StudentRow) {
  const full = valueOf(row, ["full_name", "student_name", "name"]);
  if (full) return full;

  const parts = [
    valueOf(row, ["first_name"]),
    valueOf(row, ["other_name"]),
    valueOf(row, ["last_name"]),
  ].filter(Boolean);

  return parts.join(" ") || "Student";
}

function getStudentId(row: StudentRow) {
  return valueOf(row, [
    "student_id",
    "studentId",
    "studentID",
    "jvs_id",
    "jvsId",
    "admission_number",
    "admission_no",
  ]);
}

function getStudentPhoto(row: StudentRow) {
  return valueOf(row, [
    "photo_url",
    "student_photo_url",
    "profile_photo_url",
    "image_url",
    "picture_url",
    "passport_photo_url",
    "passport_url",
    "avatar_url",
  ]);
}

function getInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((x) => x[0]?.toUpperCase())
    .join("") || "S";
}

function getFirstName(name: string) {
  return name.split(" ").filter(Boolean)[0] || name;
}

function formatDate(value: string) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function telLink(phone: string) {
  const clean = phone.replace(/[^0-9+]/g, "");
  return clean ? `tel:${clean}` : "";
}

function calcAge(dob: string) {
  if (!dob) return "—";
  const birth = new Date(dob);
  if (Number.isNaN(birth.getTime())) return "—";
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age -= 1;
  return String(age);
}

function isActiveStudent(row: StudentRow) {
  if (typeof row.active === "boolean") return row.active;
  if (typeof row.is_active === "boolean") return row.is_active;
  if (typeof row.left_school === "boolean") return !row.left_school;
  const status = valueOf(row, ["status"]).toLowerCase();
  if (!status) return true;
  return !["inactive", "left", "withdrawn", "deleted"].includes(status);
}

function InfoLine({ label, value }: { label: string; value?: string | null }) {
  return (
    <div style={styles.infoLine}>
      <span style={styles.infoLabel}>{label}</span>
      <span style={styles.infoValue}>{value || "—"}</span>
    </div>
  );
}

function PhoneButton({ label, phone }: { label: string; phone: string }) {
  if (!phone) return null;
  return (
    <a href={telLink(phone)} style={styles.callButton}>
      📞 {label}
    </a>
  );
}

function StudentAvatar({ student }: { student: StudentRow }) {
  const name = getStudentName(student);
  const photo = getStudentPhoto(student);

  return (
    <div style={styles.avatar}>
      {photo ? (
        <img src={photo} alt={name} style={styles.avatarImg} />
      ) : (
        <span>{getInitials(name)}</span>
      )}
    </div>
  );
}

export default function TeacherStudentDataPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("Loading students...");
  const [teacher, setTeacher] = useState<TeacherRow | null>(null);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [assignedClassIds, setAssignedClassIds] = useState<string[]>([]);
  const [selectedClassId, setSelectedClassId] = useState("");
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [search, setSearch] = useState("");
  const [selectedStudent, setSelectedStudent] = useState<StudentRow | null>(null);

  useEffect(() => {
    let active = true;

    async function loadPage() {
      try {
        setLoading(true);
        setMessage("Checking teacher account...");

        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session?.user) {
          router.replace("/");
          return;
        }

        const [teacherRes, classesRes] = await Promise.all([
          supabase
            .from("teachers")
            .select("*")
            .or(
              `auth_user_id.eq.${session.user.id},login_email.eq.${session.user.email || ""}`
            )
            .limit(1)
            .maybeSingle(),
          supabase
            .from("classes")
            .select("*")
            .order("class_order", { ascending: true }),
        ]);

        if (!active) return;

        if (teacherRes.error) throw teacherRes.error;

        const teacherRow = teacherRes.data as TeacherRow | null;
        if (!teacherRow?.id) {
          setMessage("Teacher account not found.");
          setLoading(false);
          return;
        }

        const role = String(teacherRow.role || "teacher").toLowerCase();
        if (role !== "teacher") {
          router.replace("/sds");
          return;
        }

        const classRows = ((classesRes.data || []) as ClassRow[]).filter((row) => row.id);
        setTeacher(teacherRow);
        setClasses(classRows);

        // Important JSMS mapping:
        // teacher_class_assignments.teacher_id stores teachers.id UUID, not JVST teacher_id.
        setMessage("Loading assigned class(es)...");

        let classIds: string[] = [];

        try {
          const response = await authedFetch(`/api/teacher-assignments/get?teacher_id=${teacherRow.id}`);
          const payload = await response.json();
          if (response.ok && !payload?.error && Array.isArray(payload?.class_ids)) {
            classIds = payload.class_ids.map((id: any) => String(id));
          }
        } catch (error) {
          console.warn("Assignment API failed, using direct fallback.", error);
        }

        if (classIds.length === 0) {
          const { data: directAssignments, error: directError } = await supabase
            .from("teacher_class_assignments")
            .select("class_id")
            .eq("teacher_id", teacherRow.id);

          if (directError) throw directError;
          classIds = (directAssignments || [])
            .map((row: any) => String(row.class_id || ""))
            .filter(Boolean);
        }

        // Older fallback table, just in case.
        if (classIds.length === 0) {
          const { data: olderAssignments } = await supabase
            .from("teacher_classes")
            .select("class_id")
            .eq("teacher_id", teacherRow.id);

          classIds = (olderAssignments || [])
            .map((row: any) => String(row.class_id || ""))
            .filter(Boolean);
        }

        const cleanClassIds = Array.from(new Set(classIds));
        setAssignedClassIds(cleanClassIds);

        if (cleanClassIds.length > 0) {
          setSelectedClassId(cleanClassIds[0]);
        }

        setLoading(false);
      } catch (error: any) {
        console.error(error);
        setMessage(error?.message || "Failed to load student data.");
        setLoading(false);
      }
    }

    loadPage();

    return () => {
      active = false;
    };
  }, [router]);

  useEffect(() => {
    let active = true;

    async function loadStudents() {
      if (!selectedClassId) {
        setStudents([]);
        return;
      }

      try {
        setMessage("Loading students...");

        const selectedClass = classes.find((row) => String(row.id) === selectedClassId);
        const selectedClassName = getClassName(selectedClass);

        let query = supabase
          .from("students")
          .select("*")
          .order("full_name", { ascending: true });

        // Prefer class_id. If older records lack class_id, fallback below also loads by class_name.
        const { data: byClassId, error: idError } = await query.eq("class_id", selectedClassId);
        if (idError) throw idError;

        let rows = byClassId || [];

        if (selectedClassName) {
          const { data: byClassName } = await supabase
            .from("students")
            .select("*")
            .eq("class_name", selectedClassName)
            .order("full_name", { ascending: true });

          const map = new Map<string, StudentRow>();
          [...rows, ...(byClassName || [])].forEach((student: any) => {
            map.set(String(student.id || student.student_id || Math.random()), student);
          });
          rows = Array.from(map.values());
        }

        if (!active) return;
        setStudents(rows.filter(isActiveStudent));
      } catch (error) {
        console.error(error);
        if (active) setStudents([]);
      }
    }

    loadStudents();

    return () => {
      active = false;
    };
  }, [selectedClassId, classes]);

  const assignedClasses = useMemo(() => {
    return classes.filter((row) => assignedClassIds.includes(String(row.id)));
  }, [classes, assignedClassIds]);

  const selectedClass = useMemo(() => {
    return classes.find((row) => String(row.id) === selectedClassId) || null;
  }, [classes, selectedClassId]);

  const visibleStudents = useMemo(() => {
    const q = search.trim().toLowerCase();
    return students.filter((student) => {
      if (!q) return true;
      const haystack = [
        getStudentName(student),
        getStudentId(student),
        valueOf(student, ["parent_name"]),
        valueOf(student, ["parent_phone"]),
        valueOf(student, ["father_name"]),
        valueOf(student, ["mother_name"]),
        valueOf(student, ["guardian_name"]),
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(q);
    });
  }, [students, search]);

  const teacherName = teacher?.full_name || teacher?.username || "Teacher";
  const selectedClassName = getClassName(selectedClass) || "Class";

  if (loading) {
    return (
      <main style={styles.page}>
        <div style={styles.loadingCard}>📚 {message}</div>
      </main>
    );
  }

  return (
    <main style={styles.page}>
      <section style={styles.hero}>
        <div>
          <p style={styles.eyebrow}>Student Data</p>
          <h1 style={styles.title}>My Students</h1>
          <p style={styles.subText}>View-only student records for your assigned class(es).</p>
        </div>

        <div style={styles.teacherBadge}>
          {teacher?.photo_url ? (
            <img src={teacher.photo_url} alt={teacherName} style={styles.teacherPhoto} />
          ) : (
            <span>{getInitials(teacherName)}</span>
          )}
        </div>
      </section>

      <section style={styles.selectorCard}>
        <div>
          <label style={styles.label}>Assigned Class</label>
          <select
            value={selectedClassId}
            onChange={(event) => setSelectedClassId(event.target.value)}
            style={styles.select}
          >
            {assignedClasses.map((item) => (
              <option key={item.id} value={item.id}>
                {getClassName(item)}
              </option>
            ))}
          </select>
        </div>

        <div style={styles.countBox}>
          <span style={styles.countNumber}>{visibleStudents.length}</span>
          <span style={styles.countLabel}>Students</span>
        </div>
      </section>

      {assignedClasses.length === 0 ? (
        <section style={styles.emptyCard}>
          <div style={styles.emptyIcon}>📚</div>
          <h2 style={styles.emptyTitle}>No assigned class found</h2>
          <p style={styles.emptyText}>
            This page uses the same assignment mapping as feeding:
            teacher_class_assignments.teacher_id must match your teacher UUID.
          </p>
        </section>
      ) : (
        <>
          <section style={styles.classPreviewCard}>
            <div>
              <p style={styles.previewLabel}>Selected</p>
              <h2 style={styles.previewTitle}>{selectedClassName}</h2>
              <p style={styles.previewText}>Tap a student to view full details.</p>
            </div>
          </section>

          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search student or parent..."
            style={styles.search}
          />

          <section style={styles.studentList}>
            {visibleStudents.length === 0 ? (
              <div style={styles.emptyCard}>
                <div style={styles.emptyIcon}>👥</div>
                <h2 style={styles.emptyTitle}>No students found</h2>
                <p style={styles.emptyText}>No active students found in {selectedClassName}.</p>
              </div>
            ) : (
              visibleStudents.map((student) => {
                const name = getStudentName(student);
                const studentId = getStudentId(student);
                const phone =
                  valueOf(student, ["emergency_contact_phone"]) ||
                  valueOf(student, ["parent_phone"]) ||
                  valueOf(student, ["father_phone"]) ||
                  valueOf(student, ["mother_phone"]) ||
                  valueOf(student, ["guardian_phone"]);

                return (
                  <button
                    key={String(student.id || student.student_id)}
                    type="button"
                    style={styles.studentCard}
                    onClick={() => setSelectedStudent(student)}
                  >
                    <StudentAvatar student={student} />

                    <div style={styles.studentMain}>
                      <strong style={styles.studentName}>{name}</strong>
                      <span style={styles.studentMeta}>
                        ID: {studentId || "Not set"} • {selectedClassName}
                      </span>
                      <span style={styles.studentSmall}>
                        {phone ? `📞 ${phone}` : "No parent phone saved"}
                      </span>
                    </div>

                    <span style={styles.chevron}>›</span>
                  </button>
                );
              })
            )}
          </section>
        </>
      )}

      {selectedStudent && (
        <StudentProfileSheet
          student={selectedStudent}
          className={selectedClassName}
          onClose={() => setSelectedStudent(null)}
        />
      )}
    </main>
  );
}

function StudentProfileSheet({
  student,
  className,
  onClose,
}: {
  student: StudentRow;
  className: string;
  onClose: () => void;
}) {
  const name = getStudentName(student);
  const studentId = getStudentId(student);

  const fatherPhone = valueOf(student, ["father_phone"]);
  const motherPhone = valueOf(student, ["mother_phone"]);
  const guardianPhone = valueOf(student, ["guardian_phone"]);
  const emergencyPhone = valueOf(student, ["emergency_contact_phone", "emergency_contact"]);
  const parentPhone = valueOf(student, ["parent_phone"]);

  return (
    <div style={styles.sheetOverlay} onClick={onClose}>
      <section style={styles.sheet} onClick={(event) => event.stopPropagation()}>
        <div style={styles.sheetHandle} />

        <div style={styles.sheetTop}>
          <StudentAvatar student={student} />
          <div style={{ minWidth: 0 }}>
            <h2 style={styles.sheetTitle}>{name}</h2>
            <p style={styles.sheetSub}>
              ID: {studentId || "Not set"} • {className}
            </p>
          </div>
          <button type="button" onClick={onClose} style={styles.closeBtn}>
            ×
          </button>
        </div>

        <div style={styles.callRow}>
          <PhoneButton label="Emergency" phone={emergencyPhone} />
          <PhoneButton label="Parent" phone={parentPhone} />
          <PhoneButton label="Father" phone={fatherPhone} />
          <PhoneButton label="Mother" phone={motherPhone} />
          <PhoneButton label="Guardian" phone={guardianPhone} />
        </div>

        <div style={styles.detailGrid}>
          <InfoLine label="Full Name" value={name} />
          <InfoLine label="Student ID" value={studentId} />
          <InfoLine label="Class" value={className} />
          <InfoLine label="Gender" value={valueOf(student, ["gender"])} />
          <InfoLine label="Date of Birth" value={formatDate(valueOf(student, ["date_of_birth"]))} />
          <InfoLine label="Age" value={calcAge(valueOf(student, ["date_of_birth"]))} />
          <InfoLine label="Admission Date" value={formatDate(valueOf(student, ["admission_date", "date_admitted"]))} />
          <InfoLine label="Residence / Address" value={valueOf(student, ["residence", "address"])} />
          <InfoLine label="Father" value={valueOf(student, ["father_name"])} />
          <InfoLine label="Father Phone" value={fatherPhone} />
          <InfoLine label="Mother" value={valueOf(student, ["mother_name"])} />
          <InfoLine label="Mother Phone" value={motherPhone} />
          <InfoLine label="Guardian" value={valueOf(student, ["guardian_name"])} />
          <InfoLine label="Guardian Phone" value={guardianPhone} />
          <InfoLine label="Stays With" value={valueOf(student, ["stays_with"])} />
          <InfoLine label="Emergency Contact" value={valueOf(student, ["emergency_contact_name"])} />
          <InfoLine label="Emergency Phone" value={emergencyPhone} />
          <InfoLine label="NHIS Number" value={valueOf(student, ["nhis_number"])} />
          <InfoLine label="Medical Notes" value={valueOf(student, ["medical_notes", "medical_condition", "health_condition", "health_note"])} />
          <InfoLine label="Status" value={valueOf(student, ["status"], "Active")} />
        </div>

        <p style={styles.viewOnly}>View only. Teachers cannot edit student records here.</p>
      </section>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    background: "linear-gradient(180deg, #f4f8f0 0%, #ffffff 100%)",
    padding: "14px",
    paddingBottom: "90px",
    fontFamily: "Inter, Arial, sans-serif",
    color: COLORS.text,
    maxWidth: 900,
    margin: "0 auto",
  },
  loadingCard: {
    minHeight: "60vh",
    display: "grid",
    placeItems: "center",
    fontWeight: 900,
    color: COLORS.deep,
  },
  hero: {
    background: "linear-gradient(135deg, #075326, #052f18)",
    color: "white",
    borderRadius: "26px",
    padding: "20px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "14px",
    boxShadow: "0 18px 40px rgba(6,63,29,0.24)",
  },
  eyebrow: {
    margin: 0,
    textTransform: "uppercase",
    letterSpacing: "0.14em",
    fontSize: "11px",
    fontWeight: 900,
    color: "#d9f99d",
  },
  title: {
    margin: "8px 0 4px",
    fontSize: "28px",
    lineHeight: 1.05,
    fontWeight: 950,
  },
  subText: {
    margin: 0,
    color: "rgba(255,255,255,0.82)",
    fontSize: "13px",
  },
  teacherBadge: {
    width: "58px",
    height: "58px",
    borderRadius: "20px",
    border: "1px solid rgba(255,255,255,0.25)",
    background: "rgba(255,255,255,0.14)",
    display: "grid",
    placeItems: "center",
    fontWeight: 950,
    fontSize: "20px",
    overflow: "hidden",
    flexShrink: 0,
  },
  teacherPhoto: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
  },
  selectorCard: {
    marginTop: "14px",
    background: COLORS.white,
    borderRadius: "22px",
    padding: "14px",
    boxShadow: "0 12px 30px rgba(16,32,22,0.08)",
    border: `1px solid ${COLORS.border}`,
    display: "grid",
    gridTemplateColumns: "1fr auto",
    gap: "12px",
    alignItems: "end",
  },
  label: {
    display: "block",
    fontSize: "12px",
    color: COLORS.muted,
    fontWeight: 900,
    marginBottom: "7px",
  },
  select: {
    width: "100%",
    border: `1px solid ${COLORS.border}`,
    borderRadius: "15px",
    padding: "12px 13px",
    fontWeight: 900,
    color: COLORS.deep,
    background: COLORS.soft,
    outline: "none",
    fontSize: "16px",
  },
  countBox: {
    minWidth: "84px",
    borderRadius: "17px",
    background: "#fff8d7",
    border: "1px solid #f3df89",
    padding: "10px",
    display: "grid",
    justifyItems: "center",
  },
  countNumber: {
    fontWeight: 950,
    fontSize: "22px",
    color: COLORS.deep,
  },
  countLabel: {
    fontSize: "11px",
    color: COLORS.muted,
    fontWeight: 900,
  },
  classPreviewCard: {
    marginTop: "14px",
    borderRadius: "22px",
    padding: "16px",
    background: "linear-gradient(135deg, #ecfdf5, #fffbea)",
    border: "1px solid #d9f99d",
    boxShadow: "0 10px 28px rgba(16,32,22,0.07)",
  },
  previewLabel: {
    margin: 0,
    color: COLORS.green,
    fontWeight: 950,
    fontSize: "11px",
    textTransform: "uppercase",
    letterSpacing: "0.12em",
  },
  previewTitle: {
    margin: "6px 0 4px",
    fontSize: "21px",
    color: COLORS.deep,
  },
  previewText: {
    margin: 0,
    color: COLORS.muted,
    fontSize: "13px",
  },
  search: {
    width: "100%",
    marginTop: "14px",
    border: `1px solid ${COLORS.border}`,
    borderRadius: "999px",
    padding: "14px 16px",
    outline: "none",
    fontSize: "16px",
    background: "#fff",
    boxShadow: "0 8px 24px rgba(16,32,22,0.05)",
  },
  studentList: {
    display: "grid",
    gap: "12px",
    marginTop: "14px",
  },
  studentCard: {
    width: "100%",
    border: "none",
    borderRadius: "22px",
    background: "#ffffff",
    padding: "14px",
    display: "flex",
    alignItems: "center",
    gap: "12px",
    boxShadow: "0 12px 30px rgba(16,32,22,0.08)",
    textAlign: "left",
    cursor: "pointer",
  },
  avatar: {
    width: "58px",
    height: "58px",
    borderRadius: "20px",
    background: "linear-gradient(135deg, #0f7a3b, #052f18)",
    color: "#fff",
    display: "grid",
    placeItems: "center",
    fontWeight: 950,
    flexShrink: 0,
    overflow: "hidden",
  },
  avatarImg: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
  },
  studentMain: {
    minWidth: 0,
    flex: 1,
    display: "grid",
    gap: "4px",
  },
  studentName: {
    color: COLORS.text,
    fontSize: "15px",
  },
  studentMeta: {
    color: COLORS.muted,
    fontSize: "12px",
    fontWeight: 900,
  },
  studentSmall: {
    color: "#475569",
    fontSize: "12px",
  },
  chevron: {
    fontSize: "28px",
    color: "#9ca3af",
    fontWeight: 400,
  },
  emptyCard: {
    marginTop: "14px",
    background: "#ffffff",
    borderRadius: "24px",
    padding: "26px 18px",
    textAlign: "center",
    border: `1px solid ${COLORS.border}`,
    boxShadow: "0 12px 30px rgba(16,32,22,0.08)",
  },
  emptyIcon: {
    fontSize: "34px",
    marginBottom: "8px",
  },
  emptyTitle: {
    margin: 0,
    fontSize: "19px",
    color: COLORS.deep,
  },
  emptyText: {
    margin: "8px 0 0",
    color: COLORS.muted,
    fontSize: "13px",
    lineHeight: 1.5,
  },
  sheetOverlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(2, 6, 23, 0.42)",
    zIndex: 80,
    display: "flex",
    alignItems: "flex-end",
  },
  sheet: {
    width: "100%",
    maxHeight: "88vh",
    overflowY: "auto",
    background: "#ffffff",
    borderRadius: "28px 28px 0 0",
    padding: "12px 16px 24px",
    boxShadow: "0 -20px 60px rgba(0,0,0,0.22)",
  },
  sheetHandle: {
    width: "52px",
    height: "5px",
    borderRadius: "999px",
    background: "#d1d5db",
    margin: "0 auto 14px",
  },
  sheetTop: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    marginBottom: "14px",
  },
  sheetTitle: {
    margin: 0,
    fontSize: "20px",
    color: COLORS.text,
    lineHeight: 1.15,
  },
  sheetSub: {
    margin: "5px 0 0",
    color: COLORS.muted,
    fontSize: "12px",
    fontWeight: 800,
  },
  closeBtn: {
    marginLeft: "auto",
    width: "38px",
    height: "38px",
    borderRadius: "14px",
    border: "none",
    background: "#f3f4f6",
    color: COLORS.text,
    fontSize: "24px",
    cursor: "pointer",
  },
  callRow: {
    display: "flex",
    gap: "8px",
    overflowX: "auto",
    paddingBottom: "8px",
    marginBottom: "12px",
  },
  callButton: {
    whiteSpace: "nowrap",
    textDecoration: "none",
    background: COLORS.green,
    color: "#ffffff",
    borderRadius: "999px",
    padding: "9px 12px",
    fontWeight: 900,
    fontSize: "12px",
  },
  detailGrid: {
    display: "grid",
    gap: "9px",
  },
  infoLine: {
    border: `1px solid ${COLORS.border}`,
    borderRadius: "15px",
    padding: "11px 12px",
    background: "#fbfdfb",
    display: "grid",
    gap: "4px",
  },
  infoLabel: {
    color: COLORS.muted,
    fontSize: "11px",
    fontWeight: 900,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  },
  infoValue: {
    color: COLORS.text,
    fontSize: "14px",
    fontWeight: 800,
    overflowWrap: "anywhere",
  },
  viewOnly: {
    margin: "14px 0 0",
    textAlign: "center",
    color: COLORS.muted,
    fontSize: "12px",
    fontWeight: 800,
  },
};
