export interface MemberAvatarPreset {
  id: string;
  label: string;
  url: string;
}

export const MEMBER_AVATAR_PRESETS: MemberAvatarPreset[] = [
  { id: "zohund", label: "ZOHUND Guide", url: "/models/zohund-avatar.glb" },
  { id: "mario", label: "Mario MXBC", url: "/models/avatars/mario-mxbc/avatar.gltf" },
  { id: "actor-one", label: "Actor One", url: "/models/avatars/actor-one/avatar.gltf" },
  { id: "mr-lamont", label: "Mr. Lamont", url: "/models/avatars/mr-lamont/avatar.gltf" },
];

const PRESET_URLS = new Set(MEMBER_AVATAR_PRESETS.map((preset) => preset.url));

export function normalizeMemberAvatarUrl(value: unknown) {
  const candidate = String(value || "").trim().slice(0, 500);
  if (!candidate) return null;
  if (PRESET_URLS.has(candidate)) return candidate;
  try {
    const url = new URL(candidate);
    if (url.protocol !== "https:" || url.hostname !== "models.readyplayer.me") return null;
    if (!/^\/[A-Za-z0-9_-]+\.glb$/.test(url.pathname)) return null;
    for (const key of url.searchParams.keys()) if (!/^[A-Za-z0-9_]+$/.test(key)) return null;
    return url.toString().slice(0, 500);
  } catch {
    return null;
  }
}

export function memberAvatarPreset(value: unknown) {
  const url = normalizeMemberAvatarUrl(value);
  return MEMBER_AVATAR_PRESETS.find((preset) => preset.url === url) || null;
}
