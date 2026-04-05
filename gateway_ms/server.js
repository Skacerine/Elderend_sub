import express from "express";
import cors from "cors";
import { createProxyMiddleware } from "http-proxy-middleware";
import http from "http";

const app = express();
const PORT = process.env.PORT || 4000;

const GPS_MS_URL = process.env.GPS_MS_URL || "http://gps_ms:4001";
const ALERT_MS_URL = process.env.ALERT_MS_URL || "http://alert_ms:4002";
const MEDICINE_MS_URL = process.env.MEDICINE_MS_URL || "http://medicine_ms:4003";
const AUTH_MS_URL = process.env.AUTH_MS_URL || "http://auth_ms:4004";
const NOTIFICATION_MS_URL = process.env.NOTIFICATION_MS_URL || "http://notification_ms:4005";

const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:5174",
  "https://guardianphonedropper.vercel.app",
  "https://phonedropper9000-xi.vercel.app",
  "https://ignacia-cymbocephalic-shela.ngrok-free.dev",
  process.env.GUARDIAN_UI_URL,
  process.env.PHONE_PWA_URL
].filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      if (origin.includes("outsystemscloud.com") || origin.includes("outsystemsenterprise.com")) return callback(null, true);
      return callback(new Error(`CORS blocked for origin: ${origin}`));
    },
    credentials: true
  })
);

// Health check — aggregates status from all services
app.get("/health", async (_req, res) => {
  const services = {
    gps_ms: GPS_MS_URL,
    alert_ms: ALERT_MS_URL,
    medicine_ms: MEDICINE_MS_URL,
    auth_ms: AUTH_MS_URL,
    notification_ms: NOTIFICATION_MS_URL
  };
  const results = {};
  await Promise.allSettled(
    Object.entries(services).map(async ([name, url]) => {
      try {
        const r = await fetch(`${url}/health`, { signal: AbortSignal.timeout(3000) });
        results[name] = r.ok ? "online" : "offline";
      } catch {
        results[name] = "offline";
      }
    })
  );
  res.json({ ok: true, service: "gateway-ms", services: results });
});

// Proxy factory — uses pathFilter so the full path is preserved
const makeProxy = (pathPrefixes, target) =>
  createProxyMiddleware({
    target,
    changeOrigin: true,
    pathFilter: pathPrefixes,
    timeout: 30000,
    proxyTimeout: 30000,
    on: {
      error: (err, _req, res) => {
        console.error(`[Gateway] Proxy error to ${target}:`, err.message);
        if (res.writeHead) res.status(502).json({ error: "Service unavailable" });
      }
    }
  });

// ═══ Route proxying ═══
app.use(makeProxy(["/gps", "/elderlylog", "/drawmap", "/status", "/location"], GPS_MS_URL));
app.use(makeProxy(["/alerts", "/motion", "/external"], ALERT_MS_URL));
app.use(makeProxy(["/medicine"], MEDICINE_MS_URL));
app.use(makeProxy(["/auth"], AUTH_MS_URL));
app.use(makeProxy(["/notifications", "/settings"], NOTIFICATION_MS_URL));

// ═══ WebSocket proxy to alert_ms ═══
const server = http.createServer(app);

server.on("upgrade", (req, socket, head) => {
  const { createProxyMiddleware: _cpm, ...rest } = {};
  // Manual WebSocket proxy to alert_ms
  const target = new URL(ALERT_MS_URL);
  const proxyReq = http.request({
    hostname: target.hostname,
    port: target.port,
    path: req.url,
    method: req.method,
    headers: req.headers
  });

  proxyReq.on("upgrade", (proxyRes, proxySocket, proxyHead) => {
    socket.write(
      `HTTP/1.1 101 Switching Protocols\r\n` +
      `Upgrade: websocket\r\n` +
      `Connection: Upgrade\r\n` +
      Object.entries(proxyRes.headers)
        .filter(([k]) => !["upgrade", "connection"].includes(k.toLowerCase()))
        .map(([k, v]) => `${k}: ${v}`)
        .join("\r\n") +
      "\r\n\r\n"
    );
    if (proxyHead.length > 0) socket.write(proxyHead);
    proxySocket.pipe(socket);
    socket.pipe(proxySocket);
  });

  proxyReq.on("error", (err) => {
    console.error("[Gateway] WebSocket proxy error:", err.message);
    socket.destroy();
  });

  proxyReq.end();
  if (head.length > 0) proxyReq.write(head);
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`gateway_ms listening on port ${PORT}`);
  console.log(`  GPS    → ${GPS_MS_URL}`);
  console.log(`  Alert  → ${ALERT_MS_URL}`);
  console.log(`  Med    → ${MEDICINE_MS_URL}`);
  console.log(`  Auth   → ${AUTH_MS_URL}`);
  console.log(`  Notify → ${NOTIFICATION_MS_URL}`);
});
