"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ensureCsrf,
  mutate,
  request,
  resetCsrf,
  type AnalysisReport,
  type PricePoint,
  type StockDetail,
  type StockItem,
  type User
} from "../lib/api";

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [email, setEmail] = useState("demo@example.com");
  const [password, setPassword] = useState("password123");
  const [query, setQuery] = useState("7203");
  const [status, setStatus] = useState("");
  const [stocks, setStocks] = useState<StockItem[]>([]);
  const [detail, setDetail] = useState<StockDetail | null>(null);
  const [prices, setPrices] = useState<PricePoint[]>([]);
  const [watchlist, setWatchlist] = useState<Array<{ code: string; name: string; latestPrice: number | null }>>([]);
  const [report, setReport] = useState<AnalysisReport | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void initialize();
  }, []);

  async function initialize() {
    try {
      await ensureCsrf();
      const me = await request<{ user: User | null }>("/api/auth/me");
      setUser(me.user);
      await search("7203");
      if (me.user) await loadWatchlist();
    } catch (error) {
      setStatus(messageOf(error));
    }
  }

  async function auth(mode: "register" | "login") {
    setBusy(true);
    setStatus("");
    try {
      await ensureCsrf();
      const data = await mutate<{ user: User }>(`/api/auth/${mode}`, {
        method: "POST",
        body: JSON.stringify({ email, password })
      });
      resetCsrf();
      await ensureCsrf();
      setUser(data.user);
      await loadWatchlist();
    } catch (error) {
      setStatus(messageOf(error));
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    setBusy(true);
    try {
      await mutate<{ ok: boolean }>("/api/auth/logout", { method: "POST" });
      resetCsrf();
      setUser(null);
      setWatchlist([]);
      setReport(null);
      await ensureCsrf();
    } catch (error) {
      setStatus(messageOf(error));
    } finally {
      setBusy(false);
    }
  }

  async function search(value = query) {
    setBusy(true);
    setStatus("");
    try {
      const data = await request<{ items: StockItem[]; total: number }>(
        `/api/stocks?query=${encodeURIComponent(value)}&limit=20`
      );
      setStocks(data.items);
      if (data.items[0]) await selectStock(data.items[0].code);
    } catch (error) {
      setStatus(messageOf(error));
    } finally {
      setBusy(false);
    }
  }

  async function selectStock(code: string) {
    setBusy(true);
    setStatus("");
    try {
      const [detailData, priceData] = await Promise.all([
        request<StockDetail>(`/api/stocks/${code}`),
        request<{ items: PricePoint[] }>(`/api/stocks/${code}/prices`)
      ]);
      setDetail(detailData);
      setPrices(priceData.items);
      setReport(null);
    } catch (error) {
      setStatus(messageOf(error));
    } finally {
      setBusy(false);
    }
  }

  async function addWatchlist() {
    if (!detail) return;
    setBusy(true);
    try {
      await mutate<{ ok: boolean }>("/api/watchlist", {
        method: "POST",
        body: JSON.stringify({ code: detail.stock.code })
      });
      await loadWatchlist();
    } catch (error) {
      setStatus(messageOf(error));
    } finally {
      setBusy(false);
    }
  }

  async function loadWatchlist() {
    const data = await request<{ items: Array<{ code: string; name: string; latestPrice: number | null }> }>(
      "/api/watchlist"
    );
    setWatchlist(data.items);
  }

  async function generateReport() {
    if (!detail) return;
    setBusy(true);
    setStatus("");
    try {
      const data = await mutate<{ report: AnalysisReport }>(
        `/api/stocks/${detail.stock.code}/analysis-reports`,
        {
          method: "POST",
          body: JSON.stringify({ language: "ja", forceRefresh: false })
        }
      );
      setReport(data.report);
    } catch (error) {
      setStatus(messageOf(error));
    } finally {
      setBusy(false);
    }
  }

  const latestFinancials = detail?.latestFinancials;
  const metricItems = useMemo(
    () => [
      ["株価", yen(detail?.latestPrice?.close)],
      ["売上高", bigYen(latestFinancials?.netSales)],
      ["営業利益", bigYen(latestFinancials?.operatingProfit)],
      ["自己資本比率", percent(latestFinancials?.equityRatio)]
    ],
    [detail, latestFinancials]
  );

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-title">AlphaLens JP</span>
          <span className="brand-subtitle">日本株リサーチとAI調査メモ</span>
        </div>
        <div className="actions">
          {user ? (
            <>
              <span className="muted">{user.email}</span>
              <button className="button secondary" onClick={logout} disabled={busy}>
                ログアウト
              </button>
            </>
          ) : (
            <span className="muted">未ログイン</span>
          )}
        </div>
      </header>

      <div className="main-grid">
        <aside className="stack">
          <section className="panel">
            <div className="panel-header">
              <h2 className="panel-title">認証</h2>
            </div>
            <div className="panel-body form-grid">
              <div className="field">
                <label htmlFor="email">メール</label>
                <input id="email" className="input" value={email} onChange={(event) => setEmail(event.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="password">パスワード</label>
                <input
                  id="password"
                  className="input"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </div>
              <div className="actions">
                <button className="button" onClick={() => auth("login")} disabled={busy}>
                  ログイン
                </button>
                <button className="button secondary" onClick={() => auth("register")} disabled={busy}>
                  登録
                </button>
              </div>
              <div className="status-line">{status}</div>
            </div>
          </section>

          <section className="panel">
            <div className="panel-header">
              <h2 className="panel-title">銘柄検索</h2>
            </div>
            <div className="panel-body stack">
              <div className="field">
                <label htmlFor="query">コード・企業名</label>
                <input id="query" className="input" value={query} onChange={(event) => setQuery(event.target.value)} />
              </div>
              <button className="button" onClick={() => search()} disabled={busy}>
                検索
              </button>
              <div className="results">
                {stocks.map((stock) => (
                  <button className="result-row" key={stock.code} onClick={() => selectStock(stock.code)}>
                    <span className="code">{stock.displayCode}</span>
                    <span>
                      <strong>{stock.name}</strong>
                      <br />
                      <span className="muted">{stock.market ?? "-"} / {stock.sector33 ?? "-"}</span>
                    </span>
                    <span>{yen(stock.lastPrice)}</span>
                  </button>
                ))}
              </div>
            </div>
          </section>

          <section className="panel">
            <div className="panel-header">
              <h2 className="panel-title">Watchlist</h2>
              <button className="button secondary" onClick={addWatchlist} disabled={!user || !detail || busy}>
                追加
              </button>
            </div>
            <div className="panel-body results">
              {watchlist.length === 0 ? (
                <div className="empty">ログイン後に銘柄を保存できます。</div>
              ) : (
                watchlist.map((item) => (
                  <button className="result-row" key={item.code} onClick={() => selectStock(item.code)}>
                    <span className="code">{item.code}</span>
                    <span>{item.name}</span>
                    <span>{yen(item.latestPrice)}</span>
                  </button>
                ))
              )}
            </div>
          </section>
        </aside>

        <section className="dashboard">
          <section className="panel">
            <div className="panel-header">
              <div>
                <h1 className="panel-title">{detail ? detail.stock.name : "銘柄詳細"}</h1>
                <div className="muted">
                  {detail ? `${detail.stock.displayCode} / ${detail.stock.market ?? "-"} / ${detail.stock.sector33 ?? "-"}` : "検索結果から銘柄を選択"}
                </div>
              </div>
              <button className="button" onClick={generateReport} disabled={!user || !detail || busy}>
                AIレポート生成
              </button>
            </div>
            <div className="panel-body stack">
              <div className="metric-grid">
                {metricItems.map(([label, value]) => (
                  <div className="metric" key={label}>
                    <div className="metric-label">{label}</div>
                    <div className="metric-value">{value}</div>
                  </div>
                ))}
              </div>
              <div className="chart">
                <PriceChart prices={prices} />
              </div>
            </div>
          </section>

          <section className="panel">
            <div className="panel-header">
              <h2 className="panel-title">AI分析レポート</h2>
              {report ? <span className="muted">{new Date(report.createdAt).toLocaleString("ja-JP")}</span> : null}
            </div>
            <div className="panel-body">
              {!report ? (
                <div className="empty">ログイン後に選択銘柄のAIレポートを生成できます。</div>
              ) : (
                <div className="stack">
                  <p>{report.summary}</p>
                  <div className="report-grid">
                    <ReportSection title="成長性" text={report.body.growth} />
                    <ReportSection title="収益性" text={report.body.profitability} />
                    <ReportSection title="安全性" text={report.body.stability} />
                    <ReportList title="確認ポイント" items={report.body.checkpoints} />
                    <ReportList title="リスク" items={report.body.risks} />
                    <ReportList title="データ制約" items={report.body.dataLimitations} />
                  </div>
                  <p className="muted">{report.body.disclaimer}</p>
                </div>
              )}
            </div>
          </section>
        </section>
      </div>
    </main>
  );
}

function PriceChart({ prices }: { prices: PricePoint[] }) {
  if (prices.length === 0) {
    return <div className="empty">株価データなし</div>;
  }
  const closes = prices.map((price) => price.close ?? 0).filter((value) => value > 0);
  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const width = 800;
  const height = 230;
  const points = prices
    .map((price, index) => {
      const x = (index / Math.max(1, prices.length - 1)) * (width - 40) + 20;
      const close = price.close ?? min;
      const y = height - 30 - ((close - min) / Math.max(1, max - min)) * (height - 60);
      return `${x},${y}`;
    })
    .join(" ");
  return (
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="株価チャート">
      <line x1="20" y1="200" x2="780" y2="200" stroke="#d7e0ea" />
      <polyline fill="none" stroke="#126c74" strokeWidth="3" points={points} />
      <text x="20" y="24" fill="#667385" fontSize="12">
        {yen(max)}
      </text>
      <text x="20" y="216" fill="#667385" fontSize="12">
        {yen(min)}
      </text>
    </svg>
  );
}

function ReportSection({ title, text }: { title: string; text: string }) {
  return (
    <section className="report-section">
      <h3>{title}</h3>
      <p>{text}</p>
    </section>
  );
}

function ReportList({ title, items }: { title: string; items: string[] }) {
  return (
    <section className="report-section">
      <h3>{title}</h3>
      <ul className="list">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </section>
  );
}

function yen(value: number | null | undefined): string {
  if (value === null || value === undefined) return "-";
  return `${Math.round(value).toLocaleString("ja-JP")}円`;
}

function bigYen(value: number | null | undefined): string {
  if (value === null || value === undefined) return "-";
  if (Math.abs(value) >= 1_000_000_000_000) return `${(value / 1_000_000_000_000).toFixed(1)}兆円`;
  if (Math.abs(value) >= 100_000_000) return `${(value / 100_000_000).toFixed(1)}億円`;
  return yen(value);
}

function percent(value: number | null | undefined): string {
  if (value === null || value === undefined) return "-";
  return `${(value * 100).toFixed(1)}%`;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : "エラーが発生しました。";
}
