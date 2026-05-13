import { createContext, useContext, useEffect, useState, type PropsWithChildren } from "react";
import type { OperatorRole } from "@shared/types";
import { api, type OperatorAuthPayload } from "../lib/api";

interface AuthContextValue {
  session: OperatorAuthPayload | null;
  loading: boolean;
  login(email: string, password: string): Promise<void>;
  logout(): Promise<void>;
  selectTenant(restaurantId: string, locationId?: string): Promise<void>;
  selectedRestaurantId: string | null;
  selectedRole: OperatorRole | null;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function getSelectedRole(session: OperatorAuthPayload | null): OperatorRole | null {
  if (!session) return null;
  return session.selectedMembership.role;
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<OperatorAuthPayload | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .authMe()
      .then((current) => setSession(current))
      .catch(() => setSession(null))
      .finally(() => setLoading(false));
  }, []);

  async function login(email: string, password: string) {
    setSession(await api.login(email, password));
  }

  async function logout() {
    await api.logout();
    setSession(null);
  }

  async function selectTenant(restaurantId: string, locationId?: string) {
    setSession(await api.selectTenant(restaurantId, locationId));
  }

  return (
    <AuthContext.Provider
      value={{
        session,
        loading,
        login,
        logout,
        selectTenant,
        selectedRestaurantId: session?.selectedMembership.restaurantId ?? null,
        selectedRole: getSelectedRole(session),
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider.");
  }
  return context;
}

export function useTenant() {
  const { session, selectedRestaurantId, selectedRole } = useAuth();
  const canManageOrders = selectedRole === "owner" || selectedRole === "manager" || selectedRole === "staff";
  const canManageRules = selectedRole === "owner" || selectedRole === "manager";
  const canManageAgents = selectedRole === "owner" || selectedRole === "manager";
  const isReadOnly = selectedRole === "viewer";
  return {
    session,
    selectedRestaurantId,
    selectedRole,
    canManageOrders,
    canManageRules,
    canManageAgents,
    isReadOnly,
  };
}
