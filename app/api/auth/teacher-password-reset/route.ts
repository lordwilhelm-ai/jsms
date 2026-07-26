import { NextResponse } from "next/server";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

type TeacherRow = Record<string, any>;
type ClassRow = Record<string, any>;
type AssignmentRow = Record<string, any>;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

const TOKEN_MAX_AGE_MS = 10 * 60 * 1000;

const THROTTLE_WINDOW_MS = 15 * 60 * 1000;
const THROTTLE_LOCKOUT_MS = 30 * 60 * 1000;
const MAX_QUESTION_REQUESTS = 8;
const MAX_FAILED_VERIFICATIONS = 5;

// Distinguishes "too many attempts" from other failures so the route can
// respond 429 instead of the generic 500 used for everything else below.
class ThrottleError extends Error {}

// Loads (or lazily creates/resets) this teacher's reset-attempt counters.
// Throws ThrottleError if they're currently locked out.
async function getOrInitThrottleRow(teacherId: string) {
  const { data, error } = await supabaseAdmin
    .from("jsms_password_reset_throttle")
    .select("*")
    .eq("teacher_id", teacherId)
    .maybeSingle();

  if (error) throw new Error(error.message);

  if (data?.locked_until && new Date(data.locked_until).getTime() > Date.now()) {
    throw new ThrottleError("Too many attempts. Please try again in 30 minutes.");
  }

  const windowStart = data?.window_started_at
    ? new Date(data.window_started_at).getTime()
    : 0;
  const windowExpired = !data || Date.now() - windowStart > THROTTLE_WINDOW_MS;

  if (windowExpired) {
    const { data: reset, error: upsertError } = await supabaseAdmin
      .from("jsms_password_reset_throttle")
      .upsert(
        {
          teacher_id: teacherId,
          window_started_at: new Date().toISOString(),
          question_requests: 0,
          failed_verifications: 0,
          locked_until: null,
        },
        { onConflict: "teacher_id" }
      )
      .select("*")
      .single();

    if (upsertError) throw new Error(upsertError.message);
    return reset;
  }

  return data;
}

// Increments one counter (question_requests or failed_verifications) for this
// teacher and locks them out once it exceeds max — throws ThrottleError either way.
async function bumpThrottleCounter(
  teacherId: string,
  field: "question_requests" | "failed_verifications",
  max: number
) {
  const row = await getOrInitThrottleRow(teacherId);
  const nextCount = (row[field] || 0) + 1;
  const patch: Record<string, any> = { [field]: nextCount };

  if (nextCount > max) {
    patch.locked_until = new Date(Date.now() + THROTTLE_LOCKOUT_MS).toISOString();
  }

  const { error } = await supabaseAdmin
    .from("jsms_password_reset_throttle")
    .update(patch)
    .eq("teacher_id", teacherId);

  if (error) throw new Error(error.message);

  if (nextCount > max) {
    throw new ThrottleError("Too many attempts. Please try again in 30 minutes.");
  }
}

const leadershipQuestions = [
  {
    question: "Who is the proprietor of JEFSEM Vision School?",
    answer: "Sylvester Kwesi Mensah",
    options: [
      "Sylvester Kwesi Mensah",
      "Sylvester Ato Mensah",
      "Kwesi Samuel Mensah",
      "Sylvester Kwesi Appiah",
    ],
  },
  {
    question: "Who is the headmaster/headteacher of JEFSEM Vision School?",
    answer: "Samuel Ato Mensah",
    options: [
      "Samuel Ato Mensah",
      "Samuel Ato Appiah",
      "Samuel Kwesi Mensah",
      "Samuel Ato Annan",
    ],
  },
  {
    question: "Who created JSMS?",
    answer: "Lord Wilhelm",
    options: ["Lord Wilhelm", "Lord Williams", "Samuel Wilhelm", "Sylvester Wilhelm"],
  },
  {
    question: "What is the school motto?",
    answer: "Success in Excellence",
    options: [
      "Success in Excellence",
      "Excellence in Success",
      "Success and Excellence",
      "Excellence Through Success",
    ],
  },
  {
    question: "Which name is linked to JSMS creation?",
    answer: "Lord Wilhelm",
    options: ["Lord Wilhelm", "Lord William", "Lord Wilberforce", "Lord Williams"],
  },
];

