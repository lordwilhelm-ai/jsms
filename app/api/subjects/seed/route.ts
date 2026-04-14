import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

const officialSubjects = [
  { name: "Literacy", subject_name: "Literacy", subject_order: 1 },
  { name: "Numeracy", subject_name: "Numeracy", subject_order: 2 },
  { name: "Creativity", subject_name: "Creativity", subject_order: 3 },
  { name: "Writing", subject_name: "Writing", subject_order: 4 },
  { name: "Phonics", subject_name: "Phonics", subject_order: 5 },

  { name: "English Language", subject_name: "English Language", subject_order: 6 },
  { name: "Mathematics", subject_name: "Mathematics", subject_order: 7 },
  { name: "Science", subject_name: "Science", subject_order: 8 },
  { name: "Computing", subject_name: "Computing", subject_order: 9 },
  { name: "Creative Arts", subject_name: "Creative Arts", subject_order: 10 },
  { name: "RME", subject_name: "RME", subject_order: 11 },
  { name: "Social Studies", subject_name: "Social Studies", subject_order: 12 },
  { name: "Ghanaian Language", subject_name: "Ghanaian Language", subject_order: 13 },
  { name: "French", subject_name: "French", subject_order: 14 },
  { name: "Career Technology", subject_name: "Career Technology", subject_order: 15 },
  { name: "Integrated Science", subject_name: "Integrated Science", subject_order: 16 },
];

export async function POST() {
  try {
    const { error: deleteLinksError } = await supabaseAdmin
      .from("class_subjects")
      .delete()
      .neq("id", "00000000-0000-0000-0000-000000000000");

    if (deleteLinksError) throw new Error(deleteLinksError.message);

    const { error: deleteSubjectsError } = await supabaseAdmin
      .from("subjects")
      .delete()
      .neq("id", "00000000-0000-0000-0000-000000000000");

    if (deleteSubjectsError) throw new Error(deleteSubjectsError.message);

    const { error: insertError } = await supabaseAdmin
      .from("subjects")
      .insert(officialSubjects);

    if (insertError) throw new Error(insertError.message);

    await autoAssignOfficialMappings();

    return NextResponse.json({
      message: "Official subjects loaded successfully.",
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Something went wrong.",
      },
      { status: 500 }
    );
  }
}

async function autoAssignOfficialMappings() {
  const { data: classes, error: classesError } = await supabaseAdmin
    .from("classes")
    .select("id, class_name, level");

  if (classesError) throw new Error(classesError.message);

  const { data: subjects, error: subjectsError } = await supabaseAdmin
    .from("subjects")
    .select("id, subject_name");

  if (subjectsError) throw new Error(subjectsError.message);

  const subjectMap = new Map<string, string>();
  for (const item of subjects || []) {
    subjectMap.set(item.subject_name, item.id);
  }

  const preschoolKgSubjects = [
    "Literacy",
    "Numeracy",
    "Creativity",
    "Writing",
    "Phonics",
  ];

  const primarySubjects = [
    "English Language",
    "Mathematics",
    "Science",
    "Computing",
    "Creative Arts",
    "RME",
    "Social Studies",
    "Ghanaian Language",
  ];

  const jhsSubjects = [
    "English Language",
    "Mathematics",
    "Integrated Science",
    "Social Studies",
    "Computing",
    "Career Technology",
    "RME",
    "French",
    "Ghanaian Language",
  ];

  const inserts: { class_id: string; subject_id: string }[] = [];

  for (const cls of classes || []) {
    let names: string[] = [];

    if (cls.level === "Pre-School" || cls.level === "KG") {
      names = preschoolKgSubjects;
    } else if (
      cls.level === "Lower Primary" ||
      cls.level === "Upper Primary" ||
      cls.level === "Primary"
    ) {
      names = primarySubjects;
    } else if (cls.level === "JHS") {
      names = jhsSubjects;
    }

    for (const subjectName of names) {
      const subjectId = subjectMap.get(subjectName);
      if (subjectId) {
        inserts.push({
          class_id: cls.id,
          subject_id: subjectId,
        });
      }
    }
  }

  if (inserts.length > 0) {
    const { error: insertLinksError } = await supabaseAdmin
      .from("class_subjects")
      .insert(inserts);

    if (insertLinksError) throw new Error(insertLinksError.message);
  }
}
