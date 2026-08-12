"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { authedFetch } from "@/lib/apiClient";
import { fetchWithCache } from "@/lib/offline/cachedQuery";
import { useModuleLoadBadge } from "@/lib/offline/useModulePrefetch";
import ModuleDownloadBadge from "@/app/components/ModuleDownloadBadge";
import SDSFileUpload from "@/app/components/SDSFileUpload";

const OFFLINE_MODULE = "students";

// Students entered through SDS/admission only ever get a single full_name
// column filled in — first_name/other_name/last_name are specific to this
// page's own Add Student form. Falling back to splitting full_name means
// Edit still populates every field instead of leaving them blank for any
// student who wasn't added from here.
function splitFullName(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "", otherName: "", lastName: "" };
  if (parts.length === 1) return { firstName: parts[0], otherName: "", lastName: "" };
  if (parts.length === 2) return { firstName: parts[0], otherName: "", lastName: parts[1] };
  return {
    firstName: parts[0],
    otherName: parts.slice(1, -1).join(" "),
    lastName: parts[parts.length - 1],
  };
}

function generateRandomStudentId(existingStudents: any[]) {
  let newId = "";
  let isDuplicate = true;

  while (isDuplicate) {
    const randomNumber = Math.floor(100000 + Math.random() * 900000);
    newId = `JVS${randomNumber}`;
    isDuplicate = existingStudents.some(
      (student) => student.studentId === newId
    );
  }

  return newId;
}

function mapDbStudent(row: any) {
  const fullName =
    row.full_name ||
    [row.first_name, row.other_name, row.last_name].filter(Boolean).join(" ").trim() ||
    row.student_name ||
    "Unnamed Student";

  const hasSeparateNameFields = Boolean(row.first_name || row.last_name);
  const { firstName, otherName, lastName } = hasSeparateNameFields
    ? { firstName: row.first_name || "", otherName: row.other_name || "", lastName: row.last_name || "" }
    : splitFullName(fullName === "Unnamed Student" ? "" : fullName);

  return {
    id: row.id,
    studentId: row.student_id || row.jvs_id || "",
    jvsId: row.jvs_id || row.student_id || "",
    fullName,
    firstName,
    otherName,
    lastName,
    classId: row.class_id || "",
    className: row.class_name || "",
    gender: row.gender || "",
    dateOfBirth: row.date_of_birth || "",
    admissionDate: row.admission_date || "",
    residence: row.residence || "",
    parentName: row.parent_name || "",
    parentPhone: row.parent_phone || "",
    guardianName: row.guardian_name || "",
    guardianPhone: row.guardian_phone || "",
    emergencyContactName: row.emergency_contact_name || "",
    emergencyContactPhone: row.emergency_contact_phone || "",
    medicalNotes: row.medical_notes || row.health_note || "",
    status: row.status || (row.is_active === false || row.active === false ? "Inactive" : "Active"),
    photoUrl: row.photo_url || "",
    isActive: row.is_active !== false && row.active !== false,
    createdAt: row.created_at,
  };
}

