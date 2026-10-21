import { requireOwnerSession } from "./owner-api";
export class BookingStaffMailError extends Error {
  constructor(message: string, readonly uncertain: boolean, readonly status=0) { super(message); }
}
export async function bookingMailActor() { const session=await requireOwnerSession(); return session?.user.id ?? null; }
export async function staffMailRequest<T>(path: "reissue" | "summary", intent: object, actorId: string, recover: boolean, parse: (value: unknown) => T, copy: Record<string,string>) {
  let dispatched = false;
  try {
    const session = await requireOwnerSession();
    if (!session || session.user.id !== actorId) throw new BookingStaffMailError(copy.authentication_required, false, 401);
    dispatched = true;
    const response = await fetch(`/api/booking/mail/${path}`, { method: "POST", credentials: "same-origin", cache: "no-store", redirect: "error", signal: AbortSignal.timeout(45000), headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" }, body: JSON.stringify({ ...intent, operation: recover ? "recover" : path === "reissue" ? "issue" : "prepare" }) });
    const value: unknown = await response.json();
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid_mail_reissue");
    const row = value as Record<string, unknown>;
    if (!response.ok) throw new BookingStaffMailError(copy[typeof row.error === "string" ? row.error : ""] ?? "Der Auftragsstatus ist nicht bekannt.", row.outcome !== "rejected", response.status);
    if (recover && row.data === null) return null;
    return parse(row.data);
  } catch (failure) {
    if (failure instanceof BookingStaffMailError) throw failure;
    throw new BookingStaffMailError("Der Auftragsstatus konnte nicht sicher geprüft werden.", dispatched && !recover);
  }
}

