import { useEffect, useMemo, useState } from "react";
import { createMotionMonitor } from "./motionSensor";
import { sendMotionSample, simulateDrop } from "./api";

const STORAGE_KEY = "elderall_monitoring_enabled";

function prettyTime(value) {
  if (!value) return "No alerts yet";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return String(value);
  }
}

function getStateTone({ isMonitoring, isSending, lastResponse, errorMessage }) {
  if (errorMessage) {
    return {
      chip: "Issue detected",
      dot: "state-dot--red",
      title: "Monitoring unavailable",
      copy: "The phone could not continue safe monitoring. Check motion permissions, browser support, or backend connectivity."
    };
  }

  if (lastResponse?.detected) {
    return {
      chip: "Alert sent",
      dot: "state-dot--red",
      title: "Possible fall reported",
      copy: "A high-risk motion event crossed the configured safety threshold and was sent to the guardian dashboard."
    };
  }

  if (isSending) {
    return {
      chip: "Sending",
      dot: "state-dot--yellow",
      title: "Analyzing suspicious motion",
      copy: "The phone captured a suspicious movement pattern and is sending it to the backend for scoring."
    };
  }

  if (isMonitoring) {
    return {
      chip: "Protected",
      dot: "state-dot--green",
      title: "Monitoring is active",
      copy: "The phone is continuously watching for dangerous motion patterns such as drop, impact, spin, and stillness."
    };
  }

  return {
    chip: "Paused",
    dot: "state-dot--yellow",
    title: "Monitoring is paused",
    copy: "The system is currently idle. Enable monitoring to start watching for suspicious motion."
  };
}

