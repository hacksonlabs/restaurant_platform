import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { Button, Card, Field } from "../components/ui";

export function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState("demo@restaurant.com");
  const [password, setPassword] = useState("password");
  const [showPassword, setShowPassword] = useState(false);
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
      <Card className="auth-card auth-card-login">
        <div className="auth-login-grid">
          <div className="auth-login-intro">
            <div className="eyebrow">Restaurant Access</div>
            <h1>Sign in to Phantom</h1>
            <p className="auth-copy">Access your restaurant console or connect a new platform.</p>
            <Link className="button secondary auth-login-start" to="/onboarding/provider">
              Get Started
            </Link>
          </div>
          <div className="auth-login-panel">
            <div className="auth-login-panel-title">Sign In</div>
            <form className="auth-form" onSubmit={handleSubmit} autoComplete="off">
              <Field label="Email">
                <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" autoComplete="off" />
              </Field>
              <Field label="Password">
                <div className="password-field-wrap">
                  <input
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    className="password-toggle"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    onClick={() => setShowPassword((current) => !current)}
                  >
                    {showPassword ? (
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path
                          d="M3 4.5 19.5 21M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 5.2A10.8 10.8 0 0 1 12 5c5.2 0 9.4 4.2 10.5 7-.5 1.2-1.6 2.8-3.2 4.2M6.7 6.7C4.6 8.1 3.2 10 2.5 12c1.1 2.8 5.3 7 9.5 7 1.2 0 2.3-.2 3.4-.5"
                          fill="none"
                          stroke="currentColor"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="1.8"
                        />
                      </svg>
                    ) : (
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path
                          d="M1.5 12C2.6 9.2 6.8 5 12 5s9.4 4.2 10.5 7c-1.1 2.8-5.3 7-10.5 7S2.6 14.8 1.5 12Z"
                          fill="none"
                          stroke="currentColor"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="1.8"
                        />
                        <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="1.8" />
                      </svg>
                    )}
                  </button>
                </div>
              </Field>
              {error ? <div className="auth-error">{error}</div> : null}
              <Button type="submit" disabled={submitting}>
                {submitting ? "Signing In..." : "Sign In"}
              </Button>
            </form>
          </div>
        </div>
      </Card>
    </div>
  );
}
