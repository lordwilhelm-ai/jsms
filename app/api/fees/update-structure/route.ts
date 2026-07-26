import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireStaffRole, unauthorizedResponse } from "@/lib/apiAuth";

// The Fee Structure admin page used to write straight to `classes` and
// `new_student_fee_items` with the anon-key browser client, gated only by a
// client-side "redirect if teacher" check. That is not real enforcement — a
// direct API/script call could bypass it entirely. This route proxies every
// fee-structure write through the service role behind requireStaffRole(),
// mirroring the pattern already used by /api/classes/update-fees.
const ALLOWED_ROLES = ["owner", "admin", "headmaster"] as const;

function numberValue(value: unknown) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export async function POST(request: Request) {
  try {
    const auth = await requireStaffRole(request, [...ALLOWED_ROLES]);
    if (!auth.ok) return unauthorizedResponse(auth);

    const body = await request.json();
    const action = String(body?.action || "").trim();

    if (action === "save-level-fees") {
      const classIds = Array.isArray(body.classIds)
        ? body.classIds.map((id: any) => String(id)).filter(Boolean)
        : [];

      if (classIds.length === 0) {
        return NextResponse.json({ error: "No classes found for this level." }, { status: 400 });
      }

      const payload = {
        fee_level_group: String(body.level || "").trim(),
        fee_returning: numberValue(body.feeReturning),
        fee_lacoste: numberValue(body.feeLacoste),
        fee_monwed: numberValue(body.feeMonwed),
        fee_friday: numberValue(body.feeFriday),
      };

      const { error } = await supabaseAdmin.from("classes").update(payload).in("id", classIds);
      if (error) throw new Error(error.message);

      return NextResponse.json({ message: "Fee structure updated.", payload });
    }

    if (action === "save-item") {
      const itemName = String(body.itemName || "").trim();
      const category = String(body.category || "").trim() || "General";
      const amount = numberValue(body.amount);

      if (!itemName) {
        return NextResponse.json({ error: "Item name is required." }, { status: 400 });
      }

      const id = body.id ? String(body.id).trim() : "";

      if (id) {
        const updatePayload = { item_name: itemName, category, amount };

        const { data, error } = await supabaseAdmin
          .from("new_student_fee_items")
          .update(updatePayload)
          .eq("id", id)
          .select("*")
          .single();

        if (error) throw new Error(error.message);
        return NextResponse.json({ message: `${itemName} updated.`, item: data });
      }

      const levelGroup = String(body.levelGroup || "").trim();
      if (!levelGroup) {
        return NextResponse.json({ error: "Level group is required." }, { status: 400 });
      }

      const insertPayload = {
        level_group: levelGroup,
        item_name: itemName,
        category,
        amount,
        sort_order: numberValue(body.sortOrder) || 1,
        is_active: true,
      };

      const { data, error } = await supabaseAdmin
        .from("new_student_fee_items")
        .insert(insertPayload)
        .select("*")
        .single();

      if (error) throw new Error(error.message);
      return NextResponse.json({ message: `${itemName} added to ${levelGroup}.`, item: data });
    }

    if (action === "delete-item") {
      const id = String(body.id || "").trim();
      if (!id) {
        return NextResponse.json({ error: "Item ID is required." }, { status: 400 });
      }

      const { error } = await supabaseAdmin
        .from("new_student_fee_items")
        .update({ is_active: false })
        .eq("id", id);

      if (error) throw new Error(error.message);
      return NextResponse.json({ message: "Item removed." });
    }

    if (action === "seed-defaults") {
      const levelGroup = String(body.levelGroup || "").trim();
      const items = Array.isArray(body.items) ? body.items : [];

      if (!levelGroup || items.length === 0) {
        return NextResponse.json({ error: "Level group and default items are required." }, { status: 400 });
      }

      const insertPayload = items.map((item: any, index: number) => ({
        level_group: levelGroup,
        item_name: String(item?.item_name || "").trim(),
        category: String(item?.category || "General").trim(),
        amount: 0,
        sort_order: index + 1,
        is_active: true,
      }));

      const { data, error } = await supabaseAdmin
        .from("new_student_fee_items")
        .insert(insertPayload)
        .select("*");

      if (error) throw new Error(error.message);
      return NextResponse.json({
        message: `Default new student structure added for ${levelGroup}. Enter the amounts now.`,
        items: data,
      });
    }

    return NextResponse.json({ error: "Unknown fee structure action." }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
