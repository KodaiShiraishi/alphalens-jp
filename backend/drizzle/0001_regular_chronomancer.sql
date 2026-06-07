CREATE INDEX "idx_reports_user_created" ON "analysis_reports" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_reports_user_stock_hash" ON "analysis_reports" USING btree ("user_id","stock_code","input_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_daily_prices_stock_date" ON "daily_prices" USING btree ("stock_code","date");--> statement-breakpoint
CREATE INDEX "idx_daily_prices_stock_date" ON "daily_prices" USING btree ("stock_code","date");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_financial_stock_period" ON "financial_statements" USING btree ("stock_code","period_type","period_end");--> statement-breakpoint
CREATE INDEX "idx_financial_stock_period" ON "financial_statements" USING btree ("stock_code","period_end");--> statement-breakpoint
CREATE INDEX "idx_fetch_logs_fetched_at" ON "provider_fetch_logs" USING btree ("fetched_at");--> statement-breakpoint
CREATE INDEX "idx_stocks_name" ON "stocks" USING btree ("name");--> statement-breakpoint
CREATE INDEX "idx_stocks_sector33" ON "stocks" USING btree ("sector33_name");--> statement-breakpoint
CREATE INDEX "idx_stocks_provider_code" ON "stocks" USING btree ("provider_code");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_watchlist_user_stock" ON "watchlist_items" USING btree ("user_id","stock_code");--> statement-breakpoint
CREATE INDEX "idx_watchlist_user" ON "watchlist_items" USING btree ("user_id");