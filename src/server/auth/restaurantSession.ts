import type { NextFunction, Request, Response } from "express";
import type { OperatorRole } from "../../shared/types";
import type { PlatformService } from "../services/platformService";
import { log } from "../utils/logger";

const SESSION_COOKIE = "phantom_restaurant_session";

function parseCookies(header: string | undefined) {
  if (!header) return new Map<string, string>();
  return new Map(
    header
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const [key, ...rest] = part.split("=");
        return [key, decodeURIComponent(rest.join("="))];
      }),
  );
}

function getRawSessionToken(request: Request) {
  const cookies = parseCookies(request.header("cookie"));
  return cookies.get(SESSION_COOKIE) ?? null;
}

function sessionCookieValue(token: string) {
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800`;
}

function clearedSessionCookie() {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

export function requireRestaurantSession(service: PlatformService) {
  return async (request: Request, response: Response, next: NextFunction) => {
    const rawSessionToken = getRawSessionToken(request);
    if (!rawSessionToken) {
      log("warn", "operator_auth_missing", { requestId: request.requestId });
      response.status(401).json({ error: "Restaurant authentication required." });
      return;
    }
    try {
      const session = await service.getOperatorRequestSession(rawSessionToken);
      request.restaurantSession = session;
      request.restaurantSessionToken = rawSessionToken;
      next();
    } catch (error) {
      log("warn", "operator_auth_failure", { requestId: request.requestId, reason: error instanceof Error ? error.message : "auth_failed" });
      response.status(401).json({ error: error instanceof Error ? error.message : "Restaurant authentication required." });
    }
  };
}

export function requireRestaurantRole(service: PlatformService, allowedRoles?: OperatorRole[]) {
  return (request: Request, response: Response, next: NextFunction) => {
    try {
      if (!request.restaurantSession) {
        throw new Error("Restaurant authentication required.");
      }
      const restaurantId = request.params.restaurantId;
      if (!restaurantId) {
        next();
        return;
      }
      request.restaurantMembership = service.assertOperatorAccess(request.restaurantSession, restaurantId, allowedRoles);
      next();
    } catch (error) {
      response.status(403).json({ error: error instanceof Error ? error.message : "Forbidden" });
    }
  };
}

export function restaurantAuthRoutes(service: PlatformService) {
  return {
    me: async (request: Request, response: Response) => {
      const rawSessionToken = getRawSessionToken(request);
      if (!rawSessionToken) {
        response.status(401).json({ error: "Not signed in." });
        return;
      }
      try {
        response.json(await service.getOperatorSession(rawSessionToken));
      } catch (error) {
        response.setHeader("Set-Cookie", clearedSessionCookie());
        response.status(401).json({ error: error instanceof Error ? error.message : "Not signed in." });
      }
    },
    login: async (request: Request, response: Response) => {
      const email = String(request.body?.email ?? "").trim();
      const password = String(request.body?.password ?? "");
      const { sessionToken, authenticated, restaurants } = await service.loginOperator(email, password);
      response.setHeader("Set-Cookie", sessionCookieValue(sessionToken));
      response.json({ ...authenticated, restaurants });
    },
    logout: async (request: Request, response: Response) => {
      const rawSessionToken = getRawSessionToken(request);
      if (rawSessionToken) {
        await service.logoutOperator(rawSessionToken);
      }
      response.setHeader("Set-Cookie", clearedSessionCookie());
      response.status(204).end();
    },
    selectTenant: async (request: Request, response: Response) => {
      const rawSessionToken = getRawSessionToken(request);
      if (!rawSessionToken) {
        response.status(401).json({ error: "Not signed in." });
        return;
      }
      try {
        response.json(
          await service.selectOperatorTenant(
            rawSessionToken,
            String(request.body?.restaurantId ?? ""),
            request.body?.locationId ? String(request.body.locationId) : undefined,
          ),
        );
      } catch (error) {
        response.status(401).json({ error: error instanceof Error ? error.message : "Not signed in." });
      }
    },
  };
}

declare global {
  namespace Express {
    interface Request {
      restaurantSession?: Awaited<ReturnType<PlatformService["getOperatorRequestSession"]>>;
      restaurantSessionToken?: string;
      restaurantMembership?: ReturnType<PlatformService["assertOperatorAccess"]>;
    }
  }
}
