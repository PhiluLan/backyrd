import "server-only";
import { guestUuid, record } from "./booking-guest-contract";
import { boundedJson } from "./booking-guest-security";
import { BookingRpcRejection } from "./booking-service-rpc";
import type { BookingStaffMailDependencies } from "./booking-mail-staff-server";
import { parseMailSummaryRequest, parseMailSummaryResult } from "./booking-mail-summary-contract";
const headers = { "Cache-Control":"private, no-store", "Referrer-Policy":"no-referrer", "X-Robots-Tag":"noindex, nofollow", "X-Content-Type-Options":"nosniff" };
const fail=(status:number,error:string,unknown=false)=>Response.json({error,outcome:unknown?"unknown":"rejected"},{status,headers});
export async function handleMailSummary(request:Request,d:BookingStaffMailDependencies|null):Promise<Response> {
  if(request.method!=="POST")return fail(405,"bad_request");
  if(!d)return fail(503,"mail_unavailable");
  if(new URL(request.url).search || request.headers.get("origin")!==d.origin || request.headers.get("sec-fetch-site")==="cross-site")return fail(403,"bad_request");
  if(request.headers.has("content-encoding") || !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get("content-type")??""))return fail(415,"bad_request");
  let r:ReturnType<typeof parseMailSummaryRequest>;
  try{r=parseMailSummaryRequest(await boundedJson(request,4096,5000));}catch{return fail(400,"bad_request");}
  let writing=false,observedCommit=false;
  try{
    const actor=await d.actor(request);if(!actor)return fail(401,"authentication_required");
    const args={p_actor:guestUuid(actor),p_spot_id:r.spotId,p_reservation_id:r.reservationId,p_request_id:r.requestId,p_expected_revision:r.revision,p_email:r.email};
    const quota=record(await d.rpc("backyrd_consume_launch_cost_boundary_v1",{p_operation:"booking_mail_summary",p_subject_key:actor,p_subject_minute_limit:30,p_subject_day_limit:1000,p_global_minute_limit:240,p_global_day_limit:20000}));
    if(typeof quota.allowed!=="boolean")return fail(503,"mail_unavailable");
    if(!quota.allowed)return fail(429,"rate_limited");
    const prior=await d.rpc("booking_mail_summary_recover_v1",args);
    if(prior!==null){observedCommit=true;return Response.json({data:parseMailSummaryResult(prior,r)},{headers});}
    if(r.operation==="recover")return Response.json({data:null},{headers});
    const context=record(await d.rpc("booking_mail_summary_context_v1",{p_actor:args.p_actor,p_spot_id:r.spotId,p_reservation_id:r.reservationId,p_expected_revision:r.revision,p_email:r.email}));
    if(context.reservation_id!==r.reservationId || context.revision!==r.revision || context.email!==r.email || context.message_mode!=="manual_summary")throw new Error("mail_context_mismatch");
    if(!await d.senderReady())return fail(503,"sender_unavailable");
    writing=true;
    return Response.json({data:parseMailSummaryResult(await d.rpc("booking_mail_summary_v1",args),r)},{headers});
  }catch(error){
    if(error instanceof BookingRpcRejection){
      if(error.databaseCode==="42501" || error.databaseMessage.startsWith("SAFETY_"))return fail(403,"access_denied");
      if(error.databaseCode==="40001")return fail(409,"changed");
      if(error.databaseMessage==="booking_request_reused")return fail(409,"request_reused");
      if(error.databaseMessage==="booking_mail_recipient_blocked")return fail(409,"recipient_blocked");
      if(error.databaseMessage==="booking_mail_summary_rate_limited")return fail(429,"rate_limited");
      if(error.databaseCode==="22023")return fail(400,"not_available");
    }
    return fail(503,writing||observedCommit?"outcome_unknown":"mail_unavailable",writing||observedCommit);
  }
}
