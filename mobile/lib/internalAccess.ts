import type { User } from "@supabase/supabase-js";

const INTERNAL_EMAILS = new Set(["philipplanger@yahoo.com"]);

export function isInternalMobileUser(user: User | null | undefined) {
  const email = user?.email?.trim().toLowerCase();
  return Boolean(email && (email.endsWith("@backyrd.ch") || INTERNAL_EMAILS.has(email)));
}
