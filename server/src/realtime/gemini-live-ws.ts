/**
 * WebSocket upgrade handler for Gemini Live sessions.
 *
 * Path: /api/meetings/:meetingId/gemini-live
 *
 * Mirrors the pattern in live-events-ws.ts — noServer WebSocketServer,
 * URL-based routing, board-token auth.
 */

import { createHash } from "node:crypto";
import type { IncomingMessage, Server as HttpServer } from "node:http";
import { createRequire } from "node:module";
import type { Duplex } from "node:stream";
import { and, eq, isNull } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { agentApiKeys } from "@paperclipai/db";
import type { DeploymentMode } from "@paperclipai/shared";
import { logger } from "../middleware/logger.js";
import { createGeminiLiveSession } from "../services/gemini-live-relay.js";

type ClientMsg =
  | { type: "audio_chunk"; data: string }
  | { type: "video_frame"; data: string }
  | { type: "text"; text: string }
  | { type: "tool_result"; callId: string; result: unknown }
  | { type: "ping" };

const require = createRequire(import.meta.url);
const { WebSocketServer } = require("ws") as {
  WebSocketServer: new (opts: { noServer: boolean }) => WsServer;
};

interface WsSocket {
  readyState: number;
  send(data: string): void;
  terminate(): void;
  close(code?: number, reason?: string): void;
  on(event: "message", listener: (data: Buffer | string) => void): void;
  on(event: "close", listener: () => void): void;
  on(event: "error", listener: (err: Error) => void): void;
}

interface WsServer {
  handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer, cb: (ws: WsSocket) => void): void;
  emit(event: "connection", ws: WsSocket, req: IncomingMessage): boolean;
  on(event: "connection", listener: (socket: WsSocket, req: IncomingMessage) => void): void;
}

// Regex: /api/meetings/:meetingId/gemini-live
function parseMeetingId(pathname: string): string | null {
  const match = pathname.match(/^\/api\/meetings\/([^/]+)\/gemini-live$/);
  if (!match) return null;
  try { return decodeURIComponent(match[1] ?? ""); } catch { return null; }
}

function rejectUpgrade(socket: Duplex, statusLine: string, msg: string) {
  socket.write(`HTTP/1.1 ${statusLine}\r\nConnection: close\r\nContent-Type: text/plain\r\n\r\n${msg}`);
  socket.destroy();
}

async function authUpgrade(
  db: Db,
  req: IncomingMessage,
  deploymentMode: DeploymentMode,
): Promise<{ companyId: string; meetingId: string } | null> {
  const url = new URL(req.url ?? "/", "http://localhost");
  const meetingId = parseMeetingId(url.pathname);
  if (!meetingId) return null;

  // local_trusted: board access — look up meeting to get companyId
  if (deploymentMode === "local_trusted") {
    // We'll resolve companyId after upgrade via DB lookup
    return { meetingId, companyId: "__lookup__" };
  }

  // Bearer token (agent key)
  const auth = Array.isArray(req.headers.authorization)
    ? req.headers.authorization[0]
    : req.headers.authorization;
  const token = auth?.toLowerCase().startsWith("bearer ")
    ? auth.slice(7).trim()
    : (url.searchParams.get("token") ?? null);

  if (!token) return null;

  const hash = createHash("sha256").update(token).digest("hex");
  const key = await db
    .select()
    .from(agentApiKeys)
    .where(and(eq(agentApiKeys.keyHash, hash), isNull(agentApiKeys.revokedAt)))
    .then((r) => r[0] ?? null);

  if (!key) return null;
  return { meetingId, companyId: key.companyId };
}

export function setupGeminiLiveWebSocketServer(
  server: HttpServer,
  db: Db,
  opts: {
    deploymentMode: DeploymentMode;
    geminiApiKey?: string;
  },
) {
  const wss = new WebSocketServer({ noServer: true });

  wss.on("connection", (socket: WsSocket, req: IncomingMessage) => {
    const ctx = (req as IncomingMessage & { _geminiCtx?: { meetingId: string; companyId: string } })._geminiCtx;
    if (!ctx) { socket.close(1008, "missing context"); return; }

    if (!opts.geminiApiKey) {
      socket.send(JSON.stringify({ type: "error", message: "GEMINI_API_KEY not configured on server" }));
      socket.close(1011, "no api key");
      return;
    }

    const connUrl = new URL(req.url ?? "/", "http://localhost");
    const modality = connUrl.searchParams.get("modality") === "text" ? "text" : "audio";

    const relay = createGeminiLiveSession(
      db,
      ctx.meetingId,
      ctx.companyId,
      opts.geminiApiKey,
      (msg) => {
        if (socket.readyState === 1 /* OPEN */) {
          socket.send(JSON.stringify(msg));
        }
      },
      modality,
    );

    socket.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as ClientMsg;
        switch (msg.type) {
          case "audio_chunk": relay.sendAudio(msg.data); break;
          case "video_frame": relay.sendVideo(msg.data); break;
          case "text": relay.sendText(msg.text); break;
          case "tool_result":
            relay.toolResult(msg.callId, "browser_tool", msg.result);
            break;
          case "ping":
            socket.send(JSON.stringify({ type: "pong" }));
            break;
        }
      } catch { /* ignore malformed */ }
    });

    socket.on("close", () => relay.close());
    socket.on("error", (err) => {
      logger.warn({ err, meetingId: ctx.meetingId }, "gemini live ws client error");
    });
  });

  server.on("upgrade", (req, socket, head) => {
    if (!req.url) return;
    const url = new URL(req.url, "http://localhost");
    const meetingId = parseMeetingId(url.pathname);
    if (!meetingId) return; // not our path — let other handlers deal with it

    authUpgrade(db, req, opts.deploymentMode)
      .then(async (ctx) => {
        if (!ctx) {
          rejectUpgrade(socket, "403 Forbidden", "forbidden");
          return;
        }

        // Resolve companyId for local_trusted
        let companyId = ctx.companyId;
        if (companyId === "__lookup__") {
          const { meetings } = await import("@paperclipai/db");
          const [mtg] = await db
            .select({ companyId: meetings.companyId })
            .from(meetings)
            .where(eq(meetings.id, ctx.meetingId))
            .limit(1);
          if (!mtg) { rejectUpgrade(socket, "404 Not Found", "meeting not found"); return; }
          companyId = mtg.companyId;
        }

        const reqWithCtx = req as IncomingMessage & { _geminiCtx?: { meetingId: string; companyId: string } };
        reqWithCtx._geminiCtx = { meetingId: ctx.meetingId, companyId };

        wss.handleUpgrade(req, socket, head, (ws) => {
          wss.emit("connection", ws, reqWithCtx);
        });
      })
      .catch((err: unknown) => {
        logger.error({ err, url: req.url }, "gemini live ws upgrade error");
        rejectUpgrade(socket, "500 Internal Server Error", "upgrade failed");
      });
  });
}
