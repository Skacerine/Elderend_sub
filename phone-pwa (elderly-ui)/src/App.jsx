import { useEffect, useMemo, useRef, useState } from "react";
import { createMotionMonitor } from "./motionSensor";
import { sendMotionSample, simulateDrop } from "./api";
import { useAuth } from "./AuthContext";

const STORAGE_KEY = "elderall_monitoring_enabled";
const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000";
const NGROK_HEADERS = { "ngrok-skip-browser-warning": "1" };

function fmtTime(t) {
  if (!t) return "-";
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 || 12}:${(m || 0).toString().padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}

function fmtClock() {
  const n = new Date(), h = n.getHours(), m = n.getMinutes();
  return `${h % 12 || 12}:${m.toString().padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}

export default function App() {
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [status, setStatus] = useState("Starting...");
  const [lastResponse, setLastResponse] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [lastAlertTime, setLastAlertTime] = useState(null);
  const [meds, setMeds] = useState([]);
  const [medsLoading, setMedsLoading] = useState(true);
  const [scheduleOverrides, setScheduleOverrides] = useState({});
  const [clock, setClock] = useState(fmtClock());

  const { user, logout } = useAuth();
  const elderlyId = user?.elderlyId;
  const guardianId = user?.guardianId;
  const deviceId = "PHONE_01";
  const ELDERLY_ID = elderlyId;
  const [gpsPos, setGpsPos] = useState({ lat: null, lng: null, address: "Locating..." });
  const gpsPosRef = useRef(gpsPos);

  // Clock
  useEffect(() => {
    const t = setInterval(() => setClock(fmtClock()), 1000);
    return () => clearInterval(t);
  }, []);

  // Real GPS tracking — watch position and send to backend
  useEffect(() => {
    if (!navigator.geolocation) return;
    let lastSent = 0;

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        const gps = { lat, lng, address: `${lat.toFixed(4)}, ${lng.toFixed(4)}` };
        setGpsPos(gps);
        gpsPosRef.current = gps;

        // Send to backend at most every 10 seconds
        const now = Date.now();
        if (now - lastSent < 10000) return;
        lastSent = now;

        fetch(`${API_BASE}/gps/realgps`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...NGROK_HEADERS },
          body: JSON.stringify({ lat, lng, elderlyId })
        }).catch(() => {});
      },
      (err) => console.warn("[GPS] Geolocation error:", err.message),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  // Load medicines
  useEffect(() => {
    async function loadMeds() {
      try {
        const r = await fetch(`${API_BASE}/medicine/${ELDERLY_ID}`, { headers: NGROK_HEADERS, signal: AbortSignal.timeout(8000) });
        if (r.ok) {
          const data = await r.json();
          let arr = Array.isArray(data) ? data : [data];
          arr = arr.map(m => ({ ...m, Stock: m.Quantity ?? m.Stock ?? 0, ReminderTime: m.ReminderTime || m.Schedule?.[0]?.ReminderTime || null }));
          setMeds(arr.filter(m => m.IsActive === true || m.IsActive === 1 || m.IsActive === "true" || m.IsActive === "1"));
        }
      } catch (e) { console.error("Meds load error:", e.message); }
      setMedsLoading(false);
    }
    loadMeds();
    const t = setInterval(loadMeds, 60000);
    return () => clearInterval(t);
  }, []);

  // Poll schedule overrides frequently — lightweight endpoint, updates in near real-time
  // when guardian changes day selections in Medicare
  useEffect(() => {
    async function loadOverrides() {
      try {
        const r = await fetch(`${API_BASE}/medicine/schedules`, { headers: NGROK_HEADERS, signal: AbortSignal.timeout(5000) });
        if (r.ok) setScheduleOverrides(await r.json());
      } catch { /* ignore */ }
    }
    loadOverrides();
    const t = setInterval(loadOverrides, 5000);
    return () => clearInterval(t);
  }, []);

  const monitor = useMemo(() => createMotionMonitor({
    onStart: () => { setIsMonitoring(true); setStatus("Protected"); setErrorMessage(""); },
    onStop: () => { setIsMonitoring(false); setStatus("Paused"); },
    onError: (msg) => { setErrorMessage(msg); setStatus("Issue"); },
    onFeatureReady: async (features) => {
      try {
        setIsSending(true); setStatus("Checking...");
        const pos = gpsPosRef.current;
        const result = await sendMotionSample({ elderlyId, guardianId, deviceId, timestamp: new Date().toISOString(), latitude: pos.lat || 1.2966, longitude: pos.lng || 103.8502, address: pos.address || "Unknown", features });
        setLastResponse(result); setLastAlertTime(new Date().toISOString());
        setStatus(result.detected ? "Alert sent" : "Protected");
      } catch (error) { setErrorMessage(error.message || "Send failed"); setStatus("Protected"); }
      finally { setIsSending(false); }
    }
  }), []);

  useEffect(() => {
    if (localStorage.getItem(STORAGE_KEY) === "true") {
      // Auto-resume: skip permission prompt (iOS blocks it outside user gestures).
      // If permission was previously granted this will work; if not, it silently stays paused.
      monitor.start({ skipPermission: true })
        .catch(() => { setStatus("Paused"); localStorage.setItem(STORAGE_KEY, "false"); });
    } else {
      setStatus("Paused");
    }
    return () => monitor.stop();
  }, [monitor]);

  async function handleEnable() {
    // Called directly from button tap — iOS allows permission prompts here
    try { setErrorMessage(""); await monitor.start(); localStorage.setItem(STORAGE_KEY, "true"); }
    catch (e) { localStorage.setItem(STORAGE_KEY, "false"); setIsMonitoring(false); setStatus("Issue"); setErrorMessage(e.message || "Cannot start"); }
  }

  function handlePause() { monitor.stop(); localStorage.setItem(STORAGE_KEY, "false"); setIsMonitoring(false); setStatus("Paused"); }

  async function handleSimulate() {
    try { setErrorMessage(""); setStatus("Sending...");
      const result = await simulateDrop({ elderlyId, guardianId, deviceId, latitude: gpsPos.lat || 1.2966, longitude: gpsPos.lng || 103.8502, address: gpsPos.address || "Unknown" });
      setLastResponse(result); setLastAlertTime(new Date().toISOString()); setStatus("Alert sent");
    } catch (e) { setErrorMessage(e.message || "Failed"); setStatus(isMonitoring ? "Protected" : "Paused"); }
  }

  // Filter to only show medicines scheduled for today
  const DAYS_FULL = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  const todayIdx = (() => { const d = new Date().getDay(); return d === 0 ? 6 : d - 1; })(); // 0=Mon..6=Sun
  const todayName = DAYS_FULL[todayIdx];
  const todayMeds = meds.filter(m => {
    // Check backend schedule overrides first (guardian's day selections)
    const override = scheduleOverrides[String(m.Id)];
    if (override && Array.isArray(override)) {
      return override.includes(todayName);
    }
    // Check Schedule array (OutSystems per-day entries)
    if (m.Schedule && m.Schedule.length > 0) {
      return m.Schedule.some(s => s.Day === todayName);
    }
    // No schedule info = show every day
    return true;
  });
  const sortedMeds = [...todayMeds].sort((a, b) => (a.ReminderTime || "").localeCompare(b.ReminderTime || ""));
  const h = new Date().getHours();
  const greeting = h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
  const isAlert = lastResponse?.detected;

  return (
    <div className="ea-app">
      {/* Status bar */}
      <div className={`ea-status-bar ${isMonitoring ? "ea-status-bar--on" : ""} ${isAlert ? "ea-status-bar--alert" : ""}`}>
        <div className="ea-status-dot" />
        <span>{isAlert ? "Alert sent to guardian" : isMonitoring ? "Fall protection active" : isSending ? "Checking..." : "Protection paused"}</span>
        <span className="ea-clock">{clock}</span>
      </div>

      {/* Header */}
      <div className="ea-header">
        <div className="ea-greeting">{greeting}</div>
        <div className="ea-greeting-sub">Here is your schedule for today</div>
      </div>

      {/* Medicine list */}
      <div className="ea-meds-section">
        <div className="ea-section-title">
          <span className="ea-pill-icon">
            <svg className="ea-pill-svg" viewBox="0 0 32 32" width="28" height="28">
              <rect x="4" y="10" width="24" height="12" rx="6" fill="#227A54" className="ea-pill-body"/>
              <rect x="16" y="10" width="12" height="12" rx="6" fill="#1A5C40"/>
              <ellipse cx="10" cy="16" rx="2" ry="1.5" fill="rgba(255,255,255,.35)"/>
            </svg>
          </span>
          Today's Medicines
        </div>

        {medsLoading ? (
          <div className="ea-meds-loading">Loading...</div>
        ) : sortedMeds.length === 0 ? (
          <div className="ea-meds-empty">
            <div className="ea-meds-empty-icon">&#x2705;</div>
            <div>No medicines scheduled today</div>
          </div>
        ) : (
          <div className="ea-med-list">
            {sortedMeds.map((med) => {
              const dose = Number(med.Dose) || 1;
              const stock = Number(med.Stock) || 0;
              return (
                <div key={`${med.Name}-${med.ReminderTime}`} className="ea-med-card">
                  <div className="ea-med-time-col">
                    <div className="ea-med-time">{fmtTime(med.ReminderTime)}</div>
                    <div className="ea-med-dose">{dose} dose{dose > 1 ? "s" : ""}</div>
                  </div>
                  <div className="ea-med-info">
                    <div className="ea-med-name">{med.Name}</div>
                    {med.Instructions && <div className="ea-med-instr">{med.Instructions}</div>}
                    {stock === 0 && <div className="ea-med-warn">Out of stock — tell your guardian</div>}
                    {stock > 0 && stock <= 5 && <div className="ea-med-low">Only {stock} left</div>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Monitoring + actions */}
      <div className="ea-monitor-section">
        <div className="ea-monitor-bar">
          <div className={`ea-monitor-indicator ${isMonitoring ? "ea-monitor--on" : "ea-monitor--off"}`}>
            <div className="ea-monitor-dot" />
            <span>{isMonitoring ? "Protected" : "Paused"}</span>
          </div>
          {!isMonitoring ? (
            <button className="ea-btn ea-btn--enable" onClick={handleEnable}>Enable Protection</button>
          ) : (
            <button className="ea-btn ea-btn--pause" onClick={handlePause}>Pause</button>
          )}
        </div>
        {errorMessage && <div className="ea-error">{errorMessage}</div>}
      </div>

      {/* Alert guardian button */}
      <button className={`ea-emergency ${isSending ? "ea-emergency--sending" : ""}`} onClick={handleSimulate} disabled={isSending}>
        <span className="ea-emergency-icon">&#x1F6A8;</span>
        <span>{isSending ? "Alerting guardian..." : "Alert My Guardian!"}</span>
      </button>

      {/* Keep open reminder */}
      <div className="ea-keep-open">
        Keep this app open for fall protection
      </div>

      {/* Logout */}
      <button onClick={() => { monitor.stop(); logout(); }} style={{
        margin: "16px auto", display: "block", padding: "10px 24px",
        background: "none", border: "1px solid #d1d5db", borderRadius: 10,
        color: "#6b7280", fontSize: "14px", cursor: "pointer"
      }}>
        Sign Out
      </button>
    </div>
  );
}
