type Session = { access_token: string; refresh_token?: string; expires_at?: number };
type AuthResult = { data: { session: Session | null }; error: { message: string } | null };

export interface WorldKnowledgeBrowserAuth {
  getSession(): Promise<AuthResult>;
  refreshSession(): Promise<AuthResult>;
}

export class WorldKnowledgeSessionError extends Error {
  readonly code: "REAUTH_REQUIRED" | "LOCAL_ENDPOINT_MISMATCH";
  constructor(code: "REAUTH_REQUIRED" | "LOCAL_ENDPOINT_MISMATCH") { super(code === "REAUTH_REQUIRED" ? "invalid_session" : "local_world_knowledge_endpoint_mismatch"); this.code = code; }
}

function normalizeLocalEndpoint(value: string): string {
  let url: URL;
  try { url = new URL(value); } catch { throw new WorldKnowledgeSessionError("LOCAL_ENDPOINT_MISMATCH"); }
  if (!["127.0.0.1", "localhost", "::1"].includes(url.hostname) || !["http:", "https:"].includes(url.protocol)) throw new WorldKnowledgeSessionError("LOCAL_ENDPOINT_MISMATCH");
  return `${url.protocol}//${url.hostname}:${url.port || (url.protocol === "https:" ? "443" : "80")}`;
}

export function assertWorldKnowledgeLocalEndpoints(clientEndpoint: string | undefined, serverEndpoint: string | undefined): string {
  if (!clientEndpoint || !serverEndpoint) throw new WorldKnowledgeSessionError("LOCAL_ENDPOINT_MISMATCH");
  const client = normalizeLocalEndpoint(clientEndpoint); const server = normalizeLocalEndpoint(serverEndpoint);
  if (client !== server) throw new WorldKnowledgeSessionError("LOCAL_ENDPOINT_MISMATCH");
  return client;
}

async function accessToken(auth: WorldKnowledgeBrowserAuth, forceRefresh: boolean): Promise<string> {
  const initial = forceRefresh ? null : await auth.getSession();
  const nearExpiry = initial?.data.session?.expires_at !== undefined && initial.data.session.expires_at <= Math.floor(Date.now() / 1000) + 60;
  const result = forceRefresh || initial?.error || !initial?.data.session || nearExpiry ? await auth.refreshSession() : initial;
  if (result.error || !result.data.session?.access_token) throw new WorldKnowledgeSessionError("REAUTH_REQUIRED");
  return result.data.session.access_token;
}

export async function authorizedWorldKnowledgePost(input: { auth: WorldKnowledgeBrowserAuth; body: unknown; fetcher?: typeof fetch }): Promise<unknown> {
  const fetcher = input.fetcher ?? fetch;
  const send = async (forceRefresh: boolean) => {
    const token = await accessToken(input.auth, forceRefresh);
    return fetcher("/api/world-knowledge/shadow", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify(input.body) });
  };
  let response = await send(false);
  let result = await response.json().catch(() => ({ error: "invalid_server_response" })) as { error?: string };
  if (response.status === 401 && ["invalid_session", "authentication_required"].includes(result.error ?? "")) {
    response = await send(true);
    result = await response.json().catch(() => ({ error: "invalid_server_response" })) as { error?: string };
  }
  if (!response.ok) throw new Error(result.error ?? "world_knowledge_action_failed");
  return result;
}
