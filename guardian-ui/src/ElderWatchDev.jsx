import { useEffect, useRef, useState, useCallback } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import AlertPopup from "./AlertPopup";
import { connectToAlerts } from "./socket";
import { useAuth } from "./AuthContext";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000";

const DEFAULT_HOME = { lat: 1.35305, lng: 103.94402 };
const DEFAULT_RADIUS = 500;

const NGROK_H = { "ngrok-skip-browser-warning": "1" };

async function get(url) {
  try {
    const r = await fetch(`${API_BASE}${url}`, { headers: NGROK_H, signal: AbortSignal.timeout(6000) });
    return r.ok ? r.json() : null;
  } catch { return null; }
}

async function post(url, body = {}) {
  try {
    const r = await fetch(`${API_BASE}${url}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...NGROK_H },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000)
    });
    return r.json();
  } catch { return null; }
}

export default function ElderWatchDev() {
  const { user } = useAuth();
  const ELDERLY_ID = user?.elderlyId;
  const guardianLabel = user?.name || `Guardian #${user?.guardianId || "—"}`;
  const elderlyLabel = `Elderly #${ELDERLY_ID}`;
  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const markerRef = useRef(null);
  const trailRef = useRef(null);
  const trailData = useRef([]);
  const homeMarkerRef = useRef(null);
  const homeCircleRef = useRef(null);

  const [home, setHomeRaw] = useState(() => {
    try { const s = JSON.parse(localStorage.getItem("ew_home")); if (s?.lat && s?.lng) return s; } catch {} return DEFAULT_HOME;
  });
  const [radius, setRadiusRaw] = useState(() => {
    const s = parseInt(localStorage.getItem("ew_radius"), 10); return s >= 10 ? s : DEFAULT_RADIUS;
  });

  // Persist to localStorage and sync home/radius to backend so the status
  // service always evaluates "isSafe" against the guardian-configured location.
  const setHome = (v) => { setHomeRaw(v); localStorage.setItem("ew_home", JSON.stringify(v)); };
  const setRadius = (v) => { setRadiusRaw(v); localStorage.setItem("ew_radius", String(v)); };

  const [editingHome, setEditingHome] = useState(false);
  const [homeDraft, setHomeDraft] = useState({ lat: String(home.lat), lng: String(home.lng), radius: String(radius), postal: "" });
  const [postalLooking, setPostalLooking] = useState(false);
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
  const [popupAlert, setPopupAlert] = useState(null);
  const lastAlertId = useRef(null);

  // Toast helper
  const showToast = useCallback((type, message, sub) => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, type, message, sub }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 7000);
  }, []);

  // Sync the stored home/radius to the backend on first mount so the status
  // service reflects any home previously saved by the guardian.
  useEffect(() => {
    post("/gps/config", {
      home: { lat: home.lat, lng: home.lng },
      radius,
      elderlyId: ELDERLY_ID,
      guardianId: user?.guardianId,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally runs once on mount

  // Init map
  useEffect(() => {
    if (mapInstance.current) return;
    const map = L.map(mapRef.current, { zoomControl: false }).setView([DEFAULT_HOME.lat, DEFAULT_HOME.lng], 16);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap"
    }).addTo(map);
    L.control.zoom({ position: "bottomright" }).addTo(map);

    const homeIcon = L.divIcon({
      html: `<div style="background:#fff;border:2px solid #2d7a50;border-radius:8px;width:26px;height:26px;display:flex;align-items:center;justify-content:center;font-size:13px;box-shadow:0 2px 8px rgba(45,122,80,.25)">&#x1f475;</div>`,
      iconSize: [24, 24], iconAnchor: [12, 12], className: ""
    });
    homeMarkerRef.current = L.marker([DEFAULT_HOME.lat, DEFAULT_HOME.lng], { icon: homeIcon }).addTo(map).bindPopup(`<b>Home Base</b><br>Boundary: ${DEFAULT_RADIUS}m`);
    homeCircleRef.current = L.circle([DEFAULT_HOME.lat, DEFAULT_HOME.lng], {
      radius: DEFAULT_RADIUS, color: "#2d7a50", fillColor: "#2d7a50",
      fillOpacity: 0.06, weight: 1.5, dashArray: "6 4"
    }).addTo(map);

    const elIcon = L.divIcon({
      html: `<div style="background:#d45a5a;border:3px solid #fff;border-radius:50%;width:18px;height:18px;box-shadow:0 0 0 3px rgba(212,90,90,.25),0 2px 6px rgba(0,0,0,.15)"></div>`,
      iconSize: [18, 18], iconAnchor: [9, 9], className: ""
    });
    const marker = L.marker([DEFAULT_HOME.lat, DEFAULT_HOME.lng], { icon: elIcon, draggable: true, title: elderlyLabel });
    marker.addTo(map).bindPopup(`<b>${elderlyLabel}</b>`);
    marker.on("dragend", async (e) => {
      const { lat, lng } = e.target.getLatLng();
      await post("/gps/devicegps/position", { lat, lng });
    });

    markerRef.current = marker;
    mapInstance.current = map;

    return () => { map.remove(); mapInstance.current = null; };
  }, []);

  // Update home marker and circle when home/radius changes
  useEffect(() => {
    if (homeMarkerRef.current) {
      homeMarkerRef.current.setLatLng([home.lat, home.lng]);
      homeMarkerRef.current.setPopupContent(`<b>Home Base</b><br>Boundary: ${radius}m`);
    }
    if (homeCircleRef.current) {
      homeCircleRef.current.setLatLng([home.lat, home.lng]);
      homeCircleRef.current.setRadius(radius);
    }
    if (mapInstance.current) {
      mapInstance.current.panTo([home.lat, home.lng]);
    }
  }, [home, radius]);

  // Update map marker
  const updateMarker = useCallback((d) => {
    if (!d || !markerRef.current) return;
    markerRef.current.setLatLng([d.lat, d.lng]);
    markerRef.current.setPopupContent(
      `<b>${elderlyLabel}</b><br>Status: <b style="color:${d.status === "Home" ? "#22d3a5" : "#f87171"}">${d.status}</b><br><small>${d.lat?.toFixed(6)}, ${d.lng?.toFixed(6)}</small>`
    );
    trailData.current.push([d.lat, d.lng]);
    if (trailData.current.length > 50) trailData.current.shift();
    if (trailRef.current && mapInstance.current) mapInstance.current.removeLayer(trailRef.current);
    if (trailData.current.length > 1 && mapInstance.current) {
      trailRef.current = L.polyline(trailData.current, { color: "#3b82f6", weight: 2, opacity: 0.4, dashArray: "5 4" }).addTo(mapInstance.current);
    }
  }, []);

  // Sync elderly ID to backend GPS simulation on mount
  useEffect(() => {
    post("/gps/config", { elderlyId: ELDERLY_ID, guardianId: user?.guardianId });
  }, [ELDERLY_ID]);

  // Fetch coordinate history
  const fetchHistory = useCallback(async () => {
    const d = await get(`/elderlylog/${ELDERLY_ID}?n=60`);
    if (Array.isArray(d)) setHistory(d);
  }, [ELDERLY_ID]);

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
    fetchHistory();

    const dataTimer = setInterval(fetchData, 5000);
    const alertTimer = setInterval(() => { fetchAlerts(); fetchReplay(); }, 3000);
    const healthTimer = setInterval(fetchHealth, 5000);
    const historyTimer = setInterval(fetchHistory, 5000);

    return () => {
      clearInterval(dataTimer);
      clearInterval(alertTimer);
      clearInterval(healthTimer);
      clearInterval(historyTimer);
    };
  }, [updateMarker, showToast, fetchHistory]);

  // WebSocket listener for fall detection alerts
  useEffect(() => {
    const ws = connectToAlerts({
      onMessage: (message) => {
        if (message.type === "drop_alert") {
          const alertData = message.data || message.incident || {};
          setPopupAlert({
            source: "guardian",
            elderlyId: alertData.elderlyId || "—",
            score: alertData.score,
            severity: alertData.severity,
            message: alertData.message,
            timestamp: new Date().toISOString()
          });
        }
      }
    });
    return () => ws.close();
  }, []);

  // Controls
  async function setMode(m) {
    setModeState(m);
    await post("/gps/config", { mode: m, speed, elderlyId: ELDERLY_ID });
    await fetchHistory();
  }

  async function setSpeed(s) {
    setSpeedState(s);
    await post("/gps/config", { mode, speed: s, elderlyId: ELDERLY_ID });
  }

  async function toggleTracking() {
    const next = !running;
    setRunning(next);
    await post(next ? "/gps/start" : "/gps/stop");
    if (next) await fetchHistory();
  }

  async function move(dLat, dLng) { await post("/gps/devicegps/move", { dLat, dLng }); await fetchHistory(); }
  async function goHome() { await post("/gps/devicegps/home"); await fetchHistory(); }
  async function randomWalk() { await post("/gps/devicegps/random"); await fetchHistory(); }
  async function onDemandFetch() { await post("/gps/devicegps/push"); await fetchHistory(); }

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

  // Save home — persists locally, updates map, and syncs to backend
  function handleSaveHome() {
    const lat = parseFloat(homeDraft.lat);
    const lng = parseFloat(homeDraft.lng);
    const r = parseInt(homeDraft.radius, 10);
    if (!isNaN(lat) && !isNaN(lng) && !isNaN(r) && r >= 10) {
      setHome({ lat, lng });
      setRadius(r);
      setEditingHome(false);
      // Push the updated home location and radius to the backend so the status
      // service computes isSafe and distance against the correct home.
      post("/gps/config", {
        home: { lat, lng },
        radius: r,
        elderlyId: ELDERLY_ID,
        guardianId: user?.guardianId,
      });
      showToast("info", "Home Updated", `${lat.toFixed(5)}, ${lng.toFixed(5)} — ${r}m`);
    }
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
        <div className="ew-logo">ElderWatch (Dev)</div>
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
            <div><span style={{ color: "#2d7a50" }}>&#9679;</span> Home boundary ({radius}m)</div>
            <div><span style={{ color: "#d45a5a" }}>&#9679;</span> Elderly — drag to move</div>
          </div>
        </div>

        {/* Right sidebar */}
        <div className="ew-right">
          {/* Status */}
          <div className="ew-card" style={{ borderColor: statusData ? (isHome ? "rgba(45,122,80,.3)" : "rgba(212,90,90,.3)") : undefined }}>
            <div className="ew-card-label">TRACKING TARGET</div>
            <div style={{ fontWeight: 700, fontFamily: "var(--font-mono)", fontSize: "0.85rem" }}>{elderlyLabel}</div>
            <div style={{ fontSize: "0.7rem", color: "var(--muted-2)", marginBottom: 4 }}>Guardian: {guardianLabel}</div>
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

          {/* Home Settings */}
          <div className="ew-card">
            <div className="ew-card-label">HOME LOCATION</div>
            {editingHome ? (
              <>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: "0.75rem" }}>
                  <label style={{ color: "var(--muted)" }}>
                    Postal Code
                    <div style={{ display: "flex", gap: 4, marginTop: 2, minWidth: 0 }}>
                      <input
                        type="text"
                        placeholder="e.g. 530123"
                        value={homeDraft.postal}
                        onChange={e => setHomeDraft(d => ({ ...d, postal: e.target.value.replace(/\D/g, "").slice(0, 6) }))}
                        style={{ flex: 1, minWidth: 0, padding: "4px 6px", background: "var(--panel-soft, #1a1a2e)", border: "1px solid var(--border)", borderRadius: 4, color: "var(--text)", fontFamily: "var(--font-mono)", fontSize: "0.75rem" }}
                      />
                      <button
                        type="button"
                        className="ew-btn ew-btn--primary"
                        disabled={homeDraft.postal.length !== 6 || postalLooking}
                        style={{ fontSize: "0.7rem", padding: "4px 8px", flexShrink: 0, whiteSpace: "nowrap" }}
                        onClick={async () => {
                          setPostalLooking(true);
                          try {
                            const r = await fetch(
                              `https://www.onemap.gov.sg/api/common/elastic/search?searchVal=${homeDraft.postal}&returnGeom=Y&getAddrDetails=Y`,
                              { signal: AbortSignal.timeout(6000) }
                            );
                            const data = await r.json();
                            if (data.results?.length > 0) {
                              const res = data.results[0];
                              // Populate lat/lng from postal lookup so the user can review before saving
                              setHomeDraft(d => ({
                                ...d,
                                lat: String(res.LATITUDE),
                                lng: String(res.LONGITUDE),
                              }));
                              showToast("info", "Address Found", res.ADDRESS || res.SEARCHVAL);
                            } else {
                              showToast("left", "Not Found", "No results for this postal code");
                            }
                          } catch { showToast("left", "Lookup Failed", "Could not reach OneMap"); }
                          setPostalLooking(false);
                        }}
                      >
                        {postalLooking ? "..." : "Lookup"}
                      </button>
                    </div>
                  </label>
                  <label style={{ color: "var(--muted)" }}>
                    Latitude
                    <input type="number" step="any" value={homeDraft.lat} onChange={e => setHomeDraft(d => ({ ...d, lat: e.target.value }))}
                      style={{ width: "100%", marginTop: 2, padding: "4px 6px", background: "var(--panel-soft, #1a1a2e)", border: "1px solid var(--border)", borderRadius: 4, color: "var(--text)", fontFamily: "var(--font-mono)", fontSize: "0.75rem" }} />
                  </label>
                  <label style={{ color: "var(--muted)" }}>
                    Longitude
                    <input type="number" step="any" value={homeDraft.lng} onChange={e => setHomeDraft(d => ({ ...d, lng: e.target.value }))}
                      style={{ width: "100%", marginTop: 2, padding: "4px 6px", background: "var(--panel-soft, #1a1a2e)", border: "1px solid var(--border)", borderRadius: 4, color: "var(--text)", fontFamily: "var(--font-mono)", fontSize: "0.75rem" }} />
                  </label>
                  <label style={{ color: "var(--muted)" }}>
                    Radius (m)
                    <input type="number" min="10" max="5000" value={homeDraft.radius} onChange={e => setHomeDraft(d => ({ ...d, radius: e.target.value }))}
                      style={{ width: "100%", marginTop: 2, padding: "4px 6px", background: "var(--panel-soft, #1a1a2e)", border: "1px solid var(--border)", borderRadius: 4, color: "var(--text)", fontFamily: "var(--font-mono)", fontSize: "0.75rem" }} />
                  </label>
                </div>
                <div style={{ display: "flex", gap: 4, marginTop: 8 }}>
                  <button className="ew-btn ew-btn--primary" style={{ flex: 1 }} onClick={handleSaveHome}>Save</button>
                  <button className="ew-btn" style={{ flex: 1 }} onClick={() => {
                    setHomeDraft({ lat: String(home.lat), lng: String(home.lng), radius: String(radius), postal: "" });
                    setEditingHome(false);
                  }}>Cancel</button>
                </div>
              </>
            ) : (
              <>
                <div style={{ fontSize: "0.75rem", fontFamily: "var(--font-mono)", color: "var(--muted)", lineHeight: 1.6 }}>
                  <div>Lat: {home.lat.toFixed(5)}</div>
                  <div>Lng: {home.lng.toFixed(5)}</div>
                  <div>Radius: {radius}m</div>
                </div>
                <button className="ew-btn" style={{ width: "100%", marginTop: 6 }} onClick={() => {
                  setHomeDraft({ lat: String(home.lat), lng: String(home.lng), radius: String(radius), postal: "" });
                  setEditingHome(true);
                }}>Edit Home</button>
              </>
            )}
          </div>

          {/* Map data */}
          <div className="ew-card">
            <div className="ew-card-label">Map Display Data</div>
            <div className="ew-detail-row"><span>Latitude</span><span className="ew-mono">{statusData?.lat?.toFixed(6) ?? "-"}</span></div>
            <div className="ew-detail-row"><span>Longitude</span><span className="ew-mono">{statusData?.lng?.toFixed(6) ?? "-"}</span></div>
            <div className="ew-detail-row"><span>Distance</span><span className="ew-mono">{statusData?.distance != null ? statusData.distance + "m" : "-"}</span></div>
            <div className="ew-detail-row"><span>Boundary</span><span className="ew-mono">{radius}m</span></div>
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
            <button className="ew-btn" style={{ width: "100%", marginBottom: 4 }} onClick={() => alert(`Calling ${elderlyLabel}...\n(Simulated)`)}>Call Elderly</button>
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
              <div className="ew-empty">No geofence events yet. Move elderly beyond the {radius}m boundary to trigger alerts.</div>
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
              <div key={n._id || i} style={{ fontFamily: "var(--font-mono)", fontSize: "0.7rem", padding: "3px 0", borderBottom: "1px solid var(--border)", color: "var(--muted)" }}>
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

      <AlertPopup alert={popupAlert} onDismiss={() => setPopupAlert(null)} />
    </div>
  );
}