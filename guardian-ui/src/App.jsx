import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ThemeProvider } from "./ThemeContext";
import { AuthProvider, useAuth } from "./AuthContext";
import NavBar from "./NavBar";
import Login from "./Login";
import Register from "./Register";
import GuardianDashboard from "./GuardianDashboard";
import ElderWatch from "./ElderWatch";
import Medicare from "./Medicare";
import GuardianDashboardDev from "./GuardianDashboardDev";

function RequireAuth({ children }) {
  const { isLoggedIn } = useAuth();
  return isLoggedIn ? children : <Navigate to="/login" replace />;
}

function AppRoutes() {
  const { isLoggedIn } = useAuth();

  return (
    <>
      {isLoggedIn && <NavBar />}
      <Routes>
        <Route path="/login" element={isLoggedIn ? <Navigate to="/" replace /> : <Login />} />
        <Route path="/register" element={isLoggedIn ? <Navigate to="/" replace /> : <Register />} />
        <Route path="/" element={<RequireAuth><GuardianDashboard /></RequireAuth>} />
        <Route path="/elderwatch" element={<RequireAuth><ElderWatch /></RequireAuth>} />
        <Route path="/medicare" element={<RequireAuth><Medicare /></RequireAuth>} />
        <Route path="/dev" element={<RequireAuth><GuardianDashboardDev /></RequireAuth>} />
      </Routes>
    </>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}
