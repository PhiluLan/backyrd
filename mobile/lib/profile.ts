import { supabase } from "./supabase";

type EnsureProfileInput = {
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
};

export async function ensureProfile(input?: EnsureProfileInput) {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const fallbackEmail = input?.email ?? user.email ?? null;
  const fallbackFirstName =
    input?.firstName?.trim() ||
    user.user_metadata?.first_name ||
    user.user_metadata?.full_name?.split(" ")?.[0] ||
    fallbackEmail?.split("@")?.[0] ||
    "User";

  const fallbackLastName =
    input?.lastName?.trim() ||
    user.user_metadata?.last_name ||
    user.user_metadata?.full_name?.split(" ")?.slice(1).join(" ") ||
    null;

  const { data: existing, error: fetchErr } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (fetchErr) throw fetchErr;

  if (!existing) {
    const insertPayload = {
      id: user.id,
      first_name: fallbackFirstName,
      last_name: fallbackLastName,
      display_name: fallbackFirstName,
      contact_email: fallbackEmail,
    };

    const { data: inserted, error: insErr } = await supabase
      .from("profiles")
      .insert(insertPayload)
      .select("*")
      .single();

    if (insErr) throw insErr;
    return inserted;
  }

  const updatePayload: Record<string, any> = {};

  if (!existing.first_name && fallbackFirstName) {
    updatePayload.first_name = fallbackFirstName;
  }
  if (!existing.last_name && fallbackLastName) {
    updatePayload.last_name = fallbackLastName;
  }
  if (!existing.display_name && fallbackFirstName) {
    updatePayload.display_name = fallbackFirstName;
  }
  if (!existing.contact_email && fallbackEmail) {
    updatePayload.contact_email = fallbackEmail;
  }

  if (Object.keys(updatePayload).length === 0) {
    return existing;
  }

  const { data: updated, error: updErr } = await supabase
    .from("profiles")
    .update(updatePayload)
    .eq("id", user.id)
    .select("*")
    .single();

  if (updErr) throw updErr;
  return updated;
}