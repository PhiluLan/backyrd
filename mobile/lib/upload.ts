import * as FileSystem from "expo-file-system/legacy";
import { decode } from "base64-arraybuffer";
import { supabase } from "./supabase";

export async function uploadSpotPhoto(localUri: string, spotId: string, ownerId: string) {
  const base64 = await FileSystem.readAsStringAsync(localUri, { encoding: 'base64' as any });
  const buffer = decode(base64);
  const path = `${spotId}/${ownerId}-${Date.now()}.jpg`;

  const { error } = await supabase.storage.from("spot-photos").upload(path, buffer, {
    contentType: "image/jpeg",
    upsert: true
  });
  if (error) throw error;
  return path;
}
