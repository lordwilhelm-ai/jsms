"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { supabase } from "@/lib/supabase";
import {
  deleteAnnouncement,
  DirectThread,
  fetchAnnouncementByMessageIds,
  fetchDirectMessages,
  fetchGroupMessages,
  fetchMyDirectThreads,
  fetchTeachersForChat,
  getChatLastReadKey,
  getJSMSChatIdentity,
  getOrCreateAnnouncementsGroup,
  getOrCreateDirectThread,
  getOrCreateStaffRoomGroup,
  getOtherPersonFromThread,
  initials,
  JSMSAnnouncement,
  JSMSChatIdentity,
  JSMSChatMessage,
  sendAnnouncement,
  sendDirectMessage,
  sendGroupMessage,
  TeacherChatContact,
  firstName,
} from "@/lib/jsmsChat";

type ChatKind = "staff_room" | "announcements" | "direct";
type Screen = "list" | "chat";
type LoadState = "loading" | "ready" | "error";

type ActiveChat = {
  kind: ChatKind;
  id: string;
  title: string;
  subtitle: string;
  photoUrl?: string | null;
};

type ChatRow = {
  key: string;
  kind: ChatKind;
  id: string;
  title: string;
  subtitle: string;
  lastMessage?: string | null;
  lastTime?: string | null;
  photoUrl?: string | null;
  contact?: TeacherChatContact;
  thread?: DirectThread;
  icon?: string;
};

