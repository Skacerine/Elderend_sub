import { useEffect, useState, useCallback, useRef } from "react";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000";
const ELDERLY_ID = 1234567891234567;

async function get(url) {
  try {
    const r = await fetch(`${API_BASE}${url}`, { signal: AbortSignal.timeout(8000) });
    return r.ok ? r.json() : null;
  } catch { return null; }
}

function timeToMinutes(t) {
  if (!t) return 99999;
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
}

function nowStr() {
  const n = new Date();
  return `${n.getHours().toString().padStart(2, "0")}:${n.getMinutes().toString().padStart(2, "0")}:00`;
}

function formatTime(t) {
  if (!t) return "-";
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 || 12}:${(m || 0).toString().padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}

function minutesUntil(t) {
  return timeToMinutes(t) - timeToMinutes(nowStr());
}

function medKey(m) {
  return `${m.Name}_${m.ReminderTime}`;
}

export default function Medicare() {
  const [meds, setMeds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [acknowledged, setAcknowledged] = useState(new Set());
  const [alertMed, setAlertMed] = useState(null);
  const [clock, setClock] = useState("");
  const snoozed = useRef({});

  const loadData = useCallback(async () => {
    const data = await get(ELDERLY_ID ? `/medicine/${ELDERLY_ID}` : "/medicine");
    if (data) {
      let arr = Array.isArray(data) ? data : [data];
      if (ELDERLY_ID) arr = arr.filter(m => !m.ElderlyId || String(m.ElderlyId) === String(ELDERLY_ID));
      setMeds(arr.filter(m => m.IsActive === true || m.IsActive === 1 || m.IsActive === "true" || m.IsActive === "1"));
      setError(null);
    } else if (meds.length === 0) {
      setError("Could not load medication data.");
    }
    setLoading(false);
  }, []);

  // Clock tick + alert check
  useEffect(() => {
    function tick() {
      const n = new Date();
      const h = n.getHours(), m = n.getMinutes();
      setClock(`${h % 12 || 12}:${m.toString().padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`);
    }
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, []);

  // Check alerts every second
  useEffect(() => {
    function checkAlerts() {
      if (alertMed) return;
      const nowM = timeToMinutes(nowStr());
      for (const med of meds) {
        const key = medKey(med);
        if (acknowledged.has(key)) continue;
        if (snoozed.current[key] && Date.now() < snoozed.current[key]) continue;
        const diff = timeToMinutes(med.ReminderTime) - nowM;
        if (diff >= 0 && diff <= 2) { setAlertMed(med); return; }
      }
    }
    const timer = setInterval(checkAlerts, 1000);
    return () => clearInterval(timer);
  }, [meds, acknowledged, alertMed]);

  // Initial load + polling
  useEffect(() => {
    loadData();
    const timer = setInterval(loadData, 30000);
    return () => clearInterval(timer);
  }, [loadData]);

  function markTaken(key) {
    setAcknowledged(prev => new Set([...prev, key]));
  }

  function confirmAlert() {
    if (!alertMed) return;
    markTaken(medKey(alertMed));
    setAlertMed(null);
  }

  function snoozeAlert() {
    if (!alertMed) return;
    snoozed.current[medKey(alertMed)] = Date.now() + 5 * 60 * 1000;
    setAlertMed(null);
  }

  // Derived data
  const sorted = [...meds].sort((a, b) => timeToMinutes(a.ReminderTime) - timeToMinutes(b.ReminderTime));
  const nextMed = sorted.find(m => !acknowledged.has(medKey(m)) && timeToMinutes(m.ReminderTime) >= timeToMinutes(nowStr()) - 2) || null;
  const outOfStock = meds.filter(m => Number(m.Stock) === 0 || m.Stock == null);
  const lowStock = meds.filter(m => Number(m.Stock) > 0 && Number(m.Stock) <= 5);
  const allDone = meds.length > 0 && meds.every(m => acknowledged.has(medKey(m)));

  const h = new Date().getHours();
  const greeting = h < 12 ? "morning" : h < 18 ? "afternoon" : "evening";
  const dateStr = new Date().toLocaleDateString("en-SG", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  if (loading) {
    return (
      <div className="mc-loading">
        <div className="mc-loader-icon">&#x1F48A;</div>
        <div className="mc-loader-ring" />
        <div className="mc-loader-text">Loading your medicines...</div>
      </div>
    );
  }

  if (error && meds.length === 0) {
    return (
      <div className="mc-error">
        <div className="mc-error-card">
          <div className="mc-error-icon">&#x26A0;&#xFE0F;</div>
          <h2>Unable to Connect</h2>
          <p>{error}</p>
          <button className="mc-btn-retry" onClick={loadData}>Try Again</button>
        </div>
      </div>
    );
  }

  return (
    <div className="mc-app">
      {/* Header */}
      <div className="mc-header">
        <div className="mc-header-brand">
          <div className="mc-brand-dot">&#x1F48A;</div>
          <span className="mc-brand-name">My Medicines</span>
        </div>
        <div className="mc-clock">{clock}</div>
      </div>

      {/* Greeting */}
      <div className="mc-greeting">
        <div className="mc-greeting-label">Good {greeting}</div>
        <div className="mc-greeting-title">Here are your medicines</div>
        <div className="mc-greeting-date">{dateStr}</div>
      </div>

      {/* Warnings */}
      {outOfStock.length > 0 && (
        <div className="mc-warn mc-warn--danger">
          <strong>Out of stock:</strong> {outOfStock.map(m => m.Name).join(", ")}. Please ask your guardian to restock.
        </div>
      )}
      {lowStock.length > 0 && (
        <div className="mc-warn mc-warn--low">
          <strong>Running low:</strong> {lowStock.map(m => `${m.Name} (${m.Stock} left)`).join(", ")}.
        </div>
      )}

      {/* Next card */}
      {nextMed && !allDone && (
        <div className="mc-next-card">
          <div className="mc-next-body">
            <div className="mc-next-label">Next reminder</div>
            <div className="mc-next-name">{nextMed.Name}</div>
            <div className="mc-next-time">Scheduled at {formatTime(nextMed.ReminderTime)}</div>
          </div>
          {minutesUntil(nextMed.ReminderTime) >= 0 && minutesUntil(nextMed.ReminderTime) <= 120 && (
            <div className="mc-next-badge">
              <div className="mc-next-badge-num">{minutesUntil(nextMed.ReminderTime) < 1 ? "<1" : minutesUntil(nextMed.ReminderTime)}</div>
              <div className="mc-next-badge-unit">min</div>
            </div>
          )}
        </div>
      )}
      {allDone && (
        <div className="mc-all-done">
          <div style={{ fontSize: "2rem" }}>&#x2705;</div>
          <h3>All done for today!</h3>
          <p>You have taken all your medicines. Well done.</p>
        </div>
      )}

      {/* Med cards */}
      {meds.length === 0 ? (
        <div className="mc-empty">
          <h3>No medications found</h3>
          <p>No active medicines found for this elderly ID.</p>
        </div>
      ) : (
        <>
          <div className="mc-section-label">All medications today</div>
          {sorted.map((med) => {
            const key = medKey(med);
            const isNext = nextMed && medKey(nextMed) === key;
            const isDone = acknowledged.has(key);
            const dose = Number(med.Dose) || 1;
            const stock = med.Stock == null ? 0 : Number(med.Stock);

            return (
              <div key={key} className={`mc-card ${isNext && !isDone ? "mc-card--next" : ""} ${isDone ? "mc-card--done" : ""}`}>
                <div className="mc-card-body">
                  <div className="mc-card-top">
                    <div>
                      <div className="mc-card-name-row">
                        <span className="mc-card-name">{med.Name}</span>
                        {isNext && !isDone && <span className="mc-pill-next">Next</span>}
                        {isDone && <span className="mc-pill-done">Taken</span>}
                      </div>
                      <div className="mc-card-time">{formatTime(med.ReminderTime)}</div>
                    </div>
                    <span className={`mc-stock ${stock === 0 ? "mc-stock--out" : stock <= 5 ? "mc-stock--low" : "mc-stock--ok"}`}>
                      {stock === 0 ? "Out of stock" : stock <= 5 ? `${stock} left` : `${stock} in stock`}
                    </span>
                  </div>
                  <p className="mc-card-instr">{med.Instructions || "No special instructions."}</p>
                  <div className="mc-card-dose">{dose} dose{dose > 1 ? "s" : ""}</div>
                </div>
                {!isDone && isNext && (
                  <div className="mc-card-footer">
                    <button className="mc-btn-take" onClick={() => markTaken(key)}>Mark as taken</button>
                  </div>
                )}
                {isDone && (
                  <div className="mc-card-footer">
                    <div className="mc-btn-taken">Taken today</div>
                  </div>
                )}
              </div>
            );
          })}
        </>
      )}

      {/* Medicine alert popup */}
      {alertMed && (
        <div className="mc-alert-overlay" onClick={snoozeAlert}>
          <div className="mc-alert-box" onClick={e => e.stopPropagation()}>
            <div className="mc-alert-ring">&#x1F514;</div>
            <div className="mc-alert-head">Time for your medicine</div>
            <div className="mc-alert-name">{alertMed.Name}</div>
            <div className="mc-alert-time">{formatTime(alertMed.ReminderTime)}</div>
            <div className="mc-alert-instr">{alertMed.Instructions || "No special instructions."}</div>
            <div className="mc-alert-dose">{Number(alertMed.Dose) || 1} dose{(Number(alertMed.Dose) || 1) > 1 ? "s" : ""}</div>
            <button className="mc-btn-confirm" onClick={confirmAlert}>I took it</button>
            <button className="mc-btn-snooze" onClick={snoozeAlert}>Remind me again in 5 minutes</button>
          </div>
        </div>
      )}
    </div>
  );
}
