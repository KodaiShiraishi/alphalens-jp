import { env } from "../config/env.js";
import type { MarketDataProvider } from "./marketDataProvider.js";
import { JQuantsProvider } from "./jquantsProvider.js";
import { MockMarketDataProvider } from "./mockProvider.js";

export function createMarketDataProvider(): MarketDataProvider {
  if (env.MARKET_DATA_PROVIDER === "jquants") {
    return new JQuantsProvider();
  }
  return new MockMarketDataProvider();
}
