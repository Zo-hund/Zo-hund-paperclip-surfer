import express from "express";
import request from "supertest";
import { getTableName, type Table } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { calendarRoutes } from "../routes/calendar.js";
import { lmsRoutes } from "../routes/lms.js";
import { errorHandler } from "../middleware/index.js";

const COMPANY = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

vi.mock("../services/amxChainService.js", () => ({ amxChainService: () => ({}) }));

const admin = {
  type: "board", source: "session", userId: "admin-1",
  companyIds: [COMPANY], companyRoles: { [COMPANY]: "admin" },
};
const member = {
  type: "board", source: "session", userId: "member-1",
  companyIds: [COMPANY], companyRoles: { [COMPANY]: "member" },
};
const outsider = {
  type: "board", source: "session", userId: "outsider-1",
  companyIds: ["bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"], companyRoles: {},
};

// ---------------------------------------------------------------------------
// GET /companies/:companyId/calendar
// ---------------------------------------------------------------------------

/** Fake db for the calendar GET route's parallel companyEvents + scheduled-
 * bookings queries (Promise.all, left-to-right, so the events query always
 * consumes the queue before the bookings query). The events query chains
 * .from().where().orderBy(); the bookings query chains
 * .from().leftJoin().where().orderBy() — both terminal shapes are exposed
 * off the same from() result, same technique as chain-tracking.test.ts's
 * createInstanceDirectoryFakeDb. */
function createCalendarFakeDb(queue: unknown[][]) {
  let call = 0;
  function terminal(rows: unknown[]) {
    return { orderBy: async () => rows };
  }
  const db = {
    select: () => ({
      from: () => ({
        leftJoin: () => ({ where: () => terminal(queue[call++] ?? []) }),
        where: () => terminal(queue[call++] ?? []),
      }),
    }),
  };
  return db as never;
}

function createCalendarApp(actor: Record<string, unknown>, queue: unknown[][]) {
  const db = createCalendarFakeDb(queue);
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as never as { actor: unknown }).actor = actor;
    next();
  });
  app.use("/api", calendarRoutes(db));
  app.use(errorHandler);
  return app;
}

const COMPANY_EVENT_ROW = {
  id: "evt-1",
  companyId: COMPANY,
  title: "Career Day",
  startDate: new Date("2026-07-05T10:00:00Z"),
  endDate: new Date("2026-07-05T12:00:00Z"),
  eventType: "workshop",
  isPublished: true,
};

const BOOKING_ROW = {
  id: "bk-1",
  projectTitle: "Design Sprint",
  scheduledStartAt: new Date("2026-07-06T14:00:00Z"),
  scheduledEndAt: new Date("2026-07-06T18:00:00Z"),
  status: "active",
  listingId: "listing-1",
  listingDisplayName: "Jane Doe",
};