const softwareQuestions = [
  {
    question: "Which JSMS module records feeding attendance?",
    answer: "Feeding",
    options: ["Feeding", "Fees", "Books", "Uniforms"],
  },
  {
    question: "Which JSMS module records school fees payment?",
    answer: "Fees",
    options: ["Fees", "Feeding", "Report Card", "Admission"],
  },
  {
    question: "Which JSMS module is used to prepare terminal reports?",
    answer: "Report Card",
    options: ["Report Card", "Teacher Attendance", "Uniforms", "Books"],
  },
  {
    question: "Which JSMS module records teacher check-in and check-out?",
    answer: "Teacher Attendance",
    options: ["Teacher Attendance", "Admission", "Fees", "Books"],
  },
  {
    question: "Which JSMS module handles new student admission?",
    answer: "Admission",
    options: ["Admission", "Report Card", "Feeding", "Uniforms"],
  },
  {
    question: "Which JSMS module handles books payments or sales?",
    answer: "Books",
    options: ["Books", "Uniforms", "Teacher Attendance", "Settings"],
  },
  {
    question: "Which JSMS module handles uniforms?",
    answer: "Uniforms",
    options: ["Uniforms", "Books", "Fees", "Admission"],
  },
  {
    question: "Which module does report card attendance come from?",
    answer: "Feeding",
    options: ["Feeding", "Books", "Uniforms", "Admission"],
  },
  {
    question: "Which module does report card arrears come from?",
    answer: "Fees",
    options: ["Fees", "Feeding", "Teacher Attendance", "Books"],
  },
  {
    question: "Which section controls school name, logo, academic year and term?",
    answer: "Settings",
    options: ["Settings", "Books", "Uniforms", "Admission"],
  },
];

const structureQuestions = [
  {
    question: "Which class comes immediately after Playroom 2?",
    answer: "KG 1",
    options: ["KG 1", "KG 2", "Class 1", "Playroom 1"],
  },
  {
    question: "Which class comes immediately after KG 2?",
    answer: "Class 1",
    options: ["Class 1", "KG 1", "Playroom 2", "Class 2"],
  },
  {
    question: "Which class comes immediately after Class 6?",
    answer: "JHS 1",
    options: ["JHS 1", "Class 5", "JHS 2", "KG 2"],
  },
  {
    question: "Which class comes immediately before Class 1?",
    answer: "KG 2",
    options: ["KG 2", "KG 1", "Playroom 2", "Class 2"],
  },
  {
    question: "Which class comes immediately before JHS 1?",
    answer: "Class 6",
    options: ["Class 6", "Class 5", "JHS 2", "KG 2"],
  },
  {
    question: "Which class is the final class in the school?",
    answer: "JHS 3",
    options: ["JHS 3", "JHS 2", "Class 6", "KG 2"],
  },
  {
    question: "Which class starts the JHS section?",
    answer: "JHS 1",
    options: ["JHS 1", "JHS 2", "Class 6", "Class 1"],
  },
  {
    question: "Which class starts primary?",
    answer: "Class 1",
    options: ["Class 1", "KG 2", "Playroom 2", "JHS 1"],
  },
  {
    question: "Which class starts kindergarten?",
    answer: "KG 1",
    options: ["KG 1", "KG 2", "Playroom 2", "Class 1"],
  },
  {
    question: "Which class comes after Playroom 1?",
    answer: "Playroom 2",
    options: ["Playroom 2", "KG 1", "KG 2", "Class 1"],
  },
];

function cleanText(value: unknown) {
  return String(value || "").trim();
}

function cleanLower(value: unknown) {
  return cleanText(value).toLowerCase();
}

function normalizePhone(value: unknown) {
  return cleanText(value).replace(/\s+/g, "").replace(/^\+/, "");
}

function teacherName(row: TeacherRow) {
  return cleanText(row.full_name || row.teacher_name || row.name || row.username);
}

function className(row: ClassRow) {
  return cleanText(row.class_name || row.name || row.className);
}

function shuffle<T>(items: T[]) {
  const copy = [...items];

  for (let index = copy.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[randomIndex]] = [copy[randomIndex], copy[index]];
  }

  return copy;
}