export default function JSMSChatWidget() {
  const pathname = usePathname();
  const messageListRef = useRef<HTMLDivElement | null>(null);

  const [open, setOpen] = useState(false);
  const [isPhone, setIsPhone] = useState(false);
  const [screen, setScreen] = useState<Screen>("list");
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [error, setError] = useState("");

  const [identity, setIdentity] = useState<JSMSChatIdentity | null>(null);
  const [staffRoomId, setStaffRoomId] = useState<string | null>(null);
  const [announcementsId, setAnnouncementsId] = useState<string | null>(null);

  const [activeChat, setActiveChat] = useState<ActiveChat | null>(null);
  const [messages, setMessages] = useState<JSMSChatMessage[]>([]);
  const [messageAnnouncements, setMessageAnnouncements] = useState<Map<string, JSMSAnnouncement>>(new Map());
  const [teachers, setTeachers] = useState<TeacherChatContact[]>([]);
  const [threads, setThreads] = useState<DirectThread[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [search, setSearch] = useState("");
  const [refreshTick, setRefreshTick] = useState(0);

  const isAdminLike = identity?.role === "admin" || identity?.role === "headmaster" || identity?.role === "super_admin";
  const forcePhoneLayout = isPhone || identity?.role === "teacher" || (pathname || "").toLowerCase().includes("/teacher");
  const shouldShowList = !forcePhoneLayout || screen === "list";
  const shouldShowChat = !forcePhoneLayout || screen === "chat";

  const unreadCount = useMemo(() => {
    if (!identity || typeof window === "undefined") return 0;

    let count = 0;
    for (const [kind, id] of [
      ["group", staffRoomId],
      ["group", announcementsId],
    ] as const) {
      if (!id) continue;
      const key = getChatLastReadKey(kind, id, identity);
      const lastRead = localStorage.getItem(key);
      const lastReadMs = lastRead ? new Date(lastRead).getTime() : 0;

      if ((activeChat?.id === id) && open) continue;

      // We do not have all messages loaded for every chat, so badge stays conservative.
      // It updates properly once user opens Ficha and messages refresh.
      const relevant = messages.filter((m) => m.group_id === id);
      count += relevant.filter((m) => !isOwnMessage(m, identity) && new Date(m.created_at).getTime() > lastReadMs).length;
    }

    return Math.min(count, 99);
  }, [identity, staffRoomId, announcementsId, messages, activeChat?.id, open]);

  const chatRows = useMemo(() => {
    const q = search.trim().toLowerCase();

    const rows: ChatRow[] = [];

    if (staffRoomId) {
      rows.push({
        key: "staff-room",
        kind: "staff_room",
        id: staffRoomId,
        title: "Staff Room",
        subtitle: "All staff group",
        icon: "👥",
      });
    }

    if (announcementsId) {
      rows.push({
        key: "announcements",
        kind: "announcements",
        id: announcementsId,
        title: "Announcements",
        subtitle: "Official updates",
        icon: "📢",
      });
    }

    for (const thread of threads) {
      if (!identity) continue;
      const other = getOtherPersonFromThread(thread, identity);
      rows.push({
        key: `thread-${thread.id}`,
        kind: "direct",
        id: thread.id,
        title: firstName(other.name),
        subtitle: "Direct message",
        lastMessage: thread.last_message,
        lastTime: thread.last_message_at,
        thread,
      });
    }

    const existingTeacherIds = new Set(
      threads.flatMap((thread) => [thread.participant_one_teacher_id, thread.participant_two_teacher_id]).filter(Boolean)
    );

    for (const teacher of teachers) {
      if (existingTeacherIds.has(teacher.teacher_id)) continue;
      rows.push({
        key: `teacher-${teacher.teacher_id}`,
        kind: "direct",
        id: teacher.teacher_id,
        title: firstName(teacher.full_name),
        subtitle: teacher.role === "headmaster" ? "Headmaster" : "Tap to message",
        photoUrl: teacher.photo_url,
        contact: teacher,
      });
    }

    if (!q) return rows;

    return rows.filter((row) => {
      return (
        row.title.toLowerCase().includes(q) ||
        row.subtitle.toLowerCase().includes(q) ||
        (row.lastMessage || "").toLowerCase().includes(q)
      );
    });
  }, [search, staffRoomId, announcementsId, threads, teachers, identity]);

  async function loadBase() {
    try {
      setLoadState("loading");
      setError("");

      const foundIdentity = await getJSMSChatIdentity(pathname || "");
      const [staffId, announceId] = await Promise.all([
        getOrCreateStaffRoomGroup(),
        getOrCreateAnnouncementsGroup(),
      ]);

      const [teacherRows, directRows] = await Promise.all([
        fetchTeachersForChat(foundIdentity),
        fetchMyDirectThreads(foundIdentity),
      ]);

      setIdentity(foundIdentity);
      setStaffRoomId(staffId);
      setAnnouncementsId(announceId);
      setTeachers(teacherRows);
      setThreads(directRows);
      setLoadState("ready");
    } catch (err: any) {
      console.error(err);
      setError(err?.message || "Could not load Ficha.");
      setLoadState("error");
    }
  }

  async function openRow(row: ChatRow) {
    if (!identity) return;

    if (row.kind === "staff_room") {
      await openGroup({
        kind: "staff_room",
        id: row.id,
        title: "Staff Room",
        subtitle: "All staff group",
      });
      return;
    }

    if (row.kind === "announcements") {
      await openGroup({
        kind: "announcements",
        id: row.id,
        title: "Announcements",
        subtitle: isAdminLike ? "Send official updates" : "Official updates",
      });
      return;
    }

    if (row.thread) {
      await openExistingThread(row.thread);
      return;
    }

    if (row.contact) {
      await openTeacherDirect(row.contact);
    }
  }

  async function openGroup(chat: ActiveChat) {
    if (!identity) return;

    setActiveChat(chat);
    const rows = await fetchGroupMessages(chat.id);
    setMessages(rows);
    await loadAnnouncementMap(rows);
    markRead("group", chat.id);
    setScreen("chat");
    setTimeout(scrollToBottom, 80);
  }

  async function openTeacherDirect(contact: TeacherChatContact) {
    if (!identity) return;

    try {
      setError("");
      const threadId = await getOrCreateDirectThread(identity, contact);
      const chat: ActiveChat = {
        kind: "direct",
        id: threadId,
        title: firstName(contact.full_name),
        subtitle: "Direct message",
        photoUrl: contact.photo_url,
      };

      setActiveChat(chat);
      const rows = await fetchDirectMessages(threadId);
      setMessages(rows);
      setMessageAnnouncements(new Map());
      markRead("direct", threadId);
      setScreen("chat");
      setTimeout(scrollToBottom, 80);

      const threadRows = await fetchMyDirectThreads(identity);
      setThreads(threadRows);
    } catch (err: any) {
      console.error(err);
      setError(err?.message || "Could not open chat.");
    }
  }

  async function openExistingThread(thread: DirectThread) {
    if (!identity) return;
    const other = getOtherPersonFromThread(thread, identity);
    const chat: ActiveChat = {
      kind: "direct",
      id: thread.id,
      title: firstName(other.name),
      subtitle: "Direct message",
    };
    setActiveChat(chat);
    const rows = await fetchDirectMessages(thread.id);
    setMessages(rows);
    setMessageAnnouncements(new Map());
    markRead("direct", thread.id);
    setScreen("chat");
    setTimeout(scrollToBottom, 80);
  }

  async function loadAnnouncementMap(rows: JSMSChatMessage[]) {
    const ids = rows.filter((m) => m.message_type === "announcement").map((m) => m.id);
    if (ids.length === 0) {
      setMessageAnnouncements(new Map());
      return;
    }

    const map = await fetchAnnouncementByMessageIds(ids);
    setMessageAnnouncements(map);
  }

  async function refreshActiveMessages() {
    if (!activeChat || !identity) return;

    try {
      const rows =
        activeChat.kind === "direct"
          ? await fetchDirectMessages(activeChat.id)
          : await fetchGroupMessages(activeChat.id);

      setMessages(rows);
      await loadAnnouncementMap(rows);
      const threadRows = await fetchMyDirectThreads(identity);
      setThreads(threadRows);
    } catch (err) {
      console.error(err);
    }
  }

  function markRead(kind: "group" | "direct", id: string) {
    if (!identity || typeof window === "undefined") return;
    localStorage.setItem(getChatLastReadKey(kind, id, identity), new Date().toISOString());
  }

  function scrollToBottom() {
    messageListRef.current?.scrollTo({ top: messageListRef.current.scrollHeight, behavior: "smooth" });
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!identity || !activeChat || !draft.trim()) return;

    setSending(true);
    try {
      if (activeChat.kind === "announcements") {
        if (!isAdminLike) throw new Error("Only admin/headmaster can send announcements.");
        await sendAnnouncement({ groupId: activeChat.id, identity, message: draft });
        markRead("group", activeChat.id);
      } else if (activeChat.kind === "staff_room") {
        await sendGroupMessage({ groupId: activeChat.id, identity, message: draft });
        markRead("group", activeChat.id);
      } else {
        await sendDirectMessage({ threadId: activeChat.id, identity, message: draft });
        markRead("direct", activeChat.id);
      }

      setDraft("");
      await refreshActiveMessages();
      setTimeout(scrollToBottom, 80);
    } catch (err: any) {
      console.error(err);
      setError(err?.message || "Message not sent.");
    } finally {
      setSending(false);
    }
  }

  async function handleDeleteAnnouncement(message: JSMSChatMessage) {
    const announcement = messageAnnouncements.get(message.id);
    if (!announcement) return;

    const ok = window.confirm("Delete this announcement?");
    if (!ok) return;

    try {
      await deleteAnnouncement({
        announcementId: announcement.id,
        messageId: message.id,
      });
      setMessages((prev) => prev.filter((m) => m.id !== message.id));
      const next = new Map(messageAnnouncements);
      next.delete(message.id);
      setMessageAnnouncements(next);
    } catch (err: any) {
      setError(err?.message || "Could not delete announcement.");
    }
  }

  useEffect(() => {
    const update = () => setIsPhone(window.innerWidth < 760 || isMobileDevice());
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  useEffect(() => {
    if (open) loadBase();
  }, [open, pathname]);

  useEffect(() => {
    if (!open || !activeChat) return;

    const tableFilter =
      activeChat.kind === "direct"
        ? `thread_id=eq.${activeChat.id}`
        : `group_id=eq.${activeChat.id}`;

    const channel = supabase
      .channel(`ficha-${activeChat.kind}-${activeChat.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "jsms_chat_messages", filter: tableFilter },
        () => setRefreshTick((x) => x + 1)
      )
      .subscribe();

    const timer = setInterval(() => setRefreshTick((x) => x + 1), 12000);

    return () => {
      clearInterval(timer);
      supabase.removeChannel(channel);
    };
  }, [open, activeChat?.id, activeChat?.kind]);

  useEffect(() => {
    if (!open || !activeChat) return;
    refreshActiveMessages();
  }, [refreshTick]);

  useEffect(() => {
    if (!open || !activeChat) return;
    if (activeChat.kind === "direct") markRead("direct", activeChat.id);
    else markRead("group", activeChat.id);
    setTimeout(scrollToBottom, 80);
  }, [open, activeChat?.id, messages.length]);

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          setScreen("list");
        }}
        style={styles.floatingButton}
        aria-label="Open Ficha"
      >
        <span style={styles.chatIcon}>💬</span>
        {unreadCount > 0 && <span style={styles.badge}>{unreadCount}</span>}
      </button>

      {open && (
        <section style={forcePhoneLayout ? styles.phoneShell : styles.desktopShell}>
          <div style={forcePhoneLayout ? styles.mobileFrame : styles.desktopFrame}>
            {shouldShowList && (
              <aside style={forcePhoneLayout ? styles.mobileListPane : styles.desktopListPane}>
                <div style={styles.appHeader}>
                  <h2 style={styles.appTitle}>Ficha</h2>
                  <button type="button" onClick={() => setOpen(false)} style={styles.iconButton}>
                    ×
                  </button>
                </div>

                {loadState === "loading" && <div style={styles.centerText}>Loading...</div>}

                {loadState === "error" && (
                  <div style={styles.centerText}>
                    <p style={styles.errorText}>{error}</p>
                    <button type="button" style={styles.retryButton} onClick={loadBase}>
                      Retry
                    </button>
                  </div>
                )}

                {loadState === "ready" && (
                  <>
                    <div style={styles.searchWrap}>
                      <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search or start chat"
                        style={styles.searchInput}
                      />
                    </div>

                    <div style={styles.chatRows}>
                      {chatRows.map((row) => (
                        <button key={row.key} type="button" style={styles.chatRow} onClick={() => openRow(row)}>
                          <Avatar name={row.title} photoUrl={row.photoUrl} icon={row.icon} />
                          <div style={styles.rowMain}>
                            <div style={styles.rowTop}>
                              <b style={styles.rowTitle}>{row.title}</b>
                              {row.lastTime && <span style={styles.rowTime}>{formatListTime(row.lastTime)}</span>}
                            </div>
                            <span style={styles.rowSub}>{row.lastMessage || row.subtitle}</span>
                          </div>
                        </button>
                      ))}

                      {chatRows.length === 0 && <div style={styles.empty}>No chats found.</div>}
                    </div>
                  </>
                )}
              </aside>
            )}

            {shouldShowChat && (
              <main style={forcePhoneLayout ? styles.mobileChatPane : styles.chatPane}>
                {activeChat ? (
                  <>
                    <div style={styles.chatHeader}>
                      {forcePhoneLayout && (
                        <button type="button" style={styles.backButton} onClick={() => setScreen("list")}>
                          ‹
                        </button>
                      )}

                      <Avatar name={activeChat.title} photoUrl={activeChat.photoUrl} icon={activeChat.kind === "announcements" ? "📢" : activeChat.kind === "staff_room" ? "👥" : undefined} />

                      <div style={{ minWidth: 0 }}>
                        <h3 style={styles.chatTitle}>{activeChat.title}</h3>
                        <p style={styles.chatSub}>{activeChat.subtitle}</p>
                      </div>
                    </div>

                    {error && <div style={styles.inlineError}>{error}</div>}

                    <div ref={messageListRef} style={styles.messageList}>
                      {messages.length === 0 && <div style={styles.empty}>No messages yet.</div>}

                      {messages.map((msg) => {
                        const mine = identity ? isOwnMessage(msg, identity) : false;
                        const announcement = messageAnnouncements.get(msg.id);
                        const canDelete = activeChat.kind === "announcements" && isAdminLike && !!announcement;

                        return (
                          <div key={msg.id} style={{ ...styles.messageWrap, justifyContent: mine ? "flex-end" : "flex-start" }}>
                            <div style={{ ...styles.bubble, ...(mine ? styles.myBubble : styles.otherBubble) }}>
                              {!mine && <div style={styles.sender}>{firstName(msg.sender_name)}</div>}
                              <div style={styles.messageText}>{msg.message}</div>
                              <div style={styles.messageMeta}>
                                <span>{formatTime(msg.created_at)}</span>
                                {canDelete && (
                                  <button type="button" style={styles.deleteBtn} onClick={() => handleDeleteAnnouncement(msg)}>
                                    Delete
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {(activeChat.kind !== "announcements" || isAdminLike) && (
                      <form onSubmit={handleSend} style={styles.form}>
                        <input
                          value={draft}
                          onChange={(e) => setDraft(e.target.value)}
                          placeholder={activeChat.kind === "announcements" ? "Type announcement" : "Message"}
                          style={styles.messageInput}
                        />
                        <button type="submit" disabled={sending || !draft.trim()} style={styles.sendButton}>
                          {sending ? "..." : "➤"}
                        </button>
                      </form>
                    )}

                    {activeChat.kind === "announcements" && !isAdminLike && (
                      <div style={styles.readOnlyFooter}>Announcements are read-only.</div>
                    )}
                  </>
                ) : (
                  <div style={styles.blankChat}>Select a chat</div>
                )}
              </main>
            )}
          </div>
        </section>
      )}
    </>
  );
}

function Avatar({ name, photoUrl, icon }: { name: string; photoUrl?: string | null; icon?: string }) {
  if (photoUrl) {
    return (
      <div style={styles.avatar}>
        <img src={photoUrl} alt={name} style={styles.avatarImage} />
      </div>
    );
  }

  return <div style={styles.avatar}>{icon || initials(name)}</div>;
}

function isMobileDevice() {
  if (typeof window === "undefined") return false;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

function isOwnMessage(message: JSMSChatMessage, identity: JSMSChatIdentity) {
  if (identity.teacherId && message.sender_teacher_id === identity.teacherId) return true;
  if (identity.userId && message.sender_user_id === identity.userId) return true;
  return message.sender_name === firstName(identity.name) && message.sender_role === identity.role;
}

function formatTime(value: string) {
  try {
    return new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
  } catch {
    return "";
  }
}

function formatListTime(value: string) {
  try {
    const d = new Date(value);
    const today = new Date();
    if (d.toDateString() === today.toDateString()) return formatTime(value);
    return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(d);
  } catch {
    return "";
  }
}

const styles: Record<string, React.CSSProperties> = {
  floatingButton: {
    position: "fixed",
    right: 18,
    bottom: 18,
    width: 58,
    height: 58,
    borderRadius: 999,
    border: "none",
    background: "linear-gradient(135deg, #0f7a3b, #0f2a17)",
    color: "white",
    boxShadow: "0 18px 45px rgba(15, 122, 59, 0.35)",
    cursor: "pointer",
    zIndex: 9000,
    display: "grid",
    placeItems: "center",
  },
  chatIcon: { fontSize: 26 },
  badge: {
    position: "absolute",
    top: -5,
    right: -5,
    minWidth: 23,
    height: 23,
    padding: "0 6px",
    borderRadius: 999,
    background: "#dc2626",
    color: "#fff",
    display: "grid",
    placeItems: "center",
    fontSize: 11,
    fontWeight: 900,
    border: "2px solid white",
  },
  desktopShell: {
    position: "fixed",
    inset: 0,
    zIndex: 9200,
    background: "rgba(10, 20, 14, 0.42)",
    padding: 12,
    display: "grid",
    placeItems: "center",
    fontFamily: "Inter, Arial, sans-serif",
  },
  phoneShell: {
    position: "fixed",
    inset: 0,
    zIndex: 9200,
    background: "#071014",
    display: "block",
    fontFamily: "Inter, Arial, sans-serif",
  },
  desktopFrame: {
    width: "min(1180px, 100%)",
    height: "min(760px, calc(100vh - 24px))",
    background: "#fff",
    borderRadius: 18,
    overflow: "hidden",
    display: "flex",
    boxShadow: "0 28px 90px rgba(0,0,0,.28)",
  },
  mobileFrame: {
    width: "100vw",
    height: "100dvh",
    background: "#071014",
    borderRadius: 0,
    overflow: "hidden",
    display: "flex",
    color: "#e9edef",
  },
  desktopListPane: {
    width: 380,
    minWidth: 340,
    borderRight: "1px solid #dbe5de",
    display: "flex",
    flexDirection: "column",
    background: "#071014",
    color: "#e9edef",
  },
  mobileListPane: {
    width: "100%",
    minWidth: "100%",
    height: "100dvh",
    display: "flex",
    flexDirection: "column",
    background: "#071014",
    color: "#e9edef",
  },
  appHeader: {
    minHeight: 78,
    padding: "16px 18px 10px",
    background: "#071014",
    color: "#e9edef",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
  appTitle: { margin: 0, fontSize: 30, fontWeight: 950, letterSpacing: "-.03em" },
  iconButton: {
    width: 38,
    height: 38,
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,.2)",
    background: "rgba(255,255,255,.1)",
    color: "white",
    fontSize: 24,
    cursor: "pointer",
  },
  searchWrap: { padding: "8px 14px 12px", background: "#071014" },
  searchInput: {
    width: "100%",
    border: "none",
    borderRadius: 999,
    padding: "13px 16px",
    outline: "none",
    fontSize: 14,
    background: "#202c33",
    color: "#e9edef",
  },
  chatRows: { flex: 1, overflowY: "auto", paddingBottom: 86, background: "#071014" },
  chatRow: {
    width: "100%",
    border: "none",
    background: "transparent",
    padding: "12px 14px",
    display: "flex",
    gap: 12,
    alignItems: "center",
    cursor: "pointer",
    textAlign: "left",
    borderBottom: "1px solid rgba(134,150,160,.16)",
    color: "#e9edef",
  },
  avatar: {
    width: 48,
    minWidth: 48,
    height: 48,
    borderRadius: 999,
    background: "#dff4e7",
    color: "#0f7a3b",
    display: "grid",
    placeItems: "center",
    fontWeight: 950,
    overflow: "hidden",
    fontSize: 17,
  },
  avatarImage: { width: "100%", height: "100%", objectFit: "cover" },
  rowMain: { display: "grid", gap: 4, minWidth: 0, flex: 1 },
  rowTop: { display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" },
  rowTitle: { fontSize: 16, color: "#e9edef", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  rowTime: { fontSize: 11, color: "#8696a0", whiteSpace: "nowrap" },
  rowSub: { fontSize: 13, color: "#8696a0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  chatPane: { flex: 1, minWidth: 0, display: "flex", flexDirection: "column", background: "#0b141a" },
  mobileChatPane: { width: "100%", minWidth: "100%", height: "100dvh", display: "flex", flexDirection: "column", background: "#0b141a" },
  chatHeader: {
    minHeight: 70,
    padding: "12px 16px",
    background: "#202c33",
    borderBottom: "1px solid rgba(134,150,160,.16)",
    display: "flex",
    alignItems: "center",
    gap: 12,
  },
  backButton: {
    border: "none",
    background: "transparent",
    fontSize: 34,
    lineHeight: 1,
    cursor: "pointer",
    color: "#e9edef",
  },
  chatTitle: { margin: 0, fontSize: 17, color: "#e9edef", fontWeight: 950, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  chatSub: { margin: "2px 0 0", fontSize: 12, color: "#8696a0" },
  messageList: { flex: 1, overflowY: "auto", padding: 14, background: "#0b141a" },
  messageWrap: { display: "flex", marginBottom: 10 },
  bubble: { maxWidth: "82%", borderRadius: 17, padding: "9px 11px", fontSize: 14, lineHeight: 1.45, wordBreak: "break-word" },
  myBubble: { background: "#005c4b", color: "#e9edef", borderBottomRightRadius: 5 },
  otherBubble: { background: "#202c33", color: "#e9edef", border: "1px solid rgba(134,150,160,.16)", borderBottomLeftRadius: 5 },
  sender: { fontSize: 11, fontWeight: 950, color: "#0f7a3b", marginBottom: 3 },
  messageText: { whiteSpace: "pre-wrap" },
  messageMeta: { display: "flex", justifyContent: "flex-end", gap: 10, alignItems: "center", fontSize: 10, color: "#8696a0", marginTop: 5 },
  deleteBtn: { border: "none", background: "transparent", color: "#fecaca", fontWeight: 900, cursor: "pointer", fontSize: 10 },
  form: { display: "flex", gap: 8, padding: 10, background: "#202c33", borderTop: "1px solid rgba(134,150,160,.16)" },
  messageInput: { flex: 1, minWidth: 0, border: "none", borderRadius: 999, padding: "12px 14px", outline: "none", fontSize: 15, background: "#111b21", color: "#e9edef" },
  sendButton: { width: 46, height: 46, border: "none", borderRadius: 999, background: "#0f7a3b", color: "#fff", fontWeight: 950, cursor: "pointer", fontSize: 18 },
  readOnlyFooter: { padding: 14, background: "#202c33", color: "#8696a0", textAlign: "center", fontSize: 13 },
  centerText: { flex: 1, display: "grid", placeItems: "center", padding: 18, color: "#8696a0", textAlign: "center", fontSize: 14 },
  errorText: { color: "#fecaca", fontWeight: 800 },
  inlineError: { padding: "8px 12px", background: "#fff1f2", color: "#991b1b", fontSize: 12, fontWeight: 800 },
  retryButton: { border: "1px solid #bfd0c5", borderRadius: 12, background: "white", padding: "10px 14px", cursor: "pointer", fontWeight: 800 },
  empty: { textAlign: "center", color: "#8696a0", marginTop: 24, fontSize: 13, padding: 12 },
  blankChat: { flex: 1, display: "grid", placeItems: "center", color: "#8696a0", background: "#0b141a" },
};
