"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

const BILL_RATE = 2;
const BILL_WINDOW_DAYS = 90; // 1 term = 90 days

type LicenseRow = {
  id: string;
  payment_status: string | null;
  paid_student_count: number | null;
  cycle_start_at: string | null;
  academic_year: string | null;
  term: string | null;
  amount: number | null;
}

function cleanLower(value: unknown) { return String(value || "").trim().toLowerCase(); }

function isActiveStudent(student: any) {
  const status = cleanLower(student.status);
  if (student.left_school === true) return false;
  if (student.is_active === false) return false;
  if (student.active === false) return false;
  if (status === "inactive" || status === "left" || status === "withdrawn") return false;
  return true;
}

export function useReportCardAccess() {
  const [canAccess, setCanAccess] = useState(false);
  const [checking, setChecking] = useState(true);
  const [amountDue, setAmountDue] = useState(0);
  const [license, setLicense] = useState<LicenseRow | null>(null);
  const [studentCount, setStudentCount] = useState(0);

  useEffect(() => {
    async function checkAccess() {
      setChecking(true);
      
      // 1. Get ACTIVE students count only - same as your dashboard
      const { data: allStudents } = await supabase
       .from("students")
       .select("id,student_id,jvs_id,class_name,is_active,active,left_school,status");
      
      const activeStudents = (allStudents || []).filter(isActiveStudent);
      const count = activeStudents.length;
      setStudentCount(count);

      // 2. Get current term/year
      const { data: settings } = await supabase
       .from("school_settings")
       .select("current_academic_year, current_term")
       .order("updated_at", { ascending: false })
       .limit(1)
       .single();
      const academicYear = settings?.current_academic_year;
      const term = settings?.current_term;

      // 3. Get license record
      const { data: lic } = await supabase
       .from("rc_licenses")
       .select("*")
       .eq("client_name", "Jefsem Vision School")
       .eq("system_name", "Report Card System")
       .single();
      
      if (!lic) { 
        setCanAccess(false); 
        setAmountDue(count * BILL_RATE); // bill all active students
        setChecking(false); 
        return; 
      }

      setLicense(lic);

      // 4. Check if term changed or cycle expired
      const termChanged = lic.academic_year !== academicYear || lic.term !== term;
      const cycleStart = lic.cycle_start_at ? new Date(lic.cycle_start_at).getTime() : 0;
      const cycleExpired = cycleStart && (Date.now() - cycleStart > BILL_WINDOW_DAYS * 24 * 60 * 60 * 1000);

      if (termChanged || cycleExpired || lic.payment_status !== 'paid') {
        // New term or unpaid: must pay for ALL active students
        setAmountDue(count * BILL_RATE);
        setCanAccess(false);
      } else {
        // Same term: only charge for NEW active students added
        const paidCount = lic.paid_student_count || 0;
        const extra = Math.max(0, count - paidCount);
        setAmountDue(extra * BILL_RATE);
        setCanAccess(extra === 0);
      }

      setChecking(false);
    }
    checkAccess();
  }, []);

  return { canAccess, checking, amountDue, license, studentCount };
}