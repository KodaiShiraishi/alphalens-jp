import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { dailyPrices, financialStatements, providerFetchLogs, stocks } from "../db/schema.js";
import type { DailyPrice, FinancialStatement, Stock, StockProfile } from "../types/domain.js";

export async function upsertStock(stock: Stock | StockProfile): Promise<void> {
  await db
    .insert(stocks)
    .values({
      code: stock.code,
      displayCode: stock.displayCode,
      providerCode: stock.providerCode,
      name: stock.name,
      nameEn: stock.nameEn ?? null,
      market: stock.market ?? null,
      sector17Name: stock.sector17 ?? null,
      sector33Name: stock.sector33 ?? null,
      provider: stock.provider,
      providerUpdatedAt: stock.providerUpdatedAt ?? new Date(),
      updatedAt: new Date()
    })
    .onConflictDoUpdate({
      target: stocks.code,
      set: {
        displayCode: stock.displayCode,
        providerCode: stock.providerCode,
        name: stock.name,
        nameEn: stock.nameEn ?? null,
        market: stock.market ?? null,
        sector17Name: stock.sector17 ?? null,
        sector33Name: stock.sector33 ?? null,
        provider: stock.provider,
        providerUpdatedAt: stock.providerUpdatedAt ?? new Date(),
        updatedAt: new Date()
      }
    });
}

export async function findStocks(query: { query?: string; market?: string; sector?: string; limit: number }): Promise<Stock[]> {
  const filters = [];
  if (query.query) {
    const q = `%${query.query}%`;
    filters.push(or(ilike(stocks.code, q), ilike(stocks.providerCode, q), ilike(stocks.name, q), ilike(stocks.nameEn, q)));
  }
  if (query.market) filters.push(ilike(stocks.market, query.market));
  if (query.sector) filters.push(ilike(stocks.sector33Name, `%${query.sector}%`));
  const rows = await db
    .select()
    .from(stocks)
    .where(filters.length ? and(...filters) : undefined)
    .limit(query.limit);
  return rows.map((row) => ({
    code: row.code,
    displayCode: row.displayCode,
    providerCode: row.providerCode,
    name: row.name,
    nameEn: row.nameEn,
    market: row.market,
    sector17: row.sector17Name,
    sector33: row.sector33Name,
    lastPrice: null,
    provider: row.provider as "mock" | "jquants",
    providerUpdatedAt: row.providerUpdatedAt
  }));
}

export async function findStock(code: string): Promise<StockProfile | null> {
  const [row] = await db.select().from(stocks).where(eq(stocks.code, code)).limit(1);
  if (!row) return null;
  return {
    code: row.code,
    displayCode: row.displayCode,
    providerCode: row.providerCode,
    name: row.name,
    nameEn: row.nameEn,
    market: row.market,
    sector17: row.sector17Name,
    sector33: row.sector33Name,
    provider: row.provider as "mock" | "jquants",
    providerUpdatedAt: row.providerUpdatedAt
  };
}

export async function upsertDailyPrices(stockCode: string, prices: DailyPrice[]): Promise<void> {
  for (const price of prices) {
    await db
      .insert(dailyPrices)
      .values({
        stockCode,
        date: price.date,
        open: price.open,
        high: price.high,
        low: price.low,
        close: price.close,
        adjustedClose: price.adjustedClose,
        volume: price.volume,
        turnoverValue: price.turnoverValue ?? null,
        updatedAt: new Date()
      })
      .onConflictDoUpdate({
        target: [dailyPrices.stockCode, dailyPrices.date],
        set: {
          open: price.open,
          high: price.high,
          low: price.low,
          close: price.close,
          adjustedClose: price.adjustedClose,
          volume: price.volume,
          turnoverValue: price.turnoverValue ?? null,
          updatedAt: new Date()
        }
      });
  }
}

export async function listDailyPrices(stockCode: string, from?: string, to?: string): Promise<DailyPrice[]> {
  const filters = [eq(dailyPrices.stockCode, stockCode)];
  if (from) filters.push(sql`${dailyPrices.date} >= ${from}`);
  if (to) filters.push(sql`${dailyPrices.date} <= ${to}`);
  const rows = await db
    .select()
    .from(dailyPrices)
    .where(and(...filters))
    .orderBy(dailyPrices.date);
  return rows.map((row) => ({
    date: row.date,
    open: row.open,
    high: row.high,
    low: row.low,
    close: row.close,
    adjustedClose: row.adjustedClose,
    volume: row.volume,
    turnoverValue: row.turnoverValue
  }));
}

