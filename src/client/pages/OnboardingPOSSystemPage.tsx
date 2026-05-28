import { Link, useNavigate } from "react-router-dom";
import { useOnboarding } from "../auth/OnboardingContext";
import { Card } from "../components/ui";

const POS_SYSTEMS = [
  {
    id: "toast",
    label: "Toast",
  },
  {
    id: "square",
    label: "Square",
  },
  {
    id: "clover",
    label: "Clover",
  },
  {
    id: "spoton",
    label: "SpotOn",
  },
  {
    id: "lightspeed",
    label: "Lightspeed",
  },
  {
    id: "micros",
    label: "Oracle MICROS",
  },
  {
    id: "revel",
    label: "Revel",
  },
  {
    id: "simphony",
    label: "Oracle Simphony",
  },
  {
    id: "aloha",
    label: "NCR Aloha",
  },
  {
    id: "hungerrush",
    label: "HungerRush",
  },
  {
    id: "par",
    label: "PAR Brink",
  },
  {
    id: "other",
    label: "Other",
  },
] as const;

export function OnboardingPOSSystemPage() {
  const navigate = useNavigate();
  const { selectProvider, posSystem, selectPosSystem } = useOnboarding();

  function handleSelect(systemId: string) {
    selectProvider("pos");
    selectPosSystem(systemId);
    navigate("/onboarding/connect/pos");
  }

  return (
    <div className="auth-shell">
      <Card className="auth-card auth-card-wide">
        <Link className="auth-back-arrow" to="/onboarding/provider" aria-label="Back to provider selection">
          ←
        </Link>
        <div className="eyebrow">Step 1 of 5</div>
        <h1>Choose your POS system</h1>
        <p className="auth-copy">Pick the system your restaurant uses so we can guide the setup the right way.</p>
        <div className="provider-grid pos-system-grid">
          {POS_SYSTEMS.map((system) => (
            <button
              key={system.id}
              className={`provider-card provider-card-compact ${posSystem === system.id ? "selected" : ""}`.trim()}
              type="button"
              onClick={() => handleSelect(system.id)}
            >
              <div className="provider-card-head">
                <strong>{system.label}</strong>
              </div>
            </button>
          ))}
        </div>
      </Card>
    </div>
  );
}
