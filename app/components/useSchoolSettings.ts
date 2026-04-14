"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export type SchoolSettings = {
  id: string;
  school_name: string;
  motto: string;
  logo_url: string | null;
  academic_year: string;
  current_term: string;
  term_begins: string | null;
  term_ends: string | null;
};

const defaultSettings: SchoolSettings = {
  id: "",
  school_name: "School",
  motto: "",
  logo_url: null,
  academic_year: "",
  current_term: "",
  term_begins: null,
  term_ends: null,
};

export default function useSchoolSettings() {
  const [settings, setSettings] = useState<SchoolSettings>(defaultSettings);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadSettings() {
      const { data } = await supabase
        .from("school_settings")
        .select(
          "id, school_name, motto, logo_url, academic_year, current_term, term_begins, term_ends"
        )
        .limit(1)
        .single();

      if (data) {
        setSettings({
          id: data.id ?? "",
          school_name: data.school_name ?? "School",
          motto: data.motto ?? "",
          logo_url: data.logo_url ?? null,
          academic_year: data.academic_year ?? "",
          current_term: data.current_term ?? "",
          term_begins: data.term_begins ?? null,
          term_ends: data.term_ends ?? null,
        });
      }

      setLoading(false);
    }

    loadSettings();
  }, []);

  return { settings, loading };
}
