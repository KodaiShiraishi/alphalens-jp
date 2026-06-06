import { and, desc, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { env } from "../config/env.js";
import { db } from "../db/client.js";
import { analysisReports, stocks } from "../db/schema.js";
import type { MarketService } from "./marketService.js";
import type { AnalysisReportBody, DailyPrice, FinancialStatement, Stock } from "../types/domain.js";
import { errors } from "../utils/errors.js";
import { stableHash } from "../utils/crypto.js";
import {
  analysisReportBodySchema,
  type AnalysisReportLanguage,
  analysisReportDisclaimerFor,
  analysisReportJsonSchema,
  validateReportSafety
} from "./analysisReportPolicy.js";

const inputSchemaVersion = "analysis-input-v2";
const disclaimerPolicy =
  "Do not provide investment advice, target price, buy/sell recommendation, forecast, or guaranteed return.";

export type ReportBodyGenerator = (
  sourceSnapshot: unknown,
  language: AnalysisReportLanguage
) => Promise<{ body: unknown; providerResponseId?: string }>;

export class ReportService {
  constructor(
    private readonly marketService: MarketService,
    private readonly reportBodyGenerator: ReportBodyGenerator = defaultReportBodyGenerator
  ) {}

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
      language: input.language,
      stock: detail.stock,
      latestPrice: detail.latestPrice,
      latestFinancials: detail.latestFinancials,
      priceSummary: buildPriceSummary(prices),
      financials,
      missingData: collectMissingData(prices, financials),
      pricePoints: prices.length,
      financialPeriods: financials.map((item) => item.periodEnd),
      disclaimerPolicy,
      source: detail.stock.provider
    };
    const inputHash = stableHash({ inputSchemaVersion, sourceSnapshot });
    if (!input.forceRefresh) {
      const existing = await this.findReusableReport(input.userId, detail.stock.code, inputHash);
      if (existing) {
        return { report: serializeReport(existing) };
      }
    }

    const generated = await this.createReportBody(sourceSnapshot, input.language);
    const body = generated.body;
    const safe = validateReportSafety(body);
    if (!safe.ok) throw errors.aiProvider();

    const [saved] = await db
      .insert(analysisReports)
      .values({
        id: randomUUID(),
        userId: input.userId,
        stockCode: detail.stock.code,
        title: reportTitle(detail.stock, input.language),
        summary: body.summary,
        body,
        sourceSnapshot,
        inputHash,
        inputSchemaVersion,
        modelProvider: env.AI_PROVIDER === "openai" ? "openai" : "mock",
        modelName: env.AI_PROVIDER === "openai" ? env.OPENAI_MODEL : "mock-rule-based",
        providerResponseId: generated.providerResponseId ?? null,
        safetyFlags: safe.flags.length ? safe.flags : null,
        disclaimer: analysisReportDisclaimerFor(input.language)
      })
      .returning();

    return { report: serializeReport(saved) };
  }

  async listReports(
    userId: string,
    code?: string,
    limit = 20
  ): Promise<Array<{ id: string; stockCode: string; stockName: string; title: string; createdAt: string }>> {
    const filters = [eq(analysisReports.userId, userId)];
    if (code) {
      const detail = await this.marketService.getDetail(code);
      filters.push(eq(analysisReports.stockCode, detail.stock.code));
    }
    const rows = await db
      .select({
        id: analysisReports.id,
        stockCode: analysisReports.stockCode,
        stockName: stocks.name,
        title: analysisReports.title,
        createdAt: analysisReports.createdAt
      })
      .from(analysisReports)
      .innerJoin(stocks, eq(stocks.code, analysisReports.stockCode))
      .where(and(...filters))
      .orderBy(desc(analysisReports.createdAt))
      .limit(limit);
    return rows.map((row) => ({
      id: row.id,
      stockCode: row.stockCode,
      stockName: row.stockName,
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

  private async createReportBody(
    sourceSnapshot: unknown,
    language: AnalysisReportLanguage
  ): Promise<{ body: AnalysisReportBody; providerResponseId?: string }> {
    let result: { body: unknown; providerResponseId?: string };
    try {
      result = await this.reportBodyGenerator(sourceSnapshot, language);
      return { body: analysisReportBodySchema.parse(result.body), providerResponseId: result.providerResponseId };
    } catch {
      throw errors.aiProvider();
    }
  }
}

async function defaultReportBodyGenerator(
  sourceSnapshot: unknown,
  language: AnalysisReportLanguage
): Promise<{ body: unknown; providerResponseId?: string }> {
  if (env.AI_PROVIDER === "openai" && env.OPENAI_API_KEY) {
    return callOpenAI(sourceSnapshot, language);
  }
  return { body: createMockReport(sourceSnapshot as ReportSourceSnapshot, language) };
}

type ReportSourceSnapshot = {
  language: AnalysisReportLanguage;
  stock: Stock;
  latestPrice: DailyPrice | null;
  priceSummary: PriceSummary;
  financials: FinancialStatement[];
  latestFinancials: FinancialStatement | null;
  missingData: string[];
  disclaimerPolicy: string;
  source: string;
};

type PriceSummary = {
  latestDate: string | null;
  latestClose: number | null;
  oneMonthChangePct: number | null;
  threeMonthChangePct: number | null;
  volumeTrend: "increasing" | "decreasing" | "flat" | "unknown";
};

function createMockReport(source: ReportSourceSnapshot, language: AnalysisReportLanguage): AnalysisReportBody {
  const f = source.latestFinancials;
  const operatingMargin = f?.netSales && f.operatingProfit ? f.operatingProfit / f.netSales : null;
  const disclaimer = analysisReportDisclaimerFor(language);
  if (language === "en") {
    const stockName = source.stock.nameEn ?? source.stock.name;
    return {
      summary: `${stockName} can be reviewed using the available financial data for revenue scale, profitability, and balance sheet stability.`,
      growth: f?.netSales
        ? `Latest net sales were ${formatYen(f.netSales)}. Compare this with prior periods before drawing conclusions about growth.`
        : "Net sales data is missing, so growth is not assessed.",
      profitability: operatingMargin
        ? `The operating margin is approximately ${(operatingMargin * 100).toFixed(1)}%. Peer comparison is needed before judging profitability.`
        : "Operating profit or net sales data is missing, so profitability is not assessed.",
      stability: f?.equityRatio
        ? `The equity ratio is approximately ${(f.equityRatio * 100).toFixed(1)}%, which is an initial reference point for financial stability.`
        : "Equity ratio data is missing, so stability is not assessed.",
      risks: ["The analysis is limited by the range of data available from the external API.", "This report does not predict future share prices or business results."],
      checkpoints: ["Check revenue and operating margin changes in the next earnings release.", "Confirm whether the data source is Mock or live market data."],
      evidence: f
        ? [
            {
              label: "Operating profit",
              period: f.periodEnd,
              value: f.operatingProfit ?? "No data",
              source: `${source.source} / financial_statements`
            }
          ]
        : [],
      dataLimitations: [
        ...(source.source === "mock" ? ["This report uses sample data from the Mock Provider."] : []),
        ...missingDataLimitations(source.missingData, language)
      ],
      disclaimer
    };
  }
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
    dataLimitations: [
      ...(source.source === "mock" ? ["このレポートはMock Providerのサンプルデータを使用しています。"] : []),
      ...missingDataLimitations(source.missingData, language)
    ],
    disclaimer
  };
}

async function callOpenAI(
  sourceSnapshot: unknown,
  language: AnalysisReportLanguage
): Promise<{ body: AnalysisReportBody; providerResponseId: string }> {
  const { default: OpenAI } = await import("openai");
  const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  const disclaimer = analysisReportDisclaimerFor(language);
  const languageInstruction =
    language === "ja"
      ? "Write the report in Japanese."
      : "Write the report in English.";
  const response = await client.responses.create({
    model: env.OPENAI_MODEL,
    input: [
      {
        role: "system",
        content: [
          "You generate fundamental equity research notes for Japanese listed companies.",
          languageInstruction,
          "Do not provide investment advice, buy/sell recommendations, target prices, forecasts, or guarantees.",
          "Use only the structured input data. Return only JSON."
        ].join(" ")
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
    ],
    text: {
      format: {
        type: "json_schema",
        name: "analysis_report",
        description: "Fundamental research memo without investment advice.",
        strict: true,
        schema: analysisReportJsonSchema
      }
    }
  });
  if (response.status && response.status !== "completed") throw errors.aiProvider();
  const text = response.output_text;
  if (!text) throw errors.aiProvider();
  return { body: JSON.parse(text) as AnalysisReportBody, providerResponseId: response.id };
}

function reportTitle(stock: { name: string; nameEn?: string | null }, language: AnalysisReportLanguage): string {
  if (language === "en") return `${stock.nameEn ?? stock.name} Fundamental Research Memo`;
  return `${stock.name} ファンダメンタルズ調査メモ`;
}

function buildPriceSummary(prices: DailyPrice[]): PriceSummary {
  const priced = prices
    .filter((price): price is DailyPrice & { close: number } => price.close !== null)
    .sort((a, b) => a.date.localeCompare(b.date));
  const latest = priced.at(-1) ?? null;
  return {
    latestDate: latest?.date ?? null,
    latestClose: latest?.close ?? null,
    oneMonthChangePct: changePctFromLookback(priced, 30),
    threeMonthChangePct: changePctFromLookback(priced, 90),
    volumeTrend: volumeTrend(prices)
  };
}

function changePctFromLookback(prices: Array<DailyPrice & { close: number }>, days: number): number | null {
  const latest = prices.at(-1);
  if (!latest || latest.close === 0) return null;
  const target = new Date(`${latest.date}T00:00:00.000Z`);
  target.setUTCDate(target.getUTCDate() - days);
  const targetDate = target.toISOString().slice(0, 10);
  const previous = [...prices].reverse().find((price) => price.date <= targetDate);
  if (!previous || previous.close === 0) return null;
  return (latest.close - previous.close) / previous.close;
}

function volumeTrend(prices: DailyPrice[]): PriceSummary["volumeTrend"] {
  const volumes = prices
    .filter((price): price is DailyPrice & { volume: number } => price.volume !== null)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (volumes.length < 10) return "unknown";
  const recent = average(volumes.slice(-5).map((price) => price.volume));
  const previous = average(volumes.slice(-10, -5).map((price) => price.volume));
  if (previous === 0) return "unknown";
  const change = (recent - previous) / previous;
  if (change > 0.05) return "increasing";
  if (change < -0.05) return "decreasing";
  return "flat";
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function collectMissingData(prices: DailyPrice[], financials: FinancialStatement[]): string[] {
  const missing = new Set<string>();
  const latestPrice = prices.at(-1);
  const latestFinancial = financials.at(-1);
  if (prices.length === 0) missing.add("prices");
  if (latestPrice?.close === null || latestPrice?.close === undefined) missing.add("latest_close");
  if (!prices.some((price) => price.volume !== null)) missing.add("volume");
  if (financials.length === 0) missing.add("financials");
  if (latestFinancial?.netSales === null || latestFinancial?.netSales === undefined) missing.add("net_sales");
  if (latestFinancial?.operatingProfit === null || latestFinancial?.operatingProfit === undefined) missing.add("operating_profit");
  if (latestFinancial?.profit === null || latestFinancial?.profit === undefined) missing.add("profit");
  if (latestFinancial?.eps === null || latestFinancial?.eps === undefined) missing.add("eps");
  if (latestFinancial?.bps === null || latestFinancial?.bps === undefined) missing.add("bps");
  if (!financials.some((item) => item.operatingCashFlow !== null || item.freeCashFlow !== null)) missing.add("cash_flow");
  return [...missing];
}

function missingDataLimitations(missingData: string[], language: AnalysisReportLanguage): string[] {
  if (missingData.length === 0) return [];
  if (language === "en") return [`Missing or unavailable data: ${missingData.join(", ")}.`];
  return [`不足または未取得のデータ: ${missingData.join(", ")}。`];
}

function serializeReport(row: {
  id: string;
  stockCode: string;
  title: string;
  summary: string;
  body: unknown;
  sourceSnapshot: unknown;
  inputHash: string;
  disclaimer: string;
  createdAt: Date;
}) {
  return {
    id: row.id,
    stockCode: row.stockCode,
    title: row.title,
    summary: row.summary,
    body: row.body as AnalysisReportBody,
    sourceSnapshot: row.sourceSnapshot,
    disclaimer: row.disclaimer,
    inputDataVersion: row.inputHash,
    createdAt: row.createdAt.toISOString()
  };
}

function formatYen(value: number): string {
  if (Math.abs(value) >= 1_000_000_000_000) return `${(value / 1_000_000_000_000).toFixed(1)}兆円`;
  if (Math.abs(value) >= 100_000_000) return `${(value / 100_000_000).toFixed(1)}億円`;
  return `${value.toLocaleString("ja-JP")}円`;
}
