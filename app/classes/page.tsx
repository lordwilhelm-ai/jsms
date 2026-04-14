"use client";

import { useEffect, useState } from "react";

type ClassItem = {
  id: string;
  class_name: string;
  class_order: number;
  level: string;
};

export default function ClassesPage() {
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [seeding, setSeeding] = useState(false);

  async function loadClasses() {
    setLoading(true);
    setMessage("");

    try {
      const response = await fetch("/api/classes/list", {
        method: "GET",
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to load classes.");
      }

      setClasses(data.classes || []);
    } catch (error) {
      setMessage(
        error instanceof Error ? `Error: ${error.message}` : "Error loading classes."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadClasses();
  }, []);

  async function handleSeedClasses() {
    setSeeding(true);
    setMessage("");

    try {
      const response = await fetch("/api/classes/seed", {
        method: "POST",
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to load official classes.");
      }

      setMessage(data.message || "Official classes loaded successfully.");
      await loadClasses();
    } catch (error) {
      setMessage(
        error instanceof Error ? `Error: ${error.message}` : "Error seeding classes."
      );
    } finally {
      setSeeding(false);
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
      <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
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
            Classes
          </p>

          <h1
            style={{
              margin: "10px 0 10px",
              fontSize: "28px",
              lineHeight: 1.15,
            }}
          >
            Class Management
          </h1>

          <p
            style={{
              margin: 0,
              maxWidth: "720px",
              color: "rgba(255,255,255,0.85)",
              lineHeight: 1.7,
              fontSize: "13px",
            }}
          >
            Manage the official school classes saved in the central system.
            Everything is done on this page.
          </p>
        </div>

        <div
          style={{
            background: "rgba(255,255,255,0.96)",
            borderRadius: "24px",
            padding: "18px",
            boxShadow: "0 10px 28px rgba(0,0,0,0.08)",
            border: "1px solid rgba(245,158,11,0.12)",
            marginBottom: "18px",
            display: "flex",
            flexWrap: "wrap",
            gap: "12px",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div>
            <p
              style={{
                margin: 0,
                fontSize: "14px",
                fontWeight: 700,
                color: "#111827",
              }}
            >
              Official Classes
            </p>
            <p
              style={{
                margin: "4px 0 0",
                fontSize: "12px",
                color: "#6b7280",
              }}
            >
              Load or reload the official class list for the school.
            </p>
          </div>

          <button
            type="button"
            onClick={handleSeedClasses}
            disabled={seeding}
            style={{
              border: "none",
              background: "#111827",
              color: "#ffffff",
              borderRadius: "14px",
              padding: "12px 16px",
              fontWeight: 700,
              fontSize: "13px",
              cursor: seeding ? "not-allowed" : "pointer",
              opacity: seeding ? 0.7 : 1,
            }}
          >
            {seeding ? "Loading..." : "Load Official Classes"}
          </button>
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

        {loading ? (
          <div
            style={{
              background: "#fff",
              borderRadius: "20px",
              padding: "20px",
              boxShadow: "0 12px 30px rgba(0,0,0,0.08)",
            }}
          >
            Loading classes...
          </div>
        ) : classes.length === 0 ? (
          <div
            style={{
              background: "#fff",
              borderRadius: "20px",
              padding: "20px",
              boxShadow: "0 12px 30px rgba(0,0,0,0.08)",
            }}
          >
            No classes found. Click <strong>Load Official Classes</strong>.
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gap: "16px",
            }}
          >
            {classes.map((item) => (
              <EditableClassCard
                key={item.id}
                item={item}
                onUpdated={loadClasses}
              />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

function EditableClassCard({
  item,
  onUpdated,
}: {
  item: ClassItem;
  onUpdated: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [className, setClassName] = useState(item.class_name);
  const [classOrder, setClassOrder] = useState(String(item.class_order));
  const [level, setLevel] = useState(item.level);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState("");

  function resetForm() {
    setClassName(item.class_name);
    setClassOrder(String(item.class_order));
    setLevel(item.level);
    setMessage("");
    setEditing(false);
  }

  async function handleSave() {
    setSaving(true);
    setMessage("");

    try {
      const response = await fetch("/api/classes/update", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: item.id,
          class_name: className,
          class_order: Number(classOrder),
          level,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to update class.");
      }

      setMessage("Class updated successfully.");
      setEditing(false);
      await onUpdated();
    } catch (error) {
      setMessage(
        error instanceof Error ? `Error: ${error.message}` : "Error updating class."
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    const confirmed = window.confirm(
      `Delete ${item.class_name}? This cannot be undone.`
    );

    if (!confirmed) return;

    setDeleting(true);
    setMessage("");

    try {
      const response = await fetch("/api/classes/delete", {
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
        throw new Error(data.error || "Failed to delete class.");
      }

      setMessage("Class deleted successfully.");
      await onUpdated();
    } catch (error) {
      setMessage(
        error instanceof Error ? `Error: ${error.message}` : "Error deleting class."
      );
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div
      style={{
        background: "rgba(255,255,255,0.96)",
        borderRadius: "24px",
        padding: "18px",
        boxShadow: "0 10px 28px rgba(0,0,0,0.08)",
        border: "1px solid rgba(245,158,11,0.12)",
      }}
    >
      {!editing ? (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "2fr 1fr 1fr auto",
              gap: "12px",
              alignItems: "center",
            }}
          >
            <div>
              <p
                style={{
                  margin: 0,
                  fontSize: "17px",
                  fontWeight: 800,
                  color: "#111827",
                }}
              >
                {item.class_name}
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
                  fontSize: "13px",
                  color: "#111827",
                  fontWeight: 700,
                }}
              >
                {item.class_order}
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
                Level
              </p>
              <p
                style={{
                  margin: 0,
                  fontSize: "13px",
                  color: "#111827",
                  fontWeight: 700,
                }}
              >
                {item.level}
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
              <button
                type="button"
                onClick={() => setEditing(true)}
                style={actionButtonStyle}
              >
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
              gridTemplateColumns: "2fr 1fr 1fr",
              gap: "12px",
              alignItems: "end",
            }}
          >
            <div>
              <label style={labelStyle}>Class Name</label>
              <input
                value={className}
                onChange={(e) => setClassName(e.target.value)}
                style={inputStyle}
              />
            </div>

            <div>
              <label style={labelStyle}>Order</label>
              <input
                type="number"
                value={classOrder}
                onChange={(e) => setClassOrder(e.target.value)}
                style={inputStyle}
              />
            </div>

            <div>
              <label style={labelStyle}>Level</label>
              <select
                value={level}
                onChange={(e) => setLevel(e.target.value)}
                style={inputStyle}
              >
                <option value="Pre-School">Pre-School</option>
                <option value="KG">KG</option>
                <option value="Primary">Primary</option>
                <option value="JHS">JHS</option>
              </select>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              gap: "10px",
              flexWrap: "wrap",
              marginTop: "14px",
            }}
          >
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              style={{
                ...actionButtonStyle,
                opacity: saving ? 0.7 : 1,
                cursor: saving ? "not-allowed" : "pointer",
              }}
            >
              {saving ? "Saving..." : "Save"}
            </button>

            <button
              type="button"
              onClick={resetForm}
              style={secondaryButtonStyle}
            >
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
            marginTop: "12px",
            color: message.startsWith("Error:") ? "#b91c1c" : "#065f46",
            fontSize: "13px",
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

const actionButtonStyle: React.CSSProperties = {
  border: "none",
  background: "#064e3b",
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
