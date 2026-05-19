import { describe, expect, it } from "vitest";
import type { Role } from "@prisma/client";
import { hasRole, canManageTenant, roleLabel } from "@/lib/roles";

const ROLES: Role[] = ["OWNER", "ADMIN", "COACH", "PARENT", "PLAYER"];

/**
 * Pin the role-permission matrix so regressions surface immediately.
 * If you change ROLE_RANK in src/lib/roles.ts, this expected matrix
 * needs to move with it.
 */
describe("hasRole matrix", () => {
  const expected: Record<Role, Record<Role, boolean>> = {
    OWNER: {
      OWNER: true,
      ADMIN: true,
      COACH: true,
      PARENT: true,
      PLAYER: true,
    },
    ADMIN: {
      OWNER: false,
      ADMIN: true,
      COACH: true,
      PARENT: true,
      PLAYER: true,
    },
    COACH: {
      OWNER: false,
      ADMIN: false,
      COACH: true,
      PARENT: true,
      PLAYER: true,
    },
    PARENT: {
      OWNER: false,
      ADMIN: false,
      COACH: false,
      PARENT: true,
      PLAYER: true,
    },
    PLAYER: {
      OWNER: false,
      ADMIN: false,
      COACH: false,
      PARENT: false,
      PLAYER: true,
    },
  };

  for (const actual of ROLES) {
    for (const required of ROLES) {
      it(`${actual} meets ${required} = ${expected[actual][required]}`, () => {
        expect(hasRole(actual, required)).toBe(expected[actual][required]);
      });
    }
  }
});

describe("canManageTenant", () => {
  it("allows OWNER + ADMIN only", () => {
    expect(canManageTenant("OWNER")).toBe(true);
    expect(canManageTenant("ADMIN")).toBe(true);
    expect(canManageTenant("COACH")).toBe(false);
    expect(canManageTenant("PARENT")).toBe(false);
    expect(canManageTenant("PLAYER")).toBe(false);
  });
});

describe("roleLabel", () => {
  it("title-cases each role", () => {
    expect(roleLabel("OWNER")).toBe("Owner");
    expect(roleLabel("ADMIN")).toBe("Admin");
    expect(roleLabel("COACH")).toBe("Coach");
    expect(roleLabel("PARENT")).toBe("Parent");
    expect(roleLabel("PLAYER")).toBe("Player");
  });
});
