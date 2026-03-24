import { useEffect, useState, useCallback } from "react";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000";
const ELDERLY_ID = 111;

async function get(url) {
  try {
    const r = await fetch(`${API_BASE}${url}`, { signal: AbortSignal.timeout(8000) });
    return r.ok ? r.json() : null;
  } catch { return null; }
}

async function post(url, body) {
  try {
    const r = await fetch(`${API_BASE}${url}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000)
    });
    return r.json();
  } catch { return null; }
}

function timeToMinutes(t) {
  if (!t) return 99999;
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
}

function formatTime(t) {
  if (!t) return "-";
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 || 12}:${(m || 0).toString().padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}

export default function Medicare() {
  const [meds, setMeds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [clock, setClock] = useState("");
  const [sending, setSending] = useState(false);
  const [notifyResult, setNotifyResult] = useState(null);

  const loadData = useCallback(async () => {
    let data = ELDERLY_ID ? await get(`/medicine/${ELDERLY_ID}`) : null;
    if (!data) data = await get("/medicine");
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

  useEffect(() => {
    loadData();
    const timer = setInterval(loadData, 30000);
    return () => clearInterval(timer);
  }, [loadData]);

  async function handleSendNotification() {
    if (sending || meds.length === 0) return;
    setSending(true);
    setNotifyResult(null);
    const result = await post("/medicine/notify", { elderlyId: ELDERLY_ID, medicines: meds });
    setNotifyResult(result);
    setSending(false);
    setTimeout(() => setNotifyResult(null), 8000);
  }

  // Split medicines into today (all active) and tomorrow (same list, for demo purposes)
  const sorted = [...meds].sort((a, b) => timeToMinutes(a.ReminderTime) - timeToMinutes(b.ReminderTime));
  const outOfStock = meds.filter(m => Number(m.Stock) === 0 || m.Stock == null);
  const lowStock = meds.filter(m => Number(m.Stock) > 0 && Number(m.Stock) <= 5);

  const h = new Date().getHours();
  const greeting = h < 12 ? "morning" : h < 18 ? "afternoon" : "evening";
  const today = new Date();
  const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
  const dateStr = today.toLocaleDateString("en-SG", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const tomorrowStr = tomorrow.toLocaleDateString("en-SG", { weekday: "long", day: "numeric", month: "long" });

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

      {/* Test notification button */}
      <div style={{ margin: "0.75rem 1.25rem" }}>
        <button
          className="mc-btn-take"
          style={{ width: "100%", opacity: sending ? 0.6 : 1 }}
          onClick={handleSendNotification}
          disabled={sending || meds.length === 0}
        >
          {sending ? "Sending notification..." : "Send Medicine Reminder (Test SMS + Email)"}
        </button>
        {notifyResult && (
          <div className="mc-notify-result">
            SMS: {notifyResult.sms?.status || notifyResult.sms?.error || "sent"} | Email: {notifyResult.email?.status || notifyResult.email?.error || "sent"}
          </div>
        )}
      </div>

      {/* Today's medicines */}
      {meds.length === 0 ? (
        <div className="mc-empty">
          <h3>No medications found</h3>
          <p>No active medicines found for this elderly ID.</p>
        </div>
      ) : (
        <>
          <div className="mc-section-label">Today's medications</div>
          {sorted.map((med) => {
            const dose = Number(med.Dose) || 1;
            const stock = med.Stock == null ? 0 : Number(med.Stock);
            return (
              <div key={`today-${med.Name}-${med.ReminderTime}`} className="mc-card">
                <div className="mc-card-body">
                  <div className="mc-card-top">
                    <div>
                      <div className="mc-card-name-row">
                        <span className="mc-card-name">{med.Name}</span>
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
              </div>
            );
          })}

          {/* Tomorrow's medicines */}
          <div className="mc-section-label">Tomorrow — {tomorrowStr}</div>
          {sorted.map((med) => {
            const dose = Number(med.Dose) || 1;
            const stock = med.Stock == null ? 0 : Number(med.Stock);
            return (
              <div key={`tmr-${med.Name}-${med.ReminderTime}`} className="mc-card mc-card--tomorrow">
                <div className="mc-card-body">
                  <div className="mc-card-top">
                    <div>
                      <div className="mc-card-name-row">
                        <span className="mc-card-name">{med.Name}</span>
                      </div>
                      <div className="mc-card-time">{formatTime(med.ReminderTime)}</div>
                    </div>
                    <span className={`mc-stock ${stock === 0 ? "mc-stock--out" : stock <= 5 ? "mc-stock--low" : "mc-stock--ok"}`}>
                      {stock === 0 ? "Out of stock" : stock <= 5 ? `${stock} left` : `${stock} in stock`}
                    </span>
                  </div>
                  <div className="mc-card-dose">{dose} dose{dose > 1 ? "s" : ""}</div>
                </div>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
