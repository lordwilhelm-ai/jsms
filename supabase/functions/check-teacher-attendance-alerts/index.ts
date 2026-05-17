import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("JSMS_SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("JSMS_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error("Missing JSMS_SUPABASE_URL or JSMS_SERVICE_ROLE_KEY secret.");
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    const { data, error } = await supabase.rpc("run_teacher_attendance_notification_checks");

    if (error) throw error;

    // Process pending push queue immediately.
    const pushRes = await fetch(`${supabaseUrl}/functions/v1/send-jsms-push`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source: "check-teacher-attendance-alerts" }),
    });

    let pushData: unknown = null;
    try {
      pushData = await pushRes.json();
    } catch {
      pushData = { ok: pushRes.ok, status: pushRes.status };
    }

    return new Response(
      JSON.stringify({ ok: true, checks: data, push: pushData }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
