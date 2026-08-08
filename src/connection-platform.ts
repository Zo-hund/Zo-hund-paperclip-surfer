import { getMemberDataClient } from "./member-auth";

export type ConnectionKind = "api" | "oauth" | "mcp" | "plugin" | "skill" | "webhook";
export type ConnectionStatus = "active" | "inactive" | "error";

export interface PlatformConnection {
  id: string;
  tenant_id: string;
  name: string;
  provider: string;
  kind: ConnectionKind;
  status: ConnectionStatus;
  endpoint_url: string | null;
  scopes: string[];
  secret_configured: boolean;
  last_tested_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface ConnectionHistory {
  id: string;
  connection_id: string;
  action: string;
  from_status: ConnectionStatus | null;
  to_status: ConnectionStatus;
  detail: string;
  created_at: string;
}

export async function loadConnections(tenantId: string) {
  const client = await getMemberDataClient();
  const [{ data, error }, history] = await Promise.all([
    client.from("platform_connections").select("*").eq("tenant_id", tenantId).order("updated_at", { ascending: false }),
    client.from("platform_connection_history").select("*").eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(100),
  ]);
  if (error) throw error;
  if (history.error) throw history.error;
  return { connections: (data || []) as PlatformConnection[], history: (history.data || []) as ConnectionHistory[] };
}

export async function saveConnection(input: {
  id?: string;
  tenantId: string;
  name: string;
  provider: string;
  kind: ConnectionKind;
  endpointUrl?: string;
  scopes?: string[];
  secret?: string;
  status?: ConnectionStatus;
}) {
  const client = await getMemberDataClient();
  const { data, error } = await client.rpc("upsert_platform_connection", {
    connection_id: input.id || null,
    target_tenant_id: input.tenantId,
    connection_name: input.name,
    connection_provider: input.provider,
    connection_kind: input.kind,
    connection_endpoint_url: input.endpointUrl || null,
    connection_scopes: input.scopes || [],
    connection_secret: input.secret || null,
    connection_status: input.status || "inactive",
  });
  if (error) throw error;
  return data as string;
}

export async function setConnectionStatus(id: string, status: ConnectionStatus) {
  const client = await getMemberDataClient();
  const { error } = await client.from("platform_connections").update({ status }).eq("id", id);
  if (error) throw error;
}
