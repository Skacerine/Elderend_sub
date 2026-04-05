import express from "express";
import cors from "cors";

const app = express();
const PORT = process.env.PORT || 4004;

app.use(cors());
app.use(express.json());

const ELDERLY_BASE = process.env.ELDERLY_SERVICE_URL || "https://qmo.outsystemscloud.com/ElderlyServices/rest/Elderly";
const GUARDIAN_BASE = process.env.GUARDIAN_SERVICE_URL || "https://qmo.outsystemscloud.com/GuardianServices/rest/Guardian";

app.get("/health", (_req, res) => res.json({ status: "online", service: "auth-ms" }));

// POST /auth/register
app.post("/auth/register", async (req, res) => {
  const { guardian, elderly } = req.body;
  if (!guardian?.guardian_name || !guardian?.guardian_contact || !guardian?.password) {
    return res.status(400).json({ success: false, message: "Guardian name, phone, and password are required" });
  }
  if (!elderly?.elderly_name || !elderly?.elderly_contact || !elderly?.password) {
    return res.status(400).json({ success: false, message: "Elderly name, phone, and password are required" });
  }
  try {
    const elderlyRes = await fetch(`${ELDERLY_BASE}/RegisterElderly`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ elderly_name: elderly.elderly_name, elderly_contact: elderly.elderly_contact, residential_address: elderly.residential_address || "", password: elderly.password }),
    });
    const elderlyData = await elderlyRes.json();
    if (!elderlyData.success) return res.status(400).json({ success: false, message: elderlyData.message || "Failed to create elderly account" });

    const guardianRes = await fetch(`${GUARDIAN_BASE}/RegisterGuardian`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ guardian_name: guardian.guardian_name, guardian_contact: guardian.guardian_contact, password: guardian.password, elderly_id: elderlyData.elderly_id }),
    });
    const guardianData = await guardianRes.json();
    if (!guardianData.success) return res.status(400).json({ success: false, message: guardianData.message || "Failed to create guardian account" });

    const linkRes = await fetch(`${ELDERLY_BASE}/LinkGuardian`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ elderly_id: elderlyData.elderly_id, guardian_id: guardianData.guardian_id }),
    });
    if (!linkRes.ok) console.error("[Auth] LinkGuardian failed:", linkRes.status);

    return res.json({ success: true, guardianId: guardianData.guardian_id, elderlyId: elderlyData.elderly_id, guardianName: guardian.guardian_name });
  } catch (err) {
    console.error("Registration error:", err.message);
    return res.status(500).json({ success: false, message: "Registration service unavailable" });
  }
});

// POST /auth/login/guardian
app.post("/auth/login/guardian", async (req, res) => {
  const { phone, password } = req.body;
  if (!phone || !password) return res.status(400).json({ success: false, message: "Phone number and password are required" });
  try {
    const response = await fetch(`${GUARDIAN_BASE}/LoginGuardian`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ guardian_contact: phone, password }),
    });
    const data = await response.json();
    if (data.success) return res.json({ success: true, guardianId: data.guardian_id, elderlyId: data.elderly_id, name: data.guardian_name });
    return res.status(401).json({ success: false, message: data.message || "Invalid credentials" });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Login service unavailable" });
  }
});

// POST /auth/login/elderly
app.post("/auth/login/elderly", async (req, res) => {
  const { phone, password } = req.body;
  if (!phone || !password) return res.status(400).json({ success: false, message: "Phone number and password are required" });
  try {
    const response = await fetch(`${ELDERLY_BASE}/LoginElderly`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ elderly_contact: phone, password }),
    });
    const data = await response.json();
    if (data.success) return res.json({ success: true, elderlyId: data.elderly_id, name: data.elderly_name });
    return res.status(401).json({ success: false, message: data.message || "Invalid credentials" });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Login service unavailable" });
  }
});

app.listen(PORT, "0.0.0.0", () => console.log(`auth_ms listening on port ${PORT}`));
