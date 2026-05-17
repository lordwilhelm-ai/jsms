import { supabase } from "@/lib/supabase";

export type JSMSChatIdentity = {
  role: string;
  userId: string | null;
  teacherId: string | null; // JVST...
  name: string;
};

export type JSMSChatMessage = {
  id: string;
  chat_type: "group" | "direct" | string;
  thread_id: string | null;
  group_id: string | null;
  group_name?: string | null;
  sender_user_id: string | null;
  sender_teacher_id: string | null;
  sender_role: string | null;
  sender_name: string;
  message: string;
  message_type: string;
  created_at: string;
};

export type TeacherChatContact = {
  id: string; // teachers.id UUID
  teacher_id: string; // JVST...
  full_name: string;
  username?: string | null;
  role?: string | null;
  photo_url?: string | null;
};

export type DirectThread = {
  id: string;
  participant_one_user_id: string | null;
  participant_one_teacher_id: string | null;
  participant_one_role: string | null;
  participant_one_name: string | null;
  participant_two_user_id: string | null;
  participant_two_teacher_id: string | null;
  participant_two_role: string | null;
  participant_two_name: string | null;
  last_message: string | null;
  last_message_at: string | null;
};

export type JSMSAnnouncement = {
  id: string;
  chat_message_id: string | null;
  title: string;
  message: string;
  sender_name: string | null;
  sender_role: string | null;
  expires_at: string;
  is_deleted: boolean;
  created_at: string;
};

const STAFF_ROOM_GROUP_NAME = "Staff Room";
const OLD_GROUP_NAME = "JSMS Staff Room";
const ANNOUNCEMENTS_GROUP_NAME = "Announcements";
const PUSH_FUNCTION_URL = "https://mlpbkrukkmdlkwypunqh.supabase.co/functions/v1/send-jsms-push";

