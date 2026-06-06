import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import type { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

process.env.NODE_ENV = "test";
process.env.COOKIE_SECURE = "false";
process.env.MARKET_DATA_PROVIDER = "mock";
process.env.AI_PROVIDER = "mock";
process.env.SESSION_SECRET = "test-session-secret-for-api-integration";
process.env.DATABASE_URL ??=
  process.env.ALPHALENS_TEST_DATABASE_URL ?? "postgres://alphalens:alphalens@localhost:15432/alphalens_test";

type InjectResponse = Awaited<ReturnType<FastifyInstance["inject"]>>;
type CookieJar = Record<string, string>;

let app: FastifyInstance;
let pool: Pool;
let closeDb: () => Promise<void>;

describe.sequential("API integration", () => {
  beforeAll(async () => {
    await ensureTestDatabase(process.env.DATABASE_URL);
    const [{ runMigrations }, clientModule, appModule] = await Promise.all([
      import("./db/migrate.js"),
      import("./db/client.js"),
      import("./app.js")
    ]);
    pool = clientModule.pool;
    closeDb = clientModule.closeDb;
    await runMigrations();
    app = await appModule.buildApp();
    await app.ready();
  }, 30000);

  beforeEach(async () => {
    await pool.query(`
      TRUNCATE TABLE
        provider_fetch_logs,
        analysis_reports,
        watchlist_items,
        financial_statements,
        daily_prices,
        stocks,
        sessions,
        users
      RESTART IDENTITY CASCADE
    `);
  });

  afterAll(async () => {
    await app.close();
    await closeDb();
  });

  it("serves health, issues CSRF cookies, and rejects unsafe requests without CSRF", async () => {
    const health = await app.inject({ method: "GET", url: "/api/health" });
    expect(health.statusCode).toBe(200);
    expect(json<{ status: string; db: string }>(health)).toMatchObject({ status: "ok", db: "ok" });

    const jar = await fetchCsrf();
    expect(jar.al_csrf).toBeTruthy();

    const rejected = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { email: "missing-csrf@example.com", password: "password123" }
    });
    expect(rejected.statusCode).toBe(403);
    expect(jsonErrorCode(rejected)).toBe("CSRF_TOKEN_INVALID");
  });

  it("registers, logs in, rejects duplicate users, and requires auth for private APIs", async () => {
    const email = uniqueEmail();
    const session = await register(email);
    expect(session.user.email).toBe(email);
    expect(session.jar.al_session).toBeTruthy();

    const me = await app.inject({ method: "GET", url: "/api/auth/me", headers: headers(session.jar, false) });
    expect(me.statusCode).toBe(200);
    expect(json<{ user: { email: string } }>(me).user.email).toBe(email);

    const duplicateJar = await fetchCsrf();
    const duplicate = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      headers: headers(duplicateJar),
      payload: { email, password: "password123" }
    });
    expect(duplicate.statusCode).toBe(409);
    expect(jsonErrorCode(duplicate)).toBe("USER_ALREADY_EXISTS");

    const badLoginJar = await fetchCsrf();
    const badLogin = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      headers: headers(badLoginJar),
      payload: { email, password: "wrong-password" }
    });
    expect(badLogin.statusCode).toBe(401);
    expect(jsonErrorCode(badLogin)).toBe("UNAUTHORIZED");

    const privateApi = await app.inject({ method: "GET", url: "/api/watchlist" });
    expect(privateApi.statusCode).toBe(401);
  });

  it("searches stocks, normalizes provider codes, and validates query/date input", async () => {
    const search = await app.inject({ method: "GET", url: "/api/stocks?query=72030&limit=5" });
    expect(search.statusCode).toBe(200);
    const searchBody = json<{ items: Array<{ code: string; providerCode: string; name: string }>; total: number }>(search);
    expect(searchBody.total).toBe(1);
    expect(searchBody.items[0]).toMatchObject({ code: "7203", providerCode: "72030", name: "トヨタ自動車" });

    const detail = await app.inject({ method: "GET", url: "/api/stocks/72030" });
    expect(detail.statusCode).toBe(200);
    expect(json<{ stock: { code: string }; latestPrice: unknown; latestFinancials: unknown }>(detail).stock.code).toBe("7203");

    const prices = await app.inject({ method: "GET", url: "/api/stocks/7203/prices?from=2025-01-01&to=2026-12-31" });
    expect(prices.statusCode).toBe(200);
    expect(json<{ items: unknown[] }>(prices).items.length).toBeGreaterThan(0);

    const financials = await app.inject({ method: "GET", url: "/api/stocks/7203/financials" });
    expect(financials.statusCode).toBe(200);
    expect(json<{ items: unknown[] }>(financials).items.length).toBeGreaterThan(0);

    const emptyQuery = await app.inject({ method: "GET", url: "/api/stocks?query=" });
    expect(emptyQuery.statusCode).toBe(400);
    expect(jsonErrorCode(emptyQuery)).toBe("VALIDATION_ERROR");

    const tooLargeLimit = await app.inject({ method: "GET", url: "/api/stocks?query=7203&limit=51" });
    expect(tooLargeLimit.statusCode).toBe(400);
    expect(jsonErrorCode(tooLargeLimit)).toBe("VALIDATION_ERROR");

    const invalidDate = await app.inject({ method: "GET", url: "/api/stocks/7203/prices?from=2026-99-99" });
    expect(invalidDate.statusCode).toBe(400);
    expect(jsonErrorCode(invalidDate)).toBe("VALIDATION_ERROR");

    const badRange = await app.inject({ method: "GET", url: "/api/stocks/7203/prices?from=2026-12-31&to=2026-01-01" });
    expect(badRange.statusCode).toBe(400);
    expect(jsonErrorCode(badRange)).toBe("VALIDATION_ERROR");
  });

  it("adds, lists, deduplicates, and deletes watchlist items by normalized code", async () => {
    const { jar } = await register(uniqueEmail());

    const added = await app.inject({
      method: "POST",
      url: "/api/watchlist",
      headers: headers(jar),
      payload: { code: "72030" }
    });
    expect(added.statusCode).toBe(200);
    expect(json<{ ok: boolean }>(added).ok).toBe(true);

    const list = await app.inject({ method: "GET", url: "/api/watchlist", headers: headers(jar, false) });
    expect(list.statusCode).toBe(200);
    expect(json<{ items: Array<{ code: string; latestPrice: number | null; priceChange: number | null }> }>(list).items[0]).toMatchObject({
      code: "7203",
      latestPrice: expect.any(Number),
      priceChange: expect.any(Number)
    });

    const duplicate = await app.inject({
      method: "POST",
      url: "/api/watchlist",
      headers: headers(jar),
      payload: { code: "7203" }
    });
    expect(duplicate.statusCode).toBe(409);
    expect(jsonErrorCode(duplicate)).toBe("WATCHLIST_ALREADY_EXISTS");

    const deleted = await app.inject({ method: "DELETE", url: "/api/watchlist/72030", headers: headers(jar) });
    expect(deleted.statusCode).toBe(200);

    const empty = await app.inject({ method: "GET", url: "/api/watchlist", headers: headers(jar, false) });
    expect(json<{ items: unknown[] }>(empty).items).toHaveLength(0);
  });

  it("generates, reuses, lists, and fetches mock AI reports with evidence and disclaimer", async () => {
    const { jar } = await register(uniqueEmail());

    const generated = await app.inject({
      method: "POST",
      url: "/api/stocks/72030/analysis-reports",
      headers: headers(jar),
      payload: { language: "ja", forceRefresh: false }
    });
    expect(generated.statusCode).toBe(200);
    const firstReport = json<{
      report: {
        id: string;
        stockCode: string;
        title: string;
        body: { evidence: unknown[]; dataLimitations: string[]; disclaimer: string };
        sourceSnapshot: { source: string };
      };
    }>(generated).report;
    expect(firstReport.stockCode).toBe("7203");
    expect(firstReport.title).toBe("トヨタ自動車 ファンダメンタルズ調査メモ");
    expect(firstReport.body.evidence.length).toBeGreaterThan(0);
    expect(firstReport.body.dataLimitations.join(" ")).toContain("Mock Provider");
    expect(firstReport.body.disclaimer).toContain("投資助言ではありません");
    expect(firstReport.sourceSnapshot.source).toBe("mock");

    const reused = await app.inject({
      method: "POST",
      url: "/api/stocks/7203/analysis-reports",
      headers: headers(jar),
      payload: { language: "ja", forceRefresh: false }
    });
    expect(reused.statusCode).toBe(200);
    expect(json<{ report: { id: string } }>(reused).report.id).toBe(firstReport.id);

    const list = await app.inject({
      method: "GET",
      url: "/api/analysis-reports?code=72030&limit=20",
      headers: headers(jar, false)
    });
    expect(list.statusCode).toBe(200);
    expect(json<{ items: Array<{ id: string; stockCode: string; stockName: string }> }>(list).items[0]).toMatchObject({
      id: firstReport.id,
      stockCode: "7203",
      stockName: "トヨタ自動車"
    });

    const detail = await app.inject({
      method: "GET",
      url: `/api/analysis-reports/${firstReport.id}`,
      headers: headers(jar, false)
    });
    expect(detail.statusCode).toBe(200);
    expect(json<{ report: { id: string } }>(detail).report.id).toBe(firstReport.id);
  });
});

