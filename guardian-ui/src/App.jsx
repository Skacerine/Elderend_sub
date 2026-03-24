import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "./ThemeContext";
import NavBar from "./NavBar";
import GuardianDashboard from "./GuardianDashboard";
import ElderWatch from "./ElderWatch";
import Medicare from "./Medicare";

export default function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <NavBar />
        <Routes>
          <Route path="/" element={<GuardianDashboard />} />
          <Route path="/elderwatch" element={<ElderWatch />} />
          <Route path="/medicare" element={<Medicare />} />
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  );
}
