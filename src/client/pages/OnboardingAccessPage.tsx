import { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { useOnboarding } from "../auth/OnboardingContext";
import { Button, Card, Field } from "../components/ui";

export function OnboardingAccessPage() {
  const { completeOnboarding } = useAuth();
  const { provider, discoveredAccount, email, setEmail, selectedLocationIds, status, error } = useOnboarding();
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!provider || !discoveredAccount || selectedLocationIds.length === 0) {
    return <Navigate to="/onboarding/provider" replace />;
  }

  async function handleContinue(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    try {
      await completeOnboarding({
        provider,
        providerAccountId: discoveredAccount.accountId,
        providerLocationIds: selectedLocationIds,
        fullName,
        email,
        password,
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-shell">
      <Card className="auth-card">
        <Link className="auth-back-arrow" to="/onboarding/locations" aria-label="Back to location selection">
          ←
        </Link>
        <div className="eyebrow">Step 3 of 3</div>
        <h1>Create your Phantom access</h1>
        <p className="auth-copy">
          This creates the owner account for the selected restaurant locations and signs you straight into the console.
        </p>
        <form className="auth-form" onSubmit={handleContinue}>
          <Field label="Full Name">
            <input value={fullName} onChange={(event) => setFullName(event.target.value)} autoComplete="name" />
          </Field>
          <Field label="Work Email">
            <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" autoComplete="email" />
          </Field>
          <Field label="Password">
            <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete="new-password" />
          </Field>
          <div className="onboarding-preview-card">
            <strong>Owner access</strong>
            <p>
              {discoveredAccount.name} · {selectedLocationIds.length} location
              {selectedLocationIds.length === 1 ? "" : "s"}
            </p>
          </div>
          {error ? <div className="auth-error">{error}</div> : null}
          <div className="auth-actions">
            <Button type="submit" disabled={!fullName || !email || password.length < 8 || submitting || status === "submitting"}>
              {submitting ? "Creating Account..." : "Create Account"}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
