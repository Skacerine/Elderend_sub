import { useEffect, useState, useCallback } from "react";

const MONITORING_KEY = "monitoringEnabled";

export default function App() {
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [permissionState, setPermissionState] = useState("unknown");
  const [statusMessage, setStatusMessage] = useState("Checking app status...");

  const handleMotion = useCallback((event) => {
    // your existing fall detection logic here
  }, []);

  const startMonitoring = useCallback(() => {
    window.addEventListener("devicemotion", handleMotion);
    setIsMonitoring(true);
    localStorage.setItem(MONITORING_KEY, "true");
    setStatusMessage("Monitoring is active.");
  }, [handleMotion]);

  const stopMonitoring = useCallback(() => {
    window.removeEventListener("devicemotion", handleMotion);
    setIsMonitoring(false);
    localStorage.setItem(MONITORING_KEY, "false");
    setStatusMessage("Monitoring is paused.");
  }, [handleMotion]);

  const requestMotionPermissionAndStart = useCallback(async () => {
    try {
      if (
        typeof DeviceMotionEvent !== "undefined" &&
        typeof DeviceMotionEvent.requestPermission === "function"
      ) {
        const result = await DeviceMotionEvent.requestPermission();
        if (result === "granted") {
          setPermissionState("granted");
          startMonitoring();
        } else {
          setPermissionState("denied");
          setStatusMessage("Motion permission was denied.");
        }
      } else {
        setPermissionState("granted");
        startMonitoring();
      }
    } catch (error) {
      setPermissionState("denied");
      setStatusMessage("Unable to access motion sensors.");
    }
  }, [startMonitoring]);

  useEffect(() => {
    const wasEnabled = localStorage.getItem(MONITORING_KEY) === "true";

    if (wasEnabled) {
      setStatusMessage("Restoring monitoring...");
      requestMotionPermissionAndStart();
    } else {
      setStatusMessage("Monitoring is paused.");
    }

    return () => {
      window.removeEventListener("devicemotion", handleMotion);
    };
  }, [handleMotion, requestMotionPermissionAndStart]);

  return (
    <div>
      <h1>Elderall Phone App</h1>
      <p>Status: {isMonitoring ? "Monitoring Active" : "Monitoring Paused"}</p>
      <p>{statusMessage}</p>

      {!isMonitoring ? (
        <button onClick={requestMotionPermissionAndStart}>
          Enable Monitoring
        </button>
      ) : (
        <button onClick={stopMonitoring}>Pause Monitoring</button>
      )}

      <button onClick={() => {/* your simulate drop logic */}}>
        Simulate Drop
      </button>
    </div>
  );
}