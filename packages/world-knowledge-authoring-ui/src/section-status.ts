import { evaluateAuthoringReadiness, type AuthoringField } from "@backyrd/world-knowledge-core/browser";
type Answer = {knowledgeState:string; value:unknown};
/** Counts describe saved input, never semantic correctness or scoped-offer completeness. */
export function sectionStatus(fields:readonly AuthoringField[],answers:Readonly<Record<string,Answer>>,category:unknown){
 if(!fields.length)return {primary:"Keine Eingaben verfügbar",secondary:"In diesem Abschnitt sind keine Felder freigegeben.",issues:[],optionalOpen:[],unknown:[]};
 const required=(field:AuthoringField)=>field.requirementClass==="REQUIRED" || field.requirementClass==="CONDITIONALLY_REQUIRED" && typeof category==="string";
 const issues=evaluateAuthoringReadiness({answers}).blocking.filter(issue=>fields.some(field=>field.attributeKey===issue.attributeKey));
 const optionalOpen=fields.filter(field=>!required(field)&&!answers[field.attributeKey]);
 const unknown=fields.filter(field=>answers[field.attributeKey]?.knowledgeState==="UNKNOWN");
 const count=fields.filter(field=>answers[field.attributeKey]&&answers[field.attributeKey].knowledgeState!=="UNKNOWN").length;
 const primary=issues.length?`${issues.length} ${issues.length===1?"Pflichtangabe":"Pflichtangaben"} prüfen`:fields.some(required)?"Pflichtangaben vorhanden":"Optionale Angaben";
 const secondary=[`${count} von ${fields.length} ${fields.length===1?"Feld":"Feldern"} ausgefüllt`,...(optionalOpen.length?[`${optionalOpen.length} optional offen`]:[]),...(unknown.length?[`${unknown.length} bewusst unbekannt`]:[])].join(" · ");
 return {primary,secondary,issues,optionalOpen,unknown};
}
