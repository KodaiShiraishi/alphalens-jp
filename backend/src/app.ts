import cookie from "@fastify/cookie";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import Fastify, { type FastifyInstance } from "fastify";
import { ZodError } from "zod";
import { env, secureCookies } from "./config/env.js";
import { AppError, errors } from "./utils/errors.js";
import { createMarketDataProvider } from "./providers/index.js";
import { MarketService } from "./services/marketService.js";
import { ReportService } from "./services/reportService.js";
import { authRoutes } from "./routes/authRoutes.js";
import { healthRoutes } from "./routes/healthRoutes.js";
import { stockRoutes } from "./routes/stockRoutes.js";
import { watchlistRoutes } from "./routes/watchlistRoutes.js";
import { reportRoutes } from "./routes/reportRoutes.js";

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: env.NODE_ENV === "test" ? "silent" : "info"
    }
  });

  await app.register(helmet);
  await app.register(cookie, {
    secret: env.SESSION_SECRET
  });
  await app.register(rateLimit, {
    max: 120,
    timeWindow: "1 minute",
    errorResponseBuilder: () => errors.rateLimited()
  });

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) {
      reply.status(400).send({
        error: {
          code: "VALIDATION_ERROR",
          message: error.issues[0]?.message ?? "入力値が不正です。",
          requestId: _request.id
        }
      });
      return;
    }
    if (error instanceof AppError) {
      reply.status(error.statusCode).send({
        error: {
          code: error.code,
          message: error.message,
          requestId: _request.id
        }
      });
      return;
    }
    _request.log.error(error);
    reply.status(500).send({
      error: {
        code: "INTERNAL_ERROR",
        message: "サーバー内部エラー",
        requestId: _request.id
      }
    });
  });

  app.addHook("preHandler", async (request) => {
    const unsafe = ["POST", "PUT", "PATCH", "DELETE"].includes(request.method);
    if (!unsafe) return;
    const csrfCookie = request.cookies.al_csrf;
    const csrfHeader = request.headers["x-csrf-token"];
    if (!csrfCookie || csrfCookie !== csrfHeader) {
      throw errors.csrf();
    }
  });

  const provider = createMarketDataProvider();
  const marketService = new MarketService(provider);
  const reportService = new ReportService(marketService);

  await app.register(healthRoutes, { prefix: "/api" });
  await app.register(authRoutes, { prefix: "/api" });
  await app.register(stockRoutes(marketService), { prefix: "/api" });
  await app.register(watchlistRoutes(marketService), { prefix: "/api" });
  await app.register(reportRoutes(reportService), { prefix: "/api" });

  app.addHook("onSend", async (_request, reply) => {
    if (!secureCookies && env.NODE_ENV !== "production") {
      reply.header("x-cookie-secure-disabled", "true");
    }
  });

  return app;
}
