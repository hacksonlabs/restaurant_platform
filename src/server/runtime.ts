import { SupabaseOperatorAuthClient } from "./auth/supabaseAuth";
import type { AppEnv } from "./config/env";
import { createPostgresPool } from "./db/postgres";
import { InMemoryPlatformRepository } from "./repositories/platformRepository";
import { SupabasePlatformRepository } from "./repositories/supabasePlatformRepository";
import { PlatformService } from "./services/platformService";
import { POSAdapterRegistry } from "./pos/registry";

export async function createPlatformService(env: AppEnv) {
  const repository = env.demoMode
    ? new InMemoryPlatformRepository(env.demoPhantomApiKey)
    : new SupabasePlatformRepository(createPostgresPool(env));
  const operatorAuth = env.demoMode ? undefined : new SupabaseOperatorAuthClient(env);
  return new PlatformService(repository, new POSAdapterRegistry(env.posMode, env), operatorAuth);
}
