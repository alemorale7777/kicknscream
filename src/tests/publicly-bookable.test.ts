import { describe, it, expect } from "vitest";
import { isPubliclyBookable } from "@/lib/programs";

describe("isPubliclyBookable", () => {
  it("includes PER_SESSION services with a price", () => {
    expect(
      isPubliclyBookable({
        archived: false,
        priceModel: "PER_SESSION",
        price: 5000,
        stripePriceId: null,
      })
    ).toBe(true);
  });

  it("includes FREE services", () => {
    expect(
      isPubliclyBookable({
        archived: false,
        priceModel: "FREE",
        price: 0,
        stripePriceId: null,
      })
    ).toBe(true);
  });

  it("excludes MONTHLY services without a stripePriceId", () => {
    expect(
      isPubliclyBookable({
        archived: false,
        priceModel: "MONTHLY",
        price: 0,
        stripePriceId: null,
      })
    ).toBe(false);
  });

  it("includes MONTHLY services with a stripePriceId", () => {
    expect(
      isPubliclyBookable({
        archived: false,
        priceModel: "MONTHLY",
        price: 2500,
        stripePriceId: "price_xyz",
      })
    ).toBe(true);
  });

  it("excludes archived services regardless of pricing", () => {
    expect(
      isPubliclyBookable({
        archived: true,
        priceModel: "PER_SESSION",
        price: 5000,
        stripePriceId: null,
      })
    ).toBe(false);
  });
});
