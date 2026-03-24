import { useEffect } from "react";

export default function AlertPopup({ alert, onDismiss }) {
  if (!alert) return null;

  // Auto-dismiss after 30 seconds
  useEffect(() => {
    const timer = setTimeout(onDismiss, 30000);
    return () => clearTimeout(timer);
  }, [alert, onDismiss]);

  const isGeofence = alert.source === "elderwatch";
  const isLeft = alert.subtype === "left";

  return (
    <div className="popup-overlay" onClick={onDismiss}>
      <div className={`popup-card ${isGeofence ? (isLeft ? "popup-card--danger" : "popup-card--safe") : "popup-card--danger"}`} onClick={e => e.stopPropagation()}>
        <div className="popup-icon">
          {isGeofence ? (isLeft ? "\u{1f6a8}" : "\u2705") : "\u{1f6a8}"}
        </div>

        <div className="popup-title">
          {isGeofence
            ? (isLeft ? "Elderly Left Home Zone" : "Elderly Returned Home")
            : "Fall Detected"
          }
        </div>

        <div className="popup-subtitle">
          {alert.message
            ? alert.message
            : isGeofence
              ? (isLeft ? "Immediate attention may be required" : "Elderly is back within safe boundary")
              : "A possible fall has been detected — review immediately"
          }
        </div>

        <div className="popup-details">
          {alert.elderlyId && (
            <div className="popup-detail-row">
              <span className="popup-detail-label">Elderly ID</span>
              <span className="popup-detail-value">{alert.elderlyId}</span>
            </div>
          )}

          {isGeofence && alert.address && (
            <div className="popup-detail-row">
              <span className="popup-detail-label">Location</span>
              <span className="popup-detail-value">{alert.address}</span>
            </div>
          )}

          {isGeofence && alert.distance != null && (
            <div className="popup-detail-row">
              <span className="popup-detail-label">Distance</span>
              <span className="popup-detail-value">{alert.distance}m from home</span>
            </div>
          )}

          {!isGeofence && alert.score != null && (
            <div className="popup-detail-row">
              <span className="popup-detail-label">Risk Score</span>
              <span className="popup-detail-value">{alert.score}</span>
            </div>
          )}

          {!isGeofence && alert.severity && (
            <div className="popup-detail-row">
              <span className="popup-detail-label">Severity</span>
              <span className="popup-detail-value">{alert.severity}</span>
            </div>
          )}

          {alert.timestamp && (
            <div className="popup-detail-row">
              <span className="popup-detail-label">Time</span>
              <span className="popup-detail-value">
                {new Date(alert.timestamp).toLocaleTimeString("en-SG", { hour12: false })}
              </span>
            </div>
          )}
        </div>

        <button className="popup-dismiss" onClick={onDismiss}>Dismiss</button>
      </div>
    </div>
  );
}
