import { supabase } from "./supabase";

export function publicUrlFor(path: string) {
  const { data } = supabase.storage.from("spot-photos").getPublicUrl(path);
  return data.publicUrl;
}
