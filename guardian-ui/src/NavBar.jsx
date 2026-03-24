import { NavLink } from "react-router-dom";

export default function NavBar() {
  return (
    <nav className="app-nav">
      <NavLink to="/" end className={({ isActive }) => `nav-link ${isActive ? "nav-link--active" : ""}`}>
        GuardianPhoneDropper
      </NavLink>
      <NavLink to="/elderwatch" className={({ isActive }) => `nav-link ${isActive ? "nav-link--active" : ""}`}>
        ElderWatch
      </NavLink>
    </nav>
  );
}
