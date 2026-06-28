/**
 * PASTE THIS FILE AT:
 *   components/ReportCardGate.tsx
 *
 * The "components" folder already exists in your project.
 * Just create a new file inside it called ReportCardGate.tsx
 */

"use client";

import { useRouter } from "next/navigation";
import { FiAlertTriangle, FiLock, FiCreditCard } from "react-icons/fi";

// ── shared backdrop ────────────────────────────────────────────────────────

function Backdrop({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 px-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
    >
      {children}
    </div>
  );
}

// ── Admin gate ─────────────────────────────────────────────────────────────
// Shown to admins when the school owes money.
// Has the amount and a Pay Now button.

type AdminPaymentGateProps = {
  amountDue: number;
  checkoutPath?: string;
};

export function AdminPaymentGate({
  amountDue,
  checkoutPath = "/report-card/admin/billing",
}: AdminPaymentGateProps) {
  const router = useRouter();

  return (
    <Backdrop>
      <div className="w-full max-w-md overflow-hidden rounded-[28px] bg-white shadow-2xl">
        <div className="h-1.5 bg-gradient-to-r from-rose-500 to-orange-400" />

        <div className="p-7">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-rose-50">
            <FiAlertTriangle size={30} className="text-rose-500" />
          </div>

          <h2 className="mt-5 text-center text-2xl font-black text-slate-900">
            Payment Required
          </h2>

          <p className="mt-2 text-center text-sm font-semibold text-slate-500">
            Your school has an outstanding balance for the Report Card System.
            All report-card pages are locked until the balance is cleared.
          </p>

          <div className="mt-6 flex items-center justify-between rounded-2xl bg-rose-50 px-5 py-4">
            <span className="text-sm font-bold text-rose-700">Amount Due</span>
            <span className="text-2xl font-black text-rose-600">
              ₵{Number(amountDue).toFixed(2)}
            </span>
          </div>

          <button
            type="button"
            onClick={() => router.push(checkoutPath)}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-rose-600 px-5 py-4 text-sm font-black text-white transition hover:bg-rose-700 active:scale-95"
          >
            <FiCreditCard size={18} />
            Pay Now
          </button>

          <p className="mt-4 text-center text-xs font-semibold text-slate-400">
            Contact your system provider if you believe this is an error.
          </p>
        </div>
      </div>
    </Backdrop>
  );
}

// ── Teacher gate ───────────────────────────────────────────────────────────
// Shown to teachers when the school owes money.
// No amount shown — just tells them to contact admin.

export function TeacherPaymentGate() {
  return (
    <Backdrop>
      <div className="w-full max-w-md overflow-hidden rounded-[28px] bg-white shadow-2xl">
        <div className="h-1.5 bg-gradient-to-r from-amber-400 to-orange-400" />

        <div className="p-7">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-amber-50">
            <FiLock size={30} className="text-amber-500" />
          </div>

          <h2 className="mt-5 text-center text-2xl font-black text-slate-900">
            Module Locked
          </h2>

          <p className="mt-2 text-center text-sm font-semibold text-slate-500">
            The Report Card System is currently unavailable.
          </p>

          <div className="mt-6 rounded-2xl bg-amber-50 px-5 py-4 text-center">
            <p className="text-sm font-bold text-amber-800">
              Please contact your school admin to resolve this.
            </p>
          </div>

          <p className="mt-5 text-center text-xs font-semibold text-slate-400">
            Your dashboard is still accessible. Only report-card pages are locked.
          </p>
        </div>
      </div>
    </Backdrop>
  );
}
