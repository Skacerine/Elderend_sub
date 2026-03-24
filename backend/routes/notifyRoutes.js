import express from "express";
import { getNotifications, getNotificationCount } from "../store/notificationStore.js";

const router = express.Router();

router.get("/health", (_req, res) =>
  res.json({ status: "online", service: "notify-guardian", count: getNotificationCount() })
);

// GET /notifications
router.get("/", (req, res) => {
  const n = parseInt(req.query.n, 10) || 100;
  res.json(getNotifications(n));
});

export default router;
