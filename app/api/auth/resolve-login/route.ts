import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const identifier = String(body.identifier || "").trim().toLowerCase();

    if (!identifier) {
      return NextResponse.json(
        { error: "Username or phone is required." },
        { status: 400 }
      );
    }

    const { data: teachers, error } = await supabaseAdmin
      .from("teachers")
      .select("login_email")
      .or(`username.eq.${identifier},phone.eq.${identifier}`)
      .limit(1);

    if (error) {
      throw new Error(error.message);
    }

    if (!teachers || teachers.length === 0 || !teachers[0].login_email) {
      return NextResponse.json(
        { error: "Account not found." },
        { status: 404 }
      );
    }

    return NextResponse.json({
      loginEmail: teachers[0].login_email,
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
