import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().optional(),
  DATABASE_HOST: z.string().optional(),
  DATABASE_PORT: z.coerce.number().default(5432),
  DATABASE_NAME: z.string().optional(),
  DATABASE_USER: z.string().optional(),
  DATABASE_PASSWORD: z.string().optional(),
  SESSION_SECRET: z.string().min(16).default("development-session-secret-change-me"),
  RUN_MIGRATIONS_ON_START: z.enum(["true", "false"]).default("false"),
  COOKIE_SECURE: z
    .enum(["true", "false"])
    .default(process.env.NODE_ENV === "production" ? "true" : "false"),
  MARKET_DATA_PROVIDER: z.enum(["mock", "jquants"]).default("mock"),
  MARKET_DATA_MAX_RETRIES: z.coerce.number().int().min(0).max(5).default(2),
  MARKET_DATA_RETRY_DELAY_MS: z.coerce.number().int().min(0).max(10_000).default(250),
  JQUANTS_API_VERSION: z.enum(["v2", "v1"]).default("v2"),
  JQUANTS_API_BASE_URL: z.string().url().optional(),
  JQUANTS_API_KEY: z.string().optional(),
  JQUANTS_EMAIL: z.string().optional(),
  JQUANTS_PASSWORD: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default("gpt-4.1-mini"),
  AI_PROVIDER: z.enum(["mock", "openai"]).default("mock"),
  FRONTEND_ORIGIN: z.string().default("http://localhost:3000")
});

const parsedEnv = envSchema.parse(process.env);

function buildDatabaseUrl(): string {
  if (parsedEnv.DATABASE_URL) {
    return parsedEnv.DATABASE_URL;
  }

  if (
    parsedEnv.DATABASE_HOST &&
    parsedEnv.DATABASE_NAME &&
    parsedEnv.DATABASE_USER &&
    parsedEnv.DATABASE_PASSWORD
  ) {
    const user = encodeURIComponent(parsedEnv.DATABASE_USER);
    const password = encodeURIComponent(parsedEnv.DATABASE_PASSWORD);
    return `postgres://${user}:${password}@${parsedEnv.DATABASE_HOST}:${parsedEnv.DATABASE_PORT}/${parsedEnv.DATABASE_NAME}`;
  }

  return "postgres://alphalens:alphalens@localhost:15432/alphalens";
}

export const env = {
  ...parsedEnv,
  DATABASE_URL: buildDatabaseUrl(),
  JQUANTS_API_BASE_URL:
    parsedEnv.JQUANTS_API_BASE_URL ??
    (parsedEnv.JQUANTS_API_VERSION === "v2" ? "https://api.jquants.com/v2" : "https://api.jquants.com/v1")
};
export const isProduction = env.NODE_ENV === "production";
export const secureCookies = env.COOKIE_SECURE === "true";
export const sessionCookieName = isProduction ? "__Host-al_session" : "al_session";
