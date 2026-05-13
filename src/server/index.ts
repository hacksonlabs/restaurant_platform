import cors from "cors";
import express from "express";
import { createApiRouter } from "./api/router";
import { getEnv } from "./config/env";
import { assertSupabaseReady } from "./db/supabase";
import { attachRequestContext } from "./middleware/requestContext";
import { createPlatformService } from "./runtime";

async function main() {
  const env = getEnv();

  if (!env.demoMode) {
    await assertSupabaseReady(env);
  }

  const service = await createPlatformService(env);

  const app = express();

  app.use(cors());
  app.use(express.json());
  app.use(attachRequestContext);
  app.use("/api", createApiRouter(service));

  app.listen(env.port, () => {
    const modeLabel = env.demoMode ? "demo/in-memory" : "supabase";
    console.log(`API listening on http://localhost:${env.port} (${modeLabel})`);
  });
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
