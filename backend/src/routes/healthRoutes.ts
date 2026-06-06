import type { FastifyPluginAsync } from "fastify";
import { pool } from "../db/client.js";

export const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get("/health", async () => {
    await pool.query("select 1");
    return {
      status: "ok",
      db: "ok",
      version: "0.1.0"
    };
  });
};
