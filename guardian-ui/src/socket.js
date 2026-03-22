export function connectToAlerts({ onMessage, onOpen, onClose, onError }) {
  const host = window.location.hostname;
  const ws = new WebSocket(`ws://${host}:4000`);

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