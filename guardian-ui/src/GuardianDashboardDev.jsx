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
  if (severity === "HIGH") return "Critical";
  if (severity === "MEDIUM") return "Elevated";
  return "Low";
}

export default function GuardianDashboardDev() {
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

  useEffect(() => {
    const ws = connectToAlerts({
      onMessage: (message) => {
        const enrichedMessage = {
          ...message,
          receivedAt: new Date().toISOString()
        };

        if (message.type === "drop_alert") {
          setMessages((prev) => [enrichedMessage, ...prev].slice(0, 20));
          setActiveAlert(enrichedMessage);
          triggerGuardianAlert();

          const alertData = message.data || message.incident || {};
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
  const features = alertData.features || {};
  const incidentId = alertData.id || alertData.incidentId || "—";
  const elderlyId = alertData.elderlyId || user?.elderlyId || "—";
  const deviceId = alertData.deviceId || "PHONE_01";
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
                  Real-time fall monitoring, alert coordination, and guardian response control
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
              <div className="metric-foot">WebSocket alert stream</div>
            </div>
            <div className="metric-card">
              <div className="metric-label">Alert Sound</div>
              <div className="metric-value">{audioEnabled ? "Enabled" : "Locked"}</div>
              <div className="metric-foot">Browser audio permission</div>
            </div>
            <div className="metric-card">
              <div className="metric-label">Total Alerts</div>
              <div className="metric-value">{totalAlerts}</div>
              <div className="metric-foot">Last 20 retained events</div>
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
                Score threshold: 100
              </div>
            </div>

            <div className="live-strip">
              <div>
                <div className="live-title">Current risk state</div>
                <div className="live-value">{activeAlert ? severityTone(severity) : "Nominal"}</div>
              </div>
              <div className={`status-pill ${severity === "HIGH" ? "status-pill--danger" : ""}`}>
                <span className={`status-dot ${severity === "HIGH" ? "status-dot--red" : "status-dot--green"}`} />
                {severity}
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
                  Keep the dashboard armed, audible, and ready to respond.
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
                    The guardian dashboard requires a one-time user interaction to unlock browser audio.
                    Once enabled, new live alerts will ring automatically.
                  </div>
                </div>
              </div>
            </div>

            <div className="panel">
              <div className="panel-header">
                <div className="panel-kicker">System Notes</div>
                <div className="panel-title">Operational Guidance</div>
              </div>
              <div className="panel-body">
                <div className="stack">
                  <div className="info-card">
                    <div className="info-title">When to act</div>
                    <div className="footer-note">
                      A rising score usually reflects a suspicious sequence such as drop, impact,
                      rotation, and stillness. Alerts should be reviewed immediately, call your elderly!
                    </div>
                  </div>
                  <div className="info-card">
                    <div className="info-title">Threshold tuning</div>
                    <div className="footer-note">
                      The backend currently rings only at score 100 and above to reduce false alarms
                      from normal handling of phones.
                    </div>
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
                  ? "A suspicious motion event crossed the configured risk threshold. Review the score, device details, and motion features below, then decide whether guardian intervention is needed."
                  : "The system is connected and listening for live drop alerts from the elderly phone app. No active emergency is currently being processed."}
              </div>

              <div className="hero-stats">
                <div className="stat-tile">
                  <div className="stat-name">Incident ID</div>
                  <div className="stat-value">{incidentId}</div>
                </div>
                <div className="stat-tile">
                  <div className="stat-name">Elderly ID</div>
                  <div className="stat-value">{elderlyId}</div>
                </div>
                <div className="stat-tile">
                  <div className="stat-name">Risk Score</div>
                  <div className="stat-value">{formatValue(score)}</div>
                </div>
                <div className="stat-tile">
                  <div className="stat-name">Severity</div>
                  <div className="stat-value">{severity}</div>
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

            <div className="activity-grid">
              <div className="panel">
                <div className="panel-header">
                  <div className="panel-kicker">Event Stream</div>
                  <div className="panel-title">Recent System Activity</div>
                  <div className="panel-subtitle">
                    Latest websocket messages, alerts, and system notices.
                  </div>
                </div>
                <div className="panel-body">
                  {latestLogs.length === 0 ? (
                    <div className="alert-empty">
                      No activity yet. Once the phone sends a suspicious motion event, it will appear here.
                    </div>
                  ) : (
                    <div className="log-list">
                      {latestLogs.map((msg, index) => (
                        <div
                          key={`${msg.type}-${msg.receivedAt}-${index}`}
                          className={`log-item ${msg.type === "drop_alert" ? "log-item--alert" : ""}`}
                        >
                          <div className="log-top">
                            <div className="log-type">{msg.type}</div>
                            <div className="log-time">{formatTimestamp(msg.receivedAt)}</div>
                          </div>
                          <div className="log-body">
                            {msg.type === "drop_alert"
                              ? "High-priority alert broadcast received from backend incident service."
                              : "System message captured by guardian websocket client."}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="panel">
                <div className="panel-header">
                  <div className="panel-kicker">Live Payload</div>
                  <div className="panel-title">Alert JSON</div>
                  <div className="panel-subtitle">
                    Raw incident data for debugging, validation, and grading visibility.
                  </div>
                </div>
                <div className="panel-body">
                  <pre className="json-block">
                    {JSON.stringify(activeAlert?.data || activeAlert || { message: "Waiting for live alert..." }, null, 2)}
                  </pre>
                </div>
              </div>
            </div>
          </div>

          <div className="guardian-right">
            <div className="panel">
              <div className="panel-header">
                <div className="panel-kicker">Incident Details</div>
                <div className="panel-title">Motion Summary</div>
                <div className="panel-subtitle">
                  Current target state, scoring details, and captured sensor features.
                </div>
              </div>
              <div className="panel-body">
                <div className="details-grid">
                  <div className="detail-row">
                    <div className="detail-key">Device</div>
                    <div className="detail-value">{deviceId}</div>
                  </div>
                  <div className="detail-row">
                    <div className="detail-key">Received</div>
                    <div className="detail-value">{formatTimestamp(activeAlert?.receivedAt)}</div>
                  </div>
                  <div className="detail-row">
                    <div className="detail-key">Min Acceleration</div>
                    <div className="detail-value">{formatValue(features.minAcceleration)}</div>
                  </div>
                  <div className="detail-row">
                    <div className="detail-key">Peak Acceleration</div>
                    <div className="detail-value">{formatValue(features.peakAcceleration)}</div>
                  </div>
                  <div className="detail-row">
                    <div className="detail-key">Peak Rotation</div>
                    <div className="detail-value">{formatValue(features.peakRotationRate)}</div>
                  </div>
                  <div className="detail-row">
                    <div className="detail-key">Post-impact Stillness</div>
                    <div className="detail-value">{formatValue(features.postImpactStillnessMs)} ms</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="panel">
              <div className="panel-header">
                <div className="panel-kicker">Guardian Interpretation</div>
                <div className="panel-title">What to Look For</div>
              </div>
              <div className="panel-body">
                <div className="stack">
                  <div className="info-card">
                    <div className="info-title">High score usually means</div>
                    <div className="footer-note">
                      A strong sequence of suspicious motion indicators, not just one isolated movement.
                    </div>
                  </div>
                  <div className="info-card">
                    <div className="info-title">Stillness is contextual</div>
                    <div className="footer-note">
                      Stillness is more meaningful after impact-like motion. A phone resting quietly should not be treated as a fall on its own.
                    </div>
                  </div>
                  <div className="info-card">
                    <div className="info-title">Guardian action</div>
                    <div className="footer-note">
                      Use this console as an early warning tool. Verify with the elderly person if possible before escalating.
                    </div>
                  </div>
                </div>
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