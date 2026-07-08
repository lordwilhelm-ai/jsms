/**
 * Format Date object as 24-hour clock.
 * Example: "07:23:45"
 * Used for the live kiosk header clock.
 */
export function formatClock(date: Date): string {
  return date.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

/**
 * Format Date object as a long readable date.
 * Example: "Tuesday, July 7, 2026"
 */
export function formatDateLong(date: Date): string {
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/**
 * Convert ISO timestamp into 12-hour time format.
 * Example:
 * "2026-07-07T07:23:45.000Z" → "7:23 AM"
 *
 * Returns empty string for invalid or missing values.
 */
export function formatTime12(
  iso: string | null | undefined
): string {
  if (!iso) return "";

  const date = new Date(iso);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

/**
 * Convert Date into local attendance date key.
 * Example:
 * Date → "2026-07-07"
 *
 * Uses local timezone instead of UTC to prevent
 * attendance records shifting to the wrong day.
 */
export function toIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

/**
 * Get current local attendance date.
 * Shortcut helper for kiosk attendance.
 */
export function todayIsoDate(): string {
  return toIsoDate(new Date());
}

/**
 * Format timestamp safely.
 * Returns "-" when no valid timestamp exists.
 */
export function formatDateTime(
  iso: string | null | undefined
): string {
  if (!iso) return "-";

  const date = new Date(iso);

  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return date.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}