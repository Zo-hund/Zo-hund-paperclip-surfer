export interface AvatarPreset {
  id: string;
  label: string;
  url: string;
}

export const AVATAR_PRESETS: AvatarPreset[] = [
  { id: "zohund", label: "ZOHUND", url: "/models/zohund-avatar.glb" },
  { id: "mario-mxbc", label: "Mario MXBC", url: "/models/avatars/mario-mxbc/avatar.gltf" },
  { id: "actor-one", label: "Actor One", url: "/models/avatars/actor-one/avatar.gltf" },
  { id: "mr-lamont", label: "Mr Lamont", url: "/models/avatars/mr-lamont/avatar.gltf" },
];

export const DEFAULT_NEXUS_AVATAR_URL = AVATAR_PRESETS[0].url;
