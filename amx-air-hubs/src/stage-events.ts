export type StageEventFormat = "summit" | "xr-con" | "expo";
export type StageVenueLayout = "theater" | "arena" | "expo-hall";
export type StageEventStatus = "draft" | "published" | "doors-open" | "live" | "complete";
export type StageTicketTierId = "general" | "vip" | "speaker";

export interface StageTicketTier {
  id: StageTicketTierId;
  label: string;
  access: string;
  capacity: number;
}

export interface StageEventState {
  id: string;
  title: string;
  format: StageEventFormat;
  venueLayout: StageVenueLayout;
  status: StageEventStatus;
  sourceRoom: string;
  startsAt: string;
  ticketTiers: StageTicketTier[];
}

export interface StageEventPreset {
  id: StageEventFormat;
  label: string;
  detail: string;
  venueLayout: StageVenueLayout;
  generalSeats: number;
  vipSeats: number;
  accent: string;
  defaultTitle: string;
  ticketTiers: StageTicketTier[];
}

export const STAGE_EVENT_PRESETS: StageEventPreset[] = [
  {
    id: "summit",
    label: "Summit",
    detail: "Keynotes + breakouts",
    venueLayout: "theater",
    generalSeats: 36,
    vipSeats: 8,
    accent: "#55e6ff",
    defaultTitle: "AMX Future Skills Summit",
    ticketTiers: [
      { id: "general", label: "General", access: "Main stage + Pods", capacity: 36 },
      { id: "vip", label: "VIP", access: "Front row + lounge", capacity: 8 },
      { id: "speaker", label: "Speaker", access: "Backstage + present", capacity: 8 },
    ],
  },
  {
    id: "xr-con",
    label: "XR Con",
    detail: "Demos + creator stage",
    venueLayout: "arena",
    generalSeats: 32,
    vipSeats: 8,
    accent: "#ff63de",
    defaultTitle: "AMX XR Con",
    ticketTiers: [
      { id: "general", label: "Explorer", access: "Expo + creator stage", capacity: 32 },
      { id: "vip", label: "Creator VIP", access: "Priority demos + lounge", capacity: 8 },
      { id: "speaker", label: "Creator", access: "Green room + present", capacity: 10 },
    ],
  },
  {
    id: "expo",
    label: "Expo",
    detail: "Booths + showcases",
    venueLayout: "expo-hall",
    generalSeats: 24,
    vipSeats: 4,
    accent: "#79eea8",
    defaultTitle: "AMX Innovation Expo",
    ticketTiers: [
      { id: "general", label: "Expo Pass", access: "Floor + showcases", capacity: 44 },
      { id: "vip", label: "Partner", access: "Lounge + hosted tour", capacity: 8 },
      { id: "speaker", label: "Exhibitor", access: "Booth + present", capacity: 12 },
    ],
  },
];

export function defaultStageEvent(room = "AMXSTAGE"): StageEventState {
  const preset = STAGE_EVENT_PRESETS[0];
  const startsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  startsAt.setMinutes(0, 0, 0);
  return {
    id: `event-${room.toLowerCase()}`,
    title: preset.defaultTitle,
    format: preset.id,
    venueLayout: preset.venueLayout,
    status: "draft",
    sourceRoom: "AMX-MAIN",
    startsAt: startsAt.toISOString(),
    ticketTiers: preset.ticketTiers.map((tier) => ({ ...tier })),
  };
}

export function normalizeStageEvent(value: Partial<StageEventState> | undefined, room = "AMXSTAGE") {
  const fallback = defaultStageEvent(room);
  const preset = STAGE_EVENT_PRESETS.find((item) => item.id === value?.format) || STAGE_EVENT_PRESETS[0];
  const validStatus = ["draft", "published", "doors-open", "live", "complete"].includes(value?.status || "");
  const tiers = preset.ticketTiers.map((fallbackTier) => {
    const saved = value?.ticketTiers?.find((tier) => tier.id === fallbackTier.id);
    return {
      ...fallbackTier,
      ...saved,
      capacity: Math.max(1, Math.min(100, Math.round(Number(saved?.capacity) || fallbackTier.capacity))),
    };
  });
  const sourceRoom = String(value?.sourceRoom || fallback.sourceRoom).toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 24) || fallback.sourceRoom;
  return {
    ...fallback,
    ...value,
    format: preset.id,
    venueLayout: ["theater", "arena", "expo-hall"].includes(value?.venueLayout || "") ? value!.venueLayout! : preset.venueLayout,
    status: validStatus ? value!.status! : "draft",
    title: String(value?.title || preset.defaultTitle).trim().slice(0, 72),
    sourceRoom,
    startsAt: value?.startsAt && !Number.isNaN(Date.parse(value.startsAt)) ? value.startsAt : fallback.startsAt,
    ticketTiers: tiers,
  } satisfies StageEventState;
}

export function stageEventPreset(format: StageEventFormat) {
  return STAGE_EVENT_PRESETS.find((item) => item.id === format) || STAGE_EVENT_PRESETS[0];
}
