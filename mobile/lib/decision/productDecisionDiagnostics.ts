import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Updates from "expo-updates";
import { reportAnalyticsError } from "../analytics";

export type DecisionFailurePhase = "REQUEST" | "LOAD" | "DISPLAY";
export type DecisionFailure = {
  phase: DecisionFailurePhase;
  code: string;
  httpStatus: number | null;
  errorName: string;
  occurredAt: string;
  updateId: string | null;
};
const STORAGE_KEY = "@backyrd/decision/last-failure-v1";
const names = new Set(["Error", "TypeError", "ReferenceError", "RangeError", "SyntaxError", "DecisionProductUnavailableError", "FunctionsHttpError", "FunctionsFetchError", "FunctionsRelayError"]);
const machineCode = /^(?:decision_[a-z_]{1,90}|wohin_(?:query_invalid|city_unavailable|server_ranking_invalid|primary_binding_invalid))$/;

/** Only fixed machine codes, error classes and status numbers leave the catch.
 * Never serialize an Error, provider body, request, query, token or URL. */
export function classifyDecisionFailure(error: unknown, phase: DecisionFailurePhase): Pick<DecisionFailure, "phase" | "code" | "httpStatus" | "errorName"> {
  let current = error;
  let code = "decision_unexpected_client_error";
  let httpStatus: number | null = null;
  let errorName = "Error";
  const visited = new Set<unknown>();
  for (let depth = 0; depth < 4 && current && typeof current === "object" && !visited.has(current); depth++) {
    visited.add(current);
    const value = current as { name?: unknown; code?: unknown; cause?: unknown; context?: { status?: unknown } };
    if (typeof value.name === "string" && names.has(value.name)) errorName = value.name;
    if (value.name === "DecisionProductUnavailableError" && typeof value.code === "string" && machineCode.test(value.code)) code = value.code;
    if (value.name === "Error" && current instanceof Error && machineCode.test(current.message)) code = current.message;
    if (value.name === "FunctionsFetchError") code = "decision_transport_network_failure";
    if (value.name === "FunctionsRelayError") code = "decision_transport_relay_failure";
    if (value.name === "FunctionsHttpError") {
      const status = value.context?.status;
      if (typeof status === "number" && Number.isInteger(status) && status >= 400 && status <= 599) httpStatus = status;
      code = "decision_transport_http_failure";
    }
    current = value.cause;
  }
  return { phase, code, httpStatus, errorName };
}

export async function recordDecisionFailure(error: unknown, phase: DecisionFailurePhase): Promise<void> {
  const summary: DecisionFailure = { ...classifyDecisionFailure(error, phase), occurredAt: new Date().toISOString(), updateId: Updates.updateId ?? null };
  // Diagnostics must never change the request outcome, even offline.
  await Promise.allSettled([
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(summary)),
    reportAnalyticsError({ error: new Error(summary.code), errorType: "wohin_request_failed", screenName: "wohin", handled: true, context: { phase: summary.phase, code: summary.code, http_status: summary.httpStatus, error_name: summary.errorName, update_id: summary.updateId } }),
  ]);
}

export async function readLastDecisionFailure(): Promise<DecisionFailure | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object") return null;
    const row = value as DecisionFailure;
    const time = Date.parse(row.occurredAt);
    if (!["REQUEST", "LOAD", "DISPLAY"].includes(row.phase) || typeof row.code !== "string" || !machineCode.test(row.code) || !names.has(row.errorName) || !Number.isFinite(time) || time > Date.now() || Date.now() - time > 86_400_000) return null;
    return { phase: row.phase, code: row.code, errorName: row.errorName, httpStatus: typeof row.httpStatus === "number" && row.httpStatus >= 400 && row.httpStatus <= 599 ? row.httpStatus : null, occurredAt: row.occurredAt, updateId: typeof row.updateId === "string" && /^[0-9a-f-]{36}$/i.test(row.updateId) ? row.updateId : null };
  } catch { return null; }
}
