import { NavLink } from "react-router-dom";
import { useTheme } from "./ThemeContext";

export default function NavBar() {
  const { theme, toggle } = useTheme();

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
      <button className="theme-toggle" onClick={toggle} title={`Switch to ${theme === "light" ? "dark" : "light"} mode`}>
        <span className="theme-toggle-icon">{theme === "light" ? "\u{1f319}" : "\u2600\ufe0f"}</span>
      </button>
    </nav>
  );
}
