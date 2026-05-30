import { useEffect, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import type { OnboardingProvider } from "@shared/types";
import { useOnboarding } from "../auth/OnboardingContext";
import { Button, Card, Field } from "../components/ui";

const COPY: Record<
  OnboardingProvider,
  { title: string; body: string; placeholder: string; defaultQuery: string; hint: string }
> = {
  deliverect: {
    title: "Find your Deliverect restaurants",
    body: "Search by restaurant or brand name. In mock mode, we’ve loaded a small chain example so you can see how a multi-location import would feel.",
    placeholder: "Search by restaurant or brand name",
    defaultQuery: "Pizza Palace",
    hint: "Mock example prefilled: Pizza Palace",
  },
  olo: {
    title: "Find your Olo restaurants",
    body: "Search by restaurant or brand name. The mock data is set up to feel like a small multi-location Olo brand.",
    placeholder: "Search by restaurant or brand name",
    defaultQuery: "Pizza Palace",
    hint: "Mock example prefilled: Pizza Palace",
  },
  pos: {
    title: "Find your POS restaurants",
    body: "Search by restaurant or brand name to continue the direct POS setup.",
    placeholder: "Search by restaurant or brand name",
    defaultQuery: "Pizza Palace",
    hint: "Mock example prefilled: Pizza Palace",
  },
};

function isProvider(value: string | undefined): value is OnboardingProvider {
  return value === "deliverect" || value === "olo" || value === "pos";
}

function labelForPOSSystem(value: string) {
  const labels: Record<string, string> = {
    toast: "Toast",
    square: "Square",
    clover: "Clover",
    revel: "Revel",
    simphony: "Oracle Simphony",
  };
  return labels[value] ?? value;
}

export function OnboardingConnectPage() {
  const { provider: routeProvider } = useParams();
  const navigate = useNavigate();
  const { provider, posSystem, selectProvider, discover, discoveredAccount, status, error, searchQuery, setSearchQuery } =
    useOnboarding();

  if (!isProvider(routeProvider)) {
    return <Navigate to="/onboarding/provider" replace />;
  }

  if (routeProvider === "pos" && !posSystem) {
    return <Navigate to="/onboarding/pos-system" replace />;
  }

  const copy = COPY[routeProvider];
  const [query, setQuery] = useState(searchQuery || copy.defaultQuery);

  useEffect(() => {
    if (provider !== routeProvider) {
      selectProvider(routeProvider);
    }
  }, [provider, routeProvider, selectProvider]);

  useEffect(() => {
    if (!searchQuery) {
      setQuery(copy.defaultQuery);
      setSearchQuery(copy.defaultQuery);
      return;
    }
    setQuery(searchQuery);
  }, [searchQuery, copy.defaultQuery, setSearchQuery]);

  async function handleSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await discover(query, routeProvider);
  }

  return (
    <div className="auth-shell">
      <Card className="auth-card auth-card-wide">
        <Link
          className="auth-back-arrow"
          to={routeProvider === "pos" ? "/onboarding/pos-system" : "/onboarding/provider"}
          aria-label="Back"
        >
          ←
        </Link>
        <div className="eyebrow">{routeProvider === "pos" ? "Step 2 of 5" : "Step 1 of 4"}</div>
        <h1>{copy.title}</h1>
        <p className="auth-copy">
          {routeProvider === "pos" && posSystem ? `${copy.body} Selected POS: ${labelForPOSSystem(posSystem)}.` : copy.body}
        </p>
        <form className="auth-form" onSubmit={handleSearch}>
          <Field label="Restaurant Name">
            <input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setSearchQuery(event.target.value);
              }}
              placeholder={copy.placeholder}
              autoComplete="organization"
            />
          </Field>
          <div className="onboarding-search-hint">{copy.hint}</div>
          {error ? <div className="auth-error">{error}</div> : null}
          <div className="auth-actions">
            <Button type="submit" disabled={!query.trim() || status === "discovering"}>
              {status === "discovering" ? "Searching..." : "Search"}
            </Button>
          </div>
        </form>
        {discoveredAccount ? (
          <div className="onboarding-search-results">
            <div className="onboarding-results-meta">
              Found {discoveredAccount.locations.length} matching location
              {discoveredAccount.locations.length === 1 ? "" : "s"} in {discoveredAccount.name}.
            </div>
            <div className="location-grid compact">
              {discoveredAccount.locations.map((location) => (
                <div key={location.id} className="location-card selected static">
                  <strong>{location.name}</strong>
                  <span>{location.address}</span>
                </div>
              ))}
            </div>
            <div className="auth-actions">
              <Button type="button" onClick={() => navigate("/onboarding/locations")}>
                Continue
              </Button>
            </div>
          </div>
        ) : null}
      </Card>
    </div>
  );
}
