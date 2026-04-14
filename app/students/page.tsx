"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";

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
  return {
    id: row.id,
    studentId: row.student_id,
    firstName: row.first_name || "",
    otherName: row.other_name || "",
    lastName: row.last_name || "",
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
    medicalNotes: row.medical_notes || "",
    status: row.status || "Active",
    photoUrl: row.photo_url || "",
    createdAt: row.created_at,
  };
}

export default function Students() {
  const [students, setStudents] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [showSingleModal, setShowSingleModal] = useState(false);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);

  const [selectedClassFilter, setSelectedClassFilter] = useState("All");
  const [searchText, setSearchText] = useState("");

  const [bulkDeleteMode, setBulkDeleteMode] = useState(false);
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);

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
      const fullName =
        `${student.firstName} ${student.otherName} ${student.lastName}`.toLowerCase();

      return (
        fullName.includes(query) ||
        String(student.studentId || "").toLowerCase().includes(query) ||
        String(student.className || "").toLowerCase().includes(query) ||
        String(student.parentName || "").toLowerCase().includes(query) ||
        String(student.guardianName || "").toLowerCase().includes(query)
      );
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
    const { data, error } = await supabase
      .from("classes")
      .select("*")
      .order("class_order", { ascending: true });

    if (error) {
      console.error(error);
      alert("Failed to load classes from Supabase.");
      return [];
    }

    setClasses(data || []);
    return data || [];
  };

  const fetchStudents = async () => {
    setLoading(true);

    const { data, error } = await supabase
      .from("students")
      .select("*")
      .order("created_at", { ascending: true });

    if (error) {
      console.error(error);
      alert("Failed to load students from Supabase.");
      setLoading(false);
      return;
    }

    setStudents((data || []).map(mapDbStudent));
    setLoading(false);
  };

  useEffect(() => {
    async function boot() {
      await fetchClasses();
      await fetchStudents();
    }

    boot();
  }, []);

  const getClassById = (id: string) => {
    return classes.find((item) => item.id === id) || null;
  };

  const getNextClass = (className: string) => {
    const ordered = [...classes].sort((a, b) => a.class_order - b.class_order);
    const currentIndex = ordered.findIndex((item) => item.class_name === className);

    if (currentIndex === -1) return null;
    if (currentIndex === ordered.length - 1) return null;

    return ordered[currentIndex + 1];
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

  const handlePromoteAll = async () => {
    if (students.length === 0) {
      alert("There are no students to promote.");
      return;
    }

    const confirmed = window.confirm(
      "Are you sure you want to promote all students? Final class students will leave the system."
    );

    if (!confirmed) return;

    setBusy(true);

    try {
      const studentsToDelete = students.filter(
        (student) => getNextClass(student.className) === null
      );

      const studentsToUpdate = students.filter(
        (student) => getNextClass(student.className) !== null
      );

      if (studentsToDelete.length > 0) {
        const deleteIds = studentsToDelete.map((student) => student.id);

        const { error: deleteError } = await supabase
          .from("students")
          .delete()
          .in("id", deleteIds);

        if (deleteError) throw deleteError;
      }

      for (const student of studentsToUpdate) {
        const nextClass = getNextClass(student.className);

        if (!nextClass) continue;

        const { error: updateError } = await supabase
          .from("students")
          .update({
            class_id: nextClass.id,
            class_name: nextClass.class_name,
          })
          .eq("id", student.id);

        if (updateError) throw updateError;
      }

      await fetchStudents();
      setSelectedClassFilter("All");
      setSelectedStudentIds([]);
      alert("Students promoted successfully.");
    } catch (error) {
      console.error(error);
      alert("Failed to promote students.");
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

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 rounded-2xl bg-white p-5 shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Students</h1>
          <p className="mt-1 text-sm text-gray-500">
            Add, bulk add, filter, search, edit, delete and promote students.
          </p>
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
            onClick={handlePromoteAll}
            className="rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600"
            disabled={busy || bulkDeleteMode}
          >
            Promote All
          </button>

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

      <div className="overflow-x-auto rounded-2xl bg-white shadow-sm">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-gray-50 text-gray-600">
            <tr>
              {bulkDeleteMode && (
                <th className="px-6 py-4 font-semibold">
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={handleSelectAllVisible}
                  />
                </th>
              )}
              <th className="px-6 py-4 font-semibold">Student ID</th>
              <th className="px-6 py-4 font-semibold">First Name</th>
              <th className="px-6 py-4 font-semibold">Other Name</th>
              <th className="px-6 py-4 font-semibold">Last Name</th>
              <th className="px-6 py-4 font-semibold">Class</th>
              <th className="px-6 py-4 font-semibold">Gender</th>
              <th className="px-6 py-4 font-semibold">Parent Name</th>
              <th className="px-6 py-4 font-semibold">Parent Phone</th>
              <th className="px-6 py-4 font-semibold">Guardian Name</th>
              <th className="px-6 py-4 font-semibold">Guardian Phone</th>
              <th className="px-6 py-4 font-semibold">Status</th>
              <th className="px-6 py-4 font-semibold">Actions</th>
            </tr>
          </thead>

          <tbody>
            {loading ? (
              <tr>
                <td
                  colSpan={bulkDeleteMode ? 13 : 12}
                  className="px-6 py-8 text-center text-gray-500"
                >
                  Loading students...
                </td>
              </tr>
            ) : filteredStudents.length === 0 ? (
              <tr>
                <td
                  colSpan={bulkDeleteMode ? 13 : 12}
                  className="px-6 py-8 text-center text-gray-500"
                >
                  No students found.
                </td>
              </tr>
            ) : (
              filteredStudents.map((student, index) => (
                <tr
                  key={student.id}
                  className={
                    index !== filteredStudents.length - 1
                      ? "border-b border-gray-100"
                      : ""
                  }
                >
                  {bulkDeleteMode && (
                    <td className="px-6 py-4">
                      <input
                        type="checkbox"
                        checked={selectedStudentIds.includes(student.id)}
                        onChange={() => toggleStudentSelection(student.id)}
                      />
                    </td>
                  )}

                  <td className="px-6 py-4 font-medium text-gray-800">
                    {student.studentId}
                  </td>
                  <td className="px-6 py-4 text-gray-700">{student.firstName}</td>
                  <td className="px-6 py-4 text-gray-700">{student.otherName || "-"}</td>
                  <td className="px-6 py-4 text-gray-700">{student.lastName}</td>
                  <td className="px-6 py-4 text-gray-700">{student.className}</td>
                  <td className="px-6 py-4 text-gray-700">{student.gender || "-"}</td>
                  <td className="px-6 py-4 text-gray-700">{student.parentName || "-"}</td>
                  <td className="px-6 py-4 text-gray-700">{student.parentPhone || "-"}</td>
                  <td className="px-6 py-4 text-gray-700">{student.guardianName || "-"}</td>
                  <td className="px-6 py-4 text-gray-700">{student.guardianPhone || "-"}</td>
                  <td className="px-6 py-4 text-gray-700">{student.status || "-"}</td>
                  <td className="px-6 py-4">
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => openEditModal(student)}
                        className="rounded-lg bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-200"
                        disabled={busy || bulkDeleteMode}
                      >
                        Edit
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

              <input
                type="text"
                placeholder="Photo URL"
                className="rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-sky-500 md:col-span-3"
                value={singleForm.photoUrl}
                onChange={(e) =>
                  setSingleForm({ ...singleForm, photoUrl: e.target.value })
                }
              />

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

              <input
                type="text"
                placeholder="Photo URL"
                className="rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-sky-500 md:col-span-3"
                value={editForm.photoUrl}
                onChange={(e) =>
                  setEditForm({ ...editForm, photoUrl: e.target.value })
                }
              />

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
