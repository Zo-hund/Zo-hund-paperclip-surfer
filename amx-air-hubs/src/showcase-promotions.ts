import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient, type RealtimeChannel } from "@supabase/supabase-js";
import type { MetaverseEventType, MetaverseMode } from "./metaverse-session";

export type ShowcasePromotionStatus = "pending" | "approved" | "declined";

export interface ShowcasePromotion {
  id: string;
  roomCode: string;
  title: string;
  mode: MetaverseMode;
  eventType: MetaverseEventType;
  organizationId: string;
  organizationName: string;
  organizationTags: string[];
  deliverableId: string;
  deliverableRevision: number;
  requestedBy: string;
  requestedAt: number;
  status: ShowcasePromotionStatus;
  reviewedAt?: number;
}

type PromotionPacket = { type: "promotion-submit" | "promotion-review"; promotion: ShowcasePromotion }
  | { type: "promotion-query"; requesterId: string }
  | { type: "promotion-state"; promotions: ShowcasePromotion[] };

const STORAGE_KEY = "amx_showcase_promotions_v1";
const CHANNEL_NAME = "amx-stage-promotions-v1";

function storedPromotions() {
  try {
    const values = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]") as ShowcasePromotion[];
    return Array.isArray(values) ? values.filter((item) => item?.id && item?.roomCode).slice(-60) : [];
  } catch {
    return [];
  }
}

function mergePromotion(values: ShowcasePromotion[], promotion: ShowcasePromotion) {
  const index = values.findIndex((item) => item.id === promotion.id);
  const next = index < 0 ? [...values, promotion] : values.map((item, itemIndex) => itemIndex === index ? promotion : item);
  return next.sort((left, right) => right.requestedAt - left.requestedAt).slice(0, 60);
}

export function useShowcasePromotions() {
  const participantId = useMemo(() => sessionStorage.getItem("amx_promotion_participant") || crypto.randomUUID().slice(0, 8), []);
  const [promotions, setPromotions] = useState<ShowcasePromotion[]>(storedPromotions);
  const [transport, setTransport] = useState<"connecting" | "websocket" | "local mesh" | "offline">("connecting");
  const realtimeRef = useRef<RealtimeChannel | null>(null);
  const localRef = useRef<BroadcastChannel | null>(null);
  const promotionsRef = useRef(promotions);
  useEffect(() => { promotionsRef.current = promotions; }, [promotions]);

  const receive = useCallback((packet: PromotionPacket) => {
    if (packet?.type === "promotion-query") {
      const response: PromotionPacket = { type: "promotion-state", promotions: promotionsRef.current };
      if (realtimeRef.current) void realtimeRef.current.send({ type: "broadcast", event: "promotion", payload: response });
      else localRef.current?.postMessage(response);
      return;
    }
    if (packet?.type === "promotion-state") {
      setPromotions((current) => {
        const next = packet.promotions.reduce(mergePromotion, current);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        return next;
      });
      return;
    }
    if (!packet?.promotion?.id) return;
    setPromotions((current) => {
      const next = mergePromotion(current, packet.promotion);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  useEffect(() => {
    sessionStorage.setItem("amx_promotion_participant", participantId);
    const config = window.__AMX_CONFIG__;
    if (!config?.supabaseUrl || !config.supabasePublishableKey || ["localhost", "127.0.0.1"].includes(location.hostname)) {
      if (!("BroadcastChannel" in window)) { setTransport("offline"); return; }
      const channel = new BroadcastChannel(CHANNEL_NAME);
      channel.onmessage = (event) => receive(event.data as PromotionPacket);
      localRef.current = channel;
      setTransport("local mesh");
      channel.postMessage({ type: "promotion-query", requesterId: participantId } satisfies PromotionPacket);
      return () => { channel.close(); localRef.current = null; };
    }
    const supabase = createClient(config.supabaseUrl, config.supabasePublishableKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
    const channel = supabase.channel(CHANNEL_NAME, { config: { broadcast: { self: false }, presence: { key: participantId } } });
    realtimeRef.current = channel;
    channel.on("broadcast", { event: "promotion" }, ({ payload }) => receive(payload as PromotionPacket)).subscribe((status) => {
      if (status === "SUBSCRIBED") {
        setTransport("websocket");
        void channel.send({ type: "broadcast", event: "promotion", payload: { type: "promotion-query", requesterId: participantId } satisfies PromotionPacket });
      }
      else if (["CHANNEL_ERROR", "TIMED_OUT", "CLOSED"].includes(status)) setTransport("offline");
    });
    return () => { void supabase.removeChannel(channel); realtimeRef.current = null; };
  }, [participantId, receive]);

  const publish = useCallback((packet: PromotionPacket) => {
    receive(packet);
    if (realtimeRef.current) void realtimeRef.current.send({ type: "broadcast", event: "promotion", payload: packet });
    else localRef.current?.postMessage(packet);
  }, [receive]);

  const submit = useCallback((value: Omit<ShowcasePromotion, "id" | "requestedAt" | "status">) => {
    const promotion: ShowcasePromotion = { ...value, id: crypto.randomUUID(), requestedAt: Date.now(), status: "pending" };
    publish({ type: "promotion-submit", promotion });
    return promotion;
  }, [publish]);

  const review = useCallback((id: string, status: Extract<ShowcasePromotionStatus, "approved" | "declined">) => {
    const current = promotions.find((item) => item.id === id);
    if (!current) return null;
    const promotion = { ...current, status, reviewedAt: Date.now() } satisfies ShowcasePromotion;
    publish({ type: "promotion-review", promotion });
    return promotion;
  }, [promotions, publish]);

  return { promotions, pending: promotions.filter((item) => item.status === "pending"), transport, submit, review };
}
