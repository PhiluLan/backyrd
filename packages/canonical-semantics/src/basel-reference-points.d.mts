export declare const BASEL_DECISION_LOCATIONS: Readonly<Record<string, Readonly<{kind:"QUARTER"|"LANDMARK";label:string;latitude:number;longitude:number;defaultRadiusKm:number;aliases:readonly string[]}>>>;
export type BaselReferencePoint = Readonly<{
  kind: "LANDMARK";
  category: string;
  municipality: "Basel";
  label: string;
  latitude: number;
  longitude: number;
  aliases: readonly string[];
  source: Readonly<{ dataset: string; reference: string; url: string }>;
}>;
export declare const BASEL_REFERENCE_POINTS: Readonly<Record<string, BaselReferencePoint>>;
export declare function findBaselReferencePoint(name: string): (BaselReferencePoint & { readonly id: string }) | null;