async function fetchCsrf(): Promise<CookieJar> {
  const jar: CookieJar = {};
  const response = await app.inject({ method: "GET", url: "/api/auth/csrf" });
  expect(response.statusCode).toBe(200);
  storeCookies(jar, response);
  expect(json<{ csrfToken: string }>(response).csrfToken).toBe(jar.al_csrf);
  return jar;
}

async function register(email: string): Promise<{ jar: CookieJar; user: { id: string; email: string } }> {
  const jar = await fetchCsrf();
  const response = await app.inject({
    method: "POST",
    url: "/api/auth/register",
    headers: headers(jar),
    payload: { email, password: "password123" }
  });
  expect(response.statusCode).toBe(200);
  storeCookies(jar, response);
  return { jar, user: json<{ user: { id: string; email: string } }>(response).user };
}

function headers(jar: CookieJar, includeCsrf = true): Record<string, string> {
  const values: Record<string, string> = {};
  const cookie = Object.entries(jar)
    .map(([key, value]) => `${key}=${value}`)
    .join("; ");
  if (cookie) values.cookie = cookie;
  if (includeCsrf && jar.al_csrf) values["x-csrf-token"] = jar.al_csrf;
  return values;
}

function storeCookies(jar: CookieJar, response: InjectResponse): void {
  const setCookie = response.headers["set-cookie"];
  const values = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  for (const value of values) {
    const pair = String(value).split(";")[0];
    const separator = pair.indexOf("=");
    if (separator <= 0) continue;
    jar[pair.slice(0, separator)] = pair.slice(separator + 1);
  }
}

function json<T>(response: InjectResponse): T {
  return JSON.parse(response.body) as T;
}

function jsonErrorCode(response: InjectResponse): string {
  return json<{ error: { code: string } }>(response).error.code;
}

function uniqueEmail(): string {
  return `user-${randomUUID()}@example.com`;
}

async function ensureTestDatabase(connectionString: string | undefined): Promise<void> {
  if (!connectionString) throw new Error("DATABASE_URL is required for API integration tests.");
  const url = new URL(connectionString);
  const databaseName = url.pathname.replace(/^\//, "");
  if (!/(^|_)test($|_)/i.test(databaseName) && process.env.ALLOW_NON_TEST_DATABASE !== "true") {
    throw new Error(`Refusing to run destructive API integration tests against non-test database: ${databaseName}`);
  }

  const adminUrl = new URL(url);
  adminUrl.pathname = "/postgres";
  const client = new pg.Client({ connectionString: adminUrl.toString() });
  await client.connect();
  try {
    const result = await client.query("select 1 from pg_database where datname = $1", [databaseName]);
    if (result.rowCount === 0) {
      await client.query(`CREATE DATABASE ${quoteIdentifier(databaseName)}`);
    }
  } finally {
    await client.end();
  }
}

function quoteIdentifier(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}
