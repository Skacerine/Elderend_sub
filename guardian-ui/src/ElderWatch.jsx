import { useEffect, useRef, useState, useCallback } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000";

const HOME = { lat: 1.35305, lng: 103.94402 };
const ELDERLY_ID = 1234567891234567;

async function get(url) {
  try {
    const r = await fetch(`${API_BASE}${url}`, { signal: AbortSignal.timeout(6000) });
    return r.ok ? r.json() : null;
  } catch { return null; }
}

async function post(url, body = {}) {
  try {
    const r = await fetch(`${API_BASE}${url}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000)
    });
    return r.json();
  } catch { return null; }
}

export default function ElderWatch() {
  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const markerRef = useRef(null);
  const trailRef = useRef(null);
  const trailData = useRef([]);

  const [mode, setModeState] = useState("standard");
  const [speed, setSpeedState] = useState(10);
  const [running, setRunning] = useState(true);
  const [statusData, setStatusData] = useState(null);
  const [addressData, setAddressData] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [amqpLog, setAmqpLog] = useState([]);
  const [history, setHistory] = useState([]);
  const [activeTab, setActiveTab] = useState("alerts");
  const [health, setHealth] = useState({});
  const [replayState, setReplayState] = useState({ active: false });
  const [toasts, setToasts] = useState([]);
  const lastAlertId = useRef(null);

  // Toast helper
  const showToast = useCallback((type, message, sub) => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, type, message, sub }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 7000);
  }, []);

  // Init map
  useEffect(() => {
    if (mapInstance.current) return;
    const map = L.map(mapRef.current, { zoomControl: false }).setView([HOME.lat, HOME.lng], 16);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap"
    }).addTo(map);
    L.control.zoom({ position: "bottomright" }).addTo(map);

    const homeIcon = L.divIcon({
      html: `<div style="background:#0e1520;border:2px solid #3b82f6;border-radius:6px;width:24px;height:24px;display:flex;align-items:center;justify-content:center;font-size:12px;box-shadow:0 2px 10px rgba(59,130,246,.5)">&#x1f475;</div>`,
      iconSize: [24, 24], iconAnchor: [12, 12], className: ""
    });
    L.marker([HOME.lat, HOME.lng], { icon: homeIcon }).addTo(map).bindPopup("<b>Home Base</b><br>Boundary: 500m");
    L.circle([HOME.lat, HOME.lng], {
      radius: 500, color: "#3b82f6", fillColor: "#3b82f6",
      fillOpacity: 0.05, weight: 1.5, dashArray: "6 4"
    }).addTo(map);

    const elIcon = L.divIcon({
      html: `<div style="background:#f87171;border:3px solid #fff;border-radius:50%;width:18px;height:18px;box-shadow:0 0 0 3px rgba(248,113,113,.3),0 2px 8px rgba(0,0,0,.5)"></div>`,
      iconSize: [18, 18], iconAnchor: [9, 9], className: ""
    });
    const marker = L.marker([HOME.lat, HOME.lng], { icon: elIcon, draggable: true, title: "Mdm Tan Ah Kow" });
    marker.addTo(map).bindPopup("<b>Mdm Tan Ah Kow</b>");
    marker.on("dragend", async (e) => {
      const { lat, lng } = e.target.getLatLng();
      await post("/gps/devicegps/position", { lat, lng });
    });

    markerRef.current = marker;
    mapInstance.current = map;

    return () => { map.remove(); mapInstance.current = null; };
  }, []);

  // Update map marker
  const updateMarker = useCallback((d) => {
    if (!d || !markerRef.current) return;
    markerRef.current.setLatLng([d.lat, d.lng]);
    markerRef.current.setPopupContent(
      `<b>Mdm Tan Ah Kow</b><br>Status: <b style="color:${d.status === "Home" ? "#22d3a5" : "#f87171"}">${d.status}</b><br><small>${d.lat?.toFixed(6)}, ${d.lng?.toFixed(6)}</small>`
    );
    trailData.current.push([d.lat, d.lng]);
    if (trailData.current.length > 50) trailData.current.shift();
    if (trailRef.current && mapInstance.current) mapInstance.current.removeLayer(trailRef.current);
    if (trailData.current.length > 1 && mapInstance.current) {
      trailRef.current = L.polyline(trailData.current, { color: "#3b82f6", weight: 2, opacity: 0.4, dashArray: "5 4" }).addTo(mapInstance.current);
    }
  }, []);

  // Polling
  useEffect(() => {
    async function fetchData() {
      const d = await get(`/drawmap/${ELDERLY_ID}`);
      if (d && !d.error) { setStatusData(d); updateMarker(d); }
      const s = await get(`/status/${ELDERLY_ID}`);
      if (s && !s.error) setAddressData(s);
    }

    async function fetchAlerts() {
      const d = await get("/alerts");
      if (Array.isArray(d)) {
        setAlerts(d);
        if (d.length && d[0]._id !== lastAlertId.current) {
          lastAlertId.current = d[0]._id;
          const a = d[0];
          showToast(a.type, a.type === "left" ? "Left Home Zone" : "Returned Home", a.address || "");
        }
      }
      const n = await get("/notifications");
      if (Array.isArray(n)) setAmqpLog(n);
    }

    async function fetchHistory() {
      const d = await get(`/elderlylog/${ELDERLY_ID}?n=60`);
      if (Array.isArray(d)) setHistory(d);
    }

    async function fetchHealth() {
      const endpoints = {
        "GPS Svc": "/gps/health",
        "Log Svc": "/elderlylog/health",
        "Alert Svc": "/alerts/health",
        "Notify Gdn": "/notifications/health",
        "Map Display": "/drawmap/health",
        "Status Svc": "/status/health"
      };
      const results = {};
      await Promise.allSettled(
        Object.entries(endpoints).map(async ([name, url]) => {
          const r = await get(url);
          results[name] = r?.status === "online" ? "online" : "offline";
        })
      );
      setHealth(results);
    }

    async function fetchReplay() {
      const d = await get("/gps/replay/status");
      if (d) setReplayState(d);
    }

    fetchData();
    fetchAlerts();
    fetchHealth();

    const dataTimer = setInterval(fetchData, 5000);
    const alertTimer = setInterval(() => { fetchAlerts(); fetchReplay(); }, 3000);
    const healthTimer = setInterval(fetchHealth, 5000);
    const historyTimer = setInterval(fetchHistory, 8000);

    return () => {
      clearInterval(dataTimer);
      clearInterval(alertTimer);
      clearInterval(healthTimer);
      clearInterval(historyTimer);
    };
  }, [updateMarker, showToast]);

  // Controls
  async function setMode(m) {
    setModeState(m);
    await post("/gps/config", { mode: m, speed });
  }

  async function setSpeed(s) {
    setSpeedState(s);
    await post("/gps/config", { mode, speed: s });
  }

  async function toggleTracking() {
    const next = !running;
    setRunning(next);
    await post(next ? "/gps/start" : "/gps/stop");
  }

  async function move(dLat, dLng) { await post("/gps/devicegps/move", { dLat, dLng }); }
  async function goHome() { await post("/gps/devicegps/home"); }
  async function randomWalk() { await post("/gps/devicegps/random"); }
  async function onDemandFetch() { await post("/gps/devicegps/push"); }

  async function startReplay(scenario) {
    const stepMs = Math.max(800, Math.round(4000 / Math.max(1, speed)));
    const result = await post("/gps/replay/start", { scenario, stepMs });
    if (result?.success) {
      showToast("replay", `Replay: ${scenario}`, `${result.steps} steps`);
      setReplayState({ active: true, scenario, step: 0, total: result.steps, progress: 0 });
    }
  }

  async function stopReplay() {
    await post("/gps/replay/stop");
    setReplayState({ active: false });
  }

  const isHome = statusData?.status === "Home";
  const fmtTime = (ts) => ts ? new Date(ts).toLocaleTimeString("en-SG", { hour12: false }) : "-";

  return (
    <div className="ew-app">
      {/* Toasts */}
      <div className="ew-toast-wrap">
        {toasts.map(t => (
          <div key={t.id} className={`ew-toast ew-toast--${t.type}`} onClick={() => setToasts(prev => prev.filter(x => x.id !== t.id))}>
            <div className="ew-toast-msg">{t.message}</div>
            <div className="ew-toast-sub">{t.sub}</div>
          </div>
        ))}
      </div>

      {/* Header */}
      <div className="ew-header">
        <div className="ew-logo">ElderWatch</div>
        <span className="ew-badge ew-badge--amber">{speed}x</span>
        <span className="ew-badge ew-badge--blue">{mode === "standard" ? "STD 5MIN" : mode === "always-on" ? "ALWAYS ON" : "ON-DEMAND"}</span>
        {replayState.active && <span className="ew-badge ew-badge--purple">REPLAY</span>}
        <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center", fontSize: "0.7rem", fontFamily: "var(--font-mono)", color: "var(--muted-2)" }}>
          {Object.entries(health).map(([name, st]) => (
            <div key={name} style={{ display: "flex", alignItems: "center", gap: 3 }}>
              <div className={`ew-dot ${st === "online" ? "ew-dot--on" : "ew-dot--off"}`} />
              {name}
            </div>
          ))}
        </div>
        <span style={{ fontSize: "0.75rem", fontFamily: "var(--font-mono)", color: running ? "var(--green)" : "var(--muted-2)" }}>
          {running ? "LIVE" : "PAUSED"}
        </span>
      </div>

      <div className="ew-main">
        {/* Left sidebar */}
        <div className="ew-left">
          {/* Tracking mode */}
          <div className="ew-card">
            <div className="ew-card-label">Tracking Mode</div>
            {[["standard", "Standard", "Push every 5 min"], ["always-on", "Always-On", "Push every 2 sec"], ["on-demand", "On-Demand", "Manual trigger only"]].map(([m, name, sub]) => (
              <div key={m} className={`ew-mode-btn ${mode === m ? "ew-mode-btn--active" : ""}`} onClick={() => setMode(m)}>
                <div><div className="ew-mode-name">{name}</div><div className="ew-mode-sub">{sub}</div></div>
              </div>
            ))}
            <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
              <button className={`ew-btn ${running ? "ew-btn--primary" : ""}`} style={{ flex: 1 }} onClick={toggleTracking}>
                {running ? "Pause" : "Start"}
              </button>
              {mode === "on-demand" && (
                <button className="ew-btn ew-btn--primary" style={{ flex: 1 }} onClick={onDemandFetch}>Fetch Now</button>
              )}
            </div>
          </div>

          {/* Speed */}
          <div className="ew-card">
            <div className="ew-card-label">Simulation Speed</div>
            <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: "0.75rem", color: "var(--muted-2)" }}>
              <span>1x</span>
              <input type="range" min="1" max="60" value={speed} onChange={e => setSpeed(+e.target.value)} style={{ flex: 1 }} />
              <span>60x</span>
            </div>
            <div style={{ textAlign: "center", marginTop: 4, fontFamily: "var(--font-mono)", fontSize: "0.8rem", color: "var(--yellow)", fontWeight: 700 }}>{speed}x</div>
          </div>

          {/* D-Pad */}
          <div className="ew-card">
            <div className="ew-card-label">Move Elderly</div>
            <div className="ew-dpad">
              <div /><button className="ew-dpad-btn" onClick={() => move(0.002, 0)}>&#8593;</button><div />
              <button className="ew-dpad-btn" onClick={() => move(0, -0.002)}>&#8592;</button>
              <div className="ew-dpad-btn ew-dpad-btn--center" />
              <button className="ew-dpad-btn" onClick={() => move(0, 0.002)}>&#8594;</button>
              <div /><button className="ew-dpad-btn" onClick={() => move(-0.002, 0)}>&#8595;</button><div />
            </div>
            <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
              <button className="ew-btn" style={{ flex: 1 }} onClick={randomWalk}>Random</button>
              <button className="ew-btn" style={{ flex: 1 }} onClick={goHome}>Home</button>
            </div>
          </div>

          {/* Replay */}
          <div className="ew-card">
            <div className="ew-card-label">Scenario Replay</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <button className="ew-btn ew-btn--purple" onClick={() => startReplay("wander-alert")} disabled={replayState.active}>Wander + Alert</button>
              <button className="ew-btn ew-btn--purple" onClick={() => startReplay("park-walk")} disabled={replayState.active}>Park Walk</button>
              <button className="ew-btn ew-btn--purple" onClick={() => startReplay("hospital-visit")} disabled={replayState.active}>Hospital Visit</button>
              {replayState.active && <button className="ew-btn ew-btn--danger" onClick={stopReplay}>Stop Replay</button>}
            </div>
            {replayState.active && (
              <div style={{ marginTop: 6, fontSize: "0.7rem", color: "var(--muted-2)", fontFamily: "var(--font-mono)" }}>
                {replayState.scenario} — step {replayState.step}/{replayState.total}
                <div className="ew-replay-bar"><div className="ew-replay-fill" style={{ width: `${replayState.progress || 0}%` }} /></div>
              </div>
            )}
          </div>
        </div>

        {/* Map */}
        <div className="ew-center">
          <div ref={mapRef} className="ew-map" />
          <div className="ew-map-badge">
            <div style={{ fontSize: "0.65rem", color: "var(--muted-2)", marginBottom: 3 }}>LIVE MAP</div>
            <div><span style={{ color: "#3b82f6" }}>&#9679;</span> Home boundary (500m)</div>
            <div><span style={{ color: "#f87171" }}>&#9679;</span> Elderly — drag to move</div>
          </div>
        </div>

        {/* Right sidebar */}
        <div className="ew-right">
          {/* Status */}
          <div className="ew-card" style={{ borderColor: statusData ? (isHome ? "rgba(34,211,165,.3)" : "rgba(248,113,113,.3)") : undefined }}>
            <div className="ew-card-label">TRACKING TARGET</div>
            <div style={{ fontWeight: 700, fontFamily: "var(--font-mono)", fontSize: "0.85rem" }}>{ELDERLY_ID}</div>
            <div className={`ew-badge ${isHome ? "ew-badge--green" : statusData ? "ew-badge--red" : "ew-badge--blue"}`} style={{ marginTop: 6 }}>
              {statusData ? (isHome ? "HOME" : "OUTSIDE") : "WAIT"}
            </div>
            <div style={{ textAlign: "center", fontSize: "2.5rem", margin: "8px 0" }}>
              {statusData ? (isHome ? "\u{1f3e0}" : "\u{1f6b6}") : "\u23f3"}
            </div>
            <div style={{ textAlign: "center", fontSize: "0.8rem", color: "var(--muted)" }}>
              {statusData ? (isHome ? "Within safe boundary" : `${statusData.distance}m beyond boundary`) : "Awaiting first GPS ping..."}
            </div>
          </div>

          {/* Map data */}
          <div className="ew-card">
            <div className="ew-card-label">Map Display Data</div>
            <div className="ew-detail-row"><span>Latitude</span><span className="ew-mono">{statusData?.lat?.toFixed(6) ?? "-"}</span></div>
            <div className="ew-detail-row"><span>Longitude</span><span className="ew-mono">{statusData?.lng?.toFixed(6) ?? "-"}</span></div>
            <div className="ew-detail-row"><span>Distance</span><span className="ew-mono">{statusData?.distance != null ? statusData.distance + "m" : "-"}</span></div>
            <div className="ew-detail-row"><span>Boundary</span><span className="ew-mono">500m</span></div>
            <div className="ew-detail-row"><span>Updated</span><span className="ew-mono">{fmtTime(statusData?.timestamp)}</span></div>
          </div>

          {/* Status service data */}
          <div className="ew-card">
            <div className="ew-card-label">Status Service</div>
            <div style={{ fontSize: "0.8rem", color: "var(--muted)", lineHeight: 1.5 }}>{addressData?.address || "Loading..."}</div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 5, fontSize: "0.75rem", fontFamily: "var(--font-mono)" }}>
              <span style={{ color: "var(--cyan)" }}>{addressData?.lastSeenAge || "-"}</span>
              <span style={{ color: addressData?.isSafe ? "var(--green)" : "var(--red)" }}>
                {addressData?.isSafe ? "safe" : addressData ? "outside" : "-"}
              </span>
            </div>
          </div>

          {/* Quick actions */}
          <div className="ew-card">
            <div className="ew-card-label">Quick Actions</div>
            <button className="ew-btn ew-btn--primary" style={{ width: "100%", marginBottom: 4 }} onClick={onDemandFetch}>On-Demand Location Pull</button>
            <button className="ew-btn" style={{ width: "100%", marginBottom: 4 }} onClick={() => alert("Calling Mdm Tan Ah Kow...\n(Simulated)")}>Call Elderly</button>
            <button className="ew-btn ew-btn--danger" style={{ width: "100%" }} onClick={() => alert("Emergency SOS dispatched!\n(Simulated)")}>Emergency SOS</button>
          </div>
        </div>
      </div>

      {/* Bottom panel */}
      <div className="ew-bottom">
        <div className="ew-tabs">
          {[["alerts", "ALERTS"], ["amqp", "AMQP BROKER"], ["history", "COORD LOG"]].map(([key, label]) => (
            <div key={key} className={`ew-tab ${activeTab === key ? "ew-tab--active" : ""}`} onClick={() => setActiveTab(key)}>
              {label}
              {key === "alerts" && alerts.length > 0 && <span className="ew-tab-count">{alerts.length}</span>}
            </div>
          ))}
        </div>
        <div className="ew-tab-content">
          {activeTab === "alerts" && (
            alerts.length === 0 ? (
              <div className="ew-empty">No geofence events yet. Move elderly beyond the 500m boundary to trigger alerts.</div>
            ) : alerts.map((a, i) => (
              <div key={a._id || i} className={`ew-alert-item ${a.type === "left" ? "ew-alert-item--left" : "ew-alert-item--entered"}`}>
                <div style={{ fontSize: "1.1rem" }}>{a.type === "left" ? "\u{1f6a8}" : "\u2705"}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: "0.7rem", fontFamily: "var(--font-mono)", color: a.type === "left" ? "var(--red)" : "var(--green)" }}>
                    {a.type === "left" ? "geofence.left [HOME > OUTSIDE]" : "geofence.entered [OUTSIDE > HOME]"}
                  </div>
                  <div style={{ color: "var(--muted)", marginTop: 2, fontSize: "0.7rem" }}>{a.address || ""} dist: {a.distance}m</div>
                </div>
                <div style={{ fontSize: "0.7rem", color: "var(--muted-2)", fontFamily: "var(--font-mono)", whiteSpace: "nowrap" }}>{fmtTime(a.timestamp)}</div>
              </div>
            ))
          )}
          {activeTab === "amqp" && (
            amqpLog.length === 0 ? (
              <div className="ew-empty">No AMQP events yet.</div>
            ) : amqpLog.map((n, i) => (
              <div key={n._id || i} style={{ fontFamily: "var(--font-mono)", fontSize: "0.7rem", padding: "3px 0", borderBottom: "1px solid rgba(27,45,71,.3)", color: "var(--muted)" }}>
                <span style={{ color: "var(--muted-2)" }}>[{fmtTime(n.sentAt)}]</span>
                <span style={{ color: "var(--cyan)", fontWeight: 700 }}> PUBLISH: {n.routingKey} </span>
                <span>{n.payload?.elderlyId} | {n.payload?.status} | dist:{n.payload?.distance}m</span>
              </div>
            ))
          )}
          {activeTab === "history" && (
            history.length === 0 ? (
              <div className="ew-empty">No coordinate history yet.</div>
            ) : (
              <table className="ew-table">
                <thead><tr><th>Time</th><th>Status</th><th>Lat</th><th>Lng</th><th>Dist</th><th>Address</th></tr></thead>
                <tbody>
                  {history.map((e, i) => (
                    <tr key={e._id || i}>
                      <td>{fmtTime(e.timestamp)}</td>
                      <td style={{ color: e.status === "Home" ? "var(--green)" : "var(--red)", fontWeight: 700 }}>{e.status}</td>
                      <td>{e.lat?.toFixed(6)}</td>
                      <td>{e.lng?.toFixed(6)}</td>
                      <td>{e.distance}m</td>
                      <td style={{ maxWidth: 170, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.address || ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          )}
        </div>
      </div>
    </div>
  );
}
