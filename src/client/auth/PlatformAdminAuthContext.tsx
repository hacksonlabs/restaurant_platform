import { createContext, useContext, useEffect, useState, type PropsWithChildren } from "react";
import { api, type PlatformAdminAuthPayload } from "../lib/api";

interface PlatformAdminAuthContextValue {
  session: PlatformAdminAuthPayload | null;
  loading: boolean;
  login(email: string, password: string): Promise<void>;
  logout(): Promise<void>;
}

const PlatformAdminAuthContext = createContext<PlatformAdminAuthContextValue | null>(null);

export function PlatformAdminAuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<PlatformAdminAuthPayload | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .adminAuthMe()
      .then((current) => setSession(current))
      .catch(() => setSession(null))
      .finally(() => setLoading(false));
  }, []);

  async function login(email: string, password: string) {
    setSession(await api.adminLogin(email, password));
  }

  async function logout() {
    await api.adminLogout();
    setSession(null);
  }

  return (
    <PlatformAdminAuthContext.Provider value={{ session, loading, login, logout }}>
      {children}
    </PlatformAdminAuthContext.Provider>
  );
}

export function usePlatformAdminAuth() {
  const context = useContext(PlatformAdminAuthContext);
  if (!context) {
    throw new Error("usePlatformAdminAuth must be used within a PlatformAdminAuthProvider.");
  }
  return context;
}