function pickOne<T>(items: T[]) {
  return shuffle(items)[0];
}

function unique(values: string[]) {
  return Array.from(new Set(values.map(cleanText).filter(Boolean)));
}

// The "questions" step used to send the client a token containing a SHA-256
// hash of each correct answer alongside the (small, multiple-choice) list of
// visible options. Hashing is a "checkable" primitive — anyone holding the
// token could hash each visible option locally and instantly find the one
// matching the embedded hash, recovering every correct answer without ever
// calling the server. Encryption (AES-256-GCM, server-only key) replaces that:
// the ciphertext can only be turned back into the answer by this server, so
// having the token and the visible options gives an attacker nothing.
const ANSWER_ENC_ALGO = "aes-256-gcm";

function getAnswerEncryptionKey() {
  // Derive a fixed 32-byte key from the service role key (a server-only
  // secret already required for this route to function at all).
  return crypto.createHash("sha256").update(serviceRoleKey).update("jsms-reset-answer-enc").digest();
}

function encryptAnswer(answer: string) {
  const key = getAnswerEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ANSWER_ENC_ALGO, key, iv);
  const ciphertext = Buffer.concat([cipher.update(cleanLower(answer), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return Buffer.concat([iv, tag, ciphertext]).toString("base64url");
}

function decryptAnswer(payload: string): string {
  const key = getAnswerEncryptionKey();
  const buf = Buffer.from(String(payload || ""), "base64url");

  if (buf.length < 12 + 16) {
    throw new Error("Invalid answer payload.");
  }

  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const ciphertext = buf.subarray(28);

  const decipher = crypto.createDecipheriv(ANSWER_ENC_ALGO, key, iv);
  decipher.setAuthTag(tag);

  const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plain.toString("utf8");
}

function signPayload(payload: Record<string, any>) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto
    .createHmac("sha256", serviceRoleKey)
    .update(body)
    .digest("base64url");

  return `${body}.${signature}`;
}

function verifyToken(token: string) {
  const [body, signature] = token.split(".");

  if (!body || !signature) {
    throw new Error("Invalid reset session.");
  }

  const expectedSignature = crypto
    .createHmac("sha256", serviceRoleKey)
    .update(body)
    .digest("base64url");

  if (signature !== expectedSignature) {
    throw new Error("Invalid reset session.");
  }

  const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));

  if (!payload.createdAt || Date.now() - Number(payload.createdAt) > TOKEN_MAX_AGE_MS) {
    throw new Error("Reset session has expired. Start again.");
  }

  return payload;
}

function publicQuestion(
  category: string,
  source: { question: string; answer: string; options: string[] },
  index: number
) {
  const id = `${category}_${index}_${crypto.randomUUID()}`;
  const options = shuffle(unique([source.answer, ...source.options]));

  return {
    public: {
      id,
      question: source.question,
      options,
    },
    private: {
      id,
      answerEnc: encryptAnswer(source.answer),
    },
  };
}

