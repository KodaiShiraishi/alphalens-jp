import { daysAgoIso, todayIso } from "../utils/dates.js";
import { errors } from "../utils/errors.js";
import { stableHash } from "../utils/crypto.js";
import type { MarketDataProvider } from "../providers/marketDataProvider.js";
import type { DailyPrice, FinancialStatement, Stock } from "../types/domain.js";
import {
  findStock,
  findStocks,
  latestDailyPrice,
  latestFinancialStatement,
  listDailyPrices,
  listFinancialStatements,
  logProviderFetch,
  upsertDailyPrices,
  upsertFinancialStatements,
  upsertStock
} from "../repositories/marketRepository.js";

export class MarketService {
  constructor(private readonly provider: MarketDataProvider) {}

  async search(input: { query?: string; market?: string; sector?: string; limit: number }): Promise<{ items: Stock[]; total: number }> {
    const providerItems = await this.provider.searchStocks(input);
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
    const latestPrice = await latestDailyPrice(profile.code);
    const latestFinancials = await latestFinancialStatement(profile.code);
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
    return listFinancialStatements(normalized.displayCode);
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
      await logProviderFetch({
        provider: this.provider.name,
        endpoint: "ensureStockData",
        stockCode: profile.code,
        status: "succeeded",
        requestHash: stableHash({ code })
      });
    } catch (error) {
      await logProviderFetch({
        provider: this.provider.name,
        endpoint: "ensureStockData",
        stockCode: normalized.displayCode,
        status: "failed",
        requestHash: stableHash({ code }),
        errorMessage: error instanceof Error ? error.message : "unknown error"
      });
      throw error;
    }
  }
}
