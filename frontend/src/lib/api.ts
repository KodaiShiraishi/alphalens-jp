export type User = {
  id: string;
  email: string;
};

export type StockItem = {
  code: string;
  displayCode: string;
  providerCode: string;
  name: string;
  nameEn?: string | null;
  market?: string | null;
  sector33?: string | null;
  lastPrice?: number | null;
  provider?: "mock" | "jquants";
  providerUpdatedAt?: string | null;
};

export type StockDetail = {
  stock: StockItem;
  latestPrice: PricePoint | null;
  latestFinancials: FinancialStatement | null;
  dataUpdatedAt: string;
};

export type PricePoint = {
  date: string;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  adjustedClose: number | null;
  volume: number | null;
};

export type FinancialStatement = {
  periodType: string;
  periodEnd: string;
  netSales: number | null;
  operatingProfit: number | null;
  ordinaryProfit: number | null;
  profit: number | null;
  eps: number | null;
  bps: number | null;
  equityRatio: number | null;
};

export type AnalysisReport = {
  id: string;
  stockCode: string;
  title: string;
  summary: string;
  body: {
    growth: string;
    profitability: string;
    stability: string;
    risks: string[];
    checkpoints: string[];
    evidence: Array<{ label: string; period: string; value: number | string; source: string }>;
    dataLimitations: string[];
    disclaimer: string;
  };
  sourceSnapshot?: unknown;
  disclaimer: string;
  inputDataVersion: string;
  createdAt: string;
};

export type AnalysisReportSummary = {
  id: string;
  stockCode: string;
  stockName: string;
  title: string;
  createdAt: string;
};

export type WatchlistItem = {
  code: string;
  name: string;
  latestPrice: number | null;
  previousClose: number | null;
  priceChange: number | null;
  priceChangePct: number | null;
  lastAnalyzedAt: string | null;
  createdAt: string;
};

let csrfToken = "";

export async function ensureCsrf(): Promise<string> {
  if (csrfToken) return csrfToken;
  const data = await request<{ csrfToken: string }>("/api/auth/csrf");
  csrfToken = data.csrfToken;
  return csrfToken;
}

export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const response = await fetch(path, {
    ...init,
    headers,
    credentials: "include"
  });
  const data = (await response.json().catch(() => ({}))) as T & { error?: { message?: string } };
  if (!response.ok) {
    throw new Error(data.error?.message ?? `Request failed: ${response.status}`);
  }
  return data as T;
}

export async function mutate<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await ensureCsrf();
  const headers = new Headers(init.headers);
  headers.set("X-CSRF-Token", token);
  return request<T>(path, { ...init, headers });
}

export function resetCsrf(): void {
  csrfToken = "";
}
