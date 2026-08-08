import { useCallback, useEffect, useRef, useState } from "react";
import { importLibrary, setOptions } from "@googlemaps/js-api-loader";
import { Bot, Crosshair, LoaderCircle, MapPin, Navigation, Search, Send } from "lucide-react";
import { sendAgentRequest } from "./agent-runtime";
import type { Agent } from "./data";

export interface MapLocationSelection {
  label: string;
  address: string;
  latitude: number;
  longitude: number;
  zoom: number;
  selectedAt: string;
  agentContext?: string;
  agentTransport?: "local" | "remote";
}

interface Props {
  agent: Agent;
  roomCode: string;
  onSelection: (location: MapLocationSelection) => void;
  onPublishAnchor: (location: MapLocationSelection) => void;
}

let configuredKey = "";

async function mapsConfig() {
  let runtime: { configured?: boolean; apiKey?: string } = {};
  try {
    const response = await fetch("/api/maps/config", { headers: { Accept: "application/json" } });
    if (response.ok) runtime = await response.json() as typeof runtime;
  } catch { /* Vite local runtime uses the build-time fallback. */ }
  const fallback = String((import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env?.VITE_GOOGLE_MAPS_API_KEY || "");
  return runtime.apiKey || fallback;
}

export function GoogleLocationPanel({ agent, roomCode, onSelection, onPublishAnchor }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markerRef = useRef<google.maps.Marker | null>(null);
  const geocoderRef = useRef<google.maps.Geocoder | null>(null);
  const [query, setQuery] = useState("");
  const [selection, setSelection] = useState<MapLocationSelection | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "setup" | "error">("loading");
  const [message, setMessage] = useState("Loading Google Maps...");
  const [agentState, setAgentState] = useState<"idle" | "working" | "complete" | "error">("idle");

  const selectPoint = useCallback(async (position: google.maps.LatLngLiteral, label?: string) => {
    const map = mapRef.current;
    const geocoder = geocoderRef.current;
    if (!map || !geocoder) return;
    markerRef.current?.setPosition(position);
    map.panTo(position);
    let address = label || `${position.lat.toFixed(6)}, ${position.lng.toFixed(6)}`;
    try {
      const result = await geocoder.geocode({ location: position });
      address = result.results[0]?.formatted_address || address;
    } catch { /* Coordinates remain valid if reverse geocoding is unavailable. */ }
    const next: MapLocationSelection = {
      label: label || address.split(",")[0] || "Selected location",
      address,
      latitude: position.lat,
      longitude: position.lng,
      zoom: map.getZoom() || 15,
      selectedAt: new Date().toISOString(),
    };
    setSelection(next);
    onSelection(next);
    setMessage("Location linked to the Nexus world panel");
  }, [onSelection]);

  useEffect(() => {
    let cancelled = false;
    let clickListener: google.maps.MapsEventListener | undefined;
    void mapsConfig().then(async (apiKey) => {
      if (!apiKey) {
        setState("setup");
        setMessage("Add a restricted Google Maps browser key to enable the live map");
        return;
      }
      try {
        if (!configuredKey) {
          setOptions({ key: apiKey, v: "weekly", authReferrerPolicy: "origin" });
          configuredKey = apiKey;
        }
        const [{ Map }, { Geocoder }] = await Promise.all([
          importLibrary("maps") as Promise<google.maps.MapsLibrary>,
          importLibrary("geocoding") as Promise<google.maps.GeocodingLibrary>,
        ]);
        if (cancelled || !hostRef.current) return;
        const center = { lat: 41.8781, lng: -87.6298 };
        const map = new Map(hostRef.current, {
          center,
          zoom: 10,
          mapTypeControl: true,
          streetViewControl: false,
          fullscreenControl: true,
          clickableIcons: true,
          gestureHandling: "greedy",
        });
        mapRef.current = map;
        geocoderRef.current = new Geocoder();
        markerRef.current = new google.maps.Marker({ map, position: center, title: "Nexus selected location" });
        clickListener = map.addListener("click", (event: google.maps.MapMouseEvent) => {
          const position = event.latLng?.toJSON();
          if (position) void selectPoint(position);
        });
        setState("ready");
        setMessage("Search, click the map, or use your current position");
      } catch (error) {
        if (cancelled) return;
        setState("error");
        setMessage(error instanceof Error ? error.message : "Google Maps could not load");
      }
    });
    return () => {
      cancelled = true;
      clickListener?.remove();
      markerRef.current?.setMap(null);
      markerRef.current = null;
      mapRef.current = null;
      geocoderRef.current = null;
    };
  }, [selectPoint]);

  const search = async () => {
    const geocoder = geocoderRef.current;
    if (!geocoder || !query.trim()) return;
    setMessage("Resolving location...");
    try {
      const result = await geocoder.geocode({ address: query.trim() });
      const match = result.results[0];
      if (!match) throw new Error("No matching location found");
      const position = match.geometry.location.toJSON();
      mapRef.current?.setZoom(15);
      await selectPoint(position, match.formatted_address.split(",")[0]);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Location search failed");
    }
  };

  const locate = () => {
    if (!navigator.geolocation) {
      setMessage("Geolocation is unavailable on this device");
      return;
    }
    setMessage("Requesting device location...");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        mapRef.current?.setZoom(17);
        void selectPoint({ lat: position.coords.latitude, lng: position.coords.longitude }, "Current location");
      },
      (error) => setMessage(error.message || "Device location could not be resolved"),
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 3_000 },
    );
  };

  const askAgent = async () => {
    if (!selection) return;
    setAgentState("working");
    try {
      const response = await sendAgentRequest(agent, `Build a concise operational and training context brief for the selected real-world location. Explain useful exploration, workshop, simulation, and digital-twin tasks without inventing live facts. Room: ${roomCode}. Location: ${selection.address}. Coordinates: ${selection.latitude}, ${selection.longitude}. Map zoom: ${selection.zoom}.`, [], "text");
      const next = { ...selection, agentContext: response.text, agentTransport: response.transport };
      setSelection(next);
      onSelection(next);
      setAgentState("complete");
    } catch {
      setAgentState("error");
    }
  };

  return <section className="nexus-content-module map-module">
    <div className="content-module-head"><div><span className="eyebrow">PANEL 03 / MAP + AGENT</span><h3>Google location context</h3></div><span className={`content-state ${state}`}><i/>{state}</span></div>
    <div className="google-map-frame"><div className={`google-map-host ${state}`} ref={hostRef}/>{state !== "ready" && <div className="google-map-state"><MapPin/><b>{state === "setup" ? "MAP KEY REQUIRED" : state === "loading" ? "LOADING MAP" : "MAP UNAVAILABLE"}</b></div>}</div>
    <div className="map-search-row"><Search/><input aria-label="Search Google Maps" value={query} disabled={state !== "ready"} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void search(); }} placeholder="Search address or place"/><button onClick={() => void search()} disabled={state !== "ready" || !query.trim()} title="Search location"><Send/></button><button onClick={locate} disabled={state !== "ready"} title="Use current location"><Navigation/></button></div>
    {selection && <div className="map-selection"><MapPin/><span><b>{selection.label}</b><small>{selection.address}</small><code>{selection.latitude.toFixed(6)}, {selection.longitude.toFixed(6)}</code></span></div>}
    <div className="map-context-actions"><button onClick={() => selection && onPublishAnchor(selection)} disabled={!selection}><Crosshair/>Publish anchor</button><button onClick={() => void askAgent()} disabled={!selection || agentState === "working"}>{agentState === "working" ? <LoaderCircle className="spin"/> : <Bot/>}{agentState === "working" ? "Briefing" : `Ask ${agent.name}`}</button></div>
    {selection?.agentContext && <output className="map-agent-context"><span><Bot/>{agent.name} / {selection.agentTransport}</span><p>{selection.agentContext}</p></output>}
    <p>{message}</p>
  </section>;
}