function getStudentInitials(student: any) {
  const source = String(student.fullName || student.studentId || "JV").trim();
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

export default function Students() {
  const [students, setStudents] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showingCachedData, setShowingCachedData] = useState(false);
  const [busy, setBusy] = useState(false);

  const [showSingleModal, setShowSingleModal] = useState(false);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);

  const [selectedClassFilter, setSelectedClassFilter] = useState("All");
  const [searchText, setSearchText] = useState("");

  const [bulkDeleteMode, setBulkDeleteMode] = useState(false);
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);

  const [showPromoteModal, setShowPromoteModal] = useState(false);
  const [promoteMode, setPromoteMode] = useState<"individual" | "class" | "all">("all");
  const [promoteStudentId, setPromoteStudentId] = useState("");
  const [promoteFromClass, setPromoteFromClass] = useState("");
  const [promoteToClassId, setPromoteToClassId] = useState("");
  const [promoteUseAutoNext, setPromoteUseAutoNext] = useState(true);

  const [singleForm, setSingleForm] = useState({
    firstName: "",
    otherName: "",
    lastName: "",
    classId: "",
    className: "",
    gender: "",
    dateOfBirth: "",
    admissionDate: "",
    residence: "",
    parentName: "",
    parentPhone: "",
    guardianName: "",
    guardianPhone: "",
    emergencyContactName: "",
    emergencyContactPhone: "",
    medicalNotes: "",
    status: "Active",
    photoUrl: "",
  });

  const [bulkClassId, setBulkClassId] = useState("");
  const [bulkClassName, setBulkClassName] = useState("");
  const [bulkText, setBulkText] = useState("");

  const [editForm, setEditForm] = useState({
    id: "",
    studentId: "",
    firstName: "",
    otherName: "",
    lastName: "",
    classId: "",
    className: "",
    gender: "",
    dateOfBirth: "",
    admissionDate: "",
    residence: "",
    parentName: "",
    parentPhone: "",
    guardianName: "",
    guardianPhone: "",
    emergencyContactName: "",
    emergencyContactPhone: "",
    medicalNotes: "",
    status: "Active",
    photoUrl: "",
  });

  const filteredStudents = useMemo(() => {
    const byClass =
      selectedClassFilter === "All"
        ? students
        : students.filter((student) => student.className === selectedClassFilter);

    const query = searchText.trim().toLowerCase();

    if (!query) return byClass;

    return byClass.filter((student) => {
      const searchableText = [
        student.fullName,
        student.firstName,
        student.otherName,
        student.lastName,
        student.studentId,
        student.jvsId,
        student.className,
        student.gender,
        student.parentName,
        student.parentPhone,
        student.guardianName,
        student.guardianPhone,
        student.emergencyContactName,
        student.emergencyContactPhone,
        student.status,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return searchableText.includes(query);
    });
  }, [students, selectedClassFilter, searchText]);

  const visibleStudentIds = useMemo(() => {
    return filteredStudents.map((student) => student.id);
  }, [filteredStudents]);

  const selectedVisibleCount = useMemo(() => {
    return visibleStudentIds.filter((id) => selectedStudentIds.includes(id))
      .length;
  }, [visibleStudentIds, selectedStudentIds]);

  const allVisibleSelected =
    visibleStudentIds.length > 0 && selectedVisibleCount === visibleStudentIds.length;

  const resetSingleForm = () => {
    setSingleForm({
      firstName: "",
      otherName: "",
      lastName: "",
      classId: "",
      className: "",
      gender: "",
      dateOfBirth: "",
      admissionDate: "",
      residence: "",
      parentName: "",
      parentPhone: "",
      guardianName: "",
      guardianPhone: "",
      emergencyContactName: "",
      emergencyContactPhone: "",
      medicalNotes: "",
      status: "Active",
      photoUrl: "",
    });
  };

  const fetchClasses = async () => {
    const { data, fromCache } = await fetchWithCache(
      OFFLINE_MODULE,
      "classes",
      () => supabase.from("classes").select("*").order("class_order", { ascending: true }),
      [] as any[]
    );

    setClasses(data);
    if (fromCache) setShowingCachedData(true);
    return data;
  };

  const fetchStudents = async () => {
    setLoading(true);

    const { data, fromCache } = await fetchWithCache(
      OFFLINE_MODULE,
      "students",
      () => supabase.from("students").select("*").order("created_at", { ascending: true }),
      [] as any[]
    );

    setStudents(data.map(mapDbStudent));
    if (fromCache) setShowingCachedData(true);
    setLoading(false);
  };

  useEffect(() => {
    async function boot() {
      setShowingCachedData(false);
      await fetchClasses();
      await fetchStudents();
    }

    boot();
  }, []);

  const getClassById = (id: string) => {
    return classes.find((item) => item.id === id) || null;
  };

  const handleAddStudent = async () => {
    if (!singleForm.firstName || !singleForm.lastName || !singleForm.classId) {
      alert("Please fill first name, last name and class.");
      return;
    }

    const selectedClass = getClassById(singleForm.classId);

    if (!selectedClass) {
      alert("Please select a valid class.");
      return;
    }

    setBusy(true);

    const studentId = generateRandomStudentId(students);

    const payload = {
      student_id: studentId,
      full_name: [singleForm.firstName, singleForm.otherName, singleForm.lastName]
        .map((part) => part.trim())
        .filter(Boolean)
        .join(" "),
      first_name: singleForm.firstName.trim(),
      other_name: singleForm.otherName.trim() || null,
      last_name: singleForm.lastName.trim(),
      class_id: selectedClass.id,
      class_name: selectedClass.class_name,
      gender: singleForm.gender || null,
      date_of_birth: singleForm.dateOfBirth || null,
      admission_date: singleForm.admissionDate || null,
      residence: singleForm.residence.trim() || null,
      parent_name: singleForm.parentName.trim() || null,
      parent_phone: singleForm.parentPhone.trim() || null,
      guardian_name: singleForm.guardianName.trim() || null,
      guardian_phone: singleForm.guardianPhone.trim() || null,
      emergency_contact_name: singleForm.emergencyContactName.trim() || null,
      emergency_contact_phone: singleForm.emergencyContactPhone.trim() || null,
      medical_notes: singleForm.medicalNotes.trim() || null,
      status: singleForm.status || "Active",
      photo_url: singleForm.photoUrl.trim() || null,
    };

    const { data, error } = await supabase
      .from("students")
      .insert([payload])
      .select()
      .single();

    setBusy(false);

    if (error) {
      console.error(error);
      alert("Failed to save student.");
      return;
    }

    setStudents((prev) => [...prev, mapDbStudent(data)]);
    setShowSingleModal(false);
    resetSingleForm();
  };

  const handleBulkAdd = async () => {
    if (!bulkClassId) {
      alert("Please select a class for the bulk students.");
      return;
    }

    if (!bulkText.trim()) {
      alert("Please enter student names.");
      return;
    }

    const selectedClass = getClassById(bulkClassId);

    if (!selectedClass) {
      alert("Please select a valid class.");
      return;
    }

    const lines = bulkText
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    if (lines.length === 0) {
      alert("Please enter at least one student.");
      return;
    }

    setBusy(true);

    const currentStudents = [...students];

    const payload = lines.map((line) => {
      const parts = line.split(" ").filter(Boolean);
      const firstName = parts[0] || "";
      const lastName = parts.slice(1).join(" ") || "";

      const record = {
        student_id: generateRandomStudentId(currentStudents),
        full_name: [firstName, lastName].filter(Boolean).join(" "),
        first_name: firstName,
        other_name: null,
        last_name: lastName,
        class_id: selectedClass.id,
        class_name: selectedClass.class_name,
        gender: null,
        date_of_birth: null,
        admission_date: null,
        residence: null,
        parent_name: null,
        parent_phone: null,
        guardian_name: null,
        guardian_phone: null,
        emergency_contact_name: null,
        emergency_contact_phone: null,
        medical_notes: null,
        status: "Active",
        photo_url: null,
      };

      currentStudents.push({
        studentId: record.student_id,
      });

      return record;
    });

    const { data, error } = await supabase
      .from("students")
      .insert(payload)
      .select();

    setBusy(false);

    if (error) {
      console.error(error);
      alert("Failed to bulk add students.");
      return;
    }

    setStudents((prev) => [...prev, ...(data || []).map(mapDbStudent)]);
    setSelectedClassFilter(selectedClass.class_name);
    setShowBulkModal(false);
    setBulkClassId("");
    setBulkClassName("");
    setBulkText("");
  };

  const openPromoteModal = (
    mode: "individual" | "class" | "all",
    student?: any
  ) => {
    setPromoteMode(mode);
    setPromoteStudentId(student?.id || "");
    setPromoteFromClass(
      mode === "individual"
        ? student?.className || ""
        : selectedClassFilter !== "All"
          ? selectedClassFilter
          : ""
    );
    setPromoteToClassId("");
    setPromoteUseAutoNext(true);
    setShowPromoteModal(true);
  };

  const getSelectedPromoteStudents = () => {
    if (promoteMode === "individual") {
      return students.filter((student) => student.id === promoteStudentId);
    }

    if (promoteMode === "class") {
      return students.filter((student) => student.className === promoteFromClass);
    }

    return students;
  };

  const handlePromoteStudents = async () => {
    const selectedStudents = getSelectedPromoteStudents();

    if (selectedStudents.length === 0) {
      alert("No students found for this promotion.");
      return;
    }

    if (!promoteUseAutoNext && !promoteToClassId) {
      alert("Select the class to promote to.");
      return;
    }

    const confirmed = window.confirm(
      `Promote ${selectedStudents.length} student(s)? Final-class students will be marked as Completed, not deleted.`
    );

    if (!confirmed) return;

    setBusy(true);

    // Runs as one server-side request instead of looping through updates in
    // the browser — that loop used to leave the school in a half-promoted,
    // mixed-class state if the tab closed or the connection dropped mid-way.
    try {
      const response = await authedFetch("/api/students/promote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: promoteMode,
          studentId: promoteMode === "individual" ? promoteStudentId : undefined,
          fromClass: promoteMode === "class" ? promoteFromClass : undefined,
          useAutoNext: promoteUseAutoNext,
          targetClassId: promoteUseAutoNext ? undefined : promoteToClassId,
        }),
      });

      const result = await response.json();

      if (!response.ok && response.status !== 207) {
        throw new Error(result.error || "Failed to promote students.");
      }

      await fetchStudents();
      setSelectedClassFilter("All");
      setSelectedStudentIds([]);
      setShowPromoteModal(false);

      if (result.failures?.length) {
        alert(`${result.message}\n\n${result.failures.length} student(s) failed — please retry those individually.`);
      } else {
        alert(result.message || "Promotion completed successfully.");
      }
    } catch (error) {
      console.error(error);
      alert(error instanceof Error ? error.message : "Failed to promote students.");
    } finally {
      setBusy(false);
    }
  };

  const openEditModal = (student: any) => {
    setEditForm({
      id: student.id,
      studentId: student.studentId,
      firstName: student.firstName,
      otherName: student.otherName,
      lastName: student.lastName,
      classId: student.classId,
      className: student.className,
      gender: student.gender,
      dateOfBirth: student.dateOfBirth,
      admissionDate: student.admissionDate,
      residence: student.residence,
      parentName: student.parentName,
      parentPhone: student.parentPhone,
      guardianName: student.guardianName,
      guardianPhone: student.guardianPhone,
      emergencyContactName: student.emergencyContactName,
      emergencyContactPhone: student.emergencyContactPhone,
      medicalNotes: student.medicalNotes,
      status: student.status || "Active",
      photoUrl: student.photoUrl || "",
    });
    setShowEditModal(true);
  };

  const handleSaveEdit = async () => {
    if (!editForm.firstName || !editForm.lastName || !editForm.classId) {
      alert("Please fill first name, last name and class.");
      return;
    }

    const selectedClass = getClassById(editForm.classId);

    if (!selectedClass) {
      alert("Please select a valid class.");
      return;
    }

    setBusy(true);

    const { data, error } = await supabase
      .from("students")
      .update({
        full_name: [editForm.firstName, editForm.otherName, editForm.lastName]
          .map((part) => part.trim())
          .filter(Boolean)
          .join(" "),
        first_name: editForm.firstName.trim(),
        other_name: editForm.otherName.trim() || null,
        last_name: editForm.lastName.trim(),
        class_id: selectedClass.id,
        class_name: selectedClass.class_name,
        gender: editForm.gender || null,
        date_of_birth: editForm.dateOfBirth || null,
        admission_date: editForm.admissionDate || null,
        residence: editForm.residence.trim() || null,
        parent_name: editForm.parentName.trim() || null,
        parent_phone: editForm.parentPhone.trim() || null,
        guardian_name: editForm.guardianName.trim() || null,
        guardian_phone: editForm.guardianPhone.trim() || null,
        emergency_contact_name: editForm.emergencyContactName.trim() || null,
        emergency_contact_phone: editForm.emergencyContactPhone.trim() || null,
        medical_notes: editForm.medicalNotes.trim() || null,
        status: editForm.status || "Active",
        photo_url: editForm.photoUrl.trim() || null,
      })
      .eq("id", editForm.id)
      .select()
      .single();

    setBusy(false);

    if (error) {
      console.error(error);
      alert("Failed to update student.");
      return;
    }

    setStudents((prev) =>
      prev.map((student) =>
        student.id === editForm.id ? mapDbStudent(data) : student
      )
    );

    setShowEditModal(false);
  };

  const handleDeleteStudent = async (studentId: string) => {
    const confirmed = window.confirm(
      "Are you sure you want to delete this student from the system?"
    );

    if (!confirmed) return;

    setBusy(true);

    const { error } = await supabase.from("students").delete().eq("id", studentId);

    setBusy(false);

    if (error) {
      console.error(error);
      alert("Failed to delete student.");
      return;
    }

    setStudents((prev) => prev.filter((student) => student.id !== studentId));
    setSelectedStudentIds((prev) => prev.filter((id) => id !== studentId));
  };

  const toggleStudentSelection = (studentId: string) => {
    setSelectedStudentIds((prev) =>
      prev.includes(studentId)
        ? prev.filter((id) => id !== studentId)
        : [...prev, studentId]
    );
  };

  const handleSelectAllVisible = () => {
    if (allVisibleSelected) {
      setSelectedStudentIds((prev) =>
        prev.filter((id) => !visibleStudentIds.includes(id))
      );
      return;
    }

    setSelectedStudentIds((prev) => {
      const set = new Set(prev);
      visibleStudentIds.forEach((id) => set.add(id));
      return Array.from(set);
    });
  };

  const handleClearSelection = () => {
    setSelectedStudentIds([]);
  };

  const handleSelectCurrentClass = () => {
    if (selectedClassFilter === "All") {
      alert("Choose a class first from the filter to select a full class.");
      return;
    }

    const classIds = students
      .filter((student) => student.className === selectedClassFilter)
      .map((student) => student.id);

    setSelectedStudentIds((prev) => {
      const set = new Set(prev);
      classIds.forEach((id) => set.add(id));
      return Array.from(set);
    });
  };

  const handleBulkDelete = async () => {
    if (selectedStudentIds.length === 0) {
      alert("Select students first.");
      return;
    }

    const confirmed = window.confirm(
      `Are you sure you want to delete ${selectedStudentIds.length} selected student(s)?`
    );

    if (!confirmed) return;

    setBusy(true);

    const { error } = await supabase
      .from("students")
      .delete()
      .in("id", selectedStudentIds);

    setBusy(false);

    if (error) {
      console.error(error);
      alert("Failed to bulk delete students.");
      return;
    }

    setStudents((prev) =>
      prev.filter((student) => !selectedStudentIds.includes(student.id))
    );
    setSelectedStudentIds([]);
    setBulkDeleteMode(false);
  };

  const exitBulkDeleteMode = () => {
    setBulkDeleteMode(false);
    setSelectedStudentIds([]);
  };

  const moduleDownloadStatus = useModuleLoadBadge(loading);

  return (
    <div className="space-y-6">
      <ModuleDownloadBadge status={moduleDownloadStatus} label="Students" />
      <div className="flex flex-col gap-4 rounded-2xl bg-white p-5 shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Students</h1>
          <p className="mt-1 text-sm text-gray-500">
            View student photos, full names, IDs, guardians, status, and promotions.
          </p>
          {showingCachedData && (
            <p className="mt-1 text-xs text-gray-400">Showing last synced data</p>
          )}
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <button
            onClick={() => setShowSingleModal(true)}
            className="rounded-xl bg-sky-500 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-600"
            disabled={busy || bulkDeleteMode}
          >
            + Add Student
          </button>

          <button
            onClick={() => setShowBulkModal(true)}
            className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-600"
            disabled={busy || bulkDeleteMode}
          >
            + Bulk Add
          </button>

          <button
            onClick={() => openPromoteModal("all")}
            className="rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600"
            disabled={busy || bulkDeleteMode}
          >
            Promote
          </button>

          <Link
            href="/students/graduated"
            className="rounded-xl bg-indigo-500 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-600"
          >
            Graduated Students
          </Link>

          {!bulkDeleteMode ? (
            <button
              onClick={() => setBulkDeleteMode(true)}
              className="rounded-xl bg-red-500 px-4 py-2 text-sm font-semibold text-white hover:bg-red-600"
              disabled={busy}
            >
              Bulk Delete
            </button>
          ) : (
            <button
              onClick={exitBulkDeleteMode}
              className="rounded-xl bg-gray-500 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-600"
              disabled={busy}
            >
              Cancel Bulk Delete
            </button>
          )}
        </div>
      </div>

      <div className="rounded-2xl bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-base font-bold text-gray-800">Student List</h2>
            <p className="text-sm text-gray-500">
              Filter students by class or search by name, ID or guardian.
            </p>
          </div>

          <div className="flex w-full flex-col gap-3 sm:flex-row lg:w-auto">
            <input
              type="text"
              placeholder="Search student..."
              className="w-full rounded-xl border border-gray-300 px-4 py-2 text-sm outline-none focus:border-sky-500 sm:w-72"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
            />

            <div className="w-full sm:w-64">
              <select
                value={selectedClassFilter}
                onChange={(e) => setSelectedClassFilter(e.target.value)}
                className="w-full rounded-xl border border-gray-300 px-4 py-2 text-sm outline-none focus:border-sky-500"
              >
                <option value="All">All Classes</option>
                {classes.map((classItem) => (
                  <option key={classItem.id} value={classItem.class_name}>
                    {classItem.class_name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {bulkDeleteMode && (
          <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h3 className="text-sm font-bold text-red-700">
                  Bulk Delete Mode
                </h3>
                <p className="mt-1 text-sm text-red-600">
                  {selectedStudentIds.length} student(s) selected.
                </p>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                <button
                  onClick={handleSelectAllVisible}
                  className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100"
                  disabled={busy || visibleStudentIds.length === 0}
                >
                  {allVisibleSelected ? "Unselect Visible" : "Select All Visible"}
                </button>

                <button
                  onClick={handleSelectCurrentClass}
                  className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100"
                  disabled={busy}
                >
                  Select Current Class
                </button>

                <button
                  onClick={handleClearSelection}
                  className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100"
                  disabled={busy || selectedStudentIds.length === 0}
                >
                  Clear Selection
                </button>

                <button
                  onClick={handleBulkDelete}
                  className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
                  disabled={busy || selectedStudentIds.length === 0}
                >
                  {busy ? "Deleting..." : `Delete Selected (${selectedStudentIds.length})`}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="overflow-hidden rounded-2xl bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                {bulkDeleteMode && (
                  <th className="px-5 py-4 font-semibold">
                    <input
                      type="checkbox"
                      checked={allVisibleSelected}
                      onChange={handleSelectAllVisible}
                    />
                  </th>
                )}
                <th className="px-5 py-4 font-semibold">Student</th>
                <th className="px-5 py-4 font-semibold">Class</th>
                <th className="px-5 py-4 font-semibold">Gender</th>
                <th className="px-5 py-4 font-semibold">Parent / Guardian</th>
                <th className="px-5 py-4 font-semibold">Emergency</th>
                <th className="px-5 py-4 font-semibold">Status</th>
                <th className="px-5 py-4 font-semibold">Actions</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td
                    colSpan={bulkDeleteMode ? 8 : 7}
                    className="px-6 py-8 text-center text-gray-500"
                  >
                    Loading students...
                  </td>
                </tr>
              ) : filteredStudents.length === 0 ? (
                <tr>
                  <td
                    colSpan={bulkDeleteMode ? 8 : 7}
                    className="px-6 py-8 text-center text-gray-500"
                  >
                    No students found.
                  </td>
                </tr>
              ) : (
                filteredStudents.map((student, index) => (
                  <tr
                    key={student.id}
                    className={`transition hover:bg-amber-50/50 ${
                      index !== filteredStudents.length - 1
                        ? "border-b border-gray-100"
                        : ""
                    }`}
                  >
                    {bulkDeleteMode && (
                      <td className="px-5 py-4">
                        <input
                          type="checkbox"
                          checked={selectedStudentIds.includes(student.id)}
                          onChange={() => toggleStudentSelection(student.id)}
                        />
                      </td>
                    )}

                    <td className="px-5 py-4">
                      <div className="flex min-w-[260px] items-center gap-3">
                        {student.photoUrl ? (
                          <img
                            src={student.photoUrl}
                            alt={student.fullName}
                            className="h-12 w-12 rounded-2xl object-cover ring-2 ring-amber-200"
                          />
                        ) : (
                          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 to-emerald-600 text-sm font-black text-white shadow-md">
                            {getStudentInitials(student)}
                          </div>
                        )}

                        <div>
                          <div className="font-bold text-slate-900">
                            {student.fullName}
                          </div>
                          <div className="mt-1 text-xs font-semibold text-amber-700">
                            {student.studentId || student.jvsId || "No ID"}
                          </div>
                          {student.residence && (
                            <div className="mt-0.5 text-xs text-slate-500">
                              {student.residence}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>

                    <td className="px-5 py-4 font-semibold text-slate-700">
                      {student.className || "-"}
                    </td>
                    <td className="px-5 py-4 text-slate-700">
                      {student.gender || "-"}
                    </td>
                    <td className="px-5 py-4 text-slate-700">
                      <div className="min-w-[180px]">
                        <div className="font-semibold">
                          {student.parentName || student.guardianName || "-"}
                        </div>
                        <div className="text-xs text-slate-500">
                          {student.parentPhone || student.guardianPhone || "-"}
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-slate-700">
                      <div className="min-w-[150px]">
                        <div className="font-semibold">
                          {student.emergencyContactName || "-"}
                        </div>
                        <div className="text-xs text-slate-500">
                          {student.emergencyContactPhone || "-"}
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-bold ${
                          String(student.status || "").toLowerCase() === "active" &&
                          student.isActive
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-red-100 text-red-700"
                        }`}
                      >
                        {student.status || "-"}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => openEditModal(student)}
                          className="rounded-lg bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-200"
                          disabled={busy || bulkDeleteMode}
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => openPromoteModal("individual", student)}
                          className="rounded-lg bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700 hover:bg-amber-200"
                          disabled={busy || bulkDeleteMode}
                        >
                          Promote
                        </button>
                        <button
                          onClick={() => handleDeleteStudent(student.id)}
                          className="rounded-lg bg-red-100 px-3 py-1 text-xs font-semibold text-red-700 hover:bg-red-200"
                          disabled={busy || bulkDeleteMode}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showPromoteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-2xl rounded-3xl bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-black text-slate-900">
                  Promote Students
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Promote one student, one class, or all students. Final-class
                  students will be marked as Completed, not deleted.
                </p>
              </div>
              <button
                onClick={() => setShowPromoteModal(false)}
                className="rounded-xl bg-slate-100 px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-200"
                disabled={busy}
              >
                Close
              </button>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <button
                onClick={() => {
                  setPromoteMode("individual");
                  if (!promoteStudentId && filteredStudents[0]) {
                    setPromoteStudentId(filteredStudents[0].id);
                    setPromoteFromClass(filteredStudents[0].className || "");
                  }
                }}
                className={`rounded-2xl border px-4 py-3 text-left text-sm font-bold ${
                  promoteMode === "individual"
                    ? "border-amber-400 bg-amber-50 text-amber-800"
                    : "border-slate-200 bg-white text-slate-700"
                }`}
              >
                Individual
              </button>
              <button
                onClick={() => setPromoteMode("class")}
                className={`rounded-2xl border px-4 py-3 text-left text-sm font-bold ${
                  promoteMode === "class"
                    ? "border-amber-400 bg-amber-50 text-amber-800"
                    : "border-slate-200 bg-white text-slate-700"
                }`}
              >
                Class
              </button>
              <button
                onClick={() => setPromoteMode("all")}
                className={`rounded-2xl border px-4 py-3 text-left text-sm font-bold ${
                  promoteMode === "all"
                    ? "border-amber-400 bg-amber-50 text-amber-800"
                    : "border-slate-200 bg-white text-slate-700"
                }`}
              >
                All Students
              </button>
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              {promoteMode === "individual" && (
                <select
                  value={promoteStudentId}
                  onChange={(e) => {
                    const selected = students.find(
                      (student) => student.id === e.target.value
                    );
                    setPromoteStudentId(e.target.value);
                    setPromoteFromClass(selected?.className || "");
                  }}
                  className="rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-amber-500"
                >
                  <option value="">Select student</option>
                  {filteredStudents.map((student) => (
                    <option key={student.id} value={student.id}>
                      {student.fullName} - {student.studentId}
                    </option>
                  ))}
                </select>
              )}

              {promoteMode === "class" && (
                <select
                  value={promoteFromClass}
                  onChange={(e) => setPromoteFromClass(e.target.value)}
                  className="rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-amber-500"
                >
                  <option value="">Select class to promote</option>
                  {classes.map((classItem) => (
                    <option key={classItem.id} value={classItem.class_name}>
                      {classItem.class_name}
                    </option>
                  ))}
                </select>
              )}

              <select
                value={promoteUseAutoNext ? "auto" : promoteToClassId}
                onChange={(e) => {
                  if (e.target.value === "auto") {
                    setPromoteUseAutoNext(true);
                    setPromoteToClassId("");
                    return;
                  }

                  setPromoteUseAutoNext(false);
                  setPromoteToClassId(e.target.value);
                }}
                className="rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-amber-500"
              >
                <option value="auto">Promote to next class automatically</option>
                {classes.map((classItem) => (
                  <option key={classItem.id} value={classItem.id}>
                    Promote to {classItem.class_name}
                  </option>
                ))}
              </select>
            </div>

            <div className="mt-5 rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
              Selected:{" "}
              <span className="font-bold text-slate-900">
                {getSelectedPromoteStudents().length}
              </span>{" "}
              student(s)
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setShowPromoteModal(false)}
                className="rounded-xl bg-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-300"
                disabled={busy}
              >
                Cancel
              </button>
              <button
                onClick={handlePromoteStudents}
                className="rounded-xl bg-amber-500 px-5 py-2 text-sm font-bold text-white hover:bg-amber-600"
                disabled={busy}
              >
                {busy ? "Promoting..." : "Confirm Promotion"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showSingleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-2xl bg-white p-6 shadow-lg">
            <h2 className="mb-1 text-lg font-bold text-gray-800">Add Student</h2>
            <p className="mb-5 text-sm text-gray-500">
              Add one student manually to the central student system.
            </p>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <input
                type="text"
                placeholder="First Name"
                className="rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-sky-500"
                value={singleForm.firstName}
                onChange={(e) =>
                  setSingleForm({ ...singleForm, firstName: e.target.value })
                }
              />

              <input
                type="text"
                placeholder="Other Name"
                className="rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-sky-500"
                value={singleForm.otherName}
                onChange={(e) =>
                  setSingleForm({ ...singleForm, otherName: e.target.value })
                }
              />

              <input
                type="text"
                placeholder="Last Name"
                className="rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-sky-500"
                value={singleForm.lastName}
                onChange={(e) =>
                  setSingleForm({ ...singleForm, lastName: e.target.value })
                }
              />

              <select
                className="rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-sky-500"
                value={singleForm.classId}
                onChange={(e) => {
                  const classRow = getClassById(e.target.value);
                  setSingleForm({
                    ...singleForm,
                    classId: e.target.value,
                    className: classRow?.class_name || "",
                  });
                }}
              >
                <option value="">Select Class</option>
                {classes.map((classItem) => (
                  <option key={classItem.id} value={classItem.id}>
                    {classItem.class_name}
                  </option>
                ))}
              </select>

              <select
                className="rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-sky-500"
                value={singleForm.gender}
                onChange={(e) =>
                  setSingleForm({ ...singleForm, gender: e.target.value })
                }
              >
                <option value="">Select Gender</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
              </select>

              <select
                className="rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-sky-500"
                value={singleForm.status}
                onChange={(e) =>
                  setSingleForm({ ...singleForm, status: e.target.value })
                }
              >
                <option value="Active">Active</option>
                <option value="Transferred">Transferred</option>
                <option value="Completed">Completed</option>
                <option value="Inactive">Inactive</option>
              </select>

              <input
                type="date"
                placeholder="Date of Birth"
                className="rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-sky-500"
                value={singleForm.dateOfBirth}
                onChange={(e) =>
                  setSingleForm({ ...singleForm, dateOfBirth: e.target.value })
                }
              />

              <input
                type="date"
                placeholder="Admission Date"
                className="rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-sky-500"
                value={singleForm.admissionDate}
                onChange={(e) =>
                  setSingleForm({ ...singleForm, admissionDate: e.target.value })
                }
              />

              <input
                type="text"
                placeholder="Residence"
                className="rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-sky-500"
                value={singleForm.residence}
                onChange={(e) =>
                  setSingleForm({ ...singleForm, residence: e.target.value })
                }
              />

              <input
                type="text"
                placeholder="Parent Name"
                className="rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-sky-500"
                value={singleForm.parentName}
                onChange={(e) =>
                  setSingleForm({ ...singleForm, parentName: e.target.value })
                }
              />

              <input
                type="text"
                placeholder="Parent Phone"
                className="rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-sky-500"
                value={singleForm.parentPhone}
                onChange={(e) =>
                  setSingleForm({ ...singleForm, parentPhone: e.target.value })
                }
              />

              <input
                type="text"
                placeholder="Guardian Name"
                className="rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-sky-500"
                value={singleForm.guardianName}
                onChange={(e) =>
                  setSingleForm({ ...singleForm, guardianName: e.target.value })
                }
              />

              <input
                type="text"
                placeholder="Guardian Phone"
                className="rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-sky-500"
                value={singleForm.guardianPhone}
                onChange={(e) =>
                  setSingleForm({ ...singleForm, guardianPhone: e.target.value })
                }
              />

              <input
                type="text"
                placeholder="Emergency Contact Name"
                className="rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-sky-500"
                value={singleForm.emergencyContactName}
                onChange={(e) =>
                  setSingleForm({
                    ...singleForm,
                    emergencyContactName: e.target.value,
                  })
                }
              />

              <input
                type="text"
                placeholder="Emergency Contact Phone"
                className="rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-sky-500"
                value={singleForm.emergencyContactPhone}
                onChange={(e) =>
                  setSingleForm({
                    ...singleForm,
                    emergencyContactPhone: e.target.value,
                  })
                }
              />

              <div className="md:col-span-3">
                <SDSFileUpload
                  label="Student Photo"
                  value={singleForm.photoUrl}
                  accept="image/*"
                  folder="jsms/sds/student-photos"
                  onUploaded={(url) => setSingleForm({ ...singleForm, photoUrl: url })}
                />
              </div>

              <textarea
                placeholder="Medical Notes"
                rows={4}
                className="rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-sky-500 md:col-span-3"
                value={singleForm.medicalNotes}
                onChange={(e) =>
                  setSingleForm({ ...singleForm, medicalNotes: e.target.value })
                }
              />
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setShowSingleModal(false)}
                className="rounded-xl bg-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-300"
                disabled={busy}
              >
                Cancel
              </button>
              <button
                onClick={handleAddStudent}
                className="rounded-xl bg-sky-500 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-600"
                disabled={busy}
              >
                {busy ? "Saving..." : "Save Student"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showBulkModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-lg">
            <h2 className="mb-1 text-lg font-bold text-gray-800">Bulk Add Students</h2>
            <p className="mb-5 text-sm text-gray-500">
              Select one class, then enter one student per line.
            </p>

            <div className="space-y-4">
              <select
                className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-sky-500"
                value={bulkClassId}
                onChange={(e) => {
                  const classRow = getClassById(e.target.value);
                  setBulkClassId(e.target.value);
                  setBulkClassName(classRow?.class_name || "");
                }}
              >
                <option value="">Select Class</option>
                {classes.map((classItem) => (
                  <option key={classItem.id} value={classItem.id}>
                    {classItem.class_name}
                  </option>
                ))}
              </select>

              <textarea
                rows={10}
                placeholder="Enter one student name per line"
                className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-sky-500"
                value={bulkText}
                onChange={(e) => setBulkText(e.target.value)}
              />
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setShowBulkModal(false)}
                className="rounded-xl bg-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-300"
                disabled={busy}
              >
                Cancel
              </button>
              <button
                onClick={handleBulkAdd}
                className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-600"
                disabled={busy}
              >
                {busy ? "Saving..." : "Save Bulk Students"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showEditModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-2xl bg-white p-6 shadow-lg">
            <h2 className="mb-1 text-lg font-bold text-gray-800">Edit Student</h2>
            <p className="mb-5 text-sm text-gray-500">
              You can edit student details, but the student ID cannot be changed.
            </p>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <input
                type="text"
                value={editForm.studentId}
                disabled
                className="rounded-xl border border-gray-200 bg-gray-100 px-4 py-3 text-gray-500 outline-none"
              />

              <div></div>
              <div></div>

              <input
                type="text"
                placeholder="First Name"
                className="rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-sky-500"
                value={editForm.firstName}
                onChange={(e) =>
                  setEditForm({ ...editForm, firstName: e.target.value })
                }
              />

              <input
                type="text"
                placeholder="Other Name"
                className="rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-sky-500"
                value={editForm.otherName}
                onChange={(e) =>
                  setEditForm({ ...editForm, otherName: e.target.value })
                }
              />

              <input
                type="text"
                placeholder="Last Name"
                className="rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-sky-500"
                value={editForm.lastName}
                onChange={(e) =>
                  setEditForm({ ...editForm, lastName: e.target.value })
                }
              />

              <select
                className="rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-sky-500"
                value={editForm.classId}
                onChange={(e) => {
                  const classRow = getClassById(e.target.value);
                  setEditForm({
                    ...editForm,
                    classId: e.target.value,
                    className: classRow?.class_name || "",
                  });
                }}
              >
                <option value="">Select Class</option>
                {classes.map((classItem) => (
                  <option key={classItem.id} value={classItem.id}>
                    {classItem.class_name}
                  </option>
                ))}
              </select>

              <select
                className="rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-sky-500"
                value={editForm.gender}
                onChange={(e) =>
                  setEditForm({ ...editForm, gender: e.target.value })
                }
              >
                <option value="">Select Gender</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
              </select>

              <select
                className="rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-sky-500"
                value={editForm.status}
                onChange={(e) =>
                  setEditForm({ ...editForm, status: e.target.value })
                }
              >
                <option value="Active">Active</option>
                <option value="Transferred">Transferred</option>
                <option value="Completed">Completed</option>
                <option value="Inactive">Inactive</option>
              </select>

              <input
                type="date"
                className="rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-sky-500"
                value={editForm.dateOfBirth}
                onChange={(e) =>
                  setEditForm({ ...editForm, dateOfBirth: e.target.value })
                }
              />

              <input
                type="date"
                className="rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-sky-500"
                value={editForm.admissionDate}
                onChange={(e) =>
                  setEditForm({ ...editForm, admissionDate: e.target.value })
                }
              />

              <input
                type="text"
                placeholder="Residence"
                className="rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-sky-500"
                value={editForm.residence}
                onChange={(e) =>
                  setEditForm({ ...editForm, residence: e.target.value })
                }
              />

              <input
                type="text"
                placeholder="Parent Name"
                className="rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-sky-500"
                value={editForm.parentName}
                onChange={(e) =>
                  setEditForm({ ...editForm, parentName: e.target.value })
                }
              />

              <input
                type="text"
                placeholder="Parent Phone"
                className="rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-sky-500"
                value={editForm.parentPhone}
                onChange={(e) =>
                  setEditForm({ ...editForm, parentPhone: e.target.value })
                }
              />

              <input
                type="text"
                placeholder="Guardian Name"
                className="rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-sky-500"
                value={editForm.guardianName}
                onChange={(e) =>
                  setEditForm({ ...editForm, guardianName: e.target.value })
                }
              />

              <input
                type="text"
                placeholder="Guardian Phone"
                className="rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-sky-500"
                value={editForm.guardianPhone}
                onChange={(e) =>
                  setEditForm({ ...editForm, guardianPhone: e.target.value })
                }
              />

              <input
                type="text"
                placeholder="Emergency Contact Name"
                className="rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-sky-500"
                value={editForm.emergencyContactName}
                onChange={(e) =>
                  setEditForm({
                    ...editForm,
                    emergencyContactName: e.target.value,
                  })
                }
              />

              <input
                type="text"
                placeholder="Emergency Contact Phone"
                className="rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-sky-500"
                value={editForm.emergencyContactPhone}
                onChange={(e) =>
                  setEditForm({
                    ...editForm,
                    emergencyContactPhone: e.target.value,
                  })
                }
              />

              <div className="md:col-span-3">
                <SDSFileUpload
                  label="Student Photo"
                  value={editForm.photoUrl}
                  accept="image/*"
                  folder="jsms/sds/student-photos"
                  onUploaded={(url) => setEditForm({ ...editForm, photoUrl: url })}
                />
              </div>

              <textarea
                placeholder="Medical Notes"
                rows={4}
                className="rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-sky-500 md:col-span-3"
                value={editForm.medicalNotes}
                onChange={(e) =>
                  setEditForm({ ...editForm, medicalNotes: e.target.value })
                }
              />
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setShowEditModal(false)}
                className="rounded-xl bg-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-300"
                disabled={busy}
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEdit}
                className="rounded-xl bg-sky-500 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-600"
                disabled={busy}
              >
                {busy ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
