import { useEffect, useRef, useState, useCallback } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import AlertPopup from "./AlertPopup";
import { connectToAlerts } from "./socket";
import { useAuth } from "./AuthContext";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000";
const HOME = { lat: 1.35305, lng: 103.94402 };

const TRACKING_MODES = [
  { id: "standard", name: "Standard", desc: "Updates every 5 min", interval: 300000 },
  { id: "always-on", name: "Always-On", desc: "Updates every 2 sec", interval: 2000 },
  { id: "on-demand", name: "On-Demand", desc: "Manual refresh only", interval: null }
];

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
  const { user } = useAuth();
  const ELDERLY_ID = user?.elderlyId;
  const guardianLabel = user?.name || `Guardian #${user?.guardianId || "—"}`;
  const elderlyLabel = `Elderly #${ELDERLY_ID}`;
  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const markerRef = useRef(null);
  const trailRef = useRef(null);
  const trailData = useRef([]);
  const simPos = useRef({ lat: HOME.lat, lng: HOME.lng });

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
    const map = L.map(mapRef.current, { zoomControl: false }).setView([HOME.lat, HOME.lng], 16);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap"
    }).addTo(map);
    L.control.zoom({ position: "bottomright" }).addTo(map);

    const homeIcon = L.divIcon({
      html: `<div style="background:#fff;border:2px solid #2d7a50;border-radius:8px;width:26px;height:26px;display:flex;align-items:center;justify-content:center;font-size:13px;box-shadow:0 2px 8px rgba(45,122,80,.25)">&#x1f475;</div>`,
      iconSize: [24, 24], iconAnchor: [12, 12], className: ""
    });
    L.marker([HOME.lat, HOME.lng], { icon: homeIcon }).addTo(map).bindPopup("<b>Home</b>");
    L.circle([HOME.lat, HOME.lng], {
      radius: 500, color: "#2d7a50", fillColor: "#2d7a50",
      fillOpacity: 0.06, weight: 1.5, dashArray: "6 4"
    }).addTo(map);

    const elIcon = L.divIcon({
      html: `<div style="background:#d45a5a;border:3px solid #fff;border-radius:50%;width:18px;height:18px;box-shadow:0 0 0 3px rgba(212,90,90,.25),0 2px 6px rgba(0,0,0,.15)"></div>`,
      iconSize: [18, 18], iconAnchor: [9, 9], className: ""
    });
    const marker = L.marker([HOME.lat, HOME.lng], { icon: elIcon, draggable: false, title: elderlyLabel });
    marker.addTo(map).bindPopup(`<b>${elderlyLabel}</b>`);

    markerRef.current = marker;
    mapInstance.current = map;

    return () => { map.remove(); mapInstance.current = null; };
  }, []);

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
        // Only toast if there's a genuinely new alert
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

  // Simulated GPS tracking — gentle random walk near home
  useEffect(() => {
    const currentMode = TRACKING_MODES.find(m => m.id === mode);
    if (!currentMode?.interval) return; // on-demand = no auto updates

    const interval = setInterval(() => {
      const pos = simPos.current;
      const dLat = (Math.random() - 0.48) * 0.0004;
      const dLng = (Math.random() - 0.48) * 0.0004;
      let newLat = pos.lat + dLat;
      let newLng = pos.lng + dLng;

      const dist = haversine(HOME.lat, HOME.lng, newLat, newLng);
      if (dist > 350) {
        newLat += (HOME.lat - newLat) * 0.15;
        newLng += (HOME.lng - newLng) * 0.15;
      }

      simPos.current = { lat: newLat, lng: newLng };
      const currentDist = Math.round(haversine(HOME.lat, HOME.lng, newLat, newLng));
      const isHome = currentDist <= 500;
      const prevStatus = statusText;

      setStatusText(isHome ? "Home" : "Outside");
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

      if (prevStatus === "Home" && !isHome) {
        const alert = { id: Date.now(), type: "left", time: new Date().toISOString(), distance: currentDist };
        setAlerts(prev => [alert, ...prev].slice(0, 20));
        showToast("left", "Left Home Zone", `${currentDist}m from home`);
      } else if (prevStatus === "Outside" && isHome) {
        const alert = { id: Date.now(), type: "entered", time: new Date().toISOString(), distance: currentDist };
        setAlerts(prev => [alert, ...prev].slice(0, 20));
        showToast("entered", "Returned Home", "Back within safe zone");
      }
    }, Math.min(currentMode.interval, 3000)); // cap at 3s for simulation smoothness

    return () => clearInterval(interval);
  }, [mode, statusText, showToast]);

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
      simPos.current = { lat: d.lat, lng: d.lng };
      setStatusText(d.status === "Home" ? "Home" : "Outside");
      setDistance(d.distance || 0);
      setLastUpdate(new Date().toISOString());
    }
    await fetchStatus();
    showToast("info", "Location Updated", "On-demand fetch complete");
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
        {/* Map — takes up left + center area */}
        <div className="ew-center" style={{ flex: 1 }}>
          <div ref={mapRef} className="ew-map" />
          <div className="ew-map-badge">
            <div style={{ fontSize: "0.65rem", color: "var(--muted-2)", marginBottom: 3 }}>LIVE TRACKING</div>
            <div><span style={{ color: "#2d7a50" }}>&#9679;</span> Home zone (500m)</div>
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
