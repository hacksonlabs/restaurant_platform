import { once } from "node:events";
import type { AddressInfo } from "node:net";
import express from "express";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createRemoteMcpApp } from "../src/server/mcp/http";
import { InMemoryPlatformRepository } from "../src/server/repositories/platformRepository";
import { PlatformService } from "../src/server/services/platformService";

describe("Phantom remote MCP server", () => {
  let server: ReturnType<typeof express.prototype.listen> | null = null;

  afterEach(async () => {
    if (!server) return;
    await new Promise<void>((resolve, reject) => {
      server!.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
    server = null;
  });

  it("serves tool discovery and calls over hosted MCP HTTP", async () => {
    const consoleLog = vi.spyOn(console, "log").mockImplementation(() => {});
    const service = new PlatformService(new InMemoryPlatformRepository("coachimhungry_demo_live_local_key"));
    const app = express();
    app.use("/mcp", createRemoteMcpApp(service, { mcpAllowedHosts: ["127.0.0.1"] }));
    server = app.listen(0);
    await once(server, "listening");

    const address = server.address() as AddressInfo;
    const client = new Client(
      { name: "phantom-remote-mcp-test", version: "0.1.0" },
      { capabilities: {} },
    );
    const transport = new StreamableHTTPClientTransport(
      new URL(`http://127.0.0.1:${address.port}/mcp`),
      {
        requestInit: {
          headers: {
            Authorization: "Bearer coachimhungry_demo_live_local_key",
          },
        },
      },
    );

    try {
      await client.connect(transport);
      const tools = await client.listTools();
      expect(tools.tools.map((tool) => tool.name)).toEqual(
        expect.arrayContaining([
          "search_restaurants",
          "get_menu",
          "validate_order",
          "quote_order",
          "start_payment",
          "submit_order",
          "get_order_status",
        ]),
      );

      const result = await client.callTool({
        name: "search_restaurants",
        arguments: {
          address: "1533 Ashcroft Way, Sunnyvale, CA 94087",
          latitude: 37.3509,
          longitude: -122.0378,
          radius_miles: 3,
          limit: 10,
        },
      });

      const payload = result.structuredContent as {
        restaurants: Array<{ id: string }>;
      };
      expect(payload.restaurants.map((restaurant) => restaurant.id)).toContain("rest_lb_steakhouse");
      expect(consoleLog).toHaveBeenCalledWith(expect.stringContaining("\"message\":\"mcp_tool_call\""));
      expect(consoleLog).toHaveBeenCalledWith(expect.stringContaining("\"transport\":\"remote_http\""));
      expect(consoleLog).toHaveBeenCalledWith(expect.stringContaining("\"toolName\":\"search_restaurants\""));
    } finally {
      consoleLog.mockRestore();
      await client.close();
      await transport.close();
    }
  });

  it("returns an auth error instead of a server error for invalid MCP keys", async () => {
    const service = new PlatformService(new InMemoryPlatformRepository("coachimhungry_demo_live_local_key"));
    const app = express();
    app.use("/mcp", createRemoteMcpApp(service, { mcpAllowedHosts: ["127.0.0.1"] }));
    server = app.listen(0);
    await once(server, "listening");

    const address = server.address() as AddressInfo;
    const response = await fetch(`http://127.0.0.1:${address.port}/mcp`, {
      method: "POST",
      headers: {
        Authorization: "Bearer invalid_key",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
    });

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: "invalid_token",
      error_description: "Invalid API key.",
    });
  });
});
