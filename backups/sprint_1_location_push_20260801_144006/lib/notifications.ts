// mobile/lib/notifications.ts

import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

import { supabase } from "./supabase";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

export type PushRegistrationResult = {
  status: "granted" | "denied" | "unavailable" | "error";
  token: string | null;
  permissionWasAlreadyGranted: boolean;
  message: string;
};

function getProjectId(): string | undefined {
  return (
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId ??
    undefined
  );
}

export async function registerForPushNotificationsAsync(): Promise<PushRegistrationResult> {
  if (!Device.isDevice) {
    return {
      status: "unavailable",
      token: null,
      permissionWasAlreadyGranted: false,
      message: "Push-Benachrichtigungen benötigen ein physisches Gerät.",
    };
  }

  try {
    const existing = await Notifications.getPermissionsAsync();
    const permissionWasAlreadyGranted = existing.status === "granted";

    let finalStatus = existing.status;

    if (existing.status !== "granted") {
      const requested = await Notifications.requestPermissionsAsync();
      finalStatus = requested.status;
    }

    if (finalStatus !== "granted") {
      return {
        status: "denied",
        token: null,
        permissionWasAlreadyGranted,
        message:
          "Die Geräteberechtigung für Push-Benachrichtigungen wurde nicht erteilt.",
      };
    }

    const projectId = getProjectId();
    const tokenData = projectId
      ? await Notifications.getExpoPushTokenAsync({ projectId })
      : await Notifications.getExpoPushTokenAsync();

    const token = tokenData.data;

    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user.id;

    if (userId) {
      const { error } = await supabase
        .from("profiles")
        .update({ expo_push_token: token })
        .eq("id", userId);

      if (error) throw error;
    }

    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "default",
        importance: Notifications.AndroidImportance.MAX,
      });
    }

    return {
      status: "granted",
      token,
      permissionWasAlreadyGranted,
      message: permissionWasAlreadyGranted
        ? "Push war auf diesem Gerät bereits erlaubt."
        : "Push-Benachrichtigungen wurden aktiviert.",
    };
  } catch (error: any) {
    console.warn("[push] registration failed", error);

    return {
      status: "error",
      token: null,
      permissionWasAlreadyGranted: false,
      message:
        error?.message ??
        "Der Push-Token konnte nicht eingerichtet werden.",
    };
  }
}

export async function unregisterPushNotificationsAsync() {
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user.id;

  if (userId) {
    const { error } = await supabase
      .from("profiles")
      .update({ expo_push_token: null })
      .eq("id", userId);

    if (error) throw error;
  }

  await Notifications.dismissAllNotificationsAsync();
}
