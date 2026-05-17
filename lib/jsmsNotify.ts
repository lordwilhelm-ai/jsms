import { supabase } from "@/lib/supabase";

export type JSMSNotificationType =
  | "admission"
  | "fees"
  | "feeding"
  | "attendance"
  | "checkout"
  | "duty"
  | "books"
  | "uniforms"
  | "chat"
  | "announcement"
  | "system";

export type JSMSNotificationPriority = "low" | "normal" | "high" | "urgent";

export type JSMSRecipientTarget =
  | "all"
  | "staff"
  | "role"
  | "user"
  | "teacher"
  | "all_teachers"
  | "all_admins"
  | "all_headmasters"
  | "class_teacher"
  | "student_teacher"
  | "custom";

type NotifyParams = {
  title: string;
  message: string;
  type?: JSMSNotificationType;
  priority?: JSMSNotificationPriority;
  source?: string;

  targetType?: JSMSRecipientTarget;
  recipientRole?: string | null;
  recipientUserId?: string | null;
  recipientTeacherId?: string | null;
  recipientClass?: string | null;
  recipientStudentId?: string | null;

  senderUserId?: string | null;
  senderTeacherId?: string | null;
  senderName?: string | null;

  actionUrl?: string | null;
  metadata?: Record<string, unknown>;
  pushEnabled?: boolean;

  sendPushNow?: boolean;
};

async function triggerJSMSPush() {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL || "https://mlpbkrukkmdlkwypunqh.supabase.co";

  const url = `${supabaseUrl}/functions/v1/send-jsms-push`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(text || `Push function failed with status ${res.status}`);
    }

    return { ok: true };
  } catch (error: any) {
    console.error("JSMS push trigger failed:", error?.message || error);
    return { ok: false, error: error?.message || "Push trigger failed" };
  }
}

export async function createJSMSNotification(params: NotifyParams) {
  const { data, error } = await supabase.rpc("create_jsms_notification_for_recipient", {
    p_title: params.title,
    p_message: params.message,
    p_type: params.type || "system",
    p_priority: params.priority || "normal",
    p_source: params.source || "system",

    p_target_type: params.targetType || "role",
    p_recipient_role: params.recipientRole || null,
    p_recipient_user_id: params.recipientUserId || null,
    p_recipient_teacher_id: params.recipientTeacherId || null,
    p_recipient_class: params.recipientClass || null,
    p_recipient_student_id: params.recipientStudentId || null,

    p_sender_user_id: params.senderUserId || null,
    p_sender_teacher_id: params.senderTeacherId || null,
    p_sender_name: params.senderName || "JSMS",

    p_action_url: params.actionUrl || null,
    p_metadata: params.metadata || {},
    p_push_enabled: params.pushEnabled ?? true,
  });

  if (error) throw new Error(error.message);

  if (params.sendPushNow !== false) {
    await triggerJSMSPush();
  }

  return data as string;
}

