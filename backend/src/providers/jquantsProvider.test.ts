import { afterEach, describe, expect, it, vi } from "vitest";

describe("JQuantsProvider", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
    delete process.env.JQUANTS_API_VERSION;
    delete process.env.JQUANTS_API_BASE_URL;
    delete process.env.JQUANTS_API_KEY;
    delete process.env.JQUANTS_EMAIL;
    delete process.env.JQUANTS_PASSWORD;
  });

  it("uses J-Quants V2 API-key endpoints by default", async () => {
    process.env.JQUANTS_API_VERSION = "v2";
    process.env.JQUANTS_API_BASE_URL = "https://api.example.test/v2";
    process.env.JQUANTS_API_KEY = "test-api-key";
    vi.resetModules();

    const calls: Array<{ url: string; headers: HeadersInit | undefined }> = [];
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const parsedUrl = new URL(url);
      calls.push({ url, headers: init?.headers });
      if (url.includes("/equities/master")) {
        if (parsedUrl.searchParams.get("pagination_key") === "next-page") {
          return jsonResponse({
            data: [
              {
                Code: "72030",
                CoName: "トヨタ自動車",
                CoNameEn: "TOYOTA MOTOR CORPORATION",
                MktName: "Prime",
                S17Name: "Automobiles & Transportation Equipment",
                S33Name: "輸送用機器"
              }
            ]
          });
        }
        return jsonResponse({
          data: [{ Code: "67580", CoName: "ソニーグループ", CoNameEn: "SONY GROUP CORPORATION" }],
          pagination_key: "next-page"
        });
      }
      if (url.includes("/equities/bars/daily")) {
        return jsonResponse({
          data: [{ D: "2026-06-05", O: 3000, H: 3050, L: 2980, C: 3021.5, AC: 3021.5, Vo: 12345600, Va: 37200000000 }]
        });
      }
      if (url.includes("/fins/summary")) {
        return jsonResponse({
          data: [
            {
              TypeOfCurrentPeriod: "FY",
              CurrentFiscalYearEndDate: "2026-03-31",
              DisclosedDate: "2026-05-08",
              NS: 45000000000000,
              OP: 5000000000000,
              ORP: 5200000000000,
              NP: 3900000000000,
              EPS: 250.12,
              BPS: 2800.25,
              EQR: 0.38,
              TA: 90000000000000,
              EQ: 34200000000000
            }
          ]
        });
      }
      return jsonResponse({ message: "not found" }, 404);
    });
    vi.stubGlobal("fetch", fetchMock);

    const { JQuantsProvider } = await import("./jquantsProvider.js");
    const provider = new JQuantsProvider();

    const stocks = await provider.searchStocks({ query: "7203", limit: 10 });
    const prices = await provider.getDailyPrices("7203", new Date("2026-01-01"), new Date("2026-06-07"));
    const financials = await provider.getFinancialStatements("72030");

    expect(stocks[0]).toMatchObject({
      code: "7203",
      displayCode: "7203",
      providerCode: "72030",
      name: "トヨタ自動車",
      provider: "jquants"
    });
    expect(prices[0]).toMatchObject({ date: "2026-06-05", close: 3021.5, adjustedClose: 3021.5 });
    expect(financials[0]).toMatchObject({ periodType: "FY", periodEnd: "2026-03-31", netSales: 45000000000000 });
    expect(calls.map((call) => new URL(call.url).pathname)).toEqual([
      "/v2/equities/master",
      "/v2/equities/master",
      "/v2/equities/bars/daily",
      "/v2/fins/summary"
    ]);
    expect(calls.every((call) => (call.headers as Record<string, string>)["x-api-key"] === "test-api-key")).toBe(true);
  });

  it("keeps V1 token flow as an explicit compatibility mode", async () => {
    process.env.JQUANTS_API_VERSION = "v1";
    process.env.JQUANTS_API_BASE_URL = "https://api.example.test/v1";
    process.env.JQUANTS_EMAIL = "user@example.com";
    process.env.JQUANTS_PASSWORD = "password";
    vi.resetModules();

    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, init });
      if (url.endsWith("/token/auth_user")) return jsonResponse({ refreshToken: "refresh-token" });
      if (url.includes("/token/auth_refresh")) return jsonResponse({ idToken: "id-token" });
      if (url.includes("/listed/info")) {
        return jsonResponse({
          info: [{ Code: "72030", CompanyName: "トヨタ自動車", CompanyNameEnglish: "TOYOTA MOTOR CORPORATION" }]
        });
      }
      return jsonResponse({ message: "not found" }, 404);
    });
    vi.stubGlobal("fetch", fetchMock);

    const { JQuantsProvider } = await import("./jquantsProvider.js");
    const provider = new JQuantsProvider();
    const stocks = await provider.searchStocks({ query: "7203", limit: 10 });

    expect(stocks[0]?.code).toBe("7203");
    expect(calls.map((call) => new URL(call.url).pathname)).toEqual([
      "/v1/token/auth_user",
      "/v1/token/auth_refresh",
      "/v1/listed/info"
    ]);
    expect((calls[2]?.init?.headers as Record<string, string>).Authorization).toBe("Bearer id-token");
  });
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}
