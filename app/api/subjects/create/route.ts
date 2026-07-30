import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireStaffRole, unauthorizedResponse } from "@/lib/apiAuth";
import { logActivity, actorName } from "@/lib/activityLog";

export async function POST(request: Request) {
  try {
    const auth = await requireStaffRole(request, ["owner", "admin", "headmaster"]);
    if (!auth.ok) return unauthorizedResponse(auth);

    const body = await request.json();

    const name = String(body.name || "").trim();
    const order = Number(body.order || 1);

    if (!name) {
      return NextResponse.json(
        { error: "Subject name is required." },
        { status: 400 }
      );
    }

    if (!Number.isFinite(order) || order < 1) {
      return NextResponse.json(
        { error: "Subject order must be 1 or more." },
        { status: 400 }
      );
    }

    const { error } = await supabaseAdmin.from("subjects").insert([
      {
        name,
        subject_name: name,
        subject_order: order,
      },
    ]);

    if (error) {
      throw new Error(error.message);
    }

    void logActivity({
      userName: actorName(auth.teacher),
      role: auth.role,
      action: "SUBJECTS_CREATE",
      details: `Added subject "${name}" (order ${order}).`,
    });

    return NextResponse.json({
      message: "Subject added successfully.",
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
