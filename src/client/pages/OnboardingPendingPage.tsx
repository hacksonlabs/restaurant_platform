import { useEffect } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { useOnboarding } from "../auth/OnboardingContext";
import { Card } from "../components/ui";

export function OnboardingPendingPage() {
  const { requestId } = useParams();
  const { request, hydrateRequest, error } = useOnboarding();

  useEffect(() => {
    if (requestId && (!request || request.id !== requestId)) {
      void hydrateRequest(requestId);
    }
  }, [requestId, request, hydrateRequest]);

  if (!requestId) {
    return <Navigate to="/onboarding/provider" replace />;
  }

  if (!request || request.id !== requestId) {
    return (
      <div className="auth-shell">
        <div className="loading-card">{error ? `Loading request failed: ${error}` : "Loading onboarding request..."}</div>
      </div>
    );
  }

  return (
    <div className="auth-shell">
      <Card className="auth-card">
        <div className="eyebrow">Request Submitted</div>
        <h1>We&apos;re verifying your restaurant connection</h1>
        <p className="auth-copy">
          Your onboarding request is staged. Once approved, Phantom can create the owner account and activate access.
        </p>
        <div className="pending-summary">
          <div>
            <span>Platform</span>
            <strong>{request.provider}</strong>
          </div>
          <div>
            <span>Account</span>
            <strong>{request.accountName}</strong>
          </div>
          <div>
            <span>Locations</span>
            <strong>{request.providerLocationIds.length}</strong>
          </div>
          <div>
            <span>Email</span>
            <strong>{request.email}</strong>
          </div>
        </div>
        <div className="auth-footer">
          <span>Request ID: {request.id}</span>
          <Link className="auth-link" to="/login">
            Back to sign in
          </Link>
        </div>
      </Card>
    </div>
  );
}
