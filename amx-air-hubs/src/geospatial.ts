import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient, type RealtimeChannel, type SupabaseClient } from "@supabase/supabase-js";

export interface GeoCoordinate {
  latitude: number;
  longitude: number;
  altitude: number | null;
  accuracy: number;
  timestamp: string;
}

export interface GeoAnchor {
  id: string;
  roomCode: string;
  label: string;
  ownerId: string;
  latitude: number | null;
  longitude: number | null;
  altitude: number | null;
  accuracy: number | null;
  localPosition: [number, number, number];
  orientation: [number, number, number, number];
  source: "webxr" | "camera" | "map";
  persistentHandle?: string;
  createdAt: string;
  updatedAt: string;
}

type LocationStatus = "idle" | "locating" | "ready" | "denied" | "unavailable";
type AnchorPacket = { action: "upsert" | "remove"; anchor: GeoAnchor };

function isLocalHost() {
  return ["localhost", "127.0.0.1"].includes(location.hostname);
}

function storageKey(room: string) {
  return `amx_geo_anchors_${room}`;
}

function readAnchors(room: string): GeoAnchor[] {
  try { return JSON.parse(localStorage.getItem(storageKey(room)) || "[]") as GeoAnchor[]; }
  catch { return []; }
}

function saveAnchors(room: string, anchors: GeoAnchor[]) {
  localStorage.setItem(storageKey(room), JSON.stringify(anchors.slice(-80)));
}

export function projectGeoAnchor(anchor: GeoAnchor, origin: GeoCoordinate | null): [number, number, number] {
  if (!origin || anchor.latitude === null || anchor.longitude === null) return anchor.localPosition;
  const earthRadius = 6_378_137;
  const latitude = origin.latitude * Math.PI / 180;
  const north = (anchor.latitude - origin.latitude) * Math.PI / 180 * earthRadius;
  const east = (anchor.longitude - origin.longitude) * Math.PI / 180 * earthRadius * Math.cos(latitude);
  const altitude = anchor.altitude !== null && origin.altitude !== null ? anchor.altitude - origin.altitude : anchor.localPosition[1];
  return [east, altitude, -north];
}

