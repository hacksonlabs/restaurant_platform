import type { AppEnv } from "../config/env";

interface SupabaseAuthApiUser {
  id: string;
  email?: string;
  email_confirmed_at?: string | null;
  last_sign_in_at?: string | null;
  banned_until?: string | null;
  user_metadata?: Record<string, unknown>;
}

export interface OperatorIdentity {
  id: string;
  email: string;
  fullName?: string;
  lastSignInAt?: string;
}

function authUrl(env: AppEnv, path: string) {
  return `${env.supabaseUrl.replace(/\/$/, "")}/auth/v1${path}`;
}

async function parseResponse(response: Response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function extractUser(payload: unknown): SupabaseAuthApiUser | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  if ("user" in (payload as any) && (payload as any).user && typeof (payload as any).user === "object") {
    return (payload as any).user as SupabaseAuthApiUser;
  }
  return payload as SupabaseAuthApiUser;
}

function toIdentity(user: SupabaseAuthApiUser): OperatorIdentity {
  if (!user.email) {
    throw new Error("Supabase Auth user is missing an email address.");
  }
  return {
    id: user.id,
    email: user.email,
    fullName:
      typeof user.user_metadata?.full_name === "string"
        ? user.user_metadata.full_name
        : typeof user.user_metadata?.name === "string"
          ? user.user_metadata.name
          : undefined,
    lastSignInAt: user.last_sign_in_at ?? undefined,
  };
}

export class SupabaseOperatorAuthClient {
  constructor(private env: AppEnv) {}

  isEnabled() {
    return Boolean(this.env.supabaseUrl && this.env.supabaseAnonKey && this.env.supabaseServiceRoleKey);
  }

  async signInWithPassword(email: string, password: string): Promise<OperatorIdentity> {
    const response = await fetch(authUrl(this.env, "/token?grant_type=password"), {
      method: "POST",
      headers: {
        apikey: this.env.supabaseAnonKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, password }),
    });
    const payload = await parseResponse(response);
    if (!response.ok) {
      const message =
        typeof payload === "object" && payload && "msg" in payload
          ? String((payload as any).msg)
          : typeof payload === "object" && payload && "error_description" in payload
            ? String((payload as any).error_description)
            : "Invalid email or password.";
      throw new Error(message);
    }
    const user = (payload as any)?.user as SupabaseAuthApiUser | undefined;
    if (!user) {
      throw new Error("Supabase Auth did not return a user.");
    }
    if (!user.email_confirmed_at) {
      throw new Error("Operator email must be confirmed before signing in.");
    }
    if (user.banned_until) {
      throw new Error("Operator account is currently disabled.");
    }
    return toIdentity(user);
  }

  async getUserById(userId: string): Promise<OperatorIdentity | null> {
    const headers = {
      apikey: this.env.supabaseServiceRoleKey,
      Authorization: `Bearer ${this.env.supabaseServiceRoleKey}`,
    };
    for (const path of [`/admin/users/${userId}`, `/admin/user/${userId}`]) {
      const response = await fetch(authUrl(this.env, path), { headers });
      if (response.status === 404) {
        continue;
      }
      const payload = await parseResponse(response);
      if (!response.ok) {
        throw new Error(
          typeof payload === "object" && payload && "msg" in payload
            ? String((payload as any).msg)
            : "Unable to verify Supabase Auth user.",
        );
      }
      const user = extractUser(payload);
      if (!user || user.banned_until) {
        return null;
      }
      return toIdentity(user);
    }
    return null;
  }
}
