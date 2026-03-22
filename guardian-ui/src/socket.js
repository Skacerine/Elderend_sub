const WS_URL =
  import.meta.env.VITE_WS_BASE_URL || "ws://localhost:4000";

export function connectToAlerts({ onMessage, onOpen, onClose, onError }) {
  const ws = new WebSocket(WS_URL);

  ws.onmessage = (event) => {
    try {
      const parsed = JSON.parse(event.data);
      onMessage?.(parsed);
    } catch (error) {
      console.error("Failed to parse WebSocket message:", error);
    }
  };

  ws.onopen = () => {
    console.log("Connected to backend alerts");
    onOpen?.();
  };

  ws.onclose = () => {
    console.log("Disconnected from backend alerts");
    onClose?.();
  };

  ws.onerror = (error) => {
    console.error("WebSocket error:", error);
    onError?.(error);
  };

  return ws;
}