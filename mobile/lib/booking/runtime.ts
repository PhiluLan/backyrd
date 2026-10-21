import "react-native-url-polyfill/auto";
import Constants from "expo-constants";
import * as Crypto from "expo-crypto";
import { fetch as nativeFetch } from "expo/fetch";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { createGuestClient } from "../../../packages/shared/src/contracts/booking-guest-client";
import { createBookingWallet, type WalletStorage } from "./wallet";
import { createBookingService } from "./service";
import { resolveBookingOrigin } from "./runtime-config";

export const bookingOrigin = resolveBookingOrigin(Constants.expoConfig?.extra?.appVariant, process.env.EXPO_PUBLIC_BOOKING_ORIGIN);
const options: SecureStore.SecureStoreOptions = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY, keychainService: "backyrd.booking.v1" };
const storage: WalletStorage = Platform.OS === "web" ? {
  get: async key => window.sessionStorage.getItem(key),
  set: async (key, value) => { window.sessionStorage.setItem(key, value); },
  remove: async key => { window.sessionStorage.removeItem(key); },
} : {
  get: key => SecureStore.getItemAsync(key, options),
  set: (key, value) => SecureStore.setItemAsync(key, value, options),
  remove: key => SecureStore.deleteItemAsync(key, options),
};

export async function openBookingWallet(actorId: string | null) {
  if (!bookingOrigin) throw new Error("booking_not_configured");
  const namespace = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${bookingOrigin}\n${actorId ?? "guest"}`);
  const wallet = createBookingWallet(storage, namespace);
  // RN fetch has cookie/redirect limitations. Explicit Expo fetch implements both options natively.
  const client = createGuestClient(`${bookingOrigin}/api/booking/guest`, (url, init) => nativeFetch(url, init), Platform.OS === "web" ? undefined : bookingOrigin);
  return { wallet, service: createBookingService(wallet, client, Crypto.randomUUID) };
}
export type BookingRuntime = Awaited<ReturnType<typeof openBookingWallet>>;
