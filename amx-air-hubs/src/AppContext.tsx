import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Mission, Role } from "./data";
import { agents, missions } from "./data";
import { addXP, getBadges, getXP, type ProofRecord } from "./platform";
import { syncOfflineQueue } from "./operations";

export interface AccessibilitySettings {
  captions: boolean;
  reducedMotion: boolean;
  highContrast: boolean;
  textOnlyMode: boolean;
  audioEnabled: boolean;
  largeButtons: boolean;
  youthMode: boolean;
}

interface AppState {
  role: Role;
  setRole: (role: Role) => void;
  selectedAgentId: string;
  setSelectedAgentId: (id: string) => void;
  activeMission: Mission;
  setActiveMissionId: (id: string) => void;
  xp: number;
  grantXP: (amount: number) => void;
  badges: string[];
  refreshRewards: () => void;
  latestProof: ProofRecord | null;
  setLatestProof: (proof: ProofRecord | null) => void;
  settings: AccessibilitySettings;
  updateSettings: (value: Partial<AccessibilitySettings>) => void;
}

const Context = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [role, setRole] = useState<Role>(() => (localStorage.getItem("amx_role") as Role) || "Learner");
  const [selectedAgentId, setAgent] = useState(() => localStorage.getItem("amx_agent") || "jaz");
  const [activeMissionId, setMission] = useState(() => localStorage.getItem("amx_mission") || "xrt-green-mode");
  const [xp, setXP] = useState(getXP);
  const [badges, setBadges] = useState(getBadges);
  const [latestProof, setLatestProof] = useState<ProofRecord | null>(null);
  const [settings, setSettings] = useState<AccessibilitySettings>(() => {
    try { return JSON.parse(localStorage.getItem("amx_accessibility") || ""); }
    catch { return { captions: true, reducedMotion: false, highContrast: false, textOnlyMode: false, audioEnabled: true, largeButtons: false, youthMode: false }; }
  });

  useEffect(() => {
    document.documentElement.classList.toggle("high-contrast", Boolean(settings.highContrast));
    document.documentElement.classList.toggle("reduced-motion", Boolean(settings.reducedMotion));
    document.documentElement.classList.toggle("large-controls", Boolean(settings.largeButtons));
    document.documentElement.classList.toggle("youth-mode", Boolean(settings.youthMode));
  }, [settings]);

  useEffect(() => {
    const sync = () => { void syncOfflineQueue(); };
    window.addEventListener("online", sync);
    if (navigator.onLine) sync();
    return () => window.removeEventListener("online", sync);
  }, []);

  const value = useMemo<AppState>(() => ({
    role,
    setRole: (value) => { setRole(value); localStorage.setItem("amx_role", value); },
    selectedAgentId,
    setSelectedAgentId: (value) => { setAgent(value); localStorage.setItem("amx_agent", value); },
    activeMission: missions.find((mission) => mission.id === activeMissionId) || missions[0],
    setActiveMissionId: (value) => { setMission(value); localStorage.setItem("amx_mission", value); },
    xp,
    grantXP: (amount) => setXP(addXP(amount)),
    badges,
    refreshRewards: () => setBadges(getBadges()),
    latestProof,
    setLatestProof,
    settings,
    updateSettings: (patch) => {
      setSettings((current) => {
        const next = { ...current, ...patch };
        localStorage.setItem("amx_accessibility", JSON.stringify(next));
        return next;
      });
    },
  }), [role, selectedAgentId, activeMissionId, xp, badges, latestProof, settings]);

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useAMX() {
  const value = useContext(Context);
  if (!value) throw new Error("useAMX must be used inside AppProvider");
  return value;
}

export function useSelectedAgent() {
  const { selectedAgentId } = useAMX();
  return agents.find((agent) => agent.id === selectedAgentId) || agents[0];
}
