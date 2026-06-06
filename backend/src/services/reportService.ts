import { and, desc, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { env } from "../config/env.js";
import { db } from "../db/client.js";
import { analysisReports } from "../db/schema.js";
import type { MarketService } from "./marketService.js";
import type { AnalysisReportBody } from "../types/domain.js";
import { errors } from "../utils/errors.js";
import { stableHash } from "../utils/crypto.js";

const inputSchemaVersion = "analysis-input-v1";
const disclaimer = "このレポートは投資助言ではありません。";

const reportBodySchema = z.object({
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

const prohibitedPatterns = [/必ず上がる/, /目標株価/, /投資すべき/, /利益保証/];

export class ReportService {
  constructor(private readonly marketService: MarketService) {}

  async generateReport(input: {
    userId: string;
    code: string;
    language: "ja" | "en";
    forceRefresh: boolean;
  }): Promise<{
    report: {
      id: string;
      stockCode: string;
      title: string;
      summary: string;
      body: AnalysisReportBody;
      inputDataVersion: string;
      createdAt: string;
    };
  }> {
    const detail = await this.marketService.getDetail(input.code);
    const [prices, financials] = await Promise.all([
      this.marketService.getPrices(detail.stock.code),
      this.marketService.getFinancials(detail.stock.code)
    ]);
    const sourceSnapshot = {
      stock: detail.stock,
      latestPrice: detail.latestPrice,
      latestFinancials: detail.latestFinancials,
      pricePoints: prices.length,
      financialPeriods: financials.map((item) => item.periodEnd),
      source: detail.stock.provider
    };
    const inputHash = stableHash(sourceSnapshot);
    if (!input.forceRefresh) {
      const existing = await this.findReusableReport(input.userId, detail.stock.code, inputHash);
      if (existing) {
        return { report: serializeReport(existing) };
      }
    }

    const body = await this.createReportBody(sourceSnapshot);
    const safe = validateSafety(body);
    if (!safe.ok) throw errors.aiProvider();

    const [saved] = await db
      .insert(analysisReports)
      .values({
        id: randomUUID(),
        userId: input.userId,
        stockCode: detail.stock.code,
        title: `${detail.stock.name} ファンダメンタルズ調査メモ`,
        summary: body.summary,
        body,
        sourceSnapshot,
        inputHash,
        inputSchemaVersion,
        modelProvider: env.AI_PROVIDER === "openai" ? "openai" : "mock",
        modelName: env.AI_PROVIDER === "openai" ? env.OPENAI_MODEL : "mock-rule-based",
        providerResponseId: null,
        safetyFlags: safe.flags.length ? safe.flags : null,
        disclaimer
      })
      .returning();

    return { report: serializeReport(saved) };
  }

  async listReports(userId: string, code?: string, limit = 20): Promise<Array<{ id: string; stockCode: string; title: string; createdAt: string }>> {
    const filters = [eq(analysisReports.userId, userId)];
    if (code) filters.push(eq(analysisReports.stockCode, code));
    const rows = await db
      .select()
      .from(analysisReports)
      .where(and(...filters))
      .orderBy(desc(analysisReports.createdAt))
      .limit(limit);
    return rows.map((row) => ({
      id: row.id,
      stockCode: row.stockCode,
      title: row.title,
      createdAt: row.createdAt.toISOString()
    }));
  }

  async getReport(userId: string, id: string): Promise<ReturnType<typeof serializeReport>> {
    const [row] = await db
      .select()
      .from(analysisReports)
      .where(and(eq(analysisReports.userId, userId), eq(analysisReports.id, id)))
      .limit(1);
    if (!row) throw errors.reportNotFound();
    return serializeReport(row);
  }

  private async findReusableReport(userId: string, stockCode: string, inputHash: string) {
    const [row] = await db
      .select()
      .from(analysisReports)
      .where(
        and(
          eq(analysisReports.userId, userId),
          eq(analysisReports.stockCode, stockCode),
          eq(analysisReports.inputHash, inputHash)
        )
      )
      .orderBy(desc(analysisReports.createdAt))
      .limit(1);
    return row ?? null;
  }

  private async createReportBody(sourceSnapshot: unknown): Promise<AnalysisReportBody> {
    if (env.AI_PROVIDER === "openai" && env.OPENAI_API_KEY) {
      const body = await callOpenAI(sourceSnapshot);
      return reportBodySchema.parse(body);
    }
    return reportBodySchema.parse(createMockReport(sourceSnapshot as ReportSourceSnapshot));
  }
}

type ReportSourceSnapshot = {
  stock: {
    name: string;
    provider: string;
  };
  latestFinancials: {
    periodEnd: string;
    netSales: number | null;
    operatingProfit: number | null;
    profit: number | null;
    equityRatio: number | null;
  } | null;
  source: string;
};

function createMockReport(source: ReportSourceSnapshot): AnalysisReportBody {
  const f = source.latestFinancials;
  const operatingMargin = f?.netSales && f.operatingProfit ? f.operatingProfit / f.netSales : null;
  return {
    summary: `${source.stock.name}は、取得済みの財務データをもとに売上規模、利益水準、財務安全性を確認できます。`,
    growth: f?.netSales
      ? `直近期間の売上高は${formatYen(f.netSales)}です。過去期間との比較で成長率を確認する必要があります。`
      : "売上高データが不足しているため、成長性は断定しません。",
    profitability: operatingMargin
      ? `営業利益率は約${(operatingMargin * 100).toFixed(1)}%です。収益性を見る際は同業他社との比較が必要です。`
      : "営業利益または売上高データが不足しているため、収益性は断定しません。",
    stability: f?.equityRatio
      ? `自己資本比率は約${(f.equityRatio * 100).toFixed(1)}%です。財務安全性の初期確認材料になります。`
      : "自己資本比率データが不足しているため、安全性は断定しません。",
    risks: ["外部APIの取得範囲により分析対象データが限定されます。", "本レポートは将来の株価や業績を予測しません。"],
    checkpoints: ["次回決算で売上高と営業利益率の変化を確認する", "データソースがMockか実データかを確認する"],
    evidence: f
      ? [
          {
            label: "営業利益",
            period: f.periodEnd,
            value: f.operatingProfit ?? "データなし",
            source: `${source.source} / financial_statements`
          }
        ]
      : [],
    dataLimitations: source.source === "mock" ? ["このレポートはMock Providerのサンプルデータを使用しています。"] : [],
    disclaimer
  };
}

async function callOpenAI(sourceSnapshot: unknown): Promise<AnalysisReportBody> {
  const { default: OpenAI } = await import("openai");
  const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  const response = await client.responses.create({
    model: env.OPENAI_MODEL,
    input: [
      {
        role: "system",
        content:
          "You generate Japanese fundamental research notes. Do not provide investment advice, buy/sell recommendations, target prices, or guarantees. Return only JSON."
      },
      {
        role: "user",
        content: JSON.stringify({
          sourceSnapshot,
          schema: {
            summary: "string",
            growth: "string",
            profitability: "string",
            stability: "string",
            risks: ["string"],
            checkpoints: ["string"],
            evidence: [{ label: "string", period: "string", value: "number|string", source: "string" }],
            dataLimitations: ["string"],
            disclaimer
          }
        })
      }
    ]
  } as never);
  const text = (response as { output_text?: string }).output_text;
  if (!text) throw errors.aiProvider();
  return JSON.parse(text) as AnalysisReportBody;
}

function validateSafety(body: AnalysisReportBody): { ok: boolean; flags: string[] } {
  const text = JSON.stringify(body);
  const flags = prohibitedPatterns.filter((pattern) => pattern.test(text)).map((pattern) => pattern.source);
  return { ok: flags.length === 0, flags };
}

function serializeReport(row: {
  id: string;
  stockCode: string;
  title: string;
  summary: string;
  body: unknown;
  inputHash: string;
  createdAt: Date;
}) {
  return {
    id: row.id,
    stockCode: row.stockCode,
    title: row.title,
    summary: row.summary,
    body: row.body as AnalysisReportBody,
    inputDataVersion: row.inputHash,
    createdAt: row.createdAt.toISOString()
  };
}

function formatYen(value: number): string {
  if (Math.abs(value) >= 1_000_000_000_000) return `${(value / 1_000_000_000_000).toFixed(1)}兆円`;
  if (Math.abs(value) >= 100_000_000) return `${(value / 100_000_000).toFixed(1)}億円`;
  return `${value.toLocaleString("ja-JP")}円`;
}
