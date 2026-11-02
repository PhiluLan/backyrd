type SignupResult = {
  user: { identities?: readonly unknown[] } | null;
  session: unknown | null;
};

export type RegistrationOutcome = "signed_in" | "confirmation_requested" | "not_created" | "uncertain";

/** An empty identities array is Supabase Auth's obfuscated duplicate-signup response. */
export function registrationOutcome(result: SignupResult): RegistrationOutcome {
  if (result.session) return "signed_in";
  if (!result.user) return "uncertain";
  if (Array.isArray(result.user.identities)) {
    return result.user.identities.length === 0 ? "not_created" : "confirmation_requested";
  }
  return "uncertain";
}
