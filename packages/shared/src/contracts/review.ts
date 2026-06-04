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
    }
  | {
      ok?: false;
      error: string;
      review_id?: string;
    };