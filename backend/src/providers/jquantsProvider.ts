import { env } from "../config/env.js";
import type {
  DailyPrice,
  FinancialStatement,
  Stock,
  StockCode,
  StockProfile,
  StockSearchQuery
} from "../types/domain.js";
import type { MarketDataProvider, ProviderRequestOptions } from "./marketDataProvider.js";

type JQuantsTokenResponse = {
  refreshToken: string;
};

type JQuantsIdTokenResponse = {
  idToken: string;
};

export class JQuantsProvider implements MarketDataProvider {
  readonly name = "jquants" as const;
  private refreshToken: string | null = null;
  private idToken: string | null = null;
  private idTokenExpiresAt = 0;

  async normalizeCode(input: string): Promise<StockCode> {
    const normalized = input.trim().replace(/\D/g, "");
    if (normalized.length === 5) {
      return { displayCode: normalized.slice(0, 4), providerCode: normalized };
    }
    return { displayCode: normalized, providerCode: normalized.length === 4 ? `${normalized}0` : normalized };
  }

  async searchStocks(query: StockSearchQuery, options?: ProviderRequestOptions): Promise<Stock[]> {
    const token = await this.getToken(options);
    const url = new URL("https://api.jquants.com/v1/listed/info");
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: options?.signal
    });
    if (!response.ok) throw new Error(`J-Quants listed info failed: ${response.status}`);
    const payload = (await response.json()) as { info?: Array<Record<string, string>> };
    const q = query.query?.trim().toLowerCase();
    return (payload.info ?? [])
      .map((item) => this.mapListedInfo(item))
      .filter((stock) => {
        if (!q) return true;
        return stock.code.includes(q) || stock.name.toLowerCase().includes(q) || stock.nameEn?.toLowerCase().includes(q);
      })
      .slice(0, query.limit);
  }

  async getStockProfile(code: string, options?: ProviderRequestOptions): Promise<StockProfile | null> {
    const stocks = await this.searchStocks({ query: code, limit: 10 }, options);
    const normalized = await this.normalizeCode(code);
    const stock = stocks.find((item) => item.displayCode === normalized.displayCode || item.providerCode === normalized.providerCode);
    if (!stock) return null;
    const { lastPrice: _lastPrice, ...profile } = stock;
    return profile;
  }

  async getDailyPrices(code: string, from: Date, to: Date, options?: ProviderRequestOptions): Promise<DailyPrice[]> {
    const token = await this.getToken(options);
    const normalized = await this.normalizeCode(code);
    const url = new URL("https://api.jquants.com/v1/prices/daily_quotes");
    url.searchParams.set("code", normalized.providerCode);
    url.searchParams.set("from", from.toISOString().slice(0, 10).replaceAll("-", ""));
    url.searchParams.set("to", to.toISOString().slice(0, 10).replaceAll("-", ""));
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: options?.signal
    });
    if (!response.ok) throw new Error(`J-Quants daily quotes failed: ${response.status}`);
    const payload = (await response.json()) as { daily_quotes?: Array<Record<string, string | number | null>> };
    return (payload.daily_quotes ?? []).map((item) => ({
      date: String(item.Date),
      open: toNumber(item.Open),
      high: toNumber(item.High),
      low: toNumber(item.Low),
      close: toNumber(item.Close),
      adjustedClose: toNumber(item.AdjustmentClose ?? item.Close),
      volume: toNumber(item.Volume),
      turnoverValue: toNumber(item.TurnoverValue)
    }));
  }

  async getFinancialStatements(code: string, options?: ProviderRequestOptions): Promise<FinancialStatement[]> {
    const token = await this.getToken(options);
    const normalized = await this.normalizeCode(code);
    const url = new URL("https://api.jquants.com/v1/fins/statements");
    url.searchParams.set("code", normalized.providerCode);
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: options?.signal
    });
    if (!response.ok) throw new Error(`J-Quants statements failed: ${response.status}`);
    const payload = (await response.json()) as { statements?: Array<Record<string, string | number | null>> };
    return (payload.statements ?? []).map((item) => ({
      periodType: "FY",
      periodEnd: String(item.CurrentPeriodEndDate ?? item.CurrentFiscalYearEndDate),
      disclosedAt: item.DisclosedDate ? String(item.DisclosedDate) : null,
      netSales: toNumber(item.NetSales),
      operatingProfit: toNumber(item.OperatingProfit),
      ordinaryProfit: toNumber(item.OrdinaryProfit),
      profit: toNumber(item.Profit),
      eps: toNumber(item.EarningsPerShare),
      bps: toNumber(item.BookValuePerShare),
      equityRatio: toNumber(item.EquityToAssetRatio),
      roe: null,
      totalAssets: toNumber(item.TotalAssets),
      equity: toNumber(item.Equity),
      operatingCashFlow: null,
      freeCashFlow: null
    }));
  }

  private mapListedInfo(item: Record<string, string>): Stock {
    const code = String(item.Code ?? "");
    return {
      code: code.slice(0, 4),
      displayCode: code.slice(0, 4),
      providerCode: code,
      name: String(item.CompanyName ?? item.CompanyNameJapanese ?? code),
      nameEn: item.CompanyNameEnglish ?? null,
      market: item.MarketCodeName ?? null,
      sector17: item.Sector17CodeName ?? null,
      sector33: item.Sector33CodeName ?? null,
      lastPrice: null,
      provider: "jquants",
      providerUpdatedAt: new Date()
    };
  }

  private async getToken(options?: ProviderRequestOptions): Promise<string> {
    if (this.idToken && Date.now() < this.idTokenExpiresAt) return this.idToken;
    if (!env.JQUANTS_EMAIL || !env.JQUANTS_PASSWORD) {
      throw new Error("J-Quants credentials are not configured.");
    }
    if (!this.refreshToken) {
      const response = await fetch("https://api.jquants.com/v1/token/auth_user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mailaddress: env.JQUANTS_EMAIL, password: env.JQUANTS_PASSWORD }),
        signal: options?.signal
      });
      if (!response.ok) throw new Error(`J-Quants auth_user failed: ${response.status}`);
      const payload = (await response.json()) as JQuantsTokenResponse;
      this.refreshToken = payload.refreshToken;
    }

    const url = new URL("https://api.jquants.com/v1/token/auth_refresh");
    url.searchParams.set("refreshtoken", this.refreshToken);
    const response = await fetch(url, {
      method: "POST",
      signal: options?.signal
    });
    if (!response.ok) throw new Error(`J-Quants auth_refresh failed: ${response.status}`);
    const payload = (await response.json()) as JQuantsIdTokenResponse;
    this.idToken = payload.idToken;
    this.idTokenExpiresAt = Date.now() + 23 * 60 * 60 * 1000;
    return payload.idToken;
  }
}

function toNumber(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
