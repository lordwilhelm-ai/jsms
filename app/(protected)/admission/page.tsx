"use client";

import EnableNotificationsButton from "@/components/EnableNotificationsButton";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { authedFetch } from "@/lib/apiClient";

type AdmissionApp = {
  id: string;
  student_id: string;
  student_name: string;
  class_applying: string;
  status: string;
  source: string;

  gender?: string | null;
  date_of_birth?: string | null;
  address?: string | null;
  place_of_birth?: string | null;
  hometown?: string | null;
  nationality?: string | null;
  religion?: string | null;
  previous_school?: string | null;
  reason_for_leaving?: string | null;

  nhis_number?: string | null;
  medical_condition?: string | null;
  allergies?: string | null;
  blood_group?: string | null;

  father_name?: string | null;
  father_address?: string | null;
  father_phone?: string | null;
  father_occupation?: string | null;

  mother_name?: string | null;
  mother_address?: string | null;
  mother_phone?: string | null;
  mother_occupation?: string | null;

  stays_with?: string | null;

  guardian_name?: string | null;
  guardian_address?: string | null;
  guardian_phone?: string | null;
  guardian_relationship?: string | null;

  emergency_contact_name?: string | null;
  emergency_contact_phone?: string | null;
  emergency_contact_relation?: string | null;

  photo_url?: string | null;
  nhis_card_url?: string | null;
  weighing_card_url?: string | null;
  birth_certificate_url?: string | null;
  document_1_url?: string | null;
  document_2_url?: string | null;
  document_3_url?: string | null;

  form_price?: number | null;
  form_payment_status?: string | null;
  form_receipt_number?: string | null;

  paid_amount?: number | null;
  receipt_number?: string | null;
  payment_method?: string | null;
  payer_name?: string | null;
  payer_phone?: string | null;
  payment_date?: string | null;

  created_at?: string;
};

type AdmissionSettings = {
  id: string;
  form_price: number;
  admission_open: boolean;
  online_admission_open: boolean;
};

type ClassItem = {
  id?: string;
  class_name: string;
};

const STORAGE_BUCKET = "admission-documents";

const emptyDetails: Partial<AdmissionApp> = {
  student_name: "",
  class_applying: "",
  gender: "",
  date_of_birth: "",
  address: "",
  place_of_birth: "",
  hometown: "",
  nationality: "Ghanaian",
  religion: "",
  previous_school: "",
  reason_for_leaving: "",
  nhis_number: "",
  medical_condition: "",
  allergies: "",
  blood_group: "",
  father_name: "",
  father_address: "",
  father_phone: "",
  father_occupation: "",
  mother_name: "",
  mother_address: "",
  mother_phone: "",
  mother_occupation: "",
  stays_with: "both_parents",
  guardian_name: "",
  guardian_address: "",
  guardian_phone: "",
  guardian_relationship: "",
};

