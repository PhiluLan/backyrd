export type SpotCardDTO = {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  country: string | null;
  price_level: number | null;
  category_name: string | null;
  header_photo_path: string | null;
  photo_url: string | null;
};

export type SpotPhotoDTO = {
  id: number | string;
  url: string;
  created_at: string | null;
};

export type SpotReviewPhotoDTO = {
  id: string;
  url: string;
  created_at: string | null;
};

export type SpotReviewDTO = {
  id: string;
  text: string | null;
  mood_a: string | null;
  mood_b: string | null;
  created_at: string | null;
  user: {
    id: string | null;
    first_name: string | null;
    avatar_url: string | null;
  };
  photos: SpotReviewPhotoDTO[];
};

export type SpotTopMoodDTO = {
  concept_key: string;
  label: string;
  canonical_label: string;
  concept_contributors: number | null;
  eligible_contributors: number | null;
  percentage: number | null;
  evidence_state: "EARLY" | "ESTABLISHED";
  rank: number;
};

export type SpotDetailDTO = {
  spot: {
    id: string;
    name: string;
    address: string | null;
    city: string | null;
    country: string | null;
    lat: number | null;
    lng: number | null;
    description: string | null;
    website: string | null;
    phone: string | null;
    email: string | null;
    price_level: number | null;
    header_photo_path: string | null;
    status: string | null;
    category: {
      id: number | null;
      name: string | null;
      slug: string | null;
      icon: string | null;
      color: string | null;
    } | null;
  };
  photos: SpotPhotoDTO[];
  reviews: SpotReviewDTO[];
  top_moods: SpotTopMoodDTO[];
};
