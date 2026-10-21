import { handleMailCallback } from "@/lib/booking-mail-http";
import { mailCallbackDependencies } from "@/lib/booking-mail-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) { return handleMailCallback(request, mailCallbackDependencies()); }
