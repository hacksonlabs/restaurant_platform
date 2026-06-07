import { Link } from "react-router-dom";
import type { PropsWithChildren } from "react";
import { usePlatformAdminAuth } from "../auth/PlatformAdminAuthContext";

export function PlatformAdminLayout({ children }: PropsWithChildren) {
  const { session, logout } = usePlatformAdminAuth();

  return (
    <div className="platform-shell">
      <header className="platform-topbar">
        <Link to="/phantom-admin" className="platform-brand">
          <strong>Phantom Admin</strong>
          <span>Platform Operations</span>
        </Link>
        <div className="platform-topbar-actions">
          <span className="platform-session">{session?.user.email}</span>
          <button type="button" className="platform-signout" onClick={() => void logout()}>
            Sign Out
          </button>
        </div>
      </header>
      <main className="platform-content">{children}</main>
    </div>
  );
}
