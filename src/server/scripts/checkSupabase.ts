import { getEnv } from "../config/env";
import { assertSupabaseReady } from "../db/supabase";

async function main() {
  const env = getEnv();
  await assertSupabaseReady(env);
  console.log("Supabase connection and required Phantom tables are ready.");
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
