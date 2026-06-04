import { Router } from "express";
import { AccessToken } from "livekit-server-sdk";
import { logger } from "../middleware/logger.js";

const router = Router();

/**
 * POST /api/livekit/token
 * Generate a LiveKit access token for the board user to join a room.
 * Body: { roomName?: string; identity?: string }
 */
router.post("/livekit/token", async (req, res) => {
  try {
    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;
    const livekitUrl = process.env.LIVEKIT_URL;

    if (!apiKey || !apiSecret || !livekitUrl) {
      return res.status(503).json({
        error: "LiveKit is not configured. Add LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET to .env",
      });
    }

    const { roomName = "amx-command-room", identity = "board-user" } = req.body as {
      roomName?: string;
      identity?: string;
    };

    if (!roomName || roomName.length > 200) {
      return res.status(400).json({ error: "Invalid roomName" });
    }
    if (!identity || identity.length > 100) {
      return res.status(400).json({ error: "Invalid identity" });
    }

    const at = new AccessToken(apiKey, apiSecret, {
      identity,
      ttl: "4h",
    });

    at.addGrant({
      roomJoin: true,
      room: roomName,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });

    const token = await at.toJwt();
    logger.info({ roomName, identity }, "livekit token issued");
    return res.json({ token, url: livekitUrl, roomName, identity });
  } catch (err) {
    logger.error({ err }, "Failed to generate LiveKit token");
    return res.status(500).json({ error: "Failed to generate token" });
  }
});

/**
 * GET /api/livekit/config
 * Returns public LiveKit URL for the browser client.
 */
router.get("/livekit/config", (_req, res) => {
  const url = process.env.LIVEKIT_URL;
  if (!url) return res.json({ configured: false });
  return res.json({ configured: true, url });
});

export { router as livekitRouter };
