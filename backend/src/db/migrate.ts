import path from "node:path";
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db } from "./client.js";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(dirname, "..", "..");

export async function runMigrations(): Promise<void> {
  await migrate(db, {
    migrationsFolder: path.join(backendRoot, "drizzle")
  });
}
