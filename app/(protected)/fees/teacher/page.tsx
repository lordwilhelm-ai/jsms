"use client";

import type { CSSProperties, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type AnyRow = Record<string, any>;

type FeeStatus = "paid" | "part" | "unpaid";

type AssignedClass = {
  id: string;
  name: string;
};

type StudentFeeRow = AnyRow & {
  studentIdValue: string;
  studentNameValue: string;
  classNameValue: string;
  photoUrl: string;
  totalFee: number;
  totalPaid: number;
  balance: number;
  status: FeeStatus;
  paymentHistory: AnyRow[];
};

const COLORS = {
  page: "#f8faf8",
  card: "#ffffff",
  text: "#102016",
  muted: "#65746b",
  green: "#0f7a3b",
  deep: "#0f2a17",
  gold: "#c7992f",
  border: "#dfe8e2",
  softGreen: "#eaf7ee",
  softGold: "#fff7df",
  softRed: "#fee2e2",
  softBlue: "#eaf2ff",
  danger: "#991b1b",
};

const CLASS_ORDER = [
  "Playroom 1",
  "Playroom 2",
  "KG 1",
  "KG 2",
  "Class 1",
  "Class 2",
  "Class 3",
  "Class 4",
  "Class 5",
  "Class 6",
  "JHS 1",
  "JHS 2",
  "JHS 3",
];

function stringValue(value: unknown) {
  return String(value || "").trim();
}

function numberValue(value: unknown) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

function formatMoney(value: number) {
  return `GHS ${numberValue(value).toFixed(2)}`;
}

function getClassName(row: AnyRow | null | undefined) {
  return stringValue(row?.class_name || row?.className || row?.name || row?.student_class || row?.class);
}

function getStudentId(row: AnyRow) {
  return stringValue(row.student_id || row.studentId || row.student_code || "");
}

function getStudentName(row: AnyRow) {
  const combined = [row.first_name, row.other_name, row.last_name].filter(Boolean).join(" ");
  return stringValue(row.full_name || row.student_name || row.name || combined || "Student");
}

function getStudentPhoto(row: AnyRow) {
  return stringValue(
    row.photo_url ||
      row.student_photo_url ||
      row.profile_photo_url ||
      row.image_url ||
      row.picture_url ||
      row.passport_photo_url ||
      row.avatar_url ||
      ""
  );
}

function initials(name: string) {
  return (
    stringValue(name)
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((x) => x[0])
      .join("")
      .toUpperCase() || "S"
  );
}

function getStudentClassName(student: AnyRow, classMapById: Map<string, AnyRow>) {
  const direct = getClassName(student);
  if (direct) return direct;

  const classId = stringValue(student.class_id || student.classId);
  if (classId && classMapById.has(classId)) return getClassName(classMapById.get(classId));

  return "";
}

function isActiveStudent(student: AnyRow) {
  if (typeof student.active === "boolean") return student.active;
  if (typeof student.is_active === "boolean") return student.is_active;
  if (typeof student.left_school === "boolean") return !student.left_school;
  if (student.status) return !["inactive", "left", "withdrawn"].includes(stringValue(student.status).toLowerCase());
  return true;
}

function getStudentType(student: AnyRow): "new" | "returning" {
  const raw = stringValue(student.student_type || student.studentType).toLowerCase();
  if (raw === "new") return "new";
  if (student.is_new === true || student.is_new_student === true) return "new";
  return "returning";
}

function getStatus(balance: number, totalPaid: number): FeeStatus {
  if (balance <= 0 && totalPaid > 0) return "paid";
  if (totalPaid > 0) return "part";
  return "unpaid";
}

function statusLabel(status: FeeStatus) {
  if (status === "paid") return "Paid";
  if (status === "part") return "Part Paid";
  return "Not Paid";
}

function statusStyle(status: FeeStatus): CSSProperties {
  if (status === "paid") return { ...styles.statusPill, background: "#dcfce7", color: "#166534" };
  if (status === "part") return { ...styles.statusPill, background: "#ffedd5", color: "#c2410c" };
  return { ...styles.statusPill, background: "#fee2e2", color: "#991b1b" };
}

function sortClasses(rows: AssignedClass[]) {
  return [...rows].sort((a, b) => {
    const ai = CLASS_ORDER.indexOf(a.name);
    const bi = CLASS_ORDER.indexOf(b.name);
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    return a.name.localeCompare(b.name);
  });
}

function getLatestPayment(history: AnyRow[]) {
  return [...history].sort((a, b) => {
    const aTime = new Date(String(a.created_at || a.payment_date || "")).getTime();
    const bTime = new Date(String(b.created_at || b.payment_date || "")).getTime();
    return bTime - aTime;
  })[0];
}

function getStudentTotalFee(student: AnyRow, latestPayment: AnyRow | undefined, classRow: AnyRow | undefined, feeStructureRow: AnyRow | undefined) {
  const latestTotal = numberValue(latestPayment?.total_fee);
  if (latestTotal > 0) return latestTotal;

  const feeStructureAmount = numberValue(feeStructureRow?.amount);
  if (feeStructureAmount > 0) return feeStructureAmount;

  const studentType = getStudentType(student);
  if (studentType === "new") {
    const classNew = numberValue(classRow?.fee_new);
    if (classNew > 0) return classNew;
  }

  const classReturning = numberValue(classRow?.fee_returning);
  if (classReturning > 0) return classReturning;

  return 0;
}

function getPaymentMethod(row: AnyRow) {
  return stringValue(row.payment_method || row.method || row.payment_type || "Payment");
}

function getPaymentDate(row: AnyRow) {
  const raw = stringValue(row.payment_date || row.created_at);
  if (!raw) return "";
  try {
    return new Date(raw).toLocaleDateString();
  } catch {
    return raw;
  }
}

export default function FeesTeacherPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [teacher, setTeacher] = useState<AnyRow | null>(null);
  const [assignedClasses, setAssignedClasses] = useState<AssignedClass[]>([]);
  const [selectedClassId, setSelectedClassId] = useState("");

  const [settings, setSettings] = useState<AnyRow | null>(null);
  const [classes, setClasses] = useState<AnyRow[]>([]);
  const [students, setStudents] = useState<AnyRow[]>([]);
  const [payments, setPayments] = useState<AnyRow[]>([]);
  const [feeStructure, setFeeStructure] = useState<AnyRow[]>([]);

  const [query, setQuery] = useState("");
  const [selectedStudent, setSelectedStudent] = useState<StudentFeeRow | null>(null);

  useEffect(() => {
    let mounted = true;

    async function loadPage() {
      try {
        setLoading(true);
        setError("");

        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session?.user) {
          setError("Please login again.");
          setLoading(false);
          return;
        }

        const [
          teachersRes,
          settingsRes,
          classesRes,
          assignmentRes,
          teacherClassesRes,
          studentsRes,
          paymentsRes,
          feeStructureRes,
        ] = await Promise.all([
          supabase.from("teachers").select("*"),
          supabase.from("school_settings").select("*").limit(1).maybeSingle(),
          supabase.from("classes").select("*"),
          supabase.from("teacher_class_assignments").select("*"),
          supabase.from("teacher_classes").select("*"),
          supabase.from("students").select("*"),
          supabase.from("fee_payments").select("*").order("created_at", { ascending: false }),
          supabase.from("fee_structure").select("*"),
        ]);

        if (!mounted) return;

        if (teachersRes.error) throw teachersRes.error;
        if (classesRes.error) throw classesRes.error;
        if (studentsRes.error) throw studentsRes.error;
        if (paymentsRes.error) throw paymentsRes.error;

        const teacherRows = teachersRes.data || [];
        const authUser = session.user;
        const authEmail = stringValue(authUser.email).toLowerCase();
        const authPhone = stringValue((authUser.user_metadata?.phone as string | undefined) || authUser.phone);

        const foundTeacher =
          teacherRows.find((row) => stringValue(row.auth_user_id) === authUser.id) ||
          teacherRows.find((row) => stringValue(row.login_email || row.email).toLowerCase() === authEmail) ||
          teacherRows.find((row) => stringValue(row.phone || row.teacher_phone || row.contact) === authPhone) ||
          null;

        if (!foundTeacher) {
          setError("Teacher account not found.");
          setLoading(false);
          return;
        }

        const classRows = classesRes.data || [];
        const classById = new Map<string, AnyRow>();
        classRows.forEach((row) => classById.set(stringValue(row.id), row));

        const teacherUuid = stringValue(foundTeacher.id);
        const teacherJvst = stringValue(foundTeacher.teacher_id);

        const assignedMap = new Map<string, AssignedClass>();

        function addClassById(classId: string) {
          const row = classById.get(classId);
          if (!row) return;
          const name = getClassName(row);
          if (!name) return;
          assignedMap.set(classId, { id: classId, name });
        }

        (assignmentRes.data || [])
          .filter((row: AnyRow) => stringValue(row.teacher_id) === teacherUuid || stringValue(row.teacher_id) === teacherJvst)
          .forEach((row: AnyRow) => addClassById(stringValue(row.class_id)));

        (teacherClassesRes.data || [])
          .filter((row: AnyRow) => stringValue(row.teacher_id) === teacherUuid || stringValue(row.teacher_id) === teacherJvst)
          .forEach((row: AnyRow) => addClassById(stringValue(row.class_id)));

        const assignedRaw = foundTeacher.assigned_classes;
        if (Array.isArray(assignedRaw)) {
          assignedRaw.forEach((item: any) => {
            const name = stringValue(item?.class_name || item?.name || item);
            const match = classRows.find((row) => getClassName(row) === name || stringValue(row.id) === name);
            if (match) assignedMap.set(stringValue(match.id), { id: stringValue(match.id), name: getClassName(match) });
          });
        } else if (typeof assignedRaw === "string" && assignedRaw.trim()) {
          assignedRaw
            .split(",")
            .map((x) => x.trim())
            .filter(Boolean)
            .forEach((name) => {
              const match = classRows.find((row) => getClassName(row) === name || stringValue(row.id) === name);
              if (match) assignedMap.set(stringValue(match.id), { id: stringValue(match.id), name: getClassName(match) });
            });
        }

        const sortedAssigned = sortClasses(Array.from(assignedMap.values()));

        setTeacher(foundTeacher);
        setSettings(settingsRes.data || null);
        setClasses(classRows);
        setStudents(studentsRes.data || []);
        setPayments(paymentsRes.data || []);
        setFeeStructure(feeStructureRes.data || []);
        setAssignedClasses(sortedAssigned);
        setSelectedClassId((prev) => prev || sortedAssigned[0]?.id || "");
        setLoading(false);
      } catch (err: any) {
        if (!mounted) return;
        setError(err?.message || "Could not load fees.");
        setLoading(false);
      }
    }

    void loadPage();

    return () => {
      mounted = false;
    };
  }, []);

  const academicYear = stringValue(settings?.academic_year);
  const currentTerm = stringValue(settings?.current_term);

  const classMapById = useMemo(() => {
    const map = new Map<string, AnyRow>();
    classes.forEach((row) => map.set(stringValue(row.id), row));
    return map;
  }, [classes]);

  const selectedClass = useMemo(() => {
    return assignedClasses.find((row) => row.id === selectedClassId) || assignedClasses[0] || null;
  }, [assignedClasses, selectedClassId]);

  const selectedClassRow = selectedClass ? classMapById.get(selectedClass.id) : null;

  const currentPayments = useMemo(() => {
    return payments.filter((row) => {
      const sameAcademicYear = academicYear ? stringValue(row.academic_year) === academicYear : true;
      const sameTerm = currentTerm ? stringValue(row.term) === currentTerm : true;
      return sameAcademicYear && sameTerm;
    });
  }, [payments, academicYear, currentTerm]);

  const feeStructureForClass = useMemo(() => {
    if (!selectedClass) return undefined;

    return feeStructure.find((row) => {
      const sameClass = getClassName(row) === selectedClass.name;
      const sameAcademicYear = academicYear ? stringValue(row.academic_year) === academicYear : true;
      const sameTerm = currentTerm ? stringValue(row.term) === currentTerm : true;
      const active = typeof row.active === "boolean" ? row.active : true;
      return sameClass && sameAcademicYear && sameTerm && active;
    });
  }, [feeStructure, selectedClass, academicYear, currentTerm]);

  const studentRows = useMemo<StudentFeeRow[]>(() => {
    if (!selectedClass) return [];

    const search = query.trim().toLowerCase();

    const rows = students
      .filter((student) => {
        if (!isActiveStudent(student)) return false;

        const classId = stringValue(student.class_id || student.classId);
        const className = getStudentClassName(student, classMapById);

        const belongs =
          (classId && classId === selectedClass.id) ||
          (!!className && className === selectedClass.name);

        if (!belongs) return false;

        if (!search) return true;

        const haystack = [
          getStudentName(student),
          getStudentId(student),
          student.parent_name,
          student.parent_phone,
          student.father_name,
          student.mother_name,
          student.guardian_name,
          student.guardian_phone,
        ]
          .map((x) => stringValue(x).toLowerCase())
          .join(" ");

        return haystack.includes(search);
      })
      .map((student) => {
        const studentIdValue = getStudentId(student);

        const history = currentPayments
          .filter((payment) => stringValue(payment.student_id) === studentIdValue)
          .sort((a, b) => {
            const aTime = new Date(String(a.created_at || a.payment_date || "")).getTime();
            const bTime = new Date(String(b.created_at || b.payment_date || "")).getTime();
            return bTime - aTime;
          });

        const latest = getLatestPayment(history);
        const summedPaid = history.reduce((sum, row) => sum + numberValue(row.amount_paid), 0);
        const cumulativePaid = numberValue(latest?.cumulative_paid);
        const totalPaid = cumulativePaid > 0 ? cumulativePaid : summedPaid;

        const totalFee = getStudentTotalFee(student, latest, selectedClassRow || undefined, feeStructureForClass);
        const latestBalance = latest && latest.balance_after_payment !== null && latest.balance_after_payment !== undefined
          ? numberValue(latest.balance_after_payment)
          : NaN;
        const balance = Number.isFinite(latestBalance) ? latestBalance : Math.max(totalFee - totalPaid, 0);

        return {
          ...student,
          studentIdValue,
          studentNameValue: getStudentName(student),
          classNameValue: selectedClass.name,
          photoUrl: getStudentPhoto(student),
          totalFee,
          totalPaid,
          balance,
          status: getStatus(balance, totalPaid),
          paymentHistory: history,
        };
      });

    return rows.sort((a, b) => a.studentNameValue.localeCompare(b.studentNameValue));
  }, [students, selectedClass, classMapById, query, currentPayments, selectedClassRow, feeStructureForClass]);

  const summary = useMemo(() => {
    return {
      total: studentRows.length,
      paid: studentRows.filter((row) => row.status === "paid").length,
      owing: studentRows.filter((row) => row.balance > 0).length,
      totalBalance: studentRows.reduce((sum, row) => sum + row.balance, 0),
    };
  }, [studentRows]);

  if (loading) {
    return (
      <main style={styles.page}>
        <div style={styles.centerCard}>Loading fees...</div>
      </main>
    );
  }

  return (
    <main style={styles.page}>
      <header style={styles.header}>
        <div>
          <p style={styles.kicker}>Fees</p>
          <h1 style={styles.title}>Student Fees</h1>
          <p style={styles.subtle}>
            {academicYear || "Academic year"} {currentTerm ? `• ${currentTerm}` : ""}
          </p>
        </div>
      </header>

      {error && <div style={styles.errorBox}>⚠️ {error}</div>}

      {!error && assignedClasses.length === 0 && (
        <div style={styles.emptyCard}>
          <div style={styles.emptyIcon}>🏫</div>
          <h2 style={styles.emptyTitle}>No class assigned</h2>
          <p style={styles.subtle}>Ask admin to assign your class.</p>
        </div>
      )}

      {!error && assignedClasses.length > 0 && (
        <>
          <section style={styles.selectorCard}>
            <label style={styles.field}>
              <span style={styles.label}>Assigned Class</span>
              <select
                style={styles.select}
                value={selectedClassId}
                onChange={(e) => {
                  setSelectedClassId(e.target.value);
                  setSelectedStudent(null);
                }}
              >
                {assignedClasses.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name}
                  </option>
                ))}
              </select>
            </label>

            <input
              style={styles.search}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search student, ID, or parent..."
            />
          </section>

          <section style={styles.summaryGrid}>
            <SummaryCard label="Students" value={summary.total} />
            <SummaryCard label="Paid" value={summary.paid} />
            <SummaryCard label="Owing" value={summary.owing} />
            <SummaryCard label="Balance" value={formatMoney(summary.totalBalance)} />
          </section>

          <section style={styles.studentList}>
            {studentRows.map((student) => (
              <button
                type="button"
                key={student.id || student.studentIdValue}
                style={styles.studentCard}
                onClick={() => setSelectedStudent(student)}
              >
                <Avatar name={student.studentNameValue} photoUrl={student.photoUrl} />

                <div style={styles.studentMain}>
                  <div style={styles.studentTopLine}>
                    <h3 style={styles.studentName}>{student.studentNameValue}</h3>
                    <span style={statusStyle(student.status)}>{statusLabel(student.status)}</span>
                  </div>

                  <p style={styles.studentId}>ID: {student.studentIdValue || "Not set"}</p>

                  <div style={styles.moneyGrid}>
                    <MoneyBlock label="Bill" value={student.totalFee} />
                    <MoneyBlock label="Paid" value={student.totalPaid} />
                    <MoneyBlock label="Balance" value={student.balance} danger={student.balance > 0} />
                  </div>
                </div>
              </button>
            ))}

            {studentRows.length === 0 && (
              <div style={styles.emptyCard}>
                <div style={styles.emptyIcon}>🧾</div>
                <h2 style={styles.emptyTitle}>No students found</h2>
                <p style={styles.subtle}>Try another search or check the selected class.</p>
              </div>
            )}
          </section>
        </>
      )}

      {selectedStudent && (
        <StudentFeeSheet student={selectedStudent} onClose={() => setSelectedStudent(null)} />
      )}
    </main>
  );
}

