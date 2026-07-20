"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import TeacherLoginModal from "@/app/components/TeacherLoginModal";

type SchoolSettings = {
  school_name?: string | null;
  motto?: string | null;
  school_motto?: string | null;
  logo_url?: string | null;
  school_logo_url?: string | null;
  logo?: string | null;
};

function clean(value: unknown) {
  return String(value ?? "").trim();
}

export default function Home() {
  const router = useRouter();
  const [settings, setSettings] = useState<SchoolSettings | null>(null);

  useEffect(() => {
    let active = true;

    async function loadSettings() {
      const { data } = await supabase
        .from("school_settings")
        .select("*")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!active) return;
      setSettings(data || null);
    }

    async function checkExistingSession() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!active || !session?.user?.id) return;

      const params =
        typeof window !== "undefined"
          ? new URLSearchParams(window.location.search)
          : null;
      const next = params?.get("next") || null;

      const { data: teacher } = await supabase
        .from("teachers")
        .select("role")
        .eq("auth_user_id", session.user.id)
        .limit(1)
        .single();

      if (!teacher?.role) return;

      if (next && next.startsWith("/")) {
        router.replace(next);
        return;
      }

      if (teacher.role === "teacher") {
        router.replace("/dashboard/teacher");
        return;
      }

      if (teacher.role === "admin" || teacher.role === "super_admin") {
        router.replace("/dashboard/admin");
        return;
      }

      if (teacher.role === "headmaster") {
        router.replace("/dashboard/headmaster");
      }
    }

    void loadSettings();
    void checkExistingSession();

    return () => {
      active = false;
    };
  }, [router]);

  const schoolName = clean(settings?.school_name) || "Jefsem Vision School";

  const motto =
    clean(settings?.motto || settings?.school_motto) || "Success in Excellence";

  const logoUrl = clean(
    settings?.logo_url || settings?.school_logo_url || settings?.logo
  );

  return (
    <main className="min-h-screen bg-[#f7f3df] text-slate-950">
      <section className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4 py-5">
        <header className="flex items-center justify-between gap-3 rounded-[2rem] border border-yellow-200 bg-white/90 p-3 shadow-sm">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-yellow-200 bg-white">
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={logoUrl}
                  alt={`${schoolName} logo`}
                  className="h-full w-full object-contain"
                />
              ) : (
                <span className="text-xl">🎓</span>
              )}
            </div>

            <div className="min-w-0">
              <h1 className="truncate text-sm font-black uppercase tracking-wide text-slate-950 sm:text-base">
                {schoolName}
              </h1>
              <p className="truncate text-xs font-bold text-yellow-700">{motto}</p>
            </div>
          </div>

          <Suspense fallback={null}>
            <TeacherLoginModal />
          </Suspense>
        </header>

        <section className="grid flex-1 items-center gap-6 py-8 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-[2.5rem] bg-slate-950 p-6 text-white shadow-xl sm:p-8">
            <p className="text-xs font-black uppercase tracking-[0.3em] text-yellow-200">
              Welcome to
            </p>

            <h2 className="mt-4 text-4xl font-black leading-tight sm:text-5xl">
              {schoolName}
            </h2>

            <p className="mt-4 max-w-2xl text-base font-semibold leading-7 text-white/80">
              A calm and focused learning environment for children to grow in
              discipline, confidence, and academic excellence.
            </p>

            <div className="mt-7 flex flex-wrap gap-3">
              <Link
                href="/website/admission"
                className="rounded-2xl bg-yellow-500 px-5 py-3 text-sm font-black text-slate-950 shadow-sm transition active:scale-[0.98]"
              >
                Online Admission
              </Link>

              <Link
                href="/parent"
                className="rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-black text-white shadow-sm transition active:scale-[0.98]"
              >
                Parent Portal
              </Link>
            </div>
          </div>

          <div className="grid gap-3">
            <InfoCard
              title="Pre-School"
              text="Playroom, KG, early literacy, numeracy, creativity and care."
              icon="🧒"
            />
            <InfoCard
              title="Primary"
              text="Strong foundation in Maths, English, Science and core subjects."
              icon="📚"
            />
            <InfoCard
              title="JHS"
              text="Focused preparation, discipline, reporting and academic tracking."
              icon="🎯"
            />
          </div>
        </section>

        <section className="grid gap-3 pb-5 md:grid-cols-2">
          <SmallCard label="Online Admission" value="jefsemvision.cc/website/admission" />
          <SmallCard label="Parent Portal" value="jefsemvision.cc/parent?student=STUDENT_ID&class=CLASS" />
        </section>
      </section>
    </main>
  );
}

function InfoCard({
  title,
  text,
  icon,
}: {
  title: string;
  text: string;
  icon: string;
}) {
  return (
    <article className="rounded-[2rem] border border-yellow-200 bg-white p-5 shadow-sm">
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-yellow-100 text-2xl">
          {icon}
        </div>

        <div>
          <h3 className="text-lg font-black text-slate-950">{title}</h3>
          <p className="mt-1 text-sm font-semibold leading-6 text-slate-600">
            {text}
          </p>
        </div>
      </div>
    </article>
  );
}

function SmallCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-3xl border border-yellow-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-black uppercase tracking-wide text-yellow-700">
        {label}
      </p>
      <p className="mt-1 break-words text-sm font-bold text-slate-700">{value}</p>
    </div>
  );
}
