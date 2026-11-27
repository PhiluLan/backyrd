import {
  parseLearningCase,
  learningTopics,
  learningSplits,
  type LearningCase,
  type LearningTopic,
  type LearningSplit,
} from "../../../packages/shared/src/nuknuk-learning.ts";

export type WorkshopPorts = {
  origins: readonly string[];
  authenticate(token: string, signal: AbortSignal): Promise<string | null>;
  load(token: string, id: string, signal: AbortSignal): Promise<unknown>;
  reserve(actor: string, requestId: string, signal: AbortSignal): Promise<void>;
  translate(
    row: LearningCase,
    signal: AbortSignal,
  ): Promise<{ target: Record<string, unknown>; policy: string }>;
  variants(row: LearningCase, signal: AbortSignal): Promise<string[]>;
  situations(topic: LearningTopic, signal: AbortSignal): Promise<unknown[]>;
  commitSituations(
    actor: string,
    topic: LearningTopic,
    split: LearningSplit,
    rows: unknown[],
    signal: AbortSignal,
  ): Promise<unknown>;
  commit(
    actor: string,
    action: string,
    row: LearningCase,
    payload: Record<string, unknown>,
    signal: AbortSignal,
  ): Promise<unknown>;
};
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function createWorkshopHandler(ports: WorkshopPorts) {
  return async (request: Request): Promise<Response> => {
    const origin = request.headers.get("origin");
    const headers: Record<string, string> = {
      "content-type": "application/json",
      "cache-control": "no-store",
      vary: "Origin",
    };
    if (origin && !ports.origins.includes(origin))
      return Response.json(
        { error: "origin_denied" },
        { status: 403, headers },
      );
    if (origin) headers["access-control-allow-origin"] = origin;
    headers["access-control-allow-headers"] =
      "authorization, apikey, content-type, x-client-info, x-region";
    headers["access-control-allow-methods"] = "POST, OPTIONS";
    if (request.method === "OPTIONS")
      return new Response(null, { status: 204, headers });
    const reply = (data: unknown, status = 200) =>
      new Response(JSON.stringify(data), { status, headers });
    if (request.method !== "POST")
      return reply({ error: "method_not_allowed" }, 405);
    const token = /^Bearer ([^\s]{20,8192})$/.exec(
      request.headers.get("authorization") ?? "",
    )?.[1];
    if (!token) return reply({ error: "unauthorized" }, 401);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 45000);
    const onAbort = () => controller.abort();
    request.signal.addEventListener("abort", onAbort, { once: true });
    if (request.signal.aborted) controller.abort();
    try {
      if (controller.signal.aborted) throw Error("learning_aborted");
      const actor = await ports.authenticate(token, controller.signal);
      if (!actor) return reply({ error: "admin_required" }, 403);
      const reader = request.body?.getReader();
      let size = 0;
      const chunks: Uint8Array[] = [];
      if (!reader) return reply({ error: "request_invalid" }, 400);
      controller.signal.addEventListener(
        "abort",
        () => {
          void reader.cancel();
        },
        { once: true },
      );
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 4096) {
          await reader.cancel();
          return reply({ error: "request_too_large" }, 413);
        }
        chunks.push(value);
      }
      const buffer = new Uint8Array(size);
      let offset = 0;
      for (const c of chunks) {
        buffer.set(c, offset);
        offset += c.length;
      }
      const body: unknown = JSON.parse(new TextDecoder().decode(buffer));
      if (!body || typeof body !== "object" || Array.isArray(body))
        return reply({ error: "request_invalid" }, 400);
      const b = body as Record<string, unknown>;
      if (b.action === "situations") {
        if (
          !Object.hasOwn(learningTopics, String(b.topic)) ||
          !Object.hasOwn(learningSplits, String(b.split)) ||
          Object.keys(b).some((k) => !["action", "topic", "split"].includes(k))
        )
          return reply({ error: "request_invalid" }, 400);
        await ports.reserve(actor, crypto.randomUUID(), controller.signal);
        const rows = await ports.situations(
          b.topic as LearningTopic,
          controller.signal,
        );
        const result = await ports.commitSituations(
          actor,
          b.topic as LearningTopic,
          b.split as LearningSplit,
          rows,
          controller.signal,
        );
        return reply({ result, humanApproved: false, trainingStarted: false });
      }
      if (
        !["translate", "variants"].includes(String(b.action)) ||
        typeof b.id !== "string" ||
        !uuid.test(b.id) ||
        !Number.isSafeInteger(b.revision) ||
        Object.keys(b).some((k) => !["action", "id", "revision"].includes(k))
      )
        return reply({ error: "request_invalid" }, 400);
      const row = parseLearningCase(
        await ports.load(token, b.id, controller.signal),
      );
      if (
        row.revision !== b.revision ||
        (b.action === "translate" && row.state === "approved")
      )
        return reply({ error: "revision_conflict" }, 409);
      await ports.reserve(actor, crypto.randomUUID(), controller.signal);
      const payload =
        b.action === "translate"
          ? await ports.translate(row, controller.signal)
          : { queries: await ports.variants(row, controller.signal) };
      const result = await ports.commit(
        actor,
        String(b.action),
        row,
        payload,
        controller.signal,
      );
      return reply({ result, humanApproved: false, trainingStarted: false });
    } catch (error) {
      const code =
        error && typeof error === "object" && "code" in error
          ? error.code
          : null;
      if (code === "40001") return reply({ error: "revision_conflict" }, 409);
      if (code === "54000") return reply({ error: "quota_exhausted" }, 429);
      if (code === "42501") return reply({ error: "admin_required" }, 403);
      return reply(
        {
          error: controller.signal.aborted
            ? "proposal_timeout"
            : "proposal_unavailable",
        },
        503,
      );
    } finally {
      clearTimeout(timer);
      request.signal.removeEventListener("abort", onAbort);
    }
  };
}
