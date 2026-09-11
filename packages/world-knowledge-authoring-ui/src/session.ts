export type RpcResult<T> = { data: T | null; error: { message: string } | null };

export interface WorldAuthoringClient {
  rpc<T = unknown>(name: string, parameters?: Record<string, unknown>): PromiseLike<RpcResult<T>>;
}

export interface WorldAuthoringAuth {
  refreshSession(): PromiseLike<{ data: { session: { access_token: string } | null }; error: { message: string } | null }>;
}

const isSessionRejection = (message: string | undefined) => /invalid_session|authentication_required|jwt|refresh_token/i.test(message ?? "");

/** Replays one unchanged RPC after Supabase Auth has refreshed the local session. */
export function sessionRecoveringAuthoringClient(client: WorldAuthoringClient, auth: WorldAuthoringAuth): WorldAuthoringClient {
  return {
    async rpc<T = unknown>(name: string, parameters?: Record<string, unknown>): Promise<RpcResult<T>> {
      const first = await client.rpc<T>(name, parameters);
      if (!first.error || !isSessionRejection(first.error.message)) return first;
      const refreshed = await auth.refreshSession();
      if (refreshed.error || !refreshed.data.session?.access_token) return { data: null, error: { message: "invalid_session" } };
      return client.rpc<T>(name, parameters);
    },
  };
}
