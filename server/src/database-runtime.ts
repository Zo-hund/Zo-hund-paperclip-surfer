import type { Db } from "@paperclipai/db";

export type DatabaseRuntimeMode = "embedded-postgres" | "external-postgres";
export type DatabaseHealthState = "healthy" | "degraded" | "recovering" | "unavailable";

export type DatabaseHealthSnapshot = {
  mode: DatabaseRuntimeMode;
  state: DatabaseHealthState;
  lastSuccessfulProbeAt: string | null;
  lastProbeFailureAt: string | null;
  lastRecoveryStartedAt: string | null;
  lastRecoveryCompletedAt: string | null;
  consecutiveFailures: number;
  recoveryInFlight: boolean;
  lastError: string | null;
  port?: number | null;
};

type LoggerLike = {
  info?: (context: unknown, message?: string) => void;
  warn?: (context: unknown, message?: string) => void;
  error?: (context: unknown, message?: string) => void;
};

type DatabaseRuntimeMonitorOptions = {
  mode: DatabaseRuntimeMode;
  probe: () => Promise<void>;
  recover?: () => Promise<void>;
  intervalMs?: number;
  logger?: LoggerLike;
  now?: () => Date;
  port?: () => number | null;
};

type MutableDbRef = {
  current: Db;
};

function toErrorMessage(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === "string") return err;
  return String(err ?? "unknown error");
}

export function closeDbClient(db: Db): Promise<void> {
  const client = (db as Db & { $client?: { end?: () => Promise<void> | void } }).$client;
  if (!client?.end) {
    return Promise.resolve();
  }
  return Promise.resolve(client.end()).catch(() => {});
}

export function createMutableDbProxy(ref: MutableDbRef): Db {
  return new Proxy({} as Db, {
    get(_target, prop, _receiver) {
      const current = ref.current as unknown as Record<PropertyKey, unknown>;
      const value = Reflect.get(current, prop, current);
      return typeof value === "function" ? value.bind(current) : value;
    },
    has(_target, prop) {
      return prop in (ref.current as unknown as Record<PropertyKey, unknown>);
    },
    ownKeys() {
      return Reflect.ownKeys(ref.current as unknown as Record<PropertyKey, unknown>);
    },
    getOwnPropertyDescriptor(_target, prop) {
      return Object.getOwnPropertyDescriptor(ref.current as unknown as Record<PropertyKey, unknown>, prop);
    },
  });
}

export function isRecoverableDatabaseTransportError(err: unknown): boolean {
  const message = toErrorMessage(err).toUpperCase();
  return (
    message.includes("ECONNREFUSED") ||
    message.includes("CONNECTION TERMINATED") ||
    message.includes("CONNECTION CLOSED") ||
    message.includes("READ ECONNRESET") ||
    message.includes("WRITE ECONNRESET") ||
    message.includes("THE DATABASE SYSTEM IS STARTING UP")
  );
}

export function createDatabaseRuntimeMonitor(opts: DatabaseRuntimeMonitorOptions) {
  const now = opts.now ?? (() => new Date());
  const snapshot: DatabaseHealthSnapshot = {
    mode: opts.mode,
    state: "healthy",
    lastSuccessfulProbeAt: now().toISOString(),
    lastProbeFailureAt: null,
    lastRecoveryStartedAt: null,
    lastRecoveryCompletedAt: null,
    consecutiveFailures: 0,
    recoveryInFlight: false,
    lastError: null,
    port: opts.port?.() ?? null,
  };

  let activeRecovery: Promise<void> | null = null;
  let intervalHandle: NodeJS.Timeout | null = null;

  const log = (level: keyof LoggerLike, context: unknown, message: string) => {
    const fn = opts.logger?.[level];
    if (fn) {
      fn(context, message);
    }
  };

  const markHealthy = () => {
    snapshot.state = "healthy";
    snapshot.lastSuccessfulProbeAt = now().toISOString();
    snapshot.consecutiveFailures = 0;
    snapshot.lastError = null;
    snapshot.port = opts.port?.() ?? snapshot.port ?? null;
  };

  const beginRecovery = (triggerError: unknown) => {
    if (!opts.recover) {
      snapshot.state = "degraded";
      snapshot.lastError = toErrorMessage(triggerError);
      return Promise.resolve();
    }

    if (activeRecovery) {
      log(
        "warn",
        { error: toErrorMessage(triggerError), consecutiveFailures: snapshot.consecutiveFailures },
        "Embedded PostgreSQL recovery already in progress",
      );
      return activeRecovery;
    }

    snapshot.state = "recovering";
    snapshot.recoveryInFlight = true;
    snapshot.lastRecoveryStartedAt = now().toISOString();
    snapshot.lastError = toErrorMessage(triggerError);
    log(
      "warn",
      { error: snapshot.lastError, consecutiveFailures: snapshot.consecutiveFailures, mode: snapshot.mode },
      "Embedded PostgreSQL probe failed; starting recovery",
    );

    activeRecovery = (async () => {
      try {
        await opts.recover?.();
        snapshot.lastRecoveryCompletedAt = now().toISOString();
        markHealthy();
        log(
          "info",
          {
            recoveredAt: snapshot.lastRecoveryCompletedAt,
            lastSuccessfulProbeAt: snapshot.lastSuccessfulProbeAt,
            mode: snapshot.mode,
            port: snapshot.port,
          },
          "Embedded PostgreSQL recovery succeeded",
        );
      } catch (err) {
        snapshot.state = "unavailable";
        snapshot.lastRecoveryCompletedAt = now().toISOString();
        snapshot.lastError = toErrorMessage(err);
        log(
          "error",
          {
            error: snapshot.lastError,
            failedAt: snapshot.lastRecoveryCompletedAt,
            mode: snapshot.mode,
            port: snapshot.port,
          },
          "Embedded PostgreSQL recovery failed",
        );
      } finally {
        snapshot.recoveryInFlight = false;
        activeRecovery = null;
      }
    })();

    return activeRecovery;
  };

  const runProbe = async () => {
    snapshot.port = opts.port?.() ?? snapshot.port ?? null;
    try {
      await opts.probe();
      markHealthy();
      return;
    } catch (err) {
      snapshot.consecutiveFailures += 1;
      snapshot.lastProbeFailureAt = now().toISOString();
      snapshot.lastError = toErrorMessage(err);

      if (opts.mode === "embedded-postgres" && isRecoverableDatabaseTransportError(err)) {
        if (snapshot.consecutiveFailures === 1) {
          log(
            "warn",
            { error: snapshot.lastError, mode: snapshot.mode, port: snapshot.port },
            "Embedded PostgreSQL liveness probe failed",
          );
        }
        await beginRecovery(err);
        return;
      }

      snapshot.state = "degraded";
      log(
        "error",
        { error: snapshot.lastError, mode: snapshot.mode, port: snapshot.port },
        "Database liveness probe failed",
      );
    }
  };

  return {
    getHealth(): DatabaseHealthSnapshot {
      return { ...snapshot };
    },
    async runProbeNow(): Promise<void> {
      await runProbe();
    },
    start(): void {
      if (intervalHandle) return;
      intervalHandle = setInterval(() => {
        void runProbe();
      }, opts.intervalMs ?? 15_000);
    },
    stop(): void {
      if (!intervalHandle) return;
      clearInterval(intervalHandle);
      intervalHandle = null;
    },
  };
}
