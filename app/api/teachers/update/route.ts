import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const id = String(body.id || "").trim();
    const fullName = String(body.fullName || "").trim();
    const username = String(body.username || "").trim().toLowerCase();
    const phone = String(body.phone || "").trim();
    const role = String(body.role || "").trim();
    const photoUrl = body.photoUrl ? String(body.photoUrl) : null;
    const signatureUrl = body.signatureUrl ? String(body.signatureUrl) : null;

    if (!id) {
      return NextResponse.json({ error: "Teacher ID record is required." }, { status: 400 });
    }

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

    const { data: currentTeacher, error: currentTeacherError } = await supabaseAdmin
      .from("teachers")
      .select("id")
      .eq("id", id)
      .limit(1)
      .single();

    if (currentTeacherError || !currentTeacher) {
      return NextResponse.json({ error: "Teacher not found." }, { status: 404 });
    }

    const { data: existingUsername, error: usernameError } = await supabaseAdmin
      .from("teachers")
      .select("id")
      .eq("username", username)
      .neq("id", id)
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
      .neq("id", id)
      .limit(1);

    if (phoneError) {
      throw new Error(phoneError.message);
    }

    if (existingPhone && existingPhone.length > 0) {
      return NextResponse.json({ error: "That phone number already exists." }, { status: 400 });
    }

    const loginEmail = `${username}@jsms.local`;

    const { data: teacherRow, error: teacherRowError } = await supabaseAdmin
      .from("teachers")
      .select("auth_user_id")
      .eq("id", id)
      .limit(1)
      .single();

    if (teacherRowError) {
      throw new Error(teacherRowError.message);
    }

    if (teacherRow?.auth_user_id) {
      const { error: updateAuthError } = await supabaseAdmin.auth.admin.updateUserById(
        teacherRow.auth_user_id,
        { email: loginEmail }
      );

      if (updateAuthError) {
        throw new Error(updateAuthError.message);
      }
    }

    const { error: updateError } = await supabaseAdmin
      .from("teachers")
      .update({
        full_name: fullName,
        username,
        phone,
        role,
        photo_url: photoUrl,
        signature_url: role === "headmaster" ? signatureUrl : null,
        login_email: loginEmail,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (updateError) {
      throw new Error(updateError.message);
    }

    return NextResponse.json({ message: "Teacher updated successfully." });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Something went wrong.",
      },
      { status: 500 }
    );
  }
}
