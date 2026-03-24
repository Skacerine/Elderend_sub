import { useEffect, useState, useCallback } from "react";
import AlertPopup from "./AlertPopup";
import { connectToAlerts } from "./socket";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000";
const ELDERLY_ID = 1;
const RESTOCK_LEAD_DAYS = 7;
const RESTOCK_BUFFER_DAYS = 30;
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DAY_FULL = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

// ── API helpers ──
async function api(method, url, body) {
  const opts = { method, headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(10000) };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(`${API_BASE}${url}`, opts);
  if (!r.ok) { const t = await r.text().catch(() => ""); throw new Error(`${r.status}: ${t}`); }
  const t = await r.text(); return t ? JSON.parse(t) : { ok: true };
}
async function get(url) { try { const r = await fetch(`${API_BASE}${url}`, { signal: AbortSignal.timeout(8000) }); return r.ok ? r.json() : null; } catch { return null; } }

// ── Utility ──
function fmtTime(t) { if (!t) return "-"; const [h, m] = t.split(":").map(Number); return `${h % 12 || 12}:${(m || 0).toString().padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`; }
function fmtDate(d) { return d.toLocaleDateString("en-SG", { day: "numeric", month: "short" }); }
function timeMin(t) { if (!t) return 99999; const [h, m] = t.split(":").map(Number); return h * 60 + (m || 0); }
function calcDays(stock, dose) { const d = Number(dose) || 1, s = Number(stock) || 0; return s <= 0 ? 0 : Math.floor(s / d); }
function jsDay(d) { return d.getDay() === 0 ? 6 : d.getDay() - 1; } // 0=Mon..6=Sun

// Convert Day API field ("Mon,Wed,Fri") to index array [0,2,4]
function parseDayField(dayStr) {
  if (!dayStr || dayStr === "0" || dayStr === "") return null; // not set yet
  return dayStr.split(",").map(d => DAYS.indexOf(d.trim())).filter(i => i >= 0);
}

// Convert index array [0,2,4] to API string "Mon,Wed,Fri"
function dayIndexesToStr(indices) {
  return indices.map(i => DAYS[i]).join(",");
}

// Get schedule days: API field first, then local state, then default all days
function getMedDays(med, scheduleMap) {
  const fromApi = parseDayField(med.Day);
  if (fromApi && fromApi.length > 0) return fromApi;
  const key = `${med.Name}_${med.ReminderTime}`;
  return scheduleMap[key] || [0, 1, 2, 3, 4, 5, 6];
}

function getRestockSchedule(meds) {
  const today = new Date();
  return meds.map(med => {
    const dose = Number(med.Dose) || 1, stock = Number(med.Stock) || 0, days = calcDays(stock, dose);
    const runsOut = new Date(today); runsOut.setDate(runsOut.getDate() + days);
    const buyBy = new Date(runsOut); buyBy.setDate(buyBy.getDate() - RESTOCK_LEAD_DAYS);
    const remaining = Math.max(0, stock - (dose * Math.max(0, days - RESTOCK_LEAD_DAYS)));
    return { name: med.Name, dose, stock, days, runsOut, buyBy, toBuy: Math.max(0, (dose * RESTOCK_BUFFER_DAYS) - remaining), urgent: buyBy <= today };
  }).sort((a, b) => a.days - b.days);
}

