import type { FastifyInstance } from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";

type InjectResponse = Awaited<ReturnType<FastifyInstance["inject"]>>;
type CookieJar = Record<string, string>;

let app: FastifyInstance | undefined;
let closeDb: (() => Promise<void>) | undefined;

describe("auth route public demo controls", () => {
  afterEach(async () => {
    await app?.close();
    await closeDb?.();
    app = undefined;
    closeDb = undefined;
    delete process.env.REGISTRATION_ENABLED;
    delete process.env.REGISTER_RATE_LIMIT_MAX;
    delete process.env.REGISTER_RATE_LIMIT_TIME_WINDOW;
    vi.resetModules();
  });

  it("can disable public registration while keeping the route explicit", async () => {
    app = await buildConfiguredApp({
      REGISTRATION_ENABLED: "false",
      REGISTER_RATE_LIMIT_MAX: "10"
    });

    const response = await postRegister(app, "disabled@example.com");

    expect(response.statusCode).toBe(403);
    expect(jsonErrorCode(response)).toBe("REGISTRATION_DISABLED");
  });

  it("applies a stricter rate limit to public registration", async () => {
    app = await buildConfiguredApp({
      REGISTRATION_ENABLED: "false",
      REGISTER_RATE_LIMIT_MAX: "1",
      REGISTER_RATE_LIMIT_TIME_WINDOW: "1 minute"
    });

    const first = await postRegister(app, "first@example.com");
    const second = await postRegister(app, "second@example.com");

    expect(first.statusCode).toBe(403);
    expect(jsonErrorCode(second)).toBe("RATE_LIMITED");
    expect(second.statusCode).toBe(429);
  });
});

async function buildConfiguredApp(env: Record<string, string>): Promise<FastifyInstance> {
  process.env.NODE_ENV = "test";
  process.env.COOKIE_SECURE = "false";
  process.env.MARKET_DATA_PROVIDER = "mock";
  process.env.AI_PROVIDER = "mock";
  process.env.SESSION_SECRET = "test-session-secret-for-auth-controls";
  Object.assign(process.env, env);
  vi.resetModules();
  const [appModule, dbModule] = await Promise.all([import("./app.js"), import("./db/client.js")]);
  closeDb = dbModule.closeDb;
  const builtApp = await appModule.buildApp();
  await builtApp.ready();
  return builtApp;
}

async function postRegister(app: FastifyInstance, email: string): Promise<InjectResponse> {
  const jar = await fetchCsrf(app);
  const response = await app.inject({
    method: "POST",
    url: "/api/auth/register",
    headers: headers(jar),
    payload: { email, password: "password123" }
  });
  storeCookies(jar, response);
  return response;
}

async function fetchCsrf(app: FastifyInstance): Promise<CookieJar> {
  const jar: CookieJar = {};
  const response = await app.inject({ method: "GET", url: "/api/auth/csrf" });
  expect(response.statusCode).toBe(200);
  storeCookies(jar, response);
  return jar;
}

function headers(jar: CookieJar): Record<string, string> {
  return {
    cookie: Object.entries(jar)
      .map(([key, value]) => `${key}=${value}`)
      .join("; "),
    "x-csrf-token": jar.al_csrf ?? ""
  };
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

function jsonErrorCode(response: InjectResponse): string {
  return (JSON.parse(response.body) as { error: { code: string } }).error.code;
}
