"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { supabase } from "@/lib/supabase";
import {
  DirectThread,
  fetchDirectMessages,
  fetchGroupMessages,
  fetchMyDirectThreads,
  fetchTeachersForChat,
  getChatLastReadKey,
  getJSMSChatIdentity,
  getOrCreateDirectThread,
  getOrCreateFichaGroup,
  getOtherPersonFromThread,
  JSMSChatIdentity,
  JSMSChatMessage,
  sendDirectMessage,
  sendGroupMessage,
  TeacherChatContact,
} from "@/lib/jsmsChat";

type ChatMode = "ficha" | "direct";
type Screen = "list" | "chat";
type LoadState = "loading" | "ready" | "error";

type ActiveChat =
  | { mode: "ficha"; id: string; title: "Staff Room"; subtitle: string }
  | { mode: "direct"; id: string; title: string; subtitle: string };

export default function JSMSChatWidget() {
  const pathname = usePathname();
  const listRef = useRef<HTMLDivElement | null>(null);

  const [open, setOpen] = useState(false);
  const [isPhone, setIsPhone] = useState(false);
  const [screen, setScreen] = useState<Screen>("list");
  const [mode, setMode] = useState<ChatMode>("ficha");
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [error, setError] = useState("");

  const [identity, setIdentity] = useState<JSMSChatIdentity | null>(null);
  const [fichaGroupId, setFichaGroupId] = useState<string | null>(null);
  const [activeChat, setActiveChat] = useState<ActiveChat | null>(null);
  const [messages, setMessages] = useState<JSMSChatMessage[]>([]);
  const [teachers, setTeachers] = useState<TeacherChatContact[]>([]);
  const [threads, setThreads] = useState<DirectThread[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [search, setSearch] = useState("");
  const [refreshTick, setRefreshTick] = useState(0);

  const lastMessageTime = messages[messages.length - 1]?.created_at || null;

  const unreadCount = useMemo(() => {
    if (!identity || typeof window === "undefined") return 0;

    let count = 0;
    if (fichaGroupId) {
      const key = getChatLastReadKey("group", fichaGroupId, identity);
      const lastRead = localStorage.getItem(key);
      const lastReadMs = lastRead ? new Date(lastRead).getTime() : 0;
      if (activeChat?.mode === "ficha") {
        count += messages.filter((m) => !isOwnMessage(m, identity) && new Date(m.created_at).getTime() > lastReadMs).length;
      }
    }

    return Math.min(count, 99);
  }, [identity, fichaGroupId, messages, activeChat]);

  const filteredTeachers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return teachers;
    return teachers.filter((t) => {
      return (
        t.full_name.toLowerCase().includes(q) ||
        t.teacher_id.toLowerCase().includes(q) ||
        (t.username || "").toLowerCase().includes(q)
      );
    });
  }, [teachers, search]);

  async function loadBase() {
    try {
      setLoadState("loading");
      setError("");

      const foundIdentity = await getJSMSChatIdentity(pathname || "");
      const groupId = await getOrCreateFichaGroup();
      const [teacherRows, directRows] = await Promise.all([
        fetchTeachersForChat(foundIdentity),
        fetchMyDirectThreads(foundIdentity),
      ]);

      setIdentity(foundIdentity);
      setFichaGroupId(groupId);
      setTeachers(teacherRows);
      setThreads(directRows);

      if (!activeChat) {
        const fichaChat: ActiveChat = {
          mode: "ficha",
          id: groupId,
          title: "Staff Room",
          subtitle: "Group",
        };
        setActiveChat(fichaChat);
        const rows = await fetchGroupMessages(groupId);
        setMessages(rows);
      }

      setLoadState("ready");
    } catch (err: any) {
      console.error(err);
      setError(err?.message || "Could not load Ficha.");
      setLoadState("error");
    }
  }

  async function refreshActiveMessages() {
    if (!activeChat) return;
    try {
      const rows =
        activeChat.mode === "ficha"
          ? await fetchGroupMessages(activeChat.id)
          : await fetchDirectMessages(activeChat.id);
      setMessages(rows);
      if (identity) {
        const threadRows = await fetchMyDirectThreads(identity);
        setThreads(threadRows);
      }
    } catch (err) {
      console.error(err);
    }
  }

  async function openFicha() {
    if (!fichaGroupId || !identity) return;
    setMode("ficha");
    const chat: ActiveChat = { mode: "ficha", id: fichaGroupId, title: "Staff Room", subtitle: "Group" };
    setActiveChat(chat);
    const rows = await fetchGroupMessages(fichaGroupId);
    setMessages(rows);
    markRead("group", fichaGroupId);
    setScreen("chat");
    setTimeout(scrollToBottom, 80);
  }

  async function openTeacherDirect(contact: TeacherChatContact) {
    if (!identity) return;
    try {
      setError("");
      const threadId = await getOrCreateDirectThread(identity, contact);
      const chat: ActiveChat = {
        mode: "direct",
        id: threadId,
        title: shortName(contact.full_name),
        subtitle: "Direct message",
      };
      setActiveChat(chat);
      setMode("direct");
      const rows = await fetchDirectMessages(threadId);
      setMessages(rows);
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
      mode: "direct",
      id: thread.id,
      title: shortName(other.name),
      subtitle: "Direct message",
    };
    setActiveChat(chat);
    setMode("direct");
    const rows = await fetchDirectMessages(thread.id);
    setMessages(rows);
    markRead("direct", thread.id);
    setScreen("chat");
    setTimeout(scrollToBottom, 80);
  }

  function markRead(kind: "group" | "direct", id: string) {
    if (!identity || typeof window === "undefined") return;
    localStorage.setItem(getChatLastReadKey(kind, id, identity), new Date().toISOString());
  }

  function scrollToBottom() {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!identity || !activeChat || !draft.trim()) return;

    setSending(true);
    try {
      if (activeChat.mode === "ficha") {
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

  useEffect(() => {
    const update = () => setIsPhone(window.innerWidth < 760 || getJSMSLikelyPhone());
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  useEffect(() => {
    if (open) loadBase();
  }, [open, pathname]);

  useEffect(() => {
    if (!open || !activeChat) return;
    const tableFilter = activeChat.mode === "ficha" ? `group_id=eq.${activeChat.id}` : `thread_id=eq.${activeChat.id}`;
    const channel = supabase
      .channel(`ficha-${activeChat.mode}-${activeChat.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "jsms_chat_messages", filter: tableFilter },
        () => {
          setRefreshTick((x) => x + 1);
        }
      )
      .subscribe();

    const timer = setInterval(() => setRefreshTick((x) => x + 1), 12000);
    return () => {
      clearInterval(timer);
      supabase.removeChannel(channel);
    };
  }, [open, activeChat?.id, activeChat?.mode]);

  useEffect(() => {
    if (!open || !activeChat) return;
    refreshActiveMessages();
  }, [refreshTick]);

  useEffect(() => {
    if (!open || !activeChat) return;
    if (activeChat.mode === "ficha") markRead("group", activeChat.id);
    else markRead("direct", activeChat.id);
    setTimeout(scrollToBottom, 80);
  }, [open, activeChat?.id, lastMessageTime]);

  const forceMobileChat = isPhone || identity?.role === "teacher" || (pathname || "").toLowerCase().includes("/teacher");
  const shouldShowSidebar = !forceMobileChat || screen === "list";
  const shouldShowChat = !forceMobileChat || screen === "chat";

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
        <section style={forceMobileChat ? styles.phoneShell : styles.desktopShell}>
          <div style={forceMobileChat ? styles.mobileAppFrame : styles.appFrame}>
            {shouldShowSidebar && (
              <aside style={forceMobileChat ? styles.mobileSidebar : styles.sidebar}>
                <div style={styles.sidebarHeader}>
                  <div>
                    <h2 style={styles.appTitle}>Ficha</h2>
                    <p style={styles.appSub}>Chats</p>
                  </div>
                  <button type="button" onClick={() => setOpen(false)} style={styles.closeButton}>
                    ×
                  </button>
                </div>

                {loadState === "loading" && <div style={styles.centerText}>Loading Ficha...</div>}
                {loadState === "error" && (
                  <div style={styles.centerText}>
                    <p style={styles.errorText}>{error}</p>
                    <button type="button" style={styles.retryButton} onClick={loadBase}>Retry</button>
                  </div>
                )}

                {loadState === "ready" && (
                  <>
                    <div style={styles.searchWrap}>
                      <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search"
                        style={styles.search}
                      />
                    </div>

                    <div style={styles.tabs}>
                      <button style={mode === "ficha" ? styles.activeTab : styles.tab} onClick={openFicha}>Groups</button>
                      <button style={mode === "direct" ? styles.activeTab : styles.tab} onClick={() => setMode("direct")}>Teachers</button>
                    </div>

                    {mode === "ficha" && (
                      <div style={styles.listArea}>
                        <button type="button" style={styles.chatListItem} onClick={openFicha}>
                          <div style={styles.avatar}>F</div>
                          <div style={styles.listText}>
                            <b>Ficha</b>
                            <span>All staff messages</span>
                          </div>
                        </button>
                      </div>
                    )}

                    {mode === "direct" && (
                      <div style={styles.listArea}>
                        {threads.length > 0 && !search.trim() && (
                          <>
                            <p style={styles.sectionLabel}>Recent</p>
                            {threads.map((thread) => {
                              const other = identity ? getOtherPersonFromThread(thread, identity) : null;
                              return (
                                <button key={thread.id} type="button" style={styles.chatListItem} onClick={() => openExistingThread(thread)}>
                                  <div style={styles.avatar}>{initials(other?.name || "S")}</div>
                                  <div style={styles.listText}>
                                    <b>{shortName(other?.name || "Staff")}</b>
                                    <span>{thread.last_message || "Tap to chat"}</span>
                                  </div>
                                </button>
                              );
                            })}
                          </>
                        )}

                        <p style={styles.sectionLabel}>Teachers</p>
                        {filteredTeachers.map((teacher) => (
                          <button key={teacher.teacher_id} type="button" style={styles.chatListItem} onClick={() => openTeacherDirect(teacher)}>
                            <div style={styles.avatar}>{initials(teacher.full_name)}</div>
                            <div style={styles.listText}>
                              <b>{shortName(teacher.full_name)}</b>
                              <span>{teacher.username || "Tap to message"}</span>
                            </div>
                          </button>
                        ))}
                        {filteredTeachers.length === 0 && <div style={styles.empty}>No teachers found.</div>}
                      </div>
                    )}
                  </>
                )}
              </aside>
            )}

            {shouldShowChat && (
              <main style={styles.chatPane}>
                <div style={styles.chatHeader}>
                  {forceMobileChat && (
                    <button type="button" style={styles.backButton} onClick={() => setScreen("list")}>
                      ‹
                    </button>
                  )}
                  <div style={styles.avatar}>{initials(activeChat?.title || "F")}</div>
                  <div style={{ minWidth: 0 }}>
                    <h3 style={styles.chatTitle}>{activeChat?.title || "Ficha"}</h3>
                    <p style={styles.chatSub}>{activeChat?.subtitle || "Staff group"}</p>
                  </div>
                </div>

                {error && <div style={styles.inlineError}>{error}</div>}

                <div ref={listRef} style={styles.messageList}>
                  {messages.length === 0 && <div style={styles.empty}>No messages yet.</div>}
                  {messages.map((msg) => {
                    const mine = identity ? isOwnMessage(msg, identity) : false;
                    return (
                      <div key={msg.id} style={{ ...styles.messageWrap, justifyContent: mine ? "flex-end" : "flex-start" }}>
                        <div style={{ ...styles.bubble, ...(mine ? styles.myBubble : styles.otherBubble) }}>
                          {!mine && <div style={styles.sender}>{msg.sender_name}</div>}
                          <div style={styles.messageText}>{msg.message}</div>
                          <div style={styles.time}>{formatTime(msg.created_at)}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <form onSubmit={handleSend} style={styles.form}>
                  <input
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder="Message"
                    style={styles.input}
                  />
                  <button type="submit" disabled={sending || !draft.trim()} style={styles.sendButton}>
                    {sending ? "..." : "➤"}
                  </button>
                </form>
              </main>
            )}
          </div>
        </section>
      )}
    </>
  );
}

function getJSMSLikelyPhone() {
  if (typeof window === "undefined") return false;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

function isOwnMessage(message: JSMSChatMessage, identity: JSMSChatIdentity) {
  if (identity.teacherId && message.sender_teacher_id === identity.teacherId) return true;
  if (identity.userId && message.sender_user_id === identity.userId) return true;
  return message.sender_name === identity.name && message.sender_role === identity.role;
}

function formatTime(value: string) {
  try {
    return new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
  } catch {
    return "";
  }
}

function shortName(name: string) {
  const clean = (name || "Staff").trim();
  if (!clean) return "Staff";
  return clean.split(/\s+/)[0] || clean;
}

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((x) => x[0]?.toUpperCase())
    .join("") || "F";
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
  appFrame: {
    width: "min(1180px, 100%)",
    height: "min(760px, calc(100vh - 24px))",
    background: "#fff",
    borderRadius: 18,
    overflow: "hidden",
    display: "flex",
    boxShadow: "0 28px 90px rgba(0,0,0,.28)",
  },
  mobileAppFrame: {
    width: "100vw",
    height: "100dvh",
    background: "#fff",
    borderRadius: 0,
    overflow: "hidden",
    display: "flex",
    boxShadow: "none",
  },
  sidebar: {
    width: 360,
    minWidth: 320,
    borderRight: "1px solid #dbe5de",
    display: "flex",
    flexDirection: "column",
    background: "#f8fbf9",
  },
  mobileSidebar: {
    width: "100%",
    minWidth: "100%",
    height: "100dvh",
    display: "flex",
    flexDirection: "column",
    background: "#071014",
    color: "#e9edef",
  },
  sidebarHeader: {
    minHeight: 74,
    padding: "14px 18px",
    background: "#071014",
    color: "#e9edef",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  appTitle: { margin: 0, fontSize: 28, fontWeight: 950, letterSpacing: "-.03em" },
  appSub: { margin: "3px 0 0", fontSize: 12, color: "rgba(233,237,239,.65)" },
  closeButton: {
    width: 38,
    height: 38,
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,.3)",
    background: "rgba(255,255,255,.13)",
    color: "white",
    fontSize: 24,
    cursor: "pointer",
  },
  searchWrap: { padding: "8px 14px 12px", background: "inherit" },
  search: {
    width: "100%",
    border: "none",
    borderRadius: 999,
    padding: "12px 16px",
    outline: "none",
    fontSize: 14,
    background: "#202c33",
    color: "#e9edef",
  },
  tabs: { display: "flex", gap: 8, padding: "0 14px 10px", background: "inherit" },
  tab: {
    flex: 1,
    border: "1px solid #26343c",
    background: "#111b21",
    padding: "10px 12px",
    borderRadius: 999,
    fontWeight: 900,
    cursor: "pointer",
    color: "#e9edef",
  },
  activeTab: {
    flex: 1,
    border: "none",
    background: "#0f7a3b",
    color: "#fff",
    padding: "10px 12px",
    borderRadius: 999,
    fontWeight: 900,
    cursor: "pointer",
  },
  listArea: { flex: 1, overflowY: "auto", padding: "6px 0 84px", background: "inherit" },
  sectionLabel: {
    margin: "10px 16px 6px",
    color: "#8696a0",
    fontSize: 11,
    fontWeight: 900,
    textTransform: "uppercase",
    letterSpacing: ".04em",
  },
  chatListItem: {
    width: "100%",
    border: "none",
    background: "transparent",
    padding: "11px 14px",
    display: "flex",
    gap: 11,
    alignItems: "center",
    cursor: "pointer",
    textAlign: "left",
    borderBottom: "1px solid rgba(134,150,160,.16)",
  },
  avatar: {
    width: 42,
    minWidth: 42,
    height: 42,
    borderRadius: 999,
    background: "#dff4e7",
    color: "#0f7a3b",
    display: "grid",
    placeItems: "center",
    fontWeight: 950,
  },
  listText: { display: "grid", gap: 3, minWidth: 0, color: "inherit" },
  chatPane: { flex: 1, minWidth: 0, display: "flex", flexDirection: "column", background: "#0b141a" },
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
  messageList: {
    flex: 1,
    overflowY: "auto",
    padding: 14,
    background: "#0b141a",
  },
  messageWrap: { display: "flex", marginBottom: 10 },
  bubble: { maxWidth: "82%", borderRadius: 17, padding: "9px 11px", fontSize: 14, lineHeight: 1.45, wordBreak: "break-word" },
  myBubble: { background: "#005c4b", color: "#e9edef", borderBottomRightRadius: 5 },
  otherBubble: { background: "#202c33", color: "#e9edef", border: "1px solid rgba(134,150,160,.16)", borderBottomLeftRadius: 5 },
  sender: { fontSize: 11, fontWeight: 950, color: "#0f7a3b", marginBottom: 3 },
  messageText: { whiteSpace: "pre-wrap" },
  time: { fontSize: 10, color: "#6b7280", marginTop: 4, textAlign: "right" },
  form: { display: "flex", gap: 8, padding: 10, background: "#202c33", borderTop: "1px solid rgba(134,150,160,.16)" },
  input: { flex: 1, minWidth: 0, border: "none", borderRadius: 999, padding: "12px 14px", outline: "none", fontSize: 15, background: "#111b21", color: "#e9edef" },
  sendButton: { width: 46, height: 46, border: "none", borderRadius: 999, background: "#0f7a3b", color: "#fff", fontWeight: 950, cursor: "pointer", fontSize: 18 },
  centerText: { flex: 1, display: "grid", placeItems: "center", padding: 18, color: "#526157", textAlign: "center", fontSize: 14 },
  errorText: { color: "#991b1b", fontWeight: 800 },
  inlineError: { padding: "8px 12px", background: "#fff1f2", color: "#991b1b", fontSize: 12, fontWeight: 800 },
  retryButton: { border: "1px solid #bfd0c5", borderRadius: 12, background: "white", padding: "10px 14px", cursor: "pointer", fontWeight: 800 },
  empty: { textAlign: "center", color: "#6b7280", marginTop: 24, fontSize: 13, padding: 12 },
};
