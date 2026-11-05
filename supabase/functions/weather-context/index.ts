import { createClient } from "npm:@supabase/supabase-js@2.95.3";
import { consumeLaunchCostBoundary } from "../_shared/launch-cost-boundary.ts";
import { WeatherKitService } from "../_shared/weatherkit.ts";
import { createWeatherHandler } from "../_shared/weather-handler.ts";

const teamId = Deno.env.get("WEATHERKIT_TEAM_ID"), keyId = Deno.env.get("WEATHERKIT_KEY_ID"), serviceId = Deno.env.get("WEATHERKIT_SERVICE_ID"), privateKey = Deno.env.get("WEATHERKIT_PRIVATE_KEY");
const weather = new WeatherKitService(Deno.env.get("WEATHERKIT_ENABLED") === "true" && teamId && keyId && serviceId && privateKey ? { teamId, keyId, serviceId, privateKey } : null);

const url = Deno.env.get("SUPABASE_URL"), key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const admin = url && key ? createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } }) : null;
Deno.serve(createWeatherHandler({
  async actorForToken(token) {
    if (!admin) throw new Error("weather_unavailable");
    const { data, error } = await admin.auth.getUser(token);
    return error ? null : data.user?.id ?? null;
  },
  async consume(actor) {
    if (!admin) return "UNAVAILABLE";
    const result = await consumeLaunchCostBoundary(admin, { operation: "weather_context", subjectKey: actor,
      subjectMinute: 10, subjectDay: 120, globalMinute: 120, globalDay: 6000 });
    return result.allowed ? "ALLOWED" : result.reason;
  },
  weather: (city, at) => weather.get(city, at),
}));