export default function AdmissionAdminPage() {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [settings, setSettings] = useState<AdmissionSettings | null>(null);
  const [settingsPrice, setSettingsPrice] = useState("");

  const [apps, setApps] = useState<AdmissionApp[]>([]);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const [sellForm, setSellForm] = useState({
    student_name: "",
    class_applying: "",
    amount: "",
    payment_method: "cash",
    payer_name: "",
    payer_phone: "",
  });

  const [selected, setSelected] = useState<AdmissionApp | null>(null);
  const [details, setDetails] = useState<Partial<AdmissionApp>>(emptyDetails);

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    setLoading(true);
    setError(null);

    const [settingsRes, classesRes, appsRes] = await Promise.all([
      supabase.from("admission_settings").select("*").limit(1).maybeSingle(),
      supabase.from("classes").select("*").order("class_order", { ascending: true }),
      supabase.from("v_admission_applications").select("*").order("created_at", { ascending: false }),
    ]);

    if (settingsRes.error) setError(settingsRes.error.message);
    if (classesRes.error) setError(classesRes.error.message);
    if (appsRes.error) setError(appsRes.error.message);

    if (settingsRes.data) {
      setSettings(settingsRes.data as AdmissionSettings);
      setSettingsPrice(String(settingsRes.data.form_price ?? 0));
    }

    setClasses(
      (classesRes.data || []).map((c: any) => ({
        id: c.id,
        class_name: c.class_name || c.name || "",
      }))
    );

    setApps((appsRes.data || []) as AdmissionApp[]);
    setLoading(false);
  }

  const filteredApps = useMemo(() => {
    const q = query.trim().toLowerCase();

    return apps.filter((app) => {
      const matchesSearch =
        !q ||
        app.student_name?.toLowerCase().includes(q) ||
        app.student_id?.toLowerCase().includes(q) ||
        app.class_applying?.toLowerCase().includes(q) ||
        app.form_receipt_number?.toLowerCase().includes(q) ||
        app.receipt_number?.toLowerCase().includes(q);

      const matchesStatus = statusFilter === "all" || app.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [apps, query, statusFilter]);

  const stats = useMemo(() => {
    return {
      total: apps.length,
      formBought: apps.filter((x) => x.status === "form_bought").length,
      pending: apps.filter((x) => x.status === "submitted" || x.status === "details_pending").length,
      admitted: apps.filter((x) => x.status === "admitted").length,
      online: apps.filter((x) => x.source === "online").length,
    };
  }, [apps]);

  function showSuccess(message: string) {
    setSuccess(message);
    setError(null);
    setTimeout(() => setSuccess(null), 3500);
  }

  function showError(message: string) {
    setError(message);
    setSuccess(null);
  }

  async function updateSettings() {
    setBusy(true);

    try {
      const response = await authedFetch("/api/admission-update-price", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ form_price: Number(settingsPrice || 0) }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to save admission form price.");

      showSuccess("Admission form price saved.");
      await loadAll();
    } catch (error: any) {
      showError(error?.message || "Failed to save admission form price.");
    } finally {
      setBusy(false);
    }
  }

  async function handleSellForm(e: React.FormEvent) {
    e.preventDefault();

    if (!sellForm.student_name.trim()) return showError("Student name is required.");
    if (!sellForm.class_applying.trim()) return showError("Class applying for is required.");

    setBusy(true);

    try {
      const response = await authedFetch("/api/admission-sell-form", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          student_name: sellForm.student_name.trim(),
          class_applying: sellForm.class_applying,
          amount: sellForm.amount ? Number(sellForm.amount) : null,
          payment_method: sellForm.payment_method,
          payer_name: sellForm.payer_name || null,
          payer_phone: sellForm.payer_phone || null,
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to save admission form purchase.");

      setSellForm({
        student_name: "",
        class_applying: "",
        amount: "",
        payment_method: "cash",
        payer_name: "",
        payer_phone: "",
      });

      showSuccess(`Form saved. Receipt: ${data.receiptNumber || "Generated"}`);
      await loadAll();
    } catch (error: any) {
      showError(error?.message || "Failed to save admission form purchase.");
    } finally {
      setBusy(false);
    }
  }

  function openDetails(app: AdmissionApp) {
    setSelected(app);
    setDetails({
      ...emptyDetails,
      ...app,
      date_of_birth: app.date_of_birth || "",
      stays_with: app.stays_with || "both_parents",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function getEmergencyContact(d: Partial<AdmissionApp>) {
    if (d.stays_with === "mother") {
      return { name: d.mother_name || "", phone: d.mother_phone || "", relation: "Mother" };
    }

    if (d.stays_with === "guardian") {
      return {
        name: d.guardian_name || "",
        phone: d.guardian_phone || "",
        relation: d.guardian_relationship || "Guardian",
      };
    }

    return { name: d.father_name || "", phone: d.father_phone || "", relation: "Father" };
  }

  async function saveDetails(e: React.FormEvent) {
    e.preventDefault();

    if (!selected) return;
    if (!details.student_name?.trim()) return showError("Student name is required.");
    if (!details.class_applying?.trim()) return showError("Class is required.");

    setBusy(true);

    try {
      const response = await authedFetch("/api/admission-save-details", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          application_id: selected.id,
          student_name: details.student_name || null,
          class_applying: details.class_applying || null,
          gender: details.gender || null,
          date_of_birth: details.date_of_birth || null,
          place_of_birth: details.place_of_birth || null,
          hometown: details.hometown || null,
          nationality: details.nationality || null,
          religion: details.religion || null,
          address: details.address || null,
          previous_school: details.previous_school || null,
          reason_for_leaving: details.reason_for_leaving || null,
          nhis_number: details.nhis_number || null,
          medical_condition: details.medical_condition || null,
          allergies: details.allergies || null,
          blood_group: details.blood_group || null,
          father_name: details.father_name || null,
          father_address: details.father_address || null,
          father_phone: details.father_phone || null,
          father_occupation: details.father_occupation || null,
          mother_name: details.mother_name || null,
          mother_address: details.mother_address || null,
          mother_phone: details.mother_phone || null,
          mother_occupation: details.mother_occupation || null,
          stays_with: details.stays_with || null,
          guardian_name: details.guardian_name || null,
          guardian_address: details.guardian_address || null,
          guardian_phone: details.guardian_phone || null,
          guardian_relationship: details.guardian_relationship || null,
          photo_url: details.photo_url || null,
          nhis_card_url: details.nhis_card_url || null,
          weighing_card_url: details.weighing_card_url || null,
          birth_certificate_url: details.birth_certificate_url || null,
          document_1_url: details.document_1_url || null,
          document_2_url: details.document_2_url || null,
          document_3_url: details.document_3_url || null,
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to save admission details.");

      showSuccess("Admission details saved.");
      await loadAll();
    } catch (error: any) {
      showError(error?.message || "Failed to save admission details.");
    } finally {
      setBusy(false);
    }
  }

  async function admitStudent() {
    if (!selected) return;

    const confirmAdmit = window.confirm(
      `Admit ${selected.student_name} into ${selected.class_applying}? This will add the child to the main students database.`
    );

    if (!confirmAdmit) return;

    setBusy(true);

    try {
      const response = await authedFetch("/api/admission-admit-student", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ application_id: selected.id }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to admit student.");

      showSuccess("Student admitted successfully.");
      setSelected(null);
      setDetails(emptyDetails);
      await loadAll();
    } catch (error: any) {
      showError(error?.message || "Failed to admit student.");
    } finally {
      setBusy(false);
    }
  }

  async function uploadFile(field: keyof AdmissionApp, file: File | null) {
    if (!selected || !file) return;

    setBusy(true);

    const ext = file.name.split(".").pop();
    const safeName = `${field}-${Date.now()}.${ext}`;
    const path = `${selected.student_id}/${safeName}`;

    const { error: uploadError } = await supabase.storage.from(STORAGE_BUCKET).upload(path, file, { upsert: true });

    if (uploadError) {
      setBusy(false);
      return showError(`Create a public Supabase Storage bucket named "${STORAGE_BUCKET}" first. ${uploadError.message}`);
    }

    const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path);

    setDetails((prev) => ({ ...prev, [field]: data.publicUrl }));
    setBusy(false);
    showSuccess("File uploaded. Click Save Details to store it.");
  }

  function printReceipt(app: AdmissionApp) {
    const receipt = app.form_receipt_number || app.receipt_number || "";
    const amount = app.paid_amount || app.form_price || 0;

    const html = `
      <html>
        <head>
          <title>Admission Receipt</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 30px; color: #111827; }
            .receipt { max-width: 520px; margin: auto; border: 2px solid #111827; border-radius: 16px; padding: 24px; }
            h1 { text-align: center; margin: 0; font-size: 22px; }
            h2 { text-align: center; margin: 8px 0 22px; font-size: 16px; color: #4b5563; }
            .row { display: flex; justify-content: space-between; border-bottom: 1px dashed #d1d5db; padding: 10px 0; gap: 20px; }
            .label { font-weight: 700; }
            .receipt-no { text-align: center; font-size: 20px; font-weight: 800; margin: 18px 0; padding: 12px; background: #f3f4f6; border-radius: 12px; }
            .footer { margin-top: 30px; font-size: 12px; text-align: center; color: #6b7280; }
          </style>
        </head>
        <body>
          <div class="receipt">
            <h1>Jefsem Vision School</h1>
            <h2>Admission Form Receipt</h2>
            <div class="receipt-no">${receipt}</div>
            <div class="row"><span class="label">Student ID</span><span>${app.student_id || ""}</span></div>
            <div class="row"><span class="label">Student Name</span><span>${app.student_name || ""}</span></div>
            <div class="row"><span class="label">Class Applying</span><span>${app.class_applying || ""}</span></div>
            <div class="row"><span class="label">Amount</span><span>GHS ${Number(amount).toFixed(2)}</span></div>
            <div class="row"><span class="label">Payment Method</span><span>${app.payment_method || "cash"}</span></div>
            <div class="row"><span class="label">Payer Name</span><span>${app.payer_name || ""}</span></div>
            <div class="row"><span class="label">Payer Phone</span><span>${app.payer_phone || ""}</span></div>
            <div class="footer">Keep this receipt or receipt number for admission confirmation.</div>
          </div>
          <script>window.print();</script>
        </body>
      </html>
    `;

    const win = window.open("", "_blank", "width=700,height=800");
    if (!win) return;
    win.document.write(html);
    win.document.close();
  }

  const emergency = getEmergencyContact(details);

  if (loading) {
    return (
      <main style={styles.page}>
        <div style={styles.loadingCard}>Loading admission module...</div>
      </main>
    );
  }

  return (
    <main style={styles.page}>
      <style>{`
        @media (max-width: 900px) {
          .admission-top-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>

      <section style={styles.header}>
        <div>
          <p style={styles.eyebrow}>🎓 JSMS Admission</p>
          <h1 style={styles.title}>Admission Management</h1>
          <p style={styles.subtitle}>Sell forms, complete applicant details, print receipts, and admit students into JSMS.</p>
        </div>

        <div style={styles.headerActions}>
          <EnableNotificationsButton
            role="admin"
            userId={null}
            teacherId={null}
          />

          <button style={styles.refreshBtn} onClick={loadAll} disabled={busy}>
            Refresh
          </button>
        </div>
      </section>

      {error && <div style={styles.errorBox}>⚠️ {error}</div>}
      {success && <div style={styles.successBox}>✅ {success}</div>}

      <section style={styles.statsGrid}>
        <StatCard label="Total Applicants" value={stats.total} icon="📋" />
        <StatCard label="Forms Bought" value={stats.formBought} icon="🧾" />
        <StatCard label="Pending" value={stats.pending} icon="📝" />
        <StatCard label="Admitted" value={stats.admitted} icon="✅" />
        <StatCard label="Online" value={stats.online} icon="🌐" />
      </section>

      <section className="admission-top-grid" style={styles.topGrid}>
        <div style={styles.card}>
          <h2 style={styles.cardTitle}>Sell Admission Form</h2>
          <p style={styles.cardText}>Student ID and JVSA receipt will be generated automatically.</p>

          <form onSubmit={handleSellForm} style={styles.form}>
            <Input label="Student Name" value={sellForm.student_name} onChange={(v) => setSellForm((p) => ({ ...p, student_name: v }))} placeholder="e.g. Kofi Mensah" />
            <Select label="Class Applying For" value={sellForm.class_applying} onChange={(v) => setSellForm((p) => ({ ...p, class_applying: v }))} options={classes.map((c) => c.class_name)} placeholder="Select class" />
            <Input label="Amount Paid" value={sellForm.amount} onChange={(v) => setSellForm((p) => ({ ...p, amount: v }))} placeholder={`Default: GHS ${settings?.form_price ?? 0}`} type="number" />
            <Select label="Payment Method" value={sellForm.payment_method} onChange={(v) => setSellForm((p) => ({ ...p, payment_method: v }))} options={["cash", "momo", "bank", "online"]} />
            <Input label="Payer Name" value={sellForm.payer_name} onChange={(v) => setSellForm((p) => ({ ...p, payer_name: v }))} placeholder="Parent/guardian name" />
            <Input label="Payer Phone" value={sellForm.payer_phone} onChange={(v) => setSellForm((p) => ({ ...p, payer_phone: v }))} placeholder="024..." />
            <button style={styles.primaryBtn} disabled={busy}>{busy ? "Saving..." : "Save"}</button>
          </form>
        </div>

        <div style={styles.card}>
          <h2 style={styles.cardTitle}>Admission Settings</h2>
          <p style={styles.cardText}>Change the admission form price anytime.</p>
          <div style={styles.settingsRow}>
            <Input label="Admission Form Price" value={settingsPrice} onChange={setSettingsPrice} type="number" placeholder="0" />
            <button style={styles.goldBtn} onClick={updateSettings} disabled={busy}>{busy ? "Saving..." : "Save"}</button>
          </div>
        </div>
      </section>

      {selected && (
        <section style={styles.card}>
          <div style={styles.detailTop}>
            <div>
              <p style={styles.eyebrow}>Applicant Details</p>
              <h2 style={styles.cardTitle}>{selected.student_name} — {selected.student_id}</h2>
              <p style={styles.cardText}>Receipt: {selected.form_receipt_number || selected.receipt_number || "No receipt"}</p>
            </div>
            <div style={styles.detailActions}>
              <button style={styles.lightBtn} onClick={() => printReceipt(selected)}>Print Receipt</button>
              <button style={styles.closeBtn} onClick={() => setSelected(null)}>Close</button>
            </div>
          </div>

          <form onSubmit={saveDetails} style={styles.detailsForm}>
            <FormSection title="Student Details">
              <Input label="Student Name" value={details.student_name || ""} onChange={(v) => setDetails((p) => ({ ...p, student_name: v }))} />
              <Select label="Class" value={details.class_applying || ""} onChange={(v) => setDetails((p) => ({ ...p, class_applying: v }))} options={classes.map((c) => c.class_name)} />
              <Select label="Gender" value={details.gender || ""} onChange={(v) => setDetails((p) => ({ ...p, gender: v }))} options={["Male", "Female"]} placeholder="Select gender" />
              <Input label="Date of Birth" type="date" value={details.date_of_birth || ""} onChange={(v) => setDetails((p) => ({ ...p, date_of_birth: v }))} />
              <Input label="Place of Birth" value={details.place_of_birth || ""} onChange={(v) => setDetails((p) => ({ ...p, place_of_birth: v }))} />
              <Input label="Hometown" value={details.hometown || ""} onChange={(v) => setDetails((p) => ({ ...p, hometown: v }))} />
              <Input label="Nationality" value={details.nationality || ""} onChange={(v) => setDetails((p) => ({ ...p, nationality: v }))} />
              <Input label="Religion" value={details.religion || ""} onChange={(v) => setDetails((p) => ({ ...p, religion: v }))} />
              <Textarea label="Address" value={details.address || ""} onChange={(v) => setDetails((p) => ({ ...p, address: v }))} />
            </FormSection>

            <FormSection title="Previous School / Health">
              <Input label="Previous School" value={details.previous_school || ""} onChange={(v) => setDetails((p) => ({ ...p, previous_school: v }))} />
              <Input label="Reason for Leaving" value={details.reason_for_leaving || ""} onChange={(v) => setDetails((p) => ({ ...p, reason_for_leaving: v }))} />
              <Input label="NHIS Number" value={details.nhis_number || ""} onChange={(v) => setDetails((p) => ({ ...p, nhis_number: v }))} />
              <Input label="Blood Group" value={details.blood_group || ""} onChange={(v) => setDetails((p) => ({ ...p, blood_group: v }))} />
              <Input label="Allergies" value={details.allergies || ""} onChange={(v) => setDetails((p) => ({ ...p, allergies: v }))} />
              <Textarea label="Medical Condition" value={details.medical_condition || ""} onChange={(v) => setDetails((p) => ({ ...p, medical_condition: v }))} />
            </FormSection>

            <FormSection title="Father's Details">
              <Input label="Father's Name" value={details.father_name || ""} onChange={(v) => setDetails((p) => ({ ...p, father_name: v }))} />
              <Input label="Father's Phone" value={details.father_phone || ""} onChange={(v) => setDetails((p) => ({ ...p, father_phone: v }))} />
              <Input label="Father's Occupation" value={details.father_occupation || ""} onChange={(v) => setDetails((p) => ({ ...p, father_occupation: v }))} />
              <Textarea label="Father's Address" value={details.father_address || ""} onChange={(v) => setDetails((p) => ({ ...p, father_address: v }))} />
            </FormSection>

            <FormSection title="Mother's Details">
              <Input label="Mother's Name" value={details.mother_name || ""} onChange={(v) => setDetails((p) => ({ ...p, mother_name: v }))} />
              <Input label="Mother's Phone" value={details.mother_phone || ""} onChange={(v) => setDetails((p) => ({ ...p, mother_phone: v }))} />
              <Input label="Mother's Occupation" value={details.mother_occupation || ""} onChange={(v) => setDetails((p) => ({ ...p, mother_occupation: v }))} />
              <Textarea label="Mother's Address" value={details.mother_address || ""} onChange={(v) => setDetails((p) => ({ ...p, mother_address: v }))} />
            </FormSection>

            <FormSection title="Who Does The Child Stay With?">
              <Select label="Stays With" value={details.stays_with || "both_parents"} onChange={(v) => setDetails((p) => ({ ...p, stays_with: v }))} options={["both_parents", "father", "mother", "guardian"]} optionLabels={{ both_parents: "Both Parents", father: "Father", mother: "Mother", guardian: "Guardian" }} />
              {details.stays_with === "guardian" && (
                <>
                  <Input label="Guardian Name" value={details.guardian_name || ""} onChange={(v) => setDetails((p) => ({ ...p, guardian_name: v }))} />
                  <Input label="Guardian Phone" value={details.guardian_phone || ""} onChange={(v) => setDetails((p) => ({ ...p, guardian_phone: v }))} />
                  <Input label="Guardian Relationship" value={details.guardian_relationship || ""} onChange={(v) => setDetails((p) => ({ ...p, guardian_relationship: v }))} />
                  <Textarea label="Guardian Address" value={details.guardian_address || ""} onChange={(v) => setDetails((p) => ({ ...p, guardian_address: v }))} />
                </>
              )}
              <div style={styles.lockedBox}>
                <b>Emergency Contact Auto-filled</b><br />
                Name: {emergency.name || "—"}<br />
                Phone: {emergency.phone || "—"}<br />
                Relation: {emergency.relation || "—"}
              </div>
            </FormSection>

            <FormSection title="Optional Uploads">
              <FileInput label="Student Picture" onChange={(file) => uploadFile("photo_url", file)} url={details.photo_url} />
              <FileInput label="NHIS Card" onChange={(file) => uploadFile("nhis_card_url", file)} url={details.nhis_card_url} />
              <FileInput label="Weighing Card" onChange={(file) => uploadFile("weighing_card_url", file)} url={details.weighing_card_url} />
              <FileInput label="Birth Certificate" onChange={(file) => uploadFile("birth_certificate_url", file)} url={details.birth_certificate_url} />
              <FileInput label="Document 1" onChange={(file) => uploadFile("document_1_url", file)} url={details.document_1_url} />
              <FileInput label="Document 2" onChange={(file) => uploadFile("document_2_url", file)} url={details.document_2_url} />
              <FileInput label="Document 3" onChange={(file) => uploadFile("document_3_url", file)} url={details.document_3_url} />
            </FormSection>

            <div style={styles.footerActions}>
              <button style={styles.primaryBtnSmall} type="submit" disabled={busy}>{busy ? "Saving..." : "Save Details"}</button>
              <button style={{ ...styles.admitBtn, opacity: selected.status === "admitted" ? 0.5 : 1 }} type="button" disabled={busy || selected.status === "admitted"} onClick={admitStudent}>{selected.status === "admitted" ? "Already Admitted" : "Admit Student"}</button>
            </div>
          </form>
        </section>
      )}

      <section style={styles.card}>
        <div style={styles.listTop}>
          <div>
            <h2 style={styles.cardTitle}>Applicants</h2>
            <p style={styles.cardText}>Search by name, student ID, class, or receipt number.</p>
          </div>
          <div style={styles.filterWrap}>
            <input style={styles.search} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search applicant..." />
            <select style={styles.search} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="all">All Status</option>
              <option value="form_bought">Form Bought</option>
              <option value="details_pending">Details Pending</option>
              <option value="submitted">Submitted</option>
              <option value="admitted">Admitted</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>
        </div>

        <div style={styles.tableWrap}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Student</th>
                <th style={styles.th}>Class</th>
                <th style={styles.th}>Receipt</th>
                <th style={styles.th}>Source</th>
                <th style={styles.th}>Status</th>
                <th style={styles.th}>Amount</th>
                <th style={styles.th}>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredApps.map((app) => (
                <tr key={app.id} style={styles.tr}>
                  <td style={styles.td}><b>{app.student_name}</b><br /><span style={styles.muted}>{app.student_id}</span></td>
                  <td style={styles.td}>{app.class_applying}</td>
                  <td style={styles.td}><span style={styles.receiptPill}>{app.form_receipt_number || app.receipt_number || "—"}</span></td>
                  <td style={styles.td}><span style={app.source === "online" ? styles.onlinePill : styles.manualPill}>{app.source}</span></td>
                  <td style={styles.td}><span style={getStatusStyle(app.status)}>{labelStatus(app.status)}</span></td>
                  <td style={styles.td}>GHS {Number(app.paid_amount || app.form_price || 0).toFixed(2)}</td>
                  <td style={styles.td}>
                    <div style={styles.rowActions}>
                      <button style={styles.smallBtn} onClick={() => openDetails(app)}>Open</button>
                      <button style={styles.smallLightBtn} onClick={() => printReceipt(app)}>Print</button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredApps.length === 0 && (
                <tr><td style={styles.emptyTd} colSpan={7}>No admission records found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

function StatCard({ label, value, icon }: { label: string; value: number; icon: string }) {
  return (
    <div style={styles.statCard}>
      <div style={styles.statIcon}>{icon}</div>
      <div>
        <div style={styles.statValue}>{value}</div>
        <div style={styles.statLabel}>{label}</div>
      </div>
    </div>
  );
}

function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={styles.formSection}>
      <h3 style={styles.sectionTitle}>{title}</h3>
      <div style={styles.formGrid}>{children}</div>
    </section>
  );
}

function Input({ label, value, onChange, placeholder, type = "text" }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; type?: string }) {
  return (
    <label style={styles.field}>
      <span style={styles.label}>{label}</span>
      <input style={styles.input} type={type} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

function Textarea({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label style={{ ...styles.field, gridColumn: "1 / -1" }}>
      <span style={styles.label}>{label}</span>
      <textarea style={styles.textarea} value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

function Select({ label, value, onChange, options, placeholder, optionLabels }: { label: string; value: string; onChange: (value: string) => void; options: string[]; placeholder?: string; optionLabels?: Record<string, string> }) {
  return (
    <label style={styles.field}>
      <span style={styles.label}>{label}</span>
      <select style={styles.input} value={value} onChange={(e) => onChange(e.target.value)}>
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((opt) => <option key={opt} value={opt}>{optionLabels?.[opt] || opt}</option>)}
      </select>
    </label>
  );
}

function FileInput({ label, onChange, url }: { label: string; onChange: (file: File | null) => void; url?: string | null }) {
  return (
    <label style={styles.field}>
      <span style={styles.label}>{label}</span>
      <input style={styles.fileInput} type="file" onChange={(e) => onChange(e.target.files?.[0] || null)} />
      {url && <a style={styles.fileLink} href={url} target="_blank">View uploaded file</a>}
    </label>
  );
}

function labelStatus(status: string) {
  const map: Record<string, string> = {
    form_bought: "Form Bought",
    details_pending: "Details Pending",
    submitted: "Submitted",
    admitted: "Admitted",
    rejected: "Rejected",
    cancelled: "Cancelled",
  };
  return map[status] || status;
}

function getStatusStyle(status: string): React.CSSProperties {
  if (status === "admitted") return styles.greenPill;
  if (status === "submitted") return styles.bluePill;
  if (status === "details_pending") return styles.orangePill;
  if (status === "rejected") return styles.redPill;
  return styles.grayPill;
}

const styles: Record<string, React.CSSProperties> = {
  page: { minHeight: "100vh", padding: "24px", background: "linear-gradient(135deg, #f7f3e8 0%, #eef7ef 45%, #ffffff 100%)", color: "#102016", fontFamily: "Inter, Arial, sans-serif" },
  loadingCard: { background: "#fff", padding: "24px", borderRadius: "18px", boxShadow: "0 18px 45px rgba(16,32,22,0.08)" },
  header: { display: "flex", justifyContent: "space-between", gap: "16px", alignItems: "center", marginBottom: "20px" },
  headerActions: { display: "flex", gap: "10px", alignItems: "center", justifyContent: "flex-end", flexWrap: "wrap" },
  eyebrow: { margin: 0, fontSize: "13px", fontWeight: 800, color: "#0f7a3b", letterSpacing: "0.04em", textTransform: "uppercase" },
  title: { margin: "6px 0", fontSize: "32px", lineHeight: 1.1, color: "#0f2a17" },
  subtitle: { margin: 0, color: "#526157", fontSize: "14px", maxWidth: "720px" },
  refreshBtn: { border: "1px solid #c9d7cd", background: "#ffffff", color: "#0f2a17", padding: "12px 16px", borderRadius: "12px", cursor: "pointer", fontWeight: 800 },
  statsGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "14px", marginBottom: "18px" },
  statCard: { background: "rgba(255,255,255,0.92)", border: "1px solid rgba(15,122,59,0.12)", borderRadius: "18px", padding: "16px", display: "flex", alignItems: "center", gap: "12px", boxShadow: "0 12px 30px rgba(16,32,22,0.06)" },
  statIcon: { width: "42px", height: "42px", borderRadius: "14px", display: "grid", placeItems: "center", background: "#f4e7bd", fontSize: "20px" },
  statValue: { fontSize: "24px", fontWeight: 900, color: "#0f2a17" },
  statLabel: { fontSize: "12px", color: "#526157", fontWeight: 700 },
  topGrid: { display: "grid", gridTemplateColumns: "2fr 1fr", gap: "18px", marginBottom: "18px" },
  card: { background: "rgba(255,255,255,0.95)", border: "1px solid rgba(15,122,59,0.12)", borderRadius: "22px", padding: "20px", boxShadow: "0 18px 45px rgba(16,32,22,0.08)", marginBottom: "18px" },
  cardTitle: { margin: 0, color: "#0f2a17", fontSize: "20px" },
  cardText: { margin: "6px 0 0", color: "#647067", fontSize: "13px" },
  form: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "12px", marginTop: "16px" },
  settingsRow: { display: "grid", gridTemplateColumns: "1fr", gap: "12px", marginTop: "16px" },
  detailsForm: { display: "grid", gap: "16px", marginTop: "16px" },
  formSection: { border: "1px solid #e4e9e5", borderRadius: "18px", padding: "16px", background: "#fbfdfb" },
  sectionTitle: { margin: "0 0 14px", fontSize: "16px", color: "#0f2a17" },
  formGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "12px" },
  field: { display: "flex", flexDirection: "column", gap: "7px" },
  label: { fontSize: "12px", color: "#26352b", fontWeight: 800 },
  input: { width: "100%", padding: "11px 12px", borderRadius: "12px", border: "1px solid #ccd8cf", fontSize: "16px", outline: "none", background: "#ffffff" },
  textarea: { width: "100%", minHeight: "82px", padding: "11px 12px", borderRadius: "12px", border: "1px solid #ccd8cf", fontSize: "16px", outline: "none", resize: "vertical", background: "#ffffff" },
  fileInput: { padding: "10px", borderRadius: "12px", border: "1px dashed #a8b7ad", background: "#ffffff", fontSize: "13px" },
  fileLink: { fontSize: "12px", color: "#0f7a3b", fontWeight: 800, textDecoration: "none" },
  primaryBtn: { border: "none", background: "linear-gradient(135deg, #0f7a3b, #0f2a17)", color: "#ffffff", padding: "12px 16px", borderRadius: "14px", cursor: "pointer", fontWeight: 900, gridColumn: "1 / -1", boxShadow: "0 12px 24px rgba(15,122,59,0.22)" },
  primaryBtnSmall: { border: "none", background: "linear-gradient(135deg, #0f7a3b, #0f2a17)", color: "#ffffff", padding: "12px 16px", borderRadius: "14px", cursor: "pointer", fontWeight: 900, boxShadow: "0 12px 24px rgba(15,122,59,0.22)" },
  goldBtn: { border: "none", background: "linear-gradient(135deg, #c7992f, #8a6112)", color: "#ffffff", padding: "12px 16px", borderRadius: "14px", cursor: "pointer", fontWeight: 900 },
  admitBtn: { border: "none", background: "linear-gradient(135deg, #1d4ed8, #0f2a17)", color: "#ffffff", padding: "12px 16px", borderRadius: "14px", cursor: "pointer", fontWeight: 900 },
  lightBtn: { border: "1px solid #bfd0c5", background: "#ffffff", color: "#0f2a17", padding: "10px 13px", borderRadius: "12px", cursor: "pointer", fontWeight: 800 },
  closeBtn: { border: "1px solid #fecaca", background: "#fff1f2", color: "#991b1b", padding: "10px 13px", borderRadius: "12px", cursor: "pointer", fontWeight: 800 },
  smallBtn: { border: "none", background: "#0f7a3b", color: "#fff", padding: "8px 11px", borderRadius: "10px", cursor: "pointer", fontWeight: 800 },
  smallLightBtn: { border: "1px solid #cbd5ce", background: "#fff", color: "#0f2a17", padding: "8px 11px", borderRadius: "10px", cursor: "pointer", fontWeight: 800 },
  lockedBox: { gridColumn: "1 / -1", background: "#eef7ef", border: "1px solid #b8dcc4", color: "#12351f", padding: "14px", borderRadius: "14px", fontSize: "13px", lineHeight: 1.7 },
  errorBox: { background: "#fff1f2", border: "1px solid #fecaca", color: "#991b1b", padding: "12px 14px", borderRadius: "14px", marginBottom: "14px", fontWeight: 700 },
  successBox: { background: "#ecfdf3", border: "1px solid #bbf7d0", color: "#166534", padding: "12px 14px", borderRadius: "14px", marginBottom: "14px", fontWeight: 700 },
  detailTop: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "14px" },
  detailActions: { display: "flex", gap: "10px", flexWrap: "wrap" },
  footerActions: { display: "flex", justifyContent: "flex-end", gap: "12px", flexWrap: "wrap" },
  listTop: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "16px", marginBottom: "14px" },
  filterWrap: { display: "flex", gap: "10px", flexWrap: "wrap" },
  search: { padding: "11px 12px", borderRadius: "12px", border: "1px solid #ccd8cf", outline: "none", minWidth: "190px", background: "#ffffff" },
  tableWrap: { overflowX: "auto" },
  table: { width: "100%", borderCollapse: "collapse", minWidth: "900px" },
  th: { textAlign: "left", padding: "12px", fontSize: "12px", color: "#526157", borderBottom: "1px solid #e5ebe7", background: "#f8faf8" },
  tr: { borderBottom: "1px solid #edf2ee" },
  td: { padding: "13px 12px", fontSize: "13px", verticalAlign: "middle" },
  emptyTd: { padding: "28px", textAlign: "center", color: "#6b7280" },
  muted: { color: "#6b7280", fontSize: "12px" },
  rowActions: { display: "flex", gap: "8px" },
  receiptPill: { display: "inline-flex", padding: "6px 9px", borderRadius: "999px", background: "#f4e7bd", color: "#5b3d08", fontWeight: 900, fontSize: "12px" },
  onlinePill: { display: "inline-flex", padding: "6px 9px", borderRadius: "999px", background: "#dbeafe", color: "#1d4ed8", fontWeight: 900, fontSize: "12px" },
  manualPill: { display: "inline-flex", padding: "6px 9px", borderRadius: "999px", background: "#f3f4f6", color: "#374151", fontWeight: 900, fontSize: "12px" },
  greenPill: { display: "inline-flex", padding: "6px 9px", borderRadius: "999px", background: "#dcfce7", color: "#166534", fontWeight: 900, fontSize: "12px" },
  bluePill: { display: "inline-flex", padding: "6px 9px", borderRadius: "999px", background: "#dbeafe", color: "#1d4ed8", fontWeight: 900, fontSize: "12px" },
  orangePill: { display: "inline-flex", padding: "6px 9px", borderRadius: "999px", background: "#ffedd5", color: "#c2410c", fontWeight: 900, fontSize: "12px" },
  redPill: { display: "inline-flex", padding: "6px 9px", borderRadius: "999px", background: "#fee2e2", color: "#991b1b", fontWeight: 900, fontSize: "12px" },
  grayPill: { display: "inline-flex", padding: "6px 9px", borderRadius: "999px", background: "#f3f4f6", color: "#374151", fontWeight: 900, fontSize: "12px" },
};