function safeJsonParse(value: string | null) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function pickString(...values: any[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function readLocalIdentity(): Partial<JSMSChatIdentity> {
  if (typeof window === "undefined") return {};

  const possibleObjects = [
    "teacher",
    "teacherData",
    "currentTeacher",
    "loggedInTeacher",
    "jsmsTeacher",
    "jsms_user",
    "user",
    "currentUser",
    "profile",
    "admin",
    "headmaster",
  ];

  const directTeacherId = pickString(
    localStorage.getItem("teacherId"),
    localStorage.getItem("teacher_id"),
    localStorage.getItem("teacherID"),
    localStorage.getItem("jsms_teacher_id"),
    localStorage.getItem("currentTeacherId")
  );

  const directRole = pickString(
    localStorage.getItem("role"),
    localStorage.getItem("userRole"),
    localStorage.getItem("jsms_role"),
    localStorage.getItem("account_role")
  );

  for (const key of possibleObjects) {
    const obj = safeJsonParse(localStorage.getItem(key));
    if (!obj || typeof obj !== "object") continue;

    const root = obj.teacher || obj.profile || obj.user || obj;

    const teacherId = pickString(
      root.teacher_id,
      root.teacherId,
      root.teacherID,
      root.staff_id,
      directTeacherId
    );

    const role = pickString(root.role, root.user_role, root.account_role, directRole);

    const name = pickString(
      root.full_name,
      root.name,
      root.display_name,
      root.username,
      obj.full_name,
      obj.name
    );

    if (teacherId || role || name) {
      return {
        teacherId: teacherId || null,
        role: role || undefined,
        name: name || undefined,
      };
    }
  }

  return {
    teacherId: directTeacherId || null,
    role: directRole || undefined,
  };
}

function getRoleFromPath(pathname?: string) {
  const lower = (pathname || "").toLowerCase();
  if (lower.includes("/teacher")) return "teacher";
  if (lower.includes("/headmaster")) return "headmaster";
  if (
    lower.includes("/admin") ||
    lower.includes("/admission") ||
    lower.includes("/fees") ||
    lower.includes("/books") ||
    lower.includes("/feeding") ||
    lower.includes("/students") ||
    lower.includes("/teachers") ||
    lower.includes("/settings")
  ) {
    return "admin";
  }
  return "staff";
}

export function firstName(name: string) {
  const clean = (name || "Staff").trim();
  if (!clean) return "Staff";
  return clean.split(/\s+/)[0] || clean;
}

export function initials(name: string) {
  return (
    name
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((x) => x[0]?.toUpperCase())
      .join("") || "F"
  );
}

export async function getJSMSChatIdentity(pathname?: string): Promise<JSMSChatIdentity> {
  const local = readLocalIdentity();

  const { data: sessionData } = await supabase.auth.getSession();
  const authUser = sessionData?.session?.user || null;

  let role = (local.role || "staff").toLowerCase();
  let teacherId = local.teacherId || null;
  let name = local.name || "Staff";

  if (!teacherId && authUser) {
    const email = authUser.email?.toLowerCase() || null;
    const authId = authUser.id;

    const { data: teachers } = await supabase.from("teachers").select("*").limit(1000);
    const match = (teachers || []).find((teacher: any) => {
      const ids = [teacher.auth_user_id, teacher.user_id, teacher.auth_id, teacher.supabase_user_id]
        .filter(Boolean)
        .map(String);
      const emails = [teacher.login_email, teacher.email, teacher.teacher_email]
        .filter(Boolean)
        .map((x) => String(x).toLowerCase());
      return ids.includes(authId) || (email && emails.includes(email));
    });

    if (match) {
      teacherId = match.teacher_id || null;
      role = (match.role || "teacher").toLowerCase();
      name = match.full_name || match.username || name;
    }
  }

  if (role === "staff") role = getRoleFromPath(pathname);

  if (role === "teacher" && teacherId) {
    const { data } = await supabase
      .from("teachers")
      .select("teacher_id, full_name, username, role")
      .eq("teacher_id", teacherId)
      .maybeSingle();

    if (data) {
      name = data.full_name || data.username || name;
      role = (data.role || role).toLowerCase();
    }
  }

  return {
    role,
    teacherId: role === "teacher" ? teacherId : null,
    userId: authUser?.id || null,
    name,
  };
}

async function getOrCreateGroupByType(params: {
  name: string;
  groupType: string;
  description: string;
}) {
  const { data: existing, error: existingError } = await supabase
    .from("jsms_chat_groups")
    .select("id, name, group_type")
    .eq("group_type", params.groupType)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (existingError) throw existingError;

  if (existing?.id) {
    if (existing.name !== params.name) {
      await supabase
        .from("jsms_chat_groups")
        .update({ name: params.name, description: params.description })
        .eq("id", existing.id);
    }
    return existing.id as string;
  }

  const { data, error } = await supabase
    .from("jsms_chat_groups")
    .insert({
      name: params.name,
      description: params.description,
      group_type: params.groupType,
      is_system_group: true,
      created_by_name: "System",
      is_active: true,
    })
    .select("id")
    .single();

  if (error) throw error;
  return data.id as string;
}

export async function getOrCreateStaffRoomGroup() {
  // Reuse old JSMS Staff Room group if it exists, then rename it to Staff Room.
  const { data: oldGroup } = await supabase
    .from("jsms_chat_groups")
    .select("id, name")
    .eq("name", OLD_GROUP_NAME)
    .limit(1)
    .maybeSingle();

  if (oldGroup?.id) {
    await supabase
      .from("jsms_chat_groups")
      .update({
        name: STAFF_ROOM_GROUP_NAME,
        description: "Official staff group for teachers, admins and headmaster.",
        group_type: "staff_room",
      })
      .eq("id", oldGroup.id);

    return oldGroup.id as string;
  }

  return getOrCreateGroupByType({
    name: STAFF_ROOM_GROUP_NAME,
    groupType: "staff_room",
    description: "Official staff group for teachers, admins and headmaster.",
  });
}

// Backward-compatible export for older files.
export const getOrCreateFichaGroup = getOrCreateStaffRoomGroup;

export async function getOrCreateAnnouncementsGroup() {
  return getOrCreateGroupByType({
    name: ANNOUNCEMENTS_GROUP_NAME,
    groupType: "announcements",
    description: "Official announcement channel. Announcements show on teacher dashboard for 24 hours.",
  });
}

export async function fetchGroupMessages(groupId: string) {
  const { data, error } = await supabase
    .from("v_jsms_chat_messages")
    .select("*")
    .eq("group_id", groupId)
    .order("created_at", { ascending: true })
    .limit(200);

  if (error) throw error;
  return (data || []) as JSMSChatMessage[];
}

export async function fetchDirectMessages(threadId: string) {
  const { data, error } = await supabase
    .from("v_jsms_chat_messages")
    .select("*")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true })
    .limit(200);

  if (error) throw error;
  return (data || []) as JSMSChatMessage[];
}

