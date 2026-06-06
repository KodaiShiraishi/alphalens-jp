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
    const path = env.JQUANTS_API_VERSION === "v2" ? "/equities/master" : "/listed/info";
    const normalizedQuery = query.query?.trim().replace(/\D/g, "");
    const payloadItems = await this.getPaginatedPayload(
      path,
      (url) => {
        if (normalizedQuery && /^\d{4,5}$/.test(normalizedQuery)) {
          url.searchParams.set("code", normalizedQuery);
        }
      },
      ["data", "info"],
      "J-Quants listed info",
      options
    );
    const q = query.query?.trim().toLowerCase();
    return payloadItems
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
    const normalized = await this.normalizeCode(code);
    const payloadItems = await this.getPaginatedPayload(
      env.JQUANTS_API_VERSION === "v2" ? "/equities/bars/daily" : "/prices/daily_quotes",
      (url) => {
        url.searchParams.set("code", normalized.providerCode);
        url.searchParams.set("from", from.toISOString().slice(0, 10).replaceAll("-", ""));
        url.searchParams.set("to", to.toISOString().slice(0, 10).replaceAll("-", ""));
      },
      ["data", "daily_quotes"],
      "J-Quants daily quotes",
      options
    );
    return payloadItems.map((item) => ({
      date: toStringValue(firstValue(item, ["Date", "D", "date"])),
      open: toNumber(firstValue(item, ["Open", "O", "open"])),
      high: toNumber(firstValue(item, ["High", "H", "high"])),
      low: toNumber(firstValue(item, ["Low", "L", "low"])),
      close: toNumber(firstValue(item, ["Close", "C", "close"])),
      adjustedClose: toNumber(firstValue(item, ["AdjustmentClose", "AdjClose", "AC", "Close", "C"])),
      volume: toNumber(firstValue(item, ["Volume", "Vo", "volume"])),
      turnoverValue: toNumber(firstValue(item, ["TurnoverValue", "Va", "turnoverValue"]))
    }));
  }

  async getFinancialStatements(code: string, options?: ProviderRequestOptions): Promise<FinancialStatement[]> {
    const normalized = await this.normalizeCode(code);
    const payloadItems = await this.getPaginatedPayload(
      env.JQUANTS_API_VERSION === "v2" ? "/fins/summary" : "/fins/statements",
      (url) => {
        url.searchParams.set("code", normalized.providerCode);
      },
      ["data", "statements"],
      "J-Quants statements",
      options
    );
    return payloadItems.map((item) => ({
      periodType: toPeriodType(firstValue(item, ["TypeOfCurrentPeriod", "PeriodType", "periodType"])),
      periodEnd: toStringValue(firstValue(item, ["CurrentPeriodEndDate", "CurrentFiscalYearEndDate", "PeriodEnd", "FiscalYearEnd", "DisclosedDate"])),
      disclosedAt: toOptionalString(firstValue(item, ["DisclosedDate", "DisclosureDate"])),
      netSales: toNumber(firstValue(item, ["NetSales", "NS", "Sales"])),
      operatingProfit: toNumber(firstValue(item, ["OperatingProfit", "OP"])),
      ordinaryProfit: toNumber(firstValue(item, ["OrdinaryProfit", "ORP"])),
      profit: toNumber(firstValue(item, ["Profit", "NP", "NetIncome"])),
      eps: toNumber(firstValue(item, ["EarningsPerShare", "EPS"])),
      bps: toNumber(firstValue(item, ["BookValuePerShare", "BPS"])),
      equityRatio: toNumber(firstValue(item, ["EquityToAssetRatio", "EquityRatio", "EQR"])),
      roe: toNumber(firstValue(item, ["ROE", "Roe"])),
      totalAssets: toNumber(firstValue(item, ["TotalAssets", "TA"])),
      equity: toNumber(firstValue(item, ["Equity", "EQ"])),
      operatingCashFlow: null,
      freeCashFlow: null
    }));
  }

  private mapListedInfo(item: Record<string, unknown>): Stock {
    const code = toStringValue(firstValue(item, ["Code", "LocalCode", "code"]));
    const displayCode = code.slice(0, 4);
    return {
      code: displayCode,
      displayCode,
      providerCode: code,
      name: toStringValue(firstValue(item, ["CompanyName", "CompanyNameJapanese", "CoName", "Name"])) || code,
      nameEn: toOptionalString(firstValue(item, ["CompanyNameEnglish", "CoNameEn", "NameEn"])),
      market: toOptionalString(firstValue(item, ["MarketCodeName", "MarketName", "MktName", "Mkt"])),
      sector17: toOptionalString(firstValue(item, ["Sector17CodeName", "Sector17Name", "S17Name", "S17"])),
      sector33: toOptionalString(firstValue(item, ["Sector33CodeName", "Sector33Name", "S33Name", "S33"])),
      lastPrice: null,
      provider: "jquants",
      providerUpdatedAt: new Date()
    };
  }

  private apiUrl(path: string): URL {
    const base = env.JQUANTS_API_BASE_URL.endsWith("/") ? env.JQUANTS_API_BASE_URL : `${env.JQUANTS_API_BASE_URL}/`;
    return new URL(path.replace(/^\//, ""), base);
  }

  private async getPaginatedPayload(
    path: string,
    configureUrl: (url: URL) => void,
    payloadKeys: string[],
    errorLabel: string,
    options?: ProviderRequestOptions
  ): Promise<Array<Record<string, unknown>>> {
    const items: Array<Record<string, unknown>> = [];
    let paginationKey: string | null = null;
    let pages = 0;
    do {
      pages += 1;
      const url = this.apiUrl(path);
      configureUrl(url);
      if (paginationKey) url.searchParams.set("pagination_key", paginationKey);
      const response = await fetch(url, {
        headers: await this.authHeaders(options),
        signal: options?.signal
      });
      if (!response.ok) throw new Error(`${errorLabel} failed: ${response.status}`);
      const payload = (await response.json()) as Record<string, unknown>;
      items.push(...getArrayPayload(payload, payloadKeys));
      paginationKey = nextPaginationKey(payload);
      if (pages >= 100 && paginationKey) {
        throw new Error(`${errorLabel} pagination exceeded 100 pages.`);
      }
    } while (paginationKey);
    return items;
  }

  private async authHeaders(options?: ProviderRequestOptions): Promise<Record<string, string>> {
    if (env.JQUANTS_API_VERSION === "v2") {
      if (!env.JQUANTS_API_KEY) {
        throw new Error("J-Quants API key is not configured.");
      }
      return { "x-api-key": env.JQUANTS_API_KEY };
    }
    return { Authorization: `Bearer ${await this.getV1Token(options)}` };
  }

  private async getV1Token(options?: ProviderRequestOptions): Promise<string> {
    if (this.idToken && Date.now() < this.idTokenExpiresAt) return this.idToken;
    if (!env.JQUANTS_EMAIL || !env.JQUANTS_PASSWORD) {
      throw new Error("J-Quants credentials are not configured.");
    }
    if (!this.refreshToken) {
      const response = await fetch(this.apiUrl("/token/auth_user"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mailaddress: env.JQUANTS_EMAIL, password: env.JQUANTS_PASSWORD }),
        signal: options?.signal
      });
      if (!response.ok) throw new Error(`J-Quants auth_user failed: ${response.status}`);
      const payload = (await response.json()) as JQuantsTokenResponse;
      this.refreshToken = payload.refreshToken;
    }

    const url = this.apiUrl("/token/auth_refresh");
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

function getArrayPayload(payload: Record<string, unknown>, keys: string[]): Array<Record<string, unknown>> {
  for (const key of keys) {
    const value = payload[key];
    if (Array.isArray(value)) return value.filter(isRecord);
  }
  return [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function firstValue(item: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    if (item[key] !== undefined) return item[key];
  }
  return undefined;
}

function nextPaginationKey(payload: Record<string, unknown>): string | null {
  return toOptionalString(firstValue(payload, ["pagination_key", "paginationKey"]));
}

function toStringValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value);
}

function toOptionalString(value: unknown): string | null {
  const text = toStringValue(value);
  return text ? text : null;
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toPeriodType(value: unknown): FinancialStatement["periodType"] {
  const text = toStringValue(value).toUpperCase();
  if (text.includes("Q1") || text.includes("1Q")) return "Q1";
  if (text.includes("Q2") || text.includes("2Q")) return "Q2";
  if (text.includes("Q3") || text.includes("3Q")) return "Q3";
  if (text.includes("Q4") || text.includes("4Q")) return "Q4";
  return "FY";
}
