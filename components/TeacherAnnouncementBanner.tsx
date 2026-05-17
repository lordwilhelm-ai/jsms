"use client";

import { useEffect, useState } from "react";
import { fetchActiveTeacherAnnouncements, JSMSAnnouncement } from "@/lib/jsmsChat";

export default function TeacherAnnouncementBanner() {
  const [items, setItems] = useState<JSMSAnnouncement[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    try {
      setLoading(true);
      const rows = await fetchActiveTeacherAnnouncements();
      setItems(rows);
    } catch (err) {
      console.error("Could not load announcements", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const timer = setInterval(load, 60000);
    return () => clearInterval(timer);
  }, []);

  if (loading || items.length === 0) return null;

  return (
    <section style={styles.wrap}>
      <div style={styles.header}>
        <span style={styles.icon}>📢</span>
        <strong>Announcements</strong>
      </div>

      <div style={styles.list}>
        {items.map((item) => (
          <article key={item.id} style={styles.card}>
            <p style={styles.message}>{item.message}</p>
            <span style={styles.meta}>
              {item.sender_name || "Admin"} • expires {formatTime(item.expires_at)}
            </span>
          </article>
        ))}
      </div>
    </section>
  );
}

function formatTime(value: string) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      month: "short",
      day: "numeric",
    }).format(new Date(value));
  } catch {
    return "";
  }
}

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    margin: "12px 0",
    padding: 12,
    borderRadius: 18,
    background: "#fff7db",
    border: "1px solid #f2d48a",
    color: "#3d2b08",
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 14,
    marginBottom: 10,
  },
  icon: {
    width: 28,
    height: 28,
    borderRadius: 999,
    background: "#f4d06f",
    display: "grid",
    placeItems: "center",
  },
  list: {
    display: "grid",
    gap: 8,
  },
  card: {
    background: "#fffaf0",
    borderRadius: 14,
    padding: 10,
    border: "1px solid rgba(137, 99, 15, 0.15)",
  },
  message: {
    margin: 0,
    fontSize: 14,
    lineHeight: 1.45,
    fontWeight: 700,
  },
  meta: {
    display: "block",
    marginTop: 6,
    fontSize: 11,
    color: "#7c5a16",
  },
};
