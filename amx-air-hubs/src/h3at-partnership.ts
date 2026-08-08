export const h3atTracks = [
  { id: "digital-foundations", title: "Digital Foundations", skills: ["Digital literacy", "Cloud", "Cybersecurity awareness", "Professional communication"], outcome: "Workforce-ready digital baseline", pod: "solo" },
  { id: "ai-workforce", title: "AI Workforce Academy", skills: ["Generative AI", "Prompt engineering", "AI workflows", "Responsible AI"], outcome: "Deploy an approved AI-assisted workflow", pod: "co-op" },
  { id: "technology-career", title: "Technology Career Academy", skills: ["IT support", "Data analytics", "Cloud", "Automation"], outcome: "Complete a portfolio-ready client simulation", pod: "team" },
  { id: "business-technology", title: "Business Technology Academy", skills: ["AI adoption", "CRM", "Digital operations", "Technology strategy"], outcome: "Deliver a measurable business improvement plan", pod: "team" },
];

export const h3atSimulationStages = [
  { id: "learn", title: "Learn", detail: "Grounded expert guidance, lessons, and checks", gate: "Knowledge check" },
  { id: "simulate", title: "Simulate", detail: "Practice against a safe digital twin or business scenario", gate: "Scenario proof" },
  { id: "assist", title: "Assisted Live", detail: "Human expert supervises agent-supported project delivery", gate: "Expert approval" },
  { id: "live", title: "Live Project", detail: "Deliver within the H3AT business and employer ecosystem", gate: "Client acceptance" },
  { id: "earn", title: "Work + Earn", detail: "Publish verified proof to the Talent Passport", gate: "OPPRRC credential" },
];

export const h3atAgents = [
  { id: "h3at-coach", name: "H3AT Workforce Coach", brain: "H3AT workforce pathways, AMX curriculum, career readiness", skills: ["assess", "guide", "reflect"], vision: "Reads the active lesson, rubric, and learner-shared camera frame" },
  { id: "h3at-builder", name: "H3AT Project Architect", brain: "Client challenge, scope, delivery standards, technology implementation", skills: ["scope", "plan", "review"], vision: "Reads Pod pages, project boards, dashboards, and approved artifacts" },
  { id: "h3at-operator", name: "H3AT Operations Agent", brain: "Runbook, safety policy, approval matrix, Management API contract", skills: ["navigate", "present", "tool-call"], vision: "Observes only operator-approved browser, XR, or external camera sources" },
];

export const h3atRemoteControls = [
  { action: "page.read", approval: "member", detail: "Read visible Pod page structure and current learning context" },
  { action: "page.navigate", approval: "operator", detail: "Navigate an approved Pod display to a permitted route" },
  { action: "content.present", approval: "trainer", detail: "Present a lesson, rubric, media asset, or expert resource" },
  { action: "vision.inspect", approval: "member", detail: "Inspect a user-shared frame with a visible live indicator" },
  { action: "tool.invoke", approval: "operator", detail: "Invoke an allowlisted H3AT or AMX Management API tool" },
  { action: "proof.write", approval: "trainer", detail: "Write reviewed evidence to the learner Talent Passport" },
];
