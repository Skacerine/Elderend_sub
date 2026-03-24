import express from "express";

const MEDICINE_BASE_URL = "https://personal-s93qqbah.outsystemscloud.com/Medicine/rest/Medicine";

const router = express.Router();

router.get("/health", (_req, res) =>
  res.json({ status: "online", service: "medicine-proxy" })
);

// GET /medicine/:elderlyId — medicines for one elderly
router.get("/:elderlyId", async (req, res) => {
  try {
    const response = await fetch(`${MEDICINE_BASE_URL}/medicine/${req.params.elderlyId}/`, {
      headers: { Accept: "application/json" }
    });
    if (!response.ok) {
      const text = await response.text();
      return res.status(response.status).json({ error: text });
    }
    const data = await response.json();
    res.json(data);
  } catch (e) {
    console.error("[Medicine] Fetch failed:", e.message);
    res.status(503).json({ error: e.message });
  }
});

// GET /medicines — all medicines
router.get("/", async (_req, res) => {
  try {
    const response = await fetch(`${MEDICINE_BASE_URL}/medicines/`, {
      headers: { Accept: "application/json" }
    });
    if (!response.ok) {
      const text = await response.text();
      return res.status(response.status).json({ error: text });
    }
    const data = await response.json();
    res.json(data);
  } catch (e) {
    console.error("[Medicine] Fetch all failed:", e.message);
    res.status(503).json({ error: e.message });
  }
});

export default router;
