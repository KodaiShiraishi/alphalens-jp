import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import type { MarketService } from "../services/marketService.js";

const searchSchema = z.object({
  query: z.string().optional(),
  market: z.string().optional(),
  sector: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20)
});

const priceSchema = z.object({
  from: z.string().optional(),
  to: z.string().optional()
});

export function stockRoutes(marketService: MarketService): FastifyPluginAsync {
  return async (app) => {
    app.get("/stocks", async (request) => {
      const input = searchSchema.parse(request.query);
      return marketService.search(input);
    });

    app.get<{ Params: { code: string } }>("/stocks/:code", async (request) => {
      return marketService.getDetail(request.params.code);
    });

    app.get<{ Params: { code: string } }>("/stocks/:code/prices", async (request) => {
      const query = priceSchema.parse(request.query);
      const items = await marketService.getPrices(request.params.code, query.from, query.to);
      return { items };
    });

    app.get<{ Params: { code: string } }>("/stocks/:code/financials", async (request) => {
      const items = await marketService.getFinancials(request.params.code);
      return { items };
    });
  };
}
