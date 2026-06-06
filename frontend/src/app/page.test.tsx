import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import Home, { FinancialHistory, PriceChart, ReportSourceMeta } from "./page";

describe("Home page", () => {
  it("renders the MVP research workflow entry points", () => {
    const html = renderToString(<Home />);

    expect(html).toContain("AlphaLens JP");
    expect(html).toContain("認証");
    expect(html).toContain("銘柄検索");
    expect(html).toContain("市場");
    expect(html).toContain("業種");
    expect(html).toContain("Watchlist");
    expect(html).toContain("分析履歴");
    expect(html).toContain("AIレポート生成");
    expect(html).toContain("株価データなし");
    expect(html).toContain("財務データなし");
    expect(html).toContain("ログイン後に選択銘柄のAIレポートを生成できます。");
  });

  it("renders an empty state when every close price is missing", () => {
    const html = renderToString(
      <PriceChart
        prices={[
          {
            date: "2026-06-01",
            open: null,
            high: null,
            low: null,
            close: null,
            adjustedClose: null,
            volume: null
          }
        ]}
      />
    );

    expect(html).toContain("終値データなし");
    expect(html).not.toContain("Infinity");
  });

  it("renders recent financial history metrics", () => {
    const html = renderToString(
      <FinancialHistory
        financials={[
          {
            periodType: "FY",
            periodEnd: "2026-03-31",
            netSales: 48_200_000_000_000,
            operatingProfit: 5_450_000_000_000,
            ordinaryProfit: 5_520_000_000_000,
            profit: 4_050_000_000_000,
            eps: 262.4,
            bps: 2940.3,
            equityRatio: 0.39,
            derivedMetrics: {
              salesGrowth: 0.0478,
              operatingMargin: 0.113,
              netMargin: 0.084,
              roe: 0.1125,
              per: 11.5,
              pbr: 1.03
            }
          }
        ]}
      />
    );

    expect(html).toContain("財務履歴");
    expect(html).toContain("2026-03-31");
    expect(html).toContain("48.2兆円");
    expect(html).toContain("+4.78%");
  });

  it("renders report source metadata", () => {
    const html = renderToString(
      <ReportSourceMeta
        report={{
          id: "rep-1",
          stockCode: "7203",
          title: "トヨタ自動車 ファンダメンタルズ調査メモ",
          summary: "summary",
          body: {
            growth: "growth",
            profitability: "profitability",
            stability: "stability",
            risks: [],
            checkpoints: [],
            evidence: [],
            dataLimitations: [],
            disclaimer: "このレポートは投資助言ではありません。"
          },
          sourceSnapshot: {
            source: "mock",
            stock: { providerUpdatedAt: "2026-06-05T06:00:00.000Z" },
            latestPrice: { date: "2026-06-05" },
            priceSummary: {
              latestDate: "2026-06-05",
              latestClose: 3021.5,
              oneMonthChangePct: 0.034,
              threeMonthChangePct: -0.012,
              volumeTrend: "increasing"
            },
            latestFinancials: { periodEnd: "2026-03-31" },
            financialPeriods: ["2024-03-31", "2025-03-31", "2026-03-31"]
          },
          disclaimer: "このレポートは投資助言ではありません。",
          inputDataVersion: "hash",
          createdAt: "2026-06-06T12:00:00.000Z"
        }}
      />
    );

    expect(html).toContain("利用データ");
    expect(html).toContain("Mock");
    expect(html).toContain("株価");
    expect(html).toContain("2026-06-05");
    expect(html).toContain("1か月");
    expect(html).toContain("+3.40%");
    expect(html).toContain("3か月");
    expect(html).toContain("-1.20%");
    expect(html).toContain("財務");
    expect(html).toContain("2026-03-31");
  });
});
