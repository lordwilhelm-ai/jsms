"use client";

import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import ProtectedRoute from "@/app/components/ProtectedRoute";
import NotificationPermissionGate from "@/app/components/NotificationPermissionGate";
import JSMSChatWidget from "@/components/JSMSChatWidget";

function GlobalBackButton() {
  const router = useRouter();
  const pathname = usePathname();

  const hiddenPages = [
    "/admin",
    "/teacher",
    "/dashboard",
    "/admin/dashboard",
    "/teacher/dashboard",
  ];

  const shouldHideBackButton = hiddenPages.includes(pathname);

  if (shouldHideBackButton) return null;

  return (
    <button
      type="button"
      onClick={() => router.back()}
      className="fixed left-4 top-4 z-[9999] flex items-center gap-2 rounded-full border border-slate-200 bg-white/95 px-4 py-2 text-sm font-semibold text-slate-800 shadow-lg backdrop-blur transition hover:bg-slate-100 active:scale-95"
    >
      <ArrowLeft className="h-4 w-4" />
      <span>Back</span>
    </button>
  );
}

export default function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ProtectedRoute>
      <NotificationPermissionGate>
        <GlobalBackButton />
        {children}
        <JSMSChatWidget />
      </NotificationPermissionGate>
    </ProtectedRoute>
  );
}