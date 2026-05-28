import { createContext, useContext, useMemo, useState, type PropsWithChildren } from "react";
import type {
  OnboardingDiscoveredAccount,
  OnboardingProvider,
  OnboardingRequestRecord,
} from "@shared/types";
import { api } from "../lib/api";

interface OnboardingContextValue {
  provider: OnboardingProvider | null;
  posSystem: string | null;
  discoveredAccount: OnboardingDiscoveredAccount | null;
  selectedLocationIds: string[];
  email: string;
  searchQuery: string;
  request: OnboardingRequestRecord | null;
  status: "idle" | "discovering" | "discovered" | "submitting" | "pending";
  error: string | null;
  selectProvider(provider: OnboardingProvider): void;
  selectPosSystem(posSystem: string | null): void;
  discover(query: string, provider?: OnboardingProvider): Promise<void>;
  setSelectedLocationIds(locationIds: string[]): void;
  setEmail(email: string): void;
  setSearchQuery(query: string): void;
  requestAccess(): Promise<OnboardingRequestRecord>;
  hydrateRequest(requestId: string): Promise<void>;
  reset(): void;
}

const OnboardingContext = createContext<OnboardingContextValue | null>(null);

export function OnboardingProviderContext({ children }: PropsWithChildren) {
  const [provider, setProvider] = useState<OnboardingProvider | null>(null);
  const [posSystem, setPosSystem] = useState<string | null>(null);
  const [discoveredAccount, setDiscoveredAccount] = useState<OnboardingDiscoveredAccount | null>(null);
  const [selectedLocationIds, setSelectedLocationIds] = useState<string[]>([]);
  const [email, setEmail] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [request, setRequest] = useState<OnboardingRequestRecord | null>(null);
  const [status, setStatus] = useState<"idle" | "discovering" | "discovered" | "submitting" | "pending">("idle");
  const [error, setError] = useState<string | null>(null);

  const value = useMemo<OnboardingContextValue>(
    () => ({
      provider,
      posSystem,
      discoveredAccount,
      selectedLocationIds,
      email,
      searchQuery,
      request,
      status,
      error,
      selectProvider(nextProvider) {
        setProvider(nextProvider);
        setPosSystem(null);
        setDiscoveredAccount(null);
        setSelectedLocationIds([]);
        setSearchQuery("");
        setRequest(null);
        setStatus("idle");
        setError(null);
      },
      selectPosSystem(nextPosSystem) {
        setPosSystem(nextPosSystem);
      },
      async discover(query, nextProvider) {
        const resolved = nextProvider ?? provider;
        if (!resolved) return;
        setStatus("discovering");
        setError(null);
        try {
          const account = await api.discoverOnboarding(resolved, query);
          setProvider(resolved);
          setDiscoveredAccount(account);
          setSelectedLocationIds(account.locations.map((location) => location.id));
          setSearchQuery(query);
          setStatus("discovered");
        } catch (discoverError) {
          setError(discoverError instanceof Error ? discoverError.message : "Could not discover restaurant locations.");
          setStatus("idle");
          throw discoverError;
        }
      },
      setSelectedLocationIds,
      setEmail,
      setSearchQuery,
      async requestAccess() {
        if (!provider || !discoveredAccount) {
          throw new Error("Choose a provider account before requesting access.");
        }
        setStatus("submitting");
        setError(null);
        try {
          const created = await api.requestOnboardingAccess({
            provider,
            providerAccountId: discoveredAccount.accountId,
            providerLocationIds: selectedLocationIds,
            email,
          });
          setRequest(created);
          setStatus("pending");
          return created;
        } catch (requestError) {
          setError(requestError instanceof Error ? requestError.message : "Could not submit onboarding request.");
          setStatus("discovered");
          throw requestError;
        }
      },
      async hydrateRequest(requestId) {
        setError(null);
        const hydrated = await api.onboardingRequest(requestId);
        setRequest(hydrated);
        setStatus("pending");
      },
      reset() {
        setProvider(null);
        setPosSystem(null);
        setDiscoveredAccount(null);
        setSelectedLocationIds([]);
        setEmail("");
        setSearchQuery("");
        setRequest(null);
        setStatus("idle");
        setError(null);
      },
    }),
    [provider, posSystem, discoveredAccount, selectedLocationIds, email, searchQuery, request, status, error],
  );

  return <OnboardingContext.Provider value={value}>{children}</OnboardingContext.Provider>;
}

export function useOnboarding() {
  const context = useContext(OnboardingContext);
  if (!context) {
    throw new Error("useOnboarding must be used within an OnboardingProviderContext.");
  }
  return context;
}
