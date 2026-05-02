"use client";

import type React from "react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type AnyRow = Record<string, any>;

const COLORS = {
  bg: "#f7f4ec",
  dark: "#0f172a",
  darkSoft: "#111827",
  gold: "#d4a017",
  card: "#ffffff",
  text: "#111827",
  muted: "#6b7280",
  border: "#e5e7eb",
  successBg: "#dcfce7",
  successText: "#166534",
  dangerBg: "#fee2e2",
  dangerText: "#991b1b",
  infoBg: "#eff6ff",
  infoText: "#1d4ed8",
};

const DEFAULT_LAT = 5.144163;
const DEFAULT_LNG = -1.281675;
const DEFAULT_RADIUS = 180;
const DEFAULT_GPS_ACCURACY = 100;

function getRole(row: AnyRow | null) {
  return String(row?.role || "").trim().toLowerCase();
}

function isAdminRole(role: string) {
  return role === "admin" || role === "super_admin" || role === "superadmin";
}

function getCurrentPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("This device/browser does not support location access."));
      return;
    }

    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 20000,
      maximumAge: 0,
    });
  });
}

export default function LocationSettingsPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [settingsId, setSettingsId] = useState<string>("");
  const [schoolLat, setSchoolLat] = useState(String(DEFAULT_LAT));
  const [schoolLng, setSchoolLng] = useState(String(DEFAULT_LNG));
  const [allowedRadius, setAllowedRadius] = useState(String(DEFAULT_RADIUS));
  const [maxGpsAccuracy, setMaxGpsAccuracy] = useState(String(DEFAULT_GPS_ACCURACY));

  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error" | "info">("info");

  useEffect(() => {
    let active = true;

    async function loadPage() {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!active) return;

        if (!session?.user) {
          router.replace("/");
          return;
        }

        const teachersRes = await supabase.from("teachers").select("*");

        if (teachersRes.error) throw teachersRes.error;

        const allUsers = teachersRes.data || [];

        const matchedUser =
          allUsers.find((item) => item.auth_user_id === session.user.id) ||
          allUsers.find(
            (item) =>
              String(item.email || "").trim().toLowerCase() ===
              String(session.user.email || "").trim().toLowerCase()
          ) ||
          null;

        const fallbackAdminUser = {
          id: session.user.id,
          auth_user_id: session.user.id,
          email: session.user.email || "",
          full_name: "Admin",
          role: "admin",
        };

        const finalUser = matchedUser || fallbackAdminUser;

        if (!isAdminRole(getRole(finalUser))) {
          router.replace("/teacher-attendance");
          return;
        }

        const { data, error } = await supabase
          .from("teacher_attendance_settings")
          .select("*")
          .limit(1)
          .maybeSingle();

        if (error) throw error;

        if (data) {
          setSettingsId(String(data.id || ""));
          setSchoolLat(String(data.school_lat ?? DEFAULT_LAT));
          setSchoolLng(String(data.school_lng ?? DEFAULT_LNG));
          setAllowedRadius(String(data.allowed_radius_meters ?? DEFAULT_RADIUS));
          setMaxGpsAccuracy(String(data.max_gps_accuracy_meters ?? DEFAULT_GPS_ACCURACY));
        }
      } catch (error: any) {
        console.error(error);
        setMessage(error?.message || "Failed to load location settings.");
        setMessageType("error");
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadPage();

    return () => {
      active = false;
    };
  }, [router]);

  async function handleUseCurrentLocation() {
    try {
      setMessage("Getting current location...");
      setMessageType("info");

      const position = await getCurrentPosition();

      setSchoolLat(String(position.coords.latitude));
      setSchoolLng(String(position.coords.longitude));

      setMessage(
        `Location captured. GPS accuracy: ${Math.round(position.coords.accuracy || 0)}m`
      );
      setMessageType("success");
    } catch (error: any) {
      setMessage(error?.message || "Unable to get current location.");
      setMessageType("error");
    }
  }

  async function handleSave() {
    try {
      setSaving(true);
      setMessage("");

      const lat = Number(schoolLat);
      const lng = Number(schoolLng);
      const radius = Number(allowedRadius);
      const accuracy = Number(maxGpsAccuracy);

      if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
        setMessage("Enter a valid latitude.");
        setMessageType("error");
        return;
      }

      if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
        setMessage("Enter a valid longitude.");
        setMessageType("error");
        return;
      }

      if (!Number.isFinite(radius) || radius < 10) {
        setMessage("Allowed radius must be at least 10 meters.");
        setMessageType("error");
        return;
      }

      if (!Number.isFinite(accuracy) || accuracy < 10) {
        setMessage("GPS accuracy must be at least 10 meters.");
        setMessageType("error");
        return;
      }

      const payload = {
        school_lat: lat,
        school_lng: lng,
        allowed_radius_meters: Math.round(radius),
        max_gps_accuracy_meters: Math.round(accuracy),
        updated_at: new Date().toISOString(),
      };

      if (settingsId) {
        const { error } = await supabase
          .from("teacher_attendance_settings")
          .update(payload)
          .eq("id", settingsId);

        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from("teacher_attendance_settings")
          .insert(payload)
          .select("*")
          .single();

        if (error) throw error;
        setSettingsId(String(data.id || ""));
      }

      setMessage("Location settings saved successfully.");
      setMessageType("success");
    } catch (error: any) {
      console.error(error);
      setMessage(error?.message || "Failed to save location settings.");
      setMessageType("error");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <main style={loadingPageStyle}>
        <div style={loadingCardStyle}>Loading location settings...</div>
      </main>
    );
  }

  return (
    <main style={pageStyle}>
      <div style={{ maxWidth: "900px", margin: "0 auto" }}>
        <div style={headerStyle}>
          <div style={headerFlexStyle}>
            <div>
              <p style={eyebrowStyle}>Admin Panel</p>
              <h1 style={{ margin: "4px 0 0", fontSize: "24px", lineHeight: 1.1 }}>
                Location Settings
              </h1>
              <p style={headerNameStyle}>
                Change school GPS location and attendance radius
              </p>
            </div>

            <div style={headerRightStyle}>
              <Link href="/teacher-attendance" style={topButtonStyle}>
                Back
              </Link>
              <Link href="/teacher-attendance/records" style={topButtonStyle}>
                Records
              </Link>
              <Link href="/teacher-attendance/duty-roster" style={topButtonStyle}>
                Duty Roster
              </Link>
            </div>
          </div>
        </div>

        {message && <MessageBox message={message} messageType={messageType} />}

        <section style={sectionCardStyle}>
          <h3 style={sectionTitleStyle}>School Location</h3>

          <div style={noticeStyle}>
            Use this page when the school GPS point needs correction. Teachers will later check in
            based on these saved values instead of hardcoded coordinates.
          </div>

          <div style={{ height: "12px" }} />

          <div style={formGridStyle}>
            <label style={labelStyle}>
              School Latitude
              <input
                value={schoolLat}
                onChange={(e) => setSchoolLat(e.target.value)}
                placeholder="Example: 5.144163"
                style={inputStyle}
              />
            </label>

            <label style={labelStyle}>
              School Longitude
              <input
                value={schoolLng}
                onChange={(e) => setSchoolLng(e.target.value)}
                placeholder="Example: -1.281675"
                style={inputStyle}
              />
            </label>

            <label style={labelStyle}>
              Allowed Radius
              <input
                value={allowedRadius}
                onChange={(e) => setAllowedRadius(e.target.value)}
                placeholder="Example: 180"
                style={inputStyle}
              />
              <span style={hintStyle}>Meters. Example: 50, 100, 180.</span>
            </label>

            <label style={labelStyle}>
              Max GPS Accuracy
              <input
                value={maxGpsAccuracy}
                onChange={(e) => setMaxGpsAccuracy(e.target.value)}
                placeholder="Example: 100"
                style={inputStyle}
              />
              <span style={hintStyle}>Meters. Lower is stricter.</span>
            </label>
          </div>

          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "14px" }}>
            <button onClick={handleUseCurrentLocation} style={secondaryButtonStyle}>
              Use Current Location
            </button>

            <button
              onClick={handleSave}
              disabled={saving}
              style={{
                ...primaryButtonStyle,
                opacity: saving ? 0.65 : 1,
                cursor: saving ? "not-allowed" : "pointer",
              }}
            >
              {saving ? "Saving..." : "Save Location Settings"}
            </button>
          </div>
        </section>

        <div style={{ height: "12px" }} />

        <section style={sectionCardStyle}>
          <h3 style={sectionTitleStyle}>Current Values</h3>

          <div style={statsGridStyle}>
            <MiniCard label="Latitude" value={schoolLat || "-"} />
            <MiniCard label="Longitude" value={schoolLng || "-"} />
            <MiniCard label="Radius" value={`${allowedRadius || "-"}m`} />
            <MiniCard label="GPS Accuracy" value={`${maxGpsAccuracy || "-"}m`} />
          </div>
        </section>
      </div>
    </main>
  );
}

