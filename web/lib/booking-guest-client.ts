"use client";
import { createGuestClient } from "../../packages/shared/src/contracts/booking-guest-client";
export { GuestRequestError } from "../../packages/shared/src/contracts/booking-guest-client";
export const guestRequest = createGuestClient("/api/booking/guest", (url, init) => fetch(url, init));
