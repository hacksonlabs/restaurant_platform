import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth/AuthContext";
import { ConsoleLayout } from "./layout/ConsoleLayout";
import { AgentsPage } from "./pages/AgentsPage";
import { AgentDetailPage } from "./pages/AgentDetailPage";
import { DashboardPage } from "./pages/DashboardPage";
import { LoginPage } from "./pages/LoginPage";
import { MenuPage } from "./pages/MenuPage";
import { OrderDetailPage } from "./pages/OrderDetailPage";
import { OrdersPage } from "./pages/OrdersPage";
import { ReportingPage } from "./pages/ReportingPage";
import { SettingsPage } from "./pages/SettingsPage";

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
    return <LoginPage />;
  }

  return (
    <ConsoleLayout>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/menu" element={<MenuPage />} />
        <Route path="/pos-connection" element={<Navigate to="/menu" replace />} />
        <Route path="/orders" element={<OrdersPage />} />
        <Route path="/orders/:orderId" element={<OrderDetailPage />} />
        <Route path="/agents" element={<AgentsPage />} />
        <Route path="/agents/:agentId" element={<AgentDetailPage />} />
        <Route path="/reporting" element={<ReportingPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </ConsoleLayout>
  );
}
