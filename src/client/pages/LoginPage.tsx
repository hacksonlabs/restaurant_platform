import { useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { Button, Card, Field } from "../components/ui";

export function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState("dev@rest.com");
  const [password, setPassword] = useState("password");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await login(email, password);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Sign in failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-shell">
      <Card className="auth-card">
        <div className="eyebrow">Restaurant Access</div>
        <h1>Sign in to Phantom</h1>
        <p className="auth-copy">
          Demo access is limited to the restaurant operator account for LB Steakhouse. No approval step is required.
        </p>
        <form className="auth-form" onSubmit={handleSubmit}>
          <Field label="Email">
            <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" autoComplete="email" />
          </Field>
          <Field label="Password">
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              autoComplete="current-password"
            />
          </Field>
          {error ? <div className="auth-error">{error}</div> : null}
          <Button type="submit" disabled={submitting}>
            {submitting ? "Signing In..." : "Sign In"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
