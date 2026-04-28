export interface GuidanceLesson {
  id: string;
  title: string;
  body: string;
  required: boolean;
}

export interface GuidanceChecklistItem {
  id: string;
  label: string;
  required: boolean;
}

export interface GuidanceSection {
  id: string;
  title: string;
  audience: string;
  description: string;
  actionPath: string;
  lessons: GuidanceLesson[];
  checklist: GuidanceChecklistItem[];
}

export interface GuidanceProgressSummary {
  completedLessonIds: string[];
  completedChecklistIds: string[];
  totalLessons: number;
  totalChecklistItems: number;
  completedLessons: number;
  completedChecklistItems: number;
  requiredLessonIds: string[];
  requiredChecklistIds: string[];
  requiredChecklistComplete: boolean;
  progressPercent: number;
  nextRecommendedStep: string | null;
}

const GUIDANCE_SECTIONS: GuidanceSection[] = [
  {
    id: "core-lms-orientation",
    title: "Core LMS Orientation",
    audience: "all",
    description: "Learn how TECH AT NITE uses LMS credits, certifications, and readiness progress.",
    actionPath: "/lms/dashboard",
    lessons: [
      {
        id: "lesson-lms-credits",
        title: "How LMS credits work",
        body:
          "LMS credits are only for learning. You spend them to enroll in workshops and simulations, and you earn them back through completions.",
        required: true,
      },
    ],
    checklist: [
      {
        id: "check-lms-credits",
        label: "I understand LMS credits are for learning only.",
        required: true,
      },
      {
        id: "check-token-separation",
        label: "I understand AMX tokens are separate from LMS credits.",
        required: true,
      },
    ],
  },
  {
    id: "member-path",
    title: "Member Path",
    audience: "member",
    description: "Understand how to move from LMS learning into marketplace browsing and bookings.",
    actionPath: "/profile",
    lessons: [
      {
        id: "lesson-member-path",
        title: "Member learning flow",
        body:
          "Members use TECH AT NITE to up-skill, track certifications, and prepare for marketplace participation before applying to become partners.",
        required: true,
      },
    ],
    checklist: [
      {
        id: "check-member-browse",
        label: "I know where to browse marketplace listings and wallet balances.",
        required: true,
      },
    ],
  },
  {
    id: "partner-path",
    title: "Partner Path",
    audience: "partner",
    description: "Learn the approval path for becoming a seller in the AMX ecosystem.",
    actionPath: "/profile",
    lessons: [
      {
        id: "lesson-partner-path",
        title: "Partner approval path",
        body:
          "Selecting Partner is only intent. You still need TECH AT NITE readiness and admin approval before you can sell agent, co-op, or team listings.",
        required: true,
      },
    ],
    checklist: [
      {
        id: "check-partner-approval",
        label: "I understand partner application requires guidance completion, LMS readiness, and admin approval.",
        required: true,
      },
    ],
  },
  {
    id: "simulation-pit-stop-live",
    title: "Simulation -> Pit Stop -> Live",
    audience: "all",
    description: "Understand how simulation runs become coaching material and promotion candidates.",
    actionPath: "/pit-stop",
    lessons: [
      {
        id: "lesson-sim-loop",
        title: "How the sim loop works",
        body:
          "Simulation runs create structured outputs, which feed Pit Stop review, coaching, evaluation, and live-promotion requests.",
        required: true,
      },
    ],
    checklist: [
      {
        id: "check-sim-loop",
        label: "I understand that Pit Stop is the review layer between simulation and live promotion.",
        required: true,
      },
    ],
  },
  {
    id: "marketplace-microservices",
    title: "Marketplace Hiring / Microservices",
    audience: "all",
    description: "Learn how bookings, microservice-ready skills, and issue creation work.",
    actionPath: "/xp/exchange",
    lessons: [
      {
        id: "lesson-microservices",
        title: "Microservice booking flow",
        body:
          "Microservice bookings charge AMX tokens, create a tracked issue, and check whether the assigned listing or agent has the required tool bundle.",
        required: true,
      },
    ],
    checklist: [
      {
        id: "check-microservice-skills",
        label: "I know microservice work requires the image, video, audio, and webhook router skills.",
        required: true,
      },
    ],
  },
];

function uniqueSorted(values: unknown) {
  return Array.from(
    new Set(Array.isArray(values) ? values.filter((value): value is string => typeof value === "string") : []),
  ).sort();
}

export function getGuidanceSections(): GuidanceSection[] {
  return GUIDANCE_SECTIONS.map((section) => ({
    ...section,
    lessons: [...section.lessons],
    checklist: [...section.checklist],
  }));
}

export function buildGuidanceProgress(input: {
  completedLessonIds?: unknown;
  completedChecklistIds?: unknown;
}): GuidanceProgressSummary {
  const sections = getGuidanceSections();
  const completedLessonIds = uniqueSorted(input.completedLessonIds);
  const completedChecklistIds = uniqueSorted(input.completedChecklistIds);
  const allLessonIds = sections.flatMap((section) => section.lessons.map((lesson) => lesson.id));
  const allChecklistIds = sections.flatMap((section) => section.checklist.map((item) => item.id));
  const requiredLessonIds = sections.flatMap((section) =>
    section.lessons.filter((lesson) => lesson.required).map((lesson) => lesson.id),
  );
  const requiredChecklistIds = sections.flatMap((section) =>
    section.checklist.filter((item) => item.required).map((item) => item.id),
  );
  const completedLessons = completedLessonIds.filter((id) => allLessonIds.includes(id)).length;
  const completedChecklistItems = completedChecklistIds.filter((id) => allChecklistIds.includes(id)).length;
  const requiredLessonComplete = requiredLessonIds.every((id) => completedLessonIds.includes(id));
  const requiredChecklistComplete = requiredChecklistIds.every((id) => completedChecklistIds.includes(id));
  const totalRequired = requiredLessonIds.length + requiredChecklistIds.length;
  const completedRequired =
    requiredLessonIds.filter((id) => completedLessonIds.includes(id)).length +
    requiredChecklistIds.filter((id) => completedChecklistIds.includes(id)).length;
  const nextIncompleteSection = sections.find(
    (section) =>
      section.lessons.some((lesson) => lesson.required && !completedLessonIds.includes(lesson.id)) ||
      section.checklist.some((item) => item.required && !completedChecklistIds.includes(item.id)),
  );

  return {
    completedLessonIds,
    completedChecklistIds,
    totalLessons: allLessonIds.length,
    totalChecklistItems: allChecklistIds.length,
    completedLessons,
    completedChecklistItems,
    requiredLessonIds,
    requiredChecklistIds,
    requiredChecklistComplete: requiredLessonComplete && requiredChecklistComplete,
    progressPercent: totalRequired === 0 ? 100 : Math.round((completedRequired / totalRequired) * 100),
    nextRecommendedStep: nextIncompleteSection
      ? `Complete ${nextIncompleteSection.title}`
      : "All required LMS onboarding guidance is complete.",
  };
}

export function ensureGuidanceLessonId(lessonId: string) {
  const lesson = GUIDANCE_SECTIONS.flatMap((section) => section.lessons).find((entry) => entry.id === lessonId);
  if (!lesson) {
    throw new Error(`Unknown lesson id: ${lessonId}`);
  }
  return lesson;
}

export function ensureGuidanceChecklistId(checklistId: string) {
  const item = GUIDANCE_SECTIONS.flatMap((section) => section.checklist).find((entry) => entry.id === checklistId);
  if (!item) {
    throw new Error(`Unknown checklist id: ${checklistId}`);
  }
  return item;
}
