import { useEffect, useMemo, useState } from "react";
import { createMotionMonitor } from "./motionSensor";
import { sendMotionSample, simulateDrop } from "./api";

const STORAGE_KEY = "elderall_monitoring_enabled";
const API_BASE = import.meta.env.VITE_API_BASE_URL || "https://elderend-backend.onrender.com";
const ELDERLY_ID = 111;

function prettyTime(value) {
  if (!value) return "No alerts yet";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return String(value);
  }
}

function formatMedTime(t) {
  if (!t) return "-";
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 || 12}:${(m || 0).toString().padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}

function getStateTone({ isMonitoring, isSending, lastResponse, errorMessage }) {
  if (errorMessage) {
    return { chip: "Issue", dot: "state-dot--red", title: "Monitoring unavailable", copy: "Check permissions or connection." };
  }
  if (lastResponse?.detected) {
    return { chip: "Alert sent", dot: "state-dot--red", title: "Help alert sent", copy: "Your guardian has been notified." };
  }
  if (isSending) {
    return { chip: "Sending", dot: "state-dot--yellow", title: "Checking movement", copy: "Please wait." };
  }
  if (isMonitoring) {
    return { chip: "Protected", dot: "state-dot--green", title: "Monitoring active", copy: "Fall protection is on." };
  }
  return { chip: "Paused", dot: "state-dot--yellow", title: "Monitoring paused", copy: "Press enable to start." };
}

