export type Achievement = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  icon_url: string | null;
  tier: number | null;
  type: string;
  threshold: number | null;
  created_at: string;
};

export type UserAchievement = {
  user_id: string;
  achievement_id: string;
  achieved_at: string;
  achievement?: Achievement; // für join
};