// ── Calendar helpers ──
function getMonthGrid(year, month) {
  const first = new Date(year, month, 1);
  const startDay = first.getDay() === 0 ? 6 : first.getDay() - 1; // Mon=0
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < startDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export default function Medicare() {
  const [meds, setMeds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sending, setSending] = useState(false);
  const [notifyResult, setNotifyResult] = useState(null);
  const [tab, setTab] = useState("schedule");
  const [selectedDay, setSelectedDay] = useState(jsDay(new Date()));
  const [calMonth, setCalMonth] = useState(new Date().getMonth());
  const [calYear, setCalYear] = useState(new Date().getFullYear());
  const [calSelected, setCalSelected] = useState(new Date().getDate());
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({ Name: "", ReminderTime: "08:00:00", Stock: 30, Dose: 1, Instructions: "", days: [0, 1, 2, 3, 4, 5, 6] });
  const [addStatus, setAddStatus] = useState(null);
  const [restockMed, setRestockMed] = useState(null);
  const [restockAmt, setRestockAmt] = useState(0);
  const [scheduleMap, setScheduleMap] = useState({}); // medKey → dayIndex[]
  const [popupAlert, setPopupAlert] = useState(null);

  const loadData = useCallback(async () => {
    let data = ELDERLY_ID ? await get(`/medicine/${ELDERLY_ID}`) : null;
    if (!data) data = await get("/medicine");
    if (data) {
      let arr = Array.isArray(data) ? data : [data];
      if (ELDERLY_ID) arr = arr.filter(m => !m.ElderlyId || String(m.ElderlyId) === String(ELDERLY_ID));
      setMeds(arr.filter(m => m.IsActive === true || m.IsActive === 1 || m.IsActive === "true" || m.IsActive === "1"));
      setError(null);
    } else if (meds.length === 0) setError("Could not load medication data.");
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); const t = setInterval(loadData, 30000); return () => clearInterval(t); }, [loadData]);

  // WebSocket listener for fall detection alerts
  useEffect(() => {
    const ws = connectToAlerts({
      onMessage: (message) => {
        if (message.type === "drop_alert") {
          const d = message.data || message.incident || {};
          setPopupAlert({ source: "guardian", elderlyId: d.elderlyId || "-", score: d.score, severity: d.severity, timestamp: new Date().toISOString() });
        }
      }
    });
    return () => ws.close();
  }, []);

  // ── Actions ──
  async function handleNotify() {
    if (sending || !meds.length) return;
    setSending(true); setNotifyResult(null);
    try { setNotifyResult(await api("POST", "/medicine/notify", { elderlyId: ELDERLY_ID, medicines: meds })); } catch { setNotifyResult({ error: "Failed" }); }
    setSending(false); setTimeout(() => setNotifyResult(null), 6000);
  }

  async function handleAdd(e) {
    e.preventDefault(); setAddStatus(null);
    try {
      await api("POST", "/medicine/create", { Name: addForm.Name, ElderlyId: ELDERLY_ID, ReminderTime: addForm.ReminderTime, Stock: addForm.Stock, Dose: addForm.Dose, Instructions: addForm.Instructions, IsActive: true, Day: dayIndexesToStr(addForm.days) });
      const key = `${addForm.Name}_${addForm.ReminderTime}`;
      setScheduleMap(prev => ({ ...prev, [key]: addForm.days }));
      setAddStatus({ ok: true }); setAddForm({ Name: "", ReminderTime: "08:00:00", Stock: 30, Dose: 1, Instructions: "", days: [0, 1, 2, 3, 4, 5, 6] }); setShowAdd(false); loadData();
    } catch (err) { setAddStatus({ ok: false, msg: err.message }); }
    setTimeout(() => setAddStatus(null), 4000);
  }

  async function handleStockChange(med, delta) {
    const newStock = Math.max(0, (Number(med.Stock) || 0) + delta);
    try {
      await api("PUT", "/medicine/update", { Name: med.Name, ElderlyId: ELDERLY_ID, ReminderTime: med.ReminderTime, Stock: newStock, Dose: Number(med.Dose) || 1, Instructions: med.Instructions || "", IsActive: true, Day: med.Day || dayIndexesToStr(getMedDays(med, scheduleMap)) });
      setRestockMed(null); setRestockAmt(0); loadData();
    } catch (err) { alert("Failed: " + err.message); }
  }

  async function handleDelete(med) {
    if (!confirm(`Remove ${med.Name}?`)) return;
    try { await api("PUT", "/medicine/update", { Name: med.Name, ElderlyId: ELDERLY_ID, ReminderTime: med.ReminderTime, Stock: Number(med.Stock) || 0, Dose: Number(med.Dose) || 1, Instructions: med.Instructions || "", IsActive: false, Day: med.Day || "0" }); loadData(); }
    catch (err) { alert("Failed: " + err.message); }
  }

  function toggleScheduleDay(med, dayIdx) {
    const key = `${med.Name}_${med.ReminderTime}`;
    const current = getMedDays(med, scheduleMap);
    const updated = current.includes(dayIdx) ? current.filter(d => d !== dayIdx) : [...current, dayIdx].sort();
    setScheduleMap(prev => ({ ...prev, [key]: updated }));
    // Sync to OutSystems (fire and forget)
    api("PUT", "/medicine/update", {
      Name: med.Name, ElderlyId: ELDERLY_ID, ReminderTime: med.ReminderTime,
      Stock: Number(med.Stock) || 0, Dose: Number(med.Dose) || 1,
      Instructions: med.Instructions || "", IsActive: true,
      Day: dayIndexesToStr(updated)
    }).catch(() => {});
  }

  // ── Derived ──
  const sorted = [...meds].sort((a, b) => timeMin(a.ReminderTime) - timeMin(b.ReminderTime));
  const medsForDay = (dayIdx) => sorted.filter(m => getMedDays(m, scheduleMap).includes(dayIdx));
  const todayIdx = jsDay(new Date());
  const todayMeds = medsForDay(todayIdx);
  const outOfStock = meds.filter(m => !Number(m.Stock));
  const lowStock = meds.filter(m => Number(m.Stock) > 0 && Number(m.Stock) <= 5);
  const restock = getRestockSchedule(meds);
  const calGrid = getMonthGrid(calYear, calMonth);
  const calMonthName = new Date(calYear, calMonth).toLocaleDateString("en-SG", { month: "long", year: "numeric" });

  // Get dates for current week (Mon-Sun)
  const weekDates = (() => {
    const now = new Date();
    const dayOfWeek = now.getDay() === 0 ? 6 : now.getDay() - 1; // Mon=0
    return DAYS.map((_, i) => {
      const d = new Date(now);
      d.setDate(now.getDate() - dayOfWeek + i);
      return d;
    });
  })();

  // Calendar: which day of the selected calendar date
  const calDate = new Date(calYear, calMonth, calSelected);
  const calDayIdx = jsDay(calDate);
  const calMeds = medsForDay(calDayIdx);

  if (loading) return <div className="mc-loading"><div className="mc-loader-icon">&#x1F48A;</div><div className="mc-loader-ring" /><div className="mc-loader-text">Loading...</div></div>;
  if (error && !meds.length) return <div className="mc-error"><div className="mc-error-card"><h2>Unable to Connect</h2><p>{error}</p><button className="mc-btn-retry" onClick={loadData}>Retry</button></div></div>;

  return (
    <div className="mc-app">
      {/* Header */}
      <div className="mc-header">
        <div className="mc-header-brand"><div className="mc-brand-dot">&#x1F48A;</div><span className="mc-brand-name">Medicare</span></div>
      </div>

      {/* Warnings */}
      {outOfStock.length > 0 && <div className="mc-warn mc-warn--danger"><strong>Out of stock:</strong> {outOfStock.map(m => m.Name).join(", ")}</div>}
      {lowStock.length > 0 && <div className="mc-warn mc-warn--low"><strong>Low:</strong> {lowStock.map(m => `${m.Name} (${m.Stock})`).join(", ")}</div>}

      {/* Tabs */}
      <div className="mc-tabs">
        {[["schedule", "Schedule"], ["calendar", "Calendar"], ["inventory", "Inventory"]].map(([k, label]) => (
          <button key={k} className={`mc-tab ${tab === k ? "mc-tab--active" : ""}`} onClick={() => setTab(k)}>{label}</button>
        ))}
      </div>

      {/* ═══ SCHEDULE TAB ═══ */}
      {tab === "schedule" && (
        <div className="mc-tab-content">
          {/* Day selector */}
          <div className="mc-week-bar">
            {DAYS.map((d, i) => (
              <button key={d} className={`mc-week-day ${selectedDay === i ? "mc-week-day--active" : ""} ${i === todayIdx ? "mc-week-day--today" : ""}`} onClick={() => setSelectedDay(i)}>
                <span className="mc-week-day-label">{d}</span>
                <span className="mc-week-day-date">{weekDates[i].getDate()}</span>
                {medsForDay(i).length > 0 && <span className="mc-week-day-dot" />}
              </button>
            ))}
          </div>

          <div className="mc-day-title">
            {DAY_FULL[selectedDay]}, {weekDates[selectedDay].toLocaleDateString("en-SG", { day: "numeric", month: "long" })}
            {selectedDay === todayIdx ? " (Today)" : ""}
          </div>

          {medsForDay(selectedDay).length === 0 ? (
            <div className="mc-empty-small">No medicines scheduled for {DAY_FULL[selectedDay]}</div>
          ) : (
            <div className="mc-schedule-list">
              {medsForDay(selectedDay).map(med => {
                const dose = Number(med.Dose) || 1, stock = Number(med.Stock) || 0, days = calcDays(stock, dose);
                return (
                  <div key={`${med.Name}-${med.ReminderTime}`} className="mc-sched-card">
                    <div className="mc-sched-time">{fmtTime(med.ReminderTime)}</div>
                    <div className="mc-sched-body">
                      <div className="mc-sched-name">{med.Name}</div>
                      <div className="mc-sched-meta">{dose} dose{dose > 1 ? "s" : ""} &middot; {med.Instructions || "No instructions"}</div>
                      <div className="mc-sched-tags">
                        <span className={`mc-tag ${stock === 0 ? "mc-tag--red" : stock <= 5 ? "mc-tag--amber" : "mc-tag--green"}`}>{stock === 0 ? "Out" : `${stock} stock`}</span>
                        <span className={`mc-tag ${days === 0 ? "mc-tag--red" : days <= 7 ? "mc-tag--amber" : "mc-tag--green"}`}>{days}d left</span>
                        <span className="mc-tag mc-tag--blue">{getMedDays(med, scheduleMap).map(d => DAYS[d]).join(" ")}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Send reminder */}
          <button className="mc-notify-btn" onClick={handleNotify} disabled={sending || !meds.length}>
            {sending ? "Sending..." : "Send Reminder (SMS + Email)"}
          </button>
          {notifyResult && <div className="mc-notify-result">SMS: {notifyResult.sms?.status || "error"} | Email: {notifyResult.email?.status || "error"}</div>}
        </div>
      )}

      {/* ═══ CALENDAR TAB ═══ */}
      {tab === "calendar" && (
        <div className="mc-tab-content">
          <div className="mc-cal-header">
            <button className="mc-cal-nav" onClick={() => { if (calMonth === 0) { setCalMonth(11); setCalYear(y => y - 1); } else setCalMonth(m => m - 1); }}>&lt;</button>
            <span className="mc-cal-title">{calMonthName}</span>
            <button className="mc-cal-nav" onClick={() => { if (calMonth === 11) { setCalMonth(0); setCalYear(y => y + 1); } else setCalMonth(m => m + 1); }}>&gt;</button>
          </div>

          <div className="mc-cal-grid">
            {DAYS.map(d => <div key={d} className="mc-cal-head">{d}</div>)}
            {calGrid.map((day, i) => {
              if (day === null) return <div key={`e${i}`} className="mc-cal-cell mc-cal-cell--empty" />;
              const cellDate = new Date(calYear, calMonth, day);
              const cellDayIdx = jsDay(cellDate);
              const cellMeds = medsForDay(cellDayIdx);
              const isToday = day === new Date().getDate() && calMonth === new Date().getMonth() && calYear === new Date().getFullYear();
              const isSel = day === calSelected;
              return (
                <div key={day} className={`mc-cal-cell ${isToday ? "mc-cal-cell--today" : ""} ${isSel ? "mc-cal-cell--selected" : ""}`} onClick={() => setCalSelected(day)}>
                  <span className="mc-cal-num">{day}</span>
                  {cellMeds.length > 0 && (
                    <div className="mc-cal-dots">
                      {cellMeds.slice(0, 3).map((m, j) => <div key={j} className="mc-cal-dot" />)}
                      {cellMeds.length > 3 && <span className="mc-cal-more">+{cellMeds.length - 3}</span>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Selected day detail */}
          <div className="mc-cal-detail">
            <div className="mc-cal-detail-title">{calDate.toLocaleDateString("en-SG", { weekday: "long", day: "numeric", month: "long" })}</div>
            {calMeds.length === 0 ? (
              <div className="mc-empty-small">No medicines</div>
            ) : calMeds.map(med => (
              <div key={`cal-${med.Name}`} className="mc-cal-med">
                <span className="mc-cal-med-time">{fmtTime(med.ReminderTime)}</span>
                <span className="mc-cal-med-name">{med.Name}</span>
                <span className="mc-cal-med-dose">{Number(med.Dose) || 1} dose{(Number(med.Dose) || 1) > 1 ? "s" : ""}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ═══ INVENTORY TAB ═══ */}
      {tab === "inventory" && (
        <div className="mc-tab-content">
          <div className="mc-inv-header">
            <span className="mc-inv-title">All Medicines</span>
            <button className="mc-add-btn" onClick={() => setShowAdd(!showAdd)}>{showAdd ? "Cancel" : "+ Add"}</button>
          </div>

          {addStatus && <div className={`mc-notify-result ${addStatus.ok ? "" : "mc-notify-result--err"}`}>{addStatus.ok ? "Added!" : addStatus.msg}</div>}

          {showAdd && (
            <form className="mc-add-form" onSubmit={handleAdd}>
              <input required placeholder="Medicine name" value={addForm.Name} onChange={e => setAddForm(p => ({ ...p, Name: e.target.value }))} />
              <div className="mc-add-row">
                <label>Time <input type="time" value={addForm.ReminderTime?.slice(0, 5)} onChange={e => setAddForm(p => ({ ...p, ReminderTime: e.target.value + ":00" }))} /></label>
                <label>Stock <input type="number" min="0" value={addForm.Stock} onChange={e => setAddForm(p => ({ ...p, Stock: +e.target.value }))} /></label>
                <label>Dose <input type="number" min="1" value={addForm.Dose} onChange={e => setAddForm(p => ({ ...p, Dose: +e.target.value }))} /></label>
              </div>
              <input placeholder="Instructions (optional)" value={addForm.Instructions} onChange={e => setAddForm(p => ({ ...p, Instructions: e.target.value }))} />
              <div className="mc-day-picker">
                {DAYS.map((d, i) => (
                  <button key={d} type="button" className={`mc-day-pick ${addForm.days.includes(i) ? "mc-day-pick--on" : ""}`}
                    onClick={() => setAddForm(p => ({ ...p, days: p.days.includes(i) ? p.days.filter(x => x !== i) : [...p.days, i].sort() }))}>
                    {d}
                  </button>
                ))}
              </div>
              <button type="submit" className="mc-btn-take" style={{ width: "100%" }}>Add Medicine</button>
            </form>
          )}

          {/* Inventory cards */}
          {sorted.map(med => {
            const stock = Number(med.Stock) || 0, dose = Number(med.Dose) || 1, days = calcDays(stock, dose);
            const key = `${med.Name}_${med.ReminderTime}`;
            const isRestocking = restockMed?.Name === med.Name && restockMed?.ReminderTime === med.ReminderTime;
            const medDays = getMedDays(med, scheduleMap);
            return (
              <div key={key} className="mc-inv-card">
                <div className="mc-inv-card-top">
                  <div>
                    <div className="mc-inv-name">{med.Name}</div>
                    <div className="mc-inv-meta">{fmtTime(med.ReminderTime)} &middot; {dose} dose{dose > 1 ? "s" : ""}/day</div>
                  </div>
                  <button className="mc-delete-btn" onClick={() => handleDelete(med)}>&#x2715;</button>
                </div>

                {/* Day schedule pills */}
                <div className="mc-day-picker mc-day-picker--small">
                  {DAYS.map((d, i) => (
                    <button key={d} type="button" className={`mc-day-pick mc-day-pick--sm ${medDays.includes(i) ? "mc-day-pick--on" : ""}`}
                      onClick={() => toggleScheduleDay(med, i)}>{d[0]}</button>
                  ))}
                </div>

                <div className="mc-inv-stats">
                  <div className="mc-inv-stat">
                    <span className="mc-inv-stat-label">Stock</span>
                    <span className={`mc-inv-stat-val ${stock === 0 ? "mc-text--red" : stock <= 5 ? "mc-text--amber" : "mc-text--green"}`}>{stock}</span>
                  </div>
                  <div className="mc-inv-stat">
                    <span className="mc-inv-stat-label">Days left</span>
                    <span className={`mc-inv-stat-val ${days === 0 ? "mc-text--red" : days <= 7 ? "mc-text--amber" : "mc-text--green"}`}>{days}</span>
                  </div>
                  <div className="mc-inv-stat">
                    {isRestocking ? (
                      <div className="mc-restock-inline">
                        <button className="mc-restock-minus" onClick={() => handleStockChange(med, -restockAmt)}>-</button>
                        <input type="number" min="1" value={restockAmt} onChange={e => setRestockAmt(+e.target.value)} className="mc-restock-input" />
                        <button className="mc-restock-ok" onClick={() => handleStockChange(med, restockAmt)}>+</button>
                        <button className="mc-restock-cancel" onClick={() => setRestockMed(null)}>x</button>
                      </div>
                    ) : (
                      <button className="mc-restock-btn" onClick={() => { setRestockMed(med); setRestockAmt(dose * RESTOCK_BUFFER_DAYS); }}>Restock</button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {/* Restock schedule */}
          {restock.length > 0 && (
            <>
              <div className="mc-inv-header" style={{ marginTop: 16 }}><span className="mc-inv-title">Restock Schedule</span></div>
              {restock.map((r, i) => (
                <div key={i} className={`mc-restock-item ${r.urgent ? "mc-restock-item--urgent" : ""}`}>
                  <div className="mc-restock-item-top">
                    <span className="mc-restock-name">{r.name}</span>
                    <span className={`mc-tag ${r.days === 0 ? "mc-tag--red" : r.days <= 7 ? "mc-tag--amber" : "mc-tag--green"}`}>{r.days}d left</span>
                  </div>
                  <div className="mc-restock-details">
                    <span>{r.urgent ? "Buy ASAP" : `Buy by ${fmtDate(r.buyBy)}`}</span>
                    <span>Buy <strong>{r.toBuy}</strong> doses</span>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      )}

      <AlertPopup alert={popupAlert} onDismiss={() => setPopupAlert(null)} />
    </div>
  );
}
