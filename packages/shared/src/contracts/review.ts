import type { MoodResolution } from "./mood";

export type CreateReviewWithPhotosRequest = {
  spot_id: string;
  text?: string | null;
  mood_a?: string | null;
  mood_b?: string | null;
  photo_urls?: string[];
  city?: string | null;
};

export type CreateReviewWithPhotosResponse =
  | {
      ok: true;
      review_id: string;
      message: string;
      mood_resolutions: MoodResolution[];
    }
  | {
      ok?: false;
      error: string;
      error_code?: "SAME_DAY_REVIEW_LIMIT";
      review_id?: string;
    };
