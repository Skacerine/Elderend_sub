import { useEffect, useMemo, useState } from "react";
import { createMotionMonitor } from "./motionSensor";
import { sendMotionSample, simulateDrop } from "./api";
import { useAuth } from "./AuthContext";

const STORAGE_KEY = "elderall_monitoring_enabled";
const API_BASE = import.meta.env.VITE_API_BASE_URL || "https://elderend-backend.onrender.com";

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
  const elderlyId = user?.elderlyId || 1;
  const guardianId = 1;
  const deviceId = "PHONE_01";
  const ELDERLY_ID = elderlyId;

  // Clock
  useEffect(() => {
    const t = setInterval(() => setClock(fmtClock()), 1000);
    return () => clearInterval(t);
  }, []);

  // Load medicines and schedule overrides
  useEffect(() => {
    async function loadMeds() {
      try {
        const r = await fetch(`${API_BASE}/medicine/${ELDERLY_ID}`, { signal: AbortSignal.timeout(8000) });
        if (r.ok) {
          const data = await r.json();
          let arr = Array.isArray(data) ? data : [data];
          arr = arr.map(m => ({ ...m, Stock: m.Quantity ?? m.Stock ?? 0 }));
          setMeds(arr.filter(m => m.IsActive === true || m.IsActive === 1 || m.IsActive === "true" || m.IsActive === "1"));
        }
      } catch (e) { console.error("Meds load error:", e.message); }
      try {
        const r = await fetch(`${API_BASE}/medicine/schedules`, { signal: AbortSignal.timeout(5000) });
        if (r.ok) setScheduleOverrides(await r.json());
      } catch { /* ignore */ }
      setMedsLoading(false);
    }
    loadMeds();
    const t = setInterval(loadMeds, 60000);
    return () => clearInterval(t);
  }, []);

  const monitor = useMemo(() => createMotionMonitor({
    onStart: () => { setIsMonitoring(true); setStatus("Protected"); setErrorMessage(""); },
    onStop: () => { setIsMonitoring(false); setStatus("Paused"); },
    onError: (msg) => { setErrorMessage(msg); setStatus("Issue"); },
    onFeatureReady: async (features) => {
      try {
        setIsSending(true); setStatus("Checking...");
        const result = await sendMotionSample({ elderlyId, guardianId, deviceId, timestamp: new Date().toISOString(), latitude: 1.2966, longitude: 103.8502, address: "Tanjong Pagar, Singapore", features });
        setLastResponse(result); setLastAlertTime(new Date().toISOString());
        setStatus(result.detected ? "Alert sent" : "Protected");
      } catch (error) { setErrorMessage(error.message || "Send failed"); setStatus("Protected"); }
      finally { setIsSending(false); }
    }
  }), []);

  useEffect(() => {
    if (localStorage.getItem(STORAGE_KEY) === "true") handleEnable();
    else setStatus("Paused");
    return () => monitor.stop();
  }, [monitor]);

  async function handleEnable() {
    try { setErrorMessage(""); await monitor.start(); localStorage.setItem(STORAGE_KEY, "true"); }
    catch (e) { localStorage.setItem(STORAGE_KEY, "false"); setIsMonitoring(false); setStatus("Issue"); setErrorMessage(e.message || "Cannot start"); }
  }

  function handlePause() { monitor.stop(); localStorage.setItem(STORAGE_KEY, "false"); setIsMonitoring(false); setStatus("Paused"); }

  async function handleSimulate() {
    try { setErrorMessage(""); setStatus("Sending...");
      const result = await simulateDrop({ elderlyId, guardianId, deviceId, latitude: 1.2966, longitude: 103.8502, address: "Tanjong Pagar, Singapore" });
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
    </div>
  );
}