export async function fetchTeachersForChat(identity?: JSMSChatIdentity | null) {
  const { data, error } = await supabase
    .from("teachers")
    .select("id, teacher_id, full_name, username, role, photo_url, is_active, is_visible")
    .eq("is_active", true)
    .order("full_name", { ascending: true });

  if (error) throw error;

  return ((data || []) as any[])
    .filter((t) => t.teacher_id)
    .filter((t) => t.teacher_id !== identity?.teacherId)
    .map((t) => ({
      id: t.id,
      teacher_id: t.teacher_id,
      full_name: t.full_name || t.username || t.teacher_id,
      username: t.username,
      role: t.role,
      photo_url: t.photo_url,
    })) as TeacherChatContact[];
}

export async function fetchMyDirectThreads(identity: JSMSChatIdentity) {
  const key = identity.teacherId || identity.userId;
  if (!key) return [];

  const { data, error } = await supabase
    .from("v_jsms_direct_chat_threads")
    .select("*")
    .or(
      identity.teacherId
        ? `participant_one_teacher_id.eq.${identity.teacherId},participant_two_teacher_id.eq.${identity.teacherId}`
        : `participant_one_user_id.eq.${identity.userId},participant_two_user_id.eq.${identity.userId}`
    )
    .order("last_message_at", { ascending: false, nullsFirst: false });

  if (error) throw error;
  return (data || []) as DirectThread[];
}

export function getOtherPersonFromThread(thread: DirectThread, identity: JSMSChatIdentity) {
  const myKey = identity.teacherId || identity.userId;
  const p1Key = thread.participant_one_teacher_id || thread.participant_one_user_id;
  const isP1 = myKey && p1Key === myKey;

  return {
    name: isP1 ? thread.participant_two_name || "Staff" : thread.participant_one_name || "Staff",
    teacherId: isP1 ? thread.participant_two_teacher_id : thread.participant_one_teacher_id,
    userId: isP1 ? thread.participant_two_user_id : thread.participant_one_user_id,
    role: isP1 ? thread.participant_two_role || "staff" : thread.participant_one_role || "staff",
  };
}

export async function getOrCreateDirectThread(identity: JSMSChatIdentity, contact: TeacherChatContact) {
  const { data, error } = await supabase.rpc("get_or_create_jsms_direct_thread", {
    p_one_user_id: identity.userId,
    p_one_teacher_id: identity.teacherId,
    p_one_role: identity.role,
    p_one_name: firstName(identity.name),
    p_two_user_id: null,
    p_two_teacher_id: contact.teacher_id,
    p_two_role: contact.role || "teacher",
    p_two_name: firstName(contact.full_name),
  });

  if (error) throw error;
  return data as string;
}

export async function sendGroupMessage(params: {
  groupId: string;
  identity: JSMSChatIdentity;
  message: string;
}) {
  const cleanMessage = params.message.trim();
  if (!cleanMessage) throw new Error("Message is required.");

  const { data, error } = await supabase.rpc("send_jsms_group_message", {
    p_group_id: params.groupId,
    p_sender_user_id: params.identity.userId,
    p_sender_teacher_id: params.identity.teacherId,
    p_sender_role: params.identity.role,
    p_sender_name: firstName(params.identity.name),
    p_message: cleanMessage,
    p_message_type: "text",
    p_attachment_url: null,
    p_attachment_name: null,
  });

  if (error) throw error;
  await runPushSender();
  return data as string;
}

export async function sendDirectMessage(params: {
  threadId: string;
  identity: JSMSChatIdentity;
  message: string;
}) {
  const cleanMessage = params.message.trim();
  if (!cleanMessage) throw new Error("Message is required.");

  const { data, error } = await supabase.rpc("send_jsms_direct_message", {
    p_thread_id: params.threadId,
    p_sender_user_id: params.identity.userId,
    p_sender_teacher_id: params.identity.teacherId,
    p_sender_role: params.identity.role,
    p_sender_name: firstName(params.identity.name),
    p_message: cleanMessage,
    p_message_type: "text",
    p_attachment_url: null,
    p_attachment_name: null,
  });

  if (error) throw error;
  await runPushSender();
  return data as string;
}

