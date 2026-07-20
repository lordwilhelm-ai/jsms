"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

type ClassItem = {
  id?: string;
  class_name: string;
};

type SubmitResult = {
  student_id: string;
  student_name: string;
  class_applying: string;
  receipt_number: string;
  amount: number;
};

const STORAGE_BUCKET = "admission-documents";

const fallbackClasses = [
  "Playroom 1",
  "Playroom 2",
  "KG 1",
  "KG 2",
  "Class 1",
  "Class 2",
  "Class 3",
  "Class 4",
  "Class 5",
  "Class 6",
  "JHS 1",
  "JHS 2",
  "JHS 3",
];

export default function PublicAdmissionPage() {
  return (
    <Suspense fallback={<main style={styles.page} />}>
      <AdmissionForm />
    </Suspense>
  );
}

function AdmissionForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [formPrice, setFormPrice] = useState(0);
  const [admissionsOpen, setAdmissionsOpen] = useState(true);
  const [busy, setBusy] = useState(false);
  const [checkingReturn, setCheckingReturn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [result, setResult] = useState<SubmitResult | null>(null);
  const [cancelledAppId, setCancelledAppId] = useState<string | null>(null);

  const [form, setForm] = useState({
    student_name: "",
    class_applying: "",
    gender: "",
    date_of_birth: "",
    address: "",

    father_name: "",
    father_address: "",
    father_phone: "",

    mother_name: "",
    mother_address: "",
    mother_phone: "",

    stays_with: "both_parents",

    guardian_name: "",
    guardian_address: "",
    guardian_phone: "",
    guardian_relationship: "",

    nhis_number: "",
    payer_name: "",
    payer_phone: "",
  });

  const [files, setFiles] = useState<Record<string, File | null>>({
    photo_url: null,
    nhis_card_url: null,
    weighing_card_url: null,
    birth_certificate_url: null,
    document_1_url: null,
    document_2_url: null,
    document_3_url: null,
  });

  useEffect(() => {
    loadStartupData();
  }, []);

  useEffect(() => {
    const appId = searchParams.get("app");

    if (searchParams.get("paid") === "1" && appId) {
      setCheckingReturn(true);

      fetch(`/api/admission-status?id=${encodeURIComponent(appId)}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.error || !data.application) {
            showError(data.error || "Could not confirm payment. Contact the school with your details.");
            return;
          }

          const app = data.application;
          setResult({
            student_id: app.student_id,
            student_name: app.student_name,
            class_applying: app.class_applying,
            receipt_number: app.form_receipt_number,
            amount: Number(app.form_price || 0),
          });
        })
        .catch(() => showError("Could not confirm payment. Contact the school with your details."))
        .finally(() => {
          setCheckingReturn(false);
          router.replace("/website/admission");
        });
    }

    if (searchParams.get("cancelled") === "1" && appId) {
      setCancelledAppId(appId);
      router.replace("/website/admission");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleRetryPayment() {
    if (!cancelledAppId) return;

    setBusy(true);
    setError(null);

    try {
      const res = await fetch("/api/admission-retry-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ applicationId: cancelledAppId }),
      });

      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "Failed to start payment.");

      window.location.href = data.checkoutUrl;
    } catch (err: any) {
      showError(err?.message || "Failed to start payment.");
      setBusy(false);
    }
  }

  async function loadStartupData() {
    const [settingsRes, classesRes] = await Promise.all([
      supabase.from("admission_settings").select("form_price, online_admission_open").limit(1).maybeSingle(),
      supabase.from("classes").select("*").order("class_order", { ascending: true }),
    ]);

    if (settingsRes.data) {
      setFormPrice(Number(settingsRes.data.form_price || 0));
      setAdmissionsOpen(settingsRes.data.online_admission_open !== false);
    }

    if (classesRes.data && classesRes.data.length > 0) {
      setClasses(
        classesRes.data.map((c: any) => ({
          id: c.id,
          class_name: c.class_name || c.name || "",
        }))
      );
    } else {
      setClasses(fallbackClasses.map((class_name) => ({ class_name })));
    }
  }

  const emergency = useMemo(() => {
    if (form.stays_with === "mother") {
      return {
        name: form.mother_name,
        phone: form.mother_phone,
        relation: "Mother",
      };
    }

    if (form.stays_with === "guardian") {
      return {
        name: form.guardian_name,
        phone: form.guardian_phone,
        relation: form.guardian_relationship || "Guardian",
      };
    }

    return {
      name: form.father_name,
      phone: form.father_phone,
      relation: "Father",
    };
  }, [form]);

  function updateField(key: string, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function showError(message: string) {
    setError(message);
    setSuccess(null);
  }

  function showSuccess(message: string) {
    setSuccess(message);
    setError(null);
  }

  async function uploadOptionalFiles() {
    const urls: Record<string, string | null> = {};
    const tempId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    for (const [field, file] of Object.entries(files)) {
      if (!file) {
        urls[field] = null;
        continue;
      }

      const ext = file.name.split(".").pop() || "file";
      const path = `online-temp/${tempId}/${field}.${ext}`;

      const { error: uploadError } = await supabase.storage.from(STORAGE_BUCKET).upload(path, file, {
        upsert: true,
      });

      if (uploadError) {
        throw new Error(
          `${uploadError.message}. Create a public Supabase Storage bucket named "${STORAGE_BUCKET}".`
        );
      }

      const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path);
      urls[field] = data.publicUrl;
    }

    return urls;
  }


  async function triggerPushNotificationsNow() {
    try {
      const response = await fetch("https://mlpbkrukkmdlkwypunqh.supabase.co/functions/v1/send-jsms-push", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ limit: 25 }),
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        console.error("JSMS push function failed:", payload);
        return { ok: false, payload };
      }

      console.log("JSMS push function result:", payload);
      return { ok: true, payload };
    } catch (err) {
      console.error("JSMS push trigger error:", err);
      return { ok: false, payload: err };
    }
  }

  async function submitAdmission(e: React.FormEvent) {
    e.preventDefault();

    if (!admissionsOpen) return showError("Online admissions are currently closed.");
    if (!form.student_name.trim()) return showError("Student name is required.");
    if (!form.class_applying.trim()) return showError("Select the class applying for.");
    if (!form.payer_name.trim()) return showError("Payer name is required.");
    if (!form.payer_phone.trim()) return showError("Payer phone is required.");

    if (form.stays_with === "guardian" && !form.guardian_phone.trim()) {
      return showError("Guardian phone is required when the child stays with a guardian.");
    }

    setBusy(true);
    setError(null);
    setSuccess(null);

    try {
      const uploaded = await uploadOptionalFiles();

      const res = await fetch("/api/admission-submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          student_name: form.student_name.trim(),
          class_applying: form.class_applying,

          gender: form.gender,
          date_of_birth: form.date_of_birth,
          address: form.address,

          father_name: form.father_name,
          father_address: form.father_address,
          father_phone: form.father_phone,

          mother_name: form.mother_name,
          mother_address: form.mother_address,
          mother_phone: form.mother_phone,

          stays_with: form.stays_with,

          guardian_name: form.guardian_name,
          guardian_address: form.guardian_address,
          guardian_phone: form.guardian_phone,
          guardian_relationship: form.guardian_relationship,

          nhis_number: form.nhis_number,

          photo_url: uploaded.photo_url,
          nhis_card_url: uploaded.nhis_card_url,
          weighing_card_url: uploaded.weighing_card_url,
          birth_certificate_url: uploaded.birth_certificate_url,
          document_1_url: uploaded.document_1_url,
          document_2_url: uploaded.document_2_url,
          document_3_url: uploaded.document_3_url,

          payer_name: form.payer_name,
          payer_phone: form.payer_phone,
        }),
      });

      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "Failed to submit admission form.");

      if (data.checkoutUrl) {
        // Redirect to Hubtel to complete payment — the page picks back up
        // from the returnUrl/cancellationUrl query params on return.
        window.location.href = data.checkoutUrl;
        return;
      }

      // No payment was needed (form price is currently GHS 0) — already paid.
      setResult({
        student_id: data.studentId,
        student_name: form.student_name.trim(),
        class_applying: form.class_applying,
        receipt_number: data.receiptNumber,
        amount: Number(data.amount || 0),
      });

      const pushResult = await triggerPushNotificationsNow();

      if (pushResult.ok) {
        showSuccess("Admission form submitted successfully. Admin has been notified.");
      } else {
        showSuccess("Admission form submitted successfully. Receipt generated. Push notification will process when the function runs.");
      }
    } catch (err: any) {
      showError(err?.message || "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  function printReceipt() {
    if (!result) return;

    const html = `
      <html>
        <head>
          <title>Admission Receipt</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 30px; color: #111827; }
            .receipt { max-width: 540px; margin: auto; border: 2px solid #111827; border-radius: 16px; padding: 24px; }
            h1 { text-align: center; margin: 0; font-size: 22px; }
            h2 { text-align: center; margin: 8px 0 22px; font-size: 16px; color: #4b5563; }
            .receipt-no { text-align: center; font-size: 21px; font-weight: 900; margin: 18px 0; padding: 12px; background: #f3f4f6; border-radius: 12px; }
            .row { display: flex; justify-content: space-between; border-bottom: 1px dashed #d1d5db; padding: 10px 0; gap: 20px; }
            .label { font-weight: 700; }
            .footer { margin-top: 28px; font-size: 12px; text-align: center; color: #6b7280; line-height: 1.6; }
          </style>
        </head>
        <body>
          <div class="receipt">
            <h1>Jefsem Vision School</h1>
            <h2>Admission Form Receipt</h2>
            <div class="receipt-no">${result.receipt_number}</div>
            <div class="row"><span class="label">Student ID</span><span>${result.student_id}</span></div>
            <div class="row"><span class="label">Student Name</span><span>${result.student_name}</span></div>
            <div class="row"><span class="label">Class Applying</span><span>${result.class_applying}</span></div>
            <div class="row"><span class="label">Amount</span><span>GHS ${Number(result.amount || 0).toFixed(2)}</span></div>
            <div class="footer">Bring this receipt or receipt number to the school for confirmation.</div>
          </div>
          <script>window.print();</script>
        </body>
      </html>
    `;

    const win = window.open("", "_blank", "width=720,height=820");
    if (!win) return;
    win.document.write(html);
    win.document.close();
  }

  if (checkingReturn) {
    return (
      <main style={styles.page}>
        <section style={styles.successCard}>
          <p style={styles.eyebrow}>Please wait</p>
          <h1 style={styles.title}>Confirming your payment...</h1>
        </section>
      </main>
    );
  }

  if (result) {
    return (
      <main style={styles.page}>
        <section style={styles.successCard}>
          <div style={styles.bigIcon}>✅</div>
          <p style={styles.eyebrow}>Admission Submitted</p>
          <h1 style={styles.title}>Keep this receipt number</h1>
          <p style={styles.subtitle}>Bring it to the school for confirmation. Admin will see your application inside the Admission module.</p>

          <div style={styles.receiptBox}>{result.receipt_number}</div>

          <div style={styles.resultGrid}>
            <ResultItem label="Student ID" value={result.student_id} />
            <ResultItem label="Student Name" value={result.student_name} />
            <ResultItem label="Class" value={result.class_applying} />
            <ResultItem label="Amount" value={`GHS ${Number(result.amount || 0).toFixed(2)}`} />
          </div>

          <button style={styles.primaryBtn} onClick={printReceipt}>Print Receipt</button>
          <button
            style={styles.lightBtn}
            onClick={() => {
              setResult(null);
              window.location.reload();
            }}
          >
            Submit Another Application
          </button>
        </section>
      </main>
    );
  }

  if (cancelledAppId) {
    return (
      <main style={styles.page}>
        <section style={styles.successCard}>
          <div style={styles.bigIcon}>⚠️</div>
          <p style={styles.eyebrow}>Payment Cancelled</p>
          <h1 style={styles.title}>Your admission form wasn&apos;t paid for</h1>
          <p style={styles.subtitle}>Your details are saved. You can try the payment again, or start over.</p>

          {error && <div style={styles.errorBox}>⚠️ {error}</div>}

          <button style={styles.primaryBtn} onClick={handleRetryPayment} disabled={busy}>
            {busy ? "Starting payment..." : "Try Payment Again"}
          </button>
          <button
            style={styles.lightBtn}
            onClick={() => {
              setCancelledAppId(null);
              setError(null);
            }}
          >
            Start a New Application
          </button>
        </section>
      </main>
    );
  }

  return (
    <main style={styles.page}>
      <section style={styles.hero}>
        <div>
          <p style={styles.eyebrow}>Jefsem Vision School</p>
          <h1 style={styles.title}>Online Admission Form</h1>
          <p style={styles.subtitle}>Fill the form below. A Student ID and JVSA receipt number will be generated automatically.</p>
        </div>

        <div style={styles.priceCard}>
          <span>Admission Form</span>
          <b>GHS {Number(formPrice || 0).toFixed(2)}</b>
        </div>
      </section>

      {error && <div style={styles.errorBox}>⚠️ {error}</div>}
      {success && <div style={styles.successBox}>✅ {success}</div>}
      {!admissionsOpen && (
        <div style={styles.errorBox}>⚠️ Online admissions are currently closed. Please contact the school directly.</div>
      )}

      <form onSubmit={submitAdmission} style={styles.formCard}>
        <FormSection title="Student Details">
          <Input label="Student Name" value={form.student_name} onChange={(v) => updateField("student_name", v)} required />
          <Select label="Class Applying For" value={form.class_applying} onChange={(v) => updateField("class_applying", v)} options={classes.map((c) => c.class_name)} required />
          <Select label="Gender" value={form.gender} onChange={(v) => updateField("gender", v)} options={["Male", "Female"]} />
          <Input label="Date of Birth" type="date" value={form.date_of_birth} onChange={(v) => updateField("date_of_birth", v)} />
          <Input label="NHIS Number" value={form.nhis_number} onChange={(v) => updateField("nhis_number", v)} />
          <Textarea label="Address" value={form.address} onChange={(v) => updateField("address", v)} />
        </FormSection>

        <FormSection title="Father's Details">
          <Input label="Father's Name" value={form.father_name} onChange={(v) => updateField("father_name", v)} />
          <Input label="Father's Phone" value={form.father_phone} onChange={(v) => updateField("father_phone", v)} />
          <Textarea label="Father's Address" value={form.father_address} onChange={(v) => updateField("father_address", v)} />
        </FormSection>

        <FormSection title="Mother's Details">
          <Input label="Mother's Name" value={form.mother_name} onChange={(v) => updateField("mother_name", v)} />
          <Input label="Mother's Phone" value={form.mother_phone} onChange={(v) => updateField("mother_phone", v)} />
          <Textarea label="Mother's Address" value={form.mother_address} onChange={(v) => updateField("mother_address", v)} />
        </FormSection>

        <FormSection title="Living With / Emergency Contact">
          <Select
            label="Who does the child stay with?"
            value={form.stays_with}
            onChange={(v) => updateField("stays_with", v)}
            options={["both_parents", "father", "mother", "guardian"]}
            labels={{ both_parents: "Both Parents", father: "Father", mother: "Mother", guardian: "Guardian" }}
          />

          {form.stays_with === "guardian" && (
            <>
              <Input label="Guardian Name" value={form.guardian_name} onChange={(v) => updateField("guardian_name", v)} />
              <Input label="Guardian Phone" value={form.guardian_phone} onChange={(v) => updateField("guardian_phone", v)} />
              <Input label="Relationship" value={form.guardian_relationship} onChange={(v) => updateField("guardian_relationship", v)} />
              <Textarea label="Guardian Address" value={form.guardian_address} onChange={(v) => updateField("guardian_address", v)} />
            </>
          )}

          <div style={styles.lockedBox}>
            <b>Emergency Contact</b>
            <span>Name: {emergency.name || "—"}</span>
            <span>Phone: {emergency.phone || "—"}</span>
            <span>Relation: {emergency.relation || "—"}</span>
          </div>
        </FormSection>

        <FormSection title="Optional Documents">
          <FileInput label="Student Picture" onChange={(file) => setFiles((p) => ({ ...p, photo_url: file }))} />
          <FileInput label="NHIS Card" onChange={(file) => setFiles((p) => ({ ...p, nhis_card_url: file }))} />
          <FileInput label="Weighing Card" onChange={(file) => setFiles((p) => ({ ...p, weighing_card_url: file }))} />
          <FileInput label="Birth Certificate" onChange={(file) => setFiles((p) => ({ ...p, birth_certificate_url: file }))} />
          <FileInput label="Document 1" onChange={(file) => setFiles((p) => ({ ...p, document_1_url: file }))} />
          <FileInput label="Document 2" onChange={(file) => setFiles((p) => ({ ...p, document_2_url: file }))} />
          <FileInput label="Document 3" onChange={(file) => setFiles((p) => ({ ...p, document_3_url: file }))} />
        </FormSection>

        <FormSection title="Payment Details">
          <Input label="Payer Name" value={form.payer_name} onChange={(v) => updateField("payer_name", v)} required />
          <Input label="Payer Phone" value={form.payer_phone} onChange={(v) => updateField("payer_phone", v)} required />
          <div style={styles.noticeBox}>
            You&apos;ll be redirected to Hubtel to pay GHS {Number(formPrice || 0).toFixed(2)} securely via Mobile Money or Card. Your form is saved before you pay.
          </div>
        </FormSection>

        <button style={styles.primaryBtn} disabled={busy || !admissionsOpen}>
          {busy ? "Please wait..." : "Continue to Payment"}
        </button>
      </form>
    </main>
  );
}

function ResultItem({ label, value }: { label: string; value: string }) {
  return (
    <div style={styles.resultItem}>
      <span>{label}</span>
      <b>{value}</b>
    </div>
  );
}

function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={styles.section}>
      <h2 style={styles.sectionTitle}>{title}</h2>
      <div style={styles.grid}>{children}</div>
    </section>
  );
}

function Input({
  label,
  value,
  onChange,
  type = "text",
  required = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
}) {
  return (
    <label style={styles.field}>
      <span>{label}{required ? " *" : ""}</span>
      <input style={styles.input} value={value} type={type} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

function Textarea({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label style={{ ...styles.field, gridColumn: "1 / -1" }}>
      <span>{label}</span>
      <textarea style={styles.textarea} value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
  labels,
  required = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
  labels?: Record<string, string>;
  required?: boolean;
}) {
  return (
    <label style={styles.field}>
      <span>{label}{required ? " *" : ""}</span>
      <select style={styles.input} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Select</option>
        {options.map((opt) => (
          <option key={opt} value={opt}>{labels?.[opt] || opt}</option>
        ))}
      </select>
    </label>
  );
}

function FileInput({ label, onChange }: { label: string; onChange: (file: File | null) => void }) {
  return (
    <label style={styles.field}>
      <span>{label}</span>
      <input style={styles.fileInput} type="file" onChange={(e) => onChange(e.target.files?.[0] || null)} />
    </label>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    padding: "clamp(12px, 4vw, 24px)",
    background: "linear-gradient(135deg, #f8f2df 0%, #eef7ef 45%, #ffffff 100%)",
    color: "#102016",
    fontFamily: "Inter, Arial, sans-serif",
  },
  hero: {
    maxWidth: "1100px",
    margin: "0 auto 18px",
    display: "flex",
    flexWrap: "wrap",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "14px",
  },
  eyebrow: {
    margin: 0,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    color: "#0f7a3b",
    fontWeight: 900,
    fontSize: "13px",
  },
  title: {
    margin: "6px 0",
    fontSize: "clamp(24px, 6vw, 32px)",
    lineHeight: 1.15,
    color: "#0f2a17",
  },
  subtitle: {
    margin: 0,
    color: "#5d6b62",
    fontSize: "14px",
    maxWidth: "680px",
  },
  priceCard: {
    background: "#ffffff",
    border: "1px solid rgba(15,122,59,0.16)",
    borderRadius: "18px",
    padding: "16px 18px",
    minWidth: "180px",
    width: "100%",
    maxWidth: "260px",
    boxShadow: "0 14px 35px rgba(16,32,22,0.08)",
    display: "grid",
    gap: "4px",
  },
  formCard: {
    maxWidth: "1100px",
    margin: "0 auto",
    background: "rgba(255,255,255,0.95)",
    border: "1px solid rgba(15,122,59,0.12)",
    borderRadius: "24px",
    padding: "clamp(14px, 4vw, 20px)",
    boxShadow: "0 18px 45px rgba(16,32,22,0.08)",
    display: "grid",
    gap: "16px",
  },
  section: {
    border: "1px solid #e3ebe5",
    borderRadius: "18px",
    padding: "16px",
    background: "#fbfdfb",
  },
  sectionTitle: {
    margin: "0 0 14px",
    fontSize: "17px",
    color: "#0f2a17",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: "12px",
  },
  field: {
    display: "flex",
    flexDirection: "column",
    gap: "7px",
    fontSize: "12px",
    fontWeight: 900,
    color: "#26352b",
  },
  input: {
    width: "100%",
    border: "1px solid #ccd8cf",
    borderRadius: "12px",
    padding: "11px 12px",
    fontSize: "16px",
    outline: "none",
    background: "#ffffff",
  },
  textarea: {
    width: "100%",
    minHeight: "82px",
    border: "1px solid #ccd8cf",
    borderRadius: "12px",
    padding: "11px 12px",
    fontSize: "16px",
    outline: "none",
    resize: "vertical",
    background: "#ffffff",
  },
  fileInput: {
    border: "1px dashed #9fb3a6",
    borderRadius: "12px",
    padding: "10px",
    background: "#ffffff",
  },
  lockedBox: {
    gridColumn: "1 / -1",
    display: "grid",
    gap: "6px",
    padding: "14px",
    borderRadius: "14px",
    background: "#eef7ef",
    border: "1px solid #b8dcc4",
    color: "#12351f",
    fontSize: "13px",
  },
  noticeBox: {
    gridColumn: "1 / -1",
    padding: "14px",
    borderRadius: "14px",
    background: "#f8f1dc",
    border: "1px solid #e5cd85",
    color: "#4a3510",
    fontSize: "13px",
    lineHeight: 1.6,
  },
  primaryBtn: {
    border: "none",
    background: "linear-gradient(135deg, #0f7a3b, #0f2a17)",
    color: "#ffffff",
    padding: "13px 18px",
    minHeight: "48px",
    width: "100%",
    fontSize: "15px",
    borderRadius: "14px",
    cursor: "pointer",
    fontWeight: 900,
    boxShadow: "0 12px 24px rgba(15,122,59,0.22)",
  },
  lightBtn: {
    border: "1px solid #bfd0c5",
    background: "#ffffff",
    color: "#0f2a17",
    padding: "13px 18px",
    minHeight: "48px",
    width: "100%",
    fontSize: "15px",
    borderRadius: "14px",
    cursor: "pointer",
    fontWeight: 900,
    marginTop: "10px",
  },
  errorBox: {
    maxWidth: "1100px",
    margin: "0 auto 14px",
    background: "#fff1f2",
    border: "1px solid #fecaca",
    color: "#991b1b",
    padding: "12px 14px",
    borderRadius: "14px",
    fontWeight: 800,
  },
  successBox: {
    maxWidth: "1100px",
    margin: "0 auto 14px",
    background: "#ecfdf3",
    border: "1px solid #bbf7d0",
    color: "#166534",
    padding: "12px 14px",
    borderRadius: "14px",
    fontWeight: 800,
  },
  successCard: {
    maxWidth: "720px",
    margin: "clamp(20px, 8vw, 50px) auto",
    background: "#ffffff",
    border: "1px solid rgba(15,122,59,0.14)",
    borderRadius: "26px",
    padding: "clamp(18px, 5vw, 28px)",
    boxShadow: "0 18px 45px rgba(16,32,22,0.1)",
    textAlign: "center",
  },
  bigIcon: {
    width: "64px",
    height: "64px",
    borderRadius: "22px",
    display: "grid",
    placeItems: "center",
    margin: "0 auto 14px",
    background: "#dcfce7",
    fontSize: "30px",
  },
  receiptBox: {
    margin: "18px auto",
    padding: "16px",
    borderRadius: "16px",
    background: "#f8f1dc",
    border: "1px solid #e5cd85",
    fontSize: "24px",
    fontWeight: 950,
    color: "#4a3510",
  },
  resultGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
    gap: "12px",
    margin: "20px 0",
  },
  resultItem: {
    border: "1px solid #e5ebe7",
    borderRadius: "14px",
    padding: "14px",
    display: "grid",
    gap: "5px",
    textAlign: "left",
  },
};
