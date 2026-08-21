"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getOwnerGoldProfile, submitOwnerGoldProposal, type OwnerGoldProfile } from "@/lib/owner-api";

function parseValue(kind: string, allowed: unknown[], raw: string): unknown {
  if (["MULTI_SELECT", "RANGE", "STRUCTURED_OBJECT"].includes(kind)) return JSON.parse(raw);
  if (kind === "BOOLEAN") return raw === "true";
  if (kind === "ENUM" && allowed.some((item) => typeof item === "number")) return Number(raw);
  return raw;
}

function jsonObject(raw: string): Record<string, unknown> { try { const parsed=JSON.parse(raw); return parsed && typeof parsed==="object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {}; } catch { return {}; } }
function jsonArray(raw: string): unknown[] { try { const parsed=JSON.parse(raw); return Array.isArray(parsed) ? parsed : []; } catch { return []; } }

export function OwnerGoldAuthoring({ spotId }: { spotId: string }) {
  const [profile, setProfile] = useState<OwnerGoldProfile | null>(null);
  const [fieldKey, setFieldKey] = useState("");
  const [value, setValue] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const next=await getOwnerGoldProfile(spotId);
    setProfile(next);
    setFieldKey((current)=>current||next.catalog[0]?.field_key||"");
  }, [spotId]);

  useEffect(() => {
    void load().catch((error: unknown) => setMessage(error instanceof Error ? error.message : "Gold-Profil konnte nicht geladen werden."));
  }, [load]);
  const field = useMemo(() => profile?.catalog.find((item) => item.field_key === fieldKey), [fieldKey, profile]);
  const isPro = profile?.actor.capability === "DEEP";
  const locked = field?.capability === "DEEP" && !isPro;
  const objectValue=jsonObject(value);
  const arrayValue=jsonArray(value);
  const updateObject=(key:string,next:unknown)=>setValue(JSON.stringify({...objectValue,[key]:next}));

  async function submit() {
    if (!field || locked) return;
    setBusy(true); setMessage(null);
    try {
      await submitOwnerGoldProposal({ spotId, fieldKey, value: parseValue(field.value_kind, field.allowed_values, value), sourceUrl: sourceUrl.trim() || null });
      setMessage("Information eingereicht. Backyrd behält die Quelle und prüft sie vor der kanonischen Übernahme.");
      await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Einreichen fehlgeschlagen."); }
    finally { setBusy(false); }
  }

  if (!profile) return <section className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6">{message ?? "Backyrd-Verständnis wird geladen …"}</section>;

  return (
    <section className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><h2 className="text-2xl font-semibold">Backyrd versteht deinen Spot</h2><p className="mt-2 text-sm leading-6 text-white/45">{profile.readiness.status} · {profile.readiness.coverage}% Informationsabdeckung. „Nicht bekannt“ ist eine ehrliche, gültige Angabe.</p></div>
        <span className="rounded-full border border-white/10 bg-black/30 px-4 py-2 text-sm font-semibold">Owner {profile.actor.ownerTier}</span>
      </div>

      {message && <p className="mt-4 rounded-2xl border border-white/10 bg-black/25 p-4 text-sm text-white/75" role="status">{message}</p>}

      <div className="mt-6 grid gap-5 md:grid-cols-2">
        <label className="block"><span className="text-sm font-semibold text-white/55">Information</span><select value={fieldKey} onChange={(event) => { const next=event.target.value; const nextField=profile.catalog.find((item)=>item.field_key===next); setFieldKey(next); setValue(nextField?.value_kind === "MULTI_SELECT" ? "[]" : ["RANGE", "STRUCTURED_OBJECT"].includes(nextField?.value_kind ?? "") ? "{}" : ""); }} className="mt-2 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white">{profile.catalog.map((item) => <option key={item.field_key} value={item.field_key}>{item.section} · {item.field_key}{item.capability === "DEEP" ? " · PRO" : ""}</option>)}</select></label>
        {field?.value_kind === "ENUM" ? <label className="block"><span className="text-sm font-semibold text-white/55">Wert</span><select value={value} onChange={(event) => setValue(event.target.value)} disabled={locked} className="mt-2 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white disabled:opacity-40"><option value="">Bitte wählen</option>{field.allowed_values.map((item) => <option key={String(item)} value={String(item)}>{String(item)}</option>)}</select></label>
        : field?.field_key === "suitability.age" ? <div><span className="text-sm font-semibold text-white/55">Alters-Eignung</span><div className="mt-2 grid grid-cols-3 gap-2"><input type="number" min="0" max="120" placeholder="Min." value={String(objectValue.min_age ?? "")} onChange={(event)=>updateObject("min_age",event.target.value===""?null:Number(event.target.value))} disabled={locked} className="rounded-2xl border border-white/10 bg-black/30 px-3 py-3 text-white"/><input type="number" min="0" max="120" placeholder="Max." value={String(objectValue.max_age ?? "")} onChange={(event)=>updateObject("max_age",event.target.value===""?null:Number(event.target.value))} disabled={locked} className="rounded-2xl border border-white/10 bg-black/30 px-3 py-3 text-white"/><select value={String(objectValue.adult_supervision_required ?? "UNKNOWN")} onChange={(event)=>updateObject("adult_supervision_required",event.target.value==="UNKNOWN"?"UNKNOWN":event.target.value==="YES")} disabled={locked} className="rounded-2xl border border-white/10 bg-black/30 px-3 py-3 text-white"><option>UNKNOWN</option><option>YES</option><option>NO</option></select></div></div>
        : field?.field_key === "social.suitability" || field?.field_key.startsWith("accessibility.") ? <div><span className="text-sm font-semibold text-white/55">{field.field_key === "social.suitability" ? "Social Context" : "Accessibility"}</span><div className="mt-2 grid grid-cols-2 gap-2">{(field.field_key === "social.suitability" ? ["solo","date","friends","family","groups","work"] : ["step_free","wheelchair_spaces","accessible_toilet","elevator","hearing_support","assistance_dogs"]).map((key)=><label key={key} className="text-xs text-white/50">{key}<select value={String(objectValue[key] ?? "UNKNOWN")} onChange={(event)=>updateObject(key,event.target.value)} disabled={locked} className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-2 py-2 text-white"><option>UNKNOWN</option><option>SUITABLE</option><option>NOT_SUITABLE</option></select></label>)}</div></div>
        : field?.value_kind === "MULTI_SELECT" && field.allowed_values.length > 0 ? <div><span className="text-sm font-semibold text-white/55">Kontrollierte Auswahl</span><div className="mt-2 flex flex-wrap gap-2">{field.allowed_values.map((item)=><label key={String(item)} className="rounded-full border border-white/10 px-3 py-2 text-xs"><input type="checkbox" checked={arrayValue.includes(item)} onChange={(event)=>setValue(JSON.stringify(event.target.checked?[...arrayValue,item]:arrayValue.filter((entry)=>entry!==item)))} disabled={locked} className="mr-2"/>{String(item)}</label>)}</div></div>
        : field?.value_kind === "RANGE" ? <div><span className="text-sm font-semibold text-white/55">Bereich</span><div className="mt-2 grid grid-cols-2 gap-2"><input type="number" placeholder="Minimum" value={String(objectValue.min ?? "")} onChange={(event)=>updateObject("min",event.target.value===""?null:Number(event.target.value))} disabled={locked} className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white"/><input type="number" placeholder="Maximum" value={String(objectValue.max ?? "")} onChange={(event)=>updateObject("max",event.target.value===""?null:Number(event.target.value))} disabled={locked} className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white"/></div></div>
        : <label className="block"><span className="text-sm font-semibold text-white/55">Strukturierter Wert ({field?.value_kind})</span><textarea value={value} onChange={(event) => setValue(event.target.value)} disabled={locked} rows={3} className="mt-2 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white disabled:opacity-40" /></label>}
        <label className="block md:col-span-2"><span className="text-sm font-semibold text-white/55">Offizielle Quelle (optional)</span><input value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} disabled={locked} placeholder="https://…" className="mt-2 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white disabled:opacity-40" /></label>
      </div>

      {locked ? <div className="mt-5 rounded-2xl border border-pink-400/20 bg-pink-400/10 p-5 text-sm leading-6 text-pink-100">Mit Owner Pro kannst du Backyrd genauer beschreiben, damit wir deinen Spot in passenden Situationen besser verstehen können. Bereits akzeptierte Deep-Fakten bleiben erhalten.</div> : <button type="button" disabled={busy || !value} onClick={() => void submit()} className="mt-5 rounded-full bg-white px-6 py-3 text-sm font-semibold text-black disabled:opacity-50">{busy ? "Wird eingereicht …" : "Information mit Quelle einreichen"}</button>}

      <div className="mt-8 grid gap-5 md:grid-cols-2">
        <div><h3 className="font-semibold">Fehlende Informationen</h3><ul className="mt-3 space-y-2 text-sm text-white/60">{profile.readiness.gaps.map((gap) => <li key={`${gap.state}:${gap.item}`}><strong>{gap.state}</strong> · {gap.item}</li>)}</ul></div>
        <div><h3 className="font-semibold">So versteht Backyrd diesen Spot</h3><div className="mt-3 flex flex-wrap gap-2">{Object.keys(profile.canonicalN4?.intelligence?.concepts ?? {}).map((concept) => <span key={concept} className="rounded-full border border-white/10 px-3 py-1 text-xs text-white/60">{concept}</span>)}</div><p className="mt-3 text-xs text-white/35">Abgeleitete Confidence und N4 können nicht manuell editiert werden.</p></div>
      </div>
    </section>
  );
}
