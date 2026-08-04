import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type Job = {
  job_id: string;
  case_id: string;
  content_item_id: string;
  attempt_count: number;
};

const headers = {
  "Content-Type": "application/json",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers,
  });

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return json(
      { error: "method_not_allowed" },
      405,
    );
  }

  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get(
    "SUPABASE_SERVICE_ROLE_KEY",
  );
  const secret = Deno.env.get(
    "SAFETY_TEXT_WORKER_SECRET",
  );

  if (!url || !key || !secret) {
    return json(
      { error: "worker_environment_missing" },
      500,
    );
  }

  const suppliedSecret =
    req.headers.get(
      "x-backyrd-worker-secret",
    ) ?? "";

  if (suppliedSecret !== secret) {
    return json(
      { error: "unauthorized" },
      401,
    );
  }

  const admin = createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const workerId = crypto.randomUUID();

  const { data, error } = await admin.rpc(
    "safety_claim_text_jobs_v1",
    {
      p_worker_id: workerId,
      p_limit: 10,
    },
  );

  if (error) {
    return json(
      {
        ok: false,
        error: "claim_failed",
        detail: error.message,
      },
      500,
    );
  }

  const jobs = (data ?? []) as Job[];
  const results: Array<Record<string, unknown>> =
    [];

  for (const job of jobs) {
    try {
      const response = await fetch(
        `${url}/functions/v1/safety-evaluate`,
        {
          method: "POST",
          headers: {
            ...headers,
            apikey: key,
            authorization: `Bearer ${key}`,
            "x-backyrd-worker-secret":
              secret,
          },
          body: JSON.stringify({
            caseId: job.case_id,
            case_id: job.case_id,
            source:
              "automatic_text_queue_v1",
          }),
        },
      );

      const responseText =
        await response.text();

      let payload: unknown = responseText;

      try {
        payload = responseText
          ? JSON.parse(responseText)
          : {};
      } catch {
        // Keep raw response for diagnostics.
      }

      if (!response.ok) {
        throw new Error(
          `safety-evaluate ${response.status}: ${
            responseText.slice(0, 2000)
          }`,
        );
      }

      const { error: completeError } =
        await admin.rpc(
          "safety_complete_text_job_v1",
          {
            p_job_id: job.job_id,
            p_result: payload,
          },
        );

      if (completeError) {
        throw new Error(
          `complete_failed: ${
            completeError.message
          }`,
        );
      }

      results.push({
        job_id: job.job_id,
        case_id: job.case_id,
        ok: true,
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : String(error);

      await admin.rpc(
        "safety_fail_text_job_v1",
        {
          p_job_id: job.job_id,
          p_error: message,
        },
      );

      results.push({
        job_id: job.job_id,
        case_id: job.case_id,
        ok: false,
        error: message,
      });
    }
  }

  return json({
    ok: true,
    worker_id: workerId,
    claimed: jobs.length,
    results,
  });
});
