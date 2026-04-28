/**
 * Gemini Live Relay Service
 *
 * Creates a server-side Gemini Multimodal Live session and bridges it with a
 * WebSocket client.  Server-executable tools (create_issue, invoke_agent, etc.)
 * are executed here.  UI-only tools (navigate_to, fill_form, …) are forwarded
 * as-is to the client.
 */

import { GoogleGenAI, MediaResolution, Modality, Type, type FunctionDeclaration } from "@google/genai";
import { eq, sql } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { issues, meetings, agents, companies, meetingOutcomes } from "@paperclipai/db";
import { logger } from "../middleware/logger.js";

// ── Server→Client message types ─────────────────────────────────────────────

export type ServerMsg =
  | { type: "status"; status: "connected" | "listening" | "thinking" | "speaking" | "unavailable" }
  | { type: "transcript"; role: "user" | "model"; text: string }
  | { type: "audio_response"; data: string }
  | { type: "tool_call"; callId: string; name: string; args: Record<string, unknown> }
  | { type: "error"; message: string };

// ── Tools that execute on the server vs relayed to browser ───────────────────

const SERVER_TOOLS = new Set(["create_issue", "invoke_agent", "add_meeting_outcome", "update_issue_status"]);

// ── Gemini function declarations ─────────────────────────────────────────────

const TOOL_DECLARATIONS: FunctionDeclaration[] = [
  {
    name: "navigate_to",
    description: "Navigate the Paperclip UI to a specific page path",
    parameters: {
      type: Type.OBJECT,
      properties: {
        path: { type: Type.STRING, description: "URL path e.g. /AMXA/agents or /AMXA/issues" },
      },
      required: ["path"],
    },
  },
  {
    name: "create_issue",
    description: "Create a new issue/task in Paperclip and optionally assign it to an agent",
    parameters: {
      type: Type.OBJECT,
      properties: {
        title: { type: Type.STRING, description: "Issue title" },
        description: { type: Type.STRING, description: "Detailed description" },
        assigneeAgentId: { type: Type.STRING, description: "Agent ID to assign (optional)" },
        projectId: { type: Type.STRING, description: "Project ID (optional)" },
      },
      required: ["title"],
    },
  },
  {
    name: "invoke_agent",
    description: "Wake up and send instructions to a Paperclip agent",
    parameters: {
      type: Type.OBJECT,
      properties: {
        agentId: { type: Type.STRING, description: "The agent ID to invoke" },
        reason: { type: Type.STRING, description: "Instruction or reason for the wakeup" },
      },
      required: ["agentId", "reason"],
    },
  },
  {
    name: "add_meeting_outcome",
    description: "Log a decision, risk, or action item to the current meeting",
    parameters: {
      type: Type.OBJECT,
      properties: {
        type: { type: Type.STRING, description: "One of: decision, risk, action_item" },
        content: { type: Type.STRING, description: "The outcome content" },
      },
      required: ["type", "content"],
    },
  },
  {
    name: "update_issue_status",
    description: "Change the status of a Paperclip issue",
    parameters: {
      type: Type.OBJECT,
      properties: {
        issueId: { type: Type.STRING, description: "Issue ID" },
        status: { type: Type.STRING, description: "New status: backlog, open, in_progress, done, cancelled" },
      },
      required: ["issueId", "status"],
    },
  },
  {
    name: "fill_form",
    description: "Pre-fill a form visible in the Paperclip UI",
    parameters: {
      type: Type.OBJECT,
      properties: {
        formType: { type: Type.STRING, description: "Form type e.g. new_issue, new_agent" },
        fields: { type: Type.OBJECT, description: "Key-value pairs of field names and values" },
      },
      required: ["formType", "fields"],
    },
  },
  {
    name: "open_modal",
    description: "Open a modal dialog in the Paperclip UI",
    parameters: {
      type: Type.OBJECT,
      properties: {
        modal: { type: Type.STRING, description: "Modal name e.g. invite_agent, new_issue" },
        params: { type: Type.OBJECT, description: "Optional parameters" },
      },
      required: ["modal"],
    },
  },
  {
    name: "submit_form",
    description: "Submit the currently open form in the Paperclip UI",
    parameters: {
      type: Type.OBJECT,
      properties: {
        formType: { type: Type.STRING, description: "Form type to submit" },
      },
      required: ["formType"],
    },
  },
];

