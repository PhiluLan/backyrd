type SupabaseServiceClient = {
  rpc: (name: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message?: string } | null }>;
};

export type LaunchCostBoundary = {
  operation: string;
  subjectKey: string;
  subjectMinute: number;
  subjectDay: number;
  globalMinute: number;
  globalDay: number;
};

export async function consumeLaunchCostBoundary(
  service: SupabaseServiceClient,
  boundary: LaunchCostBoundary,
): Promise<{ allowed: true } | { allowed: false; reason: "LIMITED" | "UNAVAILABLE" }> {
  const { data, error } = await service.rpc("backyrd_consume_launch_cost_boundary_v1", {
    p_operation: boundary.operation,
    p_subject_key: boundary.subjectKey,
    p_subject_minute_limit: boundary.subjectMinute,
    p_subject_day_limit: boundary.subjectDay,
    p_global_minute_limit: boundary.globalMinute,
    p_global_day_limit: boundary.globalDay,
  });
  if (error || !data || typeof data !== "object") return { allowed: false, reason: "UNAVAILABLE" };
  return (data as { allowed?: unknown }).allowed === true
    ? { allowed: true }
    : { allowed: false, reason: "LIMITED" };
}
