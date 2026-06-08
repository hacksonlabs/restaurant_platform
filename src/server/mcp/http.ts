import { requireBearerAuth } from "@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { AppEnv } from "../config/env";
import type { PlatformService } from "../services/platformService";
import { createAgentApiKeyVerifier, authenticateMcpAuthInfo, normalizeRemoteMcpAuthorizationHeader } from "./httpAuth";
import { createPhantomMcpServer } from "./server";

function jsonRpcError(code: number, message: string) {
  return {
    jsonrpc: "2.0" as const,
    error: {
      code,
      message,
    },
    id: null,
  };
}

export function createRemoteMcpApp(
  service: PlatformService,
  env: Pick<AppEnv, "mcpAllowedHosts">,
) {
  const app = createMcpExpressApp({
    host: "0.0.0.0",
    allowedHosts: env.mcpAllowedHosts.length > 0 ? env.mcpAllowedHosts : undefined,
  });

  app.use(normalizeRemoteMcpAuthorizationHeader());
  app.use(requireBearerAuth({ verifier: createAgentApiKeyVerifier(service) }));

  app.post("/", async (request, response) => {
    const server = createPhantomMcpServer(
      async (extra) => ({
        service,
        agentKey: await authenticateMcpAuthInfo(service, extra?.authInfo),
      }),
      { transportLabel: "remote_http" },
    );
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });

    response.on("close", () => {
      void transport.close().catch(() => {});
      void server.close().catch(() => {});
    });

    try {
      await server.connect(transport);
      await transport.handleRequest(request, response, request.body);
    } catch (error) {
      console.error("Error handling remote MCP request:", error);
      if (!response.headersSent) {
        response.status(500).json(jsonRpcError(-32603, "Internal server error"));
      }
    }
  });

  app.get("/", (_request, response) => {
    response.status(405).json(jsonRpcError(-32000, "Method not allowed."));
  });

  app.delete("/", (_request, response) => {
    response.status(405).json(jsonRpcError(-32000, "Method not allowed."));
  });

  return app;
}
