/** Minimal identities shared by person tags, contact lookup and block controls. */
export type MentionPerson = { user_id: string; display_name: string; username: string | null };
export type MomentMention = MentionPerson & { post_id: string };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseMentionPeople(value: unknown): MentionPerson[] {
  if (!Array.isArray(value)) throw new Error("invalid_social_people");
  return value.map((row: unknown) => {
    if (!row || typeof row !== "object") throw new Error("invalid_social_person");
    const r = row as Record<string, unknown>;
    if (typeof r.user_id !== "string" || !UUID.test(r.user_id)) throw new Error("invalid_social_person_id");
    return {
      user_id: r.user_id,
      display_name: typeof r.display_name === "string" && r.display_name.trim() ? r.display_name.trim() : "Backyrd Mitglied",
      username: typeof r.username === "string" ? r.username : null,
    };
  });
}

export function parseMomentMentions(value: unknown): MomentMention[] {
  if (!Array.isArray(value)) throw new Error("invalid_moment_mentions");
  return value.map((row: unknown) => {
    if (!row || typeof row !== "object") throw new Error("invalid_moment_mention");
    const r = row as Record<string, unknown>;
    if (typeof r.post_id !== "string" || !UUID.test(r.post_id)) throw new Error("invalid_mention_post_id");
    return { ...parseMentionPeople([row])[0], post_id: r.post_id };
  });
}

export type MomentEditorData = { postId: string; caption: string | null; moods: string[]; reviewId: string | null };
export function parseMomentEditor(value: unknown, postId: string): MomentEditorData {
  const row: unknown = Array.isArray(value) ? value[0] : value;
  if (!row || typeof row !== "object") throw new Error("moment_not_available");
  const r = row as Record<string, unknown>;
  if (r.post_id !== postId || (r.caption !== null && typeof r.caption !== "string") || !Array.isArray(r.mood_tags) || !r.mood_tags.every((m: unknown) => typeof m === "string")) throw new Error("invalid_moment_editor");
  if (r.review_id !== null && (typeof r.review_id !== "string" || !UUID.test(r.review_id))) throw new Error("invalid_moment_review");
  return { postId, caption: r.caption as string | null, moods: r.mood_tags as string[], reviewId: r.review_id as string | null };
}

/** A chat image must stay in this conversation's private bucket, including legacy Storage URLs. */
export function chatImageObjectPath(value: string, chatId: string, storageOrigin: string): string | null {
  let path = value.trim();
  if (/^https?:\/\//i.test(path)) {
    try {
      const url = new URL(path);
      if (url.origin !== new URL(storageOrigin).origin) return null;
      const match = /^\/storage\/v1\/object\/(?:sign|public)\/chat-uploads\/(.+)$/.exec(url.pathname);
      if (!match) return null;
      path = decodeURIComponent(match[1]);
    } catch { return null; }
  }
  if (!path.startsWith(`chat/${chatId}/`) || path.includes("\\") || path.split("/").some(part => part === ".." || part === "." || !part)) return null;
  return path;
}
