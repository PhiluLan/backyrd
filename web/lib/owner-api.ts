import { supabase } from "@/lib/supabase/client";

export type OwnerSpotListItem = {
  spot_id: string;
  name: string;
  city: string | null;
  address: string | null;
  category_name: string | null;
  status: string | null;
  website: string | null;
};

type SupabaseErrorLike = {
  message?: string;
  details?: string;
  hint?: string;
  code?: string;
};

export function extractOwnerError(error: unknown): string {
  if (error instanceof Error) return error.message;
  const detail = error as SupabaseErrorLike | null;
  return [detail?.message, detail?.details, detail?.hint, detail?.code]
    .filter(Boolean).join(" • ") || "Unbekannter Fehler";
}

export async function requireOwnerSession() {
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error) throw new Error(extractOwnerError(error));
  return session;
}

export async function getOwnerSpots(limit = 80): Promise<OwnerSpotListItem[]> {
  const { data, error } = await supabase.rpc("get_owner_spots_v1", { p_limit: limit });
  if (error) throw new Error(extractOwnerError(error));
  return Array.isArray(data) ? data as OwnerSpotListItem[] : [];
}