export function useGeoAnchors(roomCode: string) {
  const room = roomCode.toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 64) || "LOCAL";
  const participantId = useMemo(() => sessionStorage.getItem("amx_participant") || crypto.randomUUID().slice(0, 8), []);
  const [anchors, setAnchors] = useState<GeoAnchor[]>(() => readAnchors(room));
  const [location, setLocation] = useState<GeoCoordinate | null>(null);
  const [locationStatus, setLocationStatus] = useState<LocationStatus>("idle");
  const [locationError, setLocationError] = useState("");
  const localRef = useRef<BroadcastChannel | null>(null);
  const realtimeRef = useRef<RealtimeChannel | null>(null);
  const supabaseRef = useRef<SupabaseClient | null>(null);
  const watchRef = useRef<number | null>(null);

  const receive = useCallback((packet: AnchorPacket) => {
    setAnchors((current) => {
      const next = packet.action === "remove"
        ? current.filter((item) => item.id !== packet.anchor.id)
        : [...current.filter((item) => item.id !== packet.anchor.id), packet.anchor].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      saveAnchors(room, next);
      return next;
    });
  }, [room]);

  useEffect(() => {
    sessionStorage.setItem("amx_participant", participantId);
    setAnchors(readAnchors(room));
    if (!isLocalHost()) {
      void fetch(`/api/anchors?room=${encodeURIComponent(room)}`)
        .then((response) => response.ok ? response.json() : Promise.reject(new Error("Anchor hydration failed")))
        .then((data: { items?: GeoAnchor[] }) => {
          if (!Array.isArray(data.items)) return;
          data.items.forEach((anchor) => receive({ action: "upsert", anchor }));
        })
        .catch(() => undefined);
    }
    const connectLocal = () => {
      if (!("BroadcastChannel" in window)) return;
      const channel = new BroadcastChannel(`amx-geo-${room}`);
      localRef.current = channel;
      channel.onmessage = (event) => receive(event.data as AnchorPacket);
    };
    const config = window.__AMX_CONFIG__;
    if (isLocalHost() || !config?.supabaseUrl || !config.supabasePublishableKey) connectLocal();
    else {
      const supabase = createClient(config.supabaseUrl, config.supabasePublishableKey, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      });
      supabaseRef.current = supabase;
      const channel = supabase.channel(`amx-geo-${room}`, { config: { broadcast: { self: false } } });
      realtimeRef.current = channel;
      channel.on("broadcast", { event: "anchor-sync" }, ({ payload }) => receive(payload as AnchorPacket)).subscribe();
    }
    return () => {
      localRef.current?.close();
      if (realtimeRef.current && supabaseRef.current) void supabaseRef.current.removeChannel(realtimeRef.current);
      if (watchRef.current !== null) navigator.geolocation?.clearWatch(watchRef.current);
      localRef.current = null;
      realtimeRef.current = null;
      supabaseRef.current = null;
    };
  }, [participantId, receive, room]);

  const requestLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setLocationStatus("unavailable");
      setLocationError("Geolocation is unavailable on this device.");
      return;
    }
    setLocationStatus("locating");
    setLocationError("");
    if (watchRef.current !== null) navigator.geolocation.clearWatch(watchRef.current);
    watchRef.current = navigator.geolocation.watchPosition(
      (position) => {
        setLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          altitude: position.coords.altitude,
          accuracy: position.coords.accuracy,
          timestamp: new Date(position.timestamp).toISOString(),
        });
        setLocationStatus("ready");
      },
      (error) => {
        setLocationStatus(error.code === error.PERMISSION_DENIED ? "denied" : "unavailable");
        setLocationError(error.message || "Location could not be resolved.");
      },
      { enableHighAccuracy: true, maximumAge: 3_000, timeout: 15_000 },
    );
  }, []);

  const sendPacket = useCallback((packet: AnchorPacket) => {
    receive(packet);
    if (realtimeRef.current) void realtimeRef.current.send({ type: "broadcast", event: "anchor-sync", payload: packet });
    else localRef.current?.postMessage(packet);
    if (!isLocalHost()) {
      const request = packet.action === "upsert"
        ? fetch("/api/anchors", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(packet.anchor) })
        : fetch(`/api/anchors/${encodeURIComponent(packet.anchor.id)}`, { method: "DELETE" });
      void request.catch(() => undefined);
    }
  }, [receive]);

  const publishAnchor = useCallback((input: Partial<GeoAnchor> & Pick<GeoAnchor, "label" | "localPosition" | "source">) => {
    const now = new Date().toISOString();
    const anchor: GeoAnchor = {
      id: input.id || crypto.randomUUID(),
      roomCode: room,
      label: input.label.slice(0, 80),
      ownerId: input.ownerId || participantId,
      latitude: input.latitude ?? location?.latitude ?? null,
      longitude: input.longitude ?? location?.longitude ?? null,
      altitude: input.altitude ?? location?.altitude ?? null,
      accuracy: input.accuracy ?? location?.accuracy ?? null,
      localPosition: input.localPosition,
      orientation: input.orientation || [0, 0, 0, 1],
      source: input.source,
      persistentHandle: input.persistentHandle,
      createdAt: input.createdAt || now,
      updatedAt: now,
    };
    sendPacket({ action: "upsert", anchor });
    return anchor;
  }, [location, participantId, room, sendPacket]);

  const removeAnchor = useCallback((anchor: GeoAnchor) => sendPacket({ action: "remove", anchor }), [sendPacket]);
  const projectedAnchors = useMemo(() => anchors.map((anchor) => ({ ...anchor, localPosition: projectGeoAnchor(anchor, location) })), [anchors, location]);

  return { anchors, projectedAnchors, location, locationStatus, locationError, participantId, requestLocation, publishAnchor, removeAnchor };
}
