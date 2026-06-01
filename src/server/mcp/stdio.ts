import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { getEnv } from "../config/env";
import { assertSupabaseReady } from "../db/supabase";
import { createPlatformService } from "../runtime";
import { createPhantomMcpServer } from "./server";
import { authenticateMcpAgent } from "./tools";

function requiredEnv(name: string, value: string | undefined) {
  const normalized = value?.trim();
  if (!normalized) {
    throw new Error(`${name} is required to start the Phantom MCP server.`);
  }
  return normalized;
}

async function main() {
  const env = getEnv();
  if (!env.demoMode) {
    await assertSupabaseReady(env);
  }

  const rawApiKey = requiredEnv("PHANTOM_MCP_AGENT_API_KEY", process.env.PHANTOM_MCP_AGENT_API_KEY);
  const service = await createPlatformService(env);
  const agentKey = await authenticateMcpAgent(service, rawApiKey);
  const server = createPhantomMcpServer(async () => ({ service, agentKey }), {
    transportLabel: "stdio",
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`Phantom MCP server running on stdio for agent ${agentKey.agentId}`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Phantom MCP server failed: ${message}`);
  process.exit(1);
});
