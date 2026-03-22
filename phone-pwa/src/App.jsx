import { useMemo, useState } from "react";
import { createMotionMonitor } from "./motionSensor";
import { sendMotionSample, simulateDrop } from "./api";

export default function App() {
  const [status, setStatus] = useState("Idle");
  const [lastResponse, setLastResponse] = useState(null);

  const elderlyId = "E001";
  const deviceId = "PHONE_01";

  const monitor = useMemo(() => {
    return createMotionMonitor({
      onFeatureReady: async (features) => {
        setStatus("Motion anomaly detected. Sending sample...");
        const result = await sendMotionSample({
          elderlyId,
          deviceId,
          timestamp: new Date().toISOString(),
          features
        });
        setLastResponse(result);
        setStatus(result.detected ? "Possible drop detected" : "Monitoring");
      }
    });
  }, []);

  async function handleStart() {
    try {
      await monitor.start();
      setStatus("Monitoring");
    } catch (error) {
      setStatus(error.message);
    }
  }

  function handleStop() {
    monitor.stop();
    setStatus("Stopped");
  }

  async function handleSimulateDrop() {
    const result = await simulateDrop({ elderlyId, deviceId });
    setLastResponse(result);
    setStatus("Simulated drop sent");
  }

  return (
    <div style={{ fontFamily: "sans-serif", padding: 24 }}>
      <h1>Elderly Phone PWA</h1>
      <p>Status: {status}</p>

      <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
        <button onClick={handleStart}>Start Monitoring</button>
        <button onClick={handleStop}>Stop Monitoring</button>
        <button onClick={handleSimulateDrop}>Simulate Drop</button>
      </div>

      <pre style={{ background: "#f3f4f6", padding: 16, borderRadius: 8 }}>
        {JSON.stringify(lastResponse, null, 2)}
      </pre>
    </div>
  );
}
