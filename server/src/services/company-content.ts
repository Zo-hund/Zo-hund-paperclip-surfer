import { eq, and, asc, or } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { companyStaff, companyEvents, companyLogos } from "@paperclipai/db";

export function companyContentService(db: Db) {
  return {
    listStaff: (companyId: string) =>
      db
        .select()
        .from(companyStaff)
        .where(eq(companyStaff.companyId, companyId))
        .orderBy(asc(companyStaff.sortOrder)),

    listPublishedStaff: (companyId: string) =>
      db
        .select()
        .from(companyStaff)
        .where(and(eq(companyStaff.companyId, companyId), eq(companyStaff.isActive, true)))
        .orderBy(asc(companyStaff.sortOrder)),

    getStaffById: (id: string) =>
      db.select().from(companyStaff).where(eq(companyStaff.id, id)).then((rows) => rows[0] ?? null),

    createStaff: (companyId: string, data: Omit<typeof companyStaff.$inferInsert, "companyId">) =>
      db
        .insert(companyStaff)
        .values({ ...data, companyId })
        .returning()
        .then((rows) => rows[0]),

    updateStaff: (id: string, data: Partial<typeof companyStaff.$inferInsert>) =>
      db
        .update(companyStaff)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(companyStaff.id, id))
        .returning()
        .then((rows) => rows[0] ?? null),

    deleteStaff: (id: string) => db.delete(companyStaff).where(eq(companyStaff.id, id)),

    listEvents: (companyId: string) =>
      db
        .select()
        .from(companyEvents)
        .where(eq(companyEvents.companyId, companyId))
        .orderBy(asc(companyEvents.startDate)),

    listPublishedEvents: (companyId: string) =>
      db
        .select()
        .from(companyEvents)
        .where(and(eq(companyEvents.companyId, companyId), eq(companyEvents.isPublished, true)))
        .orderBy(asc(companyEvents.startDate)),

    getEventById: (id: string) =>
      db.select().from(companyEvents).where(eq(companyEvents.id, id)).then((rows) => rows[0] ?? null),

    createEvent: (companyId: string, data: Omit<typeof companyEvents.$inferInsert, "companyId">) =>
      db
        .insert(companyEvents)
        .values({ ...data, companyId })
        .returning()
        .then((rows) => rows[0]),

    updateEvent: (id: string, data: Partial<typeof companyEvents.$inferInsert>) =>
      db
        .update(companyEvents)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(companyEvents.id, id))
        .returning()
        .then((rows) => rows[0] ?? null),

    deleteEvent: (id: string) => db.delete(companyEvents).where(eq(companyEvents.id, id)),

    // Used by the scoped public asset route: an asset may only be served
    // unauthenticated if it's referenced by a published staff/event row.
    isAssetPubliclyReferenced: async (assetId: string) => {
      // Company logos are public branding — the guest meeting lobby (an
      // unauthenticated page) renders them via the public asset route.
      const logoMatch = await db
        .select({ id: companyLogos.id })
        .from(companyLogos)
        .where(eq(companyLogos.assetId, assetId))
        .then((rows) => rows[0] ?? null);
      if (logoMatch) return true;

      const staffMatch = await db
        .select({ id: companyStaff.id })
        .from(companyStaff)
        .where(and(eq(companyStaff.photoAssetId, assetId), eq(companyStaff.isActive, true)))
        .then((rows) => rows[0] ?? null);
      if (staffMatch) return true;

      const eventMatch = await db
        .select({ id: companyEvents.id })
        .from(companyEvents)
        .where(
          and(
            or(eq(companyEvents.flyerAssetId, assetId), eq(companyEvents.qrCodeAssetId, assetId)),
            eq(companyEvents.isPublished, true),
          ),
        )
        .then((rows) => rows[0] ?? null);
      return Boolean(eventMatch);
    },
  };
}
