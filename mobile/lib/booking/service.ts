import { guestCancellationFenced, type GuestReceipt, type GuestRequest } from "../../../packages/shared/src/contracts/booking-guest";
import { GuestRequestError, type createGuestClient } from "../../../packages/shared/src/contracts/booking-guest-client";
import { BookingWalletError, parseBookingLink, type BookingCredential, type BookingWallet } from "./wallet";

type Requester = ReturnType<typeof createGuestClient>;
export type CurrentBooking = { receipt: GuestReceipt; credential: BookingCredential };
export type CancellationResult = { kind: "current"; booking: CurrentBooking } | { kind: "rejected"; code: string } | { kind: "unknown"; code: string; acknowledged: boolean };

/** A root-locked current read fences any older compare-and-set mutation, even if its ACK was lost. */
export function cancellationFenced(receipt: GuestReceipt, credential: BookingCredential) {
  return !!credential.cancellation && guestCancellationFenced(receipt, credential.cancellation.revision);
}

export function createBookingService(wallet: BookingWallet, request: Requester, uuid: () => string) {
  async function receiptFor(input: GuestRequest): Promise<GuestReceipt> {
    const response = await request(input);
    if (!("id" in response)) throw new Error("invalid_booking_response");
    return response;
  }
  async function read(id: string): Promise<CurrentBooking> {
    const credential = await wallet.get(id);
    if (!credential) throw new BookingWalletError("changed");
    const receipt = await receiptFor({ operation: "read", reservationId: id, key: credential.key });
    const latest = await wallet.get(id);
    if (!latest || latest.key !== credential.key) throw new BookingWalletError("changed");
    if (cancellationFenced(receipt, latest)) await wallet.settleCancellation(id, latest.key, latest.cancellation!.requestId);
    const final = await wallet.get(id);
    if (!final || final.key !== credential.key) throw new BookingWalletError("changed");
    return { receipt, credential: final };
  }
  return {
    read,
    importLink: async (link: string): Promise<CurrentBooking> => {
      const credential = parseBookingLink(link);
      // Possession is verified before local import; no implicit write or account claim.
      await receiptFor({ operation: "read", reservationId: credential.reservationId, key: credential.key });
      await wallet.add(credential);
      return read(credential.reservationId);
    },
    cancel: async (id: string, key: string, revision: number): Promise<CancellationResult> => {
      const previous = await wallet.get(id);
      if (!previous || previous.key !== key) throw new BookingWalletError("changed");
      // Repeating an unknown request first checks a current, read-only revision fence.
      if (previous.cancellation) {
        try {
          const current = await read(id);
          if (!current.credential.cancellation) return { kind: "current", booking: current };
        } catch { return { kind: "unknown", code: "temporarily_unavailable", acknowledged: false }; }
      }
      const credential = await wallet.prepareCancellation(id, key, revision, uuid());
      const intent = credential.cancellation!;
      let acknowledged = false;
      try {
        await receiptFor({ operation: "cancel", reservationId: id, key, requestId: intent.requestId, revision: intent.revision });
        acknowledged = true;
        const current = await read(id);
        if (current.credential.cancellation) return { kind: "unknown", code: "outcome_unknown", acknowledged };
        return { kind: "current", booking: current };
      } catch (error) {
        if (!acknowledged && !previous.cancellation && error instanceof GuestRequestError && !error.uncertain) {
          await wallet.settleCancellation(id, key, intent.requestId);
          return { kind: "rejected", code: error.code };
        }
        return { kind: "unknown", code: error instanceof GuestRequestError ? error.code : "temporarily_unavailable", acknowledged };
      }
    },
  };
}
export type BookingService = ReturnType<typeof createBookingService>;
