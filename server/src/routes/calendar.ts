/**
 * Unified marketplace calendar — merges directly-authored companyEvents
 * with scheduled lmsMarketplaceBookings (the client-picked engagement
 * window set on `POST /lms/marketplace/bookings`) into one browsable feed.
 */
import { Router } from "express";
import { and, asc, eq, gte, isNotNull, lte } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { companyEvents, lmsMarketplaceBookings, lmsMarketplaceListings } from "@paperclipai/db";
import { z } from "zod";
import { validate } from "../middleware/validate.js";
import { assertCompanyAccess, assertCompanyRole } from "./authz.js";

const DAY_MS = 24 * 60 * 60 * 1000;

const calendarQuerySchema = z.object({
  since: z.string().datetime().optional(),
  until: z.string().datetime().optional(),
});

const eventCreateSchema = z.object({
  title: z.string().min(1),
  subtitle: z.string().optional(),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  description: z.string().optional(),
  eventType: z.string().optional(),
  isPublished: z.boolean().optional(),
});

const eventUpdateSchema = z.object({
  title: z.string().min(1).optional(),
  subtitle: z.string().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  description: z.string().optional(),
  eventType: z.string().optional(),
  isPublished: z.boolean().optional(),
});

export function calendarRoutes(db: Db) {
  const router = Router();

  /**
   * GET /api/companies/:companyId/calendar
   * `since`/`until` default to a 30-days-back / 90-days-forward window when
   * omitted. Returns a UNION of company_events and scheduled marketplace
   * bookings, normalized to a single event shape and sorted by start time.
   */
  router.get("/companies/:companyId/calendar", async (req, res) => {
    const { companyId } = req.params as { companyId: string };
    assertCompanyAccess(req, companyId);

    const parsed = calendarQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid query", details: parsed.error.flatten() });
      return;
    }

    const now = Date.now();
    const since = parsed.data.since ? new Date(parsed.data.since) : new Date(now - 30 * DAY_MS);
    const until = parsed.data.until ? new Date(parsed.data.until) : new Date(now + 90 * DAY_MS);

    const [eventRows, bookingRows] = await Promise.all([
      db.select().from(companyEvents)
        .where(and(
          eq(companyEvents.companyId, companyId),
          gte(companyEvents.startDate, since),
          lte(companyEvents.startDate, until),
        ))
        .orderBy(asc(companyEvents.startDate)),
      db.select({
        id: lmsMarketplaceBookings.id,
        projectTitle: lmsMarketplaceBookings.projectTitle,
        scheduledStartAt: lmsMarketplaceBookings.scheduledStartAt,
        scheduledEndAt: lmsMarketplaceBookings.scheduledEndAt,
        status: lmsMarketplaceBookings.status,
        listingId: lmsMarketplaceBookings.listingId,
        listingDisplayName: lmsMarketplaceListings.displayName,
      })
        .from(lmsMarketplaceBookings)
        .leftJoin(lmsMarketplaceListings, eq(lmsMarketplaceBookings.listingId, lmsMarketplaceListings.id))
        .where(and(
          eq(lmsMarketplaceBookings.companyId, companyId),
          isNotNull(lmsMarketplaceBookings.scheduledStartAt),
          gte(lmsMarketplaceBookings.scheduledStartAt, since),
          lte(lmsMarketplaceBookings.scheduledStartAt, until),
        ))
        .orderBy(asc(lmsMarketplaceBookings.scheduledStartAt)),
    ]);

    const events = [
      ...eventRows.map((e) => ({
        id: e.id,
        title: e.title,
        startAt: e.startDate.toISOString(),
        endAt: e.endDate.toISOString(),
        kind: "company_event" as const,
        eventType: e.eventType,
        status: e.isPublished ? "published" : "draft",
        href: `/companies/${companyId}/events/${e.id}`,
      })),
      ...bookingRows.map((b) => ({
        id: b.id,
        title: b.projectTitle || `Booking with ${b.listingDisplayName ?? "provider"}`,
        // scheduledStartAt is guaranteed non-null by the isNotNull() filter
        // above; scheduledEndAt falls back to it defensively in case older
        // data ever has one without the other.
        startAt: b.scheduledStartAt!.toISOString(),
        endAt: (b.scheduledEndAt ?? b.scheduledStartAt)!.toISOString(),
        kind: "marketplace_booking" as const,
        status: b.status,
        href: `/companies/${companyId}/marketplace/agent/${b.listingId}`,
      })),
    ].sort((a, b) => a.startAt.localeCompare(b.startAt));

    res.json({ events });
  });

  /**
   * POST /api/companies/:companyId/events
   * Admin-only — directly authors a company_events row (workshop, board
   * meeting, community event, etc).
   */
  router.post("/companies/:companyId/events", validate(eventCreateSchema), async (req, res) => {
    const { companyId } = req.params as { companyId: string };
    assertCompanyAccess(req, companyId);
    assertCompanyRole(req, companyId, "admin");
    const body = req.body as z.infer<typeof eventCreateSchema>;

    const [row] = await db.insert(companyEvents).values({
      companyId,
      title: body.title,
      subtitle: body.subtitle,
      startDate: new Date(body.startDate),
      endDate: new Date(body.endDate),
      description: body.description,
      eventType: body.eventType ?? "general",
      isPublished: body.isPublished ?? true,
    }).returning();

    res.status(201).json(row);
  });

  /**
   * PATCH /api/companies/:companyId/events/:eventId
   * Admin-only partial update. 404s when the event doesn't belong to
   * this company.
   */
  router.patch("/companies/:companyId/events/:eventId", validate(eventUpdateSchema), async (req, res) => {
    const { companyId, eventId } = req.params as { companyId: string; eventId: string };
    assertCompanyAccess(req, companyId);
    assertCompanyRole(req, companyId, "admin");
    const body = req.body as z.infer<typeof eventUpdateSchema>;

    const [existing] = await db.select({ id: companyEvents.id }).from(companyEvents)
      .where(and(eq(companyEvents.id, eventId), eq(companyEvents.companyId, companyId)))
      .limit(1);
    if (!existing) {
      res.status(404).json({ error: "Event not found" });
      return;
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (body.title !== undefined) updates.title = body.title;
    if (body.subtitle !== undefined) updates.subtitle = body.subtitle;
    if (body.startDate !== undefined) updates.startDate = new Date(body.startDate);
    if (body.endDate !== undefined) updates.endDate = new Date(body.endDate);
    if (body.description !== undefined) updates.description = body.description;
    if (body.eventType !== undefined) updates.eventType = body.eventType;
    if (body.isPublished !== undefined) updates.isPublished = body.isPublished;

    const [row] = await db.update(companyEvents)
      .set(updates)
      .where(eq(companyEvents.id, eventId))
      .returning();

    res.json(row);
  });

  return router;
}
