import { useState } from "react";
import { Navigate } from "react-router-dom";
import { usePlatformAdminAuth } from "../auth/PlatformAdminAuthContext";

export function PlatformAdminLoginPage() {
  const { session, login } = usePlatformAdminAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (session) {
    return <Navigate to="/phantom-admin" replace />;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await login(email, password);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Admin sign in failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="platform-login-shell">
      <section className="platform-login-panel">
        <div className="platform-login-copy">
          <div className="platform-login-mark">PA</div>
          <p>Phantom Admin</p>
          <h1>Platform control room</h1>
          <span>Partner approvals, agent credentials, and trust operations.</span>
        </div>
        <form className="platform-login-form" onSubmit={handleSubmit} autoComplete="off">
          <div>
            <h2>Admin Sign In</h2>
            <p>Use a Phantom Admin account. Restaurant console sessions do not apply here.</p>
          </div>
          <label>
            <span>Email</span>
            <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" autoComplete="off" />
          </label>
          <label>
            <span>Password</span>
            <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete="off" />
          </label>
          {error ? <div className="platform-login-error">{error}</div> : null}
          <button type="submit" disabled={submitting || !email.trim() || !password}>
            {submitting ? "Signing in..." : "Enter Admin"}
          </button>
        </form>
      </section>
    </main>
  );
}
