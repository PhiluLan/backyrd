import { unregisterPushNotificationsAsync } from "./notifications";
import { supabase } from "./supabase";

// Keep the authenticated session until the server has detached this account's
// push devices. Otherwise the next owner of this device can receive its pushes.
export async function signOutWithPushCleanup(): Promise<void> {
  await unregisterPushNotificationsAsync();
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}
