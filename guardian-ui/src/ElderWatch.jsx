import { useEffect, useRef, useState, useCallback } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import AlertPopup from "./AlertPopup";
import { connectToAlerts } from "./socket";
import { useAuth } from "./AuthContext";

const HOME = { lat: 1.35305, lng: 103.94402 };

export default function ElderWatch() {
  const { user } = useAuth();
  const ELDERLY_ID = user?.elderlyId || 1;
  const guardianLabel = user?.name || `Guardian #${user?.guardianId || "—"}`;
  const elderlyLabel = `Elderly #${ELDERLY_ID}`;
  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const markerRef = useRef(null);
  const trailRef = useRef(null);
  const trailData = useRef([]);
  const simPos = useRef({ lat: HOME.lat, lng: HOME.lng });

  const [statusText, setStatusText] = useState("Home");
  const [distance, setDistance] = useState(0);
  const [lastUpdate, setLastUpdate] = useState(null);
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

  // Simulated GPS tracking — gentle random walk near home
  useEffect(() => {
    const interval = setInterval(() => {
      const pos = simPos.current;
      // Small random drift to simulate real GPS movement
      const dLat = (Math.random() - 0.48) * 0.0004;
      const dLng = (Math.random() - 0.48) * 0.0004;
      let newLat = pos.lat + dLat;
      let newLng = pos.lng + dLng;

      // Gently pull back toward home if drifting too far (keep within ~400m most of the time)
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

      // Update marker
      if (markerRef.current) {
        markerRef.current.setLatLng([newLat, newLng]);
        markerRef.current.setPopupContent(
          `<b>${elderlyLabel}</b><br>Status: <b style="color:${isHome ? "#22d3a5" : "#f87171"}">${isHome ? "Home" : "Outside"}</b>`
        );
      }

      // Trail
      trailData.current.push([newLat, newLng]);
      if (trailData.current.length > 50) trailData.current.shift();
      if (trailRef.current && mapInstance.current) mapInstance.current.removeLayer(trailRef.current);
      if (trailData.current.length > 1 && mapInstance.current) {
        trailRef.current = L.polyline(trailData.current, { color: "#3b82f6", weight: 2, opacity: 0.4, dashArray: "5 4" }).addTo(mapInstance.current);
      }

      // Generate alert if boundary crossed
      if (prevStatus === "Home" && !isHome) {
        const alert = { id: Date.now(), type: "left", time: new Date().toISOString(), distance: currentDist };
        setAlerts(prev => [alert, ...prev].slice(0, 20));
        showToast("left", "Left Home Zone", `${currentDist}m from home`);
      } else if (prevStatus === "Outside" && isHome) {
        const alert = { id: Date.now(), type: "entered", time: new Date().toISOString(), distance: currentDist };
        setAlerts(prev => [alert, ...prev].slice(0, 20));
        showToast("entered", "Returned Home", "Back within safe zone");
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [statusText, showToast]);

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

  const isHome = statusText === "Home";
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
        <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
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

          {/* Quick actions */}
          <div className="ew-card">
            <div className="ew-card-label">Quick Actions</div>
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
              ) : alerts.map((a) => (
                <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0", borderBottom: "1px solid var(--border)" }}>
                  <div style={{ fontSize: "1rem" }}>{a.type === "left" ? "\u{1f6a8}" : "\u2705"}</div>
                  <div style={{ flex: 1, fontSize: "0.7rem" }}>
                    <div style={{ fontWeight: 700, color: a.type === "left" ? "var(--red)" : "var(--green)" }}>
                      {a.type === "left" ? "Left home zone" : "Returned home"}
                    </div>
                    <div style={{ color: "var(--muted-2)" }}>{fmtTime(a.time)}</div>
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
