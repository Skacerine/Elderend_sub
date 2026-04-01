import { NavLink, useNavigate } from "react-router-dom";
import { useTheme } from "./ThemeContext";
import { useAuth } from "./AuthContext";

export default function NavBar() {
  const { theme, toggle } = useTheme();
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate("/login");
  }

  return (
    <nav className="app-nav">
      <NavLink to="/" end className={({ isActive }) => `nav-link ${isActive ? "nav-link--active" : ""}`}>
        GuardianPhoneDropper
      </NavLink>
      <NavLink to="/elderwatch" className={({ isActive }) => `nav-link ${isActive ? "nav-link--active" : ""}`}>
        ElderWatch
      </NavLink>
      <NavLink to="/medicare" className={({ isActive }) => `nav-link ${isActive ? "nav-link--active" : ""}`}>
        Medicare
      </NavLink>

      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "10px" }}>
        {user && (
          <span style={{ fontSize: "13px", opacity: 0.7 }}>
            {user.name || `Guardian #${user.guardianId}`}
          </span>
        )}
        <button className="theme-toggle" onClick={toggle} title={`Switch to ${theme === "light" ? "dark" : "light"} mode`}>
          <span className="theme-toggle-icon">{theme === "light" ? "\u{1f319}" : "\u2600\ufe0f"}</span>
        </button>
        <button
          onClick={handleLogout}
          style={{
            background: "none", border: "1px solid currentColor", borderRadius: "6px",
            padding: "4px 12px", cursor: "pointer", fontSize: "12px",
            color: "inherit", opacity: 0.7,
          }}
          title="Sign out"
        >
          Logout
        </button>
      </div>
    </nav>
  );
}
