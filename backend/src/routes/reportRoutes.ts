import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { sessionCookieName } from "../config/env.js";
import { requireUser } from "../services/authService.js";
import type { ReportService } from "../services/reportService.js";

const generateSchema = z.object({
  language: z.enum(["ja", "en"]).default("ja"),
  forceRefresh: z.boolean().default(false)
});

const listSchema = z.object({
  code: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20)
});

export function reportRoutes(reportService: ReportService): FastifyPluginAsync {
  return async (app) => {
    app.post<{ Params: { code: string } }>("/stocks/:code/analysis-reports", async (request) => {
      const user = await requireUser(request.cookies[sessionCookieName]);
      const input = generateSchema.parse(request.body ?? {});
      return reportService.generateReport({
        userId: user.id,
        code: request.params.code,
        language: input.language,
        forceRefresh: input.forceRefresh
      });
    });

    app.get("/analysis-reports", async (request) => {
      const user = await requireUser(request.cookies[sessionCookieName]);
      const input = listSchema.parse(request.query);
      const items = await reportService.listReports(user.id, input.code, input.limit);
      return { items };
    });

    app.get<{ Params: { id: string } }>("/analysis-reports/:id", async (request) => {
      const user = await requireUser(request.cookies[sessionCookieName]);
      const report = await reportService.getReport(user.id, request.params.id);
      return { report };
    });
  };
}
