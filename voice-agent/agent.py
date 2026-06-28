"""
AMX Air Hubs Voice Agent

Joins LiveKit rooms and responds to voice/text using Anthropic Claude.
Runs as a LiveKit Agents Framework worker alongside the main server.

Required env vars:
  LIVEKIT_URL          - wss://your-instance.livekit.cloud
  LIVEKIT_API_KEY      - LiveKit API key
  LIVEKIT_API_SECRET   - LiveKit API secret
  ANTHROPIC_API_KEY    - Anthropic API key for Claude
"""

import os
from dotenv import load_dotenv
from livekit import agents
from livekit.agents import AgentServer, AgentSession, Agent, inference, room_io

load_dotenv()

AMX_INSTRUCTIONS = """You are the AMX Air Hubs AI Assistant — a production-grade voice copilot for the AMX platform.

Your role:
- Help users manage their AI agent teams, issues, projects, and deliverables
- Answer questions about the AMX Air Hubs platform (companies, agents, skills, budgets, approvals)
- Assist with meeting outcomes: decisions, risks, action items
- Provide context from the current company's operations

Your personality:
- Professional but approachable
- Concise and direct — this is a voice interface, keep responses short
- Proactive — suggest next steps when appropriate
- Reference AMX platform concepts naturally (OPPRRC lifecycle, SIM/LIVE modes, PIT STOP gates)

Rules:
- Never use markdown formatting, emojis, or special characters in speech
- Keep responses under 3 sentences unless asked for detail
- When unsure, say so clearly rather than guessing
- Refer users to specific platform pages when relevant (e.g. "check your briefcase for deliverables")
"""


class AMXAssistant(Agent):
    def __init__(self) -> None:
        super().__init__(instructions=AMX_INSTRUCTIONS)


server = AgentServer()


@server.rtc_session(agent_name="amx-voice-agent")
async def amx_voice_session(ctx: agents.JobContext):
    session = AgentSession(
        stt=inference.STT(model="deepgram/nova-3", language="multi"),
        llm=inference.LLM(model="anthropic/claude-sonnet-4-6"),
        tts=inference.TTS(model="cartesia/sonic-3"),
    )

    await session.start(
        room=ctx.room,
        agent=AMXAssistant(),
    )

    await session.generate_reply(
        instructions="Greet the user briefly. Say: Welcome to AMX Air Hubs. How can I help you today?"
    )


if __name__ == "__main__":
    agents.cli.run_app(server)
