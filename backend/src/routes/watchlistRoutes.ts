import { and, desc, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { sessionCookieName } from "../config/env.js";
import { db } from "../db/client.js";
import { stocks, watchlistItems } from "../db/schema.js";
import { latestAnalysisReportCreatedAt, latestDailyPrices } from "../repositories/marketRepository.js";
import { requireUser } from "../services/authService.js";
import type { MarketService } from "../services/marketService.js";
import { errors } from "../utils/errors.js";

const stockCodeSchema = z.string().regex(/^\d{4,5}$/, "stock code must be four or five digits");

const addSchema = z.object({
  code: stockCodeSchema,
  note: z.string().max(1000).optional()
});

export function watchlistRoutes(marketService: MarketService): FastifyPluginAsync {
  return async (app) => {
    app.get("/watchlist", async (request) => {
      const user = await requireUser(request.cookies[sessionCookieName]);
      const rows = await db
        .select({
          code: stocks.code,
          name: stocks.name,
          createdAt: watchlistItems.createdAt
        })
        .from(watchlistItems)
        .innerJoin(stocks, eq(stocks.code, watchlistItems.stockCode))
        .where(eq(watchlistItems.userId, user.id))
        .orderBy(desc(watchlistItems.createdAt));
      const items = await Promise.all(
        rows.map(async (row) => {
          const [latestPrice, previousPrice] = await latestDailyPrices(row.code, 2);
          const latestClose = latestPrice?.close ?? null;
          const previousClose = previousPrice?.close ?? null;
          const priceChange =
            latestClose !== null && previousClose !== null ? latestClose - previousClose : null;
          const priceChangePct =
            priceChange !== null && previousClose ? priceChange / previousClose : null;
          const lastAnalyzedAt = await latestAnalysisReportCreatedAt(user.id, row.code);
          return {
            code: row.code,
            name: row.name,
            latestPrice: latestClose,
            previousClose,
            priceChange,
            priceChangePct,
            lastAnalyzedAt: lastAnalyzedAt?.toISOString() ?? null,
            createdAt: row.createdAt.toISOString()
          };
        })
      );
      return { items };
    });

    app.post("/watchlist", async (request) => {
      const user = await requireUser(request.cookies[sessionCookieName]);
      const input = addSchema.parse(request.body);
      await marketService.ensureStockData(input.code);
      const detail = await marketService.getDetail(input.code);
      try {
        await db.insert(watchlistItems).values({
          id: randomUUID(),
          userId: user.id,
          stockCode: detail.stock.code,
          note: input.note ?? null
        });
      } catch {
        throw errors.watchlistAlreadyExists();
      }
      return { ok: true };
    });

    app.delete<{ Params: { code: string } }>("/watchlist/:code", async (request) => {
      const user = await requireUser(request.cookies[sessionCookieName]);
      const detail = await marketService.getDetail(stockCodeSchema.parse(request.params.code));
      await db
        .delete(watchlistItems)
        .where(and(eq(watchlistItems.userId, user.id), eq(watchlistItems.stockCode, detail.stock.code)));
      return { ok: true };
    });
  };
}
