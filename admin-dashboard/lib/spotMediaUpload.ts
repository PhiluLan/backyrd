import type { SupabaseClient } from "@supabase/supabase-js";

export type SavedSpotPhoto = { id: number; url: string };
export function validateSpotPhoto(file: File): void {
  if (!file.size || file.size > 15 * 1024 * 1024) throw new Error("Bitte wähle ein Bild mit maximal 15 MB.");
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new Error("Bitte verwende ein JPEG-, PNG- oder WebP-Bild. Ein HEIC-Bild bitte zuerst als JPEG exportieren.");
}
/** Uses the existing authorized media RPC; a successful blob upload is not a saved cover. */
export async function uploadSpotPhoto(client: SupabaseClient, file: File, spotId: string, asHeader: boolean): Promise<SavedSpotPhoto> {
  validateSpotPhoto(file);
  const { data: userData, error: userError } = await client.auth.getUser();
  if (userError || !userData.user) throw new Error("Bitte melde dich erneut an, bevor du Bilder hochlädst.");
  const extension = {"image/jpeg":"jpg","image/png":"png","image/webp":"webp"}[file.type];
  const path = `${asHeader ? "header" : "gallery"}-${spotId}-${crypto.randomUUID()}.${extension}`;
  const bucket = client.storage.from("spot-photos");
  const { error: uploadError } = await bucket.upload(path,file,{contentType:file.type,upsert:false});
  if (uploadError) throw new Error("Das Bild konnte nicht hochgeladen werden. Bitte prüfe deine Verbindung und Berechtigung.");
  const url = bucket.getPublicUrl(path).data.publicUrl;
  const { data: photo, error: photoError } = await client.from("spot_photos").insert({spot_id:spotId,url,uploaded_by:userData.user.id}).select("id,spot_id,url").single();
  if (photoError || !photo || photo.spot_id !== spotId || photo.url !== url || (!Number.isSafeInteger(photo.id) || photo.id <= 0)) throw new Error("Das Bild wurde hochgeladen, konnte aber nicht dem Spot zugeordnet werden. Es wird noch kein Erfolg bestätigt.");
  if (asHeader) {
    const { data: saved, error: headerError } = await client.rpc("backyrd_admin_save_spot_basics_v1",{p_spot_id:spotId,p_patch:{header_photo_path:url},p_request_id:crypto.randomUUID()});
    if (headerError || !saved?.spot || saved.spot.header_photo_path !== url) throw new Error("Das Foto ist in der Galerie gespeichert, konnte aber nicht als Titelbild bestätigt werden. Bitte versuche die Auswahl erneut.");
  }
  return {id:photo.id,url};
}
