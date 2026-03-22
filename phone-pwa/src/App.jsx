import { useEffect, useMemo, useState } from "react";
import { createMotionMonitor } from "./motionSensor";
import { sendMotionSample, simulateDrop } from "./api";

const STORAGE_KEY = "elderall_monitoring_enabled";

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

          setLastResponse(result);
          setLastAlertTime(new Date().toLocaleString());
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      setLastAlertTime(new Date().toLocaleString());
      setStatus("Simulated drop sent");
    } catch (error) {
      setErrorMessage(error.message || "Failed to simulate drop.");
      setStatus(isMonitoring ? "Monitoring Active" : "Monitoring Paused");
    }
  }

  return (
    <div
      style={{
        fontFamily: "Inter, Arial, sans-serif",
        padding: 20,
        maxWidth: 720,
        margin: "0 auto",
        color: "#111827",
        lineHeight: 1.5
      }}
    >
      <h1 style={{ marginBottom: 8 }}>Elderall Phone App</h1>
      <p style={{ marginTop: 0, color: "#4b5563" }}>
        This phone monitors for possible falls and sends alerts to the guardian dashboard.
      </p>

      <div
        style={{
          border: "1px solid #e5e7eb",
          borderRadius: 14,
          padding: 16,
          marginBottom: 16,
          background: "#f9fafb"
        }}
      >
        <p style={{ margin: "0 0 8px 0" }}>
          <strong>Status:</strong> {status}
        </p>
        <p style={{ margin: "0 0 8px 0" }}>
          <strong>Monitoring:</strong> {isMonitoring ? "On" : "Off"}
        </p>
        <p style={{ margin: "0 0 8px 0" }}>
          <strong>Backend activity:</strong> {isSending ? "Sending alert..." : "Ready"}
        </p>
        <p style={{ margin: 0 }}>
          <strong>Last alert:</strong> {lastAlertTime || "No alerts yet"}
        </p>
      </div>

      {errorMessage ? (
        <div
          style={{
            border: "1px solid #fecaca",
            background: "#fef2f2",
            color: "#991b1b",
            borderRadius: 12,
            padding: 12,
            marginBottom: 16
          }}
        >
          {errorMessage}
        </div>
      ) : null}

      <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        {!isMonitoring ? (
          <button onClick={handleEnableMonitoring}>Enable Monitoring</button>
        ) : (
          <button onClick={handlePauseMonitoring}>Pause Monitoring</button>
        )}
        <button onClick={handleSimulateDrop}>Simulate Drop</button>
      </div>

      <div
        style={{
          border: "1px solid #e5e7eb",
          borderRadius: 14,
          padding: 16,
          marginBottom: 16
        }}
      >
        <strong>What these buttons do</strong>
        <p style={{ marginBottom: 8 }}>
          <strong>Enable Monitoring:</strong> starts using the phone’s motion sensors to watch for
          signs of a fall.
        </p>
        <p style={{ marginBottom: 8 }}>
          <strong>Pause Monitoring:</strong> stops motion tracking and prevents new alerts.
        </p>
        <p style={{ marginBottom: 0 }}>
          <strong>Simulate Drop:</strong> sends a test alert without needing to physically drop the
          phone.
        </p>
      </div>

      <pre
        style={{
          background: "#f3f4f6",
          padding: 16,
          borderRadius: 8,
          whiteSpace: "pre-wrap",
          overflowX: "auto"
        }}
      >
        {JSON.stringify(lastResponse, null, 2)}
      </pre>
    </div>
  );
}