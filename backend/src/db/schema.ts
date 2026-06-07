import {
  bigint,
  bigserial,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").primaryKey(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow()
});

export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow()
});

export const stocks = pgTable("stocks", {
  code: varchar("code", { length: 10 }).primaryKey(),
  displayCode: varchar("display_code", { length: 10 }).notNull(),
  providerCode: varchar("provider_code", { length: 10 }).notNull().unique(),
  name: text("name").notNull(),
  nameEn: text("name_en"),
  market: text("market"),
  sector17Code: text("sector17_code"),
  sector17Name: text("sector17_name"),
  sector33Code: text("sector33_code"),
  sector33Name: text("sector33_name"),
  listedAt: date("listed_at"),
  delistedAt: date("delisted_at"),
  provider: text("provider").notNull(),
  providerUpdatedAt: timestamp("provider_updated_at", { withTimezone: true, mode: "date" }),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow()
}, (table) => ({
  nameIdx: index("idx_stocks_name").on(table.name),
  sector33Idx: index("idx_stocks_sector33").on(table.sector33Name),
  providerCodeIdx: index("idx_stocks_provider_code").on(table.providerCode)
}));

export const dailyPrices = pgTable("daily_prices", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  stockCode: varchar("stock_code", { length: 10 }).notNull().references(() => stocks.code, { onDelete: "cascade" }),
  date: date("date").notNull(),
  open: numeric("open", { precision: 18, scale: 4 }).$type<number | null>(),
  high: numeric("high", { precision: 18, scale: 4 }).$type<number | null>(),
  low: numeric("low", { precision: 18, scale: 4 }).$type<number | null>(),
  close: numeric("close", { precision: 18, scale: 4 }).$type<number | null>(),
  adjustedClose: numeric("adjusted_close", { precision: 18, scale: 4 }).$type<number | null>(),
  volume: numeric("volume", { precision: 20, scale: 2 }).$type<number | null>(),
  turnoverValue: numeric("turnover_value", { precision: 24, scale: 2 }).$type<number | null>(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow()
}, (table) => ({
  stockDateUnique: uniqueIndex("uq_daily_prices_stock_date").on(table.stockCode, table.date),
  stockDateIdx: index("idx_daily_prices_stock_date").on(table.stockCode, table.date)
}));

export const financialStatements = pgTable("financial_statements", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  stockCode: varchar("stock_code", { length: 10 }).notNull().references(() => stocks.code, { onDelete: "cascade" }),
  periodType: varchar("period_type", { length: 20 }).notNull(),
  periodStart: date("period_start"),
  periodEnd: date("period_end").notNull(),
  disclosedAt: date("disclosed_at"),
  netSales: numeric("net_sales", { precision: 24, scale: 2 }).$type<number | null>(),
  operatingProfit: numeric("operating_profit", { precision: 24, scale: 2 }).$type<number | null>(),
  ordinaryProfit: numeric("ordinary_profit", { precision: 24, scale: 2 }).$type<number | null>(),
  profit: numeric("profit", { precision: 24, scale: 2 }).$type<number | null>(),
  eps: numeric("eps", { precision: 18, scale: 4 }).$type<number | null>(),
  bps: numeric("bps", { precision: 18, scale: 4 }).$type<number | null>(),
  equityRatio: numeric("equity_ratio", { precision: 10, scale: 6 }).$type<number | null>(),
  roe: numeric("roe", { precision: 10, scale: 6 }).$type<number | null>(),
  totalAssets: numeric("total_assets", { precision: 24, scale: 2 }).$type<number | null>(),
  equity: numeric("equity", { precision: 24, scale: 2 }).$type<number | null>(),
  operatingCashFlow: numeric("operating_cash_flow", { precision: 24, scale: 2 }).$type<number | null>(),
  freeCashFlow: numeric("free_cash_flow", { precision: 24, scale: 2 }).$type<number | null>(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow()
}, (table) => ({
  stockPeriodUnique: uniqueIndex("uq_financial_stock_period").on(table.stockCode, table.periodType, table.periodEnd),
  stockPeriodIdx: index("idx_financial_stock_period").on(table.stockCode, table.periodEnd)
}));

export const watchlistItems = pgTable("watchlist_items", {
  id: uuid("id").primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  stockCode: varchar("stock_code", { length: 10 }).notNull().references(() => stocks.code, { onDelete: "cascade" }),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow()
}, (table) => ({
  userStockUnique: uniqueIndex("uq_watchlist_user_stock").on(table.userId, table.stockCode),
  userIdx: index("idx_watchlist_user").on(table.userId)
}));

export const analysisReports = pgTable("analysis_reports", {
  id: uuid("id").primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  stockCode: varchar("stock_code", { length: 10 }).notNull().references(() => stocks.code, { onDelete: "cascade" }),
  title: text("title").notNull(),
  summary: text("summary").notNull(),
  body: jsonb("body").notNull(),
  sourceSnapshot: jsonb("source_snapshot").notNull(),
  inputHash: text("input_hash").notNull(),
  inputSchemaVersion: text("input_schema_version").notNull(),
  modelProvider: text("model_provider").notNull(),
  modelName: text("model_name").notNull(),
  providerResponseId: text("provider_response_id"),
  safetyFlags: jsonb("safety_flags"),
  disclaimer: text("disclaimer").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow()
}, (table) => ({
  userCreatedIdx: index("idx_reports_user_created").on(table.userId, table.createdAt),
  userStockHashIdx: index("idx_reports_user_stock_hash").on(table.userId, table.stockCode, table.inputHash)
}));

export const providerFetchLogs = pgTable("provider_fetch_logs", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  provider: text("provider").notNull(),
  endpoint: text("endpoint").notNull(),
  stockCode: varchar("stock_code", { length: 10 }).references(() => stocks.code, { onDelete: "set null" }),
  status: varchar("status", { length: 20 }).notNull(),
  statusCode: integer("status_code"),
  requestHash: text("request_hash"),
  errorMessage: text("error_message"),
  fetchedAt: timestamp("fetched_at", { withTimezone: true, mode: "date" }).notNull().defaultNow()
}, (table) => ({
  fetchedAtIdx: index("idx_fetch_logs_fetched_at").on(table.fetchedAt)
}));

export type User = typeof users.$inferSelect;
export type StockRow = typeof stocks.$inferSelect;
export type DailyPriceRow = typeof dailyPrices.$inferSelect;
export type FinancialStatementRow = typeof financialStatements.$inferSelect;
export type AnalysisReportRow = typeof analysisReports.$inferSelect;
