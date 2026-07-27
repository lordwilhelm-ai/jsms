"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import { authedFetch } from "@/lib/apiClient";

type Teacher = {
  id: string;
  teacher_id: string | null;
  full_name: string | null;
  username: string | null;
  phone: string | null;
  photo_url: string | null;
  signature_url: string | null;
  role: string | null;
  is_active: boolean | null;
  is_visible: boolean | null;
  created_at: string | null;
  updated_at: string | null;
  auth_user_id: string | null;
  login_email: string | null;
  assigned_classes: string | null;
  password_changed: boolean | null;
  password_changed_at: string | null;
  force_password_change: boolean | null;
};

type ClassItem = {
  id: string;
  class_name: string | null;
  name: string | null;
  class_order: number | null;
  level: string | null;
};

type SubjectItem = {
  id: string;
  subject_name: string | null;
  name: string | null;
  subject_order: number | null;
};

type ClassSubject = {
  id: string;
  class_id: string;
  subject_id: string;
};

type TeacherAssignmentRow = {
  teacher_id: string;
  class_id: string;
  assignment_type?: string | null;
};

type TeacherSubjectRow = {
  teacher_id: string;
  class_id: string | null;
  subject_id: string;
};

type TeacherDetails = {
  teacher: Teacher;
  classIds: string[];
  subjectMap: Record<string, string[]>;
};

type TeacherForm = {
  id?: string;
  teacherId?: string;
  fullName: string;
  username: string;
  phone: string;
  role: string;
  password?: string;
  newPassword?: string;
  photoUrl: string;
  signatureUrl: string;
  selectedClassIds: string[];
  subjectIdsByClass: Record<string, string[]>;
};

const emptyAddForm: TeacherForm = {
  fullName: "",
  username: "",
  phone: "",
  role: "teacher",
  password: "",
  photoUrl: "",
  signatureUrl: "",
  selectedClassIds: [],
  subjectIdsByClass: {},
};

const roleOptions = [
  { value: "teacher", label: "Teacher" },
  { value: "headmaster", label: "Headmaster" },
  { value: "admin", label: "Admin" },
  { value: "other_staff", label: "Other Staff" },
];

function formatRoleLabel(role: string) {
  const match = roleOptions.find((option) => option.value === role);
  if (match) return match.label;
  return role || "Teacher";
}

