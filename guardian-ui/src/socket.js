export function connectToAlerts(onMessage) {
  const host = window.location.hostname;
  const ws = new WebSocket(`ws://${host}:4000`);

  ws.onmessage = (event) => {
    const parsed = JSON.parse(event.data);
    onMessage(parsed);
  };

  ws.onopen = () => console.log("Connected to backend alerts");
  ws.onclose = () => console.log("Disconnected from backend alerts");

  return ws;
}