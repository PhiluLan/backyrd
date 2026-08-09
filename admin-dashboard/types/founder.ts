export type FounderPriority = "P0" | "P1" | "P2";
export type FounderGateStatus =
  | "open"
  | "in_progress"
  | "verify"
  | "verified"
  | "accepted_risk";
export type FounderSourceType = "manual" | "automatic" | "system";

export type FounderEvidence = {
  type: string;
  ref: string;
  note: string;
};
export type FounderCategoryReadiness = {
  key: string;
  label: string;
  weight: number;
  readiness: number;
};

export type FounderReadiness = {
  readiness_percent: number;
  launch_status: "GO" | "BLOCKED";
  p0_remaining: number;
  p1_remaining: number;
  p2_remaining: number;
  categories: FounderCategoryReadiness[];
  calculated_at: string;
};

export type FounderGate = {
  id: string;
  key: string;
  category_key: string;
  category: string;
  category_weight?: number;
  title: string;
  description: string;
  requirement: string;
  why_it_matters: string;
  priority: FounderPriority;
  status: FounderGateStatus;
  owner: string | null;
  evidence: FounderEvidence[];
  verification_note: string | null;
  related_url: string | null;
  due_date: string | null;
  verification_date: string | null;
  updated_at: string;
  source_type: FounderSourceType;
  contribution_weight: number;
  review_classification: "ready" | "needs_polish" | "blocker" | "not_needed_freeze";
};

export type FounderKpis = {
  as_of: string;
  wau: number;
  mau: number;
  decisions_week: number;
  basel_launch_ready_spots: number;
  open_trust_alerts: number;
  decision_success: {
    status: "data_not_ready";
    value: null;
    reason: string;
  };
};

export type FounderMilestone = {
  id: string;
  milestone_key: string;
  title: string;
  description: string | null;
  status: FounderGateStatus;
  source_type: FounderSourceType;
  target_date: string | null;
  achieved_at: string | null;
  sort_order: number;
};

export type FounderOverview = {
  readiness: FounderReadiness;
  kpis: FounderKpis;
  data_health: {
    approved_spots: number;
    approved_basel_spots: number;
    approved_basel_spots_missing_photo: number;
    decision_outcome_contract: "data_not_ready";
    calculated_at: string;
  };
  trust_health: {
    open_cases: number;
    needs_human_review: number;
    failed_cases: number;
    calculated_at: string;
    interpretation: string;
  };
  blockers: Array<Pick<FounderGate, "key" | "title" | "priority" | "status" | "owner" | "source_type" | "updated_at">>;
  recently_verified: Array<Pick<FounderGate, "key" | "title" | "verification_date" | "verification_note">>;
  history: Array<{
    readiness_percent: number;
    launch_status: "GO" | "BLOCKED";
    p0_remaining: number;
    created_at: string;
  }>;
  milestones: FounderMilestone[];
  last_updated: string;
};

export type EngineeringPullRequest = {
  number: number;
  title: string;
  branch: string;
  url: string;
  draft: boolean;
  mergeability: "mergeable" | "conflicting" | "unknown";
  ciStatus: "pass" | "fail" | "pending" | "unknown";
  updatedAt: string;
};

export type FounderEngineering = {
  repository: string;
  main: {
    sha: string;
    shortSha: string;
    message: string;
    url: string;
    committedAt: string;
  };
  latestMerge: {
    number: number;
    title: string;
    url: string;
    mergedAt: string;
  } | null;
  openPullRequests: EngineeringPullRequest[];
  inferredArea: string;
  refreshedAt: string;
  cacheSeconds: number;
};
