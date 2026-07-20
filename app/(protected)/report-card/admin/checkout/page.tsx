"use client";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useReportCardAccess } from "@/hooks/useReportCardAccess";
import { authedFetch } from "@/lib/apiClient";
import { FiLoader, FiShield, FiUsers, FiFileText, FiCheckCircle, FiX, FiAlertCircle } from "react-icons/fi";

function formatMoney(value: number) { return `₵${value.toFixed(2)}`; }

export default function CheckoutPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { amountDue, license, studentCount, checking } = useReportCardAccess();
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error', message: string } | null>(null);

  // Show success/error toast if redirected back from Hubtel
  useEffect(() => {
    if (searchParams.get('paid') === '1') {
      setToast({ type: 'success', message: 'Payment successful! Your report card access is now active.' });
      // refresh data after 2s so it shows "paid"
      setTimeout(() => {
        router.replace('/report-card/admin/checkout');
        window.location.reload();
      }, 2000);
    }
    if (searchParams.get('cancelled') === '1') {
      setToast({ type: 'error', message: 'Payment was cancelled. You can try again.' });
    }
  }, [searchParams, router]);

  // Auto-hide toast
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  async function handleClickToPay() {
    if (!license || amountDue === 0) return;
    setLoading(true);
    
    try {
      // 1. Ask the server to mint a fresh, unguessable invoiceId and save it to
      // the license so the webhook can find it later. Never generate this
      // client-side — it's the value that proves a payment belongs to this license.
      const saveRes = await authedFetch("/api/save-invoice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ licenseId: license.id }),
      });
      if (!saveRes.ok) throw new Error("Failed to save invoice");
      const { invoiceId, error: saveError } = await saveRes.json();
      if (saveError || !invoiceId) throw new Error(saveError || "Failed to save invoice");

      // 2. Call our server to get Hubtel checkoutUrl
      const res = await authedFetch("/api/initiate-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceId }),
      });

      if (!res.ok) throw new Error("Failed to initiate payment");
      const { checkoutUrl, error } = await res.json();
      if (error) throw new Error(error);

      // 4. Redirect to Hubtel
      window.location.href = checkoutUrl;
    } catch (e: any) {
      console.error(e);
      setToast({ type: 'error', message: e.message || 'Failed to start payment. Please try again.' });
      setLoading(false);
    }
  }

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <FiLoader className="animate-spin text-sky-600" size={32} />
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-sky-50 via-white to-indigo-50 px-4 py-12">
      {/* Glassy background blobs */}
      <div className="absolute -top-40 -left-40 h-96 w-96 rounded-full bg-sky-300 opacity-30 blur-3xl animate-pulse" />
      <div className="absolute -bottom-40 -right-40 h-96 w-96 rounded-full bg-indigo-300 opacity-30 blur-3xl animate-pulse" />

      {/* Toast */}
      {toast && (
        <div className={`fixed top-6 right-6 z-50 flex items-center gap-3 rounded-2xl border-white/40 bg-white/80 px-5 py-4 shadow-2xl backdrop-blur-2xl transition-all animate-in slide-in-from-top-5 ${
          toast.type === 'success' ? 'text-emerald-700' : 'text-rose-700'
        }`}>
          {toast.type === 'success' ? <FiCheckCircle size={20} /> : <FiAlertCircle size={20} />}
          <p className="font-semibold">{toast.message}</p>
          <button onClick={() => setToast(null)}><FiX size={16} /></button>
        </div>
      )}

      <div className="relative z-10 w-full max-w-lg">
        {/* Close button */}
        <button 
          onClick={() => router.push('/report-card/admin')}
          className="absolute -top-4 -right-4 rounded-full bg-white/70 p-2 backdrop-blur-md shadow-sm hover:bg-white transition"
        >
          <FiX size={18} className="text-slate-600" />
        </button>

        {/* Main Glass Card */}
        <div className="rounded-3xl border-white/40 bg-white/60 p-8 shadow-2xl backdrop-blur-2xl">
          
          {/* Header */}
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500 to-indigo-600 shadow-lg">
              <span className="text-xl font-black text-white">JVS</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Jefsem Vision School</h1>
            <p className="mt-1 text-sm text-slate-500">Unlock Report Card Features</p>
          </div>

          {/* What you get */}
          <div className="mt-6 rounded-2xl bg-white/40 p-4 backdrop-blur-md">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Your organization will get access to</p>
            <ul className="mt-3 space-y-2">
              {[
                { icon: FiFileText, text: "Generate & Print Report Cards" },
                { icon: FiUsers, text: `Access for ${studentCount} Active Students` },
                { icon: FiShield, text: "Secure Cloud Backup & Support" },
              ].map((item) => (
                <li key={item.text} className="flex items-center gap-3 text-sm text-slate-700">
                  <item.icon size={16} className="text-sky-600" />
                  {item.text}
                </li>
              ))}
            </ul>
          </div>

          {/* Amount */}
          <div className="mt-6 rounded-3xl bg-gradient-to-br from-slate-900 to-slate-800 p-6 text-center text-white shadow-inner">
            <p className="text-sm font-medium text-slate-300">Amount Due</p>
            <p className="mt-2 text-5xl font-black tracking-tight">{formatMoney(amountDue)}</p>
            <p className="mt-1 text-xs text-slate-400">₵2.00 per active student · Renews each term</p>
          </div>

          {/* CTA */}
          {amountDue === 0 ? (
            <div className="mt-6 flex items-center justify-center gap-2 rounded-2xl bg-emerald-50 p-4 text-emerald-700">
              <FiCheckCircle />
              <span className="font-semibold">You have full access. No payment needed.</span>
            </div>
          ) : (
            <button 
              onClick={handleClickToPay} 
              disabled={loading} 
              className="group mt-6 w-full flex items-center justify-center gap-3 rounded-2xl bg-gradient-to-r from-sky-600 to-indigo-600 px-6 py-4 text-base font-bold text-white shadow-lg shadow-sky-500/30 transition-all hover:scale-[1.02] hover:shadow-xl hover:shadow-sky-500/40 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? <FiLoader className="animate-spin" size={20} /> : null}
              {loading ? "Redirecting to Hubtel..." : "Click to Pay"}
            </button>
          )}

          <p className="mt-4 text-center text-xs text-slate-400">
            Secure payment powered by Hubtel. You will be redirected to complete payment with MoMo or Card.
          </p>
        </div>

        <p className="mt-4 text-center text-xs text-slate-400">
          Questions? Contact JVS Admin Support
        </p>
      </div>
    </div>
  );
}