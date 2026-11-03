type MediaBucket = "social-post-media" | "review-photos";
type Reference = { bucket: MediaBucket; path: string };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function momentSafetyMediaReference(value: string, input: {actorId: string; reviewId: string | null; storageOrigin: string}): Reference {
  if (!UUID.test(input.actorId)) throw new Error("invalid_media_actor");
  let path = value.trim();
  let bucket: MediaBucket | null = null;
  if (/^https?:\/\//i.test(path)) {
    const url = new URL(path);
    if (url.origin !== new URL(input.storageOrigin).origin) throw new Error("untrusted_media_origin");
    const match = /^\/storage\/v1\/object\/(?:sign|public)\/(social-post-media|review-photos)\/(.+)$/.exec(url.pathname);
    if (!match) throw new Error("invalid_media_bucket");
    bucket = match[1] as MediaBucket;
    path = decodeURIComponent(match[2]);
  }
  if (path.includes("\\") || path.split("/").some(p => !p || p === "." || p === "..")) throw new Error("invalid_media_path");
  if (path.startsWith(`${input.actorId}/`) && (!bucket || bucket === "social-post-media")) return {bucket:"social-post-media",path};
  if (input.reviewId && UUID.test(input.reviewId) && path.startsWith(`${input.reviewId}/`) && (!bucket || bucket === "review-photos")) return {bucket:"review-photos",path};
  throw new Error("media_outside_source");
}
export async function resolveMomentSafetyImages(values: readonly string[], input: {actorId: string; reviewId: string | null; storageOrigin: string}, sign: (bucket: MediaBucket, path: string, expires: number) => Promise<string>): Promise<string[]> {
  const refs = values.slice(0,4).map(value => momentSafetyMediaReference(value,input));
  return Promise.all(refs.map(async ref => {
    const url = await sign(ref.bucket,ref.path,300);
    const parsed = new URL(url);
    if (parsed.origin !== new URL(input.storageOrigin).origin) throw new Error("invalid_signed_media_origin");
    return url;
  }));
}

/** Model retries never reopen a human decision or an appeal. */
export function canAutomaticallyEvaluateCase(status: string): boolean {
  return ["queued","evaluating","needs_review","failed"].includes(status);
}
