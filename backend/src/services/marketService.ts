import { daysAgoIso, todayIso } from "../utils/dates.js";
import { env } from "../config/env.js";
import { AppError, errors } from "../utils/errors.js";
import { stableHash } from "../utils/crypto.js";
import type { MarketDataProvider } from "../providers/marketDataProvider.js";
import type { DailyPrice, FinancialStatement, Stock } from "../types/domain.js";
import { withRetry } from "./retry.js";
import {
  findStock,
  findStocks,
  latestDailyPrice,
  listDailyPrices,
  listFinancialStatements,
  logProviderFetch,
  upsertDailyPrices,
  upsertFinancialStatements,
  upsertStock
} from "../repositories/marketRepository.js";
import { attachDerivedMetrics } from "./metrics.js";

export class MarketService {
  constructor(private readonly provider: MarketDataProvider) {}

  async search(input: { query?: string; market?: string; sector?: string; limit: number }): Promise<{ items: Stock[]; total: number }> {
    const requestHash = stableHash(input);
    let providerItems: Stock[];
    try {
      providerItems = await this.callProvider("searchStocks", null, requestHash, () => this.provider.searchStocks(input));
      await logProviderFetch({
        provider: this.provider.name,
        endpoint: "searchStocks",
        status: "succeeded",
        requestHash
      });
    } catch (error) {
      await logProviderFetch({
        provider: this.provider.name,
        endpoint: "searchStocks",
        status: "failed",
        statusCode: statusCodeFromError(error),
        requestHash,
        errorMessage: error instanceof Error ? error.message : "unknown error"
      });
      throw errors.marketProvider();
    }
    for (const item of providerItems) {
      await upsertStock(item);
    }
    const dbItems = await findStocks(input);
    return {
      items: await Promise.all(
        dbItems.map(async (stock) => {
          const price = await latestDailyPrice(stock.code);
          return { ...stock, lastPrice: price?.close ?? stock.lastPrice ?? null };
        })
      ),
      total: dbItems.length
    };
  }

  async getDetail(code: string): Promise<{
    stock: Stock;
    latestPrice: DailyPrice | null;
    latestFinancials: FinancialStatement | null;
    dataUpdatedAt: string;
  }> {
    await this.ensureStockData(code);
    const normalized = await this.provider.normalizeCode(code);
    const profile = await findStock(normalized.displayCode);
    if (!profile) throw errors.stockNotFound();
    const [latestPrice, financials] = await Promise.all([
      latestDailyPrice(profile.code),
      listFinancialStatements(profile.code)
    ]);
    const financialsWithMetrics = attachDerivedMetrics(financials, latestPrice?.close ?? null);
    const latestFinancials = financialsWithMetrics.at(-1) ?? null;
    return {
      stock: { ...profile, lastPrice: latestPrice?.close ?? null },
      latestPrice,
      latestFinancials,
      dataUpdatedAt: new Date().toISOString()
    };
  }

  async getPrices(code: string, from = daysAgoIso(365), to = todayIso()): Promise<DailyPrice[]> {
    await this.ensureStockData(code);
    const normalized = await this.provider.normalizeCode(code);
    return listDailyPrices(normalized.displayCode, from, to);
  }

  async getFinancials(code: string): Promise<FinancialStatement[]> {
    await this.ensureStockData(code);
    const normalized = await this.provider.normalizeCode(code);
    const [latestPrice, statements] = await Promise.all([
      latestDailyPrice(normalized.displayCode),
      listFinancialStatements(normalized.displayCode)
    ]);
    return attachDerivedMetrics(statements, latestPrice?.close ?? null);
  }

  async ensureStockData(code: string): Promise<void> {
    const normalized = await this.provider.normalizeCode(code);
    const cached = await findStock(normalized.displayCode);
    if (cached) {
      const prices = await listDailyPrices(cached.code, daysAgoIso(365), todayIso());
      const statements = await listFinancialStatements(cached.code);
      if (prices.length > 0 && statements.length > 0) return;
    }

    try {
      await this.callProvider("ensureStockData", null, stableHash({ code }), async () => {
        const profile = await this.provider.getStockProfile(code);
        if (!profile) throw errors.stockNotFound();
        await upsertStock(profile);
        const to = new Date();
        const from = new Date();
        from.setUTCFullYear(to.getUTCFullYear() - 1);
        const [prices, statements] = await Promise.all([
          this.provider.getDailyPrices(profile.code, from, to),
          this.provider.getFinancialStatements(profile.code)
        ]);
        await upsertDailyPrices(profile.code, prices);
        await upsertFinancialStatements(profile.code, statements);
        return profile;
      });
      const normalizedAfterFetch = await this.provider.normalizeCode(code);
      await logProviderFetch({
        provider: this.provider.name,
        endpoint: "ensureStockData",
        stockCode: normalizedAfterFetch.displayCode,
        status: "succeeded",
        requestHash: stableHash({ code })
      });
    } catch (error) {
      await logProviderFetch({
        provider: this.provider.name,
        endpoint: "ensureStockData",
        stockCode: null,
        status: "failed",
        statusCode: statusCodeFromError(error),
        requestHash: stableHash({ code }),
        errorMessage: error instanceof Error ? error.message : "unknown error"
      });
      if (error instanceof AppError) throw error;
      throw errors.marketProvider();
    }
  }

  private async callProvider<T>(
    endpoint: string,
    stockCode: string | null,
    requestHash: string,
    operation: () => Promise<T>
  ): Promise<T> {
    return withRetry(operation, {
      maxRetries: env.MARKET_DATA_MAX_RETRIES,
      delayMs: env.MARKET_DATA_RETRY_DELAY_MS,
      shouldRetry: (error) => !(error instanceof AppError),
      onRetry: async ({ attempt, nextAttempt, error }) => {
        await logProviderFetch({
          provider: this.provider.name,
          endpoint,
          stockCode,
          status: "failed",
          statusCode: statusCodeFromError(error),
          requestHash,
          errorMessage: `attempt ${attempt} failed; retrying attempt ${nextAttempt}: ${error instanceof Error ? error.message : "unknown error"}`
        });
      }
    });
  }
}

function statusCodeFromError(error: unknown): number | null {
  if (!error || typeof error !== "object" || !("statusCode" in error)) return null;
  const statusCode = (error as { statusCode?: unknown }).statusCode;
  return typeof statusCode === "number" ? statusCode : null;
}
