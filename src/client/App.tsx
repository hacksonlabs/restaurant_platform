import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth/AuthContext";
import { ConsoleLayout } from "./layout/ConsoleLayout";
import { AgentsPage } from "./pages/AgentsPage";
import { AgentDetailPage } from "./pages/AgentDetailPage";
import { AccessPage } from "./pages/AccessPage";
import { DashboardPage } from "./pages/DashboardPage";
import { LoginPage } from "./pages/LoginPage";
import { MenuPage } from "./pages/MenuPage";
import { OnboardingAccessPage } from "./pages/OnboardingAccessPage";
import { OnboardingConnectPage } from "./pages/OnboardingConnectPage";
import { OnboardingLocationsPage } from "./pages/OnboardingLocationsPage";
import { OnboardingPendingPage } from "./pages/OnboardingPendingPage";
import { OnboardingPOSSystemPage } from "./pages/OnboardingPOSSystemPage";
import { OnboardingProviderPage } from "./pages/OnboardingProviderPage";
import { OrderDetailPage } from "./pages/OrderDetailPage";
import { OrdersPage } from "./pages/OrdersPage";
import { ReportingPage } from "./pages/ReportingPage";
import { SettingsPage } from "./pages/SettingsPage";
import { SignupPage } from "./pages/SignupPage";

export function App() {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <div className="auth-shell">
        <div className="loading-card">Checking restaurant session...</div>
      </div>
    );
  }

  if (!session) {
    return (
      <Routes>
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/onboarding/provider" element={<OnboardingProviderPage />} />
        <Route path="/onboarding/pos-system" element={<OnboardingPOSSystemPage />} />
        <Route path="/onboarding/connect/:provider" element={<OnboardingConnectPage />} />
        <Route path="/onboarding/locations" element={<OnboardingLocationsPage />} />
        <Route path="/onboarding/access" element={<OnboardingAccessPage />} />
        <Route path="/onboarding/pending/:requestId" element={<OnboardingPendingPage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <ConsoleLayout>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/access" element={<AccessPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/menu" element={<MenuPage />} />
        <Route path="/pos-connection" element={<Navigate to="/menu" replace />} />
        <Route path="/orders" element={<OrdersPage />} />
        <Route path="/orders/:orderId" element={<OrderDetailPage />} />
        <Route path="/agents" element={<Navigate to="/access" replace />} />
        <Route path="/agents/:agentId" element={<AgentDetailPage />} />
        <Route path="/reporting" element={<ReportingPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </ConsoleLayout>
  );
}
