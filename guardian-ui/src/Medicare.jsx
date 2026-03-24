import { useEffect, useState, useCallback } from "react";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000";
const ELDERLY_ID = 111;
const RESTOCK_LEAD_DAYS = 7; // recommend buying 1 week before running out
const RESTOCK_BUFFER_DAYS = 30; // buy enough to last 30 days from purchase date

async function get(url) {
  try {
    const r = await fetch(`${API_BASE}${url}`, { signal: AbortSignal.timeout(8000) });
    return r.ok ? r.json() : null;
  } catch { return null; }
}

async function postJson(url, body) {
  const r = await fetch(`${API_BASE}${url}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10000)
  });
  if (!r.ok) {
    const text = await r.text().catch(() => "");
    throw new Error(`${r.status}: ${text}`);
  }
  const text = await r.text();
  return text ? JSON.parse(text) : { ok: true };
}

async function putJson(url, body) {
  const r = await fetch(`${API_BASE}${url}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10000)
  });
  if (!r.ok) {
    const text = await r.text().catch(() => "");
    throw new Error(`${r.status}: ${text}`);
  }
  const text = await r.text();
  return text ? JSON.parse(text) : { ok: true };
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

function formatDate(d) {
  return d.toLocaleDateString("en-SG", { day: "numeric", month: "short", year: "numeric" });
}

function daysLeft(stock, dose) {
  const d = Number(dose) || 1;
  const s = Number(stock) || 0;
  if (s <= 0 || d <= 0) return 0;
  return Math.floor(s / d);
}

function getRestockSchedule(meds) {
  const today = new Date();
  return meds.map(med => {
    const dose = Number(med.Dose) || 1;
    const stock = Number(med.Stock) || 0;
    const days = daysLeft(stock, dose);
    const runsOutDate = new Date(today);
    runsOutDate.setDate(runsOutDate.getDate() + days);
    const buyByDate = new Date(runsOutDate);
    buyByDate.setDate(buyByDate.getDate() - RESTOCK_LEAD_DAYS);
    // How many doses to buy: enough for RESTOCK_BUFFER_DAYS from purchase
    const remainingAtPurchase = Math.max(0, stock - (dose * Math.max(0, days - RESTOCK_LEAD_DAYS)));
    const dosesToBuy = Math.max(0, (dose * RESTOCK_BUFFER_DAYS) - remainingAtPurchase);
    const isPastDue = buyByDate <= today;
    return { name: med.Name, dose, stock, days, runsOutDate, buyByDate, dosesToBuy, isPastDue };
  }).sort((a, b) => a.days - b.days);
}

