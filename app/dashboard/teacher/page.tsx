import ProtectedRoute from "@/app/components/ProtectedRoute";
import TeacherDashboardPageClient from "./TeacherDashboardPageClient";

export default function TeacherDashboardPage() {
  return (
    <ProtectedRoute>
      <TeacherDashboardPageClient />
    </ProtectedRoute>
  );
}
