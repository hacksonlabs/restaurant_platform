import cors from "cors";
import express from "express";
import { createApiRouter } from "./api/router";
import { getEnv } from "./config/env";
import { createPostgresPool } from "./db/postgres";
import { assertSupabaseReady } from "./db/supabase";
import { InMemoryPlatformRepository } from "./repositories/platformRepository";
import { SupabasePlatformRepository } from "./repositories/supabasePlatformRepository";
import { PlatformService } from "./services/platformService";
import { POSAdapterRegistry } from "./pos/registry";

async function main() {
  const env = getEnv();

  if (!env.demoMode) {
    await assertSupabaseReady(env);
  }

  const repository = env.demoMode
    ? new InMemoryPlatformRepository(env.demoPhantomApiKey)
    : new SupabasePlatformRepository(createPostgresPool(env));
  const service = new PlatformService(repository, new POSAdapterRegistry(env.posMode, env));

  const app = express();

  app.use(cors());
  app.use(express.json());
  app.use("/api", createApiRouter(service, env));

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
