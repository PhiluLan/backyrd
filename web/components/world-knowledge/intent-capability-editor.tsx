"use client";

import { catalog, type PrototypeState } from "@/lib/world-knowledge/model";
import type { Dispatch, SetStateAction } from "react";

export function IntentCapabilityEditor({ state }: { state: PrototypeState; setState: Dispatch<SetStateAction<PrototypeState>> }) {
  const label = (id: string) => catalog.definitions.find((item) => item.id === id)?.label ?? id;
  return <section className="wk-relation-card"><div><span className="wk-kicker">REGISTRY-VORSCHAU · NICHT SPOT-AUTHORING</span><h3>Capability → Intent-Klasse</h3><p>Der Nutzer besitzt den Intent. Der Spot besitzt nur nachweisbare Capabilities. Die Zuordnung wird künftig separat versioniert und erscheint nicht als direkt gepflegter Spot-Intent.</p></div>{state.intentCapabilityLinks.length > 0 ? <div className="wk-relations">{state.intentCapabilityLinks.map((item) => <div key={item.id}><strong>{label(item.intentId)}</strong><span>kann unterstützt werden durch</span><strong>{label(item.capabilityId)}</strong></div>)}</div> : <p>Keine historischen Registry-Zuordnungen im lokalen Teststand. Der Engine Snapshot enthält deshalb keine direkten Nutzer-Intents.</p>}</section>;
}
