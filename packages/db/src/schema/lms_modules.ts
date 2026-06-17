import { pgTable, uuid, text, timestamp, integer, jsonb, index } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { lmsWorkshops, lmsEnrollments } from "./lms_training.js";

export interface QuizQuestion {
  prompt: string;
  options: string[];
  correctIndex: number;
}

/**
 * LMS Modules — individual learning units within a workshop.
 * Supports 4 content types: video_upload, video_embed (YouTube/Vimeo),
 * audio_upload, ai_narration (OpenAI TTS).
 */
export const lmsModules = pgTable(
  "lms_modules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workshopId: uuid("workshop_id").notNull().references(() => lmsWorkshops.id),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    title: text("title").notNull(),
    description: text("description"),
    orderIndex: integer("order_index").notNull().default(0),
    // video_upload | video_embed | audio_upload | ai_narration
    contentType: text("content_type").notNull().default("video_embed"),
    contentUrl: text("content_url"), // asset URL or YouTube/Vimeo embed URL
    contentText: text("content_text"), // source text for AI TTS generation
    aiNarrationUrl: text("ai_narration_url"), // cached OpenAI TTS output asset URL
    durationSeconds: integer("duration_seconds"),
    quizData: jsonb("quiz_data").$type<{ questions: QuizQuestion[] }>(),
    // immediate | completion | time
    unlockCondition: text("unlock_condition").notNull().default("immediate"),
    prerequisiteModuleId: uuid("prerequisite_module_id"), // self-ref
    unlockDelayHours: integer("unlock_delay_hours"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    workshopOrderIdx: index("lms_module_workshop_order_idx").on(table.workshopId, table.orderIndex),
    companyIdx: index("lms_module_company_idx").on(table.companyId),
  }),
);

/**
 * Per-learner module progress — tracks watch time, quiz scores, completion.
 */
export const lmsModuleProgress = pgTable(
  "lms_module_progress",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    memberId: text("member_id").notNull(), // userId
    moduleId: uuid("module_id").notNull().references(() => lmsModules.id),
    enrollmentId: uuid("enrollment_id").references(() => lmsEnrollments.id),
    watchedSeconds: integer("watched_seconds").notNull().default(0),
    totalSeconds: integer("total_seconds"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    quizScore: integer("quiz_score"), // 0–100
    quizAttempts: integer("quiz_attempts").notNull().default(0),
    lastWatchedAt: timestamp("last_watched_at", { withTimezone: true }),
  },
  (table) => ({
    memberModuleIdx: index("lms_module_progress_member_module_idx").on(table.memberId, table.moduleId),
    moduleIdx: index("lms_module_progress_module_idx").on(table.moduleId),
  }),
);