function MessageBox({
  message,
  messageType,
}: {
  message: string;
  messageType: "success" | "error" | "info";
}) {
  return (
    <div
      style={{
        background:
          messageType === "success"
            ? COLORS.successBg
            : messageType === "error"
            ? COLORS.dangerBg
            : COLORS.infoBg,
        color:
          messageType === "success"
            ? COLORS.successText
            : messageType === "error"
            ? COLORS.dangerText
            : COLORS.infoText,
        borderRadius: "12px",
        padding: "12px 14px",
        marginBottom: "12px",
        fontWeight: 800,
        fontSize: "13px",
      }}
    >
      {message}
    </div>
  );
}

function MiniCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={miniCardStyle}>
      <p style={{ margin: 0, color: COLORS.muted, fontSize: "12px" }}>{label}</p>
      <h2 style={{ margin: "5px 0 0", color: COLORS.dark, fontSize: "18px" }}>{value}</h2>
    </div>
  );
}

const pageStyle: React.CSSProperties = {
  minHeight: "100vh",
  background: COLORS.bg,
  fontFamily: "Arial, sans-serif",
  color: COLORS.text,
  padding: "12px",
};

const loadingPageStyle: React.CSSProperties = {
  ...pageStyle,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const loadingCardStyle: React.CSSProperties = {
  background: COLORS.card,
  borderRadius: "18px",
  padding: "18px 22px",
  border: `1px solid ${COLORS.border}`,
  boxShadow: "0 10px 24px rgba(0,0,0,0.06)",
  fontWeight: 700,
};

const headerStyle: React.CSSProperties = {
  background: `linear-gradient(135deg, ${COLORS.dark} 0%, ${COLORS.darkSoft} 100%)`,
  color: "#fff",
  borderRadius: "18px",
  padding: "16px",
  border: `2px solid ${COLORS.gold}`,
  boxShadow: "0 12px 24px rgba(0,0,0,0.10)",
  marginBottom: "12px",
};

const headerFlexStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: "10px",
  alignItems: "flex-start",
  flexWrap: "wrap",
};

