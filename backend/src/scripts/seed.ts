import { closeDb } from "../db/client.js";
import { MockMarketDataProvider } from "../providers/mockProvider.js";
import { MarketService } from "../services/marketService.js";
import { mockStocks } from "../providers/mockData.js";

const provider = new MockMarketDataProvider();
const service = new MarketService(provider);

for (const stock of mockStocks) {
  await service.ensureStockData(stock.code);
  console.log(`seeded ${stock.code} ${stock.name}`);
}

await closeDb();