describe("GET /companies/:companyId/calendar", () => {
  afterEach(() => vi.clearAllMocks());

  it("merges companyEvents and scheduled bookings within range, sorted by start time", async () => {
    const app = createCalendarApp(member, [[COMPANY_EVENT_ROW], [BOOKING_ROW]]);
    const res = await request(app).get(`/api/companies/${COMPANY}/calendar`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      events: [
        {
          id: "evt-1",
          title: "Career Day",
          startAt: "2026-07-05T10:00:00.000Z",
          endAt: "2026-07-05T12:00:00.000Z",
          kind: "company_event",
          eventType: "workshop",
          status: "published",
          href: `/companies/${COMPANY}/events/evt-1`,
        },
        {
          id: "bk-1",
          title: "Design Sprint",
          startAt: "2026-07-06T14:00:00.000Z",
          endAt: "2026-07-06T18:00:00.000Z",
          kind: "marketplace_booking",
          status: "active",
          href: `/companies/${COMPANY}/marketplace/agent/listing-1`,
        },
      ],
    });
  });

  it("falls back to a listing-display-name title when a scheduled booking has no projectTitle", async () => {
    const app = createCalendarApp(member, [[], [{ ...BOOKING_ROW, projectTitle: "" }]]);
    const res = await request(app).get(`/api/companies/${COMPANY}/calendar`);
    expect(res.status).toBe(200);
    expect(res.body.events[0].title).toBe("Booking with Jane Doe");
  });

  it("returns an empty list when nothing is in range", async () => {
    const app = createCalendarApp(member, [[], []]);
    const res = await request(app).get(`/api/companies/${COMPANY}/calendar`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ events: [] });
  });

  it("rejects a caller with no access to the target company (403)", async () => {
    const app = createCalendarApp(outsider, [[], []]);
    const res = await request(app).get(`/api/companies/${COMPANY}/calendar`);
    expect(res.status).toBe(403);
  });

  it("accepts explicit since/until query params", async () => {
    const app = createCalendarApp(member, [[COMPANY_EVENT_ROW], []]);
    const res = await request(app)
      .get(`/api/companies/${COMPANY}/calendar`)
      .query({ since: "2026-07-01T00:00:00Z", until: "2026-07-31T00:00:00Z" });
    expect(res.status).toBe(200);
    expect(res.body.events).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// POST /companies/:companyId/events, PATCH /companies/:companyId/events/:eventId
// ---------------------------------------------------------------------------

function createEventsStatefulDb(selectQueue: unknown[][] = []) {
  const queue = [...selectQueue];
  const state = {
    updates: [] as Array<{ table: string; values: Record<string, unknown> }>,
    inserts: [] as Array<{ table: string; values: Record<string, unknown> }>,
  };
  const db = {
    select: (proj?: unknown) => ({
      from: () => ({
        where: () => ({
          limit: async () => queue.shift() ?? [],
        }),
      }),
    }),
    update: (table: Table) => ({
      set: (values: Record<string, unknown>) => ({
        where: () => {
          state.updates.push({ table: getTableName(table), values });
          return { returning: async () => [{ id: "evt-updated", ...values }] };
        },
      }),
    }),
    insert: (table: Table) => ({
      values: (values: Record<string, unknown>) => {
        state.inserts.push({ table: getTableName(table), values });
        return { returning: async () => [{ id: "evt-new", ...values }] };
      },
    }),
  };
  return { db: db as never, state };
}

function createEventsApp(actor: Record<string, unknown>, selectQueue: unknown[][] = []) {
  const { db, state } = createEventsStatefulDb(selectQueue);
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as never as { actor: unknown }).actor = actor;
    next();
  });
  app.use("/api", calendarRoutes(db));
  app.use(errorHandler);
  return { app, state };
}

describe("POST /companies/:companyId/events", () => {
  afterEach(() => vi.clearAllMocks());

  it("rejects a non-admin member (403)", async () => {
    const { app } = createEventsApp(member);
    const res = await request(app)
      .post(`/api/companies/${COMPANY}/events`)
      .send({ title: "Career Day", startDate: "2026-07-05T10:00:00Z", endDate: "2026-07-05T12:00:00Z" });
    expect(res.status).toBe(403);
  });

  it("creates a company_events row for an admin", async () => {
    const { app, state } = createEventsApp(admin);
    const res = await request(app)
      .post(`/api/companies/${COMPANY}/events`)
      .send({ title: "Career Day", startDate: "2026-07-05T10:00:00Z", endDate: "2026-07-05T12:00:00Z", eventType: "workshop" });

    expect(res.status).toBe(201);
    expect(state.inserts[0]!.table).toBe("company_events");
    expect(state.inserts[0]!.values).toMatchObject({ companyId: COMPANY, title: "Career Day", eventType: "workshop" });
  });
});

describe("PATCH /companies/:companyId/events/:eventId", () => {
  afterEach(() => vi.clearAllMocks());

  it("rejects a non-admin member (403)", async () => {
    const { app } = createEventsApp(member);
    const res = await request(app)
      .patch(`/api/companies/${COMPANY}/events/evt-1`)
      .send({ title: "Renamed" });
    expect(res.status).toBe(403);
  });

  it("returns 404 for an event outside the company", async () => {
    const { app } = createEventsApp(admin, [[]]);
    const res = await request(app)
      .patch(`/api/companies/${COMPANY}/events/ghost`)
      .send({ title: "Renamed" });
    expect(res.status).toBe(404);
  });

  it("updates an event's fields for an admin", async () => {
    const { app, state } = createEventsApp(admin, [[{ id: "evt-1" }]]);
    const res = await request(app)
      .patch(`/api/companies/${COMPANY}/events/evt-1`)
      .send({ title: "Renamed Career Day" });

    expect(res.status).toBe(200);
    expect(state.updates[0]!.table).toBe("company_events");
    expect(state.updates[0]!.values).toMatchObject({ title: "Renamed Career Day" });
  });
});

// ---------------------------------------------------------------------------
// POST /companies/:companyId/lms/marketplace/bookings — scheduling
// ---------------------------------------------------------------------------

/** Stateful fake db (marketplace-moderation.test.ts / marketplace-phase-
 * earnings.test.ts style): select() only matters when budgetSims > 0 (not
 * exercised here — all booking tests below use budgetSims: 0 to skip the
 * ledger-charge branch and isolate the scheduling behavior under test). */
