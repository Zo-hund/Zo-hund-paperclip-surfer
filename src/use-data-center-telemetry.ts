import { useEffect, useState } from "react";
import type { LiveDataCenterTelemetry } from "./data-center-twin";

interface TelemetryResponse {
  item: LiveDataCenterTelemetry | null;
}

export function useDataCenterTelemetry(tenantId: string) {
  const [telemetry, setTelemetry] = useState<LiveDataCenterTelemetry | null>(null);

  useEffect(() => {
    let active = true;
    let timer = 0;
    const refresh = async () => {
      try {
        const response = await fetch(`/api/telemetry/data-center?tenantId=${encodeURIComponent(tenantId)}`, { headers: { Accept: "application/json" } });
        if (!response.ok) throw new Error(`Telemetry request failed (${response.status})`);
        const payload = await response.json() as TelemetryResponse;
        if (active) setTelemetry(payload.item || null);
      } catch {
        if (active) setTelemetry(null);
      } finally {
        if (active) timer = window.setTimeout(refresh, 15_000);
      }
    };
    setTelemetry(null);
    void refresh();
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [tenantId]);

  return telemetry;
}
