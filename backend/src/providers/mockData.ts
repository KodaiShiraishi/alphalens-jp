import { daysAgoIso } from "../utils/dates.js";
import type { DailyPrice, FinancialStatement, Stock, StockProfile } from "../types/domain.js";

export const mockStocks: Stock[] = [
  {
    code: "7203",
    displayCode: "7203",
    providerCode: "72030",
    name: "トヨタ自動車",
    nameEn: "TOYOTA MOTOR CORPORATION",
    market: "Prime",
    sector17: "Automobiles & Transportation Equipment",
    sector33: "輸送用機器",
    lastPrice: 3021.5,
    provider: "mock",
    providerUpdatedAt: new Date("2026-06-05T15:00:00+09:00")
  },
  {
    code: "6758",
    displayCode: "6758",
    providerCode: "67580",
    name: "ソニーグループ",
    nameEn: "SONY GROUP CORPORATION",
    market: "Prime",
    sector17: "Electric Appliances & Precision Instruments",
    sector33: "電気機器",
    lastPrice: 13120,
    provider: "mock",
    providerUpdatedAt: new Date("2026-06-05T15:00:00+09:00")
  },
  {
    code: "9984",
    displayCode: "9984",
    providerCode: "99840",
    name: "ソフトバンクグループ",
    nameEn: "SOFTBANK GROUP CORP.",
    market: "Prime",
    sector17: "Information & Communication",
    sector33: "情報・通信業",
    lastPrice: 8950,
    provider: "mock",
    providerUpdatedAt: new Date("2026-06-05T15:00:00+09:00")
  }
];

export const mockProfiles: StockProfile[] = mockStocks.map(({ lastPrice: _lastPrice, ...stock }) => stock);

export function mockPrices(code: string): DailyPrice[] {
  const base = mockStocks.find((stock) => stock.code === code)?.lastPrice ?? 1000;
  return Array.from({ length: 60 }).map((_, index) => {
    const date = daysAgoIso(59 - index);
    const movement = Math.sin(index / 5) * 40 + index * 1.8;
    const close = Math.max(1, Number((base + movement).toFixed(2)));
    return {
      date,
      open: Number((close - 18).toFixed(2)),
      high: Number((close + 25).toFixed(2)),
      low: Number((close - 32).toFixed(2)),
      close,
      adjustedClose: close,
      volume: Math.round(3_000_000 + index * 41_000),
      turnoverValue: Math.round(close * (3_000_000 + index * 41_000))
    };
  });
}

export function mockFinancials(code: string): FinancialStatement[] {
  const multipliers: Record<string, number> = {
    "7203": 1,
    "6758": 0.45,
    "9984": 0.32
  };
  const m = multipliers[code] ?? 0.2;
  return [
    {
      periodType: "FY",
      periodStart: "2023-04-01",
      periodEnd: "2024-03-31",
      disclosedAt: "2024-05-10",
      netSales: Math.round(44_000_000_000_000 * m),
      operatingProfit: Math.round(4_900_000_000_000 * m),
      ordinaryProfit: Math.round(5_100_000_000_000 * m),
      profit: Math.round(3_700_000_000_000 * m),
      eps: Number((240.14 * m).toFixed(2)),
      bps: Number((2700.8 * m).toFixed(2)),
      equityRatio: 0.37,
      roe: 0.12,
      totalAssets: Math.round(87_000_000_000_000 * m),
      equity: Math.round(32_000_000_000_000 * m),
      operatingCashFlow: Math.round(5_000_000_000_000 * m),
      freeCashFlow: Math.round(2_000_000_000_000 * m)
    },
    {
      periodType: "FY",
      periodStart: "2024-04-01",
      periodEnd: "2025-03-31",
      disclosedAt: "2025-05-09",
      netSales: Math.round(46_000_000_000_000 * m),
      operatingProfit: Math.round(5_150_000_000_000 * m),
      ordinaryProfit: Math.round(5_300_000_000_000 * m),
      profit: Math.round(3_900_000_000_000 * m),
      eps: Number((250.12 * m).toFixed(2)),
      bps: Number((2800.25 * m).toFixed(2)),
      equityRatio: 0.38,
      roe: 0.13,
      totalAssets: Math.round(90_000_000_000_000 * m),
      equity: Math.round(34_000_000_000_000 * m),
      operatingCashFlow: Math.round(5_300_000_000_000 * m),
      freeCashFlow: Math.round(2_200_000_000_000 * m)
    },
    {
      periodType: "FY",
      periodStart: "2025-04-01",
      periodEnd: "2026-03-31",
      disclosedAt: "2026-05-10",
      netSales: Math.round(48_200_000_000_000 * m),
      operatingProfit: Math.round(5_450_000_000_000 * m),
      ordinaryProfit: Math.round(5_520_000_000_000 * m),
      profit: Math.round(4_050_000_000_000 * m),
      eps: Number((262.4 * m).toFixed(2)),
      bps: Number((2940.3 * m).toFixed(2)),
      equityRatio: 0.39,
      roe: 0.14,
      totalAssets: Math.round(93_000_000_000_000 * m),
      equity: Math.round(36_000_000_000_000 * m),
      operatingCashFlow: Math.round(5_700_000_000_000 * m),
      freeCashFlow: Math.round(2_500_000_000_000 * m)
    }
  ];
}
