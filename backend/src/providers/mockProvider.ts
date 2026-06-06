import type {
  DailyPrice,
  FinancialStatement,
  Stock,
  StockCode,
  StockProfile,
  StockSearchQuery
} from "../types/domain.js";
import type { MarketDataProvider } from "./marketDataProvider.js";
import { mockFinancials, mockPrices, mockProfiles, mockStocks } from "./mockData.js";

export class MockMarketDataProvider implements MarketDataProvider {
  readonly name = "mock" as const;

  async normalizeCode(input: string): Promise<StockCode> {
    const normalized = input.trim().replace(/\D/g, "");
    const stock = mockStocks.find((item) => item.displayCode === normalized || item.providerCode === normalized);
    if (stock) {
      return { displayCode: stock.displayCode, providerCode: stock.providerCode };
    }
    if (normalized.length === 4) {
      return { displayCode: normalized, providerCode: `${normalized}0` };
    }
    if (normalized.length === 5) {
      return { displayCode: normalized.slice(0, 4), providerCode: normalized };
    }
    return { displayCode: normalized, providerCode: normalized };
  }

  async searchStocks(query: StockSearchQuery): Promise<Stock[]> {
    const q = query.query?.trim().toLowerCase();
    return mockStocks
      .filter((stock) => {
        if (query.market && stock.market?.toLowerCase() !== query.market.toLowerCase()) return false;
        if (query.sector && !stock.sector33?.toLowerCase().includes(query.sector.toLowerCase())) return false;
        if (!q) return true;
        return (
          stock.code.includes(q) ||
          stock.providerCode.includes(q) ||
          stock.name.toLowerCase().includes(q) ||
          stock.nameEn?.toLowerCase().includes(q)
        );
      })
      .slice(0, query.limit);
  }

  async getStockProfile(code: string): Promise<StockProfile | null> {
    const normalized = await this.normalizeCode(code);
    return (
      mockProfiles.find(
        (profile) =>
          profile.code === normalized.displayCode || profile.providerCode === normalized.providerCode
      ) ?? null
    );
  }

  async getDailyPrices(code: string): Promise<DailyPrice[]> {
    const normalized = await this.normalizeCode(code);
    return mockPrices(normalized.displayCode);
  }

  async getFinancialStatements(code: string): Promise<FinancialStatement[]> {
    const normalized = await this.normalizeCode(code);
    return mockFinancials(normalized.displayCode);
  }
}
