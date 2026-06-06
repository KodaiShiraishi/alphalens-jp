import { z } from "zod";
import type { AnalysisReportBody } from "../types/domain.js";

export const analysisReportDisclaimer = "このレポートは投資助言ではありません。";

export const analysisReportBodySchema = z.object({
  summary: z.string().min(1),
  growth: z.string().min(1),
  profitability: z.string().min(1),
  stability: z.string().min(1),
  risks: z.array(z.string()),
  checkpoints: z.array(z.string()),
  evidence: z.array(
    z.object({
      label: z.string(),
      period: z.string(),
      value: z.union([z.number(), z.string()]),
      source: z.string()
    })
  ),
  dataLimitations: z.array(z.string()),
  disclaimer: z.string().min(1)
});

export const analysisReportJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "summary",
    "growth",
    "profitability",
    "stability",
    "risks",
    "checkpoints",
    "evidence",
    "dataLimitations",
    "disclaimer"
  ],
  properties: {
    summary: { type: "string" },
    growth: { type: "string" },
    profitability: { type: "string" },
    stability: { type: "string" },
    risks: { type: "array", items: { type: "string" } },
    checkpoints: { type: "array", items: { type: "string" } },
    evidence: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["label", "period", "value", "source"],
        properties: {
          label: { type: "string" },
          period: { type: "string" },
          value: { anyOf: [{ type: "number" }, { type: "string" }] },
          source: { type: "string" }
        }
      }
    },
    dataLimitations: { type: "array", items: { type: "string" } },
    disclaimer: { type: "string" }
  }
} as const;

const prohibitedPatterns = [/買い推奨/, /売り推奨/, /買うべき/, /売るべき/, /必ず上がる/, /目標株価/, /投資すべき/, /利益保証/];

export function validateReportSafety(body: AnalysisReportBody): { ok: boolean; flags: string[] } {
  const text = JSON.stringify(body);
  const flags = prohibitedPatterns.filter((pattern) => pattern.test(text)).map((pattern) => pattern.source);
  return { ok: flags.length === 0, flags };
}
