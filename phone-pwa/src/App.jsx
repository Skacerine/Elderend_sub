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
      chip: "Issue",
      dot: "state-dot--red",
      title: "Monitoring unavailable",
      copy: "Check permissions or connection."
    };
  }

  if (lastResponse?.detected) {
    return {
      chip: "Alert sent",
      dot: "state-dot--red",
      title: "Help alert sent",
      copy: "Your guardian has been notified."
    };
  }

  if (isSending) {
    return {
      chip: "Sending",
      dot: "state-dot--yellow",
      title: "Checking movement",
      copy: "Please wait."
    };
  }

  if (isMonitoring) {
    return {
      chip: "Protected",
      dot: "state-dot--green",
      title: "Monitoring active",
      copy: "Fall protection is on."
    };
  }

  return {
    chip: "Paused",
    dot: "state-dot--yellow",
    title: "Monitoring paused",
    copy: "Press enable to start."
  };
}

export default function App() {
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [status, setStatus] = useState("Checking app status...");
  const [lastResponse, setLastResponse] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [lastAlertTime, setLastAlertTime] = useState(null);

  const elderlyId = 1;
  const guardianId = 1;
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
            guardianId,
            deviceId,
            timestamp: new Date().toISOString(),
            latitude: 1.2966,
            longitude: 103.8502,
            address: "Tanjong Pagar, Singapore",
            features
          });

          console.log("Motion sample result:", {
            apiBaseUrl:
              import.meta.env.VITE_API_BASE_URL || "https://elderend-backend.onrender.com",
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

      const result = await simulateDrop({
        elderlyId,
        guardianId,
        deviceId,
        latitude: 1.2966,
        longitude: 103.8502,
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

  return (
    <div className="phone-app">
      <div className="phone-shell">
        <div className="phone-topbar">
          <div className="phone-brand">
            <div className="phone-mark">📱</div>
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

        <div className="phone-state">
          <div className="phone-kicker">Status</div>
          <div className="phone-main-state">{tone.title}</div>
          <div className="phone-copy">{tone.copy}</div>

          <div className="phone-grid">
            <div className="phone-stat">
              <div className="phone-stat-label">Monitoring</div>
              <div className="phone-stat-value">{isMonitoring ? "On" : "Off"}</div>
            </div>
            <div className="phone-stat">
              <div className="phone-stat-label">Backend</div>
              <div className="phone-stat-value">{isSending ? "Sending..." : "Ready"}</div>
            </div>
            <div className="phone-stat">
              <div className="phone-stat-label">Last alert</div>
              <div className="phone-stat-value">{prettyTime(lastAlertTime)}</div>
            </div>
            <div className="phone-stat">
              <div className="phone-stat-label">State</div>
              <div className="phone-stat-value">{status}</div>
            </div>
          </div>

          {errorMessage ? <div className="phone-error">{errorMessage}</div> : null}
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

        <div className="phone-debug">
          <div className="phone-section-title">Latest response</div>
          <pre className="debug-block">{JSON.stringify(lastResponse, null, 2)}</pre>
        </div>
      </div>
    </div>
  );
}