// supabase/functions/send-spot-claim-code/index.ts

type Env = {
  SUPABASE_URL: string;
  BACKYRD_SERVICE_ROLE_KEY: string;
  RESEND_API_KEY: string;
  CLAIM_FROM_EMAIL: string;
};

type RequestBody = {
  spotId?: string;
  businessEmail?: string;
  claimantName?: string | null;
  claimantRole?: string | null;
  note?: string | null;
};

type SupabaseUserResponse = {
  id?: string;
  email?: string;
};

type VerificationStartRow = {
  ok: boolean;
  verification_id: string;
  spot_id: string;
  business_email: string;
  business_domain: string;
  code: string;
  expires_at: string;
  domain_match_score: string | number;
  domain_match_reason: string;
  message: string;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function getEnv(): Env {
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const BACKYRD_SERVICE_ROLE_KEY = Deno.env.get("BACKYRD_SERVICE_ROLE_KEY");
  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
  const CLAIM_FROM_EMAIL =
    Deno.env.get("CLAIM_FROM_EMAIL") ?? "backyrd <claims@bildersprache.ch>";

  if (!SUPABASE_URL) throw new Error("Missing SUPABASE_URL");
  if (!BACKYRD_SERVICE_ROLE_KEY) {
    throw new Error("Missing BACKYRD_SERVICE_ROLE_KEY");
  }
  if (!RESEND_API_KEY) throw new Error("Missing RESEND_API_KEY");

  return {
    SUPABASE_URL,
    BACKYRD_SERVICE_ROLE_KEY,
    RESEND_API_KEY,
    CLAIM_FROM_EMAIL,
  };
}

function getBearerToken(request: Request): string {
  const authHeader = request.headers.get("Authorization") ?? "";
  const match = authHeader.match(/^Bearer\s+(.+)$/i);

  if (!match?.[1]) {
    throw new Error("missing_authorization_bearer");
  }

  return match[1].trim();
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function assertUuid(value: string | undefined, fieldName: string): string {
  if (!value || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new Error(`${fieldName}_invalid`);
  }

  return value;
}

function assertBusinessEmail(value: string | undefined): string {
  if (!value) throw new Error("business_email_required");

  const email = normalizeEmail(value);

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("business_email_invalid");
  }

  return email;
}

async function getUserFromJwt(
  env: Env,
  userJwt: string,
): Promise<SupabaseUserResponse> {
  const response = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    method: "GET",
    headers: {
      apikey: env.BACKYRD_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${userJwt}`,
    },
  });

  const text = await response.text();

  if (!response.ok) {
    throw new Error(`auth_user_failed:${response.status}:${text}`);
  }

  const user = JSON.parse(text) as SupabaseUserResponse;

  if (!user.id) {
    throw new Error("auth_user_missing_id");
  }

  return user;
}

async function supabaseRpc<T>(
  env: Env,
  functionName: string,
  body: Record<string, unknown>,
): Promise<T> {
  const response = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/${functionName}`, {
    method: "POST",
    headers: {
      apikey: env.BACKYRD_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.BACKYRD_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const text = await response.text();

  if (!response.ok) {
    throw new Error(`rpc_${functionName}_failed:${response.status}:${text}`);
  }

  if (!text) return null as T;

  return JSON.parse(text) as T;
}

function buildEmailHtml(params: {
  code: string;
  expiresAt: string;
  businessEmail: string;
}): string {
  const expiresAt = new Date(params.expiresAt);

  return `
<div style="margin:0;padding:0;background:#F7F4EF;font-family:-apple-system,BlinkMacSystemFont,'Inter','Segoe UI',sans-serif;color:#231F20;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:32px 16px;background:#F7F4EF;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#FFFDF8;border:1px solid rgba(35,31,32,0.08);border-radius:28px;overflow:hidden;">
          <tr>
            <td style="padding:34px 30px 12px 30px;">
              <div style="font-size:13px;letter-spacing:0.08em;text-transform:uppercase;color:#8A8178;font-weight:700;">
                backyrd
              </div>
              <h1 style="margin:14px 0 10px 0;font-size:28px;line-height:1.15;font-weight:800;color:#231F20;">
                Bestätigungscode für deinen Spot
              </h1>
              <p style="margin:0;font-size:16px;line-height:1.55;color:#5F5750;">
                Verwende diesen Code, um deine Business-E-Mail zu bestätigen und deine Anfrage zur Prüfung einzureichen.
              </p>
            </td>
          </tr>

          <tr>
            <td style="padding:18px 30px;">
              <div style="background:#F1E9DD;border:1px solid rgba(35,31,32,0.08);border-radius:22px;padding:24px;text-align:center;">
                <div style="font-size:13px;letter-spacing:0.08em;text-transform:uppercase;color:#8A8178;font-weight:700;margin-bottom:10px;">
                  Dein Code
                </div>
                <div style="font-size:38px;letter-spacing:0.18em;font-weight:850;color:#231F20;">
                  ${params.code}
                </div>
              </div>
            </td>
          </tr>

          <tr>
            <td style="padding:4px 30px 34px 30px;">
              <p style="margin:0;font-size:14px;line-height:1.55;color:#6D655E;">
                Dieser Code ist nur kurz gültig. Falls du diese Anfrage nicht gestartet hast, kannst du diese E-Mail ignorieren.
              </p>
              <p style="margin:14px 0 0 0;font-size:13px;line-height:1.5;color:#9A9189;">
                Business-E-Mail: ${params.businessEmail}<br/>
                Gültig bis: ${expiresAt.toLocaleString("de-CH")}
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</div>
`;
}

async function sendEmail(params: {
  env: Env;
  to: string;
  code: string;
  expiresAt: string;
}): Promise<void> {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: params.env.CLAIM_FROM_EMAIL,
      to: [params.to],
      subject: `Dein backyrd Code: ${params.code}`,
      html: buildEmailHtml({
        code: params.code,
        expiresAt: params.expiresAt,
        businessEmail: params.to,
      }),
    }),
  });

  const text = await response.text();

  if (!response.ok) {
    throw new Error(`resend_failed:${response.status}:${text}`);
  }
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return jsonResponse({ ok: false, error: "method_not_allowed" }, 405);
  }

  try {
    const env = getEnv();
    const userJwt = getBearerToken(request);
    const user = await getUserFromJwt(env, userJwt);

    let body: RequestBody = {};
    try {
      body = await request.json();
    } catch {
      body = {};
    }

    const spotId = assertUuid(body.spotId, "spot_id");
    const businessEmail = assertBusinessEmail(body.businessEmail);

    const rows = await supabaseRpc<VerificationStartRow[]>(
      env,
      "private_start_spot_claim_email_verification_v1",
      {
        p_user_id: user.id,
        p_spot_id: spotId,
        p_business_email: businessEmail,
        p_claimant_name: body.claimantName ?? null,
        p_claimant_role: body.claimantRole ?? null,
        p_note: body.note ?? null,
      },
    );

    const verification = rows?.[0];

    if (!verification?.ok) {
      throw new Error("verification_start_failed");
    }

    await sendEmail({
      env,
      to: verification.business_email,
      code: verification.code,
      expiresAt: verification.expires_at,
    });

    return jsonResponse({
      ok: true,
      message: "claim_code_sent",
      spotId: verification.spot_id,
      businessEmail: verification.business_email,
      businessDomain: verification.business_domain,
      expiresAt: verification.expires_at,
      domainMatchScore: verification.domain_match_score,
      domainMatchReason: verification.domain_match_reason,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "unknown_error";

    console.error(message);

    if (message.includes("public_email_domain_not_allowed")) {
      return jsonResponse({
        ok: false,
        error: "public_email_domain_not_allowed",
        message:
          "Bitte verwende eine offizielle Business-E-Mail dieses Unternehmens.",
      }, 400);
    }

    if (message.includes("business_domain_does_not_match_spot_name")) {
      return jsonResponse({
        ok: false,
        error: "business_domain_does_not_match_spot_name",
        message:
          "Die Domain deiner E-Mail passt nicht erkennbar zu diesem Spot.",
      }, 400);
    }

    if (
      message.includes("missing_authorization_bearer") ||
      message.includes("auth_user_failed") ||
      message.includes("auth_user_missing_id")
    ) {
      return jsonResponse({
        ok: false,
        error: "not_authenticated",
        message: "Bitte melde dich erneut an.",
      }, 401);
    }

    return jsonResponse({
      ok: false,
      error: "claim_code_send_failed",
      message,
    }, 500);
  }
});