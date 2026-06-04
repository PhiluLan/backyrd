type Env = {
  SUPABASE_URL: string;
  BACKYRD_SERVICE_ROLE_KEY: string;
  RESEND_API_KEY: string;
  CLAIM_FROM_EMAIL: string;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(payload: unknown, status = 200) {
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
    Deno.env.get("CLAIM_FROM_EMAIL") || "backyrd <claims@backyrd.ch>";

  if (!SUPABASE_URL) throw new Error("Missing SUPABASE_URL");
  if (!BACKYRD_SERVICE_ROLE_KEY) throw new Error("Missing BACKYRD_SERVICE_ROLE_KEY");
  if (!RESEND_API_KEY) throw new Error("Missing RESEND_API_KEY");

  return {
    SUPABASE_URL,
    BACKYRD_SERVICE_ROLE_KEY,
    RESEND_API_KEY,
    CLAIM_FROM_EMAIL,
  };
}

async function rest<T>(
  env: Env,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: env.BACKYRD_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.BACKYRD_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });

  const text = await response.text();

  if (!response.ok) {
    throw new Error(`supabase_rest_failed:${response.status}:${text}`);
  }

  return text ? (JSON.parse(text) as T) : ([] as T);
}

async function getUserFromJwt(env: Env, userJwt: string) {
  const response = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: env.BACKYRD_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${userJwt}`,
    },
  });

  const text = await response.text();

  if (!response.ok) {
    throw new Error(`auth_user_failed:${response.status}:${text}`);
  }

  return JSON.parse(text) as { id: string; email?: string };
}

async function assertAdmin(env: Env, userJwt: string) {
  const user = await getUserFromJwt(env, userJwt);

  const rows = await rest<Array<{ is_admin: boolean }>>(
    env,
    `profiles?id=eq.${encodeURIComponent(user.id)}&select=is_admin&limit=1`,
  );

  if (!rows[0]?.is_admin) {
    throw new Error("admin_required");
  }

  return user;
}

async function sendEmail(env: Env, params: {
  to: string;
  spotName: string;
  claimantName?: string | null;
}) {
  const greeting = params.claimantName?.trim()
    ? `Hallo ${params.claimantName.trim()}`
    : "Hallo";

  const html = `
    <div style="margin:0;padding:0;background:#f6f1ea;font-family:-apple-system,BlinkMacSystemFont,'Inter','Segoe UI',sans-serif;color:#201a17;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:32px 16px;background:#f6f1ea;">
        <tr>
          <td align="center">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#fffdf9;border:1px solid rgba(32,26,23,0.08);border-radius:28px;overflow:hidden;">
              <tr>
                <td style="padding:34px 30px;">
                  <div style="font-size:13px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#8a6f5b;">backyrd</div>
                  <h1 style="margin:16px 0 12px;font-size:30px;line-height:1.1;color:#201a17;">Dein Spot wurde verifiziert</h1>
                  <p style="font-size:16px;line-height:1.6;color:#4b4039;margin:0 0 18px;">
                    ${greeting}, dein Betreiberzugang für <strong>${params.spotName}</strong> wurde genehmigt.
                  </p>

                  <div style="background:#f3eadf;border:1px solid rgba(32,26,23,0.08);border-radius:20px;padding:18px;margin:22px 0;">
                    <div style="font-weight:800;margin-bottom:10px;">Was du jetzt tun kannst:</div>
                    <ol style="margin:0;padding-left:20px;color:#4b4039;line-height:1.7;">
                      <li>Beschreibung und Keywords pflegen</li>
                      <li>Öffnungszeiten und Kontaktangaben aktualisieren</li>
                      <li>Signature Items, Atmosphäre und passende Situationen ergänzen</li>
                      <li>Den Spot so schärfen, dass backyrd bessere Empfehlungen geben kann</li>
                    </ol>
                  </div>

                  <p style="font-size:15px;line-height:1.6;color:#4b4039;margin:0;">
                    Öffne den Spot in der backyrd App und gehe auf <strong>Spot verwalten</strong>.
                  </p>

                  <p style="font-size:13px;line-height:1.6;color:#8a7b72;margin:28px 0 0;">
                    Diese Mail bestätigt nur den Betreiberzugang. Öffentliche Inhalte können weiterhin von backyrd geprüft oder moderiert werden.
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </div>
  `;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: env.CLAIM_FROM_EMAIL,
      to: params.to,
      subject: `${params.spotName} wurde auf backyrd verifiziert`,
      html,
    }),
  });

  const text = await response.text();

  if (!response.ok) {
    throw new Error(`resend_failed:${response.status}:${text}`);
  }

  return text ? JSON.parse(text) : {};
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return jsonResponse({ ok: false, error: "method_not_allowed" }, 405);
  }

  try {
    const env = getEnv();
    const authHeader = request.headers.get("authorization") ?? "";
    const userJwt = authHeader.replace(/^Bearer\s+/i, "").trim();

    if (!userJwt) {
      return jsonResponse({ ok: false, error: "missing_authorization" }, 401);
    }

    await assertAdmin(env, userJwt);

    const body = await request.json().catch(() => ({}));
    const claimId = Number(body.claimId);

    if (!Number.isFinite(claimId)) {
      return jsonResponse({ ok: false, error: "claim_id_required" }, 400);
    }

    const claims = await rest<Array<{
      id: number;
      status: string;
      business_email: string | null;
      claimant_name: string | null;
      spot_id: string;
    }>>(
      env,
      `spot_claims?id=eq.${claimId}&select=id,status,business_email,claimant_name,spot_id&limit=1`,
    );

    const claim = claims[0];

    if (!claim) {
      return jsonResponse({ ok: false, error: "claim_not_found" }, 404);
    }

    if (claim.status !== "approved") {
      return jsonResponse({ ok: false, error: "claim_not_approved" }, 409);
    }

    if (!claim.business_email) {
      return jsonResponse({ ok: false, error: "business_email_missing" }, 409);
    }

    const spots = await rest<Array<{ name: string }>>(
      env,
      `spots?id=eq.${encodeURIComponent(claim.spot_id)}&select=name&limit=1`,
    );

    const spotName = spots[0]?.name ?? "dein Spot";

    await sendEmail(env, {
      to: claim.business_email,
      spotName,
      claimantName: claim.claimant_name,
    });

    return jsonResponse({
      ok: true,
      message: "spot_claim_approval_email_sent",
      claimId,
      businessEmail: claim.business_email,
    });
  } catch (err) {
    return jsonResponse(
      {
        ok: false,
        error: "approval_email_failed",
        message: err instanceof Error ? err.message : String(err),
      },
      500,
    );
  }
});