const eyebrowStyle: React.CSSProperties = {
  margin: 0,
  fontSize: "10px",
  textTransform: "uppercase",
  letterSpacing: "1px",
  color: "rgba(255,255,255,0.72)",
};

const headerNameStyle: React.CSSProperties = {
  margin: "5px 0 0",
  color: "rgba(255,255,255,0.88)",
  fontSize: "13px",
  fontWeight: 700,
};

const headerRightStyle: React.CSSProperties = {
  display: "flex",
  gap: "8px",
  alignItems: "center",
  flexWrap: "wrap",
  justifyContent: "flex-end",
};

const topButtonStyle: React.CSSProperties = {
  textDecoration: "none",
  border: "1px solid rgba(255,255,255,0.15)",
  borderRadius: "9px",
  padding: "8px 11px",
  background: "rgba(255,255,255,0.06)",
  color: "#fff",
  fontWeight: 800,
  fontSize: "12px",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
};

const sectionCardStyle: React.CSSProperties = {
  background: COLORS.card,
  borderRadius: "15px",
  border: `1px solid ${COLORS.border}`,
  boxShadow: "0 6px 16px rgba(0,0,0,0.04)",
  padding: "14px",
};

const sectionTitleStyle: React.CSSProperties = {
  marginTop: 0,
  marginBottom: "9px",
  color: COLORS.dark,
  fontSize: "17px",
};

const noticeStyle: React.CSSProperties = {
  background: COLORS.infoBg,
  color: COLORS.infoText,
  borderRadius: "11px",
  padding: "10px",
  fontWeight: 700,
  fontSize: "12px",
  lineHeight: 1.5,
};

const formGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))",
  gap: "10px",
};

const labelStyle: React.CSSProperties = {
  display: "grid",
  gap: "5px",
  color: COLORS.dark,
  fontWeight: 800,
  fontSize: "12px",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  border: `1px solid ${COLORS.border}`,
  borderRadius: "11px",
  padding: "11px 12px",
  outline: "none",
  fontSize: "13px",
  background: "#fff",
  color: COLORS.dark,
};

const hintStyle: React.CSSProperties = {
  color: COLORS.muted,
  fontSize: "11px",
  fontWeight: 500,
};

const primaryButtonStyle: React.CSSProperties = {
  border: "none",
  background: COLORS.gold,
  color: COLORS.dark,
  borderRadius: "11px",
  padding: "11px 14px",
  fontWeight: 900,
  fontSize: "13px",
};

const secondaryButtonStyle: React.CSSProperties = {
  border: `1px solid ${COLORS.border}`,
  background: "#fff",
  color: COLORS.dark,
  borderRadius: "11px",
  padding: "11px 14px",
  fontWeight: 900,
  fontSize: "13px",
  cursor: "pointer",
};

const statsGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
  gap: "10px",
};

const miniCardStyle: React.CSSProperties = {
  background: "#fff",
  border: `1px solid ${COLORS.border}`,
  borderRadius: "14px",
  padding: "12px",
};
