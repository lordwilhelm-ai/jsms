"use client";

import { useEffect, useMemo, useState } from "react";

type SubjectItem = {
  id: string;
  subject_name: string;
  subject_order: number;
};

type ClassItem = {
  id: string;
  class_name: string;
  class_order: number;
  level: string;
};

export default function SubjectsPage() {
  const [subjects, setSubjects] = useState<SubjectItem[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [selectedClassId, setSelectedClassId] = useState("");
  const [selectedSubjectIds, setSelectedSubjectIds] = useState<string[]>([]);

  const [customSubjectName, setCustomSubjectName] = useState("");
  const [customSubjectOrder, setCustomSubjectOrder] = useState("");

  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [savingLinks, setSavingLinks] = useState(false);
  const [addingSubject, setAddingSubject] = useState(false);
  const [message, setMessage] = useState("");

  async function loadSubjects() {
    const response = await fetch("/api/subjects/list");
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Failed to load subjects.");
    }

    setSubjects(data.subjects || []);
  }

  async function loadClasses() {
    const response = await fetch("/api/classes/list");
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Failed to load classes.");
    }

    const rows = data.classes || [];
    setClasses(rows);

    if (!selectedClassId && rows.length > 0) {
      setSelectedClassId(rows[0].id);
    }
  }

  async function loadClassSubjects(classId: string) {
    if (!classId) {
      setSelectedSubjectIds([]);
      return;
    }

    const response = await fetch(
      `/api/subjects/class-subjects/get?class_id=${classId}`
    );
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Failed to load class subjects.");
    }

    setSelectedSubjectIds(data.subject_ids || []);
  }

  async function loadAll() {
    setLoading(true);
    setMessage("");

    try {
      await Promise.all([loadSubjects(), loadClasses()]);
    } catch (error) {
      setMessage(
        error instanceof Error ? `Error: ${error.message}` : "Error loading page."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  useEffect(() => {
    if (selectedClassId) {
      loadClassSubjects(selectedClassId).catch((error) => {
        setMessage(
          error instanceof Error
            ? `Error: ${error.message}`
            : "Error loading class subjects."
        );
      });
    }
  }, [selectedClassId]);

  const selectedClass = useMemo(
    () => classes.find((c) => c.id === selectedClassId) || null,
    [classes, selectedClassId]
  );

  function toggleSubject(subjectId: string) {
    setSelectedSubjectIds((prev) =>
      prev.includes(subjectId)
        ? prev.filter((id) => id !== subjectId)
        : [...prev, subjectId]
    );
  }

  async function handleSeedOfficialSubjects() {
    setSeeding(true);
    setMessage("");

    try {
      const response = await fetch("/api/subjects/seed", {
        method: "POST",
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to load official subjects.");
      }

      setMessage(data.message || "Official subjects loaded successfully.");
      await loadSubjects();
      if (selectedClassId) {
        await loadClassSubjects(selectedClassId);
      }
    } catch (error) {
      setMessage(
        error instanceof Error ? `Error: ${error.message}` : "Error seeding subjects."
      );
    } finally {
      setSeeding(false);
    }
  }

  async function handleAddCustomSubject(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const cleanSubjectName = customSubjectName.trim();
    const cleanSubjectOrder = Number(customSubjectOrder || 1);

    if (!cleanSubjectName) {
      setMessage("Error: Subject name is required.");
      return;
    }

    if (!Number.isFinite(cleanSubjectOrder) || cleanSubjectOrder < 1) {
      setMessage("Error: Subject order must be 1 or more.");
      return;
    }

    setAddingSubject(true);
    setMessage("");

    try {
      const response = await fetch("/api/subjects/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: cleanSubjectName,
          order: cleanSubjectOrder,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to add subject.");
      }

      setCustomSubjectName("");
      setCustomSubjectOrder("");
      setMessage("Subject added successfully.");
      await loadSubjects();
    } catch (error) {
      setMessage(
        error instanceof Error ? `Error: ${error.message}` : "Error adding subject."
      );
    } finally {
      setAddingSubject(false);
    }
  }

  async function handleSaveClassSubjects() {
    if (!selectedClassId) {
      setMessage("Error: Select a class first.");
      return;
    }

    setSavingLinks(true);
    setMessage("");

    try {
      const response = await fetch("/api/subjects/class-subjects/save", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          class_id: selectedClassId,
          subject_ids: selectedSubjectIds,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to save class subjects.");
      }

      setMessage("Class subjects saved successfully.");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? `Error: ${error.message}`
          : "Error saving class subjects."
      );
    } finally {
      setSavingLinks(false);
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
      <div style={{ maxWidth: "1300px", margin: "0 auto" }}>
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
            Subjects
          </p>

          <h1
            style={{
              margin: "10px 0 10px",
              fontSize: "28px",
              lineHeight: 1.15,
            }}
          >
            Subject Management
          </h1>

          <p
            style={{
              margin: 0,
              maxWidth: "780px",
              color: "rgba(255,255,255,0.85)",
              lineHeight: 1.7,
              fontSize: "13px",
            }}
          >
            Manage the official subjects and assign them to classes on this same page.
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
            display: "grid",
            gridTemplateColumns: "1.1fr 1fr",
            gap: "18px",
            alignItems: "start",
          }}
        >
          <section
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
                display: "flex",
                gap: "12px",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "16px",
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
                  Official Subjects
                </p>
                <p
                  style={{
                    margin: "4px 0 0",
                    fontSize: "12px",
                    color: "#6b7280",
                  }}
                >
                  Load the official subjects, then add any extra custom ones.
                </p>
              </div>

              <button
                type="button"
                onClick={handleSeedOfficialSubjects}
                disabled={seeding}
                style={primaryButtonStyle}
              >
                {seeding ? "Loading..." : "Load Official Subjects"}
              </button>
            </div>

            <form
              onSubmit={handleAddCustomSubject}
              style={{
                display: "grid",
                gridTemplateColumns: "2fr 1fr auto",
                gap: "10px",
                marginBottom: "18px",
              }}
            >
              <div>
                <label style={labelStyle}>Custom Subject</label>
                <input
                  value={customSubjectName}
                  onChange={(e) => setCustomSubjectName(e.target.value)}
                  placeholder="Enter subject name"
                  style={inputStyle}
                />
              </div>

              <div>
                <label style={labelStyle}>Order</label>
                <input
                  type="number"
                  value={customSubjectOrder}
                  onChange={(e) => setCustomSubjectOrder(e.target.value)}
                  placeholder="1"
                  style={inputStyle}
                />
              </div>

              <div style={{ alignSelf: "end" }}>
                <button
                  type="submit"
                  disabled={addingSubject}
                  style={primaryButtonStyle}
                >
                  {addingSubject ? "Adding..." : "Add Subject"}
                </button>
              </div>
            </form>

            {loading ? (
              <div style={boxStyle}>Loading subjects...</div>
            ) : subjects.length === 0 ? (
              <div style={boxStyle}>No subjects found.</div>
            ) : (
              <div style={{ display: "grid", gap: "12px" }}>
                {subjects.map((item) => (
                  <EditableSubjectCard
                    key={item.id}
                    item={item}
                    onUpdated={loadSubjects}
                  />
                ))}
              </div>
            )}
          </section>

          <section
            style={{
              background: "rgba(255,255,255,0.96)",
              borderRadius: "24px",
              padding: "18px",
              boxShadow: "0 10px 28px rgba(0,0,0,0.08)",
              border: "1px solid rgba(245,158,11,0.12)",
            }}
          >
            <div style={{ marginBottom: "16px" }}>
              <p
                style={{
                  margin: 0,
                  fontSize: "16px",
                  fontWeight: 800,
                  color: "#111827",
                }}
              >
                Class Subject Setup
              </p>
              <p
                style={{
                  margin: "4px 0 0",
                  fontSize: "12px",
                  color: "#6b7280",
                }}
              >
                Choose a class, tick the subjects, then save.
              </p>
            </div>

            <div style={{ marginBottom: "16px" }}>
              <label style={labelStyle}>Select Class</label>
              <select
                value={selectedClassId}
                onChange={(e) => setSelectedClassId(e.target.value)}
                style={inputStyle}
              >
                <option value="">Choose class</option>
                {classes.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.class_name}
                  </option>
                ))}
              </select>
            </div>

            <div
              style={{
                background: "#f9fafb",
                borderRadius: "18px",
                padding: "14px",
                border: "1px solid #e5e7eb",
                marginBottom: "16px",
              }}
            >
              <p
                style={{
                  margin: 0,
                  fontSize: "13px",
                  fontWeight: 700,
                  color: "#111827",
                  marginBottom: "8px",
                }}
              >
                {selectedClass ? selectedClass.class_name : "No class selected"}
              </p>

              {selectedClass && (
                <p
                  style={{
                    margin: 0,
                    fontSize: "12px",
                    color: "#6b7280",
                  }}
                >
                  Level: {selectedClass.level}
                </p>
              )}
            </div>

            <div
              style={{
                display: "grid",
                gap: "10px",
                maxHeight: "560px",
                overflowY: "auto",
                paddingRight: "4px",
              }}
            >
              {subjects.map((item) => {
                const checked = selectedSubjectIds.includes(item.id);

                return (
                  <label
                    key={item.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "12px",
                      background: checked ? "#f0fdf4" : "#ffffff",
                      border: checked
                        ? "1px solid #86efac"
                        : "1px solid #e5e7eb",
                      borderRadius: "14px",
                      padding: "12px 14px",
                      cursor: "pointer",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleSubject(item.id)}
                    />

                    <div style={{ flex: 1 }}>
                      <p
                        style={{
                          margin: 0,
                          fontSize: "13px",
                          fontWeight: 700,
                          color: "#111827",
                        }}
                      >
                        {item.subject_name}
                      </p>
                      <p
                        style={{
                          margin: "4px 0 0",
                          fontSize: "11px",
                          color: "#6b7280",
                        }}
                      >
                        Order: {item.subject_order}
                      </p>
                    </div>
                  </label>
                );
              })}
            </div>

            <div style={{ marginTop: "16px" }}>
              <button
                type="button"
                onClick={handleSaveClassSubjects}
                disabled={savingLinks || !selectedClassId}
                style={{
                  ...primaryButtonStyle,
                  opacity: savingLinks || !selectedClassId ? 0.7 : 1,
                  cursor:
                    savingLinks || !selectedClassId ? "not-allowed" : "pointer",
                }}
              >
                {savingLinks ? "Saving..." : "Save Class Subjects"}
              </button>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}

