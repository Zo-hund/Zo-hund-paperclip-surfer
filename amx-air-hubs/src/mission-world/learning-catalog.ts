import type { LearningLesson, MissionWorldId } from "./types";

const lesson = (id: string, title: string, brief: string, practice: string): LearningLesson => ({ id, title, brief, practice });

export const LEARNING_CATALOG: Record<MissionWorldId, LearningLesson[]> = {
  ai: [
    lesson("what-ai-is", "What AI is", "Recognize AI as a system that finds patterns and produces predictions or generated outputs.", "Separate an AI capability from a fixed software rule."),
    lesson("prompts-instructions", "Prompts and instructions", "Write context, a clear task, constraints, and an output format an assistant can follow.", "Turn a vague request into a testable instruction."),
    lesson("ai-agents", "AI agents", "Connect a model to memory, tools, goals, and approval boundaries.", "Choose which action an agent may perform and which needs approval."),
    lesson("responsible-ai", "Responsible AI", "Apply privacy, transparency, safety, and human oversight before deployment.", "Rewrite an unsafe camera request into a bounded task."),
    lesson("data-bias", "Data and bias", "Inspect how incomplete or unbalanced data can distort an AI system's output.", "Identify a missing perspective in a sample dataset."),
    lesson("simple-assistant", "Build a simple AI assistant", "Combine role, instructions, knowledge, tools, and a success check.", "Draft and test an assistant for a community task."),
  ],
  xr: [
    lesson("ar-vr-mr", "AR vs VR vs MR", "Compare overlays, fully immersive worlds, and spatially aware mixed reality.", "Select the correct mode for a learning scenario."),
    lesson("spatial-computing", "Spatial computing", "Use position, rotation, scale, room geometry, and anchors to design in space.", "Place a stable learning station in a room."),
    lesson("headset-safety", "Headset safety", "Protect boundaries, comfort, accessibility, privacy, and session duration.", "Run a pre-flight headset safety check."),
    lesson("controllers-hands", "Controllers and hand tracking", "Map select, squeeze, grab, ray, and hand gestures to predictable actions.", "Choose an accessible interaction fallback."),
    lesson("3d-interaction", "3D interaction", "Design selection, manipulation, locomotion, feedback, and recovery in three dimensions.", "Transform an object without losing spatial context."),
    lesson("build-xr-scene", "Build an XR scene", "Combine lighting, anchors, interactions, and performance budgets into a testable scene.", "Assemble and validate a small XR learning station."),
  ],
  robotics: [
    lesson("sensors", "Sensors", "Read distance, light, motion, and environmental signals as uncertain measurements.", "Choose a sensor for obstacle detection."),
    lesson("motors-movement", "Motors and movement", "Translate speed and direction commands into controlled physical motion.", "Balance two drive motors for a straight path."),
    lesson("inputs-outputs", "Inputs and outputs", "Map sensor inputs to motor, light, sound, or actuator outputs.", "Trace one complete input-output loop."),
    lesson("robot-logic", "Robot logic", "Use conditions, loops, state, and fail-safe behavior to govern a robot.", "Write a stop condition for an unsafe state."),
    lesson("navigation", "Navigation and obstacle avoidance", "Combine sensing, planning, movement, and replanning around obstacles.", "Choose a route when the direct path is blocked."),
    lesson("mission-robot", "Program a mission robot", "Integrate the Sense, Plan, Act loop into a measurable mission.", "Sequence the rover control loop and verify the result."),
  ],
  automation: [
    lesson("triggers-actions", "Triggers and actions", "Start workflows from reliable events and produce explicit outcomes.", "Connect one event to one reversible action."),
    lesson("workflow-logic", "Workflow logic", "Use branching, conditions, retries, and state to make workflows resilient.", "Add a recovery branch to a failed step."),
    lesson("human-approval", "Human approval", "Pause high-impact actions for an accountable operator decision.", "Place an approval gate before physical change."),
    lesson("apis-integrations", "APIs and integrations", "Exchange authenticated, validated data between services.", "Map an API response into a workflow input."),
    lesson("agent-workflows", "Agent workflows", "Let agents plan and call tools inside observable boundaries.", "Review an agent tool trace before execution."),
    lesson("automation-pipeline", "Build an automation pipeline", "Join trigger, validation, agent work, approval, action, and reporting.", "Build and test an end-to-end governed pipeline."),
  ],
  builder: [
    lesson("add-objects", "Add 3D objects", "Choose useful primitives or assets and place them with a clear purpose.", "Add a structure to the world grid."),
    lesson("transform", "Move, rotate, and scale", "Use transforms while preserving alignment, reach, and proportion.", "Position an object inside a reachable zone."),
    lesson("materials-lighting", "Materials and lighting", "Balance readable materials, efficient lighting, contrast, and performance.", "Light a prop so its shape remains visible."),
    lesson("portals-environments", "Portals and environments", "Connect spaces with clear destinations, transitions, and return paths.", "Define a portal between two learning zones."),
    lesson("npcs-mission-objects", "NPCs and mission objects", "Give characters and objects roles, state, feedback, and tool boundaries.", "Assign an NPC one contextual mission action."),
    lesson("save-publish", "Save and publish a world", "Validate state, evidence, permissions, performance, and release metadata.", "Run the publish checklist and issue a version."),
  ],
};
