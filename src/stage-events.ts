export type StageEventFormat = "summit" | "xr-con" | "expo";
export type StageVenueLayout = "theater" | "arena" | "expo-hall";
export type StageEventStatus = "draft" | "published" | "doors-open" | "live" | "complete";
export type StageTicketTierId = "general" | "vip" | "speaker";
export type StageSeatSection = "house" | "vip";
export type StageSeatStatus = "open" | "held" | "reserved" | "checked-in" | "blocked";

export interface StageSeat {
  id: string;
  label: string;
  section: StageSeatSection;
  row: string;
  number: number;
  status: StageSeatStatus;
  guestName: string;
  tierId: Extract<StageTicketTierId, "general" | "vip">;
}

export interface StageTicketTier {
  id: StageTicketTierId;
  label: string;
  access: string;
  capacity: number;
  priceCents?: number;
  checkoutUrl?: string;
  resourceUrls?: string[];
  promoMediaUrl?: string;
  promoMediaName?: string;
}

export interface StageEventState {
  id: string;
  title: string;
  format: StageEventFormat;
  venueLayout: StageVenueLayout;
  status: StageEventStatus;
  sourceRoom: string;
  startsAt: string;
  runtimeMinutes: number;
  merchHeadline: string;
  merchProductIds: string[];
  ticketTiers: StageTicketTier[];
  seats: StageSeat[];
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
  runtimeMinutes: number;
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
    runtimeMinutes: 180,
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
    runtimeMinutes: 240,
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
    runtimeMinutes: 360,
    ticketTiers: [
      { id: "general", label: "Expo Pass", access: "Floor + showcases", capacity: 44 },
      { id: "vip", label: "Partner", access: "Lounge + hosted tour", capacity: 8 },
      { id: "speaker", label: "Exhibitor", access: "Booth + present", capacity: 12 },
    ],
  },
];

function seatId(section: StageSeatSection, row: string, number: number) {
  return `${section === "vip" ? "V" : "H"}-${row}${String(number).padStart(2, "0")}`;
}

export function createStageSeats(format: StageEventFormat, checkedInHouse = 0, checkedInVip = 0): StageSeat[] {
  const preset = stageEventPreset(format);
  const house = Array.from({ length: preset.generalSeats }, (_, index) => {
    const row = String.fromCharCode(65 + Math.floor(index / 9));
    const number = index % 9 + 1;
    return {
      id: seatId("house", row, number),
      label: `${row}${number}`,
      section: "house",
      row,
      number,
      status: index < checkedInHouse ? "checked-in" : "open",
      guestName: "",
      tierId: "general",
    } satisfies StageSeat;
  });
  const vip = Array.from({ length: preset.vipSeats }, (_, index) => {
    const number = index + 1;
    return {
      id: seatId("vip", "V", number),
      label: `V${number}`,
      section: "vip",
      row: "V",
      number,
      status: index < checkedInVip ? "checked-in" : "open",
      guestName: "",
      tierId: "vip",
    } satisfies StageSeat;
  });
  return [...vip, ...house];
}

export function stageSeatCounts(seats: StageSeat[]) {
  const status = (value: StageSeatStatus) => seats.filter((seat) => seat.status === value).length;
  return {
    capacity: seats.length,
    open: status("open"),
    held: status("held"),
    reserved: status("reserved"),
    checkedIn: status("checked-in"),
    blocked: status("blocked"),
    checkedInHouse: seats.filter((seat) => seat.section === "house" && seat.status === "checked-in").length,
    checkedInVip: seats.filter((seat) => seat.section === "vip" && seat.status === "checked-in").length,
  };
}

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
    runtimeMinutes: preset.runtimeMinutes,
    merchHeadline: "Official event collection",
    merchProductIds: [],
    ticketTiers: preset.ticketTiers.map((tier) => ({ ...tier })),
    seats: createStageSeats(preset.id),
  };
}

export function normalizeStageEvent(value: Partial<StageEventState> | undefined, room = "AMXSTAGE", legacyHouse = 0, legacyVip = 0) {
  const fallback = defaultStageEvent(room);
  const preset = STAGE_EVENT_PRESETS.find((item) => item.id === value?.format) || STAGE_EVENT_PRESETS[0];
  const validStatus = ["draft", "published", "doors-open", "live", "complete"].includes(value?.status || "");
  const validSeatStatuses: StageSeatStatus[] = ["open", "held", "reserved", "checked-in", "blocked"];
  const tiers = preset.ticketTiers.map((fallbackTier) => {
    const saved = value?.ticketTiers?.find((tier) => tier.id === fallbackTier.id);
    return {
      ...fallbackTier,
      ...saved,
      capacity: Math.max(1, Math.min(100, Math.round(Number(saved?.capacity) || fallbackTier.capacity))),
      priceCents: Math.max(0, Math.min(1_000_000, Math.round(Number(saved?.priceCents) || 0))),
      checkoutUrl: /^https:\/\//.test(String(saved?.checkoutUrl || "")) ? String(saved?.checkoutUrl).slice(0, 2048) : "",
      resourceUrls: Array.isArray(saved?.resourceUrls) ? saved.resourceUrls.filter((url) => /^https:\/\//.test(String(url))).map(String).slice(0, 8) : [],
      promoMediaUrl: /^(https:\/\/|\/api\/media\/)/.test(String(saved?.promoMediaUrl || "")) ? String(saved?.promoMediaUrl).slice(0, 2048) : "",
      promoMediaName: String(saved?.promoMediaName || "").trim().slice(0, 120),
    };
  });
  const canonicalSeats = createStageSeats(preset.id, value?.seats?.length ? 0 : legacyHouse, value?.seats?.length ? 0 : legacyVip);
  const seats = canonicalSeats.map((seat) => {
    const saved = value?.seats?.find((candidate) => candidate.id === seat.id);
    if (!saved) return seat;
    return {
      ...seat,
      status: validSeatStatuses.includes(saved.status) ? saved.status : "open",
      guestName: String(saved.guestName || "").trim().slice(0, 48),
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
    runtimeMinutes: Math.max(15, Math.min(1440, Math.round(Number(value?.runtimeMinutes) || preset.runtimeMinutes))),
    merchHeadline: String(value?.merchHeadline || fallback.merchHeadline).trim().slice(0, 80),
    merchProductIds: Array.isArray(value?.merchProductIds) ? [...new Set(value.merchProductIds.map(String).filter(Boolean))].slice(0, 6) : [],
    ticketTiers: tiers,
    seats,
  } satisfies StageEventState;
}

export function stageEventPreset(format: StageEventFormat) {
  return STAGE_EVENT_PRESETS.find((item) => item.id === format) || STAGE_EVENT_PRESETS[0];
}
