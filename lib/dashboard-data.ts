export type DashboardCard = {
  title: string;
  description: string;
  href: string;
  emoji: string;
};

export const teacherCards: DashboardCard[] = [
  {
    title: "Student Management",
    description: "Open student details and records for your class.",
    href: "/students",
    emoji: "🎓",
  },
  {
    title: "Feeding",
    description: "Continue to feeding and attendance for your class.",
    href: "/feeding",
    emoji: "🍽️",
  },
  {
    title: "Report Card",
    description: "Upload results, remarks, attendance, and view report cards.",
    href: "/report-card",
    emoji: "📘",
  },
  {
    title: "Fees",
    description: "Continue to fees and class fee information.",
    href: "/fees",
    emoji: "💳",
  },
  {
    title: "Change Password",
    description: "Change your account password securely.",
    href: "/change-password",
    emoji: "🔐",
  },
];

export const adminCards: DashboardCard[] = [
  {
    title: "Student Management System",
    description: "Open the central student database and records.",
    href: "/students",
    emoji: "🎓",
  },
  {
    title: "Feeding",
    description: "Open the feeding software with admin access.",
    href: "/feeding",
    emoji: "🍽️",
  },
  {
    title: "Report Card",
    description: "Open the report card software with admin access.",
    href: "/report-card",
    emoji: "📘",
  },
  {
    title: "Fees",
    description: "Open the fees software with admin access.",
    href: "/fees",
    emoji: "💳",
  },
];

export const headmasterCards: DashboardCard[] = [
  {
    title: "Student Management System",
    description: "Open student records and student details.",
    href: "/students",
    emoji: "🎓",
  },
  {
    title: "Feeding",
    description: "Open the feeding software.",
    href: "/feeding",
    emoji: "🍽️",
  },
  {
    title: "Report Card",
    description: "Open the report card software.",
    href: "/report-card",
    emoji: "📘",
  },
  {
    title: "Fees",
    description: "Open the fees software.",
    href: "/fees",
    emoji: "💳",
  },
];