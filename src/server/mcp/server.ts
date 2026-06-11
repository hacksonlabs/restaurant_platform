import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { MessageExtraInfo } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { log } from "../utils/logger";
import {
  getMenuTool,
  getOrderStatusTool,
  phantomMcpSchemas,
  quoteOrderTool,
  searchRestaurantsTool,
  startPaymentTool,
  submitOrderTool,
  type PhantomMcpContext,
  validateOrderTool,
} from "./tools";

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

export type PhantomMcpContextResolver = (extra?: MessageExtraInfo) => Promise<PhantomMcpContext>;

export interface PhantomMcpServerOptions {
  transportLabel?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function extractToolLogContext(toolName: string, input: unknown, payload?: unknown) {
  const context: Record<string, unknown> = {};

  if (isRecord(input)) {
    if (typeof input.restaurant_id === "string") {
      context.restaurantId = input.restaurant_id;
    }
    if (typeof input.order_id === "string") {
      context.orderId = input.order_id;
    }
    if (isRecord(input.order) && typeof input.order.external_order_reference === "string") {
      context.correlationId = input.order.external_order_reference;
    }
  }

  if (!isRecord(payload)) {
    return context;
  }

  if (typeof payload.orderId === "string" && !context.orderId) {
    context.orderId = payload.orderId;
  }
  if (typeof payload.id === "string" && toolName === "submit_order" && !context.orderId) {
    context.orderId = payload.id;
  }
  if (typeof payload.status === "string") {
    context.status = payload.status;
  }
  if (typeof payload.valid === "boolean") {
    context.valid = payload.valid;
  }
  if (typeof payload.totalCents === "number") {
    context.totalCents = payload.totalCents;
  }
  if (typeof payload.paymentReference === "string") {
    context.paymentReference = payload.paymentReference;
  }
  if (Array.isArray(payload.restaurants)) {
    context.restaurantCount = payload.restaurants.length;
  }
  if (Array.isArray(payload.items)) {
    context.menuItemCount = payload.items.length;
  }
  if (Array.isArray(payload.modifierGroups)) {
    context.modifierGroupCount = payload.modifierGroups.length;
  }

  return context;
}

export function createPhantomMcpServer(
  resolveContext: PhantomMcpContextResolver,
  options: PhantomMcpServerOptions = {},
) {
  const server = new McpServer({
    name: "phantom-mcp",
    version: "0.1.0",
  });
  const transportLabel = options.transportLabel ?? "unknown";

  const registerTool = <TInput>(
    name: string,
    config: Parameters<typeof server.registerTool<TInput>>[1],
    handler: (context: PhantomMcpContext, input: TInput) => Promise<unknown>,
  ) => {
    server.registerTool(
      name,
      config,
      async (input, extra) => {
        const startedAt = Date.now();
        let context: PhantomMcpContext | null = null;
        try {
          context = await resolveContext(extra);
          const payload = await handler(context, input);
          log("info", "mcp_tool_call", {
            stage: "mcp",
            toolName: name,
            transport: transportLabel,
            agentId: context.agentKey.agentId,
            durationMs: Date.now() - startedAt,
            ...extractToolLogContext(name, input, payload),
          });
          return toolResult(payload);
        } catch (error) {
          log("error", "mcp_tool_error", {
            stage: "mcp",
            toolName: name,
            transport: transportLabel,
            agentId: context?.agentKey.agentId,
            durationMs: Date.now() - startedAt,
            ...extractToolLogContext(name, input),
            errorMessage: error instanceof Error ? error.message : String(error),
          });
          throw error;
        }
      },
    );
  };

  registerTool(
    "search_restaurants",
    {
      description: "Return restaurants this agent is allowed to discover and order from.",
      inputSchema: phantomMcpSchemas.searchRestaurantsInputSchema.shape,
      outputSchema: {
        restaurants: z.array(z.any()),
      },
    },
    async (context, input) => searchRestaurantsTool(context, input),
  );

  registerTool(
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
    async (context, input) => getMenuTool(context, input),
  );

  registerTool(
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
    async (context, input) => validateOrderTool(context, input),
  );

  registerTool(
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
        tipCents: z.number(),
        totalCents: z.number(),
        currency: z.literal("USD"),
        quotedAt: z.string(),
        idempotencyKey: z.string().optional(),
      }).shape,
    },
    async (context, input) => quoteOrderTool(context, input),
  );

  registerTool(
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
    async (context, input) => startPaymentTool(context, input),
  );

  registerTool(
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
        fulfillmentType: z.enum(["pickup", "delivery", "catering", "eat_in", "curbside"]),
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
    async (context, input) => submitOrderTool(context, input),
  );

  registerTool(
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
    async (context, input) => getOrderStatusTool(context, input),
  );

  return server;
}
