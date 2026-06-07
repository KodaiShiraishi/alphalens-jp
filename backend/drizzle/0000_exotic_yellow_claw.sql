CREATE TABLE "analysis_reports" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"stock_code" varchar(10) NOT NULL,
	"title" text NOT NULL,
	"summary" text NOT NULL,
	"body" jsonb NOT NULL,
	"source_snapshot" jsonb NOT NULL,
	"input_hash" text NOT NULL,
	"input_schema_version" text NOT NULL,
	"model_provider" text NOT NULL,
	"model_name" text NOT NULL,
	"provider_response_id" text,
	"safety_flags" jsonb,
	"disclaimer" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "daily_prices" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"stock_code" varchar(10) NOT NULL,
	"date" date NOT NULL,
	"open" numeric(18, 4),
	"high" numeric(18, 4),
	"low" numeric(18, 4),
	"close" numeric(18, 4),
	"adjusted_close" numeric(18, 4),
	"volume" numeric(20, 2),
	"turnover_value" numeric(24, 2),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "financial_statements" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"stock_code" varchar(10) NOT NULL,
	"period_type" varchar(20) NOT NULL,
	"period_start" date,
	"period_end" date NOT NULL,
	"disclosed_at" date,
	"net_sales" numeric(24, 2),
	"operating_profit" numeric(24, 2),
	"ordinary_profit" numeric(24, 2),
	"profit" numeric(24, 2),
	"eps" numeric(18, 4),
	"bps" numeric(18, 4),
	"equity_ratio" numeric(10, 6),
	"roe" numeric(10, 6),
	"total_assets" numeric(24, 2),
	"equity" numeric(24, 2),
	"operating_cash_flow" numeric(24, 2),
	"free_cash_flow" numeric(24, 2),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provider_fetch_logs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"endpoint" text NOT NULL,
	"stock_code" varchar(10),
	"status" varchar(20) NOT NULL,
	"status_code" integer,
	"request_hash" text,
	"error_message" text,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "stocks" (
	"code" varchar(10) PRIMARY KEY NOT NULL,
	"display_code" varchar(10) NOT NULL,
	"provider_code" varchar(10) NOT NULL,
	"name" text NOT NULL,
	"name_en" text,
	"market" text,
	"sector17_code" text,
	"sector17_name" text,
	"sector33_code" text,
	"sector33_name" text,
	"listed_at" date,
	"delisted_at" date,
	"provider" text NOT NULL,
	"provider_updated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stocks_provider_code_unique" UNIQUE("provider_code")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" varchar(255) NOT NULL,
	"password_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "watchlist_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"stock_code" varchar(10) NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "analysis_reports" ADD CONSTRAINT "analysis_reports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analysis_reports" ADD CONSTRAINT "analysis_reports_stock_code_stocks_code_fk" FOREIGN KEY ("stock_code") REFERENCES "public"."stocks"("code") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_prices" ADD CONSTRAINT "daily_prices_stock_code_stocks_code_fk" FOREIGN KEY ("stock_code") REFERENCES "public"."stocks"("code") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_statements" ADD CONSTRAINT "financial_statements_stock_code_stocks_code_fk" FOREIGN KEY ("stock_code") REFERENCES "public"."stocks"("code") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_fetch_logs" ADD CONSTRAINT "provider_fetch_logs_stock_code_stocks_code_fk" FOREIGN KEY ("stock_code") REFERENCES "public"."stocks"("code") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watchlist_items" ADD CONSTRAINT "watchlist_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watchlist_items" ADD CONSTRAINT "watchlist_items_stock_code_stocks_code_fk" FOREIGN KEY ("stock_code") REFERENCES "public"."stocks"("code") ON DELETE cascade ON UPDATE no action;