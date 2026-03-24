import { useEffect, useState, useCallback } from "react";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000";
const ELDERLY_ID = 111;
const RESTOCK_LEAD_DAYS = 7;
const RESTOCK_BUFFER_DAYS = 30;

async function get(url) {
  try { const r = await fetch(`${API_BASE}${url}`, { signal: AbortSignal.timeout(8000) }); return r.ok ? r.json() : null; } catch { return null; }
}
async function postJson(url, body) {
  const r = await fetch(`${API_BASE}${url}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(10000) });
  if (!r.ok) { const t = await r.text().catch(() => ""); throw new Error(`${r.status}: ${t}`); }
  const t = await r.text(); return t ? JSON.parse(t) : { ok: true };
}
async function putJson(url, body) {
  const r = await fetch(`${API_BASE}${url}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(10000) });
  if (!r.ok) { const t = await r.text().catch(() => ""); throw new Error(`${r.status}: ${t}`); }
  const t = await r.text(); return t ? JSON.parse(t) : { ok: true };
}

function fmtTime(t) { if (!t) return "-"; const [h, m] = t.split(":").map(Number); return `${h % 12 || 12}:${(m || 0).toString().padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`; }
function fmtDate(d) { return d.toLocaleDateString("en-SG", { day: "numeric", month: "short" }); }
function timeMin(t) { if (!t) return 99999; const [h, m] = t.split(":").map(Number); return h * 60 + (m || 0); }
function calcDaysLeft(stock, dose) { const d = Number(dose) || 1, s = Number(stock) || 0; return s <= 0 ? 0 : Math.floor(s / d); }

function getRestockSchedule(meds) {
  const today = new Date();
  return meds.map(med => {
    const dose = Number(med.Dose) || 1, stock = Number(med.Stock) || 0;
    const days = calcDaysLeft(stock, dose);
    const runsOut = new Date(today); runsOut.setDate(runsOut.getDate() + days);
    const buyBy = new Date(runsOut); buyBy.setDate(buyBy.getDate() - RESTOCK_LEAD_DAYS);
    const remaining = Math.max(0, stock - (dose * Math.max(0, days - RESTOCK_LEAD_DAYS)));
    const toBuy = Math.max(0, (dose * RESTOCK_BUFFER_DAYS) - remaining);
    return { name: med.Name, dose, stock, days, runsOut, buyBy, toBuy, urgent: buyBy <= today };
  }).sort((a, b) => a.days - b.days);
}

