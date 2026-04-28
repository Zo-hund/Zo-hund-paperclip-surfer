import { DEFAULT_CODEX_LOCAL_MODEL } from "@paperclipai/adapter-codex-local";
import { DEFAULT_GEMINI_LOCAL_MODEL } from "@paperclipai/adapter-gemini-local";

export type PreferredLocalAdapterType =
  | "opencode_local"
  | "codex_local"
  | "gemini_local"
  | "claude_local";

export interface LocalAdapterCandidate {
  type: PreferredLocalAdapterType;
  label: string;
}

export const LOCAL_ADAPTER_FALLBACK_ORDER: LocalAdapterCandidate[] = [
  { type: "opencode_local", label: "OpenCode" },
  { type: "codex_local", label: "Codex" },
  { type: "gemini_local", label: "Gemini CLI" },
  { type: "claude_local", label: "Claude Code" },
];

export const DEFAULT_ONBOARDING_ADAPTER: PreferredLocalAdapterType = "opencode_local";

export function getAdapterLabel(type: PreferredLocalAdapterType): string {
  return LOCAL_ADAPTER_FALLBACK_ORDER.find((entry) => entry.type === type)?.label ?? type;
}

export function getDefaultModelForAdapter(type: PreferredLocalAdapterType): string {
  switch (type) {
    case "codex_local":
      return DEFAULT_CODEX_LOCAL_MODEL;
    case "gemini_local":
      return DEFAULT_GEMINI_LOCAL_MODEL;
    default:
      return "";
  }
}
