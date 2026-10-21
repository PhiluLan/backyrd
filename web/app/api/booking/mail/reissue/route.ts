import { handleMailReissue } from "@/lib/booking-mail-reissue-http";
import { mailReissueDependencies } from "@/lib/booking-mail-reissue-server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function POST(request: Request) { return handleMailReissue(request, mailReissueDependencies()); }
