// JSMS Real Push Notification Edge Function
// Supports global JSMS notifications + class teacher / student teacher targeting.
// Deploy with: npx supabase functions deploy send-jsms-push --no-verify-jwt

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function cleanClass(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function parseClassList(value: unknown): string[] {
  if (!value) return [];

  if (Array.isArray(value)) {
    return value.map(cleanClass).filter(Boolean);
  }

  if (typeof value === "object") {
    try {
      return Object.values(value as Record<string, unknown>)
        .flatMap((item) => parseClassList(item))
        .filter(Boolean);
    } catch {
      return [];
    }
  }

  const raw = String(value || "").trim();
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) || typeof parsed === "object") {
      return parseClassList(parsed);
    }
  } catch {
    // plain text
  }

  return raw
    .split(/[,|;/]+/)
    .map(cleanClass)
    .filter(Boolean);
}

function getTeacherClasses(row: any): string[] {
  return [
    ...parseClassList(row?.assigned_classes),
    ...parseClassList(row?.assigned_class),
    ...parseClassList(row?.classes),
    ...parseClassList(row?.class_names),
    ...parseClassList(row?.class_name),
    ...parseClassList(row?.class),
    ...parseClassList(row?.teacher_classes),
    ...parseClassList(row?.assignedClass),
    ...parseClassList(row?.assignedClasses),
  ];
}

function getTeacherId(row: any) {
  return String(row?.teacher_id || row?.teacherId || row?.id || "").trim();
}

