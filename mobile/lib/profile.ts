import { supabase } from "./supabase";

export async function ensureProfile() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const { data, error } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    const { error: insErr } = await supabase
      .from("profiles")
      .insert({ id: user.id, display_name: user.email?.split("@")[0] || "User" });
    if (insErr) throw insErr;
  }
}
