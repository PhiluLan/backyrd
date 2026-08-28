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

  let existing: Record<string, unknown> | null = null;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle();

    if (error) throw error;
    if (data) {
      existing = data;
      break;
    }

    if (attempt < 3) {
      await new Promise((resolve) => setTimeout(resolve, 150 * (attempt + 1)));
    }
  }

  // Profile creation is owned by the Auth trigger. Profile onboarding is owned
  // by complete_profile_onboarding_v2. Mobile must never repair either state
  // with a privileged-looking direct insert/update fallback.
  if (!existing) throw new Error("profile_not_ready");

  void input;
  return existing;
}
