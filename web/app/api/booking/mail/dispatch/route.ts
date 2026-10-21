import { handleMailJob } from "@/lib/booking-mail-http";
import { mailJobDependencies } from "@/lib/booking-mail-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function GET(request: Request) { return handleMailJob(request, mailJobDependencies()); }
export async function POST(request: Request) { return handleMailJob(request, mailJobDependencies()); }
