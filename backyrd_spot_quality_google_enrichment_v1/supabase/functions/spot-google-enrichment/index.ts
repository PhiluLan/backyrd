import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const DAYS: Record<number, string> = {
  0: "Sonntag", 1: "Montag", 2: "Dienstag", 3: "Mittwoch",
  4: "Donnerstag", 5: "Freitag", 6: "Samstag",
};

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function clean(value: unknown) { return String(value ?? "").trim(); }
function timeValue(point: any): string | null {
  if (!point || typeof point.hour !== "number") return null;
  return `${String(point.hour).padStart(2,"0")}:${String(point.minute ?? 0).padStart(2,"0")}:00`;
}
function mapHours(periods: any[], spotId: string) {
  if (!Array.isArray(periods)) return [];
  const rows: any[] = [];
  let idx = 0;
  for (const period of periods) {
    const dayName = DAYS[period?.open?.day];
    const openTime = timeValue(period?.open);
    const closeTime = timeValue(period?.close);
    if (!dayName || !openTime || !closeTime) continue;
    rows.push({ spot_id: spotId, idx, day_of_week: dayName, open_time: openTime, close_time: closeTime });
    idx += 1;
  }
  return rows;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ ok:false, error:"Method not allowed" },405);

  try {
    const supabaseUrl=Deno.env.get("SUPABASE_URL");
    const anonKey=Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const googleApiKey=Deno.env.get("GOOGLE_PLACES_API_KEY");
    if(!supabaseUrl||!anonKey||!serviceRoleKey||!googleApiKey) {
      return json({ok:false,error:"Server configuration is incomplete."},500);
    }

    const authorization=request.headers.get("Authorization")??"";
    const authClient=createClient(supabaseUrl,anonKey,{global:{headers:{Authorization:authorization}},auth:{persistSession:false}});
    const {data:{user},error:userError}=await authClient.auth.getUser();
    if(userError||!user) return json({ok:false,error:"Unauthorized"},401);

    const admin=createClient(supabaseUrl,serviceRoleKey,{auth:{persistSession:false}});
    const {data:profile,error:profileError}=await admin.from("profiles").select("id,is_admin").eq("id",user.id).maybeSingle();
    if(profileError) throw profileError;
    if(!profile?.is_admin) return json({ok:false,error:"Admin access required."},403);

    const body=await request.json().catch(()=>({}));
    const action=clean(body?.action);
    const spotId=clean(body?.spotId);
    if(!spotId) return json({ok:false,error:"spotId is required."},400);

    const [{data:spot,error:spotError},{data:hours,error:hoursError}]=await Promise.all([
      admin.from("spots").select("id,name,address,website,phone,google_place_id,status").eq("id",spotId).maybeSingle(),
      admin.from("spot_hours").select("id,day_of_week,open_time,close_time,idx").eq("spot_id",spotId).order("idx",{ascending:true}),
    ]);
    if(spotError) throw spotError;
    if(hoursError) throw hoursError;
    if(!spot) return json({ok:false,error:"Spot not found."},404);
    if(!spot.google_place_id) return json({ok:false,error:"Google Place ID is missing."},400);

    const response=await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(spot.google_place_id)}`,{
      headers:{
        "X-Goog-Api-Key":googleApiKey,
        "X-Goog-FieldMask":["id","displayName","formattedAddress","websiteUri","nationalPhoneNumber","internationalPhoneNumber","businessStatus","primaryType","primaryTypeDisplayName","googleMapsUri","regularOpeningHours"].join(","),
      },
    });
    if(!response.ok){
      const details=await response.text();
      console.error("Google enrichment details failed:",response.status,details);
      return json({ok:false,error:"Google Place Details failed.",details},502);
    }

    const google=await response.json();
    const googleHours=mapHours(google?.regularOpeningHours?.periods,spot.id);
    const suggestedPhone=clean(google?.nationalPhoneNumber)||clean(google?.internationalPhoneNumber)||null;
    const preview={
      website:{current:clean(spot.website)||null,suggested:clean(google?.websiteUri)||null,canApply:!clean(spot.website)&&Boolean(clean(google?.websiteUri))},
      phone:{current:clean(spot.phone)||null,suggested:suggestedPhone,canApply:!clean(spot.phone)&&Boolean(suggestedPhone)},
      openingHours:{currentCount:hours?.length??0,suggestedCount:googleHours.length,canApply:(hours?.length??0)===0&&googleHours.length>0,current:hours??[],suggested:googleHours,weekdayDescriptions:google?.regularOpeningHours?.weekdayDescriptions??[]},
      businessStatus:google?.businessStatus??null,
      primaryType:google?.primaryType??null,
      primaryTypeLabel:google?.primaryTypeDisplayName?.text??null,
      googleMapsUri:google?.googleMapsUri??null,
      googleName:google?.displayName?.text??null,
      googleAddress:google?.formattedAddress??null,
    };

    if(action==="preview") return json({ok:true,preview});
    if(action!=="apply") return json({ok:false,error:"Unknown action."},400);

    const fields=Array.isArray(body?.fields)?body.fields.map((v:any)=>clean(v)):[];
    const applied:string[]=[];
    const skipped:any[]=[];

    if(fields.includes("website")){
      if(clean(spot.website)) skipped.push({field:"website",reason:"Backyrd website already exists."});
      else if(!clean(google?.websiteUri)) skipped.push({field:"website",reason:"Google website is missing."});
      else { const {error}=await admin.from("spots").update({website:clean(google.websiteUri)}).eq("id",spot.id); if(error) throw error; applied.push("website"); }
    }

    if(fields.includes("phone")){
      if(clean(spot.phone)) skipped.push({field:"phone",reason:"Backyrd phone already exists."});
      else if(!suggestedPhone) skipped.push({field:"phone",reason:"Google phone is missing."});
      else { const {error}=await admin.from("spots").update({phone:suggestedPhone}).eq("id",spot.id); if(error) throw error; applied.push("phone"); }
    }

    if(fields.includes("openingHours")){
      if((hours?.length??0)>0) skipped.push({field:"openingHours",reason:"Backyrd opening hours already exist."});
      else if(googleHours.length===0) skipped.push({field:"openingHours",reason:"Google opening hours are missing."});
      else { const {error}=await admin.from("spot_hours").insert(googleHours); if(error) throw error; applied.push("openingHours"); }
    }

    await admin.from("spot_google_enrichment_events").insert({spot_id:spot.id,applied_by:user.id,applied_fields:applied,skipped_fields:skipped});
    try { await admin.rpc("backyrd_refresh_spot_ml_document_v13",{p_spot_id:spot.id}); } catch(e){ console.warn("ML refresh failed",e); }

    return json({ok:true,applied,skipped});
  } catch(error){
    console.error("spot-google-enrichment error:",error);
    return json({ok:false,error:error instanceof Error?error.message:String(error)},500);
  }
});
