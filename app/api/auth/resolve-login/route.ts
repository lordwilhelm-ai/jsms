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

    // Two separate .eq() lookups instead of a single .or() built from a raw
    // string — identifier is untrusted input, and PostgREST's .or() syntax
    // parses commas/parens as filter separators, so interpolating it directly
    // let a crafted identifier inject extra filter conditions.
    const [byUsername, byPhone] = await Promise.all([
      supabaseAdmin.from("teachers").select("login_email").eq("username", identifier).limit(1),
      supabaseAdmin.from("teachers").select("login_email").eq("phone", identifier).limit(1),
    ]);

    if (byUsername.error) throw new Error(byUsername.error.message);
    if (byPhone.error) throw new Error(byPhone.error.message);

    const match = byUsername.data?.[0] || byPhone.data?.[0] || null;

    if (!match || !match.login_email) {
      return NextResponse.json(
        { error: "Account not found." },
        { status: 404 }
      );
    }

    return NextResponse.json({
      loginEmail: match.login_email,
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
