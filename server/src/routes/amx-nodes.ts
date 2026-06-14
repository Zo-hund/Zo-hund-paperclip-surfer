import { createHash, verify } from "node:crypto";
import { Router, type Request } from "express";
import type { Db } from "@paperclipai/db";
import {
  amxNodeHeartbeatSchema,
  createAmxDispatchLeaseSchema,
  createAmxNodeSchema,
  submitAmxDispatchEvidenceSchema,
  updateAmxNodeSchema,
} from "@paperclipai/shared";
import { validate } from "../middleware/validate.js";
import { amxNodeService, logActivity } from "../services/index.js";
import { assertBoard, assertCompanyAccess, getActorInfo } from "./authz.js";
import { forbidden, unauthorized, unprocessable } from "../errors.js";

const NODE_SIGNATURE_MAX_SKEW_MS = 5 * 60 * 1000;

export function amxNodeRoutes(db: Db) {
  const router = Router({ mergeParams: true });
  const nodes = amxNodeService(db);

  function companyIdFrom(req: Request) {
    const value = req.params.companyId;
    return Array.isArray(value) ? value[0] ?? "" : value ?? "";
  }

  function stringHeader(req: Request, name: string) {
    const value = req.header(name);
    return typeof value === "string" ? value.trim() : "";
  }

  function bodyHash(req: Request) {
    const rawBody = (req as unknown as { rawBody?: Buffer }).rawBody ?? Buffer.alloc(0);
    return createHash("sha256").update(rawBody).digest("hex");
  }

  function signaturePayload(req: Request, timestamp: string) {
    return Buffer.from(
      [
        req.method.toUpperCase(),
        req.originalUrl,
        timestamp,
        bodyHash(req),
      ].join("\n"),
      "utf8",
    );
  }

  async function assertSignedNode(req: Request, companyId: string, expectedNodeId: string) {
    const nodeId = stringHeader(req, "x-amx-node-id");
    const timestamp = stringHeader(req, "x-amx-timestamp");
    const signature = stringHeader(req, "x-amx-signature");
    if (!nodeId || !timestamp || !signature) {
      throw unauthorized("AMX node signature required");
    }
    if (nodeId !== expectedNodeId) {
      throw forbidden("AMX node signature does not match requested node");
    }
    const timestampMs = Date.parse(timestamp);
    if (!Number.isFinite(timestampMs) || Math.abs(Date.now() - timestampMs) > NODE_SIGNATURE_MAX_SKEW_MS) {
      throw unauthorized("AMX node signature timestamp is stale");
    }
    const node = await nodes.get(companyId, nodeId);
    if (!node) throw unauthorized("AMX node is not enrolled");
    if (node.status === "suspended") throw forbidden("AMX node is suspended");
    if (!node.publicKey) throw unprocessable("AMX node has no public key configured");
    let ok = false;
    try {
      ok = verify(null, signaturePayload(req, timestamp), node.publicKey, Buffer.from(signature, "base64url"));
    } catch {
      throw unauthorized("Invalid AMX node signature");
    }
    if (!ok) throw unauthorized("Invalid AMX node signature");
    return node;
  }

  async function assertBoardOrSignedNode(req: Request, companyId: string, nodeId: string) {
    if (req.actor.type === "board") {
      assertBoard(req);
      assertCompanyAccess(req, companyId);
      return;
    }
    await assertSignedNode(req, companyId, nodeId);
  }

  router.get("/", async (req, res) => {
    const companyId = companyIdFrom(req);
    assertCompanyAccess(req, companyId);
    res.json(await nodes.list(companyId));
  });

  router.post("/", validate(createAmxNodeSchema), async (req, res) => {
    assertBoard(req);
    const companyId = companyIdFrom(req);
    assertCompanyAccess(req, companyId);
    const node = await nodes.create(companyId, req.body);
    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      action: "amx.node.created",
      entityType: "amx_node",
      entityId: node.id,
      details: { name: node.name, kind: node.kind, trustTier: node.trustTier },
    });
    res.status(201).json(node);
  });

  router.get("/dispatch/leases", async (req, res) => {
    const companyId = companyIdFrom(req);
    assertCompanyAccess(req, companyId);
    res.json(await nodes.listLeases(companyId));
  });

  router.get("/dispatch/evidence", async (req, res) => {
    const companyId = companyIdFrom(req);
    assertCompanyAccess(req, companyId);
    res.json(await nodes.listEvidence(companyId));
  });

  router.post("/dispatch/leases", validate(createAmxDispatchLeaseSchema), async (req, res) => {
    const companyId = companyIdFrom(req);
    assertCompanyAccess(req, companyId);
    const actor = getActorInfo(req);
    const lease = await nodes.createLease(companyId, req.body, {
      actorType: actor.actorType,
      actorId: actor.actorId,
    });
    await logActivity(db, {
      companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      action: "amx.dispatch_lease.created",
      entityType: "amx_dispatch_lease",
      entityId: lease.id,
      details: {
        nodeId: lease.nodeId,
        capability: lease.capability,
        riskLevel: lease.riskLevel,
        status: lease.status,
      },
    });
    res.status(201).json(lease);
  });

  router.post("/dispatch/leases/:leaseId/revoke", async (req, res) => {
    assertBoard(req);
    const companyId = companyIdFrom(req);
    assertCompanyAccess(req, companyId);
    const lease = await nodes.revokeLease(companyId, req.params.leaseId as string);
    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      action: "amx.dispatch_lease.revoked",
      entityType: "amx_dispatch_lease",
      entityId: lease.id,
      details: { nodeId: lease.nodeId, capability: lease.capability, riskLevel: lease.riskLevel },
    });
    res.json(lease);
  });

  router.get("/:nodeId", async (req, res) => {
    const companyId = companyIdFrom(req);
    assertCompanyAccess(req, companyId);
    const node = await nodes.get(companyId, req.params.nodeId as string);
    if (!node) {
      res.status(404).json({ error: "AMX node not found" });
      return;
    }
    res.json(node);
  });

  router.patch("/:nodeId", validate(updateAmxNodeSchema), async (req, res) => {
    assertBoard(req);
    const companyId = companyIdFrom(req);
    assertCompanyAccess(req, companyId);
    const node = await nodes.update(companyId, req.params.nodeId as string, req.body);
    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      action: "amx.node.updated",
      entityType: "amx_node",
      entityId: node.id,
      details: { status: node.status, trustTier: node.trustTier },
    });
    res.json(node);
  });

  router.post("/:nodeId/heartbeat", validate(amxNodeHeartbeatSchema), async (req, res) => {
    const companyId = companyIdFrom(req);
    const nodeId = req.params.nodeId as string;
    await assertBoardOrSignedNode(req, companyId, nodeId);
    const node = await nodes.heartbeat(companyId, nodeId, req.body);
    res.json(node);
  });

  router.get("/:nodeId/dispatch/leases", async (req, res) => {
    const companyId = companyIdFrom(req);
    const nodeId = req.params.nodeId as string;
    await assertBoardOrSignedNode(req, companyId, nodeId);
    res.json(await nodes.listNodeLeases(companyId, nodeId));
  });

  router.get("/:nodeId/dispatch/evidence", async (req, res) => {
    const companyId = companyIdFrom(req);
    const nodeId = req.params.nodeId as string;
    await assertBoardOrSignedNode(req, companyId, nodeId);
    res.json(await nodes.listNodeEvidence(companyId, nodeId));
  });

  router.post("/:nodeId/dispatch/leases/:leaseId/consume", async (req, res) => {
    const companyId = companyIdFrom(req);
    const nodeId = req.params.nodeId as string;
    await assertBoardOrSignedNode(req, companyId, nodeId);
    const auth = stringHeader(req, "authorization");
    const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice("bearer ".length).trim() : "";
    if (!token) throw unauthorized("AMX dispatch lease token required");
    const lease = await nodes.consumeLease(companyId, nodeId, req.params.leaseId as string, token);
    await logActivity(db, {
      companyId,
      actorType: "agent",
      actorId: nodeId,
      action: "amx.dispatch_lease.consumed",
      entityType: "amx_dispatch_lease",
      entityId: lease.id,
      details: { nodeId: lease.nodeId, capability: lease.capability, riskLevel: lease.riskLevel },
    });
    res.json(lease);
  });

  router.post("/:nodeId/dispatch/leases/:leaseId/evidence", validate(submitAmxDispatchEvidenceSchema), async (req, res) => {
    const companyId = companyIdFrom(req);
    const nodeId = req.params.nodeId as string;
    await assertBoardOrSignedNode(req, companyId, nodeId);
    const evidence = await nodes.submitEvidence(companyId, nodeId, req.params.leaseId as string, req.body);
    await logActivity(db, {
      companyId,
      actorType: "agent",
      actorId: nodeId,
      action: "amx.dispatch_evidence.submitted",
      entityType: "amx_dispatch_evidence",
      entityId: evidence.id,
      details: {
        nodeId: evidence.nodeId,
        leaseId: evidence.leaseId,
        capability: evidence.capability,
        riskLevel: evidence.riskLevel,
        resultSha256: evidence.resultSha256,
      },
    });
    res.status(201).json(evidence);
  });

  return router;
}
