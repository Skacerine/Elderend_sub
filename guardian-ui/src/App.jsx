import { useEffect, useRef, useState } from "react";
import { connectToAlerts } from "./socket";

export default function App() {
  const [messages, setMessages] = useState([]);
  const [audioEnabled, setAudioEnabled] = useState(false);
  const audioRef = useRef(null);

  useEffect(() => {
    const ws = connectToAlerts((message) => {
      setMessages((prev) => [message, ...prev]);

      if (message.type === "drop_alert") {
        triggerGuardianAlert();
      }
    });

    return () => ws.close();
  }, [audioEnabled]);

  function triggerGuardianAlert() {
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
      alert("Browser blocked audio. Try interacting with the page again.");
    }
  }

  function handleStopAlarm() {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    if ("vibrate" in navigator) {
      navigator.vibrate(0);
    }
  }

  return (
    <div style={{ fontFamily: "sans-serif", padding: 24 }}>
      <h1>Guardian UI</h1>
      <p>Live alerts from phone drop detection service</p>

      <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
        <button onClick={handleEnableAudio}>
          {audioEnabled ? "Alert Sound Enabled" : "Enable Alert Sound"}
        </button>
        <button onClick={handleStopAlarm}>Stop Alarm</button>
      </div>

      <audio ref={audioRef} preload="auto" loop>
        <source src="/alarm.mp3" type="audio/mpeg" />
      </audio>

      <div style={{ display: "grid", gap: 12 }}>
        {messages.map((msg, index) => (
          <div
            key={index}
            style={{
              border: "1px solid #ddd",
              borderRadius: 10,
              padding: 16,
              background: msg.type === "drop_alert" ? "#fee2e2" : "#f9fafb"
            }}
          >
            <strong>{msg.type}</strong>
            <pre style={{ marginTop: 8, whiteSpace: "pre-wrap" }}>
              {JSON.stringify(msg.data, null, 2)}
            </pre>
          </div>
        ))}
      </div>
    </div>
  );
}