function buildAssignmentQuestions(
  teachers: TeacherRow[],
  classes: ClassRow[],
  assignments: AssignmentRow[]
) {
  const teacherById = new Map<string, TeacherRow>();
  const classById = new Map<string, ClassRow>();

  teachers.forEach((teacher) => {
    const id = cleanText(teacher.id);
    if (id) teacherById.set(id, teacher);
  });

  classes.forEach((cls) => {
    const id = cleanText(cls.id);
    if (id) classById.set(id, cls);
  });

  const classToTeacherNames = new Map<string, string[]>();
  const teacherToClassNames = new Map<string, string[]>();

  assignments.forEach((assignment) => {
    const teacher = teacherById.get(cleanText(assignment.teacher_id));
    const cls = classById.get(cleanText(assignment.class_id));

    const tName = teacher ? teacherName(teacher) : "";
    const cName = cls ? className(cls) : "";

    if (!tName || !cName) return;

    if (!classToTeacherNames.has(cName)) classToTeacherNames.set(cName, []);
    if (!teacherToClassNames.has(tName)) teacherToClassNames.set(tName, []);

    classToTeacherNames.get(cName)?.push(tName);
    teacherToClassNames.get(tName)?.push(cName);
  });

  const allTeacherNames = unique(teachers.map(teacherName));
  const allClassNames = unique(classes.map(className));

  const questions: { question: string; answer: string; options: string[] }[] = [];

  classToTeacherNames.forEach((teacherNames, cls) => {
    const answer = unique(teacherNames).join(", ");
    const wrongTeachers = allTeacherNames.filter((name) => !teacherNames.includes(name));

    if (answer && wrongTeachers.length >= 3) {
      questions.push({
        question: `Who is assigned to ${cls}?`,
        answer,
        options: shuffle([answer, ...shuffle(wrongTeachers).slice(0, 3)]),
      });
    }
  });

  teacherToClassNames.forEach((classNames, teacher) => {
    const answer = unique(classNames).join(", ");
    const wrongClasses = allClassNames.filter((name) => !classNames.includes(name));

    if (answer && wrongClasses.length >= 3) {
      questions.push({
        question: `Which class is ${teacher} assigned to?`,
        answer,
        options: shuffle([answer, ...shuffle(wrongClasses).slice(0, 3)]),
      });
    }
  });

  classToTeacherNames.forEach((teacherNames, cls) => {
    const wrongTeachers = allTeacherNames.filter((name) => !teacherNames.includes(name));

    if (wrongTeachers.length >= 1 && teacherNames.length >= 1) {
      const answer = pickOne(wrongTeachers);

      questions.push({
        question: `Which of these teachers is not assigned to ${cls}?`,
        answer,
        options: shuffle([answer, ...shuffle(teacherNames).slice(0, 3)]),
      });
    }
  });

  return questions;
}

async function findTeacherByPhone(phone: string) {
  const cleanPhone = normalizePhone(phone);

  const { data, error } = await supabaseAdmin
    .from("teachers")
    .select("*");

  if (error) throw new Error(error.message);

  const teachers = data || [];

  return (
    teachers.find((teacher) => normalizePhone(teacher.phone) === cleanPhone) ||
    teachers.find((teacher) => normalizePhone(teacher.phone_number) === cleanPhone) ||
    teachers.find((teacher) => normalizePhone(teacher.contact) === cleanPhone) ||
    teachers.find((teacher) => normalizePhone(teacher.mobile) === cleanPhone) ||
    null
  );
}

function assertServerConfigured() {
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Password reset is not configured on the server.");
  }
}

