import { describe, expect, it } from "vitest";
import { attachDerivedMetrics, growthRate, margin, pbr, per } from "./metrics.js";

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

  it("attaches API DTO derived metrics without mutating base values", () => {
    const [previous, current] = attachDerivedMetrics(
      [
        {
          periodType: "FY",
          periodEnd: "2025-03-31",
          netSales: 100,
          operatingProfit: 10,
          ordinaryProfit: 10,
          profit: 8,
          eps: 20,
          bps: 200,
          equityRatio: 0.4,
          equity: 80
        },
        {
          periodType: "FY",
          periodEnd: "2026-03-31",
          netSales: 120,
          operatingProfit: 18,
          ordinaryProfit: 18,
          profit: 12,
          eps: 30,
          bps: 250,
          equityRatio: 0.45,
          equity: 100
        }
      ],
      1500
    );

    expect(previous?.derivedMetrics?.salesGrowth).toBeNull();
    expect(current?.derivedMetrics).toMatchObject({
      salesGrowth: 0.2,
      operatingMargin: 0.15,
      netMargin: 0.1,
      roe: 0.12,
      per: 50,
      pbr: 6
    });
  });
});
