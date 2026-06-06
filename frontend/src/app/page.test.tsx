import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import Home, { PriceChart } from "./page";

describe("Home page", () => {
  it("renders the MVP research workflow entry points", () => {
    const html = renderToString(<Home />);

    expect(html).toContain("AlphaLens JP");
    expect(html).toContain("認証");
    expect(html).toContain("銘柄検索");
    expect(html).toContain("Watchlist");
    expect(html).toContain("分析履歴");
    expect(html).toContain("AIレポート生成");
    expect(html).toContain("株価データなし");
    expect(html).toContain("ログイン後に選択銘柄のAIレポートを生成できます。");
  });

  it("renders an empty state when every close price is missing", () => {
    const html = renderToString(
      <PriceChart
        prices={[
          {
            date: "2026-06-01",
            open: null,
            high: null,
            low: null,
            close: null,
            adjustedClose: null,
            volume: null
          }
        ]}
      />
    );

    expect(html).toContain("終値データなし");
    expect(html).not.toContain("Infinity");
  });
});
