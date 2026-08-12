"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { authedFetch } from "@/lib/apiClient";

type GraduatedStudent = {
  id: string;
  studentId: string;
  fullName: string;
  photoUrl: string | null;
  gender: string | null;
  dateOfBirth: string | null;
};

type YearGroup = {
  year: string;
  students: GraduatedStudent[];
};

const COLORS = {
  bg: "#fffdf2",
  card: "#ffffff",
  border: "#e5e7eb",
  text: "#111827",
  muted: "#6b7280",
  gold: "#d4a017",
};

export default function GraduatedStudentsPage() {
  const [groups, setGroups] = useState<YearGroup[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [openYears, setOpenYears] = useState<Set<string>>(new Set());

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError("");
      try {
        const response = await authedFetch("/api/students/graduated/list");
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Failed to load graduated students.");
        setGroups(data.groups || []);
        setTotal(data.total || 0);
        setOpenYears(new Set((data.groups || []).slice(0, 1).map((g: YearGroup) => g.year)));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load graduated students.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  function toggleYear(year: string) {
    setOpenYears((prev) => {
      const next = new Set(prev);
      if (next.has(year)) next.delete(year);
      else next.add(year);
      return next;
    });
  }

  const filteredGroups = groups
    .map((group) => ({
      ...group,
      students: search.trim()
        ? group.students.filter(
            (s) =>
              s.fullName.toLowerCase().includes(search.trim().toLowerCase()) ||
              s.studentId.toLowerCase().includes(search.trim().toLowerCase())
          )
        : group.students,
    }))
    .filter((group) => group.students.length > 0);

  return (
    <main
      style={{
        minHeight: "100vh",
        background: COLORS.bg,
        fontFamily: "Arial, sans-serif",
        color: COLORS.text,
        padding: "24px",
      }}
    >
      <div style={{ maxWidth: "1000px", margin: "0 auto" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "12px",
            marginBottom: "20px",
          }}
        >
          <div>
            <h1 style={{ margin: 0, fontSize: "26px" }}>Graduated Students</h1>
            <p style={{ margin: "6px 0 0", fontSize: "13px", color: COLORS.muted }}>
              {total} student{total === 1 ? "" : "s"} total, grouped by year of completion.
            </p>
          </div>

          <Link
            href="/students"
            style={{
              padding: "10px 16px",
              borderRadius: "10px",
              background: "#111827",
              color: "#fff",
              textDecoration: "none",
              fontSize: "13px",
              fontWeight: 700,
            }}
          >
            Back to Students
          </Link>
        </div>

        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or student ID..."
          style={{
            width: "100%",
            padding: "10px 12px",
            borderRadius: "10px",
            border: `1px solid ${COLORS.border}`,
            fontSize: "13px",
            marginBottom: "20px",
            background: COLORS.card,
          }}
        />

        {error && (
          <div
            style={{
              background: "#fee2e2",
              color: "#991b1b",
              borderRadius: "10px",
              padding: "12px 14px",
              marginBottom: "16px",
              fontSize: "13px",
              fontWeight: 600,
            }}
          >
            {error}
          </div>
        )}

        {loading ? (
          <div style={{ textAlign: "center", padding: "40px", color: COLORS.muted }}>Loading...</div>
        ) : filteredGroups.length === 0 ? (
          <div
            style={{
              background: COLORS.card,
              border: `1px solid ${COLORS.border}`,
              borderRadius: "16px",
              padding: "40px",
              textAlign: "center",
              color: COLORS.muted,
            }}
          >
            No graduated students found.
          </div>
        ) : (
          <div style={{ display: "grid", gap: "14px" }}>
            {filteredGroups.map((group) => {
              const isOpen = openYears.has(group.year) || Boolean(search.trim());
              return (
                <div
                  key={group.year}
                  style={{
                    background: COLORS.card,
                    border: `1px solid ${COLORS.border}`,
                    borderRadius: "16px",
                    overflow: "hidden",
                  }}
                >
                  <button
                    type="button"
                    onClick={() => toggleYear(group.year)}
                    style={{
                      width: "100%",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "16px 18px",
                      background: "#f9fafb",
                      border: "none",
                      cursor: "pointer",
                      fontSize: "15px",
                      fontWeight: 800,
                      textAlign: "left",
                    }}
                  >
                    <span>
                      {group.year === "Unknown" ? "Unknown Year" : `Class of ${group.year}`}
                    </span>
                    <span style={{ fontSize: "12px", color: COLORS.muted, fontWeight: 700 }}>
                      {group.students.length} student{group.students.length === 1 ? "" : "s"} {isOpen ? "▲" : "▼"}
                    </span>
                  </button>

                  {isOpen && (
                    <div style={{ padding: "8px 0" }}>
                      {group.students.map((student) => (
                        <Link
                          key={student.id}
                          href={`/students/graduated/${student.id}`}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "12px",
                            padding: "10px 18px",
                            textDecoration: "none",
                            color: COLORS.text,
                            borderTop: `1px solid ${COLORS.border}`,
                          }}
                        >
                          {student.photoUrl ? (
                            <img
                              src={student.photoUrl}
                              alt=""
                              style={{ width: "36px", height: "36px", borderRadius: "50%", objectFit: "cover" }}
                            />
                          ) : (
                            <div
                              style={{
                                width: "36px",
                                height: "36px",
                                borderRadius: "50%",
                                background: "#fef3c7",
                                color: "#92400e",
                                display: "grid",
                                placeItems: "center",
                                fontWeight: 800,
                                fontSize: "13px",
                              }}
                            >
                              {student.fullName.charAt(0)}
                            </div>
                          )}
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 700, fontSize: "14px" }}>{student.fullName}</div>
                            <div style={{ fontSize: "12px", color: COLORS.muted }}>{student.studentId}</div>
                          </div>
                          <span style={{ fontSize: "12px", color: COLORS.gold, fontWeight: 700 }}>View records →</span>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