export default function App() {
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [status, setStatus] = useState("Checking app status...");
  const [lastResponse, setLastResponse] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [lastAlertTime, setLastAlertTime] = useState(null);

  const elderlyId = "E001";
  const deviceId = "PHONE_01";

  const monitor = useMemo(() => {
    return createMotionMonitor({
      onStart: () => {
        setIsMonitoring(true);
        setStatus("Monitoring Active");
        setErrorMessage("");
      },
      onStop: () => {
        setIsMonitoring(false);
        setStatus("Monitoring Paused");
      },
      onError: (message) => {
        setErrorMessage(message);
        setStatus("Monitoring Unavailable");
      },
      onFeatureReady: async (features) => {
        try {
          setIsSending(true);
          setStatus("Motion anomaly detected. Sending alert...");

          const result = await sendMotionSample({
            elderlyId,
            deviceId,
            timestamp: new Date().toISOString(),
            features
          });

          console.log("Motion sample result:", {
            apiBaseUrl: import.meta.env.VITE_API_BASE_URL || "https://elderallbackend.onrender.com",
            features,
            result
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

    if (shouldResume) {
      handleEnableMonitoring();
    } else {
      setStatus("Monitoring Paused");
    }

    return () => {
      monitor.stop();
    };
  }, [monitor]);

  async function handleEnableMonitoring() {
    try {
      setErrorMessage("");
      setStatus("Starting monitoring...");
      await monitor.start();
      localStorage.setItem(STORAGE_KEY, "true");
    } catch (error) {
      localStorage.setItem(STORAGE_KEY, "false");
      setIsMonitoring(false);
      setStatus("Monitoring Unavailable");
      setErrorMessage(error.message || "Unable to start monitoring.");
    }
  }

  function handlePauseMonitoring() {
    monitor.stop();
    localStorage.setItem(STORAGE_KEY, "false");
    setIsMonitoring(false);
    setStatus("Monitoring Paused");
  }

  async function handleSimulateDrop() {
    try {
      setErrorMessage("");
      setStatus("Sending simulated drop...");
      const result = await simulateDrop({ elderlyId, deviceId });
      setLastResponse(result);
      setLastAlertTime(new Date().toISOString());
      setStatus("Simulated drop sent");
    } catch (error) {
      setErrorMessage(error.message || "Failed to simulate drop.");
      setStatus(isMonitoring ? "Monitoring Active" : "Monitoring Paused");
    }
  }

  const tone = getStateTone({ isMonitoring, isSending, lastResponse, errorMessage });

  return (
    <div className="phone-app">
      <div className="phone-shell">
        <div className="phone-topbar">
          <div className="phone-brand">
            <div className="phone-mark">📱</div>
            <div>
              <div className="phone-title">Elderall Safety Phone</div>
              <div className="phone-subtitle">
                A calm companion app that monitors motion and quietly watches for dangerous falls.
              </div>
            </div>
          </div>

          <div className="state-chip">
            <span className={`state-dot ${tone.dot}`} />
            {tone.chip}
          </div>
        </div>

        <div className="phone-state">
          <div className="phone-kicker">Live protection state</div>
          <div className="phone-main-state">{tone.title}</div>
          <div className="phone-copy">{tone.copy}</div>

          <div className="phone-grid">
            <div className="phone-stat">
              <div className="phone-stat-label">Monitoring</div>
              <div className="phone-stat-value">{isMonitoring ? "On" : "Off"}</div>
            </div>
            <div className="phone-stat">
              <div className="phone-stat-label">Backend activity</div>
              <div className="phone-stat-value">{isSending ? "Sending..." : "Ready"}</div>
            </div>
            <div className="phone-stat">
              <div className="phone-stat-label">Last alert</div>
              <div className="phone-stat-value">{prettyTime(lastAlertTime)}</div>
            </div>
            <div className="phone-stat">
              <div className="phone-stat-label">Current status</div>
              <div className="phone-stat-value">{status}</div>
            </div>
          </div>

          {errorMessage ? <div className="phone-error">{errorMessage}</div> : null}
        </div>

        <div className="phone-actions">
          {!isMonitoring ? (
            <button className="phone-button phone-button--primary" onClick={handleEnableMonitoring}>
              <span className="phone-button-title">Enable Monitoring</span>
              <span className="phone-button-caption">
                Start watching for suspicious movement using the phone’s motion sensors
              </span>
            </button>
          ) : (
            <button className="phone-button phone-button--danger" onClick={handlePauseMonitoring}>
              <span className="phone-button-title">Pause Monitoring</span>
              <span className="phone-button-caption">
                Stop motion tracking and prevent new alerts from being sent
              </span>
            </button>
          )}

          <button className="phone-button phone-button--ghost" onClick={handleSimulateDrop}>
            <span className="phone-button-title">Simulate Drop</span>
            <span className="phone-button-caption">
              Send a test incident to the guardian dashboard without needing a physical fall
            </span>
          </button>
        </div>

        <div className="phone-panel">
          <div className="phone-section-title">Designed for clarity</div>
          <div className="phone-panel-title">A simpler interface for the elderly user</div>
          <div className="phone-panel-copy">
            The elderly-facing app is intentionally calm and minimal. It focuses on one core promise:
            keep monitoring active, avoid clutter, and make the current safety state easy to understand
            at a glance.
          </div>
        </div>

        <div className="phone-explainer">
          <div className="explainer-item">
            <div className="explainer-title">Enable Monitoring</div>
            <div className="explainer-copy">
              Starts the phone’s motion monitoring so the system can watch for dangerous movement patterns.
            </div>
          </div>

          <div className="explainer-item">
            <div className="explainer-title">Pause Monitoring</div>
            <div className="explainer-copy">
              Stops motion tracking completely. This is useful for testing, charging, or temporary inactivity.
            </div>
          </div>

          <div className="explainer-item">
            <div className="explainer-title">Simulate Drop</div>
            <div className="explainer-copy">
              Sends a guaranteed test alert to the guardian dashboard so the full end-to-end flow can be checked quickly.
            </div>
          </div>
        </div>

        <div className="phone-debug">
          <div className="phone-section-title">Latest backend response</div>
          <div className="phone-panel-title">For testing and grading visibility</div>
          <pre className="debug-block">{JSON.stringify(lastResponse, null, 2)}</pre>
        </div>
      </div>
    </div>
  );
}