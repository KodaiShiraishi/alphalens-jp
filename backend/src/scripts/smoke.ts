import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import type { FastifyInstance } from "fastify";
import pg from "pg";

type CookieJar = Record<string, string>;

const remoteBaseUrl = argValue("--base-url") ?? process.env.ALPHALENS_SMOKE_BASE_URL ?? process.env.SMOKE_BASE_URL;

if (process.argv.includes("--remote") || remoteBaseUrl) {
  if (!remoteBaseUrl) throw new Error("Remote smoke requires --base-url, ALPHALENS_SMOKE_BASE_URL, or SMOKE_BASE_URL.");
  await runSmoke(normalizeBaseUrl(remoteBaseUrl), "remote");
  console.log(`remote smoke ok: ${normalizeBaseUrl(remoteBaseUrl)}`);
} else {
  await runLocalSmoke();
}

async function runLocalSmoke(): Promise<void> {
  process.env.NODE_ENV ??= "test";
  process.env.COOKIE_SECURE ??= "false";
  process.env.MARKET_DATA_PROVIDER ??= "mock";
  process.env.AI_PROVIDER ??= "mock";
  process.env.SESSION_SECRET ??= "smoke-session-secret-change-me";
  process.env.DATABASE_URL ??=
    process.env.ALPHALENS_SMOKE_DATABASE_URL ?? "postgres://alphalens:alphalens@localhost:15432/alphalens_smoke";

  const [{ buildApp }, { closeDb }, { runMigrations }] = await Promise.all([
    import("../app.js"),
    import("../db/client.js"),
    import("../db/migrate.js")
  ]);

  let app: FastifyInstance | undefined;
  try {
    await ensureDatabase(process.env.DATABASE_URL);
    await runMigrations();
    app = await buildApp();
    await app.listen({ host: "127.0.0.1", port: 0 });
    const address = app.server.address();
    if (!address || typeof address === "string") throw new Error("Smoke server did not expose a TCP address.");
    const baseUrl = `http://127.0.0.1:${(address as AddressInfo).port}`;
    await runSmoke(baseUrl, "local");
    console.log("local smoke ok");
  } finally {
    await app?.close();
    await closeDb();
  }
}