export default function Medicare() {
  const [meds, setMeds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [clock, setClock] = useState("");
  const [sending, setSending] = useState(false);
  const [notifyResult, setNotifyResult] = useState(null);
  const [dayView, setDayView] = useState("today");
  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState({ Name: "", ReminderTime: "08:00:00", Stock: 30, Dose: 1, Instructions: "" });
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
    } else if (meds.length === 0) { setError("Could not load medication data."); }
    setLoading(false);
  }, []);

  useEffect(() => {
    const tick = () => { const n = new Date(), h = n.getHours(), m = n.getMinutes(); setClock(`${h % 12 || 12}:${m.toString().padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`); };
    tick(); const t = setInterval(tick, 1000); return () => clearInterval(t);
  }, []);

  useEffect(() => { loadData(); const t = setInterval(loadData, 30000); return () => clearInterval(t); }, [loadData]);

  async function handleSendNotification() {
    if (sending || !meds.length) return;
    setSending(true); setNotifyResult(null);
    try { setNotifyResult(await postJson("/medicine/notify", { elderlyId: ELDERLY_ID, medicines: meds })); } catch { setNotifyResult({ error: "Failed" }); }
    setSending(false); setTimeout(() => setNotifyResult(null), 8000);
  }

  async function handleAddMedicine(e) {
    e.preventDefault(); setAddStatus(null);
    try {
      await postJson("/medicine/create", { Name: addForm.Name, ElderlyId: ELDERLY_ID, ReminderTime: addForm.ReminderTime, Stock: addForm.Stock, Dose: addForm.Dose, Instructions: addForm.Instructions, IsActive: true });
      setAddStatus({ ok: true, msg: "Medicine added" }); setAddForm({ Name: "", ReminderTime: "08:00:00", Stock: 30, Dose: 1, Instructions: "" }); setShowAddForm(false); loadData();
    } catch (err) { setAddStatus({ ok: false, msg: err.message }); }
    setTimeout(() => setAddStatus(null), 5000);
  }

  async function handleRestock(med) {
    try {
      await putJson("/medicine/update", { Name: med.Name, ElderlyId: ELDERLY_ID, ReminderTime: med.ReminderTime, Stock: (Number(med.Stock) || 0) + restockAmount, Dose: Number(med.Dose) || 1, Instructions: med.Instructions || "", IsActive: true });
      setRestockMed(null); setRestockAmount(0); loadData();
    } catch (err) { alert("Restock failed: " + err.message); }
  }

  async function handleDelete(med) {
    if (!confirm(`Remove ${med.Name}? This will deactivate the medicine.`)) return;
    try {
      await putJson("/medicine/update", { Name: med.Name, ElderlyId: ELDERLY_ID, ReminderTime: med.ReminderTime, Stock: Number(med.Stock) || 0, Dose: Number(med.Dose) || 1, Instructions: med.Instructions || "", IsActive: false });
      loadData();
    } catch (err) { alert("Delete failed: " + err.message); }
  }

  const sorted = [...meds].sort((a, b) => timeMin(a.ReminderTime) - timeMin(b.ReminderTime));
  const outOfStock = meds.filter(m => !Number(m.Stock));
  const lowStock = meds.filter(m => Number(m.Stock) > 0 && Number(m.Stock) <= 5);
  const restockSchedule = getRestockSchedule(meds);
  const h = new Date().getHours();
  const greeting = h < 12 ? "morning" : h < 18 ? "afternoon" : "evening";
  const today = new Date();
  const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);

  if (loading) return <div className="mc-loading"><div className="mc-loader-icon">&#x1F48A;</div><div className="mc-loader-ring" /><div className="mc-loader-text">Loading medicines...</div></div>;
  if (error && !meds.length) return <div className="mc-error"><div className="mc-error-card"><div className="mc-error-icon">&#x26A0;&#xFE0F;</div><h2>Unable to Connect</h2><p>{error}</p><button className="mc-btn-retry" onClick={loadData}>Try Again</button></div></div>;

  return (
    <div className="mc-app">
      <div className="mc-header">
        <div className="mc-header-brand"><div className="mc-brand-dot">&#x1F48A;</div><span className="mc-brand-name">Medicare</span></div>
        <div className="mc-clock">{clock}</div>
      </div>

      <div className="mc-greeting">
        <div className="mc-greeting-label">Good {greeting}</div>
        <div className="mc-greeting-title">Medicine Overview</div>
        <div className="mc-greeting-date">{today.toLocaleDateString("en-SG", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</div>
      </div>

      {/* Warnings */}
      {outOfStock.length > 0 && <div className="mc-warn mc-warn--danger"><strong>Out of stock:</strong> {outOfStock.map(m => m.Name).join(", ")}</div>}
      {lowStock.length > 0 && <div className="mc-warn mc-warn--low"><strong>Low stock:</strong> {lowStock.map(m => `${m.Name} (${m.Stock})`).join(", ")}</div>}

      {/* Test notification */}
      <div style={{ margin: "0.5rem 1.25rem" }}>
        <button className="mc-btn-take" style={{ width: "100%", opacity: sending ? 0.6 : 1 }} onClick={handleSendNotification} disabled={sending || !meds.length}>
          {sending ? "Sending..." : "Send Reminder (Test SMS + Email)"}
        </button>
        {notifyResult && <div className="mc-notify-result">SMS: {notifyResult.sms?.status || "error"} | Email: {notifyResult.email?.status || "error"}</div>}
      </div>

      {/* Day toggle + medicine cards */}
      {meds.length > 0 && (
        <>
          <div className="mc-day-toggle">
            <button className={`mc-day-btn ${dayView === "today" ? "mc-day-btn--active" : ""}`} onClick={() => setDayView("today")}>
              Today
            </button>
            <button className={`mc-day-btn ${dayView === "tomorrow" ? "mc-day-btn--active" : ""}`} onClick={() => setDayView("tomorrow")}>
              Tomorrow ({tomorrow.toLocaleDateString("en-SG", { weekday: "short", day: "numeric", month: "short" })})
            </button>
          </div>

          {sorted.map((med) => {
            const dose = Number(med.Dose) || 1, stock = Number(med.Stock) || 0, days = calcDaysLeft(stock, dose);
            return (
              <div key={`${dayView}-${med.Name}-${med.ReminderTime}`} className={`mc-card ${dayView === "tomorrow" ? "mc-card--tomorrow" : ""}`}>
                <div className="mc-card-body">
                  <div className="mc-card-top">
                    <div>
                      <span className="mc-card-name">{med.Name}</span>
                      <div className="mc-card-time">{fmtTime(med.ReminderTime)}</div>
                    </div>
                    <div className="mc-card-right">
                      <span className={`mc-stock ${stock === 0 ? "mc-stock--out" : stock <= 5 ? "mc-stock--low" : "mc-stock--ok"}`}>
                        {stock === 0 ? "Out" : `${stock} in stock`}
                      </span>
                      <span className={`mc-days-badge ${days === 0 ? "mc-days--out" : days <= 7 ? "mc-days--low" : "mc-days--ok"}`}>
                        {days === 0 ? "0d" : `${days}d`} left
                      </span>
                    </div>
                  </div>
                  <div className="mc-card-dose">{dose} dose{dose > 1 ? "s" : ""}/day &middot; {med.Instructions || "No special instructions"}</div>
                </div>
              </div>
            );
          })}
        </>
      )}

      {/* All medicines table */}
      <div className="mc-section-label">
        All medicines
        <button className="mc-add-btn" onClick={() => setShowAddForm(!showAddForm)}>{showAddForm ? "Cancel" : "+ Add"}</button>
      </div>
      {addStatus && <div className={`mc-notify-result ${addStatus.ok ? "" : "mc-notify-result--err"}`} style={{ margin: "0 1.25rem 0.5rem" }}>{addStatus.msg}</div>}
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
          <thead><tr><th>Medicine</th><th>Time</th><th>Dose</th><th>Stock</th><th>Days</th><th>Restock</th><th></th></tr></thead>
          <tbody>
            {sorted.map((med) => {
              const stock = Number(med.Stock) || 0, dose = Number(med.Dose) || 1, days = calcDaysLeft(stock, dose);
              const isRestocking = restockMed?.Name === med.Name && restockMed?.ReminderTime === med.ReminderTime;
              return (
                <tr key={`all-${med.Name}-${med.ReminderTime}`}>
                  <td className="mc-table-name">{med.Name}</td>
                  <td>{fmtTime(med.ReminderTime)}</td>
                  <td>{dose}</td>
                  <td className={stock === 0 ? "mc-table-out" : stock <= 5 ? "mc-table-low" : "mc-table-ok"}>{stock === 0 ? "Out" : stock}</td>
                  <td className={days === 0 ? "mc-table-out" : days <= 7 ? "mc-table-low" : "mc-table-ok"}>{days}</td>
                  <td>
                    {isRestocking ? (
                      <div className="mc-restock-inline">
                        <input type="number" min="1" value={restockAmount} onChange={e => setRestockAmount(+e.target.value)} className="mc-restock-input" />
                        <button className="mc-restock-ok" onClick={() => handleRestock(med)}>+</button>
                        <button className="mc-restock-cancel" onClick={() => setRestockMed(null)}>x</button>
                      </div>
                    ) : (
                      <button className="mc-restock-btn" onClick={() => { setRestockMed(med); setRestockAmount(dose * RESTOCK_BUFFER_DAYS); }}>Restock</button>
                    )}
                  </td>
                  <td><button className="mc-delete-btn" onClick={() => handleDelete(med)}>&#x2715;</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Restock schedule */}
      {restockSchedule.length > 0 && (
        <>
          <div className="mc-section-label">Restock schedule</div>
          <div className="mc-restock-schedule">
            {restockSchedule.map((r, i) => (
              <div key={i} className={`mc-restock-item ${r.urgent ? "mc-restock-item--urgent" : ""}`}>
                <div className="mc-restock-item-top">
                  <span className="mc-restock-name">{r.name}</span>
                  <span className={`mc-stock ${r.days === 0 ? "mc-stock--out" : r.days <= 7 ? "mc-stock--low" : "mc-stock--ok"}`}>{r.days === 0 ? "Out" : `${r.days}d left`}</span>
                </div>
                <div className="mc-restock-details">
                  <span>{r.urgent ? "Buy ASAP" : `Buy by ${fmtDate(r.buyBy)}`}</span>
                  <span>Runs out {fmtDate(r.runsOut)}</span>
                </div>
                <div className="mc-restock-rec">Buy <strong>{r.toBuy} doses</strong> ({r.dose}/day x {RESTOCK_BUFFER_DAYS} days)</div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
