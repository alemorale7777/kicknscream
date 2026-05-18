import { describe, it, expect, vi, beforeEach } from "vitest";

// Module-level db mock — must be hoisted before the helper import.
const findManyMocks = {
  player: vi.fn(),
  enrollment: vi.fn(),
  event: vi.fn(),
};

vi.mock("@/lib/db", () => ({
  db: {
    player: { findMany: (...args: unknown[]) => findManyMocks.player(...args) },
    enrollment: {
      findMany: (...args: unknown[]) => findManyMocks.enrollment(...args),
    },
    event: { findMany: (...args: unknown[]) => findManyMocks.event(...args) },
  },
}));

// Late import — picks up the mocked db.
import { loadUpcomingFamilyEvents } from "@/lib/family/events";

describe("loadUpcomingFamilyEvents", () => {
  beforeEach(() => {
    Object.values(findManyMocks).forEach((m) => m.mockReset());
  });

  it("short-circuits when the parent has no kids", async () => {
    findManyMocks.player.mockResolvedValueOnce([]);

    const rows = await loadUpcomingFamilyEvents("t1", "u1");

    expect(rows).toEqual([]);
    expect(findManyMocks.enrollment).not.toHaveBeenCalled();
    expect(findManyMocks.event).not.toHaveBeenCalled();
  });

  it("short-circuits when kids have no active enrollments", async () => {
    findManyMocks.player.mockResolvedValueOnce([
      { id: "p1", firstName: "Test", lastName: "Kid" },
    ]);
    findManyMocks.enrollment.mockResolvedValueOnce([]);

    const rows = await loadUpcomingFamilyEvents("t1", "u1");

    expect(rows).toEqual([]);
    expect(findManyMocks.event).not.toHaveBeenCalled();
  });

  it("maps each event back to its enrolled kids", async () => {
    findManyMocks.player.mockResolvedValueOnce([
      { id: "p1", firstName: "Alice", lastName: "Smith" },
      { id: "p2", firstName: "Bob", lastName: "Smith" },
    ]);
    findManyMocks.enrollment.mockResolvedValueOnce([
      { playerId: "p1", programId: "prog-A" },
      { playerId: "p2", programId: "prog-A" },
      { playerId: "p1", programId: "prog-B" },
    ]);
    findManyMocks.event.mockResolvedValueOnce([
      {
        id: "e1",
        title: "U10 Practice",
        startsAt: new Date(),
        endsAt: new Date(),
        tenantId: "t1",
        programId: "prog-A",
        location: null,
      },
      {
        id: "e2",
        title: "B-team Scrimmage",
        startsAt: new Date(),
        endsAt: new Date(),
        tenantId: "t1",
        programId: "prog-B",
        location: null,
      },
    ]);

    const rows = await loadUpcomingFamilyEvents("t1", "u1");

    expect(rows).toHaveLength(2);
    // Event in prog-A had both kids enrolled — both should land on the row.
    expect(rows[0].event.id).toBe("e1");
    expect(rows[0].players.map((p) => p.id).sort()).toEqual(["p1", "p2"]);
    // Event in prog-B only had Alice — Bob shouldn't appear.
    expect(rows[1].event.id).toBe("e2");
    expect(rows[1].players.map((p) => p.id)).toEqual(["p1"]);
  });

  it("skips events whose program has no enrolled kids from this parent", async () => {
    findManyMocks.player.mockResolvedValueOnce([
      { id: "p1", firstName: "Alice", lastName: "Smith" },
    ]);
    findManyMocks.enrollment.mockResolvedValueOnce([
      { playerId: "p1", programId: "prog-A" },
    ]);
    // Event query returned an event in a different program than the kid is in
    // (e.g. a misconfigured Prisma include — defensive filter)
    findManyMocks.event.mockResolvedValueOnce([
      {
        id: "e1",
        title: "Some other program",
        startsAt: new Date(),
        endsAt: new Date(),
        tenantId: "t1",
        programId: "prog-Z",
        location: null,
      },
    ]);

    const rows = await loadUpcomingFamilyEvents("t1", "u1");

    expect(rows).toEqual([]);
  });
});