// ── Server-side tool execution ───────────────────────────────────────────────

async function execServerTool(
  db: Db,
  meetingId: string,
  companyId: string,
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  try {
    switch (name) {
      case "create_issue": {
        const { title, description, assigneeAgentId, projectId } = args as {
          title: string;
          description?: string;
          assigneeAgentId?: string;
          projectId?: string;
        };

        // Atomically increment issueCounter and get new value
        const [company] = await db
          .update(companies)
          .set({ issueCounter: sql`${companies.issueCounter} + 1`, updatedAt: new Date() })
          .where(eq(companies.id, companyId))
          .returning({ issuePrefix: companies.issuePrefix, issueCounter: companies.issueCounter });

        const counter = company?.issueCounter ?? 1;
        const identifier = `${company?.issuePrefix ?? "?"}-${counter}`;

        const [issue] = await db
          .insert(issues)
          .values({
            companyId,
            title,
            description: description ?? null,
            status: "open",
            assigneeAgentId: assigneeAgentId ?? null,
            projectId: projectId ?? null,
            issueNumber: counter,
            identifier,
            originKind: "manual",
            createdByUserId: "board",
          })
          .returning({ id: issues.id, identifier: issues.identifier });

        return { success: true, issueId: issue?.id, identifier, message: `Created ${identifier}: ${title}` };
      }

      case "invoke_agent": {
        const { agentId, reason } = args as { agentId: string; reason: string };
        const [agent] = await db
          .select({ id: agents.id, name: agents.name })
          .from(agents)
          .where(eq(agents.id, agentId))
          .limit(1);

        if (!agent) return { success: false, message: "Agent not found" };

        const { heartbeatService } = await import("./index.js");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (heartbeatService(db) as any).wakeup(agentId, {
          reason,
          triggerDetail: "meeting_voice_command",
          source: "on_demand",
        });

        return { success: true, message: `Invoked agent ${agent.name}` };
      }

      case "add_meeting_outcome": {
        const { type, content } = args as { type: string; content: string };
        const validType = ["decision", "risk", "action_item", "question"].includes(type) ? type : "decision";
        await db.insert(meetingOutcomes).values({
          meetingId,
          type: validType as "decision" | "risk" | "action_item" | "question",
          content,
          status: "unresolved",
        });
        return { success: true, message: `Logged ${validType}: ${content}` };
      }

      case "update_issue_status": {
        const { issueId, status } = args as { issueId: string; status: string };
        await db
          .update(issues)
          .set({ status, updatedAt: new Date() })
          .where(eq(issues.id, issueId));
        return { success: true, message: `Issue ${issueId} → ${status}` };
      }

      default:
        return { success: false, message: `Unknown server tool: ${name}` };
    }
  } catch (err) {
    logger.error({ err, name, args }, "gemini server tool failed");
    return { success: false, message: String(err) };
  }
}

// ── Main factory ─────────────────────────────────────────────────────────────

export type GeminiLiveModality = "audio" | "text";

// ── Text-only chat session (no Live bidi, no audio) ──────────────────────────

/**
 * Lightweight text-only session that mimics the Live relay's API but uses
 * `generateContentStream` against a regular Gemini chat model. Used when the
 * UI opts into `modality=text` (e.g. Playwright / no-mic browsers). Supports
 * the same tool declarations so navigate_to / create_issue still flow through.
 */
