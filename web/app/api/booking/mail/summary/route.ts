import { handleMailSummary } from "@/lib/booking-mail-summary-http";
import { mailSummaryDependencies } from "@/lib/booking-mail-summary-server";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=60;
export async function POST(request:Request){return handleMailSummary(request,mailSummaryDependencies());}
