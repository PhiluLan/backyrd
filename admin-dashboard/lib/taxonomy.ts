export type NodeType = "subcategory" | "feature" | "offering" | "service";
export type Row = { id:string; slug:string; node_type:NodeType; parent_id:string|null; parent_label:string|null; label_de:string; label_en:string; icon:string|null; color:string|null; sort_order:number; is_active:boolean; is_owner_selectable:boolean; is_system:boolean; ml_weight:number; category_ids:string[]; category_names:string[]; synonyms_count:number; spots_count:number; updated_at:string };
export type Category = { id:string; name:string; icon:string|null; color:string|null };
export type Synonym = { id?:string; locale:"de"|"en"; synonym:string; weight:number };
export type Form = { id:string|null; slug:string; node_type:NodeType; parent_id:string; icon:string; color:string; sort_order:string; is_active:boolean; is_owner_selectable:boolean; is_system:boolean; ml_weight:string; label_de:string; short_label_de:string; description_de:string; label_en:string; short_label_en:string; description_en:string; category_ids:string[]; synonyms:Synonym[] };
type TaxonomyDetail = Partial<Omit<Form,"sort_order"|"ml_weight">> & { sort_order?:number|string; ml_weight?:number|string; synonyms?:Array<Partial<Synonym>> };

export const labels:Record<NodeType,string> = { subcategory:"Unterkategorie", feature:"Feature", offering:"Angebot", service:"Service" };
export const empty:Form = { id:null, slug:"", node_type:"feature", parent_id:"", icon:"", color:"", sort_order:"0", is_active:true, is_owner_selectable:true, is_system:false, ml_weight:"1.00", label_de:"", short_label_de:"", description_de:"", label_en:"", short_label_en:"", description_en:"", category_ids:[], synonyms:[] };

export function slugify(value:string) {
  return value.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/ä/g,"ae").replace(/ö/g,"oe").replace(/ü/g,"ue").replace(/ß/g,"ss").replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"");
}

export function toForm(input:unknown):Form {
  const data=(input && typeof input==="object" ? input : {}) as TaxonomyDetail;
  return {
    id:data.id??null, slug:data.slug??"", node_type:data.node_type??"feature", parent_id:data.parent_id??"",
    icon:data.icon??"", color:data.color??"", sort_order:String(data.sort_order??0), is_active:data.is_active??true,
    is_owner_selectable:data.is_owner_selectable??true, is_system:data.is_system??false, ml_weight:String(data.ml_weight??1),
    label_de:data.label_de??"", short_label_de:data.short_label_de??"", description_de:data.description_de??"",
    label_en:data.label_en??"", short_label_en:data.short_label_en??"", description_en:data.description_en??"",
    category_ids:data.category_ids??[],
    synonyms:(data.synonyms??[]).map((item)=>({ id:item.id, locale:item.locale==="en"?"en":"de", synonym:item.synonym??"", weight:Number(item.weight??1) })),
  };
}
