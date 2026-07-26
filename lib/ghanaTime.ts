// Shared Ghana-timezone helpers.
//
// Several attendance/feeding flows compute "today", "this week", and
// "is it past 7:30am" from the raw device clock (`new Date()`,
// `.getHours()`, `.toISOString()`). That silently breaks the moment a
// phone/kiosk has the wrong system timezone or clock, because it shifts
// which calendar day (and which side of a time cutoff) a record lands on.
// Ghana has no DST and sits at UTC+0, so pinning every date/time decision
// to "Africa/Accra" here — rather than trusting the caller's local clock
// interpretation — keeps every surface (client pages, kiosk, API routes)
// agreeing on the same "today" regardless of device settings.
export const GHANA_TIME_ZONE = "Africa/Accra";

export function getGhanaDateString(date: Date = new Date()): string {
  return date.toLocaleDateString("en-CA", { timeZone: GHANA_TIME_ZONE });
}

export function getGhanaHourMinute(date: Date = new Date()): { hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: GHANA_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? "0");

  return { hour: Number.isFinite(hour) ? hour : 0, minute: Number.isFinite(minute) ? minute : 0 };
}

// Anchors a "YYYY-MM-DD" Ghana calendar date at noon UTC so that adding/
// subtracting whole days (for week-start/end math) never drifts across a
// date boundary due to DST or local-timezone re-interpretation.
export function ghanaDateStringToAnchor(dateString: string): Date {
  return new Date(`${dateString}T12:00:00Z`);
}

export function addGhanaDays(dateString: string, days: number): string {
  const date = ghanaDateStringToAnchor(dateString);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

// Monday-start week containing the given Ghana calendar date.
export function getGhanaStartOfWeekMonday(dateString: string): string {
  const date = ghanaDateStringToAnchor(dateString);
  const day = date.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setUTCDate(date.getUTCDate() + diff);
  return date.toISOString().slice(0, 10);
}

export function getGhanaEndOfWeekSunday(dateString: string): string {
  return addGhanaDays(getGhanaStartOfWeekMonday(dateString), 6);
}

export function getGhanaNextWeekStart(dateString: string): string {
  return addGhanaDays(getGhanaStartOfWeekMonday(dateString), 7);
}

export function getGhanaNextWeekEnd(dateString: string): string {
  return addGhanaDays(getGhanaNextWeekStart(dateString), 6);
}

// Present/Late cutoff shared by phone check-in and the kiosk terminal.
const CHECK_IN_DEADLINE_MINUTES = 7 * 60 + 30;

export function getGhanaCheckInStatus(date: Date = new Date(), isOnDuty = false): "Present" | "Late" {
  const { hour, minute } = getGhanaHourMinute(date);
  const totalMinutes = hour * 60 + minute;

  if (isOnDuty) {
    return totalMinutes < CHECK_IN_DEADLINE_MINUTES ? "Present" : "Late";
  }

  return totalMinutes <= CHECK_IN_DEADLINE_MINUTES ? "Present" : "Late";
}
