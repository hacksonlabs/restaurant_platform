import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { Button, Card, Field } from "../components/ui";

function browserTimezoneFallback() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York";
}

export function SignupPage() {
  const { signup } = useAuth();
  const [restaurantName, setRestaurantName] = useState("");
  const [address1, setAddress1] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [ownerFullName, setOwnerFullName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timezone = useMemo(() => browserTimezoneFallback(), []);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await signup({
        restaurantName,
        address1,
        city,
        state,
        postalCode,
        timezone,
        contactPhone,
        ownerFullName,
        ownerEmail,
        password,
      });
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Account creation failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-shell">
      <Card className="auth-card auth-card-wide">
        <Link className="auth-back-arrow" to="/login" aria-label="Back to sign in">
          ←
        </Link>
        <div className="eyebrow">Restaurant Onboarding</div>
        <h1>Create your restaurant account</h1>
        <p className="auth-copy">
          Let&apos;s set up the restaurant, create the owner account, and get you into the console in one pass.
        </p>
        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="auth-grid">
            <section className="auth-section">
              <h2>Restaurant</h2>
              <Field label="Restaurant Name">
                <input value={restaurantName} onChange={(event) => setRestaurantName(event.target.value)} autoComplete="organization" />
              </Field>
              <Field label="Street Address">
                <input value={address1} onChange={(event) => setAddress1(event.target.value)} autoComplete="street-address" />
              </Field>
              <div className="auth-grid auth-grid-tight">
                <Field label="City">
                  <input value={city} onChange={(event) => setCity(event.target.value)} autoComplete="address-level2" />
                </Field>
                <Field label="State">
                  <input value={state} onChange={(event) => setState(event.target.value)} autoComplete="address-level1" />
                </Field>
              </div>
              <div className="auth-grid auth-grid-tight">
                <Field label="Postal Code">
                  <input value={postalCode} onChange={(event) => setPostalCode(event.target.value)} autoComplete="postal-code" />
                </Field>
                <Field label="Contact Phone">
                  <input value={contactPhone} onChange={(event) => setContactPhone(event.target.value)} autoComplete="tel" />
                </Field>
              </div>
            </section>

            <section className="auth-section">
              <h2>Owner Account</h2>
              <Field label="Full Name">
                <input value={ownerFullName} onChange={(event) => setOwnerFullName(event.target.value)} autoComplete="name" />
              </Field>
              <Field label="Email">
                <input value={ownerEmail} onChange={(event) => setOwnerEmail(event.target.value)} type="email" autoComplete="email" />
              </Field>
              <Field label="Password">
                <input
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  type="password"
                  autoComplete="new-password"
                />
              </Field>
              <p className="auth-note">
                You&apos;ll start as the <strong>owner</strong>. From there you can invite staff or viewer accounts later.
              </p>
            </section>
          </div>
          {error ? <div className="auth-error">{error}</div> : null}
          <div className="auth-actions">
            <Button type="submit" disabled={submitting}>
              {submitting ? "Creating Account..." : "Create Restaurant Account"}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
