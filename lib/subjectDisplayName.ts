// Subjects have been typed inconsistently over time (abbreviations like
// "Maths"/"RME", and a mix of Title Case/ALL CAPS from older saved report
// scores, since jsms_report_scores stores subject_name as a plain text
// snapshot, not a foreign key). This maps every known variant to one full,
// consistently-cased name for anywhere a subject is shown on a report card.
const FULL_SUBJECT_NAMES: Record<string, string> = {
  maths: "Mathematics",
  math: "Mathematics",
  mathematics: "Mathematics",

  english: "English Language",
  "english language": "English Language",

  rme: "Religious and Moral Education",
  "religious and moral education": "Religious and Moral Education",

  owop: "Our World, Our People",
  "our world our people": "Our World, Our People",
  "our world, our people": "Our World, Our People",

  ict: "Computing",
  computing: "Computing",

  science: "Science",
  "integrated science": "Integrated Science",

  "social studies": "Social Studies",

  "creative arts": "Creative Arts",
  "creative arts and design": "Creative Arts and Design",
  "creative arts & design": "Creative Arts and Design",

  "ghanaian language": "Ghanaian Language",
  fanti: "Fanti",
  twi: "Twi",
  ga: "Ga",
  ewe: "Ewe",

  history: "History",
  "career technology": "Career Technology",
  french: "French",

  literacy: "Literacy",
  numeracy: "Numeracy",
  creativity: "Creativity",
  writing: "Writing",
  phonics: "Phonics",

  "physical education": "Physical Education",
  "language and literacy": "Language and Literacy",
  "creative activities": "Creative Activities",
  "environmental studies": "Environmental Studies",
  "physical development": "Physical Development",
};

export function getFullSubjectName(subjectName: unknown): string {
  const raw = String(subjectName ?? "").trim();
  if (!raw) return "";

  const key = raw.toLowerCase().replace(/\s+/g, " ");
  return FULL_SUBJECT_NAMES[key] || raw;
}
