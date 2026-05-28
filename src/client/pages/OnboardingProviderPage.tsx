import { Link, useNavigate } from "react-router-dom";
import type { OnboardingProvider } from "@shared/types";
import { useOnboarding } from "../auth/OnboardingContext";
import { Card } from "../components/ui";

const PROVIDERS: Array<{ id: OnboardingProvider; label: string; description: string }> = [
  {
    id: "deliverect",
    label: "Deliverect",
    description: "Import restaurant, location, and menu context from your Deliverect account.",
  },
  {
    id: "olo",
    label: "Olo",
    description: "Bring in your Olo-managed restaurant footprint with the same onboarding flow.",
  },
  {
    id: "pos",
    label: "POS System",
    description: "Start a direct POS connection when you are not using an aggregator platform.",
  },
];

export function OnboardingProviderPage() {
  const navigate = useNavigate();
  const { selectProvider } = useOnboarding();

  function handleSelect(provider: OnboardingProvider) {
    selectProvider(provider);
    navigate(provider === "pos" ? "/onboarding/pos-system" : `/onboarding/connect/${provider}`);
  }

  return (
    <div className="auth-shell">
      <Card className="auth-card auth-card-wide">
        <Link className="auth-back-arrow" to="/login" aria-label="Back to sign in">
          ←
        </Link>
        <div className="eyebrow">Get Started</div>
        <h1>Connect your restaurant platform</h1>
        <p className="auth-copy">Choose the how you want to connect.</p>
        <div className="provider-grid">
          {PROVIDERS.map((provider) => (
            <button key={provider.id} className="provider-card" type="button" onClick={() => handleSelect(provider.id)}>
              <div className="provider-card-head">
                <strong>{provider.label}</strong>
              </div>
              <span>{provider.description}</span>
            </button>
          ))}
        </div>
      </Card>
    </div>
  );
}
