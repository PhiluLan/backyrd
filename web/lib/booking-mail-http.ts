import "server-only";
import { timingSafeEqual } from "node:crypto";
import { boundedText } from "./booking-guest-security";
import { dispatchOneMail, type MailWorkerDependencies } from "./booking-mail";
import { ingestMailWebhook, MailWebhookError } from "./booking-mail-webhook";
import { record } from "./booking-guest-contract";

const headers = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow" };
const reply = (status: number, error: string) => Response.json({ error }, { status, headers });
type JobDependencies = MailWorkerDependencies & { secret: string; senderReady: () => Promise<boolean> };
export async function handleMailJob(request: Request, d: JobDependencies | null): Promise<Response> {
  if (request.method !== "GET" && request.method !== "POST") return reply(405, "method_not_allowed");
  if (!d) return reply(503, "mail_unavailable");
  const actual = Buffer.from(request.headers.get("authorization") ?? ""), expected = Buffer.from(`Bearer ${d.secret}`);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return reply(401, "unauthorized");
  if (new URL(request.url).search || request.body !== null) return reply(400, "bad_request");
  try {
    const budget = record(await d.rpc("backyrd_consume_launch_cost_boundary_v1", { p_operation: "booking_mail_dispatch", p_subject_key: "trusted-worker", p_subject_minute_limit: 1, p_subject_day_limit: 1440, p_global_minute_limit: 2, p_global_day_limit: 1500 }));
    if (typeof budget.allowed !== "boolean") return reply(503, "dispatch_incomplete");
    if (!budget.allowed) return reply(429, "rate_limited");
    if (!await d.senderReady()) return reply(503, "sender_unavailable");
    const deadline = Date.now() + 40000;
    const counts = { accepted: 0, deferred: 0, review: 0, rejected: 0, superseded: 0 };
    for (let index = 0; index < 8 && deadline - Date.now() >= 35000; index++) {
      const result = await dispatchOneMail({ ...d, deadline });
      if (result === "idle") break;
      counts[result]++;
    }
    return Response.json({ processed: counts }, { headers });
  } catch { return reply(503, "dispatch_incomplete"); }
}

type CallbackDependencies = Parameters<typeof ingestMailWebhook>[2];
export async function handleMailCallback(request: Request, d: CallbackDependencies | null): Promise<Response> {
  if (request.method !== "POST") return reply(405, "method_not_allowed");
  if (!d) return reply(503, "mail_unavailable");
  if (new URL(request.url).search || request.headers.has("content-encoding") || !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get("content-type") ?? "")) return reply(400, "bad_request");
  let raw: string;
  try { raw = await boundedText(request, 65536, 5000); } catch { return reply(400, "bad_request"); }
  try {
    const result = await ingestMailWebhook(raw, request.headers, d);
    if (result === "unmatched") return reply(503, "event_unmatched"); // Ask the provider to retry; never silently drop a genuine event.
    return Response.json({ received: true }, { headers });
  } catch (error) {
    if (error instanceof MailWebhookError) return reply(error.code === "secret" ? 503 : 400, "invalid_event");
    return reply(503, "event_unavailable");
  }
}