export async function POST(request: Request) {
  try {
    assertServerConfigured();

    const body = await request.json();
    const action = cleanText(body.action);

    if (action === "lookup") {
      const teacher = await findTeacherByPhone(body.phone);

      if (!teacher) {
        return NextResponse.json(
          { error: "No teacher account found with this phone number." },
          { status: 404 }
        );
      }

      return NextResponse.json({
        teacher: {
          id: teacher.id,
          teacher_id: teacher.teacher_id,
          full_name: teacher.full_name || teacher.teacher_name || teacher.name,
          phone: teacher.phone || teacher.phone_number || teacher.contact || teacher.mobile,
          role: teacher.role || "teacher",
        },
      });
    }

    if (action === "questions") {
      const teacherId = cleanText(body.teacherId);

      if (!teacherId) {
        return NextResponse.json({ error: "Teacher account is missing." }, { status: 400 });
      }

      await bumpThrottleCounter(teacherId, "question_requests", MAX_QUESTION_REQUESTS);

      const [
        teacherRes,
        teachersRes,
        classesRes,
        assignmentsRes,
      ] = await Promise.all([
        supabaseAdmin.from("teachers").select("*").eq("id", teacherId).limit(1).maybeSingle(),
        supabaseAdmin.from("teachers").select("*"),
        supabaseAdmin.from("classes").select("*"),
        supabaseAdmin.from("teacher_class_assignments").select("*"),
      ]);

      if (teacherRes.error) throw new Error(teacherRes.error.message);
      if (!teacherRes.data) {
        return NextResponse.json({ error: "Teacher account not found." }, { status: 404 });
      }

      const teachers = teachersRes.data || [];
      const classes = classesRes.data || [];
      const assignments = assignmentsRes.data || [];

      const assignmentQuestions = buildAssignmentQuestions(teachers, classes, assignments);

      const selectedSources: { category: string; source: any }[] = [
        { category: "leadership", source: pickOne(leadershipQuestions) },
        { category: "software", source: pickOne(softwareQuestions) },
        { category: "structure", source: pickOne(structureQuestions) },
      ];

      const usableAssignmentQuestions = shuffle(assignmentQuestions).slice(0, 2);

      usableAssignmentQuestions.forEach((source) => {
        selectedSources.push({ category: "assignment", source });
      });

      // If teacher/class assignment data is empty or not enough, fill the remaining
      // slots with extra school/software/structure questions instead of blocking reset.
      const fallbackSources = shuffle([
        ...leadershipQuestions.map((source) => ({ category: "leadership", source })),
        ...softwareQuestions.map((source) => ({ category: "software", source })),
        ...structureQuestions.map((source) => ({ category: "structure", source })),
      ]);

      for (const fallback of fallbackSources) {
        if (selectedSources.length >= 5) break;

        const alreadyPicked = selectedSources.some(
          (item) => item.source.question === fallback.source.question
        );

        if (!alreadyPicked) selectedSources.push(fallback);
      }

      if (selectedSources.length < 5) {
        return NextResponse.json(
          { error: "Reset questions could not be prepared. Add more question data." },
          { status: 400 }
        );
      }

      const publicQuestions: any[] = [];
      const privateAnswers: any[] = [];

      selectedSources.forEach((item, index) => {
        const built = publicQuestion(item.category, item.source, index);
        publicQuestions.push(built.public);
        privateAnswers.push(built.private);
      });

      const token = signPayload({
        stage: "questions",
        teacherId,
        createdAt: Date.now(),
        answers: privateAnswers,
        attempts: 0,
      });

      return NextResponse.json({
        questions: shuffle(publicQuestions),
        token,
      });
    }

    if (action === "verify") {
      const payload = verifyToken(cleanText(body.token));

      if (payload.stage !== "questions") {
        return NextResponse.json({ error: "Invalid reset stage." }, { status: 400 });
      }

      // Enforces the lockout even for a correct submission, and resets the
      // window if it's expired — doesn't consume an attempt on its own.
      await getOrInitThrottleRow(payload.teacherId);

      const submittedAnswers = body.answers || {};
      const correct = (payload.answers || []).every((item: any) => {
        let expected: string;

        try {
          expected = decryptAnswer(item.answerEnc);
        } catch {
          // Tampered/invalid ciphertext — never treat as a match.
          return false;
        }

        return cleanLower(submittedAnswers[item.id] || "") === expected;
      });

      if (!correct) {
        await bumpThrottleCounter(payload.teacherId, "failed_verifications", MAX_FAILED_VERIFICATIONS);

        return NextResponse.json(
          { error: "Some answers are incorrect. Try again." },
          { status: 400 }
        );
      }

      const token = signPayload({
        stage: "verified",
        teacherId: payload.teacherId,
        createdAt: Date.now(),
      });

      return NextResponse.json({ ok: true, token });
    }

    if (action === "update") {
      const payload = verifyToken(cleanText(body.token));

      if (payload.stage !== "verified") {
        return NextResponse.json({ error: "Reset has not been verified." }, { status: 400 });
      }

      const newPassword = cleanText(body.newPassword);

      if (newPassword.length < 6) {
        return NextResponse.json(
          { error: "Password must be at least 6 characters." },
          { status: 400 }
        );
      }

      const { data: teacher, error } = await supabaseAdmin
        .from("teachers")
        .select("id,auth_user_id")
        .eq("id", payload.teacherId)
        .limit(1)
        .maybeSingle();

      if (error) throw new Error(error.message);

      if (!teacher?.auth_user_id) {
        return NextResponse.json(
          { error: "Teacher auth account is missing." },
          { status: 400 }
        );
      }

      const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
        teacher.auth_user_id,
        { password: newPassword }
      );

      if (updateError) throw new Error(updateError.message);

      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Invalid action." }, { status: 400 });
  } catch (error) {
    if (error instanceof ThrottleError) {
      return NextResponse.json({ error: error.message }, { status: 429 });
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Password reset failed.",
      },
      { status: 500 }
    );
  }
}
