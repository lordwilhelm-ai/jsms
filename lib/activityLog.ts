import { supabaseAdmin } from "@/lib/supabase-admin";

type LogActivityParams = {
  userName: string;
  role: string;
  action: string;
  className?: string | null;
  date?: string | null;
  details: string;
  // Only set for actions the Activity Log's Undo feature knows how to
  // reverse (see app/api/activity-logs/undo/route.ts for the dispatch
  // table) — undoType/undoPayload are left null for everything else,
  // which is what makes a log entry show no Undo button at all.
  undoType?: string | null;
  undoPayload?: Record<string, any> | null;
};

// Shared by every write route so "who did what, and when" covers the whole
// app, not just the one feeding action that originally wrote to this table.
// Deliberately fire-and-forget with its own try/catch: a logging failure
// must never break (or roll back) the real mutation it's describing, and
// callers should call this AFTER their actual write already succeeded.
export async function logActivity(params: LogActivityParams) {
  try {
    const { error } = await supabaseAdmin.from("activity_logs").insert([
      {
        user_name: params.userName || "Unknown",
        role: params.role || "",
        action: params.action,
        class_name: params.className ?? null,
        date: params.date ?? null,
        details: params.details,
        undo_type: params.undoType ?? null,
        undo_payload: params.undoPayload ?? null,
        created_at: new Date().toISOString(),
      },
    ]);

    if (error) {
      console.error("[activity-log] insert error:", error.message);
    }
  } catch (error) {
    console.error("[activity-log] failed to record activity:", error);
  }
}

export function actorName(teacher: Record<string, any> | null | undefined) {
  return String(teacher?.full_name || teacher?.username || "Unknown").trim() || "Unknown";
}
