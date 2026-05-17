import { describe, it, expect } from "vitest";
import { hasRole, canManageTenant } from "@/lib/roles";

describe("hasRole", () => {
  it("owner satisfies admin requirement", () => {
    expect(hasRole("OWNER", "ADMIN")).toBe(true);
  });

  it("admin satisfies coach requirement", () => {
    expect(hasRole("ADMIN", "COACH")).toBe(true);
  });

  it("coach does not satisfy admin requirement", () => {
    expect(hasRole("COACH", "ADMIN")).toBe(false);
  });

  it("parent does not satisfy coach requirement", () => {
    expect(hasRole("PARENT", "COACH")).toBe(false);
  });

  it("player has lowest precedence", () => {
    expect(hasRole("PLAYER", "PARENT")).toBe(false);
    expect(hasRole("PARENT", "PLAYER")).toBe(true);
  });

  it("same role satisfies itself", () => {
    expect(hasRole("ADMIN", "ADMIN")).toBe(true);
    expect(hasRole("PARENT", "PARENT")).toBe(true);
  });
});

describe("canManageTenant", () => {
  it("owner can manage", () => expect(canManageTenant("OWNER")).toBe(true));
  it("admin can manage", () => expect(canManageTenant("ADMIN")).toBe(true));
  it("coach cannot manage", () => expect(canManageTenant("COACH")).toBe(false));
  it("parent cannot manage", () => expect(canManageTenant("PARENT")).toBe(false));
  it("player cannot manage", () => expect(canManageTenant("PLAYER")).toBe(false));
});
