import { describe, expect, it } from "vitest";
import { MockMarketDataProvider, MockProviderError } from "./mockProvider.js";

describe("MockMarketDataProvider", () => {
  const provider = new MockMarketDataProvider();

  it("normalizes four and five digit stock codes", async () => {
    await expect(provider.normalizeCode("7203")).resolves.toEqual({
      displayCode: "7203",
      providerCode: "72030"
    });
    await expect(provider.normalizeCode("72030")).resolves.toEqual({
      displayCode: "7203",
      providerCode: "72030"
    });
  });

  it("searches by code and company name", async () => {
    const byCode = await provider.searchStocks({ query: "7203", limit: 20 });
    const byName = await provider.searchStocks({ query: "トヨタ", limit: 20 });
    expect(byCode[0]?.name).toContain("トヨタ");
    expect(byName[0]?.code).toBe("7203");
  });

  it("returns a not-found equivalent for unknown stock profiles", async () => {
    await expect(provider.getStockProfile("0000")).resolves.toBeNull();
  });

  it("can simulate external provider rate limits", async () => {
    const limitedProvider = new MockMarketDataProvider("rate-limit");

    await expect(limitedProvider.searchStocks({ query: "7203", limit: 20 })).rejects.toMatchObject({
      statusCode: 429,
      message: "Mock provider rate limited the request."
    });
  });

  it("can simulate external provider timeouts", async () => {
    const timeoutProvider = new MockMarketDataProvider("timeout");

    await expect(timeoutProvider.getDailyPrices("7203")).rejects.toBeInstanceOf(MockProviderError);
    await expect(timeoutProvider.getDailyPrices("7203")).rejects.toMatchObject({
      statusCode: 408,
      message: "Mock provider request timed out."
    });
  });

  it("can return financial statements with missing values", async () => {
    const missingProvider = new MockMarketDataProvider("missing-financials");
    const financials = await missingProvider.getFinancialStatements("7203");

    expect(financials[0]).toMatchObject({
      netSales: null,
      operatingProfit: null,
      profit: null,
      eps: null,
      bps: null,
      equityRatio: null
    });
    expect(financials.at(-1)?.netSales).toBeGreaterThan(0);
  });
});
