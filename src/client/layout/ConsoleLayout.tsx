import { NavLink } from "react-router-dom";
import { useState } from "react";
import type { PropsWithChildren } from "react";
import { useAuth } from "../auth/AuthContext";

const navItems = [
  ["Dashboard", "/"],
  ["Profile", "/settings"],
  ["POS Connection", "/pos-connection"],
  ["Menu Sync", "/menu"],
  ["Incoming Orders", "/orders"],
  ["Manage Agents", "/agents"],
  ["Reporting", "/reporting"],
];

export function ConsoleLayout({ children }: PropsWithChildren) {
  const [collapsed, setCollapsed] = useState(false);
  const { user, logout } = useAuth();

  return (
    <div className={`app-shell ${collapsed ? "sidebar-collapsed" : ""}`}>
      <aside className={`sidebar ${collapsed ? "collapsed" : ""}`}>
        <div className="brand">
          <div className={`brand-copy ${collapsed ? "hidden" : ""}`}>
            <strong>Phantom</strong>
            <span>LB Steakhouse Demo</span>
            <small className="session-copy">{user.email}</small>
          </div>
          <button
            type="button"
            className="sidebar-toggle"
            onClick={() => setCollapsed((current) => !current)}
            aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
            aria-expanded={!collapsed}
          >
            {collapsed ? "»" : "«"}
          </button>
        </div>
        <nav className="nav">
          {navItems.map(([label, to]) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}
              tabIndex={collapsed ? -1 : 0}
              aria-hidden={collapsed}
            >
              <span className={`nav-text ${collapsed ? "hidden" : ""}`}>{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className={`session-panel ${collapsed ? "hidden" : ""}`}>
          <button type="button" className="sidebar-signout" onClick={() => void logout()}>
            Sign Out
          </button>
        </div>
      </aside>
      <main className="content">{children}</main>
    </div>
  );
}
