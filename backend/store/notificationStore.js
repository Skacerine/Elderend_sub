// In-memory notification store (replaces notify-guardian DB)
const notifications = [];
const MAX = 200;

export function addNotification(notif) {
  const entry = {
    ...notif,
    sentAt: Date.now(),
    _id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  };
  notifications.unshift(entry);
  if (notifications.length > MAX) notifications.length = MAX;
  return entry;
}

export function getNotifications(n = 100) {
  return notifications.slice(0, n);
}

export function getNotificationCount() {
  return notifications.length;
}
