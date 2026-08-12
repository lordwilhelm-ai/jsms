import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireStaffRole, unauthorizedResponse } from "@/lib/apiAuth";
import { RECORD_TYPES } from "@/lib/recordManagement";

const ALLOWED_ROLES = ["owner", "admin", "headmaster"] as const;

function cleanSearch(value: string) {
  return value.trim().replace(/[%_,()]/g, "");
}

export async function GET(request: Request, { params }: { params: Promise<{ type: string }> }) {
  try {
    const auth = await requireStaffRole(request, [...ALLOWED_ROLES]);
    if (!auth.ok) return unauthorizedResponse(auth);

    const { type } = await params;
    const config = RECORD_TYPES[type];
    if (!config) {
      return NextResponse.json({ error: `Unknown record type "${type}".` }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const page = Math.max(0, Number(searchParams.get("page") || 0) || 0);
    const pageSize = Math.min(100, Math.max(10, Number(searchParams.get("pageSize") || 25) || 25));
    const search = cleanSearch(String(searchParams.get("search") || ""));

    let query = supabaseAdmin
      .from(config.table)
      .select(config.listFields.join(","), { count: "exact" })
      .order("created_at", { ascending: false });

    if (search && config.searchFields.length > 0) {
      const orExpr = config.searchFields.map((field) => `${field}.ilike.%${search}%`).join(",");
      query = query.or(orExpr);
    }

    const from = page * pageSize;
    const to = from + pageSize - 1;

    const { data, error, count } = await query.range(from, to);
    if (error) throw new Error(error.message);

    return NextResponse.json({
      rows: data || [],
      total: count || 0,
      page,
      pageSize,
      label: config.label,
      fields: config.fields,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Something went wrong." },
      { status: 500 }
    );
  }
}
