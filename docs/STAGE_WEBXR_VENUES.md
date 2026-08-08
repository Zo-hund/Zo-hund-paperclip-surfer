# Stage WebXR Venues

AMX Stage venues are protected member worlds connected to the private production console. Members can enter the same room from a browser, phone, or compatible headset without gaining operator controls.

## Routes

- `/venues/theater?room=AMXSTAGE`
- `/venues/arena?room=AMXSTAGE`
- `/venues/expo-hall?room=AMXSTAGE`

The route requires an active member account. `/stage` remains restricted to operators.

## Member Experience

- Browser mode with keyboard and touch movement
- Native `immersive-vr` on supported headsets
- Native `immersive-ar` for AR and mixed-reality passthrough
- Quest left-stick locomotion, right-stick 30-degree snap turn, and trigger teleport
- Real-time bounded avatar poses, names, and venue presence
- LiveKit camera, studio voice, room audio, screen share, and text chat
- Theater, arena, and expo hall layouts

The communications drawer stays closed by default so the stage and avatars remain visible on mobile.

## Production Control

The member world subscribes to Stage state in read-only mode. The operator controls the event title, live status, current cue, camera shot, sponsor creative, and room. Audience movement uses a separate venue presence channel and cannot update production state.

## Realtime Transport

Supabase Realtime is used for spatial pose presence when configured. Local development falls back to `BroadcastChannel`. Poses are sanitized, bounded to the venue, throttled to 10 updates per second, and limited to 48 rendered remote members.

LiveKit member tokens require an active member session and a room listed in `PUBLIC_LIVEKIT_ROOMS`. The server derives the participant identity from the verified profile. Operator tokens and agent dispatch remain limited to `LIVEKIT_OPERATOR_HOSTS`.

## Deployment Configuration

Set these worker variables for a live room:

```text
LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=server-side-only
LIVEKIT_API_SECRET=server-side-only
PUBLIC_LIVEKIT_ROOMS=AMXSTAGE
LIVEKIT_OPERATOR_HOSTS=private-operator-host.example
MEMBER_AUTH_REQUIRED=true
SUPABASE_URL=https://project.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

Camera, microphone, AR, and VR require HTTPS, browser permission, and a user gesture. Unsupported XR devices remain in the browser venue instead of showing a blank scene.
