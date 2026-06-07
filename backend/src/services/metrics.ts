import type { DerivedMetrics, FinancialStatement } from "../types/domain.js";

export function growthRate(previous: number | null, current: number | null): number | null {
  if (previous === null || current === null || previous === 0) return null;
  return (current - previous) / previous;
}

export function margin(profit: number | null, sales: number | null): number | null {
  if (profit === null || sales === null || sales === 0) return null;
  return profit / sales;
}

export function per(price: number | null, eps: number | null): number | null {
  if (price === null || eps === null || eps === 0) return null;
  return price / eps;
}

export function pbr(price: number | null, bps: number | null): number | null {
  if (price === null || bps === null || bps === 0) return null;
  return price / bps;
}

export function deriveFinancialMetrics(
  current: FinancialStatement,
  previous: FinancialStatement | null,
  latestClose: number | null
): DerivedMetrics {
  return {
    salesGrowth: growthRate(previous?.netSales ?? null, current.netSales),
    operatingMargin: margin(current.operatingProfit, current.netSales),
    netMargin: margin(current.profit, current.netSales),
    roe: current.roe ?? margin(current.profit, current.equity ?? null),
    per: per(latestClose, current.eps),
    pbr: pbr(latestClose, current.bps)
  };
}

export function attachDerivedMetrics(statements: FinancialStatement[], latestClose: number | null): FinancialStatement[] {
  return statements.map((statement, index) => ({
    ...statement,
    derivedMetrics: deriveFinancialMetrics(statement, statements[index - 1] ?? null, latestClose)
  }));
}
