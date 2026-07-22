# AMX Mission World

AMX Mission World is the native playable layer at `/missions/world`. Members enter it from the Mission Runway at `/missions`. It is organized as two connected layers: a learner-facing curriculum and a platform runtime behind it.

## Learner layer

AI 101, XR Foundations, Robotics, Automations, and World Builder each contain six persistent checkpoints. A checkpoint presents a short concept and an applied `DO` task. Finishing all six unlocks that module's interactive capstone, producing 30 checkpoints and five capstones in total.

The capstones run in the native Three.js scene as real-client simulators, not trivia. The runtime timer resets when the learner changes worlds. World Builder placement remains disabled until its learning path is complete.

## Simulator loop

Each client mission follows the same operating loop:

1. Read the client need, required outcome, budget, time limit, and success measures.
2. Assign a professional role.
3. Equip costed domain tools and safety controls.
4. Write a solution plan and complete domain work such as robot logic or 3D placement.
5. Run a deterministic scenario with an injected operational event.
6. Review strengths, consequences, resource use, and seven weighted score dimensions.
7. Improve the configuration and rerun. Each run advances to the next event while retaining the best score.
8. Pass the safety gate and record a human Pit Stop approval.
9. Deploy the simulated solution and issue OPPRRC evidence.

The five client missions are a nonprofit community support agent, a 120-learner XR career expo, a community-center delivery robot, a 120-seat event operations workflow, and an AR/MR pop-up learning hub.

## Scoring and safety

The score weights outcome quality at 30%, technical accuracy at 20%, safety at 15%, efficiency, creativity, and teamwork at 10% each, and evidence quality at 5%. A score of 70 is the minimum deployment threshold. Missing a critical safety control, assigning no responsible role, or exceeding the client budget blocks deployment regardless of the weighted total.

Tool and safeguard costs consume both credits and build minutes. Dynamic events test whether the selected configuration can actually recover from inaccurate AI output, sensitive data, arrival surges, headset slowdown, sensor failure, blocked routes, capacity overflow, API limits, room changes, and traffic conflicts.

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

Each unique completion creates a signed OPPRRC record through the platform runtime. The report includes the session scope, quest, professional role, weighted score, equipped tools, safety controls, injected event, and Pit Stop approval. A JPEG frame from the Three.js canvas is attached as visual evidence, uploaded through configured media storage, and exposed with the certificate in the Proof Wallet.

## Interaction

- AI 101 requires a grounded support-agent configuration with privacy and escalation.
- XR Foundations requires an accessible, capacity-aware career expo configuration.
- Robotics combines a costed control system with the Sense, Plan, Act sequence.
- Automations requires a validated registration-to-report workflow.
- World Builder combines a safe hub configuration with three structures placed directly on the Three.js grid.
- Portal meshes and the compact mission dock select quests.
- Reduced-motion preferences stop ambient world animation while preserving interaction.

## Platform layer

- `mission-world/missions.json` is the typed capstone contract for modes, difficulty, objectives, rewards, and evidence.
- `learning-catalog.ts` owns all 30 curriculum checkpoints.
- `mission-engine.ts` owns unlock rules, timer formatting, and objective progress.
- `simulator.ts` owns client scenarios, roles, tools, safeguards, resources, dynamic events, consequences, weighted scoring, and deployment eligibility.
- `gamification.ts` owns rewards, the Explorer to World Architect ladder, and unlockables.
- `progress-store.ts` owns normalized persistent state and attempt/checkpoint updates.
- `multiplayer.ts` owns session modes and individual, team, school, organization, community, and seasonal leaderboard scopes.
- `xr-capabilities.ts` reports secure-context, WebXR, AR, VR, controller, and camera availability without inventing support.
- `opprrc.ts` issues lesson-scoped proof and the bounded Three.js evidence frame.

Co-op and team selections are recorded in proof and analytics. Live participants, invitations, voice, and shared leaderboard rows continue through Skill Pods; Mission World does not claim synchronized multiplayer unless a Pod room is active. Non-individual boards intentionally show a connection state until an organization API or Skill Pod supplies real records.