export async function sendAnnouncement(params: {
  groupId: string;
  identity: JSMSChatIdentity;
  message: string;
}) {
  const cleanMessage = params.message.trim();
  if (!cleanMessage) throw new Error("Announcement is required.");

  const { data: messageRow, error: msgError } = await supabase
    .from("jsms_chat_messages")
    .insert({
      chat_type: "group",
      group_id: params.groupId,
      sender_user_id: params.identity.userId,
      sender_teacher_id: params.identity.teacherId,
      sender_role: params.identity.role,
      sender_name: firstName(params.identity.name),
      message: cleanMessage,
      message_type: "announcement",
    })
    .select("id")
    .single();

  if (msgError) throw msgError;

  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  const { data: announcementRow, error: announcementError } = await supabase
    .from("jsms_announcements")
    .insert({
      chat_message_id: messageRow.id,
      title: "Announcement",
      message: cleanMessage,
      sender_user_id: params.identity.userId,
      sender_teacher_id: params.identity.teacherId,
      sender_name: firstName(params.identity.name),
      sender_role: params.identity.role,
      target: "all_staff",
      expires_at: expiresAt,
      is_deleted: false,
    })
    .select("id")
    .single();

  if (announcementError) throw announcementError;

  await notifyAllStaffAnnouncement({
    announcementId: announcementRow.id,
    messageId: messageRow.id,
    senderName: firstName(params.identity.name),
    message: cleanMessage,
  });

  await runPushSender();
  return messageRow.id as string;
}

async function notifyAllStaffAnnouncement(params: {
  announcementId: string;
  messageId: string;
  senderName: string;
  message: string;
}) {
  const preview = params.message.length > 100 ? `${params.message.slice(0, 100)}...` : params.message;

  const { data: teachers } = await supabase
    .from("teachers")
    .select("teacher_id, full_name, is_active")
    .eq("is_active", true);

  for (const teacher of teachers || []) {
    if (!teacher.teacher_id) continue;

    await supabase.rpc("create_jsms_notification_for_recipient", {
      p_title: "Announcement",
      p_message: `${params.senderName}: ${preview}`,
      p_type: "announcement",
      p_priority: "high",
      p_source: "ficha",
      p_target_type: "teacher",
      p_recipient_role: "teacher",
      p_recipient_user_id: null,
      p_recipient_teacher_id: teacher.teacher_id,
      p_recipient_class: null,
      p_recipient_student_id: null,
      p_sender_user_id: null,
      p_sender_teacher_id: null,
      p_sender_name: params.senderName,
      p_action_url: "/dashboard/teacher",
      p_metadata: {
        module: "ficha",
        chat_type: "announcement",
        announcement_id: params.announcementId,
        message_id: params.messageId,
      },
      p_push_enabled: true,
    });
  }

  await supabase.rpc("create_jsms_notification_for_recipient", {
    p_title: "Announcement",
    p_message: `${params.senderName}: ${preview}`,
    p_type: "announcement",
    p_priority: "high",
    p_source: "ficha",
    p_target_type: "role",
    p_recipient_role: "headmaster",
    p_recipient_user_id: null,
    p_recipient_teacher_id: null,
    p_recipient_class: null,
    p_recipient_student_id: null,
    p_sender_user_id: null,
    p_sender_teacher_id: null,
    p_sender_name: params.senderName,
    p_action_url: "/dashboard/headmaster",
    p_metadata: {
      module: "ficha",
      chat_type: "announcement",
      announcement_id: params.announcementId,
      message_id: params.messageId,
    },
    p_push_enabled: true,
  });
}

export async function fetchAnnouncementByMessageIds(messageIds: string[]) {
  if (messageIds.length === 0) return new Map<string, JSMSAnnouncement>();

  const { data, error } = await supabase
    .from("jsms_announcements")
    .select("*")
    .in("chat_message_id", messageIds)
    .eq("is_deleted", false);

  if (error) throw error;

  const map = new Map<string, JSMSAnnouncement>();
  for (const row of data || []) {
    if (row.chat_message_id) map.set(row.chat_message_id, row as JSMSAnnouncement);
  }
  return map;
}

export async function fetchActiveTeacherAnnouncements() {
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("jsms_announcements")
    .select("*")
    .eq("is_deleted", false)
    .gt("expires_at", now)
    .order("created_at", { ascending: false })
    .limit(10);

  if (error) throw error;
  return (data || []) as JSMSAnnouncement[];
}

export async function deleteAnnouncement(params: {
  announcementId: string;
  messageId?: string | null;
}) {
  const { error } = await supabase
    .from("jsms_announcements")
    .update({
      is_deleted: true,
      deleted_at: new Date().toISOString(),
    })
    .eq("id", params.announcementId);

  if (error) throw error;

  if (params.messageId) {
    await supabase
      .from("jsms_chat_messages")
      .update({
        is_deleted: true,
        deleted_at: new Date().toISOString(),
      })
      .eq("id", params.messageId);
  }
}

export async function runPushSender() {
  await fetch(PUSH_FUNCTION_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  }).catch(() => null);
}

export function getChatLastReadKey(kind: "group" | "direct", id: string, identity: JSMSChatIdentity) {
  const who = identity.teacherId || identity.userId || identity.role || "staff";
  return `ficha_${kind}_last_read_${id}_${who}`;
}