export default function Medicare() {
  const [meds, setMeds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [clock, setClock] = useState("");
  const [sending, setSending] = useState(false);
  const [notifyResult, setNotifyResult] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState({ Name: "", ReminderTime: "08:00:00", Stock: 30, Dose: 1, Instructions: "", IsActive: true });
  const [addStatus, setAddStatus] = useState(null);
  const [restockMed, setRestockMed] = useState(null);
  const [restockAmount, setRestockAmount] = useState(0);

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
    try { const result = await postJson("/medicine/notify", { elderlyId: ELDERLY_ID, medicines: meds }); setNotifyResult(result); }
    catch { setNotifyResult({ error: "Failed to send" }); }
    setSending(false);
    setTimeout(() => setNotifyResult(null), 8000);
  }

  async function handleAddMedicine(e) {
    e.preventDefault();
    setAddStatus(null);
    try {
      await postJson("/medicine/create", {
        Name: addForm.Name,
        ElderlyId: ELDERLY_ID,
        ReminderTime: addForm.ReminderTime,
        Stock: addForm.Stock,
        Dose: addForm.Dose,
        Instructions: addForm.Instructions,
        IsActive: true
      });
      setAddStatus({ ok: true, msg: "Medicine added successfully" });
      setAddForm({ Name: "", ReminderTime: "08:00:00", Stock: 30, Dose: 1, Instructions: "", IsActive: true });
      setShowAddForm(false);
      loadData();
    } catch (err) {
      setAddStatus({ ok: false, msg: "Failed to add medicine: " + (err.message || "Unknown error") });
    }
    setTimeout(() => setAddStatus(null), 5000);
  }

  async function handleRestock(med) {
    const newStock = (Number(med.Stock) || 0) + restockAmount;
    try {
      await putJson("/medicine/update", {
        Name: med.Name,
        ElderlyId: ELDERLY_ID,
        ReminderTime: med.ReminderTime,
        Stock: newStock,
        Dose: Number(med.Dose) || 1,
        Instructions: med.Instructions || "",
        IsActive: true
      });
      setRestockMed(null);
      setRestockAmount(0);
      loadData();
    } catch (err) {
      alert("Failed to update stock: " + (err.message || "Unknown error"));
    }
  }

  const sorted = [...meds].sort((a, b) => timeToMinutes(a.ReminderTime) - timeToMinutes(b.ReminderTime));
  const outOfStock = meds.filter(m => Number(m.Stock) === 0 || m.Stock == null);
  const lowStock = meds.filter(m => Number(m.Stock) > 0 && Number(m.Stock) <= 5);
  const restockSchedule = getRestockSchedule(meds);

  const h = new Date().getHours();
  const greeting = h < 12 ? "morning" : h < 18 ? "afternoon" : "evening";
  const today = new Date();
  const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
  const dateStr = today.toLocaleDateString("en-SG", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const tomorrowStr = tomorrow.toLocaleDateString("en-SG", { weekday: "long", day: "numeric", month: "long" });

  if (loading) {
    return (<div className="mc-loading"><div className="mc-loader-icon">&#x1F48A;</div><div className="mc-loader-ring" /><div className="mc-loader-text">Loading your medicines...</div></div>);
  }
  if (error && meds.length === 0) {
    return (<div className="mc-error"><div className="mc-error-card"><div className="mc-error-icon">&#x26A0;&#xFE0F;</div><h2>Unable to Connect</h2><p>{error}</p><button className="mc-btn-retry" onClick={loadData}>Try Again</button></div></div>);
  }

  return (
    <div className="mc-app">
      <div className="mc-header">
        <div className="mc-header-brand">
          <div className="mc-brand-dot">&#x1F48A;</div>
          <span className="mc-brand-name">My Medicines</span>
        </div>
        <div className="mc-clock">{clock}</div>
      </div>

      <div className="mc-greeting">
        <div className="mc-greeting-label">Good {greeting}</div>
        <div className="mc-greeting-title">Here are your medicines</div>
        <div className="mc-greeting-date">{dateStr}</div>
      </div>

      {outOfStock.length > 0 && (
        <div className="mc-warn mc-warn--danger"><strong>Out of stock:</strong> {outOfStock.map(m => m.Name).join(", ")}. Please restock immediately.</div>
      )}
      {lowStock.length > 0 && (
        <div className="mc-warn mc-warn--low"><strong>Running low:</strong> {lowStock.map(m => `${m.Name} (${m.Stock} left)`).join(", ")}.</div>
      )}

      <div style={{ margin: "0.75rem 1.25rem" }}>
        <button className="mc-btn-take" style={{ width: "100%", opacity: sending ? 0.6 : 1 }} onClick={handleSendNotification} disabled={sending || meds.length === 0}>
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
        <div className="mc-empty"><h3>No medications found</h3><p>No active medicines found for this elderly ID.</p></div>
      ) : (
        <>
          <div className="mc-section-label">Today's medications</div>
          {sorted.map((med) => {
            const dose = Number(med.Dose) || 1;
            const stock = Number(med.Stock) || 0;
            const days = daysLeft(stock, dose);
            return (
              <div key={`today-${med.Name}-${med.ReminderTime}`} className="mc-card">
                <div className="mc-card-body">
                  <div className="mc-card-top">
                    <div>
                      <div className="mc-card-name-row"><span className="mc-card-name">{med.Name}</span></div>
                      <div className="mc-card-time">{formatTime(med.ReminderTime)}</div>
                    </div>
                    <span className={`mc-stock ${stock === 0 ? "mc-stock--out" : stock <= 5 ? "mc-stock--low" : "mc-stock--ok"}`}>
                      {stock === 0 ? "Out of stock" : stock <= 5 ? `${stock} left` : `${stock} in stock`}
                    </span>
                  </div>
                  <p className="mc-card-instr">{med.Instructions || "No special instructions."}</p>
                  <div className="mc-card-dose">
                    {dose} dose{dose > 1 ? "s" : ""} per day
                    <span className={`mc-days-left ${days === 0 ? "mc-days--out" : days <= 7 ? "mc-days--low" : ""}`}>
                      {" "}&middot; {days === 0 ? "No stock" : `${days} day${days !== 1 ? "s" : ""} left`}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}

          {/* All medicines table with restock */}
          <div className="mc-section-label">
            All medicines
            <button className="mc-add-btn" onClick={() => setShowAddForm(!showAddForm)}>
              {showAddForm ? "Cancel" : "+ Add Medicine"}
            </button>
          </div>
          {addStatus && (
            <div className={`mc-notify-result ${addStatus.ok ? "" : "mc-notify-result--err"}`} style={{ margin: "0 1.25rem 0.5rem" }}>
              {addStatus.msg}
            </div>
          )}
          {showAddForm && (
            <form className="mc-add-form" onSubmit={handleAddMedicine}>
              <input required placeholder="Medicine name" value={addForm.Name} onChange={e => setAddForm(p => ({ ...p, Name: e.target.value }))} />
              <div className="mc-add-row">
                <label>Time <input type="time" value={addForm.ReminderTime?.slice(0, 5)} onChange={e => setAddForm(p => ({ ...p, ReminderTime: e.target.value + ":00" }))} /></label>
                <label>Stock <input type="number" min="0" value={addForm.Stock} onChange={e => setAddForm(p => ({ ...p, Stock: +e.target.value }))} /></label>
                <label>Dose <input type="number" min="1" value={addForm.Dose} onChange={e => setAddForm(p => ({ ...p, Dose: +e.target.value }))} /></label>
              </div>
              <input placeholder="Instructions (optional)" value={addForm.Instructions} onChange={e => setAddForm(p => ({ ...p, Instructions: e.target.value }))} />
              <button type="submit" className="mc-btn-take" style={{ width: "100%" }}>Add Medicine</button>
            </form>
          )}
          <div className="mc-all-meds-table">
            <table>
              <thead>
                <tr><th>Medicine</th><th>Time</th><th>Dose</th><th>Stock</th><th>Days Left</th><th>Restock</th></tr>
              </thead>
              <tbody>
                {sorted.map((med) => {
                  const stock = Number(med.Stock) || 0;
                  const dose = Number(med.Dose) || 1;
                  const days = daysLeft(stock, dose);
                  const isRestocking = restockMed?.Name === med.Name && restockMed?.ReminderTime === med.ReminderTime;
                  return (
                    <tr key={`all-${med.Name}-${med.ReminderTime}`}>
                      <td className="mc-table-name">{med.Name}</td>
                      <td>{formatTime(med.ReminderTime)}</td>
                      <td>{dose}</td>
                      <td className={stock === 0 ? "mc-table-out" : stock <= 5 ? "mc-table-low" : "mc-table-ok"}>
                        {stock === 0 ? "Out" : stock}
                      </td>
                      <td className={days === 0 ? "mc-table-out" : days <= 7 ? "mc-table-low" : "mc-table-ok"}>
                        {days === 0 ? "0" : days}
                      </td>
                      <td>
                        {isRestocking ? (
                          <div className="mc-restock-inline">
                            <input type="number" min="1" value={restockAmount} onChange={e => setRestockAmount(+e.target.value)} className="mc-restock-input" />
                            <button className="mc-restock-ok" onClick={() => handleRestock(med)}>+</button>
                            <button className="mc-restock-cancel" onClick={() => setRestockMed(null)}>x</button>
                          </div>
                        ) : (
                          <button className="mc-restock-btn" onClick={() => { setRestockMed(med); setRestockAmount(dose * RESTOCK_BUFFER_DAYS); }}>
                            Restock
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Restock schedule recommendation */}
          {restockSchedule.length > 0 && (
            <>
              <div className="mc-section-label">Restock schedule (recommended)</div>
              <div className="mc-restock-schedule">
                {restockSchedule.map((r, i) => (
                  <div key={i} className={`mc-restock-item ${r.isPastDue ? "mc-restock-item--urgent" : ""}`}>
                    <div className="mc-restock-item-top">
                      <span className="mc-restock-name">{r.name}</span>
                      <span className={`mc-stock ${r.days === 0 ? "mc-stock--out" : r.days <= 7 ? "mc-stock--low" : "mc-stock--ok"}`}>
                        {r.days === 0 ? "Out" : `${r.days} days left`}
                      </span>
                    </div>
                    <div className="mc-restock-details">
                      <span>{r.isPastDue ? "Buy ASAP" : `Buy by ${formatDate(r.buyByDate)}`}</span>
                      <span>Runs out {formatDate(r.runsOutDate)}</span>
                    </div>
                    <div className="mc-restock-rec">
                      Buy <strong>{r.dosesToBuy} doses</strong> ({r.dose}/day x {RESTOCK_BUFFER_DAYS} days)
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Tomorrow's medicines */}
          <div className="mc-section-label">Tomorrow — {tomorrowStr}</div>
          {sorted.map((med) => {
            const dose = Number(med.Dose) || 1;
            const stock = Number(med.Stock) || 0;
            return (
              <div key={`tmr-${med.Name}-${med.ReminderTime}`} className="mc-card mc-card--tomorrow">
                <div className="mc-card-body">
                  <div className="mc-card-top">
                    <div>
                      <div className="mc-card-name-row"><span className="mc-card-name">{med.Name}</span></div>
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
