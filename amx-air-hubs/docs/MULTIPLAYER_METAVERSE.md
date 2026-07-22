# Multiplayer Metaverse Studio

The Nexus Pod contains a realtime Three.js creation studio for solo, co-op, and team sessions. LiveKit carries room presence, voice, video, chat, NPC direction, and reliable session packets. Supabase Realtime carries showcase requests and operator approval decisions between active Nexus and Stage clients. Browser `BroadcastChannel` provides the localhost fallback.

## Run a Session

1. Open `/nexus`, select **Pod**, and choose a room channel.
2. Join the LiveKit Pod on every desktop, mobile, or Quest device using the same room code.
3. Select **Solo**, **Co-op**, or **Teams**. Set the team, event format, and organization tags.
4. Edit `WORLD.BLUEPRINT.JSON`. The parser accepts up to 48 bounded box, sphere, cylinder, or torus entities and never executes remote JavaScript.
5. Select **Sync Build** to publish the revision to the room. New participants request the current revision automatically.
6. Select **Code with Agent** for a code-aware build review through the governed Agent Runtime.

Reliable LiveKit data payloads have a practical size limit, so shared blueprints are capped at 10 KB. Large GLB, texture, audio, and video assets should continue to use the authenticated media pipeline and be referenced by ID.

## Promote to XR Stage

1. In the Nexus studio, select **Request Showcase**.
2. An operator opens `/stage` and selects **Collab**.
3. The request appears in **XR Showcase Inbox** with room, mode, event format, organization, tags, and deliverable revision.
4. The operator declines it or selects **Approve to Stage**.
5. Approval links the source Pod, loads the Summit, XR Con, or Expo venue, applies organization branding, changes the show cue to Demo, and opens the audience/event console.

Only authenticated members can enter Nexus. The Stage console remains operator-only. Public audiences use `/watch/:roomCode` after the operator starts the approved program.

## Safety and State

- Remote NPC commands still require operator participant metadata.
- Multiplayer session packets require AMX room communicator metadata.
- Incoming packets are bounded, schema-checked, de-duplicated, and revision ordered.
- World code is parsed as JSON data, not evaluated as JavaScript.
- Organization tags are normalized and capped at eight values.
- Promotion requires a separate Stage operator approval.
