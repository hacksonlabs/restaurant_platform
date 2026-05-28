import { Link, Navigate, useNavigate } from "react-router-dom";
import { useOnboarding } from "../auth/OnboardingContext";
import { Button, Card } from "../components/ui";

export function OnboardingLocationsPage() {
  const navigate = useNavigate();
  const { discoveredAccount, selectedLocationIds, setSelectedLocationIds } = useOnboarding();

  if (!discoveredAccount) {
    return <Navigate to="/onboarding/provider" replace />;
  }

  function toggleLocation(locationId: string) {
    setSelectedLocationIds(
      selectedLocationIds.includes(locationId)
        ? selectedLocationIds.filter((id) => id !== locationId)
        : [...selectedLocationIds, locationId],
    );
  }

  function useAllLocations() {
    setSelectedLocationIds(discoveredAccount.locations.map((location) => location.id));
  }

  return (
    <div className="auth-shell">
      <Card className="auth-card auth-card-wide">
        <Link className="auth-back-arrow" to={`/onboarding/connect/${discoveredAccount.provider}`} aria-label="Back to platform connection">
          ←
        </Link>
        <div className="eyebrow">Step 2 of 4</div>
        <h1>Select your restaurant locations</h1>
        <p className="auth-copy">
          {discoveredAccount.name} has {discoveredAccount.locations.length} connected location
          {discoveredAccount.locations.length === 1 ? "" : "s"}. Choose the footprint you want to bring into Phantom.
        </p>
        <div className="button-row onboarding-row-actions">
          <Button type="button" tone="secondary" onClick={useAllLocations}>
            Use All Locations
          </Button>
          <span className="muted">{selectedLocationIds.length} selected</span>
        </div>
        <div className="location-grid">
          {discoveredAccount.locations.map((location) => {
            const checked = selectedLocationIds.includes(location.id);
            return (
              <button
                key={location.id}
                type="button"
                className={`location-card ${checked ? "selected" : ""}`.trim()}
                onClick={() => toggleLocation(location.id)}
              >
                <div className="location-card-check" aria-hidden="true">
                  {checked ? "Selected" : "Select"}
                </div>
                <strong>{location.name}</strong>
                <span>{location.address}</span>
              </button>
            );
          })}
        </div>
        <div className="auth-actions">
          <Button type="button" onClick={() => navigate("/onboarding/access")} disabled={selectedLocationIds.length === 0}>
            Continue
          </Button>
        </div>
      </Card>
    </div>
  );
}