export default function TeachersPage() {
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [subjects, setSubjects] = useState<SubjectItem[]>([]);
  const [classSubjects, setClassSubjects] = useState<ClassSubject[]>([]);
  const [assignmentRows, setAssignmentRows] = useState<TeacherAssignmentRow[]>([]);
  const [teacherSubjectRows, setTeacherSubjectRows] = useState<TeacherSubjectRow[]>([]);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const [searchText, setSearchText] = useState("");
  const [roleFilter, setRoleFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");

  const [showAddModal, setShowAddModal] = useState(false);
  const [editForm, setEditForm] = useState<TeacherForm | null>(null);
  const [selectedDetails, setSelectedDetails] = useState<TeacherDetails | null>(null);

  const [addForm, setAddForm] = useState<TeacherForm>(emptyAddForm);

  const [uploadingAddPhoto, setUploadingAddPhoto] = useState(false);
  const [uploadingAddSignature, setUploadingAddSignature] = useState(false);
  const [uploadingEditPhoto, setUploadingEditPhoto] = useState(false);
  const [uploadingEditSignature, setUploadingEditSignature] = useState(false);

  const classNameById = useMemo(() => {
    const map: Record<string, string> = {};
    classes.forEach((item) => {
      map[item.id] = getClassLabel(item);
    });
    return map;
  }, [classes]);

  const subjectNameById = useMemo(() => {
    const map: Record<string, string> = {};
    subjects.forEach((item) => {
      map[item.id] = getSubjectLabel(item);
    });
    return map;
  }, [subjects]);

  const teacherSummary = useMemo(() => {
    const active = teachers.filter((t) => t.is_active !== false).length;
    const hidden = teachers.filter((t) => t.is_visible === false).length;
    const assigned = new Set(assignmentRows.map((row) => row.teacher_id)).size;
    return {
      total: teachers.length,
      active,
      hidden,
      assigned,
    };
  }, [teachers, assignmentRows]);

  const filteredTeachers = useMemo(() => {
    const query = searchText.trim().toLowerCase();

    return teachers.filter((teacher) => {
      const roleOk = roleFilter === "All" || teacher.role === roleFilter;
      const activeOk =
        statusFilter === "All" ||
        (statusFilter === "Active" && teacher.is_active !== false) ||
        (statusFilter === "Inactive" && teacher.is_active === false) ||
        (statusFilter === "Hidden" && teacher.is_visible === false);

      const assignedClassNames = getTeacherClassIds(teacher.id)
        .map((classId) => classNameById[classId] || "")
        .join(" ");

      const assignedSubjectNames = Object.values(getTeacherSubjectMap(teacher.id))
        .flat()
        .map((subjectId) => subjectNameById[subjectId] || "")
        .join(" ");

      const searchable = [
        teacher.teacher_id,
        teacher.full_name,
        teacher.username,
        teacher.phone,
        teacher.role,
        teacher.login_email,
        teacher.assigned_classes,
        assignedClassNames,
        assignedSubjectNames,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return roleOk && activeOk && (!query || searchable.includes(query));
    });
  }, [
    teachers,
    searchText,
    roleFilter,
    statusFilter,
    assignmentRows,
    teacherSubjectRows,
    classNameById,
    subjectNameById,
  ]);

  useEffect(() => {
    fetchAll();
  }, []);

  function getClassLabel(item: ClassItem) {
    return item.class_name || item.name || "Unnamed Class";
  }

  function getSubjectLabel(item: SubjectItem) {
    return item.subject_name || item.name || "Unnamed Subject";
  }

  function getInitials(name?: string | null) {
    const parts = String(name || "Teacher")
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2);
    return parts.map((part) => part[0]?.toUpperCase()).join("") || "T";
  }

  function formatDate(value?: string | null) {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    return date.toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function getErrorMessage(error: any, fallback: string) {
    if (!error) return fallback;

    if (error instanceof Error && error.message) return error.message;

    const parts = [
      error.message,
      error.error,
      error.details,
      error.hint,
      error.code ? `Code: ${error.code}` : "",
    ].filter(Boolean);

    if (parts.length > 0) return parts.join(" | ");

    if (typeof error === "string") return error;

    try {
      const json = JSON.stringify(error, null, 2);
      return json && json !== "{}" ? json : fallback;
    } catch {
      return fallback;
    }
  }

  function getAvailableSubjectIdsForClass(classId: string) {
    const linkedIds = classSubjects
      .filter((row) => String(row.class_id) === String(classId))
      .map((row) => row.subject_id)
      .filter(Boolean);

    return Array.from(new Set(linkedIds));
  }

  function getAvailableSubjectsForClass(classId: string) {
    const allowedIds = getAvailableSubjectIdsForClass(classId);
    if (allowedIds.length === 0) return [];
    return subjects.filter((subject) => allowedIds.includes(subject.id));
  }

  function normalizeSubjectMapForClasses(
    classIds: string[],
    currentMap: Record<string, string[]>,
    autoSelectMissing = true
  ) {
    const nextMap: Record<string, string[]> = {};

    classIds.forEach((classId) => {
      const availableIds = getAvailableSubjectIdsForClass(classId);
      const current = currentMap[classId] || [];

      if (availableIds.length === 0) {
        nextMap[classId] = [];
        return;
      }

      const validCurrent = current.filter((subjectId) =>
        availableIds.includes(subjectId)
      );

      nextMap[classId] =
        validCurrent.length > 0 || !autoSelectMissing ? validCurrent : availableIds;
    });

    return nextMap;
  }

  function uniqueSubjectIdsFromMap(map: Record<string, string[]>) {
    return Array.from(new Set(Object.values(map).flat().filter(Boolean)));
  }

  function getTeacherClassIds(teacherId: string) {
    return Array.from(
      new Set(
        assignmentRows
          .filter((row) => row.teacher_id === teacherId)
          .map((row) => row.class_id)
          .filter(Boolean)
      )
    );
  }

  function getTeacherSubjectMap(teacherId: string) {
    const map: Record<string, string[]> = {};

    teacherSubjectRows
      .filter((row) => row.teacher_id === teacherId)
      .forEach((row) => {
        const classId = row.class_id || "general";
        if (!map[classId]) map[classId] = [];
        map[classId].push(row.subject_id);
      });

    return map;
  }

  function getTeacherClassLabels(teacher: Teacher) {
    const classIds = getTeacherClassIds(teacher.id);
    const labelsFromAssignments = classIds
      .map((classId) => classNameById[classId] || "")
      .filter(Boolean);

    if (labelsFromAssignments.length > 0) return labelsFromAssignments;

    return getClassLabelsFromText(teacher.assigned_classes);
  }

  function getTeacherSubjectLabels(teacherId: string) {
    const subjectIds = Object.values(getTeacherSubjectMap(teacherId)).flat();
    return Array.from(new Set(subjectIds))
      .map((subjectId) => subjectNameById[subjectId] || "Subject")
      .filter(Boolean);
  }

  function resetAddForm() {
    setAddForm(emptyAddForm);
  }

  function parseAssignedClassIdsFromText(value?: string | null) {
    if (!value) return [];

    const labels = value
      .split(/[,|;/]+/)
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean);

    if (labels.length === 0) return [];

    return classes
      .filter((item) => labels.includes(getClassLabel(item).toLowerCase()))
      .map((item) => item.id);
  }

  function getClassLabelsFromText(value?: string | null) {
    return String(value || "")
      .split(/[,|;/]+/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  async function uploadImageToCloudinary(
    file: File,
    setUploading: (value: boolean) => void
  ) {
    setUploading(true);

    try {
      const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
      const uploadPreset = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET;

      if (!cloudName || !uploadPreset) {
        throw new Error("Cloudinary environment variables are missing.");
      }

      const formData = new FormData();
      formData.append("file", file);
      formData.append("upload_preset", uploadPreset);

      const response = await fetch(
        `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
        {
          method: "POST",
          body: formData,
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error?.message || "Upload failed.");
      }

      return data.secure_url as string;
    } finally {
      setUploading(false);
    }
  }

  async function handleAddPhotoUpload(file: File) {
    try {
      const url = await uploadImageToCloudinary(file, setUploadingAddPhoto);
      setAddForm((prev) => ({ ...prev, photoUrl: url }));
      setMessage("Teacher photo uploaded successfully.");
    } catch (error) {
      setMessage(
        error instanceof Error ? `Error: ${error.message}` : "Error uploading photo."
      );
    }
  }

  async function handleAddSignatureUpload(file: File) {
    try {
      const url = await uploadImageToCloudinary(file, setUploadingAddSignature);
      setAddForm((prev) => ({ ...prev, signatureUrl: url }));
      setMessage("Signature uploaded successfully.");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? `Error: ${error.message}`
          : "Error uploading signature."
      );
    }
  }

  async function handleEditPhotoUpload(file: File) {
    if (!editForm) return;

    try {
      const url = await uploadImageToCloudinary(file, setUploadingEditPhoto);
      setEditForm((prev) => (prev ? { ...prev, photoUrl: url } : prev));
      setMessage("Teacher photo uploaded successfully.");
    } catch (error) {
      setMessage(
        error instanceof Error ? `Error: ${error.message}` : "Error uploading photo."
      );
    }
  }

  async function handleEditSignatureUpload(file: File) {
    if (!editForm) return;

    try {
      const url = await uploadImageToCloudinary(file, setUploadingEditSignature);
      setEditForm((prev) => (prev ? { ...prev, signatureUrl: url } : prev));
      setMessage("Signature uploaded successfully.");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? `Error: ${error.message}`
          : "Error uploading signature."
      );
    }
  }

  async function fetchAll() {
    setLoading(true);
    setMessage("");

    try {
      const [
        teachersRes,
        classesRes,
        subjectsRes,
        classSubjectsRes,
        teacherAssignmentsRes,
        teacherSubjectsRes,
      ] = await Promise.all([
        supabase
          .from("teachers")
          .select(
            "id, teacher_id, full_name, username, phone, photo_url, signature_url, role, is_active, is_visible, created_at, updated_at, auth_user_id, login_email, assigned_classes, password_changed, password_changed_at, force_password_change"
          )
          .order("created_at", { ascending: false }),
        supabase
          .from("classes")
          .select("id, class_name, name, class_order, level")
          .eq("is_active", true)
          .order("class_order", { ascending: true }),
        supabase
          .from("subjects")
          .select("id, subject_name, name, subject_order")
          .eq("is_active", true)
          .order("subject_order", { ascending: true }),
        supabase.from("class_subjects").select("id, class_id, subject_id"),
        supabase
          .from("teacher_class_assignments")
          .select("teacher_id, class_id, assignment_type"),
        supabase
          .from("teacher_subjects")
          .select("teacher_id, class_id, subject_id"),
      ]);

      if (teachersRes.error) throw teachersRes.error;
      if (classesRes.error) throw classesRes.error;
      if (subjectsRes.error) throw subjectsRes.error;
      if (classSubjectsRes.error) throw classSubjectsRes.error;
      if (teacherAssignmentsRes.error) throw teacherAssignmentsRes.error;
      if (teacherSubjectsRes.error) throw teacherSubjectsRes.error;

      setTeachers((teachersRes.data as Teacher[]) || []);
      setClasses((classesRes.data as ClassItem[]) || []);
      setSubjects((subjectsRes.data as SubjectItem[]) || []);
      setClassSubjects((classSubjectsRes.data as ClassSubject[]) || []);
      setAssignmentRows((teacherAssignmentsRes.data as TeacherAssignmentRow[]) || []);
      setTeacherSubjectRows((teacherSubjectsRes.data as TeacherSubjectRow[]) || []);
    } catch (error) {
      console.error(error);
      setMessage("Error: Failed to load teacher data.");
    } finally {
      setLoading(false);
    }
  }

  function toggleAddClass(classId: string) {
    const selected = addForm.selectedClassIds.includes(classId);
    const nextClassIds = selected
      ? addForm.selectedClassIds.filter((id) => id !== classId)
      : [...addForm.selectedClassIds, classId];

    const nextSubjectMap = normalizeSubjectMapForClasses(
      nextClassIds,
      addForm.subjectIdsByClass,
      true
    );

    setAddForm({
      ...addForm,
      selectedClassIds: nextClassIds,
      subjectIdsByClass: nextSubjectMap,
    });
  }

  function toggleEditClass(classId: string) {
    if (!editForm) return;

    const selected = editForm.selectedClassIds.includes(classId);
    const nextClassIds = selected
      ? editForm.selectedClassIds.filter((id) => id !== classId)
      : [...editForm.selectedClassIds, classId];

    const nextSubjectMap = normalizeSubjectMapForClasses(
      nextClassIds,
      editForm.subjectIdsByClass,
      true
    );

    setEditForm({
      ...editForm,
      selectedClassIds: nextClassIds,
      subjectIdsByClass: nextSubjectMap,
    });
  }

  function toggleSubjectForAddClass(classId: string, subjectId: string) {
    const availableIds = getAvailableSubjectIdsForClass(classId);
    if (!availableIds.includes(subjectId)) return;

    const current = addForm.subjectIdsByClass[classId] || [];
    const nextSubjects = current.includes(subjectId)
      ? current.filter((id) => id !== subjectId)
      : [...current, subjectId];

    setAddForm({
      ...addForm,
      subjectIdsByClass: {
        ...addForm.subjectIdsByClass,
        [classId]: nextSubjects,
      },
    });
  }

  function toggleSubjectForEditClass(classId: string, subjectId: string) {
    if (!editForm) return;

    const availableIds = getAvailableSubjectIdsForClass(classId);
    if (!availableIds.includes(subjectId)) return;

    const current = editForm.subjectIdsByClass[classId] || [];
    const nextSubjects = current.includes(subjectId)
      ? current.filter((id) => id !== subjectId)
      : [...current, subjectId];

    setEditForm({
      ...editForm,
      subjectIdsByClass: {
        ...editForm.subjectIdsByClass,
        [classId]: nextSubjects,
      },
    });
  }

  function selectAllAddSubjectsForClass(classId: string) {
    setAddForm({
      ...addForm,
      subjectIdsByClass: {
        ...addForm.subjectIdsByClass,
        [classId]: getAvailableSubjectIdsForClass(classId),
      },
    });
  }

  function clearAddSubjectsForClass(classId: string) {
    setAddForm({
      ...addForm,
      subjectIdsByClass: {
        ...addForm.subjectIdsByClass,
        [classId]: [],
      },
    });
  }

  function selectAllEditSubjectsForClass(classId: string) {
    if (!editForm) return;

    setEditForm({
      ...editForm,
      subjectIdsByClass: {
        ...editForm.subjectIdsByClass,
        [classId]: getAvailableSubjectIdsForClass(classId),
      },
    });
  }

  function clearEditSubjectsForClass(classId: string) {
    if (!editForm) return;

    setEditForm({
      ...editForm,
      subjectIdsByClass: {
        ...editForm.subjectIdsByClass,
        [classId]: [],
      },
    });
  }

  function buildTeacherSubjectRows(
    teacherId: string,
    subjectMap: Record<string, string[]>
  ) {
    return Object.entries(subjectMap).flatMap(([classId, subjectIds]) =>
      subjectIds.map((subjectId) => ({
        teacher_id: teacherId,
        class_id: classId,
        subject_id: subjectId,
      }))
    );
  }

  async function saveTeacherSubjectsByClass(
    teacherId: string,
    subjectMap: Record<string, string[]>
  ) {
    if (!teacherId) {
      throw new Error("Missing teacher ID for subject assignment.");
    }

    const { error: deleteError } = await supabase
      .from("teacher_subjects")
      .delete()
      .eq("teacher_id", teacherId);

    if (deleteError) {
      throw new Error(
        getErrorMessage(deleteError, "Failed to clear old teacher subjects.")
      );
    }

    const rows = buildTeacherSubjectRows(teacherId, subjectMap);
    if (rows.length === 0) return;

    const { error: insertError } = await supabase
      .from("teacher_subjects")
      .insert(rows);

    if (insertError) {
      throw new Error(
        getErrorMessage(insertError, "Failed to save teacher subjects.")
      );
    }
  }

  async function saveTeacherClassAssignments(
    teacherId: string,
    classIds: string[]
  ) {
    if (!teacherId) {
      throw new Error("Missing teacher ID for class assignment.");
    }

    const cleanClassIds = Array.from(new Set(classIds.filter(Boolean)));

    const { error: deleteError } = await supabase
      .from("teacher_class_assignments")
      .delete()
      .eq("teacher_id", teacherId);

    if (deleteError) {
      throw new Error(
        getErrorMessage(deleteError, "Failed to clear old class assignments.")
      );
    }

    if (cleanClassIds.length > 0) {
      const rows = cleanClassIds.map((classId) => ({
        teacher_id: teacherId,
        class_id: classId,
        assignment_type: "assigned",
      }));

      const { error: insertError } = await supabase
        .from("teacher_class_assignments")
        .upsert(rows, { onConflict: "teacher_id,class_id" });

      if (insertError) {
        throw new Error(
          getErrorMessage(insertError, "Failed to save class assignments.")
        );
      }
    }

    const assignedClassNames = cleanClassIds
      .map((classId) => classNameById[classId] || "")
      .filter(Boolean)
      .join(", ");

    const { error: teacherUpdateError } = await supabase
      .from("teachers")
      .update({
        assigned_classes: assignedClassNames || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", teacherId);

    if (teacherUpdateError) {
      throw new Error(
        getErrorMessage(teacherUpdateError, "Failed to update teacher assigned classes.")
      );
    }
  }

  async function loadTeacherAssignments(teacherId: string, teacher?: Teacher) {
    try {
      const { data: classData, error: classError } = await supabase
        .from("teacher_class_assignments")
        .select("class_id")
        .eq("teacher_id", teacherId);

      if (classError) throw classError;

      let classIds = Array.from(
        new Set(
          (classData || [])
            .map((row: any) => String(row.class_id || ""))
            .filter(Boolean)
        )
      );

      if (classIds.length === 0 && teacher?.assigned_classes) {
        classIds = parseAssignedClassIdsFromText(teacher.assigned_classes);
      }

      const { data: subjectData, error: subjectError } = await supabase
        .from("teacher_subjects")
        .select("class_id, subject_id")
        .eq("teacher_id", teacherId);

      if (subjectError) throw subjectError;

      const map: Record<string, string[]> = {};

      (subjectData || []).forEach((row: any) => {
        const classId = String(row.class_id || "");
        const subjectId = String(row.subject_id || "");
        if (!classId || !subjectId) return;

        if (!map[classId]) map[classId] = [];
        map[classId].push(subjectId);
      });

      return {
        classIds,
        subjectMap: normalizeSubjectMapForClasses(classIds, map, true),
      };
    } catch (error) {
      console.error(error);
      return {
        classIds: [],
        subjectMap: {},
      };
    }
  }

  async function handleAddTeacher() {
    if (
      !addForm.fullName.trim() ||
      !addForm.username.trim() ||
      !addForm.phone.trim() ||
      !addForm.password?.trim()
    ) {
      alert("Please fill full name, username, phone and password.");
      return;
    }

    setBusy(true);
    setMessage("");

    try {
      const createResponse = await authedFetch("/api/teachers/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fullName: addForm.fullName.trim(),
          username: addForm.username.trim(),
          phone: addForm.phone.trim(),
          role: addForm.role,
          password: addForm.password,
          photoUrl: addForm.photoUrl || null,
          signatureUrl:
            addForm.role === "headmaster" ? addForm.signatureUrl || null : null,
        }),
      });

      const createData = await createResponse.json();

      if (!createResponse.ok) {
        throw new Error(createData.error || "Failed to add teacher.");
      }

      const createdTeacher = await supabase
        .from("teachers")
        .select("id")
        .eq("username", addForm.username.trim().toLowerCase())
        .maybeSingle();

      if (createdTeacher.error) throw createdTeacher.error;

      if (createdTeacher.data?.id) {
        await saveTeacherClassAssignments(
          createdTeacher.data.id,
          addForm.selectedClassIds
        );

        await saveTeacherSubjectsByClass(
          createdTeacher.data.id,
          normalizeSubjectMapForClasses(
            addForm.selectedClassIds,
            addForm.subjectIdsByClass,
            true
          )
        );
      }

      await fetchAll();
      setShowAddModal(false);
      resetAddForm();
      setMessage("Teacher added successfully.");
    } catch (error: any) {
      console.error("Teacher add full error:", error);
      setMessage(`Error: ${getErrorMessage(error, "Error adding teacher.")}`);
    } finally {
      setBusy(false);
    }
  }

  async function openEditModal(teacher: Teacher) {
    const assignments = await loadTeacherAssignments(teacher.id, teacher);

    setEditForm({
      id: teacher.id,
      teacherId: teacher.teacher_id || "",
      fullName: teacher.full_name || "",
      username: teacher.username || "",
      phone: teacher.phone || "",
      role: teacher.role || "teacher",
      photoUrl: teacher.photo_url || "",
      signatureUrl: teacher.signature_url || "",
      newPassword: "",
      selectedClassIds: assignments.classIds,
      subjectIdsByClass: assignments.subjectMap,
    });
  }

  async function openDetailsModal(teacher: Teacher) {
    const assignments = await loadTeacherAssignments(teacher.id, teacher);

    setSelectedDetails({
      teacher,
      classIds: assignments.classIds,
      subjectMap: assignments.subjectMap,
    });
  }

  async function handleSaveEdit() {
    if (!editForm) return;

    if (
      !editForm.fullName.trim() ||
      !editForm.username.trim() ||
      !editForm.phone.trim()
    ) {
      alert("Please fill full name, username and phone.");
      return;
    }

    setBusy(true);
    setMessage("");

    try {
      const updateResponse = await authedFetch("/api/teachers/update", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: editForm.id,
          fullName: editForm.fullName.trim(),
          username: editForm.username.trim(),
          phone: editForm.phone.trim(),
          role: editForm.role,
          photoUrl: editForm.photoUrl || null,
          signatureUrl:
            editForm.role === "headmaster" ? editForm.signatureUrl || null : null,
        }),
      });

      const updateData = await updateResponse.json();

      if (!updateResponse.ok) {
        throw new Error(updateData.error || "Failed to update teacher.");
      }

      await saveTeacherClassAssignments(
        String(editForm.id),
        editForm.selectedClassIds
      );

      await saveTeacherSubjectsByClass(
        String(editForm.id),
        normalizeSubjectMapForClasses(
          editForm.selectedClassIds,
          editForm.subjectIdsByClass,
          true
        )
      );

      if (editForm.newPassword?.trim()) {
        const passwordResponse = await authedFetch("/api/teachers/reset-password", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            id: editForm.id,
            newPassword: editForm.newPassword,
          }),
        });

        const passwordData = await passwordResponse.json();

        if (!passwordResponse.ok) {
          throw new Error(passwordData.error || "Failed to reset password.");
        }
      }

      await fetchAll();
      setEditForm(null);
      setMessage("Teacher updated successfully.");
    } catch (error: any) {
      console.error("Teacher update full error:", error);
      setMessage(`Error: ${getErrorMessage(error, "Error updating teacher.")}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleSetKioskPin(id: string, teacherName: string) {
    const pin = window.prompt(`Set a 4-digit kiosk check-in/out PIN for ${teacherName}:`);
    if (pin === null) return; // cancelled

    const cleanPin = pin.trim();

    if (!/^\d{4}$/.test(cleanPin)) {
      alert("PIN must be exactly 4 digits.");
      return;
    }

    setBusy(true);
    setMessage("");

    try {
      const response = await authedFetch("/api/teachers/set-pin", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ teacherId: id, pin: cleanPin }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to set kiosk PIN.");
      }

      setMessage(`Kiosk PIN set for ${teacherName}.`);
    } catch (error: any) {
      console.error("Set kiosk PIN error:", error);
      setMessage(`Error: ${getErrorMessage(error, "Error setting kiosk PIN.")}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteTeacher(id: string) {
    const confirmed = window.confirm(
      "Are you sure you want to delete this teacher permanently?"
    );

    if (!confirmed) return;

    setBusy(true);
    setMessage("");

    try {
      const response = await authedFetch("/api/teachers/delete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ id }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to delete teacher.");
      }

      await fetchAll();
      setMessage("Teacher deleted successfully.");
    } catch (error: any) {
      console.error("Teacher delete full error:", error);
      setMessage(`Error: ${getErrorMessage(error, "Error deleting teacher.")}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="teacher-page">
      <style>{teacherPageStyles}</style>

      <div className="bg-orb bg-orb-one" />
      <div className="bg-orb bg-orb-two" />
      <div className="bg-grid" />

      <section className="teacher-shell">
        <header className="hero-card">
          <button
            type="button"
            onClick={() => window.history.back()}
            className="back-button"
          >
            ← Back
          </button>

          <div>
            <p className="eyebrow">JVS Teacher Control</p>
            <h1>Staff Information & Records</h1>
            <p className="hero-text">
              Manage teacher profiles, login details, photos, signatures, class
              assignments, and class-specific subjects from one cleaner dashboard.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            disabled={busy}
            className="primary-button"
          >
            + Add Teacher
          </button>
        </header>

        <div className="stat-grid">
          <StatCard label="Total Staff" value={teacherSummary.total} />
          <StatCard label="Active Staff" value={teacherSummary.active} />
          <StatCard label="Assigned" value={teacherSummary.assigned} />
          <StatCard label="Hidden" value={teacherSummary.hidden} />
        </div>

        {message && (
          <div className={message.startsWith("Error:") ? "alert error" : "alert"}>
            {message}
          </div>
        )}

        <section className="control-card">
          <div>
            <h2>Teacher Records</h2>
            <p>
              Search any teacher and open the profile to see classes, subjects,
              login info, signature, status, and records.
            </p>
          </div>

          <div className="search-row">
            <input
              type="text"
              placeholder="Search name, teacher ID, username, phone, email, class, subject..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
            />

            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
            >
              <option value="All">All Roles</option>
              {roleOptions.map((role) => (
                <option key={role.value} value={role.value}>
                  {role.label}
                </option>
              ))}
            </select>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="All">All Status</option>
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
              <option value="Hidden">Hidden</option>
            </select>
          </div>
        </section>

        {loading ? (
          <div className="empty-card">Loading teachers...</div>
        ) : filteredTeachers.length === 0 ? (
          <div className="empty-card">No teachers found.</div>
        ) : (
          <section className="teacher-grid">
            {filteredTeachers.map((teacher) => {
              const assignedClassLabels = getTeacherClassLabels(teacher);
              const subjectLabels = getTeacherSubjectLabels(teacher.id);
              const isActive = teacher.is_active !== false;
              const isVisible = teacher.is_visible !== false;

              return (
                <article key={teacher.id} className="teacher-card">
                  <div className="teacher-topline">
                    <div className="teacher-photo">
                      {teacher.photo_url ? (
                        <img
                          src={teacher.photo_url}
                          alt={teacher.full_name || "Teacher"}
                        />
                      ) : (
                        <span>{getInitials(teacher.full_name)}</span>
                      )}
                    </div>

                    <div className="teacher-main">
                      <h3>{teacher.full_name || "Unnamed Teacher"}</h3>
                      <p>{teacher.teacher_id || "No teacher ID"}</p>

                      <div className="pill-row">
                        <span className="gold-pill">{formatRoleLabel(teacher.role || "teacher")}</span>
                        <span className={isActive ? "green-pill" : "red-pill"}>
                          {isActive ? "Active" : "Inactive"}
                        </span>
                        {!isVisible && <span className="dark-pill">Hidden</span>}
                      </div>
                    </div>
                  </div>

                  <div className="teacher-info-grid">
                    <InfoMini label="Phone" value={teacher.phone || "—"} />
                    <InfoMini label="Username" value={teacher.username || "—"} />
                    <InfoMini label="Login Email" value={teacher.login_email || "—"} />
                    <InfoMini
                      label="Password"
                      value={teacher.password_changed ? "Changed" : "Default/Not changed"}
                    />
                  </div>

                  <div className="assignment-preview">
                    <p>Classes</p>
                    <div className="mini-chip-wrap">
                      {assignedClassLabels.length ? (
                        assignedClassLabels.slice(0, 4).map((name) => (
                          <span key={name}>{name}</span>
                        ))
                      ) : (
                        <span>No class assigned</span>
                      )}
                      {assignedClassLabels.length > 4 && (
                        <span>+{assignedClassLabels.length - 4}</span>
                      )}
                    </div>
                  </div>

                  <div className="assignment-preview">
                    <p>Subjects</p>
                    <div className="mini-chip-wrap">
                      {subjectLabels.length ? (
                        subjectLabels.slice(0, 5).map((name) => (
                          <span key={name}>{name}</span>
                        ))
                      ) : (
                        <span>No subject assigned</span>
                      )}
                      {subjectLabels.length > 5 && <span>+{subjectLabels.length - 5}</span>}
                    </div>
                  </div>

                  <div className="card-actions">
                    <button type="button" onClick={() => openDetailsModal(teacher)}>
                      View Records
                    </button>
                    <button type="button" onClick={() => openEditModal(teacher)}>
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSetKioskPin(teacher.id, teacher.full_name || "this teacher")}
                    >
                      Set Kiosk PIN
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteTeacher(teacher.id)}
                      className="danger-action"
                    >
                      Delete
                    </button>
                  </div>
                </article>
              );
            })}
          </section>
        )}
      </section>

      {showAddModal && (
        <TeacherFormModal
          title="Add Teacher"
          subtitle="Create teacher account, upload photo/signature, and assign only class-specific subjects."
          form={addForm}
          setForm={setAddForm}
          classes={classes}
          getClassLabel={getClassLabel}
          getSubjectLabel={getSubjectLabel}
          getAvailableSubjectsForClass={getAvailableSubjectsForClass}
          onToggleClass={toggleAddClass}
          onToggleSubject={toggleSubjectForAddClass}
          onSelectAllSubjects={selectAllAddSubjectsForClass}
          onClearSubjects={clearAddSubjectsForClass}
          onClose={() => {
            setShowAddModal(false);
            resetAddForm();
          }}
          onSave={handleAddTeacher}
          busy={busy}
          isAdd
          uploadingPhoto={uploadingAddPhoto}
          uploadingSignature={uploadingAddSignature}
          onPhotoUpload={handleAddPhotoUpload}
          onSignatureUpload={handleAddSignatureUpload}
        />
      )}

      {editForm && (
        <TeacherFormModal
          title="Edit Teacher"
          subtitle="Update teacher details, reset password, and adjust class-specific subject assignments."
          form={editForm}
          setForm={(next) => setEditForm(next)}
          classes={classes}
          getClassLabel={getClassLabel}
          getSubjectLabel={getSubjectLabel}
          getAvailableSubjectsForClass={getAvailableSubjectsForClass}
          onToggleClass={toggleEditClass}
          onToggleSubject={toggleSubjectForEditClass}
          onSelectAllSubjects={selectAllEditSubjectsForClass}
          onClearSubjects={clearEditSubjectsForClass}
          onClose={() => setEditForm(null)}
          onSave={handleSaveEdit}
          busy={busy}
          uploadingPhoto={uploadingEditPhoto}
          uploadingSignature={uploadingEditSignature}
          onPhotoUpload={handleEditPhotoUpload}
          onSignatureUpload={handleEditSignatureUpload}
        />
      )}

      {selectedDetails && (
        <TeacherDetailsModal
          details={selectedDetails}
          classes={classes}
          subjects={subjects}
          getClassLabel={getClassLabel}
          getSubjectLabel={getSubjectLabel}
          formatDate={formatDate}
          onClose={() => setSelectedDetails(null)}
        />
      )}
    </main>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="stat-card">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function InfoMini({ label, value }: { label: string; value: string }) {
  return (
    <div className="info-mini">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function TeacherFormModal({
  title,
  subtitle,
  form,
  setForm,
  classes,
  getClassLabel,
  getSubjectLabel,
  getAvailableSubjectsForClass,
  onToggleClass,
  onToggleSubject,
  onSelectAllSubjects,
  onClearSubjects,
  onClose,
  onSave,
  busy,
  isAdd = false,
  uploadingPhoto,
  uploadingSignature,
  onPhotoUpload,
  onSignatureUpload,
}: {
  title: string;
  subtitle: string;
  form: TeacherForm;
  setForm: (form: TeacherForm) => void;
  classes: ClassItem[];
  getClassLabel: (item: ClassItem) => string;
  getSubjectLabel: (item: SubjectItem) => string;
  getAvailableSubjectsForClass: (classId: string) => SubjectItem[];
  onToggleClass: (classId: string) => void;
  onToggleSubject: (classId: string, subjectId: string) => void;
  onSelectAllSubjects: (classId: string) => void;
  onClearSubjects: (classId: string) => void;
  onClose: () => void;
  onSave: () => void;
  busy: boolean;
  isAdd?: boolean;
  uploadingPhoto: boolean;
  uploadingSignature: boolean;
  onPhotoUpload: (file: File) => void;
  onSignatureUpload: (file: File) => void;
}) {
  return (
    <div className="modal-overlay">
      <div className="teacher-modal">
        <div className="modal-head">
          <div>
            <h2>{title}</h2>
            <p>{subtitle}</p>
          </div>

          <button type="button" onClick={onClose} className="modal-close">
            ×
          </button>
        </div>

        <div className="form-grid">
          {form.teacherId && (
            <Field label="Teacher ID">
              <input value={form.teacherId} disabled />
            </Field>
          )}

          <Field label="Full Name">
            <input
              value={form.fullName}
              onChange={(e) => setForm({ ...form, fullName: e.target.value })}
              placeholder="e.g. Samuel Ato Mensah"
            />
          </Field>

          <Field label="Username">
            <input
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              placeholder="teacher username"
            />
          </Field>

          <Field label="Phone">
            <input
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              placeholder="024..."
            />
          </Field>

          <Field label="Role">
            <select
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
            >
              {roleOptions.map((role) => (
                <option key={role.value} value={role.value}>
                  {role.label}
                </option>
              ))}
            </select>
          </Field>

          {isAdd ? (
            <Field label="Password">
              <input
                type="password"
                value={form.password || ""}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="temporary password"
              />
            </Field>
          ) : (
            <Field label="New Password">
              <input
                type="password"
                value={form.newPassword || ""}
                onChange={(e) => setForm({ ...form, newPassword: e.target.value })}
                placeholder="leave blank to keep old password"
              />
            </Field>
          )}

          <Field label="Teacher Photo">
            <input
              type="file"
              accept="image/*"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onPhotoUpload(file);
              }}
            />
            {uploadingPhoto && <small>Uploading photo...</small>}
          </Field>

          {form.role === "headmaster" && (
            <Field label="Headmaster Signature">
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) onSignatureUpload(file);
                }}
              />
              {uploadingSignature && <small>Uploading signature...</small>}
            </Field>
          )}
        </div>

        <div className="preview-grid">
          <PreviewImage title="Teacher Photo" url={form.photoUrl} fallback="No photo uploaded" />
          {form.role === "headmaster" && (
            <PreviewImage
              title="Signature"
              url={form.signatureUrl}
              fallback="No signature uploaded"
              wide
            />
          )}
        </div>

        <section className="assignment-panel">
          <div className="assignment-title-row">
            <div>
              <h3>Assign Classes</h3>
              <p>Select the classes this teacher handles.</p>
            </div>
            <span>{form.selectedClassIds.length} selected</span>
          </div>

          <div className="class-chip-grid">
            {classes.map((item) => {
              const checked = form.selectedClassIds.includes(item.id);

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onToggleClass(item.id)}
                  className={checked ? "class-chip selected" : "class-chip"}
                >
                  {checked ? "✓ " : ""}
                  {getClassLabel(item)}
                </button>
              );
            })}
          </div>
        </section>

        <section className="assignment-panel subject-panel">
          <div className="assignment-title-row">
            <div>
              <h3>Class Subjects</h3>
              <p>
                Only subjects connected to each selected class will appear here.
                They are selected automatically when the class is selected.
              </p>
            </div>
          </div>

          {form.selectedClassIds.length === 0 ? (
            <div className="empty-subject-note">Select a class first.</div>
          ) : (
            <div className="class-subject-stack">
              {form.selectedClassIds.map((classId) => {
                const classItem = classes.find((item) => item.id === classId);
                const availableSubjects = getAvailableSubjectsForClass(classId);
                const selectedForClass = form.subjectIdsByClass[classId] || [];

                return (
                  <div key={classId} className="class-subject-card">
                    <div className="class-subject-head">
                      <div>
                        <strong>{classItem ? getClassLabel(classItem) : "Class"}</strong>
                        <span>
                          {availableSubjects.length} subject
                          {availableSubjects.length === 1 ? "" : "s"} available
                        </span>
                      </div>

                      <div className="small-action-row">
                        <button type="button" onClick={() => onSelectAllSubjects(classId)}>
                          Select all
                        </button>
                        <button
                          type="button"
                          onClick={() => onClearSubjects(classId)}
                          className="clear-btn"
                        >
                          Clear
                        </button>
                      </div>
                    </div>

                    {availableSubjects.length === 0 ? (
                      <p className="no-class-subjects">
                        No subjects have been linked to this class yet. Add subjects
                        to the class first under class subject settings.
                      </p>
                    ) : (
                      <div className="subject-chip-grid">
                        {availableSubjects.map((subject) => (
                          <button
                            key={`${classId}-${subject.id}`}
                            type="button"
                            onClick={() => onToggleSubject(classId, subject.id)}
                            className={
                              selectedForClass.includes(subject.id)
                                ? "subject-chip selected"
                                : "subject-chip"
                            }
                          >
                            {selectedForClass.includes(subject.id) ? "✓ " : ""}
                            {getSubjectLabel(subject)}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <div className="modal-actions">
          <button type="button" onClick={onClose} disabled={busy} className="soft-button">
            Cancel
          </button>
          <button type="button" onClick={onSave} disabled={busy} className="primary-button">
            {busy ? "Saving..." : "Save Teacher"}
          </button>
        </div>
      </div>
    </div>
  );
}

function TeacherDetailsModal({
  details,
  classes,
  subjects,
  getClassLabel,
  getSubjectLabel,
  formatDate,
  onClose,
}: {
  details: TeacherDetails;
  classes: ClassItem[];
  subjects: SubjectItem[];
  getClassLabel: (item: ClassItem) => string;
  getSubjectLabel: (item: SubjectItem) => string;
  formatDate: (value?: string | null) => string;
  onClose: () => void;
}) {
  const { teacher, classIds, subjectMap } = details;

  const classMap = new Map(classes.map((item) => [item.id, item]));
  const subjectMapById = new Map(subjects.map((item) => [item.id, item]));

  const role = teacher.role || "teacher";
  const isActive = teacher.is_active !== false;
  const isVisible = teacher.is_visible !== false;

  return (
    <div className="modal-overlay">
      <div className="details-modal">
        <div className="modal-head">
          <div>
            <p className="eyebrow">Teacher Record</p>
            <h2>{teacher.full_name || "Unnamed Teacher"}</h2>
            <p>
              {teacher.teacher_id || "No teacher ID"} • {formatRoleLabel(role)}
            </p>
          </div>

          <button type="button" onClick={onClose} className="modal-close">
            ×
          </button>
        </div>

        <div className="details-profile">
          <div className="details-photo">
            {teacher.photo_url ? (
              <img src={teacher.photo_url} alt={teacher.full_name || "Teacher"} />
            ) : (
              <span>{(teacher.full_name || "T").slice(0, 2).toUpperCase()}</span>
            )}
          </div>

          <div className="details-info-grid">
            <InfoMini label="Phone" value={teacher.phone || "—"} />
            <InfoMini label="Username" value={teacher.username || "—"} />
            <InfoMini label="Login Email" value={teacher.login_email || "—"} />
            <InfoMini label="Role" value={role} />
            <InfoMini label="Status" value={isActive ? "Active" : "Inactive"} />
            <InfoMini label="Visibility" value={isVisible ? "Visible" : "Hidden"} />
            <InfoMini
              label="Password"
              value={teacher.password_changed ? "Changed" : "Default/Not changed"}
            />
            <InfoMini
              label="Force Password Reset"
              value={teacher.force_password_change ? "Yes" : "No"}
            />
            <InfoMini label="Created" value={formatDate(teacher.created_at)} />
            <InfoMini label="Updated" value={formatDate(teacher.updated_at)} />
          </div>
        </div>

        {teacher.signature_url && (
          <section className="details-section">
            <h3>Signature</h3>
            <img
              src={teacher.signature_url}
              alt="Teacher signature"
              className="signature-preview"
            />
          </section>
        )}

        <section className="details-section">
          <h3>Assigned Classes & Subjects</h3>

          {classIds.length === 0 ? (
            <div className="empty-subject-note">No class has been assigned.</div>
          ) : (
            <div className="details-assignment-stack">
              {classIds.map((classId) => {
                const classItem = classMap.get(classId);
                const subjectIds = subjectMap[classId] || [];

                return (
                  <div key={classId} className="detail-class-card">
                    <strong>{classItem ? getClassLabel(classItem) : "Class"}</strong>
                    <div className="mini-chip-wrap">
                      {subjectIds.length === 0 ? (
                        <span>No subjects selected</span>
                      ) : (
                        subjectIds.map((subjectId) => {
                          const subject = subjectMapById.get(subjectId);
                          return (
                            <span key={`${classId}-${subjectId}`}>
                              {subject ? getSubjectLabel(subject) : "Subject"}
                            </span>
                          );
                        })
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function PreviewImage({
  title,
  url,
  fallback,
  wide = false,
}: {
  title: string;
  url: string;
  fallback: string;
  wide?: boolean;
}) {
  return (
    <div className={wide ? "preview-card wide" : "preview-card"}>
      <p>{title}</p>
      {url ? (
        <img src={url} alt={title} />
      ) : (
        <span>{fallback}</span>
      )}
    </div>
  );
}

const teacherPageStyles = `
  * {
    box-sizing: border-box;
  }

  .teacher-page {
    position: relative;
    min-height: 100vh;
    overflow-x: hidden;
    padding: 18px;
    font-family: Inter, Arial, sans-serif;
    color: #102018;
    background:
      radial-gradient(circle at 14% 12%, rgba(255, 214, 102, 0.65), transparent 28%),
      radial-gradient(circle at 90% 10%, rgba(34, 197, 94, 0.35), transparent 30%),
      linear-gradient(135deg, #fffaf0 0%, #f8fff4 40%, #ecfff6 100%);
  }

  .teacher-page::before {
    content: "JVST";
    position: fixed;
    right: -60px;
    bottom: -60px;
    font-size: clamp(90px, 18vw, 260px);
    font-weight: 950;
    color: rgba(245, 158, 11, 0.1);
    letter-spacing: -0.08em;
    transform: rotate(-10deg);
    pointer-events: none;
    animation: watermarkFloat 9s ease-in-out infinite alternate;
  }

  .bg-grid {
    position: fixed;
    inset: 0;
    pointer-events: none;
    opacity: 0.45;
    background-image:
      linear-gradient(rgba(6, 78, 59, 0.06) 1px, transparent 1px),
      linear-gradient(90deg, rgba(6, 78, 59, 0.06) 1px, transparent 1px);
    background-size: 42px 42px;
    transform: perspective(700px) rotateX(58deg) translateY(-180px) scale(1.4);
    transform-origin: top;
  }

  .bg-orb {
    position: fixed;
    border-radius: 999px;
    pointer-events: none;
    filter: blur(18px);
    opacity: 0.6;
    animation: orbFloat 8s ease-in-out infinite alternate;
  }

  .bg-orb-one {
    width: 220px;
    height: 220px;
    background: rgba(245, 158, 11, 0.45);
    top: 90px;
    left: -70px;
  }

  .bg-orb-two {
    width: 260px;
    height: 260px;
    background: rgba(16, 185, 129, 0.3);
    right: -90px;
    top: 150px;
    animation-delay: -2s;
  }

  .teacher-shell {
    position: relative;
    z-index: 1;
    max-width: 1450px;
    margin: 0 auto;
  }

  .hero-card,
  .control-card,
  .teacher-card,
  .stat-card,
  .empty-card,
  .teacher-modal,
  .details-modal {
    backdrop-filter: blur(22px);
    -webkit-backdrop-filter: blur(22px);
    border: 1px solid rgba(255,255,255,0.72);
    box-shadow:
      0 22px 55px rgba(15, 23, 42, 0.12),
      inset 0 1px 0 rgba(255,255,255,0.8);
  }

  .hero-card {
    position: relative;
    overflow: hidden;
    border-radius: 34px;
    padding: 28px;
    display: grid;
    grid-template-columns: auto 1fr auto;
    gap: 22px;
    align-items: center;
    background:
      linear-gradient(135deg, rgba(255,255,255,0.86), rgba(255,248,222,0.76)),
      radial-gradient(circle at 92% 10%, rgba(245,158,11,0.34), transparent 24%);
  }

  .hero-card::after {
    content: "";
    position: absolute;
    width: 360px;
    height: 360px;
    right: -90px;
    top: -180px;
    border-radius: 999px;
    background:
      conic-gradient(from 120deg, rgba(245,158,11,0.25), rgba(16,185,129,0.18), rgba(59,130,246,0.16), rgba(245,158,11,0.25));
    animation: spinGlow 12s linear infinite;
  }

  .back-button,
  .primary-button,
  .soft-button,
  .modal-close,
  .card-actions button,
  .class-chip,
  .subject-chip,
  .small-action-row button {
    border: 0;
    cursor: pointer;
    transition: transform 180ms ease, box-shadow 180ms ease, background 180ms ease;
  }

  .back-button {
    position: relative;
    z-index: 1;
    align-self: start;
    background: rgba(255,255,255,0.85);
    color: #064e3b;
    border-radius: 999px;
    padding: 12px 16px;
    font-weight: 900;
    box-shadow: 0 12px 26px rgba(15,23,42,0.1);
  }

  .back-button:hover,
  .primary-button:hover,
  .card-actions button:hover,
  .class-chip:hover,
  .subject-chip:hover {
    transform: translateY(-3px) scale(1.02);
  }

  .eyebrow {
    margin: 0;
    color: #b45309;
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.14em;
    font-weight: 950;
  }

  .hero-card h1 {
    margin: 8px 0 8px;
    font-size: clamp(30px, 4vw, 54px);
    line-height: 0.95;
    letter-spacing: -0.06em;
    color: #102018;
  }

  .hero-text {
    max-width: 820px;
    margin: 0;
    line-height: 1.7;
    color: #37544a;
    font-weight: 700;
  }

  .primary-button {
    position: relative;
    z-index: 1;
    border-radius: 18px;
    padding: 13px 18px;
    background: linear-gradient(135deg, #047857, #10b981 46%, #f59e0b);
    color: white;
    font-weight: 950;
    box-shadow: 0 16px 30px rgba(4, 120, 87, 0.24);
  }

  .soft-button {
    border-radius: 18px;
    padding: 13px 18px;
    background: rgba(255,255,255,0.88);
    color: #0f172a;
    font-weight: 900;
    border: 1px solid rgba(15,23,42,0.08);
  }

  .stat-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 14px;
    margin: 16px 0;
  }

  .stat-card {
    border-radius: 24px;
    padding: 18px;
    background: rgba(255,255,255,0.74);
    transform-style: preserve-3d;
  }

  .stat-card:hover {
    transform: perspective(900px) rotateX(5deg) translateY(-4px);
  }

  .stat-card strong {
    display: block;
    font-size: 28px;
    color: #064e3b;
  }

  .stat-card span {
    color: #8a5b0a;
    font-size: 12px;
    font-weight: 900;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .alert {
    border-radius: 18px;
    padding: 14px 16px;
    margin: 14px 0;
    background: rgba(220, 252, 231, 0.92);
    color: #065f46;
    font-weight: 800;
    border: 1px solid rgba(34,197,94,0.25);
  }

  .alert.error {
    background: rgba(254, 226, 226, 0.94);
    color: #991b1b;
    border-color: rgba(239,68,68,0.25);
  }

  .control-card {
    border-radius: 28px;
    padding: 18px;
    margin-bottom: 16px;
    display: grid;
    grid-template-columns: 0.8fr 1.2fr;
    gap: 16px;
    align-items: end;
    background: rgba(255,255,255,0.78);
  }

  .control-card h2 {
    margin: 0 0 6px;
    color: #102018;
  }

  .control-card p {
    margin: 0;
    color: #4b635b;
    font-size: 13px;
    line-height: 1.6;
    font-weight: 700;
  }

  .search-row {
    display: grid;
    grid-template-columns: 1fr 170px 170px;
    gap: 10px;
  }

  .search-row input,
  .search-row select,
  .field input,
  .field select {
    width: 100%;
    min-height: 46px;
    border-radius: 16px;
    border: 1px solid rgba(15,23,42,0.1);
    background: rgba(255,255,255,0.9);
    outline: none;
    padding: 11px 13px;
    color: #0f172a;
    font-weight: 750;
    box-shadow: inset 0 1px 0 rgba(255,255,255,0.85);
  }

  .teacher-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 16px;
    padding-bottom: 24px;
  }

  .teacher-card {
    position: relative;
    overflow: hidden;
    border-radius: 28px;
    padding: 16px;
    background:
      linear-gradient(135deg, rgba(255,255,255,0.84), rgba(255,250,229,0.76)),
      radial-gradient(circle at 100% 0%, rgba(245,158,11,0.25), transparent 30%);
    transform-style: preserve-3d;
  }

  .teacher-card::before {
    content: "";
    position: absolute;
    inset: -40%;
    background: linear-gradient(115deg, transparent 35%, rgba(255,255,255,0.55), transparent 60%);
    transform: translateX(-70%) rotate(8deg);
    transition: transform 650ms ease;
    pointer-events: none;
  }

  .teacher-card:hover {
    transform: perspective(900px) rotateX(4deg) rotateY(-3deg) translateY(-6px);
    box-shadow:
      0 30px 65px rgba(15, 23, 42, 0.16),
      inset 0 1px 0 rgba(255,255,255,0.9);
  }

  .teacher-card:hover::before {
    transform: translateX(70%) rotate(8deg);
  }

  .teacher-topline {
    position: relative;
    z-index: 1;
    display: flex;
    gap: 13px;
    align-items: center;
  }

  .teacher-photo,
  .details-photo {
    flex: 0 0 auto;
    width: 76px;
    height: 76px;
    border-radius: 24px;
    overflow: hidden;
    display: grid;
    place-items: center;
    color: #064e3b;
    background:
      linear-gradient(135deg, #ffffff, #fef3c7),
      radial-gradient(circle, rgba(16,185,129,0.26), transparent 65%);
    border: 1px solid rgba(245,158,11,0.22);
    box-shadow: 0 14px 28px rgba(15,23,42,0.12);
    font-weight: 950;
    font-size: 22px;
  }

  .teacher-photo img,
  .details-photo img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .teacher-main {
    min-width: 0;
  }

  .teacher-main h3 {
    margin: 0;
    font-size: 18px;
    color: #102018;
    line-height: 1.15;
  }

  .teacher-main p {
    margin: 5px 0 0;
    color: #647067;
    font-weight: 900;
    font-size: 12px;
  }

  .pill-row {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 8px;
  }

  .pill-row span,
  .mini-chip-wrap span {
    border-radius: 999px;
    padding: 5px 9px;
    font-size: 11px;
    font-weight: 950;
  }

  .gold-pill {
    background: rgba(245,158,11,0.17);
    color: #92400e;
  }

  .green-pill {
    background: rgba(16,185,129,0.16);
    color: #047857;
  }

  .red-pill {
    background: rgba(239,68,68,0.13);
    color: #b91c1c;
  }

  .dark-pill {
    background: rgba(15,23,42,0.1);
    color: #0f172a;
  }

  .teacher-info-grid {
    position: relative;
    z-index: 1;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
    margin: 14px 0;
  }

  .info-mini {
    min-width: 0;
    border-radius: 16px;
    padding: 9px 10px;
    background: rgba(255,255,255,0.72);
    border: 1px solid rgba(15,23,42,0.06);
  }

  .info-mini span {
    display: block;
    color: #7a6b45;
    font-size: 10px;
    text-transform: uppercase;
    font-weight: 950;
    letter-spacing: 0.06em;
  }

  .info-mini strong {
    display: block;
    color: #102018;
    font-size: 12px;
    margin-top: 3px;
    overflow-wrap: anywhere;
  }

  .assignment-preview {
    position: relative;
    z-index: 1;
    margin-top: 10px;
  }

  .assignment-preview p {
    margin: 0 0 7px;
    color: #4b635b;
    font-size: 12px;
    font-weight: 950;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .mini-chip-wrap {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .mini-chip-wrap span {
    background: rgba(255,255,255,0.78);
    color: #064e3b;
    border: 1px solid rgba(16,185,129,0.14);
  }

  .card-actions {
    position: relative;
    z-index: 1;
    display: flex;
    gap: 8px;
    margin-top: 14px;
  }

  .card-actions button {
    flex: 1;
    border-radius: 14px;
    padding: 10px;
    background: rgba(6,78,59,0.95);
    color: white;
    font-weight: 950;
    font-size: 12px;
  }

  .card-actions button:nth-child(2) {
    background: rgba(245,158,11,0.95);
  }

  .card-actions .danger-action {
    background: rgba(185,28,28,0.92);
  }

  .empty-card {
    border-radius: 24px;
    padding: 28px;
    background: rgba(255,255,255,0.78);
    font-weight: 900;
    color: #37544a;
  }

  .modal-overlay {
    position: fixed;
    inset: 0;
    z-index: 80;
    display: grid;
    place-items: center;
    padding: 16px;
    background: rgba(15,23,42,0.42);
    backdrop-filter: blur(8px);
  }

  .teacher-modal,
  .details-modal {
    width: min(1160px, 100%);
    max-height: 92vh;
    overflow: auto;
    border-radius: 32px;
    padding: 22px;
    background:
      linear-gradient(135deg, rgba(255,255,255,0.94), rgba(255,250,231,0.92)),
      radial-gradient(circle at 90% 0%, rgba(245,158,11,0.28), transparent 32%);
  }

  .details-modal {
    width: min(980px, 100%);
  }

  .modal-head {
    display: flex;
    justify-content: space-between;
    gap: 14px;
    align-items: flex-start;
    margin-bottom: 18px;
  }

  .modal-head h2 {
    margin: 0;
    font-size: 24px;
    color: #102018;
  }

  .modal-head p {
    margin: 6px 0 0;
    color: #566b63;
    font-weight: 700;
    line-height: 1.5;
  }

  .modal-close {
    width: 44px;
    height: 44px;
    border-radius: 999px;
    background: rgba(15,23,42,0.08);
    color: #0f172a;
    font-size: 24px;
    font-weight: 900;
  }

  .form-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
  }

  .field {
    display: grid;
    gap: 6px;
  }

  .field span {
    color: #374151;
    font-size: 12px;
    font-weight: 950;
  }

  .field small {
    color: #047857;
    font-weight: 900;
  }

  .preview-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    margin: 14px 0;
  }

  .preview-card {
    border-radius: 18px;
    padding: 12px;
    background: rgba(255,255,255,0.78);
    border: 1px solid rgba(15,23,42,0.07);
    min-width: 150px;
  }

  .preview-card.wide {
    min-width: 260px;
  }

  .preview-card p {
    margin: 0 0 8px;
    color: #374151;
    font-weight: 950;
    font-size: 12px;
  }

  .preview-card img {
    width: 110px;
    height: 110px;
    border-radius: 16px;
    object-fit: cover;
    background: white;
  }

  .preview-card.wide img {
    width: 220px;
    height: 82px;
    object-fit: contain;
    padding: 8px;
    border: 1px solid rgba(15,23,42,0.08);
  }

  .preview-card span {
    color: #6b7280;
    font-size: 12px;
    font-weight: 700;
  }

  .assignment-panel {
    border-radius: 24px;
    padding: 15px;
    margin-top: 14px;
    background: rgba(255,255,255,0.72);
    border: 1px solid rgba(15,23,42,0.07);
  }

  .assignment-title-row {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    align-items: flex-start;
    margin-bottom: 12px;
  }

  .assignment-title-row h3 {
    margin: 0 0 4px;
    color: #102018;
  }

  .assignment-title-row p {
    margin: 0;
    color: #566b63;
    font-weight: 700;
    font-size: 12px;
  }

  .assignment-title-row > span {
    background: rgba(245,158,11,0.15);
    color: #92400e;
    border-radius: 999px;
    padding: 7px 10px;
    font-weight: 950;
    font-size: 12px;
  }

  .class-chip-grid,
  .subject-chip-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .class-chip,
  .subject-chip {
    border-radius: 999px;
    padding: 9px 12px;
    background: rgba(255,255,255,0.9);
    color: #102018;
    border: 1px solid rgba(15,23,42,0.08);
    font-weight: 900;
  }

  .class-chip.selected,
  .subject-chip.selected {
    background: linear-gradient(135deg, #047857, #10b981);
    color: white;
    border-color: transparent;
    box-shadow: 0 12px 24px rgba(4,120,87,0.18);
  }

  .class-subject-stack,
  .details-assignment-stack {
    display: grid;
    gap: 12px;
  }

  .class-subject-card,
  .detail-class-card {
    border-radius: 20px;
    padding: 13px;
    background: rgba(255,255,255,0.74);
    border: 1px solid rgba(15,23,42,0.07);
  }

  .class-subject-head {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 12px;
  }

  .class-subject-head strong,
  .detail-class-card strong {
    display: block;
    color: #102018;
    margin-bottom: 4px;
  }

  .class-subject-head span {
    color: #647067;
    font-size: 12px;
    font-weight: 800;
  }

  .small-action-row {
    display: flex;
    gap: 8px;
  }

  .small-action-row button {
    border-radius: 999px;
    padding: 7px 10px;
    background: rgba(219,234,254,0.9);
    color: #1d4ed8;
    font-weight: 950;
    font-size: 11px;
  }

  .small-action-row .clear-btn {
    background: rgba(254,226,226,0.95);
    color: #b91c1c;
  }

  .empty-subject-note,
  .no-class-subjects {
    border-radius: 16px;
    padding: 12px;
    background: rgba(254,243,199,0.65);
    color: #92400e;
    font-weight: 850;
    font-size: 13px;
  }

  .modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    margin-top: 18px;
  }

  .details-profile {
    display: grid;
    grid-template-columns: 130px 1fr;
    gap: 18px;
    align-items: start;
  }

  .details-photo {
    width: 130px;
    height: 130px;
    border-radius: 30px;
    font-size: 32px;
  }

  .details-info-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 10px;
  }

  .details-section {
    margin-top: 18px;
    border-radius: 24px;
    padding: 16px;
    background: rgba(255,255,255,0.72);
    border: 1px solid rgba(15,23,42,0.07);
  }

  .details-section h3 {
    margin: 0 0 12px;
    color: #102018;
  }

  .signature-preview {
    max-width: 260px;
    width: 100%;
    height: 92px;
    object-fit: contain;
    background: white;
    padding: 10px;
    border-radius: 16px;
    border: 1px solid rgba(15,23,42,0.08);
  }

  @keyframes orbFloat {
    from {
      transform: translate3d(0, 0, 0) scale(1);
    }
    to {
      transform: translate3d(18px, 28px, 0) scale(1.08);
    }
  }

  @keyframes spinGlow {
    to {
      transform: rotate(360deg);
    }
  }

  @keyframes watermarkFloat {
    from {
      transform: rotate(-10deg) translateY(0);
    }
    to {
      transform: rotate(-8deg) translateY(-18px);
    }
  }

  @media (max-width: 1100px) {
    .hero-card,
    .control-card {
      grid-template-columns: 1fr;
    }

    .stat-grid,
    .teacher-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .search-row {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 720px) {
    .teacher-page {
      padding: 10px;
    }

    .hero-card {
      padding: 18px;
    }

    .stat-grid,
    .teacher-grid,
    .form-grid,
    .details-info-grid,
    .details-profile {
      grid-template-columns: 1fr;
    }

    .details-photo {
      width: 100px;
      height: 100px;
    }

    .card-actions,
    .modal-actions,
    .class-subject-head {
      flex-direction: column;
    }
  }
`;