function createBookingStatefulDb(selectQueue: unknown[][] = []) {
  const queue = [...selectQueue];
  const state = {
    inserts: [] as Array<{ table: string; values: Record<string, unknown> }>,
  };
  const db = {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => queue.shift() ?? [],
        }),
      }),
    }),
    insert: (table: Table) => ({
      values: (values: Record<string, unknown>) => {
        state.inserts.push({ table: getTableName(table), values });
        return { returning: async () => [{ id: "booking-1", ...values }] };
      },
    }),
  };
  return { db: db as never, state };
}

function createBookingApp(actor: Record<string, unknown>, selectQueue: unknown[][] = []) {
  const { db, state } = createBookingStatefulDb(selectQueue);
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as never as { actor: unknown }).actor = actor;
    next();
  });
  app.use("/api", lmsRoutes(db));
  app.use(errorHandler);
  return { app, state };
}

const BASE_BOOKING_BODY = {
  listingId: "11111111-1111-4111-8111-111111111111",
  clientMemberId: "member-1",
  projectTitle: "Scheduled engagement",
  budgetSims: 0,
};

describe("POST /companies/:companyId/lms/marketplace/bookings — scheduling", () => {
  afterEach(() => vi.clearAllMocks());

  it("persists scheduledStartAt/scheduledEndAt and creates a matching companyEvents row", async () => {
    const { app, state } = createBookingApp(member);
    const res = await request(app)
      .post(`/api/companies/${COMPANY}/lms/marketplace/bookings`)
      .send({
        ...BASE_BOOKING_BODY,
        scheduledStartAt: "2026-08-01T10:00:00Z",
        scheduledEndAt: "2026-08-01T14:00:00Z",
      });

    expect(res.status).toBe(201);
    expect(state.inserts).toHaveLength(2);
    expect(state.inserts[0]!.table).toBe("lms_marketplace_bookings");
    expect(state.inserts[0]!.values).toMatchObject({
      scheduledStartAt: new Date("2026-08-01T10:00:00Z"),
      scheduledEndAt: new Date("2026-08-01T14:00:00Z"),
    });
    expect(state.inserts[1]!.table).toBe("company_events");
    expect(state.inserts[1]!.values).toMatchObject({
      companyId: COMPANY,
      title: "Scheduled engagement",
      eventType: "marketplace",
      sourceBookingId: "booking-1",
      startDate: new Date("2026-08-01T10:00:00Z"),
      endDate: new Date("2026-08-01T14:00:00Z"),
    });
  });

  it("rejects a request with only one of scheduledStartAt/scheduledEndAt (400)", async () => {
    const { app } = createBookingApp(member);
    const res = await request(app)
      .post(`/api/companies/${COMPANY}/lms/marketplace/bookings`)
      .send({ ...BASE_BOOKING_BODY, scheduledStartAt: "2026-08-01T10:00:00Z" });
    expect(res.status).toBe(400);
  });

  it("still succeeds when the companyEvents insert throws (best-effort, non-blocking)", async () => {
    const { db: baseDb, state } = createBookingStatefulDb();
    const throwingDb = {
      ...(baseDb as Record<string, unknown>),
      insert: (table: Table) => {
        if (getTableName(table) === "company_events") {
          throw new Error("simulated calendar outage");
        }
        return (baseDb as { insert: (t: Table) => unknown }).insert(table);
      },
    };
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      (req as never as { actor: unknown }).actor = member;
      next();
    });
    app.use("/api", lmsRoutes(throwingDb as never));
    app.use(errorHandler);

    const res = await request(app)
      .post(`/api/companies/${COMPANY}/lms/marketplace/bookings`)
      .send({
        ...BASE_BOOKING_BODY,
        scheduledStartAt: "2026-08-01T10:00:00Z",
        scheduledEndAt: "2026-08-01T14:00:00Z",
      });

    expect(res.status).toBe(201);
    expect(state.inserts).toHaveLength(1);
    expect(state.inserts[0]!.table).toBe("lms_marketplace_bookings");
  });

  it("regression: booking-create WITHOUT scheduled times still works exactly as before", async () => {
    const { app, state } = createBookingApp(member);
    const res = await request(app)
      .post(`/api/companies/${COMPANY}/lms/marketplace/bookings`)
      .send(BASE_BOOKING_BODY);

    expect(res.status).toBe(201);
    expect(state.inserts).toHaveLength(1);
    expect(state.inserts[0]!.table).toBe("lms_marketplace_bookings");
    expect(state.inserts[0]!.values.scheduledStartAt).toBeUndefined();
    expect(state.inserts[0]!.values.scheduledEndAt).toBeUndefined();
  });
});
