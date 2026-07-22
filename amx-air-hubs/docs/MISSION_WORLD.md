# AMX Mission World

AMX Mission World is the native playable layer at `/missions/world`. Members enter it from the Mission Runway at `/missions`. It is organized as two connected layers: a learner-facing curriculum and a platform runtime behind it.

## Learner layer

AI 101, XR Foundations, Robotics, Automations, and World Builder each contain six persistent checkpoints. A checkpoint presents a short concept and an applied `DO` task. Finishing all six unlocks that module's interactive capstone, producing 30 checkpoints and five capstones in total.

The capstones run in the native Three.js scene. Wrong governed choices and incorrect robot sequences increment retry state. The runtime timer resets when the learner changes worlds. World Builder placement remains disabled until its learning path is complete.

## Quest catalog

| Quest | Base XP | Badge |
| --- | ---: | --- |
| AI 101 | 100 | AI Apprentice |
| XR Foundations | 120 | Reality Shifter |
| Robotics | 140 | Robot Wrangler |
| Automations | 130 | Flow Architect |
| World Builder | 160 | World Builder |

The first unique completion adds 50 XP and the First Launch badge. Completing all five adds 250 XP, 100 AMX Coins, and Mission Master. Replaying a quest is allowed but cannot duplicate rewards.

## Proof and persistence

`amxMissionProgress` stores Mission World XP, AMX Coins, six-rank progress, streak, session mode, checkpoint IDs, attempts, completed capstones, badges, and toolbelt/world/avatar unlocks in `localStorage`. The normalization adapter migrates older saved progress without discarding valid completions. Global AMX XP and badges use the existing platform reward store.

Each unique completion creates a signed OPPRRC record through the platform runtime. The report includes the solo, co-op, or team scope and quest identifier. A JPEG frame from the Three.js canvas is attached as visual evidence, uploaded through configured media storage, and exposed with the certificate in the Proof Wallet.

## Interaction

- AI 101, XR Lab, and Automation use governed decision simulations.
- Robotics requires the Sense, Plan, Act sequence.
- World Builder requires three structures placed directly on the Three.js grid.
- Portal meshes and the compact mission dock select quests.
- Reduced-motion preferences stop ambient world animation while preserving interaction.

## Platform layer

- `mission-world/missions.json` is the typed capstone contract for modes, difficulty, objectives, rewards, and evidence.
- `learning-catalog.ts` owns all 30 curriculum checkpoints.
- `mission-engine.ts` owns unlock rules, timer formatting, and objective progress.
- `gamification.ts` owns rewards, the Explorer to World Architect ladder, and unlockables.
- `progress-store.ts` owns normalized persistent state and attempt/checkpoint updates.
- `multiplayer.ts` owns session modes and individual, team, school, organization, community, and seasonal leaderboard scopes.
- `xr-capabilities.ts` reports secure-context, WebXR, AR, VR, controller, and camera availability without inventing support.
- `opprrc.ts` issues lesson-scoped proof and the bounded Three.js evidence frame.

Co-op and team selections are recorded in proof and analytics. Live participants, invitations, voice, and shared leaderboard rows continue through Skill Pods; Mission World does not claim synchronized multiplayer unless a Pod room is active. Non-individual boards intentionally show a connection state until an organization API or Skill Pod supplies real records.
