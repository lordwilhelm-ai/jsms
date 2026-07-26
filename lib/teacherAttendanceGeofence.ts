import { supabaseAdmin } from "@/lib/supabase-admin";
import { haversineMeters } from "@/lib/geo";

const DEFAULT_SCHOOL_LAT = 5.144163;
const DEFAULT_SCHOOL_LNG = -1.281675;
const DEFAULT_ALLOWED_RADIUS_METERS = 180;
const DEFAULT_MAX_GPS_ACCURACY_METERS = 100;

export type GeoValidationResult =
  | { ok: true; distanceMeters: number }
  | { ok: false; error: string };

// Re-validates the check-in/out geofence server-side against the same
// teacher_attendance_settings row the client reads, instead of trusting a
// client-reported pass/fail (a modified request could always claim "on
// premises" without this).
export async function validateAttendanceLocation(params: {
  latitude: number;
  longitude: number;
  accuracy: number;
}): Promise<GeoValidationResult> {
  const { latitude, longitude, accuracy } = params;

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return { ok: false, error: "A valid device location is required." };
  }

  const { data: settingsRow } = await supabaseAdmin
    .from("teacher_attendance_settings")
    .select("*")
    .limit(1)
    .maybeSingle();

  const schoolLat = Number(settingsRow?.school_lat ?? DEFAULT_SCHOOL_LAT);
  const schoolLng = Number(settingsRow?.school_lng ?? DEFAULT_SCHOOL_LNG);
  const allowedRadiusMeters = Number(
    settingsRow?.allowed_radius_meters ?? DEFAULT_ALLOWED_RADIUS_METERS
  );
  const maxGpsAccuracyMeters = Number(
    settingsRow?.max_gps_accuracy_meters ?? DEFAULT_MAX_GPS_ACCURACY_METERS
  );

  if (!Number.isFinite(accuracy) || accuracy > maxGpsAccuracyMeters) {
    return {
      ok: false,
      error: `Location not accurate enough yet. Current GPS accuracy is ${Math.round(
        accuracy || 0
      )}m. Use a phone, move to an open area, and try again.`,
    };
  }

  const distanceMeters = haversineMeters(latitude, longitude, schoolLat, schoolLng);

  if (distanceMeters > allowedRadiusMeters) {
    return {
      ok: false,
      error: `You must be on school premises to do this. Distance: ${Math.round(distanceMeters)}m`,
    };
  }

  return { ok: true, distanceMeters };
}
