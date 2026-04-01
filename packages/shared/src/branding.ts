/**
 * AMX LABS Branding Registry
 * Futuristic Professional experience constants
 * Powered by AMX-AIR-HUBS
 */

export const BRAND = {
  name: "AMX LABS",
  provider: "AMX-AIR-HUBS",
  aesthetic: "futuristic-professional" as const,
  colors: {
    primary: "oklch(0.627 0.265 264.376)", // AMX Electric Blue
    accent: "oklch(0.696 0.17 162.48)", // Futuristic Teal
  },
} as const;

export const APP_TITLE = `${BRAND.name} powered by ${BRAND.provider}`;