export default function App() {
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [status, setStatus] = useState("Checking app status...");
  const [lastResponse, setLastResponse] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [lastAlertTime, setLastAlertTime] = useState(null);
  const [meds, setMeds] = useState([]);
  const [medsLoading, setMedsLoading] = useState(true);

  const elderlyId = 1;
  const guardianId = 1;
  const deviceId = "PHONE_01";

  // Load medicines
  useEffect(() => {
    async function loadMeds() {
      try {
        const r = await fetch(`${API_BASE}/medicine/${ELDERLY_ID}`, { signal: AbortSignal.timeout(8000) });
        if (r.ok) {
          const data = await r.json();
          const arr = Array.isArray(data) ? data : [data];
          setMeds(arr.filter(m => m.IsActive === true || m.IsActive === 1 || m.IsActive === "true" || m.IsActive === "1"));
        }
      } catch (e) {
        console.error("Failed to load medicines:", e.message);
      }
      setMedsLoading(false);
    }
    loadMeds();
    const timer = setInterval(loadMeds, 60000);
    return () => clearInterval(timer);
  }, []);

  const monitor = useMemo(() => {
    return createMotionMonitor({
      onStart: () => { setIsMonitoring(true); setStatus("Monitoring Active"); setErrorMessage(""); },
      onStop: () => { setIsMonitoring(false); setStatus("Monitoring Paused"); },
      onError: (message) => { setErrorMessage(message); setStatus("Monitoring Unavailable"); },
      onFeatureReady: async (features) => {
        try {
          setIsSending(true);
          setStatus("Motion anomaly detected. Sending alert...");
          const result = await sendMotionSample({
            elderlyId, guardianId, deviceId,
            timestamp: new Date().toISOString(),
            latitude: 1.2966, longitude: 103.8502,
            address: "Tanjong Pagar, Singapore",
            features
          });
          setLastResponse(result);
          setLastAlertTime(new Date().toISOString());
          setStatus(result.detected ? "Possible drop detected" : "Monitoring Active");
        } catch (error) {
          setErrorMessage(error.message || "Failed to send motion sample.");
          setStatus("Monitoring Active");
        } finally {
          setIsSending(false);
        }
      }
    });
  }, []);

  useEffect(() => {
    const shouldResume = localStorage.getItem(STORAGE_KEY) === "true";
    if (shouldResume) { handleEnableMonitoring(); } else { setStatus("Monitoring Paused"); }
    return () => { monitor.stop(); };
  }, [monitor]);

  async function handleEnableMonitoring() {
    try {
      setErrorMessage(""); setStatus("Starting monitoring...");
      await monitor.start();
      localStorage.setItem(STORAGE_KEY, "true");
    } catch (error) {
      localStorage.setItem(STORAGE_KEY, "false");
      setIsMonitoring(false); setStatus("Monitoring Unavailable");
      setErrorMessage(error.message || "Unable to start monitoring.");
    }
  }

  function handlePauseMonitoring() {
    monitor.stop();
    localStorage.setItem(STORAGE_KEY, "false");
    setIsMonitoring(false); setStatus("Monitoring Paused");
  }

  async function handleSimulateDrop() {
    try {
      setErrorMessage(""); setStatus("Sending simulated drop...");
      const result = await simulateDrop({
        elderlyId, guardianId, deviceId,
        latitude: 1.2966, longitude: 103.8502,
        address: "Tanjong Pagar, Singapore"
      });
      setLastResponse(result);
      setLastAlertTime(new Date().toISOString());
      setStatus("Simulated drop sent");
    } catch (error) {
      setErrorMessage(error.message || "Failed to simulate drop.");
      setStatus(isMonitoring ? "Monitoring Active" : "Monitoring Paused");
    }
  }

  const tone = getStateTone({ isMonitoring, isSending, lastResponse, errorMessage });
  const sortedMeds = [...meds].sort((a, b) => {
    const ta = a.ReminderTime || "99:99", tb = b.ReminderTime || "99:99";
    return ta.localeCompare(tb);
  });

  return (
    <div className="phone-app">
      <div className="phone-shell">
        <div className="phone-topbar">
          <div className="phone-brand">
            <div className="phone-mark">&#x1F6E1;&#xFE0F;</div>
            <div>
              <div className="phone-title">Elderall Safety Phone</div>
              <div className="phone-subtitle">Fall monitoring</div>
            </div>
          </div>
          <div className="state-chip">
            <span className={`state-dot ${tone.dot}`} />
            {tone.chip}
          </div>
        </div>

        {/* Medicine list for today */}
        <div className="phone-meds">
          <div className="phone-meds-header">
            <span className="phone-meds-icon">&#x1F48A;</span>
            <span className="phone-meds-title">Today's Medicines</span>
          </div>
          {medsLoading ? (
            <div className="phone-meds-loading">Loading medicines...</div>
          ) : sortedMeds.length === 0 ? (
            <div className="phone-meds-empty">No medicines scheduled for today.</div>
          ) : (
            <div className="phone-meds-list">
              {sortedMeds.map((med) => {
                const dose = Number(med.Dose) || 1;
                const stock = med.Stock == null ? 0 : Number(med.Stock);
                return (
                  <div key={`${med.Name}-${med.ReminderTime}`} className="phone-med-item">
                    <div className="phone-med-info">
                      <div className="phone-med-name">{med.Name}</div>
                      <div className="phone-med-detail">
                        {formatMedTime(med.ReminderTime)} &middot; {dose} dose{dose > 1 ? "s" : ""}
                        {stock === 0 && <span className="phone-med-warn"> &middot; Out of stock</span>}
                        {stock > 0 && stock <= 5 && <span className="phone-med-low"> &middot; {stock} left</span>}
                      </div>
                      {med.Instructions && (
                        <div className="phone-med-instr">{med.Instructions}</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Compact monitoring status */}
        <div className="phone-state phone-state--compact">
          <div className="phone-compact-row">
            <div>
              <div className="phone-kicker">Status</div>
              <div className="phone-compact-title">{tone.title}</div>
              <div className="phone-compact-copy">{tone.copy}</div>
            </div>
            <div className="phone-compact-stats">
              <div className="phone-compact-stat">
                <span className="phone-compact-stat-label">Monitoring</span>
                <span className={`phone-compact-stat-value ${isMonitoring ? "phone-stat-value--on" : "phone-stat-value--off"}`}>{isMonitoring ? "On" : "Off"}</span>
              </div>
              <div className="phone-compact-stat">
                <span className="phone-compact-stat-label">Last alert</span>
                <span className="phone-compact-stat-value">{lastAlertTime ? new Date(lastAlertTime).toLocaleTimeString() : "None"}</span>
              </div>
            </div>
          </div>
          {errorMessage ? <div className="phone-error phone-error--compact">{errorMessage}</div> : null}
        </div>

        <div className="phone-actions">
          {!isMonitoring ? (
            <button className="phone-button phone-button--primary" onClick={handleEnableMonitoring}>
              <span className="phone-button-title">Enable Monitoring</span>
              <span className="phone-button-caption">Start protection</span>
            </button>
          ) : (
            <button className="phone-button phone-button--danger" onClick={handlePauseMonitoring}>
              <span className="phone-button-title">Pause Monitoring</span>
              <span className="phone-button-caption">Stop protection</span>
            </button>
          )}

          <button className="phone-button phone-button--ghost" onClick={handleSimulateDrop}>
            <span className="phone-button-title">Simulate Drop</span>
            <span className="phone-button-caption">Send test alert</span>
          </button>
        </div>

        <div className="phone-reminder">
          <div className="phone-reminder-title">Keep this app open</div>
          <div className="phone-reminder-copy">
            Do not swipe it away. For best protection, keep this screen open when possible.
          </div>
        </div>
      </div>
    </div>
  );
}
