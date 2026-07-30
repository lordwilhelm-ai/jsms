import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireStaffRole, unauthorizedResponse } from "@/lib/apiAuth";

// activity_logs has RLS enabled with zero policies, so an anon-key read
// silently returns an empty array regardless of who's logged in — proxy
// through here with the service role, same pattern as every other
// RLS-locked table in this app.
function cleanSearch(value: string) {
  return value.trim().replace(/[%_,()]/g, "");
}

export async function GET(request: Request) {
  try {
    const auth = await requireStaffRole(request, ["owner", "admin", "headmaster"]);
    if (!auth.ok) return unauthorizedResponse(auth);

    const { searchParams } = new URL(request.url);
    const page = Math.max(0, Number(searchParams.get("page") || 0) || 0);
    const pageSize = Math.min(200, Math.max(10, Number(searchParams.get("pageSize") || 50) || 50));
    const search = cleanSearch(String(searchParams.get("search") || ""));
    const role = String(searchParams.get("role") || "").trim();
    const startDate = String(searchParams.get("startDate") || "").trim();
    const endDate = String(searchParams.get("endDate") || "").trim();

    let query = supabaseAdmin
      .from("activity_logs")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false });

    if (search) {
      query = query.or(
        `user_name.ilike.%${search}%,details.ilike.%${search}%,action.ilike.%${search}%,class_name.ilike.%${search}%`
      );
    }
    if (role) query = query.eq("role", role);
    if (startDate) query = query.gte("created_at", `${startDate}T00:00:00`);
    if (endDate) query = query.lte("created_at", `${endDate}T23:59:59`);

    const from = page * pageSize;
    const to = from + pageSize - 1;

    const { data, error, count } = await query.range(from, to);
    if (error) throw error;

    return NextResponse.json({ rows: data || [], total: count || 0, page, pageSize });
  } catch (error) {
    console.error("Load activity logs error:", error);
    const message =
      error instanceof Error
        ? error.message
        : String((error as Record<string, any>)?.message || "Failed to load activity logs.");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
