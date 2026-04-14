import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const id = body.id ? String(body.id) : null;
    const schoolName = String(body.school_name || "").trim();
    const motto = String(body.motto || "").trim();
    const logoUrl = body.logo_url ? String(body.logo_url) : null;
    const academicYear = String(body.academic_year || "").trim();
    const currentTerm = String(body.current_term || "").trim();
    const termBegins = body.term_begins ? String(body.term_begins) : null;
    const termEnds = body.term_ends ? String(body.term_ends) : null;

    if (!schoolName) {
      return NextResponse.json(
        { error: "School name is required." },
        { status: 400 }
      );
    }

    if (!academicYear) {
      return NextResponse.json(
        { error: "Academic year is required." },
        { status: 400 }
      );
    }

    if (!["First Term", "Second Term", "Third Term"].includes(currentTerm)) {
      return NextResponse.json(
        { error: "Select a valid current term." },
        { status: 400 }
      );
    }

    if (id) {
      const { error } = await supabaseAdmin
        .from("school_settings")
        .update({
          school_name: schoolName,
          motto,
          logo_url: logoUrl,
          academic_year: academicYear,
          current_term: currentTerm,
          term_begins: termBegins,
          term_ends: termEnds,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);

      if (error) {
        throw new Error(error.message);
      }

      return NextResponse.json({
        message: "Settings saved successfully.",
        id,
      });
    }

    const { data, error } = await supabaseAdmin
      .from("school_settings")
      .insert([
        {
          school_name: schoolName,
          motto,
          logo_url: logoUrl,
          academic_year: academicYear,
          current_term: currentTerm,
          term_begins: termBegins,
          term_ends: termEnds,
        },
      ])
      .select("id")
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json({
      message: "Settings saved successfully.",
      id: data.id,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Something went wrong.",
      },
      { status: 500 }
    );
  }
}
