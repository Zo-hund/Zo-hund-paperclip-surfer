# Agent Vision Operations

Open **Nexus > Vision** to assign a visual agent and choose a source:

- **World** captures the selected Three.js production camera, including virtual PTZ.
- **Pod** uses the operator's consented LiveKit camera after joining the room.
- **External** opens a browser-visible `videoinput`, including supported USB/UVC capture devices.

Enable **Allow visual analysis**, select the source, and choose **Analyze frame**. Continuous feedback is bounded from 5 to 60 seconds. Every request carries the member or guest operator ID, room code, source, capture time, and assigned agent.

Visual output never invokes tools automatically. Select a proposed skill and use **Approve** to send a governed call with the observation and explicit operator approval. Physical actuation remains outside the browser runtime and must be handled by a separately authorized gateway.

## Quest and mixed reality

Meta Quest passthrough is composed by the headset runtime and is not exposed as ordinary raw camera frames to portable WebXR pages. The Vision console therefore uses Three.js World capture in headset mode. An external camera is available only when Meta Browser exposes it through `navigator.mediaDevices` as a standard video input. The UI reports this limitation instead of presenting passthrough as an agent-readable feed.

Camera capture requires HTTPS, browser permission, and an active video device. Camera tracks stop when the console closes or the operator selects **Close**.
