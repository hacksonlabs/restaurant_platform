import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { getEnv } from "../config/env";
import { assertSupabaseReady } from "../db/supabase";
import { createPlatformService } from "../runtime";
import {
  authenticateMcpAgent,
  getMenuTool,
  getOrderStatusTool,
  phantomMcpSchemas,
  quoteOrderTool,
  searchRestaurantsTool,
  startPaymentTool,
  submitOrderTool,
  validateOrderTool,
} from "./tools";

function requiredEnv(name: string, value: string | undefined) {
  const normalized = value?.trim();
  if (!normalized) {
    throw new Error(`${name} is required to start the Phantom MCP server.`);
  }
  return normalized;
}

function toolResult(payload: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(payload, null, 2),
      },
    ],
    structuredContent: payload,
  };
}

async function main() {
  const env = getEnv();
  if (!env.demoMode) {
    await assertSupabaseReady(env);
  }

  const rawApiKey = requiredEnv("PHANTOM_MCP_AGENT_API_KEY", process.env.PHANTOM_MCP_AGENT_API_KEY);
  const service = await createPlatformService(env);
  const agentKey = await authenticateMcpAgent(service, rawApiKey);
  const context = { service, agentKey };

  const server = new McpServer({
    name: "phantom-mcp",
    version: "0.1.0",
  });

  server.registerTool(
    "search_restaurants",
    {
      description: "Return restaurants this agent is allowed to discover and order from.",
      inputSchema: phantomMcpSchemas.searchRestaurantsInputSchema.shape,
      outputSchema: {
        restaurants: z.array(z.any()),
      },
    },
    async (input) => toolResult(await searchRestaurantsTool(context, input)),
  );

  server.registerTool(
    "get_menu",
    {
      description: "Return the full canonical menu for a restaurant.",
      inputSchema: phantomMcpSchemas.getMenuInputSchema.shape,
      outputSchema: {
        items: z.array(z.any()),
        modifierGroups: z.array(z.any()),
        modifiers: z.array(z.any()),
        mappings: z.array(z.any()),
      },
    },
    async (input) => toolResult(await getMenuTool(context, input)),
  );

  server.registerTool(
    "validate_order",
    {
      description: "Validate an order against Phantom restaurant rules before quoting or submitting.",
      inputSchema: phantomMcpSchemas.orderToolInputSchema.shape,
      outputSchema: z.object({
        id: z.string(),
        orderId: z.string(),
        valid: z.boolean(),
        issues: z.array(z.any()),
        checkedAt: z.string(),
        idempotencyKey: z.string().optional(),
      }).shape,
    },
    async (input) => toolResult(await validateOrderTool(context, input)),
  );

  server.registerTool(
    "quote_order",
    {
      description: "Return pricing for a valid order using Phantom's provider adapter.",
      inputSchema: phantomMcpSchemas.orderToolInputSchema.shape,
      outputSchema: z.object({
        id: z.string(),
        orderId: z.string(),
        subtotalCents: z.number(),
        taxCents: z.number(),
        feesCents: z.number(),
        totalCents: z.number(),
        currency: z.literal("USD"),
        quotedAt: z.string(),
        idempotencyKey: z.string().optional(),
      }).shape,
    },
    async (input) => toolResult(await quoteOrderTool(context, input)),
  );

  server.registerTool(
    "start_payment",
    {
      description: "Create a hosted restaurant-owned payment session before the final order submit.",
      inputSchema: phantomMcpSchemas.startPaymentInputSchema.shape,
      outputSchema: z.object({
        ok: z.boolean(),
        status: z.enum(["redirect_required", "paid", "pending_external_confirmation", "failed"]),
        redirectUrl: z.string().nullable().optional(),
        paymentReference: z.string().nullable().optional(),
        totalCents: z.number().optional(),
        currency: z.literal("USD").optional(),
        message: z.string(),
        raw: z.record(z.unknown()),
      }).shape,
    },
    async (input) => toolResult(await startPaymentTool(context, input)),
  );

  server.registerTool(
    "submit_order",
    {
      description: "Create an order in Phantom and enter the normal approval and submission lifecycle.",
      inputSchema: phantomMcpSchemas.orderToolInputSchema.shape,
      outputSchema: z.object({
        id: z.string(),
        restaurantId: z.string(),
        agentId: z.string(),
        externalOrderReference: z.string(),
        customerName: z.string(),
        customerEmail: z.string().optional(),
        teamName: z.string().optional(),
        fulfillmentType: z.enum(["pickup", "delivery", "catering"]),
        requestedFulfillmentTime: z.string(),
        headcount: z.number(),
        status: z.string(),
        approvalRequired: z.boolean(),
        totalEstimateCents: z.number(),
        createdAt: z.string(),
        updatedAt: z.string(),
        notes: z.string().optional(),
        packagingInstructions: z.string().optional(),
        dietaryConstraints: z.array(z.string()),
        orderIntent: z.any(),
      }).shape,
    },
    async (input) => toolResult(await submitOrderTool(context, input)),
  );

  server.registerTool(
    "get_order_status",
    {
      description: "Return Phantom's last known order state and latest provider order identifier.",
      inputSchema: phantomMcpSchemas.getOrderStatusInputSchema.shape,
      outputSchema: {
        orderId: z.string(),
        status: z.string(),
        totalEstimateCents: z.number(),
        externalOrderId: z.string().nullable(),
        updatedAt: z.string(),
      },
    },
    async (input) => toolResult(await getOrderStatusTool(context, input)),
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`Phantom MCP server running on stdio for agent ${agentKey.agentId}`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Phantom MCP server failed: ${message}`);
  process.exit(1);
});
