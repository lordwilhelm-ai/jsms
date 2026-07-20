import { supabase } from "@/lib/supabase";

// Drop-in replacement for fetch() against our own /api/** routes: attaches the
// current Supabase session as a Bearer token so requireStaffRole() on the
// server can identify who's calling. Body/headers/method work exactly as before.
export async function authedFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const headers = new Headers(init.headers);
  if (session?.access_token) {
    headers.set("Authorization", `Bearer ${session.access_token}`);
  }

  return fetch(input, { ...init, headers });
}
