import { NavLink } from "react-router-dom";
import { useState } from "react";
import type { PropsWithChildren } from "react";
import { useAuth } from "../auth/AuthContext";

const navItems = [
  ["Dashboard", "/"],
  ["Profile", "/settings"],
  ["POS & Menu", "/menu"],
  ["Incoming Orders", "/orders"],
  ["Manage Agents", "/agents"],
  ["Reporting", "/reporting"],
];

export function ConsoleLayout({ children }: PropsWithChildren) {
  const [collapsed, setCollapsed] = useState(false);
  const { session, logout, selectTenant } = useAuth();
  const selectedRestaurant = session?.restaurants.find(
    (restaurant) => restaurant.id === session.selectedMembership.restaurantId,
  );

  return (
    <div className={`app-shell ${collapsed ? "sidebar-collapsed" : ""}`}>
      <aside className={`sidebar ${collapsed ? "collapsed" : ""}`}>
        <div className="brand">
          <div className={`brand-copy ${collapsed ? "hidden" : ""}`}>
            <strong>Phantom</strong>
            <span>{selectedRestaurant?.name ?? "Restaurant Console"}</span>
            <small className="session-copy">{session?.user.email}</small>
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
          {session && session.restaurants.length > 1 ? (
            <label className="tenant-switcher">
              <span>Restaurant</span>
              <select
                value={session.selectedMembership.restaurantId}
                onChange={(event) => void selectTenant(event.target.value)}
              >
                {session.restaurants.map((restaurant) => (
                  <option key={restaurant.id} value={restaurant.id}>
                    {restaurant.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <button type="button" className="sidebar-signout" onClick={() => void logout()}>
            Sign Out
          </button>
        </div>
      </aside>
      <main className="content">{children}</main>
    </div>
  );
}
