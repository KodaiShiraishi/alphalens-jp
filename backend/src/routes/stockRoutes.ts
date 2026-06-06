import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import type { MarketService } from "../services/marketService.js";

const stockCodeSchema = z.string().regex(/^\d{4,5}$/, "stock code must be four or five digits");
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD");

const searchSchema = z.object({
  query: z.string().trim().min(1).max(100).optional(),
  market: z.string().optional(),
  sector: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20)
});

const priceSchema = z
  .object({
    from: dateSchema.optional(),
    to: dateSchema.optional()
  })
  .refine((value) => !value.from || !value.to || value.from <= value.to, {
    message: "from must be before or equal to to",
    path: ["from"]
  });

export function stockRoutes(marketService: MarketService): FastifyPluginAsync {
  return async (app) => {
    app.get("/stocks", async (request) => {
      const input = searchSchema.parse(request.query);
      return marketService.search(input);
    });

    app.get<{ Params: { code: string } }>("/stocks/:code", async (request) => {
      const code = stockCodeSchema.parse(request.params.code);
      return marketService.getDetail(code);
    });

    app.get<{ Params: { code: string } }>("/stocks/:code/prices", async (request) => {
      const code = stockCodeSchema.parse(request.params.code);
      const query = priceSchema.parse(request.query);
      const items = await marketService.getPrices(code, query.from, query.to);
      return { items };
    });

    app.get<{ Params: { code: string } }>("/stocks/:code/financials", async (request) => {
      const code = stockCodeSchema.parse(request.params.code);
      const items = await marketService.getFinancials(code);
      return { items };
    });
  };
}
