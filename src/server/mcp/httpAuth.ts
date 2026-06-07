import type { RequestHandler } from "express";
import { InvalidTokenError } from "@modelcontextprotocol/sdk/server/auth/errors.js";
import type { OAuthTokenVerifier } from "@modelcontextprotocol/sdk/server/auth/provider.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type { AgentApiKey } from "../../shared/types";
import type { PlatformService } from "../services/platformService";

const PHANTOM_AGENT_KEY_AUTH_INFO_KEY = "phantomAgentKey";

type SerializedAgentApiKey = Pick<
  AgentApiKey,
  "id" | "agentId" | "partnerId" | "label" | "keyPrefix" | "keyHash" | "scopes" | "lastUsedAt" | "createdAt" | "rotatedAt" | "revokedAt"
> & { credentialType?: "agent_api_key" | "partner_credential"; credentialId?: string };

function serializeAgentApiKey(key: AgentApiKey): SerializedAgentApiKey {
  return {
    id: key.id,
    agentId: key.agentId,
    partnerId: key.partnerId,
    label: key.label,
    keyPrefix: key.keyPrefix,
    keyHash: key.keyHash,
    scopes: [...key.scopes],
    lastUsedAt: key.lastUsedAt,
    createdAt: key.createdAt,
    rotatedAt: key.rotatedAt,
    revokedAt: key.revokedAt,
    credentialType: (key as any).credentialType,
    credentialId: (key as any).credentialId,
  };
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function isSerializedAgentApiKey(value: unknown): value is SerializedAgentApiKey {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.agentId === "string" &&
    (candidate.partnerId == null || typeof candidate.partnerId === "string") &&
    typeof candidate.label === "string" &&
    typeof candidate.keyPrefix === "string" &&
    typeof candidate.keyHash === "string" &&
    isStringArray(candidate.scopes) &&
    typeof candidate.createdAt === "string" &&
    (candidate.lastUsedAt == null || typeof candidate.lastUsedAt === "string") &&
    (candidate.rotatedAt == null || typeof candidate.rotatedAt === "string") &&
    (candidate.revokedAt == null || typeof candidate.revokedAt === "string") &&
    (candidate.credentialType == null ||
      candidate.credentialType === "agent_api_key" ||
      candidate.credentialType === "partner_credential") &&
    (candidate.credentialId == null || typeof candidate.credentialId === "string")
  );
}

function resolveSerializedAgentKey(authInfo: AuthInfo | undefined): SerializedAgentApiKey | null {
  const candidate = authInfo?.extra?.[PHANTOM_AGENT_KEY_AUTH_INFO_KEY];
  return isSerializedAgentApiKey(candidate) ? candidate : null;
}

export function normalizeRemoteMcpAuthorizationHeader(): RequestHandler {
  return (request, _response, next) => {
    const authorization = request.header("authorization");
    const legacyApiKey = request.header("x-agent-api-key");
    if (!authorization && legacyApiKey?.trim()) {
      request.headers.authorization = `Bearer ${legacyApiKey.trim()}`;
    }
    next();
  };
}

export function createAgentApiKeyVerifier(service: PlatformService): OAuthTokenVerifier {
  return {
    async verifyAccessToken(token: string) {
      let agentKey: AgentApiKey;
      try {
        agentKey = await service.authenticateAgentKey(token);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Invalid API key.";
        throw new InvalidTokenError(message);
      }
      return {
        token,
        clientId: agentKey.agentId,
        scopes: [...agentKey.scopes],
        expiresAt: Math.floor(Date.now() / 1000) + 60 * 60,
        extra: {
          [PHANTOM_AGENT_KEY_AUTH_INFO_KEY]: serializeAgentApiKey(agentKey),
        },
      };
    },
  };
}

export async function authenticateMcpAuthInfo(service: PlatformService, authInfo?: AuthInfo): Promise<AgentApiKey> {
  const embeddedAgentKey = resolveSerializedAgentKey(authInfo);
  if (embeddedAgentKey) {
    return embeddedAgentKey;
  }

  const token = authInfo?.token?.trim();
  if (!token) {
    throw new Error("Missing authenticated MCP agent context.");
  }

  return service.authenticateAgentKey(token);
}
