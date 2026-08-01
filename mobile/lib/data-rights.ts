// mobile/lib/data-rights.ts

import { supabase } from "./supabase";

export type DataRightsRequest = {
  request_id: string;
  request_type: "data_export" | "account_deletion";
  status:
    | "requested"
    | "processing"
    | "ready"
    | "scheduled"
    | "completed"
    | "cancelled"
    | "rejected"
    | "failed";
  requested_at: string;
  scheduled_for: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  export_expires_at: string | null;
  failure_code: string | null;
  user_note: string | null;
  updated_at: string;
};

export async function getMyDataRightsRequests() {
  const { data, error } = await supabase.rpc(
    "get_my_data_rights_requests_v1",
  );

  if (error) throw error;
  return (Array.isArray(data) ? data : []) as DataRightsRequest[];
}

export async function requestMyDataExport() {
  const { data, error } = await supabase.rpc(
    "request_my_data_export_v1",
  );

  if (error) throw error;
  return data as string;
}

export async function generateMyDataExport() {
  const { data, error } = await supabase.functions.invoke(
    "generate-data-export",
    { body: {} },
  );

  if (error) throw error;
  return data as {
    ok: boolean;
    request_id: string;
    status: string;
    download_url: string;
    expires_at: string;
    size_bytes: number;
    warnings: string[];
  };
}

export async function requestMyAccountDeletion(userNote?: string) {
  const { data, error } = await supabase.rpc(
    "request_my_account_deletion_v1",
    { p_user_note: userNote?.trim() || null },
  );

  if (error) throw error;
  return (Array.isArray(data) ? data[0] : data) as {
    request_id: string;
    scheduled_for: string;
  };
}

export async function cancelMyAccountDeletion() {
  const { data, error } = await supabase.rpc(
    "cancel_my_account_deletion_v1",
  );

  if (error) throw error;
  return data === true;
}