function Avatar({ name, photoUrl }: { name: string; photoUrl?: string }) {
  return (
    <div style={styles.avatar}>
      {photoUrl ? (
        <img src={photoUrl} alt={name} style={styles.avatarImg} />
      ) : (
        <span>{initials(name)}</span>
      )}
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div style={styles.summaryCard}>
      <span style={styles.summaryLabel}>{label}</span>
      <strong style={styles.summaryValue}>{value}</strong>
    </div>
  );
}

function MoneyBlock({ label, value, danger = false }: { label: string; value: number; danger?: boolean }) {
  return (
    <div style={styles.moneyBlock}>
      <span style={styles.moneyLabel}>{label}</span>
      <strong style={{ ...styles.moneyValue, color: danger ? COLORS.danger : COLORS.deep }}>
        {formatMoney(value)}
      </strong>
    </div>
  );
}

function StudentFeeSheet({ student, onClose }: { student: StudentFeeRow; onClose: () => void }) {
  return (
    <div style={styles.sheetOverlay} onClick={onClose}>
      <section style={styles.sheet} onClick={(e) => e.stopPropagation()}>
        <div style={styles.sheetHandle} />

        <div style={styles.sheetHeader}>
          <div style={styles.profileTop}>
            <Avatar name={student.studentNameValue} photoUrl={student.photoUrl} />
            <div>
              <h2 style={styles.sheetTitle}>{student.studentNameValue}</h2>
              <p style={styles.studentId}>ID: {student.studentIdValue || "Not set"}</p>
              <p style={styles.subtle}>{student.classNameValue}</p>
            </div>
          </div>

          <button style={styles.closeBtn} onClick={onClose}>
            Close
          </button>
        </div>

        <div style={styles.detailStatusRow}>
          <span style={statusStyle(student.status)}>{statusLabel(student.status)}</span>
        </div>

        <div style={styles.sheetMoneyGrid}>
          <MoneyBlock label="Total Bill" value={student.totalFee} />
          <MoneyBlock label="Total Paid" value={student.totalPaid} />
          <MoneyBlock label="Balance" value={student.balance} danger={student.balance > 0} />
        </div>

        <section style={styles.infoSection}>
          <h3 style={styles.sectionTitle}>Payment History</h3>

          {student.paymentHistory.length === 0 ? (
            <p style={styles.subtle}>No fee payment recorded for this term.</p>
          ) : (
            <div style={styles.historyList}>
              {student.paymentHistory.map((payment) => (
                <div key={payment.id || payment.receipt_no} style={styles.historyItem}>
                  <div>
                    <strong style={styles.historyAmount}>{formatMoney(numberValue(payment.amount_paid))}</strong>
                    <p style={styles.historyMeta}>
                      {getPaymentMethod(payment)} • {getPaymentDate(payment)}
                    </p>
                    {payment.receipt_no && (
                      <p style={styles.receiptText}>Receipt: {payment.receipt_no}</p>
                    )}
                  </div>

                  <div style={styles.historyRight}>
                    <span style={styles.balanceText}>
                      Bal: {formatMoney(numberValue(payment.balance_after_payment))}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section style={styles.infoSection}>
          <h3 style={styles.sectionTitle}>Parent / Guardian</h3>

          <InfoRow label="Parent" value={student.parent_name || student.father_name || student.mother_name || student.guardian_name} />
          <InfoRow label="Phone" value={student.parent_phone || student.father_phone || student.mother_phone || student.guardian_phone} />
          <InfoRow label="Emergency" value={student.emergency_contact_phone || student.emergency_contact} />
        </section>
      </section>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: any }) {
  return (
    <div style={styles.infoRow}>
      <span style={styles.infoLabel}>{label}</span>
      <strong style={styles.infoValue}>{stringValue(value) || "—"}</strong>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  page: {
    minHeight: "100vh",
    background: `linear-gradient(180deg, ${COLORS.page}, #ffffff)`,
    padding: "18px 14px 90px",
    color: COLORS.text,
    fontFamily: "Inter, Arial, sans-serif",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 14,
  },
  kicker: {
    margin: 0,
    color: COLORS.green,
    fontSize: 12,
    fontWeight: 900,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
  },
  title: {
    margin: "4px 0 2px",
    color: COLORS.deep,
    fontSize: 26,
    lineHeight: 1.1,
  },
  subtle: {
    margin: 0,
    color: COLORS.muted,
    fontSize: 13,
    lineHeight: 1.45,
  },
  centerCard: {
    background: COLORS.card,
    border: `1px solid ${COLORS.border}`,
    borderRadius: 22,
    padding: 22,
    boxShadow: "0 16px 35px rgba(16,32,22,0.08)",
    color: COLORS.muted,
    fontWeight: 800,
  },
  errorBox: {
    background: "#fff1f2",
    color: COLORS.danger,
    border: "1px solid #fecaca",
    borderRadius: 16,
    padding: 12,
    marginBottom: 12,
    fontWeight: 800,
    fontSize: 13,
  },
  selectorCard: {
    background: COLORS.card,
    border: `1px solid ${COLORS.border}`,
    borderRadius: 24,
    padding: 14,
    boxShadow: "0 18px 40px rgba(16,32,22,0.08)",
    display: "grid",
    gap: 10,
    marginBottom: 12,
  },
  field: {
    display: "grid",
    gap: 6,
  },
  label: {
    fontSize: 12,
    fontWeight: 900,
    color: COLORS.deep,
  },
  select: {
    width: "100%",
    border: `1px solid ${COLORS.border}`,
    borderRadius: 16,
    padding: "12px 13px",
    fontWeight: 800,
    color: COLORS.deep,
    background: "#fff",
    outline: "none",
  },
  search: {
    width: "100%",
    border: `1px solid ${COLORS.border}`,
    borderRadius: 16,
    padding: "12px 13px",
    color: COLORS.deep,
    background: "#fff",
    outline: "none",
    fontWeight: 700,
  },
  summaryGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 10,
    marginBottom: 12,
  },
  summaryCard: {
    background: COLORS.card,
    border: `1px solid ${COLORS.border}`,
    borderRadius: 18,
    padding: 13,
    boxShadow: "0 10px 24px rgba(16,32,22,0.06)",
  },
  summaryLabel: {
    display: "block",
    color: COLORS.muted,
    fontSize: 11,
    fontWeight: 900,
    textTransform: "uppercase",
    letterSpacing: "0.04em",
  },
  summaryValue: {
    display: "block",
    marginTop: 4,
    color: COLORS.deep,
    fontSize: 17,
    overflowWrap: "anywhere",
  },
  studentList: {
    display: "grid",
    gap: 12,
  },
  studentCard: {
    width: "100%",
    textAlign: "left",
    border: `1px solid ${COLORS.border}`,
    background: COLORS.card,
    borderRadius: 24,
    padding: 13,
    display: "flex",
    gap: 12,
    boxShadow: "0 16px 35px rgba(16,32,22,0.08)",
    cursor: "pointer",
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 20,
    overflow: "hidden",
    background: COLORS.softGreen,
    color: COLORS.green,
    display: "grid",
    placeItems: "center",
    fontWeight: 950,
    fontSize: 17,
    flexShrink: 0,
  },
  avatarImg: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
  },
  studentMain: {
    minWidth: 0,
    flex: 1,
  },
  studentTopLine: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 8,
  },
  studentName: {
    margin: 0,
    color: COLORS.deep,
    fontSize: 15,
    lineHeight: 1.25,
  },
  studentId: {
    margin: "4px 0 0",
    color: COLORS.muted,
    fontSize: 12,
    fontWeight: 800,
  },
  statusPill: {
    display: "inline-flex",
    borderRadius: 999,
    padding: "5px 8px",
    fontSize: 10,
    fontWeight: 950,
    whiteSpace: "nowrap",
  },
  moneyGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    gap: 7,
    marginTop: 10,
  },
  moneyBlock: {
    background: "#f7faf8",
    border: `1px solid ${COLORS.border}`,
    borderRadius: 14,
    padding: 8,
    minWidth: 0,
  },
  moneyLabel: {
    display: "block",
    color: COLORS.muted,
    fontSize: 10,
    fontWeight: 900,
    marginBottom: 3,
  },
  moneyValue: {
    display: "block",
    fontSize: 11,
    fontWeight: 950,
    overflowWrap: "anywhere",
  },
  emptyCard: {
    background: COLORS.card,
    border: `1px solid ${COLORS.border}`,
    borderRadius: 24,
    padding: 22,
    textAlign: "center",
    boxShadow: "0 16px 35px rgba(16,32,22,0.08)",
  },
  emptyIcon: {
    fontSize: 30,
    marginBottom: 8,
  },
  emptyTitle: {
    margin: "0 0 6px",
    fontSize: 18,
    color: COLORS.deep,
  },
  sheetOverlay: {
    position: "fixed",
    inset: 0,
    zIndex: 80,
    background: "rgba(0,0,0,0.35)",
    display: "flex",
    alignItems: "flex-end",
  },
  sheet: {
    width: "100%",
    maxHeight: "92vh",
    overflowY: "auto",
    background: "#ffffff",
    borderRadius: "28px 28px 0 0",
    padding: "10px 16px 26px",
    boxShadow: "0 -20px 60px rgba(0,0,0,0.2)",
  },
  sheetHandle: {
    width: 46,
    height: 5,
    borderRadius: 999,
    background: "#d1d5db",
    margin: "0 auto 14px",
  },
  sheetHeader: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "flex-start",
    marginBottom: 12,
  },
  profileTop: {
    display: "flex",
    gap: 12,
    alignItems: "center",
    minWidth: 0,
  },
  sheetTitle: {
    margin: 0,
    color: COLORS.deep,
    fontSize: 20,
    lineHeight: 1.15,
  },
  closeBtn: {
    border: `1px solid ${COLORS.border}`,
    background: "#fff",
    color: COLORS.deep,
    borderRadius: 12,
    padding: "9px 12px",
    fontWeight: 900,
    cursor: "pointer",
  },
  detailStatusRow: {
    marginBottom: 12,
  },
  sheetMoneyGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    gap: 8,
    marginBottom: 14,
  },
  infoSection: {
    borderTop: `1px solid ${COLORS.border}`,
    paddingTop: 14,
    marginTop: 14,
  },
  sectionTitle: {
    margin: "0 0 10px",
    color: COLORS.deep,
    fontSize: 15,
  },
  historyList: {
    display: "grid",
    gap: 9,
  },
  historyItem: {
    display: "flex",
    justifyContent: "space-between",
    gap: 10,
    background: "#f8faf8",
    border: `1px solid ${COLORS.border}`,
    borderRadius: 16,
    padding: 11,
  },
  historyAmount: {
    color: COLORS.deep,
    fontSize: 14,
  },
  historyMeta: {
    margin: "4px 0 0",
    color: COLORS.muted,
    fontSize: 12,
    fontWeight: 700,
  },
  receiptText: {
    margin: "4px 0 0",
    color: COLORS.green,
    fontSize: 11,
    fontWeight: 900,
  },
  historyRight: {
    display: "flex",
    alignItems: "center",
  },
  balanceText: {
    fontSize: 11,
    fontWeight: 900,
    color: COLORS.danger,
    whiteSpace: "nowrap",
  },
  infoRow: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    borderBottom: `1px solid ${COLORS.border}`,
    padding: "10px 0",
  },
  infoLabel: {
    color: COLORS.muted,
    fontSize: 12,
    fontWeight: 900,
  },
  infoValue: {
    color: COLORS.deep,
    fontSize: 12,
    textAlign: "right",
  },
};