function getTeacherUserId(row: any) {
  return String(row?.auth_user_id || row?.user_id || row?.userId || "").trim();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl =
      Deno.env.get("JSMS_SUPABASE_URL") ||
      Deno.env.get("SUPABASE_URL");

    const serviceRoleKey =
      Deno.env.get("JSMS_SERVICE_ROLE_KEY") ||
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY");
    const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY");
    const vapidSubject = Deno.env.get("VAPID_SUBJECT") || "mailto:admin@example.com";

    if (!supabaseUrl || !serviceRoleKey) {
      return json(
        { ok: false, error: "Missing JSMS_SUPABASE_URL or JSMS_SERVICE_ROLE_KEY" },
        500
      );
    }

    if (!vapidPublicKey || !vapidPrivateKey) {
      return json({ ok: false, error: "Missing VAPID_PUBLIC_KEY or VAPID_PRIVATE_KEY" }, 500);
    }

    webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const body = await req.json().catch(() => ({}));
    const notificationId = body?.notification_id || body?.notificationId || null;
    const limit = Number(body?.limit || 25);

    let queueQuery = supabase
      .from("jsms_push_queue")
      .select("*, recipient:jsms_notification_recipients(*), notification:jsms_notifications(*)")
      .eq("status", "pending")
      .lte("scheduled_for", new Date().toISOString())
      .order("created_at", { ascending: true })
      .limit(limit);

    if (notificationId) {
      queueQuery = queueQuery.eq("notification_id", notificationId);
    }

    const { data: queueRows, error: queueError } = await queueQuery;

    if (queueError) {
      return json({ ok: false, error: queueError.message }, 500);
    }

    if (!queueRows || queueRows.length === 0) {
      return json({ ok: true, sent: 0, message: "No pending push notifications." });
    }

    async function getSubscriptionsForRecipient(recipient: any) {
      const targetType = String(recipient?.target_type || "");
      const recipientClass = cleanClass(recipient?.recipient_class);

      // Class-based teacher alert. This is the important one:
      // only teachers assigned to that class should receive it.
      if (
        recipientClass &&
        (targetType === "class_teacher" || targetType === "student_teacher")
      ) {
        const { data: teacherRows, error: teachersError } = await supabase
          .from("teachers")
          .select("*");

        if (teachersError) throw new Error(teachersError.message);

        const matchingTeachers = (teacherRows || []).filter((teacher: any) =>
          getTeacherClasses(teacher).includes(recipientClass)
        );

        const teacherIds = new Set(
          matchingTeachers.map(getTeacherId).filter(Boolean)
        );

        const userIds = new Set(
          matchingTeachers.map(getTeacherUserId).filter(Boolean)
        );

        const { data: subs, error: subsError } = await supabase
          .from("jsms_push_subscriptions")
          .select("*")
          .eq("is_active", true)
          .eq("role", "teacher");

        if (subsError) throw new Error(subsError.message);

        return (subs || []).filter((sub: any) => {
          const subTeacherId = String(sub.teacher_id || "").trim();
          const subUserId = String(sub.user_id || "").trim();

          return (
            (subTeacherId && teacherIds.has(subTeacherId)) ||
            (subUserId && userIds.has(subUserId))
          );
        });
      }

      let subsQuery = supabase
        .from("jsms_push_subscriptions")
        .select("*")
        .eq("is_active", true);

      if (recipient.recipient_user_id) {
        subsQuery = subsQuery.eq("user_id", recipient.recipient_user_id);
      } else if (recipient.recipient_teacher_id) {
        subsQuery = subsQuery.eq("teacher_id", recipient.recipient_teacher_id);
      } else if (targetType === "all_teachers") {
        subsQuery = subsQuery.eq("role", "teacher");
      } else if (targetType === "all_admins") {
        subsQuery = subsQuery.eq("role", "admin");
      } else if (targetType === "all_headmasters") {
        subsQuery = subsQuery.eq("role", "headmaster");
      } else if (targetType === "staff") {
        subsQuery = subsQuery.in("role", ["teacher", "admin", "headmaster", "super_admin"]);
      } else if (recipient.recipient_role) {
        subsQuery = subsQuery.eq("role", recipient.recipient_role);
      } else {
        subsQuery = subsQuery.in("role", ["admin", "headmaster", "super_admin"]);
      }

      const { data: subscriptions, error: subsError } = await subsQuery;
      if (subsError) throw new Error(subsError.message);

      return subscriptions || [];
    }

    let sent = 0;
    let failed = 0;
    const results: unknown[] = [];

    for (const row of queueRows as any[]) {
      const recipient = row.recipient;
      const notification = row.notification;

      if (!recipient || !notification) {
        failed++;
        await supabase.from("jsms_push_queue").update({
          status: "failed",
          attempts: (row.attempts || 0) + 1,
          last_error: "Missing recipient or notification",
        }).eq("id", row.id);
        continue;
      }

      let subscriptions: any[] = [];

      try {
        subscriptions = await getSubscriptionsForRecipient(recipient);
      } catch (err) {
        failed++;
        const message = err instanceof Error ? err.message : String(err);

        await supabase.from("jsms_push_queue").update({
          status: "failed",
          attempts: (row.attempts || 0) + 1,
          last_error: message,
        }).eq("id", row.id);

        await supabase.from("jsms_notification_recipients").update({
          push_status: "failed",
          push_error: message,
        }).eq("id", recipient.id);

        continue;
      }

      if (!subscriptions || subscriptions.length === 0) {
        await supabase.from("jsms_push_queue").update({
          status: "no_subscriptions",
          attempts: (row.attempts || 0) + 1,
          last_error: "No active push subscriptions for recipient",
        }).eq("id", row.id);

        await supabase.from("jsms_notification_recipients").update({
          push_status: "no_subscriptions",
          push_error: "No active push subscriptions for recipient",
        }).eq("id", recipient.id);

        results.push({ queue_id: row.id, status: "no_subscriptions" });
        continue;
      }

      const payload = JSON.stringify({
        title: notification.title || "JSMS",
        body: notification.message || "New notification",
        icon: "/icons/icon-192.png",
        badge: "/icons/icon-192.png",
        data: {
          url: notification.action_url || "/dashboard",
          notification_id: notification.id,
          type: notification.type,
          metadata: notification.metadata || {},
        },
      });

      let rowSent = 0;
      let rowFailed = 0;
      let lastError = "";

      for (const sub of subscriptions as any[]) {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: {
                p256dh: sub.p256dh,
                auth: sub.auth,
              },
            },
            payload
          );

          rowSent++;
          sent++;
        } catch (err) {
          rowFailed++;
          failed++;
          lastError = err instanceof Error ? err.message : String(err);

          const statusCode = (err as any)?.statusCode;

          if (statusCode === 404 || statusCode === 410) {
            await supabase.from("jsms_push_subscriptions").update({
              is_active: false,
              updated_at: new Date().toISOString(),
            }).eq("id", sub.id);
          }
        }
      }

      const finalStatus = rowSent > 0 ? "sent" : "failed";

      await supabase.from("jsms_push_queue").update({
        status: finalStatus,
        attempts: (row.attempts || 0) + 1,
        sent_at: rowSent > 0 ? new Date().toISOString() : null,
        last_error: rowFailed > 0 ? lastError : null,
      }).eq("id", row.id);

      await supabase.from("jsms_notification_recipients").update({
        push_status: finalStatus,
        push_sent_at: rowSent > 0 ? new Date().toISOString() : null,
        push_error: rowFailed > 0 ? lastError : null,
      }).eq("id", recipient.id);

      results.push({
        queue_id: row.id,
        status: finalStatus,
        sent: rowSent,
        failed: rowFailed,
        target_type: recipient.target_type,
        recipient_class: recipient.recipient_class,
      });
    }

    return json({ ok: true, sent, failed, results });
  } catch (err) {
    return json({ ok: false, error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
