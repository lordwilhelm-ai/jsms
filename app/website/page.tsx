import { redirect } from "next/navigation";

// The public homepage now lives at "/" — keep this path working for anyone
// with an old link or bookmark.
export default function WebsiteHomeRedirect() {
  redirect("/");
}
