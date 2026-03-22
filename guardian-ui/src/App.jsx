import { useEffect, useRef, useState } from "react";
import { connectToAlerts } from "./socket";

export default function App() {
  const [messages, setMessages] = useState([]);
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [connectionState, setConnectionState] = useState("connecting");
  const [activeAlert, setActiveAlert] = useState(null);
  const [alarmActive, setAlarmActive] = useState(false);

  const audioRef = useRef(null);

  useEffect(() => {
    const ws = connectToAlerts({
      onMessage: (message) => {
        if (message.type === "drop_alert") {
          const enrichedMessage = {
            ...message,
            receivedAt: new Date().toLocaleString()
          };

          setMessages((prev) => [enrichedMessage, ...prev].slice(0, 20));
          setActiveAlert(enrichedMessage);
          triggerGuardianAlert();
          return;
        }

        if (message.type === "system_error" || message.type === "warning") {
          setMessages((prev) => [
            {
              ...message,
              receivedAt: new Date().toLocaleString()
            },
            ...prev
          ].slice(0, 20));
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
    if (!audioEnabled || !audioRef.current) return;

    audioRef.current.currentTime = 0;
    audioRef.current.play().catch((error) => {
      console.error("Alarm playback blocked:", error);
    });
  }

  function vibrateDevice() {
    if ("vibrate" in navigator) {
      navigator.vibrate([400, 200, 400, 200, 800]);
    }
  }

  async function handleEnableAudio() {
    if (!audioRef.current) return;

    try {
      audioRef.current.volume = 1;
      audioRef.current.currentTime = 0;
      await audioRef.current.play();
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      setAudioEnabled(true);
    } catch (error) {
      console.error("Audio enable failed:", error);
      alert("Browser blocked audio. Tap the page again and retry.");
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

  function connectionLabel() {
    if (connectionState === "connected") return "Connected";
    if (connectionState === "disconnected") return "Disconnected";
    if (connectionState === "error") return "Connection Error";
    return "Connecting";
  }

  return (
    <div
      style={{
        fontFamily: "Inter, Arial, sans-serif",
        padding: 24,
        maxWidth: 900,
        margin: "0 auto",
        color: "#111827"
      }}
    >
      <h1 style={{ marginBottom: 8 }}>Guardian Dashboard</h1>
      <p style={{ marginTop: 0, color: "#4b5563" }}>
        Live alerts from the elderly phone drop detection service.
      </p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 12,
          marginBottom: 16
        }}
      >
        <div style={cardStyle}>
          <strong>Connection</strong>
          <p style={metricStyle}>{connectionLabel()}</p>
        </div>
        <div style={cardStyle}>
          <strong>Alert Sound</strong>
          <p style={metricStyle}>{audioEnabled ? "Enabled" : "Disabled"}</p>
        </div>
        <div style={cardStyle}>
          <strong>Alarm Status</strong>
          <p style={metricStyle}>{alarmActive ? "Active" : "Idle"}</p>
        </div>
        <div style={cardStyle}>
          <strong>Total Alerts</strong>
          <p style={metricStyle}>{messages.length}</p>
        </div>
      </div>

      <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        <button onClick={handleEnableAudio}>
          {audioEnabled ? "Alert Sound Enabled" : "Enable Alert Sound"}
        </button>
        <button onClick={handleStopAlarm}>Stop Alarm</button>
        <button onClick={clearActiveAlert}>Clear Active Alert</button>
      </div>

      <audio ref={audioRef} preload="auto" loop>
        <source src="/alarm.mp3" type="audio/mpeg" />
      </audio>

      {activeAlert ? (
        <div
          style={{
            border: "1px solid #fecaca",
            background: "#fef2f2",
            borderRadius: 14,
            padding: 16,
            marginBottom: 16
          }}
        >
          <h2 style={{ marginTop: 0, color: "#991b1b" }}>Active Drop Alert</h2>
          <p style={{ margin: "0 0 8px 0" }}>
            <strong>Received:</strong> {activeAlert.receivedAt}
          </p>
          <pre style={{ margin: 0, whiteSpace: "pre-wrap" }}>
            {JSON.stringify(activeAlert.data, null, 2)}
          </pre>
        </div>
      ) : (
        <div
          style={{
            border: "1px solid #e5e7eb",
            background: "#f9fafb",
            borderRadius: 14,
            padding: 16,
            marginBottom: 16
          }}
        >
          <strong>No active emergencies</strong>
          <p style={{ margin: "8px 0 0 0", color: "#4b5563" }}>
            The dashboard is waiting for new alerts.
          </p>
        </div>
      )}

      <div style={{ display: "grid", gap: 12 }}>
        {messages.length === 0 ? (
          <div
            style={{
              border: "1px solid #e5e7eb",
              borderRadius: 12,
              padding: 16,
              background: "#ffffff",
              color: "#6b7280"
            }}
          >
            No alert history yet.
          </div>
        ) : (
          messages.map((msg, index) => (
            <div
              key={index}
              style={{
                border: "1px solid #e5e7eb",
                borderRadius: 12,
                padding: 16,
                background:
                  msg.type === "drop_alert"
                    ? "#fee2e2"
                    : "#f9fafb"
              }}
            >
              <strong>{msg.type}</strong>
              {msg.receivedAt ? (
                <p style={{ margin: "6px 0 8px 0", color: "#6b7280" }}>
                  Received: {msg.receivedAt}
                </p>
              ) : null}
              <pre style={{ marginTop: 8, whiteSpace: "pre-wrap", overflowX: "auto" }}>
                {JSON.stringify(msg.data, null, 2)}
              </pre>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

const cardStyle = {
  border: "1px solid #e5e7eb",
  borderRadius: 12,
  padding: 16,
  background: "#f9fafb"
};

const metricStyle = {
  fontSize: 18,
  fontWeight: 700,
  margin: "8px 0 0 0"
};