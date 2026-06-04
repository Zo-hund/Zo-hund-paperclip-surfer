import { describe, expect, it, vi } from "vitest";
import {
  createDatabaseRuntimeMonitor,
  createMutableDbProxy,
  isRecoverableDatabaseTransportError,
} from "../database-runtime.js";

describe("createMutableDbProxy", () => {
  it("forwards calls to the current db reference", async () => {
    const first = {
      async execute() {
        return "first";
      },
    };
    const second = {
      async execute() {
        return "second";
      },
    };
    const ref = { current: first as any };
    const proxy = createMutableDbProxy(ref);

    await expect((proxy as any).execute()).resolves.toBe("first");

    ref.current = second as any;
    await expect((proxy as any).execute()).resolves.toBe("second");
  });
});

describe("createDatabaseRuntimeMonitor", () => {
  it("recovers embedded postgres in-process after a transport failure", async () => {
    let healthy = false;
    const recover = vi.fn(async () => {
      healthy = true;
    });
    const monitor = createDatabaseRuntimeMonitor({
      mode: "embedded-postgres",
      probe: async () => {
        if (!healthy) {
          throw new Error("AggregateError [ECONNREFUSED]: connection refused");
        }
      },
      recover,
    });

    await monitor.runProbeNow();

    expect(recover).toHaveBeenCalledTimes(1);
    expect(monitor.getHealth()).toMatchObject({
      mode: "embedded-postgres",
      state: "healthy",
      consecutiveFailures: 0,
      recoveryInFlight: false,
      lastError: null,
    });
  });

  it("keeps recovery single-flight while one restart is already active", async () => {
    let releaseRecovery: (() => void) | null = null;
    const recover = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          releaseRecovery = resolve;
        }),
    );
    const monitor = createDatabaseRuntimeMonitor({
      mode: "embedded-postgres",
      probe: async () => {
        throw new Error("ECONNREFUSED");
      },
      recover,
    });

    const first = monitor.runProbeNow();
    await vi.waitFor(() => {
      expect(recover).toHaveBeenCalledTimes(1);
    });
    const second = monitor.runProbeNow();

    expect(monitor.getHealth().state).toBe("recovering");

    releaseRecovery?.();
    await Promise.all([first, second]);

    expect(monitor.getHealth().state).toBe("healthy");
  });

  it("degrades external postgres without attempting embedded recovery", async () => {
    const recover = vi.fn();
    const monitor = createDatabaseRuntimeMonitor({
      mode: "external-postgres",
      probe: async () => {
        throw new Error("ECONNREFUSED");
      },
      recover,
    });

    await monitor.runProbeNow();

    expect(recover).not.toHaveBeenCalled();
    expect(monitor.getHealth()).toMatchObject({
      mode: "external-postgres",
      state: "degraded",
      consecutiveFailures: 1,
    });
  });
});

describe("isRecoverableDatabaseTransportError", () => {
  it("recognizes connection-refused transport failures", () => {
    expect(isRecoverableDatabaseTransportError(new Error("AggregateError [ECONNREFUSED]"))).toBe(true);
    expect(isRecoverableDatabaseTransportError(new Error("connection terminated unexpectedly"))).toBe(true);
    expect(isRecoverableDatabaseTransportError(new Error("syntax error at or near select"))).toBe(false);
  });
});
