export type StockCode = {
  displayCode: string;
  providerCode: string;
};

export type StockSearchQuery = {
  query?: string;
  market?: string;
  sector?: string;
  limit: number;
};

export type Stock = {
  code: string;
  displayCode: string;
  providerCode: string;
  name: string;
  nameEn?: string | null;
  market?: string | null;
  sector17?: string | null;
  sector33?: string | null;
  lastPrice?: number | null;
  provider: "mock" | "jquants";
  providerUpdatedAt?: Date | null;
};

export type StockProfile = Omit<Stock, "lastPrice">;

export type DailyPrice = {
  date: string;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  adjustedClose: number | null;
  volume: number | null;
  turnoverValue?: number | null;
};

export type FinancialStatement = {
  periodType: "FY" | "Q1" | "Q2" | "Q3" | "Q4";
  periodStart?: string | null;
  periodEnd: string;
  disclosedAt?: string | null;
  netSales: number | null;
  operatingProfit: number | null;
  ordinaryProfit: number | null;
  profit: number | null;
  eps: number | null;
  bps: number | null;
  equityRatio: number | null;
  roe?: number | null;
  totalAssets?: number | null;
  equity?: number | null;
  operatingCashFlow?: number | null;
  freeCashFlow?: number | null;
  derivedMetrics?: DerivedMetrics;
};

export type DerivedMetrics = {
  salesGrowth: number | null;
  operatingMargin: number | null;
  netMargin: number | null;
  roe: number | null;
  per: number | null;
  pbr: number | null;
};

export type AnalysisReportBody = {
  summary: string;
  growth: string;
  profitability: string;
  stability: string;
  risks: string[];
  checkpoints: string[];
  evidence: Array<{
    label: string;
    period: string;
    value: number | string;
    source: string;
  }>;
  dataLimitations: string[];
  disclaimer: string;
};
