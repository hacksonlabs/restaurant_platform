import { createContext, useContext, useEffect, useState, type PropsWithChildren } from "react";
import type { OnboardingActivateInput, OperatorRole, RestaurantSignupInput } from "@shared/types";
import { api, type OperatorAuthPayload } from "../lib/api";

interface AuthContextValue {
  session: OperatorAuthPayload | null;
  loading: boolean;
  login(email: string, password: string): Promise<void>;
  signup(input: RestaurantSignupInput): Promise<void>;
  completeOnboarding(input: OnboardingActivateInput): Promise<void>;
  logout(): Promise<void>;
  selectTenant(restaurantId: string, locationId?: string): Promise<void>;
  selectScope(scope: string): Promise<void>;
  selectedScope: string | null;
  selectedRestaurantId: string | null;
  selectedRole: OperatorRole | null;
}

const AuthContext = createContext<AuthContextValue | null>(null);
export const ALL_RESTAURANTS_SCOPE = "__all_restaurants__";

function getSelectedRole(session: OperatorAuthPayload | null): OperatorRole | null {
  if (!session) return null;
  return session.selectedMembership.role;
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<OperatorAuthPayload | null>(null);
  const [selectedScope, setSelectedScope] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .authMe()
      .then((current) => setSession(current))
      .catch(() => setSession(null))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!session) {
      setSelectedScope(null);
      return;
    }
    setSelectedScope((current) => {
      if (session.restaurants.length <= 1) {
        return session.selectedMembership.restaurantId;
      }
      if (!current) {
        return ALL_RESTAURANTS_SCOPE;
      }
      if (current === ALL_RESTAURANTS_SCOPE) {
        return current;
      }
      return session.restaurants.some((restaurant) => restaurant.id === current)
        ? current
        : ALL_RESTAURANTS_SCOPE;
    });
  }, [session]);

  async function login(email: string, password: string) {
    const nextSession = await api.login(email, password);
    setSession(nextSession);
  }

  async function signup(input: RestaurantSignupInput) {
    setSession(await api.signupRestaurant(input));
  }

  async function completeOnboarding(input: OnboardingActivateInput) {
    setSession(await api.activateOnboarding(input));
  }

  async function logout() {
    await api.logout();
    setSession(null);
  }

  async function selectTenant(restaurantId: string, locationId?: string) {
    const nextSession = await api.selectTenant(restaurantId, locationId);
    setSession(nextSession);
    setSelectedScope(restaurantId);
  }

  async function selectScope(scope: string) {
    if (!session) return;
    if (scope === ALL_RESTAURANTS_SCOPE && session.restaurants.length > 1) {
      setSelectedScope(scope);
      return;
    }
    await selectTenant(scope);
  }

  return (
    <AuthContext.Provider
      value={{
        session,
        loading,
        login,
        signup,
        completeOnboarding,
        logout,
        selectTenant,
        selectScope,
        selectedScope,
        selectedRestaurantId:
          selectedScope === ALL_RESTAURANTS_SCOPE ? null : session?.selectedMembership.restaurantId ?? null,
        selectedRole: selectedScope === ALL_RESTAURANTS_SCOPE ? null : getSelectedRole(session),
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
  const { session, selectedRestaurantId, selectedRole, selectedScope, selectScope } = useAuth();
  const canManageOrders = selectedRole === "owner" || selectedRole === "staff";
  const canManageRules = selectedRole === "owner" || selectedRole === "staff";
  const canManageAgents = selectedRole === "owner";
  const isReadOnly = selectedRole === "viewer";
  const isAllRestaurantsScope = selectedScope === ALL_RESTAURANTS_SCOPE;
  const selectedRestaurantIds = isAllRestaurantsScope
    ? (session?.restaurants ?? []).map((restaurant) => restaurant.id)
    : selectedRestaurantId
      ? [selectedRestaurantId]
      : [];
  const hasAnyOwnerAccess = session?.restaurants.some((restaurant) =>
    restaurant.memberships.some((membership) => membership.role === "owner"),
  ) ?? false;
  return {
    session,
    selectedScope,
    selectScope,
    selectedRestaurantId,
    selectedRestaurantIds,
    selectedRole,
    isAllRestaurantsScope,
    hasAnyOwnerAccess,
    canManageOrders,
    canManageRules,
    canManageAgents,
    isReadOnly,
  };
}