export async function upsertFinancialStatements(stockCode: string, statements: FinancialStatement[]): Promise<void> {
  for (const item of statements) {
    await db
      .insert(financialStatements)
      .values({
        stockCode,
        periodType: item.periodType,
        periodStart: item.periodStart ?? null,
        periodEnd: item.periodEnd,
        disclosedAt: item.disclosedAt ?? null,
        netSales: item.netSales,
        operatingProfit: item.operatingProfit,
        ordinaryProfit: item.ordinaryProfit,
        profit: item.profit,
        eps: item.eps,
        bps: item.bps,
        equityRatio: item.equityRatio,
        roe: item.roe ?? null,
        totalAssets: item.totalAssets ?? null,
        equity: item.equity ?? null,
        operatingCashFlow: item.operatingCashFlow ?? null,
        freeCashFlow: item.freeCashFlow ?? null,
        updatedAt: new Date()
      })
      .onConflictDoUpdate({
        target: [financialStatements.stockCode, financialStatements.periodType, financialStatements.periodEnd],
        set: {
          disclosedAt: item.disclosedAt ?? null,
          netSales: item.netSales,
          operatingProfit: item.operatingProfit,
          ordinaryProfit: item.ordinaryProfit,
          profit: item.profit,
          eps: item.eps,
          bps: item.bps,
          equityRatio: item.equityRatio,
          roe: item.roe ?? null,
          totalAssets: item.totalAssets ?? null,
          equity: item.equity ?? null,
          operatingCashFlow: item.operatingCashFlow ?? null,
          freeCashFlow: item.freeCashFlow ?? null,
          updatedAt: new Date()
        }
      });
  }
}

export async function listFinancialStatements(stockCode: string): Promise<FinancialStatement[]> {
  const rows = await db
    .select()
    .from(financialStatements)
    .where(eq(financialStatements.stockCode, stockCode))
    .orderBy(financialStatements.periodEnd);
  return rows.map((row) => ({
    periodType: row.periodType as FinancialStatement["periodType"],
    periodStart: row.periodStart,
    periodEnd: row.periodEnd,
    disclosedAt: row.disclosedAt,
    netSales: row.netSales,
    operatingProfit: row.operatingProfit,
    ordinaryProfit: row.ordinaryProfit,
    profit: row.profit,
    eps: row.eps,
    bps: row.bps,
    equityRatio: row.equityRatio,
    roe: row.roe,
    totalAssets: row.totalAssets,
    equity: row.equity,
    operatingCashFlow: row.operatingCashFlow,
    freeCashFlow: row.freeCashFlow
  }));
}

export async function latestDailyPrice(stockCode: string): Promise<DailyPrice | null> {
  const [row] = await db
    .select()
    .from(dailyPrices)
    .where(eq(dailyPrices.stockCode, stockCode))
    .orderBy(desc(dailyPrices.date))
    .limit(1);
  if (!row) return null;
  return {
    date: row.date,
    open: row.open,
    high: row.high,
    low: row.low,
    close: row.close,
    adjustedClose: row.adjustedClose,
    volume: row.volume,
    turnoverValue: row.turnoverValue
  };
}

export async function latestFinancialStatement(stockCode: string): Promise<FinancialStatement | null> {
  const [row] = await db
    .select()
    .from(financialStatements)
    .where(eq(financialStatements.stockCode, stockCode))
    .orderBy(desc(financialStatements.periodEnd))
    .limit(1);
  if (!row) return null;
  return {
    periodType: row.periodType as FinancialStatement["periodType"],
    periodStart: row.periodStart,
    periodEnd: row.periodEnd,
    disclosedAt: row.disclosedAt,
    netSales: row.netSales,
    operatingProfit: row.operatingProfit,
    ordinaryProfit: row.ordinaryProfit,
    profit: row.profit,
    eps: row.eps,
    bps: row.bps,
    equityRatio: row.equityRatio,
    roe: row.roe,
    totalAssets: row.totalAssets,
    equity: row.equity,
    operatingCashFlow: row.operatingCashFlow,
    freeCashFlow: row.freeCashFlow
  };
}

export async function logProviderFetch(input: {
  provider: string;
  endpoint: string;
  stockCode?: string | null;
  status: "succeeded" | "failed";
  statusCode?: number | null;
  requestHash?: string | null;
  errorMessage?: string | null;
}): Promise<void> {
  await db.insert(providerFetchLogs).values(input);
}
