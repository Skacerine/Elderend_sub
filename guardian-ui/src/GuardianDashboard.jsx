import { useEffect, useMemo, useRef, useState } from "react";
import { connectToAlerts } from "./socket";
import AlertPopup from "./AlertPopup";
import { useAuth } from "./AuthContext";

function formatTimestamp(value) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return String(value);
  }
}

function formatValue(value) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "number") return Number(value).toFixed(2);
  return String(value);
}

function severityTone(severity) {
  if (severity === "CRITICAL") return "Critical";
  if (severity === "FALLEN") return "Elevated";
  if (severity === "NORMAL") return "Normal";
  return "Low";
}

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000";

export default function GuardianDashboard() {
  const { user } = useAuth();
  const [messages, setMessages] = useState([]);
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [connectionState, setConnectionState] = useState("connecting");
  const [activeAlert, setActiveAlert] = useState(null);
  const [alarmActive, setAlarmActive] = useState(false);
  const [popupAlert, setPopupAlert] = useState(null);

  const audioRef = useRef(null);
  const audioEnabledRef = useRef(false);

  useEffect(() => {
    audioEnabledRef.current = audioEnabled;
  }, [audioEnabled]);

  // Load recent alerts from backend on mount
  useEffect(() => {
    fetch(`${API_BASE}/alerts?n=20`, { headers: { "ngrok-skip-browser-warning": "1" }, signal: AbortSignal.timeout(6000) })
      .then(r => r.ok ? r.json() : [])
      .then(data => {
        if (Array.isArray(data) && data.length > 0) {
          const mine = data.filter(a => String(a.elderlyId) === String(user?.elderlyId));
          const mapped = mine.map(a => ({
            ...a,
            receivedAt: a.receivedAt || new Date(a.alertTs).toISOString()
          }));
          setMessages(mapped);
          // Restore the most recent drop alert as active
          const lastDrop = mapped.find(m => m.type === "drop_alert");
          if (lastDrop) setActiveAlert(lastDrop);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const ws = connectToAlerts({
      onMessage: (message) => {
        const enrichedMessage = {
          ...message,
          receivedAt: new Date().toISOString()
        };

        if (message.type === "drop_alert") {
          const alertData = message.data || message.incident || {};
          if (String(alertData.elderlyId) !== String(user?.elderlyId)) return;
          setMessages((prev) => [enrichedMessage, ...prev].slice(0, 20));
          setActiveAlert(enrichedMessage);
          triggerGuardianAlert();

          setPopupAlert({
            source: "guardian",
            elderlyId: alertData.elderlyId || "—",
            score: alertData.score,
            severity: alertData.severity,
            message: alertData.message,
            timestamp: enrichedMessage.receivedAt
          });
          return;
        }

        if (message.type === "system_error" || message.type === "warning" || message.type === "system") {
          setMessages((prev) => [enrichedMessage, ...prev].slice(0, 20));
        }
      },
      onOpen: () => setConnectionState("connected"),
      onClose: () => setConnectionState("disconnected"),
      onError: () => setConnectionState("error")
    });

    return () => {
      ws.close();
    };
  }, []);

  function triggerGuardianAlert() {
    setAlarmActive(true);
    playAlarm();
    vibrateDevice();
  }

  function playAlarm() {
    if (!audioEnabledRef.current) return;
    if (!audioRef.current) return;

    audioRef.current.muted = false;
    audioRef.current.volume = 1;
    audioRef.current.currentTime = 0;
    audioRef.current.play().catch(console.error);
  }

  function testAlarmNow() {
    if (!audioRef.current) return;

    audioRef.current.muted = false;
    audioRef.current.volume = 1;
    audioRef.current.currentTime = 0;
    audioRef.current.play().catch(console.error);
  }

  function vibrateDevice() {
    if ("vibrate" in navigator) {
      navigator.vibrate([400, 180, 400, 180, 800]);
    }
  }

  async function handleEnableAudio() {
    if (!audioRef.current) return;

    try {
      audioRef.current.muted = false;
      audioRef.current.volume = 1;
      audioRef.current.currentTime = 0;
      await audioRef.current.play();
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      setAudioEnabled(true);
    } catch (error) {
      console.error("Audio enable failed:", error);
      alert("Browser blocked audio. Tap again to enable sound.");
    }
  }

  function handleStopAlarm() {
    setAlarmActive(false);

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }

    if ("vibrate" in navigator) {
      navigator.vibrate(0);
    }
  }

  function clearActiveAlert() {
    setActiveAlert(null);
    handleStopAlarm();
  }

  const alertData = activeAlert?.data || activeAlert?.incident || {};
  const elderlyId = alertData.elderlyId || user?.elderlyId || "—";
  const score = alertData.score ?? activeAlert?.score ?? "—";
  const severity = alertData.severity || activeAlert?.severity || "LOW";
  const totalAlerts = messages.filter((m) => m.type === "drop_alert").length;

  const connectionLabel = useMemo(() => {
    if (connectionState === "connected") return "Connected";
    if (connectionState === "disconnected") return "Disconnected";
    if (connectionState === "error") return "Error";
    return "Connecting";
  }, [connectionState]);

  const latestLogs = messages.slice(0, 8);

  return (
    <div className="guardian-app">
      <div className="guardian-shell">
        <div className="guardian-topbar">
          <div className="guardian-brand">
            <div className="brand-left">
              <div className="brand-mark">🛡️</div>
              <div>
                <div className="brand-title">ElderWatch Guardian Console</div>
                <div className="brand-subtitle">
                  Real-time fall monitoring and guardian alert system
                </div>
              </div>
            </div>

            <div className="brand-badges">
              <div className="status-pill status-pill--live">
                <span className="status-dot status-dot--green" />
                LIVE FEED
              </div>
              <div className={`status-pill ${alarmActive ? "status-pill--danger" : ""}`}>
                <span className={`status-dot ${alarmActive ? "status-dot--red" : "status-dot--cyan"}`} />
                {alarmActive ? "ALARM ACTIVE" : "SYSTEM ARMED"}
              </div>
            </div>
          </div>

          <div className="guardian-metrics">
            <div className="metric-card">
              <div className="metric-label">Connection</div>
              <div className="metric-value">{connectionLabel}</div>
              <div className="metric-foot">Live alert stream</div>
            </div>
            <div className="metric-card">
              <div className="metric-label">Alert Sound</div>
              <div className="metric-value">{audioEnabled ? "Enabled" : "Locked"}</div>
              <div className="metric-foot">Sound notification</div>
            </div>
            <div className="metric-card">
              <div className="metric-label">Fall Alerts</div>
              <div className="metric-value">{totalAlerts}</div>
              <div className="metric-foot">Since server started</div>
            </div>
          </div>

          <div className="guardian-live">
            <div className="live-strip">
              <div>
                <div className="live-title">Monitoring target</div>
                <div className="live-value">{elderlyId}</div>
              </div>
              <div className="status-pill">
                <span className="status-dot status-dot--cyan" />
                Active
              </div>
            </div>

            <div className="live-strip">
              <div>
                <div className="live-title">Current status</div>
                <div className="live-value">{activeAlert ? severityTone(severity) : "Nominal"}</div>
              </div>
              <div className={`status-pill ${severity === "CRITICAL" ? "status-pill--danger" : ""}`}>
                <span className={`status-dot ${severity === "CRITICAL" ? "status-dot--red" : "status-dot--green"}`} />
                {severityTone(severity)}
              </div>
            </div>
          </div>
        </div>

        <div className="guardian-grid">
          <div className="guardian-sidebar">
            <div className="panel">
              <div className="panel-header">
                <div className="panel-kicker">Guardian</div>
                <div className="panel-title">Response Controls</div>
                <div className="panel-subtitle">
                  Manage your alert settings and responses.
                </div>
              </div>
              <div className="panel-body">
                <div className="guardian-section">
                  <div className="info-card">
                    <div className="info-title">Assigned Guardian</div>
                    <div className="person-card">
                      <div className="avatar">
                        {user?.name ? user.name.trim().slice(0, 2).toUpperCase() : "??"}
                      </div>
                      <div>
                        <div className="person-name">{user?.name || "Unknown Guardian"}</div>
                        <div className="person-id">guardian-{user?.guardianId || "—"}</div>
                      </div>
                    </div>
                  </div>

                  <div className="stack">
                    <button className="control-button control-button--primary" onClick={handleEnableAudio}>
                      {audioEnabled ? "🔊 Alert Sound Enabled" : "🔇 Click to Enable Sound"}
                    </button>
                    <button className="control-button" onClick={testAlarmNow}>
                      Test Alarm Sound
                    </button>
                    <button className="control-button control-button--danger" onClick={handleStopAlarm}>
                      Stop Alarm
                    </button>
                    <button className="control-button control-button--ghost" onClick={clearActiveAlert}>
                      Clear Active Alert
                    </button>
                  </div>

                  <div className="control-help">
                    Tap "Enable Sound" so you'll hear an alarm when a fall is detected.
                  </div>
                </div>
              </div>
            </div>

          </div>

          <div className="guardian-main">
            <div className={`hero-alert ${activeAlert ? "hero-alert--danger" : ""}`}>
              <div className="hero-row">
                <div>
                  <div className="hero-kicker">{activeAlert ? "Active incident" : "System state"}</div>
                  <div className="hero-title">
                    {activeAlert ? "Possible fall detected" : "No current emergency"}
                  </div>
                </div>

                <div className={`status-pill ${activeAlert ? "status-pill--danger" : "status-pill--live"}`}>
                  <span className={`status-dot ${activeAlert ? "status-dot--red" : "status-dot--green"}`} />
                  {activeAlert ? "REQUIRES ATTENTION" : "MONITORING STABLE"}
                </div>
              </div>

              <div className="hero-copy">
                {activeAlert
                  ? "A possible fall has been detected. Please check on your elderly person and take appropriate action if needed."
                  : "The system is actively monitoring. You will be alerted immediately if a fall is detected."}
              </div>

              <div className="hero-stats">
                <div className="stat-tile">
                  <div className="stat-name">Date Time</div>
                  <div className="stat-value">{formatTimestamp(activeAlert?.receivedAt)}</div>
                </div>
                <div className="stat-tile">
                  <div className="stat-name">Elderly ID</div>
                  <div className="stat-value">{elderlyId}</div>
                </div>
                <div className="stat-tile">
                  <div className="stat-name">Alert Level</div>
                  <div className="stat-value">{severityTone(severity)}</div>
                </div>
              </div>

              <div className="hero-actions">
                <button className="control-button control-button--primary" onClick={testAlarmNow}>
                  Re-test Alert Sound
                </button>
                <button className="control-button" onClick={handleStopAlarm}>
                  Silence Alarm
                </button>
                <button className="control-button control-button--ghost" onClick={clearActiveAlert}>
                  Dismiss Incident Card
                </button>
              </div>
            </div>

            {/* Alert History */}
            <div className="panel" style={{ marginTop: 16 }}>
              <div className="panel-header">
                <div className="panel-kicker">History</div>
                <div className="panel-title">Recent Fall Alerts</div>
              </div>
              <div className="panel-body">
                {messages.filter(m => m.type === "drop_alert").length === 0 ? (
                  <div className="alert-empty">
                    No fall alerts yet. Alerts will appear here when detected.
                  </div>
                ) : (
                  <div className="log-list">
                    {messages.filter(m => m.type === "drop_alert").slice(0, 10).map((msg, index) => {
                      const d = msg.data || msg.incident || msg;
                      return (
                        <div key={`hist-${msg.receivedAt}-${index}`} className="log-item log-item--alert">
                          <div className="log-top">
                            <div className="log-type" style={{ color: "var(--red-strong, #f87171)" }}>
                              {d.severity || "FALL"}
                            </div>
                            <div className="log-time">{formatTimestamp(msg.receivedAt)}</div>
                          </div>
                          <div className="log-body">
                            Elderly {d.elderlyId || "—"} &middot; Score: {formatValue(d.score)} &middot; {severityTone(d.severity || "LOW")} risk
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

          </div>

        </div>

        <audio ref={audioRef} preload="auto" loop playsInline>
          <source src="/alarm.mp3" type="audio/mpeg" />
        </audio>
      </div>

      <AlertPopup alert={popupAlert} onDismiss={() => setPopupAlert(null)} />
    </div>
  );
}