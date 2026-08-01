import React, { PropsWithChildren, useEffect, useRef } from "react";
import { AppState, AppStateStatus } from "react-native";
import { usePathname } from "expo-router";

import { supabase } from "../lib/supabase";
import {
  registerInstallation,
  reportAnalyticsError,
  setCurrentAnalyticsScreen,
  startAnalyticsSession,
  touchAnalyticsSession,
  trackAnalyticsEvent,
} from "../lib/analytics";

const BACKGROUND_SESSION_END_MS = 30 * 60 * 1000;
const UUID_SEGMENT = /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i;

function normalizeScreenName(pathname: string) {
  if (!pathname || pathname === "/") return "home";

  return pathname
    .split("?")[0]
    .split("/")
    .filter(Boolean)
    .map((segment) => (UUID_SEGMENT.test(segment) ? ":id" : segment))
    .join("/");
}

function spotIdFromPath(pathname: string) {
  const match = pathname.match(/^\/spot\/([0-9a-f-]{36})(?:\/|$)/i);
  return match?.[1] ?? null;
}

export function AnalyticsProvider({ children }: PropsWithChildren) {
  const pathname = usePathname();
  const previousPathRef = useRef<string | null>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const backgroundAtRef = useRef<number | null>(null);
  const bootedRef = useRef(false);

  useEffect(() => {
    let mounted = true;

    async function bootstrap() {
      await registerInstallation();
      if (!mounted) return;
      await startAnalyticsSession(normalizeScreenName(pathname));
      bootedRef.current = true;
    }

    bootstrap().catch((error) => {
      reportAnalyticsError({
        error,
        errorType: "analytics_bootstrap_error",
        handled: true,
      });
    });

    const { data: authSubscription } = supabase.auth.onAuthStateChange(() => {
      registerInstallation({ auth_state_changed: true });
    });

    return () => {
      mounted = false;
      authSubscription.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const screenName = normalizeScreenName(pathname);
    setCurrentAnalyticsScreen(screenName);

    if (!pathname || previousPathRef.current === pathname) return;

    const previousPath = previousPathRef.current;
    previousPathRef.current = pathname;
    const spotId = spotIdFromPath(pathname);

    trackAnalyticsEvent({
      eventName: "screen_view",
      screenName,
      spotId,
      entityType: spotId ? "spot" : null,
      entityId: spotId,
      properties: {
        pathname,
        previous_pathname: previousPath,
      },
    });

    if (spotId) {
      trackAnalyticsEvent({
        eventName: "spot_detail_opened",
        screenName,
        spotId,
        entityType: "spot",
        entityId: spotId,
        properties: { source_pathname: previousPath },
      });
    }
  }, [pathname]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", async (nextState) => {
      const previousState = appStateRef.current;
      appStateRef.current = nextState;

      if (nextState === "background" || nextState === "inactive") {
        backgroundAtRef.current = Date.now();
        await touchAnalyticsSession(undefined, false);
        return;
      }

      if (nextState === "active" && previousState !== "active") {
        const backgroundDuration = backgroundAtRef.current
          ? Date.now() - backgroundAtRef.current
          : 0;

        if (backgroundDuration >= BACKGROUND_SESSION_END_MS) {
          await touchAnalyticsSession(undefined, true);
          await startAnalyticsSession(normalizeScreenName(pathname));
        } else {
          await touchAnalyticsSession(undefined, false);
          if (bootedRef.current) {
            await trackAnalyticsEvent({
              eventName: "app_foregrounded",
              screenName: normalizeScreenName(pathname),
              properties: { background_duration_ms: backgroundDuration },
            });
          }
        }

        backgroundAtRef.current = null;
      }
    });

    return () => subscription.remove();
  }, [pathname]);

  return <>{children}</>;
}
