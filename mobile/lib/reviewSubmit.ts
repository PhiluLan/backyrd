import { supabase } from "./supabase";

export async function getMoodId(token: string | null) {
  if (!token || token.trim() === "") return null;

  const clean = token.trim().toLowerCase();

  const { data } = await supabase
    .from("mood_tokens")
    .select("id")
    .eq("token", clean)
    .single();

  if (!data) {
    const { data: newMood, error: insertErr } = await supabase
      .from("mood_tokens")
      .insert({
        token: clean,
        locale: "de-CH",
        valid: true,
      })
      .select()
      .single();

    if (insertErr) throw insertErr;
    return newMood?.id ?? null;
  }

  return data.id;
}

export async function uploadReviewImage(uri: string, fileName: string) {
  const res = await fetch(uri);
  const blob = await res.blob();

  const { error } = await supabase.storage
    .from("spot-photos")
    .upload(fileName, blob, { contentType: "image/jpeg", upsert: true });

  if (error) throw error;

  const { data } = supabase.storage.from("spot-photos").getPublicUrl(fileName);
  return data.publicUrl;
}

export async function createReviewWithPhotos(params: {
  spotId: string;
  userId: string;
  moodA: string;
  moodB: string;
  text?: string | null;
  photos?: string[];
  decisionContext?: {
    decisionId?: string | null;
    decisionRank?: number | string | null;
    decisionQuery?: string | null;
    inputMode?: string | null;
    modelVersion?: string | null;
    source?: string | null;
  } | null;
}) {
  const { spotId, userId, moodA, moodB, text, photos = [], decisionContext = null } = params;

  const moodAId = await getMoodId(moodA);
  const moodBId = await getMoodId(moodB);

  const { data: reviewData, error: reviewErr } = await supabase
    .from("reviews")
    .insert({
      spot_id: spotId,
      user_id: userId,
      text: text ?? "",
      mood_a: moodA || null,
      mood_b: moodB || null,
      mood_a_id: moodAId,
      mood_b_id: moodBId,
    })
    .select()
    .single();

  if (reviewErr) throw reviewErr;

  const reviewId = reviewData.id;

  for (const uri of photos) {
    const fileName = `${spotId}/${reviewId}-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2)}.jpg`;

    const photoUrl = await uploadReviewImage(uri, fileName);

    const { error: photoErr } = await supabase.from("spot_photos").insert({
      spot_id: spotId,
      review_id: reviewId,
      url: photoUrl,
      uploaded_by: userId,
    });

    if (photoErr) throw photoErr;
  }

  if (decisionContext?.source === "decision" || decisionContext?.decisionId) {
    const { error: linkError } = await supabase.rpc("link_decision_review_v1", {
      p_review_id: reviewId,
      p_decision_id: decisionContext.decisionId || null,
      p_source_context: {
        source: "reviewSubmit.createReviewWithPhotos",
        source_type: "decision_review",
        decision_id: decisionContext.decisionId || null,
        decision_rank: decisionContext.decisionRank ? Number(decisionContext.decisionRank) : null,
        decision_query: decisionContext.decisionQuery || null,
        input_mode: decisionContext.inputMode || null,
        model_version: decisionContext.modelVersion || null,
        linked_from_client: true,
      },
    });

    if (linkError) {
      console.log("link_decision_review_v1 failed", linkError);
    }
  }

  return reviewData;
}