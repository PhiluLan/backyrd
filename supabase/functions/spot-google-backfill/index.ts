import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function clean(v: unknown) { return String(v ?? "").trim(); }
function norm(v: unknown) {
  return clean(v).toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}
function similarity(a: unknown, b: unknown) {
  const x = norm(a), y = norm(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  if (x.includes(y) || y.includes(x)) return 0.92;
  const xs = new Set(x.split(" ")), ys = new Set(y.split(" "));
  return [...xs].filter(t => ys.has(t)).length / Math.max(xs.size, ys.size, 1);
}
function distanceMeters(aLat:number,aLng:number,bLat:number,bLng:number) {
  const R=6371000, r=(n:number)=>n*Math.PI/180;
  const dLat=r(bLat-aLat), dLng=r(bLng-aLng);
  const a=Math.sin(dLat/2)**2+Math.cos(r(aLat))*Math.cos(r(bLat))*Math.sin(dLng/2)**2;
  return Math.round(2*R*Math.atan2(Math.sqrt(a),Math.sqrt(1-a)));
}
async function photoUri(photoName:string|undefined,key:string) {
  if (!photoName) return null;
  const u=new URL(`https://places.googleapis.com/v1/${photoName}/media`);
  u.searchParams.set("maxWidthPx","900"); u.searchParams.set("maxHeightPx","700");
  u.searchParams.set("skipHttpRedirect","true");
  const r=await fetch(u,{headers:{"X-Goog-Api-Key":key}});
  if(!r.ok) return null;
  const d=await r.json(); return typeof d?.photoUri === "string" ? d.photoUri : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ok:false,error:"Method not allowed"},405);
  try {
    const url=Deno.env.get("SUPABASE_URL"), anon=Deno.env.get("SUPABASE_ANON_KEY"), service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"), google=Deno.env.get("GOOGLE_PLACES_API_KEY");
    if(!url||!anon||!service||!google) return json({ok:false,error:"Server configuration incomplete"},500);
    const auth=req.headers.get("Authorization")??"";
    const authClient=createClient(url,anon,{global:{headers:{Authorization:auth}},auth:{persistSession:false}});
    const {data:{user}}=await authClient.auth.getUser();
    if(!user) return json({ok:false,error:"Unauthorized"},401);
    const admin=createClient(url,service,{auth:{persistSession:false}});
    const {data:profile}=await admin.from("profiles").select("is_admin").eq("id",user.id).maybeSingle();
    if(!profile?.is_admin) return json({ok:false,error:"Admin access required"},403);
    const body=await req.json().catch(()=>({}));
    const action=clean(body.action), spotId=clean(body.spotId);
    if(!spotId) return json({ok:false,error:"spotId required"},400);
    const {data:spot,error:spotError}=await admin.from("spots")
      .select("id,name,address,city,country,lat,lng,google_place_id")
      .eq("id",spotId).maybeSingle();
    if(spotError) throw spotError;
    if(!spot) return json({ok:false,error:"Spot not found"},404);

    if(action==="accept") {
      const googlePlaceId=clean(body.googlePlaceId);
      if(!googlePlaceId) return json({ok:false,error:"googlePlaceId required"},400);
      const {error}=await admin.from("spots").update({google_place_id:googlePlaceId,google_photo_enabled:true}).eq("id",spotId);
      if(error) throw error;
      return json({ok:true,action:"accept",googlePlaceId});
    }
    if(action==="reject") {
      const googlePlaceId=clean(body.googlePlaceId);
      if(!googlePlaceId) return json({ok:false,error:"googlePlaceId required"},400);
      const {error}=await admin.from("spot_google_backfill_rejections").upsert({spot_id:spotId,google_place_id:googlePlaceId,rejected_by:user.id,rejected_at:new Date().toISOString(),reason:clean(body.reason)||null},{onConflict:"spot_id,google_place_id"});
      if(error) throw error;
      return json({ok:true,action:"reject",googlePlaceId});
    }
    if(action!=="search") return json({ok:false,error:"Unknown action"},400);

    const query=clean(body.query)||[spot.name,spot.address||spot.city,spot.country].filter(Boolean).join(", ");
    const payload:any={textQuery:query,pageSize:5,languageCode:"de",regionCode:"CH"};
    if(Number.isFinite(spot.lat)&&Number.isFinite(spot.lng)) payload.locationBias={circle:{center:{latitude:spot.lat,longitude:spot.lng},radius:1500}};
    const gr=await fetch("https://places.googleapis.com/v1/places:searchText",{
      method:"POST",
      headers:{"Content-Type":"application/json","X-Goog-Api-Key":google,"X-Goog-FieldMask":"places.id,places.displayName,places.formattedAddress,places.location,places.businessStatus,places.primaryTypeDisplayName,places.websiteUri,places.nationalPhoneNumber,places.googleMapsUri,places.photos"},
      body:JSON.stringify(payload),
    });
    if(!gr.ok) return json({ok:false,error:"Google search failed",details:await gr.text()},502);
    const gd=await gr.json();
    const {data:rejected}=await admin.from("spot_google_backfill_rejections").select("google_place_id").eq("spot_id",spotId);
    const rejectedIds=new Set((rejected??[]).map((x:any)=>x.google_place_id));
    const candidates=[];
    for(const p of (gd.places??[])) {
      if(!p.id||rejectedIds.has(p.id)) continue;
      const dist=Number.isFinite(spot.lat)&&Number.isFinite(spot.lng)&&Number.isFinite(p.location?.latitude)&&Number.isFinite(p.location?.longitude)
        ? distanceMeters(spot.lat,spot.lng,p.location.latitude,p.location.longitude):null;
      const ns=similarity(spot.name,p.displayName?.text), as=similarity(spot.address??spot.city,p.formattedAddress);
      const ds=dist===null?0.45:dist<=60?1:dist<=150?0.9:dist<=350?0.72:dist<=750?0.45:dist<=1500?0.2:0;
      const confidence=Math.round(Math.max(0,Math.min(1,ns*0.5+as*0.28+ds*0.22))*100);
      const photo=p.photos?.find((x:any)=>x.name);
      candidates.push({
        googlePlaceId:p.id,name:p.displayName?.text??"Unbekannter Ort",address:p.formattedAddress??null,
        distanceMeters:dist,confidence,scoreDetails:{name:Math.round(ns*100),address:Math.round(as*100),distance:Math.round(ds*100)},
        businessStatus:p.businessStatus??null,primaryTypeLabel:p.primaryTypeDisplayName?.text??null,
        website:p.websiteUri??null,phone:p.nationalPhoneNumber??null,googleMapsUri:p.googleMapsUri??null,
        imageUrl:await photoUri(photo?.name,google),photoAttribution:photo?.authorAttributions?.[0]?.displayName??null,
      });
    }
    candidates.sort((a,b)=>b.confidence-a.confidence);
    return json({ok:true,query,spot,candidates});
  } catch(error) {
    console.error("spot-google-backfill error",error);
    return json({ok:false,error:error instanceof Error?error.message:String(error)},500);
  }
});
