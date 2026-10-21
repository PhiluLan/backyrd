import type { BookingSource, BookingStatus } from "./booking-api";

export const reportStatuses: BookingStatus[] = ["pending","confirmed","arrived","seated","completed","cancelled","declined","no_show"];
export const reportSources: BookingSource[] = ["phone","email","walk_in","operator","website"];
export type ReportScope = { from: string; to: string; serviceId: string | null };
export type ReportCount = { reservations: number; guests: number };
export type ReportCounts = ReportCount & { statuses: Record<BookingStatus,ReportCount> };
export type BookingReport = { spotId: string; scope: ReportScope; observedAt: string; totals: ReportCounts; days: (ReportCounts & { date: string })[]; services: (ReportCounts & { id: string; name: string; isActive: boolean })[]; sources: (ReportCount & { source: BookingSource })[] };
function invalid(): never { throw new Error("booking_invalid_response"); }
function object(value: unknown): Record<string,unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string,unknown> : invalid(); }
function uuid(value: unknown): string { return typeof value === "string" && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value) ? value.toLowerCase() : invalid(); }
function date(value: unknown): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value < "0001-01-01" || value > "9999-12-30") return invalid();
  const instant = Date.parse(value+"T12:00:00Z"); if (!Number.isFinite(instant) || new Date(instant).toISOString().slice(0,10) !== value) return invalid(); return value;
}
export function reportDates(scope: Pick<ReportScope,"from" | "to">): string[] {
  const from = date(scope.from), to = date(scope.to), count = (Date.parse(to+"T12:00:00Z")-Date.parse(from+"T12:00:00Z"))/86400000;
  if (count < 0 || count > 30 || !Number.isInteger(count)) return invalid();
  return Array.from({length:count+1},(_,n)=>new Date(Date.parse(from+"T12:00:00Z")+n*86400000).toISOString().slice(0,10));
}
export function validateReportScope(value: ReportScope): ReportScope {
  try { const scope = { from: date(value.from), to: date(value.to), serviceId: value.serviceId === null ? null : uuid(value.serviceId) }; reportDates(scope); return scope; }
  catch { throw new Error("invalid_booking_report_scope"); }
}
function integer(value: unknown): number { return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : invalid(); }
function counts(value: unknown): ReportCount {
  const row = object(value), result = {reservations:integer(row.reservations),guests:integer(row.guests)};
  if (result.guests < result.reservations || BigInt(result.guests)>BigInt(result.reservations)*BigInt(30)) return invalid(); return result;
}
function sum(rows: ReportCount[]): ReportCount {
  const value = {reservations:rows.reduce((n,r)=>n+r.reservations,0),guests:rows.reduce((n,r)=>n+r.guests,0)};
  if (!Number.isSafeInteger(value.reservations) || !Number.isSafeInteger(value.guests)) return invalid(); return value;
}
function equal(a: ReportCount,b: ReportCount): boolean { return a.reservations === b.reservations && a.guests === b.guests; }
function statusCounts(value: unknown): ReportCounts {
  const row = object(value), result = counts(row);
  if (!Array.isArray(row.statuses) || row.statuses.length !== reportStatuses.length) return invalid();
  const pairs = row.statuses.map((value,index) => { const item = object(value); if (item.status !== reportStatuses[index]) return invalid(); return [reportStatuses[index],counts(item)] as const; });
  const statuses = Object.fromEntries(pairs) as Record<BookingStatus,ReportCount>;
  if (!equal(result,sum(pairs.map(([,count])=>count)))) return invalid(); return {...result,statuses};
}
function reconcile(rows: ReportCounts[],totals: ReportCounts) {
  if (!equal(sum(rows),totals)) return invalid();
  for (const status of reportStatuses) if (!equal(sum(rows.map(r=>r.statuses[status])),totals.statuses[status])) return invalid();
}
export function parseBookingReport(value: unknown,spotId: string,expectedScope: ReportScope): BookingReport {
  const row = object(value), query = validateReportScope(expectedScope), scopeRow = object(row.scope);
  const scope = validateReportScope({from:date(scopeRow.from_date),to:date(scopeRow.to_date),serviceId:scopeRow.service_id === null ? null : uuid(scopeRow.service_id)});
  if (uuid(row.spot_id) !== uuid(spotId) || scope.from !== query.from || scope.to !== query.to || scope.serviceId !== query.serviceId) return invalid();
  if (typeof row.observed_at !== "string" || !row.observed_at.includes("T") || !Number.isFinite(Date.parse(row.observed_at))) return invalid();
  const totals = statusCounts(row.totals), dates = reportDates(scope);
  if (!Array.isArray(row.days) || row.days.length !== dates.length || !Array.isArray(row.services) || row.services.length > 1000 || !Array.isArray(row.sources) || row.sources.length !== reportSources.length) return invalid();
  const days = row.days.map((value,n) => { const d = object(value); if (d.date !== dates[n]) return invalid(); return {...statusCounts(d),date:dates[n]}; });
  const seen = new Set<string>();
  const services = row.services.map(value => { const v = object(value), id = uuid(v.id); if (seen.has(id) || typeof v.name !== "string" || !v.name.trim() || [...v.name].length > 80 || typeof v.is_active !== "boolean") return invalid(); seen.add(id); return {...statusCounts(v),id,name:v.name,isActive:v.is_active}; });
  if (query.serviceId && (services.length !== 1 || services[0].id !== query.serviceId)) return invalid();
  if (!query.serviceId && services.some(s=>s.reservations === 0)) return invalid();
  const sources = row.sources.map((value,n) => { const item = object(value); if (item.source !== reportSources[n]) return invalid(); return {...counts(item),source:reportSources[n]}; });
  reconcile(days,totals); reconcile(services,totals); if (!equal(sum(sources),totals)) return invalid();
  return {spotId:uuid(row.spot_id),scope,observedAt:row.observed_at,totals,days,services,sources};
}
function csvCell(value: string | number): string {
  let text = String(value).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,"");
  if (/^\s*[=+\-@]/.test(text) || /^[\t\r\n]/.test(text)) text = "'"+text;
  return '"'+text.replaceAll('"','""')+'"';
}
export function bookingReportCsv(report: BookingReport,labels: {statuses:Record<BookingStatus,string>;sources:Record<BookingSource,string>}): string {
  const rows: (string|number)[][] = [["Zeitraum von","Zeitraum bis","Datenstand","Abschnitt","Datum","Service","Quelle","Status","Reservierungen","Personen"]];
  const selectedService = report.scope.serviceId ? report.services[0].name : "Alle Services";
  const add = (section:string,day:string,service:string,source:string,status:string,count:ReportCount) => rows.push([report.scope.from,report.scope.to,report.observedAt,section,day,service,source,status,count.reservations,count.guests]);
  add("Gesamt","",selectedService,"","Alle Status",report.totals);
  for (const status of reportStatuses) add("Status","",selectedService,"",labels.statuses[status],report.totals.statuses[status]);
  for (const day of report.days) { add("Tag",day.date,selectedService,"","Alle Status",day); for (const status of reportStatuses) add("Tag/Status",day.date,selectedService,"",labels.statuses[status],day.statuses[status]); }
  for (const service of report.services) { add("Service","",service.name,"","Alle Status",service); for (const status of reportStatuses) add("Service/Status","",service.name,"",labels.statuses[status],service.statuses[status]); }
  for (const source of report.sources) add("Quelle","",selectedService,labels.sources[source.source],"Alle Status",source);
  return "\ufeff"+rows.map(row=>row.map(csvCell).join(";")).join("\r\n")+"\r\n";
}
