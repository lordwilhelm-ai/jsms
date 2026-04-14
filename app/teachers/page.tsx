"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type Teacher = {
  id: string;
  teacher_id: string;
  full_name: string;
  username: string;
  phone: string;
  role: string;
  photo_url: string | null;
  signature_url: string | null;
};

type ClassItem = {
  id: string;
  class_name: string;
  class_order: number;
  level: string;
};

type SubjectItem = {
  id: string;
  subject_name: string;
  subject_order: number;
};

export default function TeachersPage() {
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [subjects, setSubjects] = useState<SubjectItem[]>([]);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const [searchText, setSearchText] = useState("");
  const [roleFilter, setRoleFilter] = useState("All");

  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);

  const [addForm, setAddForm] = useState({
    fullName: "",
    username: "",
    phone: "",
    role: "teacher",
    password: "",
    photoUrl: "",
    signatureUrl: "",
    selectedClassIds: [] as string[],
    selectedSubjectIds: [] as string[],
  });

  const [editForm, setEditForm] = useState({
    id: "",
    teacherId: "",
    fullName: "",
    username: "",
    phone: "",
    role: "teacher",
    photoUrl: "",
    signatureUrl: "",
    newPassword: "",
    selectedClassIds: [] as string[],
    selectedSubjectIds: [] as string[],
  });

  const [uploadingAddPhoto, setUploadingAddPhoto] = useState(false);
  const [uploadingAddSignature, setUploadingAddSignature] = useState(false);
  const [uploadingEditPhoto, setUploadingEditPhoto] = useState(false);
  const [uploadingEditSignature, setUploadingEditSignature] = useState(false);

  const filteredTeachers = useMemo(() => {
    const roleFiltered =
      roleFilter === "All"
        ? teachers
        : teachers.filter((teacher) => teacher.role === roleFilter);

    const query = searchText.trim().toLowerCase();
    if (!query) return roleFiltered;

    return roleFiltered.filter((teacher) => {
      return (
        teacher.full_name.toLowerCase().includes(query) ||
        teacher.username.toLowerCase().includes(query) ||
        teacher.phone.toLowerCase().includes(query) ||
        teacher.teacher_id.toLowerCase().includes(query) ||
        teacher.role.toLowerCase().includes(query)
      );
    });
  }, [teachers, roleFilter, searchText]);

  const resetAddForm = () => {
    setAddForm({
      fullName: "",
      username: "",
      phone: "",
      role: "teacher",
      password: "",
      photoUrl: "",
      signatureUrl: "",
      selectedClassIds: [],
      selectedSubjectIds: [],
    });
  };

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
        error instanceof Error ? `Error: ${error.message}` : "Error uploading signature."
      );
    }
  }

  async function handleEditPhotoUpload(file: File) {
    try {
      const url = await uploadImageToCloudinary(file, setUploadingEditPhoto);
      setEditForm((prev) => ({ ...prev, photoUrl: url }));
      setMessage("Teacher photo uploaded successfully.");
    } catch (error) {
      setMessage(
        error instanceof Error ? `Error: ${error.message}` : "Error uploading photo."
      );
    }
  }

  async function handleEditSignatureUpload(file: File) {
    try {
      const url = await uploadImageToCloudinary(file, setUploadingEditSignature);
      setEditForm((prev) => ({ ...prev, signatureUrl: url }));
      setMessage("Signature uploaded successfully.");
    } catch (error) {
      setMessage(
        error instanceof Error ? `Error: ${error.message}` : "Error uploading signature."
      );
    }
  }

  async function fetchAll() {
    setLoading(true);
    setMessage("");

    try {
      const [teachersRes, classesRes, subjectsRes] = await Promise.all([
        supabase
          .from("teachers")
          .select(
            "id, teacher_id, full_name, username, phone, role, photo_url, signature_url"
          )
          .order("created_at", { ascending: false }),
        supabase
          .from("classes")
          .select("id, class_name, class_order, level")
          .order("class_order", { ascending: true }),
        supabase
          .from("subjects")
          .select("id, subject_name, subject_order")
          .order("subject_order", { ascending: true }),
      ]);

      if (teachersRes.error) throw teachersRes.error;
      if (classesRes.error) throw classesRes.error;
      if (subjectsRes.error) throw subjectsRes.error;

      setTeachers((teachersRes.data as Teacher[]) || []);
      setClasses((classesRes.data as ClassItem[]) || []);
      setSubjects((subjectsRes.data as SubjectItem[]) || []);
    } catch (error) {
      console.error(error);
      setMessage("Error: Failed to load teacher data.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchAll();
  }, []);

  function toggleSelection(
    current: string[],
    value: string,
    setter: (next: string[]) => void
  ) {
    if (current.includes(value)) {
      setter(current.filter((item) => item !== value));
    } else {
      setter([...current, value]);
    }
  }

  async function loadTeacherAssignments(teacherId: string) {
    try {
      const response = await fetch(
        `/api/teacher-assignments/get?teacher_id=${teacherId}`
      );
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to load assignments.");
      }

      return {
        classIds: data.class_ids || [],
        subjectIds: data.subject_ids || [],
      };
    } catch (error) {
      console.error(error);
      return {
        classIds: [],
        subjectIds: [],
      };
    }
  }

  async function handleAddTeacher() {
    if (
      !addForm.fullName ||
      !addForm.username ||
      !addForm.phone ||
      !addForm.password
    ) {
      alert("Please fill full name, username, phone and password.");
      return;
    }

    setBusy(true);
    setMessage("");

    try {
      const createResponse = await fetch("/api/teachers/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fullName: addForm.fullName,
          username: addForm.username,
          phone: addForm.phone,
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

      await fetchAll();

      const createdTeacher = await supabase
        .from("teachers")
        .select("id")
        .eq("username", addForm.username.trim().toLowerCase())
        .single();

      if (createdTeacher.data?.id) {
        const assignResponse = await fetch("/api/teacher-assignments/save", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            teacher_id: createdTeacher.data.id,
            class_ids: addForm.selectedClassIds,
            subject_ids: addForm.selectedSubjectIds,
          }),
        });

        const assignData = await assignResponse.json();

        if (!assignResponse.ok) {
          throw new Error(
            assignData.error || "Teacher created, but assignments failed."
          );
        }
      }

      await fetchAll();
      setShowAddModal(false);
      resetAddForm();
      setMessage("Teacher added successfully.");
    } catch (error) {
      console.error(error);
      setMessage(
        error instanceof Error ? `Error: ${error.message}` : "Error adding teacher."
      );
    } finally {
      setBusy(false);
    }
  }

  async function openEditModal(teacher: Teacher) {
    const assignments = await loadTeacherAssignments(teacher.id);

    setEditForm({
      id: teacher.id,
      teacherId: teacher.teacher_id,
      fullName: teacher.full_name,
      username: teacher.username,
      phone: teacher.phone,
      role: teacher.role,
      photoUrl: teacher.photo_url || "",
      signatureUrl: teacher.signature_url || "",
      newPassword: "",
      selectedClassIds: assignments.classIds,
      selectedSubjectIds: assignments.subjectIds,
    });

    setShowEditModal(true);
  }

  async function handleSaveEdit() {
    if (!editForm.fullName || !editForm.username || !editForm.phone) {
      alert("Please fill full name, username and phone.");
      return;
    }

    setBusy(true);
    setMessage("");

    try {
      const updateResponse = await fetch("/api/teachers/update", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: editForm.id,
          fullName: editForm.fullName,
          username: editForm.username,
          phone: editForm.phone,
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

      const assignmentResponse = await fetch("/api/teacher-assignments/save", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          teacher_id: editForm.id,
          class_ids: editForm.selectedClassIds,
          subject_ids: editForm.selectedSubjectIds,
        }),
      });

      const assignmentData = await assignmentResponse.json();

      if (!assignmentResponse.ok) {
        throw new Error(assignmentData.error || "Failed to save assignments.");
      }

      if (editForm.newPassword.trim()) {
        const passwordResponse = await fetch("/api/teachers/reset-password", {
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
      setShowEditModal(false);
      setMessage("Teacher updated successfully.");
    } catch (error) {
      console.error(error);
      setMessage(
        error instanceof Error ? `Error: ${error.message}` : "Error updating teacher."
      );
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
      const response = await fetch("/api/teachers/delete", {
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
    } catch (error) {
      console.error(error);
      setMessage(
        error instanceof Error ? `Error: ${error.message}` : "Error deleting teacher."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        background:
          "linear-gradient(135deg, #fffdf2 0%, #fff9db 25%, #fef3c7 55%, #fde68a 100%)",
        fontFamily: "Arial, sans-serif",
        padding: "18px",
      }}
    >
      <div style={{ maxWidth: "1400px", margin: "0 auto" }}>
        <div
          style={{
            background: "linear-gradient(135deg, #111827 0%, #1f2937 100%)",
            borderRadius: "30px",
            color: "#fff",
            padding: "26px 24px",
            marginBottom: "22px",
            boxShadow: "0 18px 40px rgba(0,0,0,0.14)",
          }}
        >
          <p
            style={{
              margin: 0,
              fontSize: "11px",
              textTransform: "uppercase",
              letterSpacing: "1px",
              color: "rgba(255,255,255,0.72)",
            }}
          >
            Teacher Management
          </p>

          <h1
            style={{
              margin: "10px 0 10px",
              fontSize: "28px",
              lineHeight: 1.15,
            }}
          >
            Teachers Module
          </h1>

          <p
            style={{
              margin: 0,
              maxWidth: "820px",
              color: "rgba(255,255,255,0.85)",
              lineHeight: 1.7,
              fontSize: "13px",
            }}
          >
            Add teachers, edit staff details, reset passwords, delete teachers,
            and assign classes and subjects from one page.
          </p>
        </div>

        {message && (
          <div
            style={{
              background: "#ffffff",
              borderRadius: "16px",
              padding: "14px 16px",
              marginBottom: "18px",
              border: message.startsWith("Error:")
                ? "1px solid #fecaca"
                : "1px solid #bbf7d0",
              color: message.startsWith("Error:") ? "#b91c1c" : "#065f46",
              fontSize: "13px",
              fontWeight: 600,
            }}
          >
            {message}
          </div>
        )}

        <div
          style={{
            background: "rgba(255,255,255,0.96)",
            borderRadius: "24px",
            padding: "18px",
            boxShadow: "0 10px 28px rgba(0,0,0,0.08)",
            border: "1px solid rgba(245,158,11,0.12)",
            marginBottom: "18px",
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "14px",
            }}
          >
            <div
              style={{
                display: "flex",
                gap: "12px",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
              }}
            >
              <div>
                <p
                  style={{
                    margin: 0,
                    fontSize: "16px",
                    fontWeight: 800,
                    color: "#111827",
                  }}
                >
                  Teacher Controls
                </p>
                <p
                  style={{
                    margin: "4px 0 0",
                    fontSize: "12px",
                    color: "#6b7280",
                  }}
                >
                  Search, filter, add, edit, delete, reset passwords, and assign classes and subjects.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setShowAddModal(true)}
                disabled={busy}
                style={{
                  border: "none",
                  background: "#111827",
                  color: "#ffffff",
                  borderRadius: "14px",
                  padding: "12px 16px",
                  fontWeight: 700,
                  fontSize: "13px",
                  cursor: busy ? "not-allowed" : "pointer",
                  opacity: busy ? 0.7 : 1,
                }}
              >
                + Add Teacher
              </button>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1.2fr 220px",
                gap: "12px",
              }}
            >
              <input
                type="text"
                placeholder="Search teacher by name, username, phone, role or ID"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                style={inputStyle}
              />

              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                style={inputStyle}
              >
                <option value="All">All Roles</option>
                <option value="teacher">Teacher</option>
                <option value="headmaster">Headmaster</option>
                <option value="admin">Admin</option>
              </select>
            </div>
          </div>
        </div>

        {loading ? (
          <div style={boxStyle}>Loading teachers...</div>
        ) : filteredTeachers.length === 0 ? (
          <div style={boxStyle}>No teachers found.</div>
        ) : (
          <div
            style={{
              display: "grid",
              gap: "16px",
            }}
          >
            {filteredTeachers.map((teacher) => (
              <div
                key={teacher.id}
                style={{
                  background: "rgba(255,255,255,0.96)",
                  borderRadius: "24px",
                  padding: "18px",
                  boxShadow: "0 10px 28px rgba(0,0,0,0.08)",
                  border: "1px solid rgba(245,158,11,0.12)",
                }}
              >
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "80px 1fr auto",
                    gap: "16px",
                    alignItems: "center",
                  }}
                >
                  <div
                    style={{
                      width: "72px",
                      height: "72px",
                      borderRadius: "20px",
                      overflow: "hidden",
                      background:
                        "linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "26px",
                    }}
                  >
                    {teacher.photo_url ? (
                      <img
                        src={teacher.photo_url}
                        alt={teacher.full_name}
                        style={{
                          width: "100%",
                          height: "100%",
                          objectFit: "cover",
                        }}
                      />
                    ) : (
                      "👨‍🏫"
                    )}
                  </div>

                  <div>
                    <p
                      style={{
                        margin: 0,
                        fontSize: "18px",
                        fontWeight: 800,
                        color: "#111827",
                      }}
                    >
                      {teacher.full_name}
                    </p>

                    <p
                      style={{
                        margin: "6px 0 0",
                        fontSize: "13px",
                        color: "#6b7280",
                      }}
                    >
                      {teacher.teacher_id} • @{teacher.username} • {teacher.phone}
                    </p>

                    <p
                      style={{
                        margin: "6px 0 0",
                        fontSize: "12px",
                        color: "#b45309",
                        fontWeight: 700,
                        textTransform: "capitalize",
                      }}
                    >
                      {teacher.role}
                    </p>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      gap: "8px",
                      flexWrap: "wrap",
                      justifyContent: "flex-end",
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => openEditModal(teacher)}
                      disabled={busy}
                      style={actionButtonStyle}
                    >
                      Edit
                    </button>

                    <button
                      type="button"
                      onClick={() => handleDeleteTeacher(teacher.id)}
                      disabled={busy}
                      style={dangerButtonStyle}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {showAddModal && (
          <div style={modalOverlayStyle}>
            <div style={modalCardStyle}>
              <h2 style={modalTitleStyle}>Add Teacher</h2>
              <p style={modalSubtitleStyle}>
                Create a teacher, headmaster, or admin and assign classes and subjects.
              </p>

              <div style={formGridStyle}>
                <input
                  type="text"
                  placeholder="Full Name"
                  style={inputStyle}
                  value={addForm.fullName}
                  onChange={(e) =>
                    setAddForm({ ...addForm, fullName: e.target.value })
                  }
                />

                <input
                  type="text"
                  placeholder="Username"
                  style={inputStyle}
                  value={addForm.username}
                  onChange={(e) =>
                    setAddForm({ ...addForm, username: e.target.value })
                  }
                />

                <input
                  type="text"
                  placeholder="Phone"
                  style={inputStyle}
                  value={addForm.phone}
                  onChange={(e) =>
                    setAddForm({ ...addForm, phone: e.target.value })
                  }
                />

                <select
                  style={inputStyle}
                  value={addForm.role}
                  onChange={(e) =>
                    setAddForm({ ...addForm, role: e.target.value })
                  }
                >
                  <option value="teacher">Teacher</option>
                  <option value="headmaster">Headmaster</option>
                  <option value="admin">Admin</option>
                </select>

                <input
                  type="password"
                  placeholder="Password"
                  style={inputStyle}
                  value={addForm.password}
                  onChange={(e) =>
                    setAddForm({ ...addForm, password: e.target.value })
                  }
                />

                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  <label style={labelStyle}>Upload Teacher Photo</label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleAddPhotoUpload(file);
                    }}
                    style={inputStyle}
                  />
                  {uploadingAddPhoto && (
                    <span style={helperTextStyle}>Uploading photo...</span>
                  )}
                </div>

                {addForm.photoUrl && (
                  <div style={previewBlockStyle}>
                    <p style={previewTitleStyle}>Photo Preview</p>
                    <img
                      src={addForm.photoUrl}
                      alt="Teacher Preview"
                      style={previewImageStyle}
                    />
                  </div>
                )}

                {addForm.role === "headmaster" && (
                  <div
                    style={{
                      ...previewBlockStyle,
                      gridColumn: "1 / -1",
                    }}
                  >
                    <p style={previewTitleStyle}>Upload Headmaster Signature</p>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleAddSignatureUpload(file);
                      }}
                      style={inputStyle}
                    />
                    {uploadingAddSignature && (
                      <span style={helperTextStyle}>Uploading signature...</span>
                    )}
                    {addForm.signatureUrl && (
                      <img
                        src={addForm.signatureUrl}
                        alt="Signature Preview"
                        style={signatureImageStyle}
                      />
                    )}
                  </div>
                )}
              </div>

              <div style={assignBlockStyle}>
                <p style={assignTitleStyle}>Assign Classes</p>
                <div style={chipGridStyle}>
                  {classes.map((item) => (
                    <label key={item.id} style={chipLabelStyle}>
                      <input
                        type="checkbox"
                        checked={addForm.selectedClassIds.includes(item.id)}
                        onChange={() =>
                          toggleSelection(
                            addForm.selectedClassIds,
                            item.id,
                            (next) =>
                              setAddForm({ ...addForm, selectedClassIds: next })
                          )
                        }
                      />
                      <span>{item.class_name}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div style={assignBlockStyle}>
                <p style={assignTitleStyle}>Assign Subjects</p>
                <div style={chipGridStyle}>
                  {subjects.map((item) => (
                    <label key={item.id} style={chipLabelStyle}>
                      <input
                        type="checkbox"
                        checked={addForm.selectedSubjectIds.includes(item.id)}
                        onChange={() =>
                          toggleSelection(
                            addForm.selectedSubjectIds,
                            item.id,
                            (next) =>
                              setAddForm({ ...addForm, selectedSubjectIds: next })
                          )
                        }
                      />
                      <span>{item.subject_name}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div style={modalActionsStyle}>
                <button
                  type="button"
                  onClick={() => {
                    setShowAddModal(false);
                    resetAddForm();
                  }}
                  disabled={busy}
                  style={secondaryButtonStyle}
                >
                  Cancel
                </button>

                <button
                  type="button"
                  onClick={handleAddTeacher}
                  disabled={busy}
                  style={actionButtonStyle}
                >
                  {busy ? "Saving..." : "Save Teacher"}
                </button>
              </div>
            </div>
          </div>
        )}

        {showEditModal && (
          <div style={modalOverlayStyle}>
            <div style={modalCardStyle}>
              <h2 style={modalTitleStyle}>Edit Teacher</h2>
              <p style={modalSubtitleStyle}>
                Update teacher details, reset password, and change class and subject assignments.
              </p>

              <div style={formGridStyle}>
                <input
                  type="text"
                  placeholder="Teacher ID"
                  style={{
                    ...inputStyle,
                    background: "#f3f4f6",
                    color: "#6b7280",
                  }}
                  value={editForm.teacherId}
                  disabled
                />

                <input
                  type="text"
                  placeholder="Full Name"
                  style={inputStyle}
                  value={editForm.fullName}
                  onChange={(e) =>
                    setEditForm({ ...editForm, fullName: e.target.value })
                  }
                />

                <input
                  type="text"
                  placeholder="Username"
                  style={inputStyle}
                  value={editForm.username}
                  onChange={(e) =>
                    setEditForm({ ...editForm, username: e.target.value })
                  }
                />

                <input
                  type="text"
                  placeholder="Phone"
                  style={inputStyle}
                  value={editForm.phone}
                  onChange={(e) =>
                    setEditForm({ ...editForm, phone: e.target.value })
                  }
                />

                <select
                  style={inputStyle}
                  value={editForm.role}
                  onChange={(e) =>
                    setEditForm({ ...editForm, role: e.target.value })
                  }
                >
                  <option value="teacher">Teacher</option>
                  <option value="headmaster">Headmaster</option>
                  <option value="admin">Admin</option>
                </select>

                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  <label style={labelStyle}>Upload Teacher Photo</label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleEditPhotoUpload(file);
                    }}
                    style={inputStyle}
                  />
                  {uploadingEditPhoto && (
                    <span style={helperTextStyle}>Uploading photo...</span>
                  )}
                </div>

                {editForm.photoUrl && (
                  <div style={previewBlockStyle}>
                    <p style={previewTitleStyle}>Photo Preview</p>
                    <img
                      src={editForm.photoUrl}
                      alt="Teacher Preview"
                      style={previewImageStyle}
                    />
                  </div>
                )}

                {editForm.role === "headmaster" && (
                  <div
                    style={{
                      ...previewBlockStyle,
                      gridColumn: "1 / -1",
                    }}
                  >
                    <p style={previewTitleStyle}>Upload Headmaster Signature</p>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleEditSignatureUpload(file);
                      }}
                      style={inputStyle}
                    />
                    {uploadingEditSignature && (
                      <span style={helperTextStyle}>Uploading signature...</span>
                    )}
                    {editForm.signatureUrl && (
                      <img
                        src={editForm.signatureUrl}
                        alt="Signature Preview"
                        style={signatureImageStyle}
                      />
                    )}
                  </div>
                )}

                <input
                  type="password"
                  placeholder="New Password (optional)"
                  style={{ ...inputStyle, gridColumn: "1 / -1" }}
                  value={editForm.newPassword}
                  onChange={(e) =>
                    setEditForm({ ...editForm, newPassword: e.target.value })
                  }
                />
              </div>

              <div style={assignBlockStyle}>
                <p style={assignTitleStyle}>Assigned Classes</p>
                <div style={chipGridStyle}>
                  {classes.map((item) => (
                    <label key={item.id} style={chipLabelStyle}>
                      <input
                        type="checkbox"
                        checked={editForm.selectedClassIds.includes(item.id)}
                        onChange={() =>
                          toggleSelection(
                            editForm.selectedClassIds,
                            item.id,
                            (next) =>
                              setEditForm({ ...editForm, selectedClassIds: next })
                          )
                        }
                      />
                      <span>{item.class_name}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div style={assignBlockStyle}>
                <p style={assignTitleStyle}>Assigned Subjects</p>
                <div style={chipGridStyle}>
                  {subjects.map((item) => (
                    <label key={item.id} style={chipLabelStyle}>
                      <input
                        type="checkbox"
                        checked={editForm.selectedSubjectIds.includes(item.id)}
                        onChange={() =>
                          toggleSelection(
                            editForm.selectedSubjectIds,
                            item.id,
                            (next) =>
                              setEditForm({
                                ...editForm,
                                selectedSubjectIds: next,
                              })
                          )
                        }
                      />
                      <span>{item.subject_name}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div style={modalActionsStyle}>
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  disabled={busy}
                  style={secondaryButtonStyle}
                >
                  Cancel
                </button>

                <button
                  type="button"
                  onClick={handleSaveEdit}
                  disabled={busy}
                  style={actionButtonStyle}
                >
                  {busy ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "12px",
  borderRadius: "10px",
  border: "1px solid #d1d5db",
  outline: "none",
  fontSize: "14px",
};

const boxStyle: React.CSSProperties = {
  background: "#fff",
  borderRadius: "20px",
  padding: "20px",
  boxShadow: "0 12px 30px rgba(0,0,0,0.08)",
};

const actionButtonStyle: React.CSSProperties = {
  border: "none",
  background: "#111827",
  color: "#ffffff",
  borderRadius: "14px",
  padding: "11px 14px",
  fontWeight: 700,
  fontSize: "13px",
  cursor: "pointer",
};

const secondaryButtonStyle: React.CSSProperties = {
  border: "1px solid #d1d5db",
  background: "#ffffff",
  color: "#111827",
  borderRadius: "14px",
  padding: "11px 14px",
  fontWeight: 700,
  fontSize: "13px",
  cursor: "pointer",
};

const dangerButtonStyle: React.CSSProperties = {
  border: "none",
  background: "#b91c1c",
  color: "#ffffff",
  borderRadius: "14px",
  padding: "11px 14px",
  fontWeight: 700,
  fontSize: "13px",
  cursor: "pointer",
};

const modalOverlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 50,
  background: "rgba(0,0,0,0.4)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "16px",
};

const modalCardStyle: React.CSSProperties = {
  width: "100%",
  maxWidth: "1100px",
  maxHeight: "90vh",
  overflowY: "auto",
  background: "#ffffff",
  borderRadius: "24px",
  padding: "24px",
  boxShadow: "0 18px 40px rgba(0,0,0,0.16)",
};

const modalTitleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: "20px",
  fontWeight: 800,
  color: "#111827",
};

const modalSubtitleStyle: React.CSSProperties = {
  margin: "8px 0 18px",
  fontSize: "13px",
  color: "#6b7280",
};

const formGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: "12px",
};

const assignBlockStyle: React.CSSProperties = {
  marginTop: "18px",
  background: "#f9fafb",
  border: "1px solid #e5e7eb",
  borderRadius: "18px",
  padding: "14px",
};

const assignTitleStyle: React.CSSProperties = {
  margin: "0 0 10px",
  fontSize: "14px",
  fontWeight: 800,
  color: "#111827",
};

const chipGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: "10px",
};

const chipLabelStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "10px",
  background: "#ffffff",
  border: "1px solid #e5e7eb",
  borderRadius: "14px",
  padding: "10px 12px",
  fontSize: "13px",
  color: "#111827",
};

const modalActionsStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
  gap: "10px",
  marginTop: "20px",
};

const previewBlockStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "10px",
  padding: "12px",
  borderRadius: "16px",
  background: "#f9fafb",
  border: "1px solid #e5e7eb",
};

const previewTitleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: "13px",
  fontWeight: 700,
  color: "#111827",
};

const previewImageStyle: React.CSSProperties = {
  width: "100px",
  height: "100px",
  objectFit: "cover",
  borderRadius: "14px",
  border: "1px solid #d1d5db",
};

const signatureImageStyle: React.CSSProperties = {
  width: "180px",
  height: "80px",
  objectFit: "contain",
  borderRadius: "10px",
  border: "1px solid #d1d5db",
  background: "#ffffff",
  padding: "8px",
};

const helperTextStyle: React.CSSProperties = {
  fontSize: "12px",
  color: "#2563eb",
  fontWeight: 600,
};

const labelStyle: React.CSSProperties = {
  fontSize: "13px",
  fontWeight: 700,
  color: "#111827",
};
