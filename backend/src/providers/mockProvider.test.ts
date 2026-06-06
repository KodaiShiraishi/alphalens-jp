import { describe, expect, it } from "vitest";
import { MockMarketDataProvider } from "./mockProvider.js";

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
});
