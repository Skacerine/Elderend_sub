import express from "express";

const router = express.Router();

const ELDERLY_BASE =
  process.env.ELDERLY_SERVICE_URL ||
  "https://qmo.outsystemscloud.com/ElderlyServices/rest/Elderly";
const GUARDIAN_BASE =
  process.env.GUARDIAN_SERVICE_URL ||
  "https://qmo.outsystemscloud.com/GuardianServices/rest/Guardian";

// POST /auth/register — create guardian + elderly accounts
router.post("/register", async (req, res) => {
  const { guardian, elderly } = req.body;

  if (!guardian?.guardian_name || !guardian?.guardian_contact || !guardian?.password) {
    return res.status(400).json({ success: false, message: "Guardian name, phone, and password are required" });
  }
  if (!elderly?.elderly_name || !elderly?.elderly_contact || !elderly?.password) {
    return res.status(400).json({ success: false, message: "Elderly name, phone, and password are required" });
  }

  try {
    // Step 1: Create elderly record first
    const elderlyRes = await fetch(`${ELDERLY_BASE}/RegisterElderly`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        elderly_name: elderly.elderly_name,
        elderly_contact: elderly.elderly_contact,
        residential_address: elderly.residential_address || "",
        password: elderly.password,
      }),
    });
    const elderlyData = await elderlyRes.json();

    if (!elderlyData.success) {
      return res.status(400).json({ success: false, message: elderlyData.message || "Failed to create elderly account" });
    }

    // Step 2: Create guardian record linked to elderly
    const guardianRes = await fetch(`${GUARDIAN_BASE}/RegisterGuardian`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        guardian_name: guardian.guardian_name,
        guardian_contact: guardian.guardian_contact,
        password: guardian.password,
        elderly_id: elderlyData.elderly_id,
      }),
    });
    const guardianData = await guardianRes.json();

    if (!guardianData.success) {
      return res.status(400).json({ success: false, message: guardianData.message || "Failed to create guardian account" });
    }

    // Step 3: Link elderly to guardian
    await fetch(`${ELDERLY_BASE}/LinkGuardian`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        elderly_id: elderlyData.elderly_id,
        guardian_id: guardianData.guardian_id,
      }),
    });

    return res.json({
      success: true,
      guardianId: guardianData.guardian_id,
      elderlyId: elderlyData.elderly_id,
      guardianName: guardian.guardian_name,
    });
  } catch (err) {
    console.error("Registration error:", err.message);
    return res.status(500).json({ success: false, message: "Registration service unavailable" });
  }
});

// POST /auth/login/guardian
router.post("/login/guardian", async (req, res) => {
  const { phone, password } = req.body;
  if (!phone || !password) {
    return res.status(400).json({ success: false, message: "Phone number and password are required" });
  }
  try {
    const response = await fetch(`${GUARDIAN_BASE}/LoginGuardian`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ guardian_contact: phone, password: password }),
    });
    const data = await response.json();
    if (data.success) {
      return res.json({
        success: true,
        guardianId: data.guardian_id,
        elderlyId: data.elderly_id,
        name: data.guardian_name,
      });
    }
    return res.status(401).json({ success: false, message: data.message || "Invalid credentials" });
  } catch (err) {
    console.error("Guardian login error:", err.message);
    return res.status(500).json({ success: false, message: "Login service unavailable" });
  }
});

// POST /auth/login/elderly
router.post("/login/elderly", async (req, res) => {
  const { phone, password } = req.body;
  if (!phone || !password) {
    return res.status(400).json({ success: false, message: "Phone number and password are required" });
  }
  try {
    const response = await fetch(`${ELDERLY_BASE}/LoginElderly`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ elderly_contact: phone, password: password }),
    });
    const data = await response.json();
    if (data.success) {
      return res.json({
        success: true,
        elderlyId: data.elderly_id,
        name: data.elderly_name,
      });
    }
    return res.status(401).json({ success: false, message: data.message || "Invalid credentials" });
  } catch (err) {
    console.error("Elderly login error:", err.message);
    return res.status(500).json({ success: false, message: "Login service unavailable" });
  }
});

export default router;