async function runSmoke(baseUrl: string, mode: "local" | "remote"): Promise<void> {
  const jar: CookieJar = {};

  const health = await get<{ status: string; db: string }>(baseUrl, "/api/health", jar);
  expectEqual(health.status, "ok", "health status");
  expectEqual(health.db, "ok", "health db");

  const csrf = await get<{ csrfToken: string }>(baseUrl, "/api/auth/csrf", jar);
  expectEqual(csrf.csrfToken, jar.al_csrf, "csrf token cookie");

  const email = process.env.ALPHALENS_SMOKE_EMAIL ?? `smoke-${randomUUID()}@example.com`;
  const password = process.env.ALPHALENS_SMOKE_PASSWORD ?? "password123";
  const authPath = process.env.ALPHALENS_SMOKE_EMAIL ? "/api/auth/login" : "/api/auth/register";
  await post<{ user: { email: string } }>(baseUrl, authPath, jar, { email, password });
  if (!jar.al_session && !jar["__Host-al_session"]) throw new Error("Auth did not set the session cookie.");

  const search = await get<{ items: Array<{ code: string; providerCode: string }>; total: number }>(
    baseUrl,
    "/api/stocks?query=72030&limit=5",
    jar
  );
  expectEqual(search.total, 1, "stock search total");
  expectEqual(search.items[0]?.code, "7203", "normalized stock code");
  expectEqual(search.items[0]?.providerCode, "72030", "provider stock code");

  const detail = await get<{ stock: { code: string; provider: string }; latestPrice: unknown }>(
    baseUrl,
    "/api/stocks/72030",
    jar
  );
  expectEqual(detail.stock.code, "7203", "detail stock code");
  if (!["mock", "jquants"].includes(detail.stock.provider)) {
    throw new Error(`detail data provider: expected mock or jquants, got ${detail.stock.provider}`);
  }
  if (!detail.latestPrice) throw new Error("Stock detail did not include latestPrice.");

  await post<{ ok: boolean }>(baseUrl, "/api/watchlist", jar, { code: "72030" });
  const watchlist = await get<{ items: Array<{ code: string }> }>(baseUrl, "/api/watchlist", jar);
  expectEqual(watchlist.items[0]?.code, "7203", "watchlist item code");

  const generated = await post<{
    report: {
      id: string;
      stockCode: string;
      body: { evidence: unknown[]; disclaimer: string; dataLimitations: string[] };
    };
  }>(baseUrl, "/api/stocks/72030/analysis-reports", jar, { language: "ja", forceRefresh: false });
  expectEqual(generated.report.stockCode, "7203", "report stock code");
  if (!generated.report.body.evidence.length) throw new Error("Generated report did not include evidence.");
  if (!generated.report.body.disclaimer.includes("投資助言ではありません")) {
    throw new Error("Generated report did not include the investment-advice disclaimer.");
  }
  if (detail.stock.provider === "mock" && !generated.report.body.dataLimitations.join(" ").includes("Mock Provider")) {
    throw new Error("Generated report did not disclose the Mock Provider data limitation.");
  }

  const reports = await get<{ items: Array<{ id: string }> }>(baseUrl, "/api/analysis-reports?limit=20", jar);
  expectEqual(reports.items[0]?.id, generated.report.id, "analysis report history");

  await post<{ ok: boolean }>(baseUrl, "/api/auth/logout", jar, {});
  const protectedResponse = await raw(baseUrl, "/api/watchlist", jar);
  expectEqual(protectedResponse.status, 401, "protected API after logout");

  if (mode === "remote") {
    const rootResponse = await fetch(baseUrl);
    if (!rootResponse.ok) {
      throw new Error(`Remote frontend root failed: ${rootResponse.status}`);
    }
  }
}

async function get<T>(baseUrl: string, path: string, jar: CookieJar): Promise<T> {
  const response = await raw(baseUrl, path, jar);
  return parseOk<T>(response, path);
}

async function post<T>(baseUrl: string, path: string, jar: CookieJar, body: unknown): Promise<T> {
  const response = await raw(baseUrl, path, jar, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-CSRF-Token": jar.al_csrf ?? ""
    },
    body: JSON.stringify(body)
  });
  return parseOk<T>(response, path);
}

async function raw(baseUrl: string, path: string, jar: CookieJar, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  const cookie = Object.entries(jar)
    .map(([key, value]) => `${key}=${value}`)
    .join("; ");
  if (cookie) headers.set("Cookie", cookie);
  const response = await fetch(`${baseUrl}${path}`, { ...init, headers });
  storeCookies(jar, response);
  return response;
}

async function parseOk<T>(response: Response, path: string): Promise<T> {
  const data = (await response.json().catch(() => ({}))) as T & { error?: { code?: string; message?: string } };
  if (!response.ok) {
    throw new Error(`${path} failed: ${response.status} ${data.error?.code ?? ""} ${data.error?.message ?? ""}`);
  }
  return data as T;
}

function storeCookies(jar: CookieJar, response: Response): void {
  const setCookie = response.headers.getSetCookie?.() ?? [];
  const values = setCookie.length ? setCookie : response.headers.get("set-cookie")?.split(/,(?=[^;,]+=)/) ?? [];
  for (const value of values) {
    const pair = value.split(";")[0];
    const separator = pair.indexOf("=");
    if (separator <= 0) continue;
    const name = pair.slice(0, separator);
    const cookieValue = pair.slice(separator + 1);
    if (cookieValue) {
      jar[name] = cookieValue;
    } else {
      delete jar[name];
    }
  }
}

function expectEqual<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

async function ensureDatabase(connectionString: string): Promise<void> {
  const url = new URL(connectionString);
  const databaseName = url.pathname.replace(/^\//, "");
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

function argValue(name: string): string | undefined {
  const prefix = `${name}=`;
  const value = process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
  return value && value.trim() ? value.trim() : undefined;
}

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, "");
}
