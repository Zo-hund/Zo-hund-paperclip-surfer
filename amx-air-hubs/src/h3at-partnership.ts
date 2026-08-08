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
  { id: "education-expert", name: "Education Pathway Guide", brain: "Curriculum, accessibility, assessment, workshops, Pods, and verified learning", skills: ["assess", "teach", "prove"], vision: "Reads the active lesson, rubric, and learner-shared camera frame" },
  { id: "business-expert", name: "Business & Market Coach", brain: "Customer discovery, pricing, operations, entrepreneurship, and safe market simulations", skills: ["research", "simulate", "pitch"], vision: "Reads approved project boards, market evidence, and business dashboards" },
  { id: "entertainment-expert", name: "Entertainment Producer", brain: "Story, live production, podcasting, music, media rights, XR performance, and audience experience", skills: ["produce", "direct", "showcase"], vision: "Reads approved media, rundown, camera, audio, and stage panels" },
  { id: "industry-expert", name: "Industry Simulation Lead", brain: "Digital twins, data centers, automation, robotics, infrastructure, safety, and governed tool use", skills: ["inspect", "simulate", "verify"], vision: "Reads labeled live or simulated telemetry and operator-approved external camera sources" },
  { id: "placement-expert", name: "Skills-to-Placement Coach", brain: "Evidence review, portfolios, employer fit, interviews, apprenticeships, projects, and ethical referrals", skills: ["review", "match", "prepare"], vision: "Reads only learner-approved proof, portfolio artifacts, and opportunity requirements" },
];

export const h3atEventLadder = [
  { cadence: "Weekly", title: "Community Project Expo", purpose: "Critique work, verify checkpoints, and promote ready projects", gate: "Trainer review" },
  { cadence: "Monthly", title: "Skills & Industry Summit", purpose: "Partner workshops, pitches, team formation, and opportunity matching", gate: "Partner review" },
  { cadence: "Quarterly", title: "AMX XR Con", purpose: "Advanced demos, recruiting rooms, live productions, and cross-tenant showcases", gate: "Stage approval" },
  { cadence: "Yearly", title: "Global XR Con", purpose: "Verified community projects, global partners, credentials, and placement pathways", gate: "Portfolio + consent" },
];

export const h3atRemoteControls = [
  { action: "page.read", approval: "member", detail: "Read visible Pod page structure and current learning context" },
  { action: "page.navigate", approval: "operator", detail: "Navigate an approved Pod display to a permitted route" },
  { action: "content.present", approval: "trainer", detail: "Present a lesson, rubric, media asset, or expert resource" },
  { action: "vision.inspect", approval: "member", detail: "Inspect a user-shared frame with a visible live indicator" },
  { action: "tool.invoke", approval: "operator", detail: "Invoke an allowlisted H3AT or AMX Management API tool" },
  { action: "proof.write", approval: "trainer", detail: "Write reviewed evidence to the learner Talent Passport" },
];