function normalizeClassName(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

async function getClassIdsByName(className: string) {
  const clean = className.trim();
  if (!clean) return [] as string[];

  const { data, error } = await supabase
    .from("classes")
    .select("id,name,class_name")
    .or(`class_name.eq.${clean},name.eq.${clean}`);

  if (error || !data) return [];

  const wanted = normalizeClassName(clean);

  return data
    .filter((c: any) => {
      const a = c.class_name ? normalizeClassName(String(c.class_name)) : "";
      const b = c.name ? normalizeClassName(String(c.name)) : "";
      return a === wanted || b === wanted;
    })
    .map((c: any) => String(c.id))
    .filter(Boolean);
}

async function getTeacherCodesFromTeacherUuids(teacherUuids: string[]) {
  const uniqueUuids = Array.from(new Set(teacherUuids.filter(Boolean)));
  if (uniqueUuids.length === 0) return [] as string[];

  const { data, error } = await supabase
    .from("teachers")
    .select("id,teacher_id,is_active,is_visible")
    .in("id", uniqueUuids);

  if (error || !data) return [];

  return Array.from(
    new Set(
      data
        .filter((t: any) => t.is_active !== false)
        .map((t: any) => String(t.teacher_id || "").trim())
        .filter(Boolean)
    )
  );
}

async function getTeacherCodesFromAssignedClassesFallback(className: string) {
  const { data, error } = await supabase
    .from("teachers")
    .select("id,teacher_id,assigned_classes,is_active,is_visible");

  if (error || !data) return [] as string[];

  const wanted = normalizeClassName(className);

  return Array.from(
    new Set(
      data
        .filter((teacher: any) => {
          if (teacher.is_active === false) return false;

          const assigned = teacher.assigned_classes;
          if (!assigned) return false;

          if (Array.isArray(assigned)) {
            return assigned.some((item) => normalizeClassName(String(item)) === wanted);
          }

          const text = String(assigned);
          return text
            .split(/[|,;]+/)
            .map((x) => normalizeClassName(x))
            .includes(wanted);
        })
        .map((teacher: any) => String(teacher.teacher_id || "").trim())
        .filter(Boolean)
    )
  );
}

async function getAssignedTeacherIdsForClass(className: string) {
  const classIds = await getClassIdsByName(className);
  const teacherUuidSet = new Set<string>();

  if (classIds.length > 0) {
    for (const table of ["teacher_class_assignments", "teacher_classes"]) {
      const { data, error } = await supabase
        .from(table)
        .select("teacher_id,class_id")
        .in("class_id", classIds);

      if (!error && data) {
        data.forEach((row: any) => {
          if (row.teacher_id) teacherUuidSet.add(String(row.teacher_id));
        });
      }
    }
  }

  const fromAssignments = await getTeacherCodesFromTeacherUuids(Array.from(teacherUuidSet));
  const fromFallback = await getTeacherCodesFromAssignedClassesFallback(className);

  return Array.from(new Set([...fromAssignments, ...fromFallback])).filter(Boolean);
}

async function notifyAdminAndHeadmaster(params: {
  title: string;
  message: string;
  type: JSMSNotificationType;
  source: string;
  priority?: JSMSNotificationPriority;
  actionUrl: string;
  metadata?: Record<string, unknown>;
  sendPushNow?: boolean;
}) {
  await createJSMSNotification({
    title: params.title,
    message: params.message,
    type: params.type,
    priority: params.priority || "normal",
    source: params.source,
    targetType: "role",
    recipientRole: "admin",
    actionUrl: params.actionUrl,
    metadata: params.metadata,
    sendPushNow: false,
  });

  await createJSMSNotification({
    title: params.title,
    message: params.message,
    type: params.type,
    priority: params.priority || "normal",
    source: params.source,
    targetType: "role",
    recipientRole: "headmaster",
    actionUrl: params.actionUrl,
    metadata: params.metadata,
    sendPushNow: false,
  });

  if (params.sendPushNow !== false) {
    await triggerJSMSPush();
  }
}

export async function notifyAdminAnnouncement(params: {
  title: string;
  message: string;
  targetType?: JSMSRecipientTarget;
  recipientRole?: string | null;
  recipientTeacherId?: string | null;
  recipientUserId?: string | null;
  priority?: JSMSNotificationPriority;
  senderName?: string | null;
}) {
  return createJSMSNotification({
    title: params.title,
    message: params.message,
    type: "announcement",
    priority: params.priority || "high",
    source: "admin",
    targetType: params.targetType || "all_teachers",
    recipientRole: params.recipientRole || "teacher",
    recipientTeacherId: params.recipientTeacherId || null,
    recipientUserId: params.recipientUserId || null,
    senderName: params.senderName || "Admin",
    actionUrl: "/dashboard/teacher",
    metadata: { module: "announcement" },
  });
}

export async function notifyFeePayment(params: {
  studentId: string;
  studentName: string;
  className: string;
  amountPaid: number;
  outstandingBalance: number;
  receiptNumber?: string | null;
}) {
  const fullyPaid = Number(params.outstandingBalance || 0) <= 0;
  const metadata = {
    module: "fees",
    student_id: params.studentId,
    student_name: params.studentName,
    class_name: params.className,
    amount_paid: params.amountPaid,
    outstanding_balance: params.outstandingBalance,
    receipt_number: params.receiptNumber || null,
    fully_paid: fullyPaid,
  };

  const teachers = await getAssignedTeacherIdsForClass(params.className);

  for (const teacherId of teachers) {
    await createJSMSNotification({
      title: fullyPaid ? "Fees Fully Paid" : "Fee Payment",
      message: fullyPaid
        ? `Your student ${params.studentName} has fully paid this term’s fees.`
        : `Your student ${params.studentName} just paid GHS ${params.amountPaid}. Outstanding balance: GHS ${params.outstandingBalance}.`,
      type: "fees",
      priority: "normal",
      source: "fees",
      targetType: "teacher",
      recipientRole: "teacher",
      recipientTeacherId: teacherId,
      recipientStudentId: params.studentId,
      actionUrl: "/fees/teacher",
      metadata,
      sendPushNow: false,
    });
  }

  await notifyAdminAndHeadmaster({
    title: fullyPaid ? "Fees Fully Paid" : "Fee Payment",
    message: fullyPaid
      ? `${params.studentName} in ${params.className} has fully paid this term’s fees.`
      : `${params.studentName} in ${params.className} paid GHS ${params.amountPaid}. Outstanding: GHS ${params.outstandingBalance}.`,
    type: "fees",
    source: "fees",
    actionUrl: "/fees/admin",
    metadata,
    sendPushNow: false,
  });

  await triggerJSMSPush();
}

export async function notifyFeedingSubmitted(params: {
  teacherId?: string | null;
  teacherName: string;
  className: string;
  date?: string | null;
}) {
  await createJSMSNotification({
    title: "Feeding Submitted",
    message: `${params.teacherName} has submitted feeding for ${params.className} today.`,
    type: "feeding",
    priority: "normal",
    source: "feeding",
    targetType: "role",
    recipientRole: "admin",
    actionUrl: "/feeding/admin",
    senderTeacherId: params.teacherId || null,
    senderName: params.teacherName,
    metadata: {
      module: "feeding",
      teacher_name: params.teacherName,
      class_name: params.className,
      date: params.date || null,
    },
    sendPushNow: false,
  });

  await createJSMSNotification({
    title: "Feeding Submitted",
    message: `${params.teacherName}, your feeding submission for today has been submitted successfully.`,
    type: "feeding",
    priority: "normal",
    source: "feeding",
    targetType: "teacher",
    recipientRole: "teacher",
    recipientTeacherId: params.teacherId || null,
    actionUrl: "/feeding/teacher",
    senderTeacherId: params.teacherId || null,
    senderName: params.teacherName,
    metadata: {
      module: "feeding",
      teacher_name: params.teacherName,
      class_name: params.className,
      date: params.date || null,
    },
    sendPushNow: false,
  });

  await triggerJSMSPush();
}

export async function notifyFeedingMoneyReceived(params: {
  teacherId?: string | null;
  teacherName: string;
  className: string;
  amount?: number | null;
  date?: string | null;
}) {
  return createJSMSNotification({
    title: "Feeding Money Received",
    message: "Your feeding money for today has been received successfully.",
    type: "feeding",
    priority: "normal",
    source: "feeding",
    targetType: "teacher",
    recipientRole: "teacher",
    recipientTeacherId: params.teacherId || null,
    actionUrl: "/feeding/teacher",
    senderName: "Admin",
    metadata: {
      module: "feeding",
      teacher_name: params.teacherName,
      class_name: params.className,
      amount: params.amount || null,
      date: params.date || null,
    },
  });
}

export async function notifyBookIssued(params: {
  studentId: string;
  studentName: string;
  className: string;
  bookName: string;
}) {
  const metadata = {
    module: "books",
    student_id: params.studentId,
    student_name: params.studentName,
    class_name: params.className,
    book_name: params.bookName,
  };

  const teachers = await getAssignedTeacherIdsForClass(params.className);

  for (const teacherId of teachers) {
    await createJSMSNotification({
      title: "Book Issued",
      message: `Your student ${params.studentName} has received ${params.bookName}.`,
      type: "books",
      priority: "normal",
      source: "books",
      targetType: "teacher",
      recipientRole: "teacher",
      recipientTeacherId: teacherId,
      recipientStudentId: params.studentId,
      actionUrl: "/books/teacher",
      metadata,
      sendPushNow: false,
    });
  }

  await notifyAdminAndHeadmaster({
    title: "Book Issued",
    message: `${params.studentName} in ${params.className} has received ${params.bookName}.`,
    type: "books",
    source: "books",
    actionUrl: "/books",
    metadata,
    sendPushNow: false,
  });

  await triggerJSMSPush();
}

export async function notifyUniformIssued(params: {
  studentId: string;
  studentName: string;
  className: string;
  uniformItem: string;
}) {
  const metadata = {
    module: "uniforms",
    student_id: params.studentId,
    student_name: params.studentName,
    class_name: params.className,
    uniform_item: params.uniformItem,
  };

  const teachers = await getAssignedTeacherIdsForClass(params.className);

  for (const teacherId of teachers) {
    await createJSMSNotification({
      title: "Uniform Issued",
      message: `Your student ${params.studentName} has received ${params.uniformItem}.`,
      type: "uniforms",
      priority: "normal",
      source: "uniforms",
      targetType: "teacher",
      recipientRole: "teacher",
      recipientTeacherId: teacherId,
      recipientStudentId: params.studentId,
      actionUrl: "/uniforms/teacher",
      metadata,
      sendPushNow: false,
    });
  }

  await notifyAdminAndHeadmaster({
    title: "Uniform Issued",
    message: `${params.studentName} in ${params.className} has received ${params.uniformItem}.`,
    type: "uniforms",
    source: "uniforms",
    actionUrl: "/uniforms",
    metadata,
    sendPushNow: false,
  });

  await triggerJSMSPush();
}

export async function notifyTeacherAttendanceReminder(params: {
  teacherId: string;
  teacherName: string;
}) {
  return createJSMSNotification({
    title: "Attendance Reminder",
    message: `${params.teacherName}, you haven’t marked your attendance today.`,
    type: "attendance",
    priority: "high",
    source: "attendance",
    targetType: "teacher",
    recipientRole: "teacher",
    recipientTeacherId: params.teacherId,
    actionUrl: "/dashboard/teacher",
    metadata: {
      module: "attendance",
      teacher_id: params.teacherId,
      teacher_name: params.teacherName,
    },
  });
}

export async function notifyTeacherCheckoutReminder(params: {
  teacherId: string;
  teacherName: string;
}) {
  return createJSMSNotification({
    title: "Checkout Reminder",
    message: `${params.teacherName}, you haven’t checked out today.`,
    type: "checkout",
    priority: "normal",
    source: "attendance",
    targetType: "teacher",
    recipientRole: "teacher",
    recipientTeacherId: params.teacherId,
    actionUrl: "/dashboard/teacher",
    metadata: {
      module: "attendance",
      teacher_id: params.teacherId,
      teacher_name: params.teacherName,
    },
  });
}

export async function notifyDirectChatMessage(params: {
  senderName: string;
  receiverUserId?: string | null;
  receiverTeacherId?: string | null;
  receiverRole?: string | null;
  messagePreview?: string | null;
  threadId?: string | null;
}) {
  return createJSMSNotification({
    title: "New Message",
    message: `${params.senderName} sent you a message.`,
    type: "chat",
    priority: "normal",
    source: "chat",
    targetType: "user",
    recipientRole: params.receiverRole || null,
    recipientUserId: params.receiverUserId || null,
    recipientTeacherId: params.receiverTeacherId || null,
    actionUrl: "/chat",
    senderName: params.senderName,
    metadata: {
      module: "chat",
      chat_type: "direct",
      thread_id: params.threadId || null,
      message_preview: params.messagePreview || null,
    },
  });
}