function createTextChatSession(
  db: Db,
  meetingId: string,
  companyId: string,
  apiKey: string,
  onMessage: (msg: ServerMsg) => void,
) {
  const genAI = new GoogleGenAI({ apiKey, apiVersion: "v1beta" });
  let closed = false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const history: any[] = [];
  let systemText = "";
  let ready = false;
  const pendingCalls = new Map<string, { name: string }>();

  (async () => {
    const [mtg] = await db
      .select({ title: meetings.title })
      .from(meetings)
      .where(eq(meetings.id, meetingId))
      .limit(1);

    systemText = [
      "You are the AMX LABS AI Cockpit Assistant for a live meeting session.",
      mtg ? `Current meeting: "${mtg.title}".` : "",
      "Help the operator navigate the Paperclip control plane, create issues, invoke agents, log decisions and risks, and provide strategic guidance.",
      "When the user asks to navigate, use navigate_to. When they ask to create a task or issue, use create_issue.",
      "Available paths: /AMXA/dashboard, /AMXA/agents, /AMXA/issues, /AMXA/analytics, /AMXA/meetings, /AMXA/org-chart.",
      "Respond concisely and professionally, suitable for a strategic operations cockpit.",
    ].filter(Boolean).join(" ");

    ready = true;
    onMessage({ type: "status", status: "connected" });
    onMessage({ type: "status", status: "listening" });
  })().catch((err) => {
    logger.error({ err }, "text chat init failed");
    onMessage({ type: "error", message: "Failed to initialize text chat session" });
  });

  async function runTurn() {
    if (closed) return;
    try {
      onMessage({ type: "status", status: "thinking" });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const stream = await (genAI.models as any).generateContentStream({
        model: "gemini-2.5-flash",
        contents: history,
        config: {
          systemInstruction: { parts: [{ text: systemText }] },
          tools: [{ functionDeclarations: TOOL_DECLARATIONS }],
        },
      });

      let assistantText = "";
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
      for await (const chunk of stream as AsyncIterable<Record<string, unknown>>) {
        if (closed) return;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const candidates = (chunk as any).candidates ?? [];
        for (const cand of candidates) {
          const parts = cand?.content?.parts ?? [];
          for (const p of parts) {
            if (typeof p.text === "string" && p.text) {
              assistantText += p.text;
              onMessage({ type: "transcript", role: "model", text: p.text });
            }
            if (p.functionCall) {
              calls.push({ name: p.functionCall.name, args: p.functionCall.args ?? {} });
            }
          }
        }
      }

      // Record assistant turn
      const modelParts: Array<Record<string, unknown>> = [];
      if (assistantText) modelParts.push({ text: assistantText });
      for (const c of calls) modelParts.push({ functionCall: { name: c.name, args: c.args } });
      if (modelParts.length) history.push({ role: "model", parts: modelParts });

      // Execute tool calls
      for (const c of calls) {
        const callId = `tc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        if (SERVER_TOOLS.has(c.name)) {
          const result = await execServerTool(db, meetingId, companyId, c.name, c.args);
          history.push({
            role: "user",
            parts: [{ functionResponse: { name: c.name, response: result as Record<string, unknown> } }],
          });
          // Chain another turn so the model can narrate the result
          await runTurn();
          return;
        } else {
          pendingCalls.set(callId, { name: c.name });
          onMessage({ type: "tool_call", callId, name: c.name, args: c.args });
        }
      }

      onMessage({ type: "status", status: "listening" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error({ err, msg }, "text chat turn failed");
      if (!closed) onMessage({ type: "error", message: `Text chat error: ${msg}` });
    }
  }

  return {
    sendAudio(_data: string) { /* no-op in text mode */ },
    sendVideo(_data: string) { /* no-op in text mode */ },
    sendText(text: string) {
      if (closed || !ready) return;
      history.push({ role: "user", parts: [{ text }] });
      void runTurn();
    },
    toolResult(callId: string, _name: string, result: unknown) {
      if (closed) return;
      const entry = pendingCalls.get(callId);
      if (!entry) return;
      pendingCalls.delete(callId);
      history.push({
        role: "user",
        parts: [{ functionResponse: { name: entry.name, response: result as Record<string, unknown> } }],
      });
      void runTurn();
    },
    close() {
      closed = true;
    },
  };
}

export function createGeminiLiveSession(
  db: Db,
  meetingId: string,
  companyId: string,
  apiKey: string,
  onMessage: (msg: ServerMsg) => void,
  modality: GeminiLiveModality = "audio",
) {
  // Text-only branch: the Live bidi API's preview models only support audio
  // response modalities. For text cockpits (Playwright tests, no-mic browsers)
  // we use a regular chat-streaming model with the same tool declarations so
  // navigate_to / create_issue still round-trip through the UI.
  if (modality === "text") {
    return createTextChatSession(db, meetingId, companyId, apiKey, onMessage);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let liveSession: any = null;
  let closed = false;

  async function init() {
    const genAI = new GoogleGenAI({ apiKey, apiVersion: "v1beta" });

    const [mtg] = await db
      .select({ title: meetings.title })
      .from(meetings)
      .where(eq(meetings.id, meetingId))
      .limit(1);

    const systemText = [
      "You are the AMX LABS AI Cockpit Assistant for a live meeting session.",
      mtg ? `Current meeting: "${mtg.title}".` : "",
      "You have real-time vision of the user's screen or camera when they share it.",
      "Help the operator navigate the Paperclip control plane, create issues, invoke agents, log decisions and risks, and provide strategic guidance.",
      "When the user asks to navigate, use navigate_to. When they ask to create a task or issue, use create_issue.",
      "Available paths: /AMXA/dashboard, /AMXA/agents, /AMXA/issues, /AMXA/analytics, /AMXA/meetings, /AMXA/org-chart.",
      "Respond concisely and professionally, suitable for a strategic operations cockpit.",
    ].filter(Boolean).join(" ");

    // This branch is audio-only (text mode short-circuits to createTextChatSession).
    const liveConfig: Record<string, unknown> = {
      responseModalities: [Modality.AUDIO],
      systemInstruction: { parts: [{ text: systemText }] },
      tools: [{ functionDeclarations: TOOL_DECLARATIONS }],
      mediaResolution: MediaResolution.MEDIA_RESOLUTION_MEDIUM,
      contextWindowCompression: {
        triggerTokens: "104857",
        slidingWindow: { targetTokens: "52428" },
      },
      speechConfig: {
        voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } },
      },
      inputAudioTranscription: {},
      outputAudioTranscription: {},
    };
    const s = await genAI.live.connect({
      model: "models/gemini-3.1-flash-live-preview",
      config: liveConfig,
      callbacks: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        onmessage(msg: any) {
          if (closed) return;
          logger.debug({ msgKeys: Object.keys(msg ?? {}) }, "gemini live msg");

          // Setup complete
          if (msg.setupComplete !== undefined) {
            onMessage({ type: "status", status: "connected" });
            onMessage({ type: "status", status: "listening" });
            return;
          }

          // Server content (text / audio)
          if (msg.serverContent) {
            const parts: Array<Record<string, unknown>> = msg.serverContent?.modelTurn?.parts ?? [];
            logger.debug({ partCount: parts.length, turnComplete: msg.serverContent.turnComplete }, "gemini serverContent");
            for (const part of parts) {
              if (typeof part.text === "string" && part.text.trim()) {
                onMessage({ type: "transcript", role: "model", text: part.text });
              }
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const inline = (part as any).inlineData;
              if (inline?.data) {
                let base64Audio = "";
                if (typeof inline.data === "string") {
                  base64Audio = inline.data;
                } else if (Buffer.isBuffer(inline.data)) {
                  base64Audio = inline.data.toString("base64");
                } else if (inline.data instanceof Uint8Array || inline.data instanceof ArrayBuffer) {
                  base64Audio = Buffer.from(inline.data).toString("base64");
                } else {
                  try { base64Audio = Buffer.from(inline.data).toString("base64"); } catch {}
                }
                
                if (base64Audio) {
                  onMessage({ type: "status", status: "speaking" });
                  onMessage({ type: "audio_response", data: base64Audio });
                }
              }
            }
            if (msg.serverContent.turnComplete) {
              onMessage({ type: "status", status: "listening" });
            }
          }

          // Audio transcriptions (inputTranscription = user, outputTranscription = model)
          if (msg.inputTranscription?.text) {
            onMessage({ type: "transcript", role: "user", text: msg.inputTranscription.text });
          }
          if (msg.outputTranscription?.text) {
            onMessage({ type: "transcript", role: "model", text: msg.outputTranscription.text });
          }

          // Tool calls
          if (msg.toolCall?.functionCalls) {
            for (const fc of msg.toolCall.functionCalls as Array<{ id: string; name: string; args: Record<string, unknown> }>) {
              if (SERVER_TOOLS.has(fc.name)) {
                onMessage({ type: "status", status: "thinking" });
                execServerTool(db, meetingId, companyId, fc.name, fc.args ?? {})
                  .then((result) => {
                    if (!closed) {
                      s.sendToolResponse({ functionResponses: [{ id: fc.id, name: fc.name, response: result as Record<string, unknown> }] });
                    }
                  });
              } else {
                onMessage({ type: "tool_call", callId: fc.id, name: fc.name, args: fc.args ?? {} });
              }
            }
          }
        },

        onerror(e: unknown) {
          const errMsg = e instanceof Error ? e.message : typeof e === "string" ? e : JSON.stringify(e);
          logger.error({ err: e, errMsg, modality }, "gemini live error");
          if (!closed) onMessage({ type: "error", message: `Gemini session error: ${errMsg}` });
        },

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        onclose(ev?: any) {
          const code = ev?.code;
          const reason = ev?.reason;
          logger.warn({ modality, code, reason, ev: ev ? JSON.stringify(ev) : null }, "gemini live onclose");
          if (!closed) {
            if (reason) onMessage({ type: "error", message: `Gemini closed: ${reason}` });
            onMessage({ type: "status", status: "unavailable" });
          }
        },
      },
    });

    return s;
  }

  init()
    .then((s) => {
      if (closed) { try { s.close(); } catch { /* */ } return; }
      liveSession = s;
    })
    .catch((err: unknown) => {
      logger.error({ err }, "gemini live init failed");
      onMessage({ type: "error", message: "Failed to connect to Gemini Live — check GEMINI_API_KEY" });
    });

  return {
    sendAudio(data: string) {
      if (!liveSession || closed) return;
      try {
        liveSession.sendRealtimeInput([{ mimeType: "audio/pcm;rate=16000", data }]);
      } catch (err) {
        logger.error({ err }, "failed to send audio input to gemini");
      }
    },
    sendVideo(data: string) {
      if (!liveSession || closed) return;
      try {
        liveSession.sendRealtimeInput([{ mimeType: "image/jpeg", data }]);
      } catch (err) {
        logger.error({ err }, "failed to send video input to gemini");
      }
    },
    sendText(text: string) {
      if (!liveSession || closed) return;
      try {
        liveSession.sendClientContent({ turns: text, turnComplete: true });
      } catch (err) {
        logger.error({ err }, "failed to send text input to gemini");
      }
    },
    toolResult(callId: string, name: string, result: unknown) {
      if (!liveSession || closed) return;
      liveSession.sendToolResponse({ functionResponses: [{ id: callId, name, response: result }] });
    },
    close() {
      closed = true;
      if (liveSession) {
        try { liveSession.close(); } catch { /* */ }
        liveSession = null;
      }
    },
  };
}
