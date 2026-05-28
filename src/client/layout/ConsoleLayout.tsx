import { NavLink } from "react-router-dom";
import { useState } from "react";
import type { PropsWithChildren } from "react";
import { useAuth } from "../auth/AuthContext";

const navItems = [
  { label: "Dashboard", to: "/" },
  { label: "Profile", to: "/settings" },
  { label: "POS & Menu", to: "/menu" },
  { label: "Incoming Orders", to: "/orders" },
  { label: "Manage Agents", to: "/agents" },
  { label: "Reporting", to: "/reporting" },
];

export function ConsoleLayout({ children }: PropsWithChildren) {
  const [collapsed, setCollapsed] = useState(false);
  const { session, logout, selectTenant } = useAuth();
  const selectedRestaurant = session?.restaurants.find(
    (restaurant) => restaurant.id === session.selectedMembership.restaurantId,
  );
  const selectedRole = session?.selectedMembership.role ?? null;

  return (
    <div className={`app-shell ${collapsed ? "sidebar-collapsed" : ""}`}>
      <aside className={`sidebar ${collapsed ? "collapsed" : ""}`}>
        <div className="brand">
          <div className={`brand-copy ${collapsed ? "hidden" : ""}`}>
            <strong>Phantom</strong>
            <span>Restaurant Console</span>
            <small className="session-copy">{session?.user.email}</small>
            {selectedRole ? <small className="session-role">{selectedRole}</small> : null}
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
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}
              tabIndex={collapsed ? -1 : 0}
              aria-hidden={collapsed}
            >
              <span className={`nav-text ${collapsed ? "hidden" : ""}`}>{item.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className={`session-panel ${collapsed ? "hidden" : ""}`}>
          {session ? (
            session.restaurants.length > 1 ? (
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
            ) : (
              <div className="tenant-current">
                <span>Restaurant</span>
                <strong>{selectedRestaurant?.name ?? "Restaurant Console"}</strong>
              </div>
            )
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
