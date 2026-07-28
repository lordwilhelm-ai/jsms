"use client";

import type { ModulePrefetchStatus } from "@/lib/offline/useModulePrefetch";

// Small floating indicator shown while a module's background prefetch
// (useModulePrefetch) runs, so opening e.g. Fees visibly confirms when
// everything under it has actually finished downloading for offline use.
export default function ModuleDownloadBadge({
  status,
  label,
}: {
  status: ModulePrefetchStatus;
  label: string;
}) {
  if (status === "idle") return null;

  const downloading = status === "downloading";

  return (
    <div
      style={{
        position: "fixed",
        bottom: "18px",
        right: "18px",
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        gap: "8px",
        padding: "10px 16px",
        borderRadius: "999px",
        fontSize: "13px",
        fontWeight: 700,
        color: downloading ? "#92400e" : "#166534",
        background: downloading ? "#fef3c7" : "#dcfce7",
        border: `1px solid ${downloading ? "#fbbf24" : "#86efac"}`,
        boxShadow: "0 10px 24px rgba(0,0,0,0.14)",
      }}
    >
      <span>{downloading ? "⏳" : "✓"}</span>
      <span>
        {downloading ? `Downloading ${label} for offline use...` : `${label} ready offline`}
      </span>
    </div>
  );
}
