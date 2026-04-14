import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

function makeTeacherId() {
  const randomNumber = Math.floor(10000 + Math.random() * 90000);
  return `JVST${randomNumber}`;
}

async function generateUniqueTeacherId() {
  let newId = makeTeacherId();
  let exists = true;

  while (exists) {
    const { data, error } = await supabaseAdmin
      .from("teachers")
      .select("id")
      .eq("teacher_id", newId)
      .limit(1);

    if (error) {
      throw new Error(error.message);
    }

    if (!data || data.length === 0) {
      exists = false;
    } else {
      newId = makeTeacherId();
    }
  }

  return newId;
}

function makeLoginEmail(username: string) {
  return `${username.toLowerCase()}@jsms.local`;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const fullName = String(body.fullName || "").trim();
    const username = String(body.username || "").trim().toLowerCase();
    const phone = String(body.phone || "").trim();
    const role = String(body.role || "").trim();
    const password = String(body.password || "");
    const photoUrl = body.photoUrl ? String(body.photoUrl) : null;
    const signatureUrl = body.signatureUrl ? String(body.signatureUrl) : null;

    if (!fullName) {
      return NextResponse.json({ error: "Full name is required." }, { status: 400 });
    }

    if (!username) {
      return NextResponse.json({ error: "Username is required." }, { status: 400 });
    }

    if (!phone) {
      return NextResponse.json({ error: "Phone is required." }, { status: 400 });
    }

    if (!["teacher", "headmaster", "admin"].includes(role)) {
      return NextResponse.json({ error: "Invalid role." }, { status: 400 });
    }

    if (!password || password.length < 6) {
      return NextResponse.json(
        { error: "Password must be at least 6 characters." },
        { status: 400 }
      );
    }

    const { data: existingUsername, error: usernameError } = await supabaseAdmin
      .from("teachers")
      .select("id")
      .eq("username", username)
      .limit(1);

    if (usernameError) {
      throw new Error(usernameError.message);
    }

    if (existingUsername && existingUsername.length > 0) {
      return NextResponse.json({ error: "That username already exists." }, { status: 400 });
    }

    const { data: existingPhone, error: phoneError } = await supabaseAdmin
      .from("teachers")
      .select("id")
      .eq("phone", phone)
      .limit(1);

    if (phoneError) {
      throw new Error(phoneError.message);
    }

    if (existingPhone && existingPhone.length > 0) {
      return NextResponse.json({ error: "That phone number already exists." }, { status: 400 });
    }

    const teacherId = await generateUniqueTeacherId();
    const loginEmail = makeLoginEmail(username);

    const { data: usersData, error: usersError } =
      await supabaseAdmin.auth.admin.listUsers();

    if (usersError) {
      throw new Error(usersError.message);
    }

    const emailTaken = usersData.users.some(
      (user) => user.email?.toLowerCase() === loginEmail
    );

    if (emailTaken) {
      return NextResponse.json(
        { error: "A login account with this username already exists." },
        { status: 400 }
      );
    }

    const { data: authData, error: authError } =
      await supabaseAdmin.auth.admin.createUser({
        email: loginEmail,
        password,
        email_confirm: true,
      });

    if (authError) {
      throw new Error(authError.message);
    }

    const authUserId = authData.user?.id;

    if (!authUserId) {
      throw new Error("Failed to create auth user.");
    }

    const { error: insertError } = await supabaseAdmin.from("teachers").insert([
      {
        teacher_id: teacherId,
        full_name: fullName,
        username,
        phone,
        role,
        photo_url: photoUrl,
        signature_url: role === "headmaster" ? signatureUrl : null,
        auth_user_id: authUserId,
        login_email: loginEmail,
      },
    ]);

    if (insertError) {
      await supabaseAdmin.auth.admin.deleteUser(authUserId);
      throw new Error(insertError.message);
    }

    return NextResponse.json({
      message: "Teacher added successfully.",
      teacherId,
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
