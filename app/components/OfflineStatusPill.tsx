"use client";

// Shared status pill for every offline-capable admin page (Books, Uniforms,
// Fees, Income & Expenditure) — styled for the light "bg-white p-5
// shadow-sm" admin-card look those pages already use, unlike the
// teacher-attendance kiosk's dark-header pill (that one stays bespoke since
// its header is a different visual context).
export default function OfflineStatusPill({
  online,
  pendingCount,
  syncing,
}: {
  online: boolean;
  pendingCount: number;
  syncing: boolean;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-bold ${
        online ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
      }`}
    >
      {online ? "Online" : "Offline"}
      {pendingCount > 0 ? ` • ${pendingCount} pending` : ""}
      {syncing ? " • Syncing..." : ""}
    </span>
  );
}
