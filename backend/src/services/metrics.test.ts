import { describe, expect, it } from "vitest";
import { growthRate, margin, pbr, per } from "./metrics.js";

describe("financial metrics", () => {
  it("calculates growth rate", () => {
    expect(growthRate(100, 120)).toBe(0.2);
  });

  it("does not divide by zero or missing values", () => {
    expect(growthRate(0, 120)).toBeNull();
    expect(margin(10, 0)).toBeNull();
    expect(per(1000, null)).toBeNull();
    expect(pbr(1000, 0)).toBeNull();
  });

  it("calculates margins and multiples", () => {
    expect(margin(10, 100)).toBe(0.1);
    expect(per(1000, 100)).toBe(10);
    expect(pbr(1000, 500)).toBe(2);
  });
});
