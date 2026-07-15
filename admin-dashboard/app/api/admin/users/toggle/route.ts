import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

type ToggleUserBody = {
  id?: unknown;
  active?: unknown;
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as ToggleUserBody;

    if (typeof body.id !== "string" || typeof body.active !== "boolean") {
      return NextResponse.json(
        { error: "Ungültige Anfrage: id und active fehlen." },
        { status: 400 }
      );
    }

    const { error } = await supabaseAdmin.auth.admin.updateUserById(body.id, {
      // "none" hebt eine bestehende Sperre auf.
      // 876000 Stunden entsprechen ungefähr 100 Jahren.
      ban_duration: body.active ? "none" : "876000h",
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      active: body.active,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unbekannter Serverfehler";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}