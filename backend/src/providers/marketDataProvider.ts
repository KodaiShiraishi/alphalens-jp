import type {
  DailyPrice,
  FinancialStatement,
  Stock,
  StockCode,
  StockProfile,
  StockSearchQuery
} from "../types/domain.js";

export type ProviderRequestOptions = {
  signal?: AbortSignal;
};

export interface MarketDataProvider {
  readonly name: "mock" | "jquants";
  normalizeCode(input: string, options?: ProviderRequestOptions): Promise<StockCode>;
  searchStocks(query: StockSearchQuery, options?: ProviderRequestOptions): Promise<Stock[]>;
  getStockProfile(code: string, options?: ProviderRequestOptions): Promise<StockProfile | null>;
  getDailyPrices(code: string, from: Date, to: Date, options?: ProviderRequestOptions): Promise<DailyPrice[]>;
  getFinancialStatements(code: string, options?: ProviderRequestOptions): Promise<FinancialStatement[]>;
}