function EditableSubjectCard({
  item,
  onUpdated,
}: {
  item: SubjectItem;
  onUpdated: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [subjectName, setSubjectName] = useState(item.subject_name);
  const [subjectOrder, setSubjectOrder] = useState(String(item.subject_order));
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState("");

  function resetForm() {
    setSubjectName(item.subject_name);
    setSubjectOrder(String(item.subject_order));
    setMessage("");
    setEditing(false);
  }

  async function handleSave() {
    setSaving(true);
    setMessage("");

    try {
      const response = await fetch("/api/subjects/update", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: item.id,
          subject_name: subjectName,
          subject_order: Number(subjectOrder),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to update subject.");
      }

      setMessage("Subject updated successfully.");
      setEditing(false);
      await onUpdated();
    } catch (error) {
      setMessage(
        error instanceof Error ? `Error: ${error.message}` : "Error updating subject."
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    const confirmed = window.confirm(
      `Delete ${item.subject_name}? This cannot be undone.`
    );

    if (!confirmed) return;

    setDeleting(true);
    setMessage("");

    try {
      const response = await fetch("/api/subjects/delete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: item.id,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to delete subject.");
      }

      setMessage("Subject deleted successfully.");
      await onUpdated();
    } catch (error) {
      setMessage(
        error instanceof Error ? `Error: ${error.message}` : "Error deleting subject."
      );
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div
      style={{
        background: "#ffffff",
        borderRadius: "18px",
        padding: "14px",
        border: "1px solid #e5e7eb",
      }}
    >
      {!editing ? (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "2fr 80px auto",
              gap: "12px",
              alignItems: "center",
            }}
          >
            <div>
              <p
                style={{
                  margin: 0,
                  fontSize: "14px",
                  fontWeight: 800,
                  color: "#111827",
                }}
              >
                {item.subject_name}
              </p>
            </div>

            <div>
              <p
                style={{
                  margin: 0,
                  fontSize: "11px",
                  color: "#6b7280",
                  marginBottom: "4px",
                }}
              >
                Order
              </p>
              <p
                style={{
                  margin: 0,
                  fontSize: "12px",
                  color: "#111827",
                  fontWeight: 700,
                }}
              >
                {item.subject_order}
              </p>
            </div>

            <div
              style={{
                display: "flex",
                gap: "8px",
                justifyContent: "flex-end",
                flexWrap: "wrap",
              }}
            >
              <button type="button" onClick={() => setEditing(true)} style={primaryButtonStyle}>
                Edit
              </button>

              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                style={{
                  ...dangerButtonStyle,
                  opacity: deleting ? 0.7 : 1,
                  cursor: deleting ? "not-allowed" : "pointer",
                }}
              >
                {deleting ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </>
      ) : (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "2fr 1fr",
              gap: "12px",
              alignItems: "end",
            }}
          >
            <div>
              <label style={labelStyle}>Subject Name</label>
              <input
                value={subjectName}
                onChange={(e) => setSubjectName(e.target.value)}
                style={inputStyle}
              />
            </div>

            <div>
              <label style={labelStyle}>Order</label>
              <input
                type="number"
                value={subjectOrder}
                onChange={(e) => setSubjectOrder(e.target.value)}
                style={inputStyle}
              />
            </div>
          </div>

          <div
            style={{
              display: "flex",
              gap: "10px",
              flexWrap: "wrap",
              marginTop: "12px",
            }}
          >
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              style={{
                ...primaryButtonStyle,
                opacity: saving ? 0.7 : 1,
                cursor: saving ? "not-allowed" : "pointer",
              }}
            >
              {saving ? "Saving..." : "Save"}
            </button>

            <button type="button" onClick={resetForm} style={secondaryButtonStyle}>
              Cancel
            </button>

            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              style={{
                ...dangerButtonStyle,
                opacity: deleting ? 0.7 : 1,
                cursor: deleting ? "not-allowed" : "pointer",
              }}
            >
              {deleting ? "Deleting..." : "Delete"}
            </button>
          </div>
        </>
      )}

      {message && (
        <p
          style={{
            marginTop: "10px",
            color: message.startsWith("Error:") ? "#b91c1c" : "#065f46",
            fontSize: "12px",
            fontWeight: 600,
          }}
        >
          {message}
        </p>
      )}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "12px",
  marginTop: "6px",
  borderRadius: "10px",
  border: "1px solid #d1d5db",
  outline: "none",
  fontSize: "14px",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontWeight: 600,
  fontSize: "13px",
  color: "#111827",
};

const primaryButtonStyle: React.CSSProperties = {
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

const boxStyle: React.CSSProperties = {
  background: "#fff",
  borderRadius: "16px",
  padding: "16px",
  border: "1px solid #e5e7eb",
};
