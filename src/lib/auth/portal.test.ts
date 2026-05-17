import { describe, it, expect } from "vitest";
import {
  defaultPortalForRole,
  isPortalAllowed,
  portalDefaultPath,
  portalFromPath,
  legacyRedirectPath,
} from "@/lib/auth/portal";

describe("defaultPortalForRole", () => {
  it("routes OWNER and ADMIN to admin portal", () => {
    expect(defaultPortalForRole("OWNER")).toBe("admin");
    expect(defaultPortalForRole("ADMIN")).toBe("admin");
  });
  it("routes COACH to coach portal", () => {
    expect(defaultPortalForRole("COACH")).toBe("coach");
  });
  it("routes PARENT and PLAYER to family portal", () => {
    expect(defaultPortalForRole("PARENT")).toBe("family");
    expect(defaultPortalForRole("PLAYER")).toBe("family");
  });
});

describe("isPortalAllowed", () => {
  it("OWNER can access every portal", () => {
    expect(isPortalAllowed("OWNER", "coach")).toBe(true);
    expect(isPortalAllowed("OWNER", "family")).toBe(true);
    expect(isPortalAllowed("OWNER", "admin")).toBe(true);
  });
  it("ADMIN can access admin + coach but not family", () => {
    expect(isPortalAllowed("ADMIN", "admin")).toBe(true);
    expect(isPortalAllowed("ADMIN", "coach")).toBe(true);
    expect(isPortalAllowed("ADMIN", "family")).toBe(false);
  });
  it("COACH can access coach only", () => {
    expect(isPortalAllowed("COACH", "coach")).toBe(true);
    expect(isPortalAllowed("COACH", "admin")).toBe(false);
    expect(isPortalAllowed("COACH", "family")).toBe(false);
  });
  it("PARENT can access family only", () => {
    expect(isPortalAllowed("PARENT", "family")).toBe(true);
    expect(isPortalAllowed("PARENT", "coach")).toBe(false);
    expect(isPortalAllowed("PARENT", "admin")).toBe(false);
  });
  it("PLAYER can access family only", () => {
    expect(isPortalAllowed("PLAYER", "family")).toBe(true);
    expect(isPortalAllowed("PLAYER", "coach")).toBe(false);
  });
});

describe("portalDefaultPath", () => {
  it("returns the canonical landing page for each portal", () => {
    expect(portalDefaultPath("slug-x", "coach")).toBe("/t/slug-x/coach/dashboard");
    expect(portalDefaultPath("slug-x", "family")).toBe("/t/slug-x/family/home");
    expect(portalDefaultPath("slug-x", "admin")).toBe("/t/slug-x/admin/team");
  });
});

describe("portalFromPath", () => {
  it("infers portal segment from a URL", () => {
    expect(portalFromPath("/t/abc/coach/dashboard")).toBe("coach");
    expect(portalFromPath("/t/abc/family/home")).toBe("family");
    expect(portalFromPath("/t/abc/admin/team")).toBe("admin");
  });
  it("returns null for legacy or non-portal paths", () => {
    expect(portalFromPath("/t/abc/dashboard")).toBeNull();
    expect(portalFromPath("/abc")).toBeNull();
    expect(portalFromPath("/")).toBeNull();
  });
});

describe("legacyRedirectPath", () => {
  it("redirects every legacy coach segment", () => {
    expect(legacyRedirectPath("/t/abc/dashboard")).toBe("/t/abc/coach/dashboard");
    expect(legacyRedirectPath("/t/abc/bookings")).toBe("/t/abc/coach/bookings");
    expect(legacyRedirectPath("/t/abc/schedule")).toBe("/t/abc/coach/schedule");
    expect(legacyRedirectPath("/t/abc/settings")).toBe("/t/abc/coach/settings");
  });
  it("preserves sub-paths and query strings (path only)", () => {
    expect(legacyRedirectPath("/t/abc/schedule/event-1")).toBe(
      "/t/abc/coach/schedule/event-1"
    );
    expect(legacyRedirectPath("/t/abc/settings/team")).toBe("/t/abc/coach/settings/team");
  });
  it("returns null for paths already on a portal", () => {
    expect(legacyRedirectPath("/t/abc/coach/bookings")).toBeNull();
    expect(legacyRedirectPath("/t/abc/family/home")).toBeNull();
    expect(legacyRedirectPath("/t/abc/admin/team")).toBeNull();
  });
  it("returns null for unknown segments + non-tenant paths", () => {
    expect(legacyRedirectPath("/t/abc/something-weird")).toBeNull();
    expect(legacyRedirectPath("/abc")).toBeNull();
    expect(legacyRedirectPath("/auth/signin")).toBeNull();
  });
});
