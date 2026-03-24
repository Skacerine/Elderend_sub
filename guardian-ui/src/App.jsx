import { BrowserRouter, Routes, Route } from "react-router-dom";
import NavBar from "./NavBar";
import GuardianDashboard from "./GuardianDashboard";
import ElderWatch from "./ElderWatch";

export default function App() {
  return (
    <BrowserRouter>
      <NavBar />
      <Routes>
        <Route path="/" element={<GuardianDashboard />} />
        <Route path="/elderwatch" element={<ElderWatch />} />
      </Routes>
    </BrowserRouter>
  );
}
