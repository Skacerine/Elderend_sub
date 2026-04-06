import { useEffect, useRef, useState, useCallback } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import AlertPopup from "./AlertPopup";
import { connectToAlerts } from "./socket";
import { useAuth } from "./AuthContext";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000";
const DEFAULT_HOME = { lat: 1.35305, lng: 103.94402 };
const DEFAULT_RADIUS = 500;

const TRACKING_MODES = [
  { id: "standard", name: "Standard", desc: "Updates every 5 min", interval: 300000 },
  { id: "always-on", name: "Always-On", desc: "Updates every 2 sec", interval: 2000 },
  { id: "on-demand", name: "On-Demand", desc: "Manual refresh only", interval: null }
];

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

export default function ElderWatch() {
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

  const lastPos = useRef({ lat: home.lat, lng: home.lng });

  const [editingHome, setEditingHome] = useState(false);
  const [homeDraft, setHomeDraft] = useState({ lat: String(home.lat), lng: String(home.lng), radius: String(radius), postal: "" });
  const [postalLooking, setPostalLooking] = useState(false);
  const [mode, setMode] = useState("standard");
  const [statusText, setStatusText] = useState("Home");
  const [distance, setDistance] = useState(0);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [addressData, setAddressData] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [toasts, setToasts] = useState([]);
  const [popupAlert, setPopupAlert] = useState(null);

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

  // Haversine distance in meters
  function haversine(lat1, lng1, lat2, lng2) {
    const R = 6371000;
    const toRad = (d) => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

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
    homeMarkerRef.current = L.marker([DEFAULT_HOME.lat, DEFAULT_HOME.lng], { icon: homeIcon }).addTo(map).bindPopup("<b>Home</b>");
    homeCircleRef.current = L.circle([DEFAULT_HOME.lat, DEFAULT_HOME.lng], {
      radius: DEFAULT_RADIUS, color: "#2d7a50", fillColor: "#2d7a50",
      fillOpacity: 0.06, weight: 1.5, dashArray: "6 4"
    }).addTo(map);

    const elIcon = L.divIcon({
      html: `<div style="background:#d45a5a;border:3px solid #fff;border-radius:50%;width:18px;height:18px;box-shadow:0 0 0 3px rgba(212,90,90,.25),0 2px 6px rgba(0,0,0,.15)"></div>`,
      iconSize: [18, 18], iconAnchor: [9, 9], className: ""
    });
    const marker = L.marker([DEFAULT_HOME.lat, DEFAULT_HOME.lng], { icon: elIcon, draggable: false, title: elderlyLabel });
    marker.addTo(map).bindPopup(`<b>${elderlyLabel}</b>`);

    markerRef.current = marker;
    mapInstance.current = map;

    return () => { map.remove(); mapInstance.current = null; };
  }, []);

  // Update home marker and circle when home/radius changes
  useEffect(() => {
    if (homeMarkerRef.current) {
      homeMarkerRef.current.setLatLng([home.lat, home.lng]);
    }
    if (homeCircleRef.current) {
      homeCircleRef.current.setLatLng([home.lat, home.lng]);
      homeCircleRef.current.setRadius(radius);
    }
    if (mapInstance.current) {
      mapInstance.current.panTo([home.lat, home.lng]);
    }
  }, [home, radius]);

  // Fetch status service data
  const fetchStatus = useCallback(async () => {
    const s = await get(`/status/${ELDERLY_ID}`);
    if (s && !s.error) setAddressData(s);
  }, [ELDERLY_ID]);

  // Fetch alerts from backend
  const fetchAlerts = useCallback(async () => {
    const d = await get("/alerts");
    if (Array.isArray(d) && d.length > 0) {
      setAlerts(prev => {
        if (d[0]._id && (!prev.length || d[0]._id !== prev[0]?._id)) {
          const a = d[0];
          showToast(a.type, a.type === "left" ? "Left Home Zone" : "Returned Home", a.address || "");
        }
        return d;
      });
    }
  }, [showToast]);

  // Sync config to backend when mode changes
  useEffect(() => {
    post("/gps/config", { mode, elderlyId: ELDERLY_ID, guardianId: user?.guardianId });
  }, [mode, ELDERLY_ID]);

  // Poll real GPS position from backend
  useEffect(() => {
    const currentMode = TRACKING_MODES.find(m => m.id === mode);
    if (!currentMode?.interval) return;

    async function pollPosition() {
      const data = await get("/gps/realgps");
      if (!data || typeof data.lat !== "number") return;

      const newLat = data.lat;
      const newLng = data.lng;
      lastPos.current = { lat: newLat, lng: newLng };

      const currentDist = Math.round(haversine(home.lat, home.lng, newLat, newLng));
      const isHome = currentDist <= radius;

      setStatusText(prev => {
        const prevStatus = prev;

        if (prevStatus === "Home" && !isHome) {
          const alert = { id: Date.now(), type: "left", time: new Date().toISOString(), distance: currentDist };
          setAlerts(a => [alert, ...a].slice(0, 20));
          showToast("left", "Left Home Zone", `${currentDist}m from home`);
        } else if (prevStatus === "Outside" && isHome) {
          const alert = { id: Date.now(), type: "entered", time: new Date().toISOString(), distance: currentDist };
          setAlerts(a => [alert, ...a].slice(0, 20));
          showToast("entered", "Returned Home", "Back within safe zone");
        }

        return isHome ? "Home" : "Outside";
      });
      setDistance(currentDist);
      setLastUpdate(new Date().toISOString());

      if (markerRef.current) {
        markerRef.current.setLatLng([newLat, newLng]);
        markerRef.current.setPopupContent(
          `<b>${elderlyLabel}</b><br>Status: <b style="color:${isHome ? "#22d3a5" : "#f87171"}">${isHome ? "Home" : "Outside"}</b>`
        );
      }

      trailData.current.push([newLat, newLng]);
      if (trailData.current.length > 50) trailData.current.shift();
      if (trailRef.current && mapInstance.current) mapInstance.current.removeLayer(trailRef.current);
      if (trailData.current.length > 1 && mapInstance.current) {
        trailRef.current = L.polyline(trailData.current, { color: "#3b82f6", weight: 2, opacity: 0.4, dashArray: "5 4" }).addTo(mapInstance.current);
      }
    }

    pollPosition();
    const interval = setInterval(pollPosition, Math.min(currentMode.interval, 3000));
    return () => clearInterval(interval);
  }, [mode, showToast, home, radius]);

  // Poll status service + alerts
  useEffect(() => {
    fetchStatus();
    fetchAlerts();
    const t1 = setInterval(fetchStatus, 10000);
    const t2 = setInterval(fetchAlerts, 5000);
    return () => { clearInterval(t1); clearInterval(t2); };
  }, [fetchStatus, fetchAlerts]);

  // WebSocket listener for fall detection alerts
  useEffect(() => {
    const ws = connectToAlerts({
      onMessage: (message) => {
        if (message.type === "drop_alert") {
          const alertData = message.data || message.incident || {};
          if (String(alertData.elderlyId) !== String(ELDERLY_ID)) return;
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

  // On-demand fetch
  async function handleOnDemandFetch() {
    await post("/gps/devicegps/push");
    const d = await get(`/drawmap/${ELDERLY_ID}`);
    if (d && !d.error && markerRef.current) {
      markerRef.current.setLatLng([d.lat, d.lng]);
      lastPos.current = { lat: d.lat, lng: d.lng };
      setStatusText(d.status === "Home" ? "Home" : "Outside");
      setDistance(d.distance || 0);
      setLastUpdate(new Date().toISOString());
    }
    await fetchStatus();
    showToast("info", "Location Updated", "On-demand fetch complete");
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

  const isHome = statusText === "Home";
  const fmtTime = (ts) => ts ? new Date(ts).toLocaleTimeString("en-SG", { hour12: false }) : "-";
  const currentMode = TRACKING_MODES.find(m => m.id === mode);

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
        <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
          <span className="ew-badge ew-badge--blue">{currentMode?.name || "Standard"}</span>
          <span className={`ew-badge ${isHome ? "ew-badge--green" : "ew-badge--red"}`}>
            {isHome ? "HOME" : "OUTSIDE"}
          </span>
          <span style={{ fontSize: "0.75rem", fontFamily: "var(--font-mono)", color: "var(--green)" }}>
            LIVE
          </span>
        </div>
      </div>

      <div className="ew-main">
        {/* Map */}
        <div className="ew-center" style={{ flex: 1 }}>
          <div ref={mapRef} className="ew-map" />
          <div className="ew-map-badge">
            <div style={{ fontSize: "0.65rem", color: "var(--muted-2)", marginBottom: 3 }}>LIVE TRACKING</div>
            <div><span style={{ color: "#2d7a50" }}>&#9679;</span> Home zone ({radius}m)</div>
            <div><span style={{ color: "#d45a5a" }}>&#9679;</span> {elderlyLabel}</div>
          </div>
        </div>

        {/* Right sidebar */}
        <div className="ew-right">
          {/* Status */}
          <div className="ew-card" style={{ borderColor: isHome ? "rgba(45,122,80,.3)" : "rgba(212,90,90,.3)" }}>
            <div className="ew-card-label">TRACKING</div>
            <div style={{ fontWeight: 700, fontSize: "0.85rem" }}>{elderlyLabel}</div>
            <div style={{ fontSize: "0.7rem", color: "var(--muted-2)", marginBottom: 4 }}>Guardian: {guardianLabel}</div>
            <div className={`ew-badge ${isHome ? "ew-badge--green" : "ew-badge--red"}`} style={{ marginTop: 6 }}>
              {isHome ? "HOME" : "OUTSIDE"}
            </div>
            <div style={{ textAlign: "center", fontSize: "2.5rem", margin: "8px 0" }}>
              {isHome ? "\u{1f3e0}" : "\u{1f6b6}"}
            </div>
            <div style={{ textAlign: "center", fontSize: "0.8rem", color: "var(--muted)" }}>
              {isHome ? "Within safe zone" : `${distance}m from home`}
            </div>
            {lastUpdate && (
              <div style={{ textAlign: "center", fontSize: "0.65rem", color: "var(--muted-2)", marginTop: 4 }}>
                Last update: {fmtTime(lastUpdate)}
              </div>
            )}
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

          {/* Status Service */}
          <div className="ew-card">
            <div className="ew-card-label">STATUS SERVICE</div>
            <div style={{ fontSize: "0.8rem", color: "var(--muted)", lineHeight: 1.5, marginBottom: 6 }}>
              {addressData?.address || "Fetching location..."}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", fontFamily: "var(--font-mono)" }}>
              <span style={{ color: "var(--cyan)" }}>{addressData?.lastSeenAge || "-"}</span>
              <span style={{ color: addressData?.isSafe ? "var(--green)" : addressData ? "var(--red)" : "var(--muted-2)" }}>
                {addressData?.isSafe ? "Safe" : addressData ? "Outside zone" : "-"}
              </span>
            </div>
            {addressData?.distanceLabel && (
              <div style={{ fontSize: "0.7rem", color: "var(--muted-2)", marginTop: 4 }}>
                Distance: {addressData.distanceLabel}
              </div>
            )}
          </div>

          {/* Tracking Mode */}
          <div className="ew-card">
            <div className="ew-card-label">TRACKING MODE</div>
            {TRACKING_MODES.map(m => (
              <div key={m.id} className={`ew-mode-btn ${mode === m.id ? "ew-mode-btn--active" : ""}`} onClick={() => setMode(m.id)}>
                <div>
                  <div className="ew-mode-name">{m.name}</div>
                  <div className="ew-mode-sub">{m.desc}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Quick actions */}
          <div className="ew-card">
            <div className="ew-card-label">QUICK ACTIONS</div>
            {mode === "on-demand" && (
              <button className="ew-btn ew-btn--primary" style={{ width: "100%", marginBottom: 4 }} onClick={handleOnDemandFetch}>
                Fetch Location Now
              </button>
            )}
            <button className="ew-btn" style={{ width: "100%", marginBottom: 4 }} onClick={() => alert(`Calling ${elderlyLabel}...\n(Simulated)`)}>
              Call Elderly
            </button>
            <button className="ew-btn ew-btn--danger" style={{ width: "100%" }} onClick={() => alert("Emergency SOS dispatched!\n(Simulated)")}>
              Emergency SOS
            </button>
          </div>

          {/* Recent alerts */}
          <div className="ew-card" style={{ flex: 1, minHeight: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
            <div className="ew-card-label">RECENT ALERTS {alerts.length > 0 && <span className="ew-tab-count">{alerts.length}</span>}</div>
            <div style={{ flex: 1, overflowY: "auto" }}>
              {alerts.length === 0 ? (
                <div style={{ fontSize: "0.75rem", color: "var(--muted-2)", padding: "8px 0" }}>
                  No alerts yet. You'll be notified if they leave the safe zone.
                </div>
              ) : alerts.slice(0, 20).map((a, i) => (
                <div key={a.id || a._id || i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0", borderBottom: "1px solid var(--border)" }}>
                  <div style={{ fontSize: "1rem" }}>{a.type === "left" ? "\u{1f6a8}" : "\u2705"}</div>
                  <div style={{ flex: 1, fontSize: "0.7rem" }}>
                    <div style={{ fontWeight: 700, color: a.type === "left" ? "var(--red)" : "var(--green)" }}>
                      {a.type === "left" ? "Left home zone" : "Returned home"}
                    </div>
                    <div style={{ color: "var(--muted-2)" }}>{fmtTime(a.time || a.timestamp)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <AlertPopup alert={popupAlert} onDismiss={() => setPopupAlert(null)} />
    </div>
  );
}