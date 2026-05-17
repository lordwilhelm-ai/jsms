"use client";

import ProtectedRoute from "@/app/components/ProtectedRoute";
import NotificationPermissionGate from "@/app/components/NotificationPermissionGate";
import JSMSChatWidget from "@/components/JSMSChatWidget";

export default function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ProtectedRoute>
      <NotificationPermissionGate>
        {children}
        <JSMSChatWidget />
      </NotificationPermissionGate>
    </ProtectedRoute>
  );
}