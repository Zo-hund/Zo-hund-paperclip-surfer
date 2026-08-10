export type PodInviteRole = "viewer" | "participant" | "presenter";

export interface PodInvite {
  id: string;
  token: string;
  tenantId: string;
  tenantName: string;
  tenantColor: string;
  podId: string;
  roomCode: string;
  missionId: string;
  title: string;
  description: string;
  hostName: string;
  role: PodInviteRole;
  maxUses: number;
  useCount: number;
  status: "active" | "revoked" | "expired" | "full";
  expiresAt: string;
  createdAt: string;
  joinPath: string;
}

export interface CreatePodInviteInput {
  tenantId: string;
  tenantName: string;
  tenantColor: string;
  podId: string;
  roomCode: string;
  missionId: string;
  title: string;
  description: string;
  hostName: string;
  role: PodInviteRole;
  maxUses: number;
  expiresInHours: number;
}

interface InviteResponse {
  invite: PodInvite;
  ownerToken?: string;
  zkode?: string;
  requestId?: string;
  error?: string;
}

const OWNER_KEYS = "amx_pod_invite_owner_keys";
const OWNED_INVITES = "amx_owned_pod_invites";
const INVITE_ZKODES = "amx_pod_invite_zkodes";

function ownerKeys(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(OWNER_KEYS) || "{}"); }
  catch { return {}; }
}

function rememberOwnerToken(token: string, ownerToken: string) {
  localStorage.setItem(OWNER_KEYS, JSON.stringify({ ...ownerKeys(), [token]: ownerToken }));
}

function rememberZkode(token: string, zkode: string) {
  let values: Record<string, string> = {};
  try { values = JSON.parse(localStorage.getItem(INVITE_ZKODES) || "{}"); } catch { /* reset invalid local data */ }
  localStorage.setItem(INVITE_ZKODES, JSON.stringify({ ...values, [token]: zkode }));
}

export function getOwnedInviteZkode(token: string) {
  try { return (JSON.parse(localStorage.getItem(INVITE_ZKODES) || "{}") as Record<string, string>)[token] || ""; }
  catch { return ""; }
}

function ownedInvites(): Record<string, PodInvite> {
  try { return JSON.parse(localStorage.getItem(OWNED_INVITES) || "{}"); }
  catch { return {}; }
}

export function storeOwnedPodInvite(invite: PodInvite) {
  localStorage.setItem(OWNED_INVITES, JSON.stringify({ ...ownedInvites(), [invite.podId]: invite }));
  return invite;
}

export function getOwnedPodInvite(podId: string) {
  return ownedInvites()[podId];
}

async function parseResponse(response: Response): Promise<InviteResponse> {
  const body = await response.json() as InviteResponse;
  if (!response.ok) throw new Error(body.error || `Invite request failed (${response.status})`);
  return body;
}

export async function createPodInvite(input: CreatePodInviteInput) {
  const body = await parseResponse(await fetch("/api/pod-invites", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  }));
  if (body.ownerToken) rememberOwnerToken(body.invite.token, body.ownerToken);
  if (body.zkode) rememberZkode(body.invite.token, body.zkode);
  return storeOwnedPodInvite(body.invite);
}

export async function resolvePodInvite(token: string) {
  return (await parseResponse(await fetch(`/api/pod-invites/${encodeURIComponent(token)}`))).invite;
}

export async function acceptPodInvite(token: string, zkode: string, accessToken: string) {
  return (await parseResponse(await fetch(`/api/pod-invites/${encodeURIComponent(token)}/accept`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ zkode }),
  }))).invite;
}

export async function revokePodInvite(token: string) {
  const ownerToken = ownerKeys()[token];
  if (!ownerToken) throw new Error("This device does not hold the invite owner key.");
  const response = await fetch(`/api/pod-invites/${encodeURIComponent(token)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${ownerToken}` },
  });
  if (!response.ok) {
    const body = await response.json() as { error?: string };
    throw new Error(body.error || `Invite revocation failed (${response.status})`);
  }
  const stored=ownedInvites();
  const match=Object.values(stored).find((invite)=>invite.token===token);
  if(match)storeOwnedPodInvite({...match,status:"revoked"});
}

export function absoluteInviteUrl(invite: Pick<PodInvite, "joinPath">) {
  return `${window.location.origin}${invite.joinPath}`;
}

export function isStageAudiencePass(invite: Pick<PodInvite, "podId" | "role">) {
  return invite.role === "viewer" && /-(summit|xr-con|expo)-\d{4}-\d{2}-\d{2}-general$/i.test(invite.podId);
}

export function podInviteDestination(invite: Pick<PodInvite, "podId" | "roomCode" | "role" | "token">) {
  if (isStageAudiencePass(invite)) {
    const query = new URLSearchParams({ pass: invite.token, access: invite.role, source: "event-pass" });
    return `/watch/${encodeURIComponent(invite.roomCode)}?${query.toString()}`;
  }
  const query = new URLSearchParams({ invite: invite.token, room: invite.roomCode, access: invite.role });
  return `/rooms/${encodeURIComponent(invite.podId)}/lobby?${query.toString()}`;
}
