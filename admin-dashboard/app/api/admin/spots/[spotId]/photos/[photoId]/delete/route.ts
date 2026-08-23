import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { authorizeAdminRequest } from "@/lib/server/adminAuthorization";
import { photoDeleteErrorMessage, spotPhotoStoragePath } from "@/lib/server/spotPhotoDeletion";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ spotId: string; photoId: string }> };
type PreparedDelete = {
  deletionId: string;
  photoId: number | string;
  spotId: string;
  url: string;
  storagePath: string;
  state: "PENDING" | "COMPLETED" | "FAILED";
};

function serverClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error("spot_photo_delete_server_not_configured");
  return { url, client: createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } }) };
}

export async function POST(request: Request, context: RouteContext) {
  const authorization = await authorizeAdminRequest(request);
  if (!authorization.ok) {
    return NextResponse.json(
      { error: authorization.status === 403 ? "Dir fehlt die Berechtigung, dieses Foto zu löschen." : "Bitte melde dich erneut an." },
      { status: authorization.status },
    );
  }

  const { spotId, photoId } = await context.params;
  const parsedPhotoId = Number(photoId);
  if (!/^[0-9]+$/.test(photoId) || !Number.isSafeInteger(parsedPhotoId) || parsedPhotoId <= 0) {
    return NextResponse.json({ error: "Das Foto konnte nicht eindeutig erkannt werden." }, { status: 400 });
  }

  let requestId = "";
  try {
    const body = await request.json() as { requestId?: unknown };
    requestId = typeof body.requestId === "string" ? body.requestId : "";
  } catch {
    return NextResponse.json({ error: "Die Löschanfrage ist unvollständig." }, { status: 400 });
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)) {
    return NextResponse.json({ error: "Die Löschanfrage ist ungültig." }, { status: 400 });
  }

  try {
    const { url, client } = serverClient();
    const { data: photo, error: photoError } = await client
      .from("spot_photos")
      .select("id,spot_id,url")
      .eq("id", parsedPhotoId)
      .eq("spot_id", spotId)
      .maybeSingle();
    if (photoError) throw photoError;
    if (!photo) {
      const { data: completed } = await client
        .from("backyrd_admin_spot_photo_deletions_v1")
        .select("photo_id,spot_id,storage_disposition,header_was_reference")
        .eq("photo_id", parsedPhotoId)
        .eq("spot_id", spotId)
        .eq("state", "COMPLETED")
        .order("completed_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (completed) {
        return NextResponse.json({
          deletedPhotoId: completed.photo_id,
          spotId: completed.spot_id,
          dbDeleted: true,
          storageDisposition: completed.storage_disposition,
          headerCleared: completed.header_was_reference,
          replayed: true,
        });
      }
      return NextResponse.json({ error: "Dieses Foto ist bereits gelöscht oder gehört nicht zu diesem Spot." }, { status: 404 });
    }
    const storagePath = spotPhotoStoragePath(photo.url, url);
    if (!storagePath) throw new Error("photo_storage_url_invalid");

    const { data: preparedData, error: prepareError } = await client.rpc(
      "backyrd_admin_prepare_spot_photo_delete_v1",
      {
        p_photo_id: parsedPhotoId,
        p_spot_id: spotId,
        p_actor_id: authorization.userId,
        p_request_id: requestId,
        p_storage_path: storagePath,
      },
    );
    if (prepareError) throw prepareError;
    const prepared = preparedData as PreparedDelete;
    if (!prepared?.deletionId || prepared.spotId !== spotId || String(prepared.photoId) !== String(parsedPhotoId)) {
      throw new Error("photo_delete_prepare_identity_invalid");
    }
    if (prepared.state === "COMPLETED") {
      return NextResponse.json({
        deletedPhotoId: parsedPhotoId,
        spotId,
        dbDeleted: true,
        storageDisposition: "DELETED",
        headerCleared: false,
        replayed: true,
      });
    }
    if (prepared.state !== "PENDING") throw new Error("photo_delete_job_not_pending");

    const storageResult = await client.storage.from("spot-photos").remove([storagePath]);
    if (storageResult.error) {
      await client.rpc("backyrd_admin_fail_spot_photo_delete_v1", {
        p_deletion_id: prepared.deletionId,
        p_actor_id: authorization.userId,
        p_failure_code: `storage_${storageResult.error.name || "delete_failed"}`,
      });
      throw new Error("photo_storage_delete_failed");
    }

    const { data: finalized, error: finalizeError } = await client.rpc(
      "backyrd_admin_finalize_spot_photo_delete_v1",
      {
        p_deletion_id: prepared.deletionId,
        p_actor_id: authorization.userId,
        p_storage_disposition: "DELETED",
      },
    );
    if (finalizeError) throw finalizeError;
    if (!finalized || finalized.spotId !== spotId || String(finalized.deletedPhotoId) !== String(parsedPhotoId) || finalized.dbDeleted !== true) {
      throw new Error("photo_delete_finalize_identity_invalid");
    }
    return NextResponse.json(finalized, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const code = error instanceof Error
      ? error.message
      : error && typeof error === "object" && "message" in error
        ? String(error.message)
        : "photo_delete_failed";
    console.error("Spot photo deletion failed", { code, spotId, photoId: parsedPhotoId });
    return NextResponse.json({ error: photoDeleteErrorMessage(code) }, { status: 409 });
  }
}
