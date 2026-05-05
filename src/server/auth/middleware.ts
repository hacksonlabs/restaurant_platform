import type { NextFunction, Request, Response } from "express";
import type { PlatformService } from "../services/platformService";

export function requireAgentApiKey(service: PlatformService) {
  return async (request: Request, response: Response, next: NextFunction) => {
    const header = request.header("x-agent-api-key") || request.header("authorization");
    if (!header) {
      response.status(401).json({ error: "Missing agent API key." });
      return;
    }
    const rawKey = header.replace(/^Bearer\s+/i, "").trim();
    try {
      const key = await service.authenticateAgentKey(rawKey);
      request.agentKey = key;
      next();
    } catch (error) {
      response.status(401).json({ error: error instanceof Error ? error.message : "Unauthorized" });
    }
  };
}

declare global {
  namespace Express {
    interface Request {
      agentKey?: {
        id: string;
        agentId: string;
        label: string;
        keyPrefix: string;
      };
    }
  }
}
