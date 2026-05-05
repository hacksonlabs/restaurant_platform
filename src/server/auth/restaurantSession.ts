import type { NextFunction, Request, Response } from "express";
import type { AppEnv } from "../config/env";
import { sha256 } from "../utils/crypto";

const SESSION_COOKIE = "phantom_restaurant_session";

export interface RestaurantSessionUser {
  email: string;
  restaurantId: string;
  approvalRequired: false;
}

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

function buildSessionUser(env: AppEnv): RestaurantSessionUser {
  return {
    email: env.restaurantAuthEmail,
    restaurantId: env.restaurantAuthRestaurantId,
    approvalRequired: false,
  };
}

function createSessionToken(env: AppEnv) {
  return sha256(`${env.restaurantAuthEmail}:${env.restaurantAuthPassword}:${env.restaurantAuthSecret}`);
}

function sessionCookieValue(env: AppEnv) {
  return `${SESSION_COOKIE}=${createSessionToken(env)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800`;
}

function clearedSessionCookie() {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

export function getRestaurantSession(request: Request, env: AppEnv): RestaurantSessionUser | null {
  const cookies = parseCookies(request.header("cookie"));
  const sessionToken = cookies.get(SESSION_COOKIE);
  if (!sessionToken || sessionToken !== createSessionToken(env)) {
    return null;
  }
  return buildSessionUser(env);
}

export function requireRestaurantSession(env: AppEnv) {
  return (request: Request, response: Response, next: NextFunction) => {
    const session = getRestaurantSession(request, env);
    if (!session) {
      response.status(401).json({ error: "Restaurant authentication required." });
      return;
    }
    request.restaurantSession = session;
    next();
  };
}

export function restaurantAuthRoutes(env: AppEnv) {
  return {
    me(request: Request, response: Response) {
      const session = getRestaurantSession(request, env);
      if (!session) {
        response.status(401).json({ error: "Not signed in." });
        return;
      }
      response.json(session);
    },
    login(request: Request, response: Response) {
      const email = String(request.body?.email ?? "").trim().toLowerCase();
      const password = String(request.body?.password ?? "");
      if (email !== env.restaurantAuthEmail.toLowerCase() || password !== env.restaurantAuthPassword) {
        response.status(401).json({ error: "Invalid email or password." });
        return;
      }
      response.setHeader("Set-Cookie", sessionCookieValue(env));
      response.json(buildSessionUser(env));
    },
    logout(_request: Request, response: Response) {
      response.setHeader("Set-Cookie", clearedSessionCookie());
      response.status(204).end();
    },
  };
}

declare global {
  namespace Express {
    interface Request {
      restaurantSession?: RestaurantSessionUser;
    }
  }
}
