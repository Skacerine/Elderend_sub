import { useEffect, useState } from "react";
import { useAuth } from "./AuthContext";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000";

export default function Settings() {
  const { user } = useAuth();
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState(null);

  useEffect(() => {
    fetch(`${API_BASE}/settings/notifications`, { signal: AbortSignal.timeout(6000) })
      .then(r => r.json())
      .then(data => { setPhone(data.phone || ""); setEmail(data.email || ""); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true); setStatus(null);
    try {
      const r = await fetch(`${API_BASE}/settings/notifications`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, email })
      });
      if (r.ok) setStatus({ ok: true, msg: "Saved!" });
      else setStatus({ ok: false, msg: "Failed to save" });
    } catch {
      setStatus({ ok: false, msg: "Could not reach server" });
    }
    setSaving(false);
    setTimeout(() => setStatus(null), 4000);
  }

  return (
    <div className="settings-page">
      <style>{`
        .settings-page {
          max-width: 480px;
          margin: 40px auto;
          padding: 0 20px;
          font-family: var(--font-ui);
        }
        .settings-card {
          background: var(--panel);
          border: 1px solid var(--border);
          border-radius: var(--radius-lg);
          padding: 32px 28px;
          box-shadow: var(--shadow-md);
        }
        .settings-title {
          font-size: 20px;
          font-weight: 700;
          color: var(--text);
          margin: 0 0 4px;
        }
        .settings-subtitle {
          font-size: 13px;
          color: var(--muted);
          margin: 0 0 24px;
        }
        .settings-label {
          display: block;
          font-size: 13px;
          font-weight: 600;
          color: var(--muted);
          margin-bottom: 6px;
          letter-spacing: 0.3px;
        }
        .settings-input {
          width: 100%;
          padding: 10px 14px;
          margin-bottom: 16px;
          border-radius: var(--radius-md);
          font-size: 14px;
          font-family: var(--font-ui);
          border: 1px solid var(--border);
          background: var(--panel-strong);
          color: var(--text);
          outline: none;
          box-sizing: border-box;
          transition: border-color 0.15s, box-shadow 0.15s;
        }
        .settings-input:focus {
          border-color: var(--cyan);
          box-shadow: var(--glow-cyan);
        }
        .settings-btn {
          width: 100%;
          padding: 11px;
          border: none;
          border-radius: var(--radius-md);
          font-size: 14px;
          font-weight: 600;
          font-family: var(--font-ui);
          cursor: pointer;
          background: var(--cyan);
          color: #fff;
          transition: opacity 0.15s;
          margin-top: 8px;
        }
        .settings-btn:hover { opacity: 0.9; }
        .settings-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .settings-status {
          text-align: center;
          padding: 8px;
          margin-top: 12px;
          border-radius: var(--radius-md);
          font-size: 13px;
          font-weight: 500;
        }
        .settings-status--ok {
          background: var(--green-soft, rgba(34,211,165,0.1));
          color: var(--green, #22d3a5);
          border: 1px solid var(--green, #22d3a5);
        }
        .settings-status--err {
          background: var(--red-soft, rgba(248,113,113,0.1));
          color: var(--red-strong, #f87171);
          border: 1px solid var(--red, #f87171);
        }
        .settings-note {
          font-size: 12px;
          color: var(--muted-2);
          margin-top: 16px;
          text-align: center;
        }
      `}</style>

      <div className="settings-card">
        <div className="settings-title">Notification Settings</div>
        <div className="settings-subtitle">
          Where fall alerts and medicine reminders are sent
        </div>

        {loading ? (
          <div style={{ textAlign: "center", padding: "20px 0", color: "var(--muted)" }}>Loading...</div>
        ) : (
          <form onSubmit={handleSave}>
            <label className="settings-label">Guardian Phone Number</label>
            <input
              className="settings-input"
              type="tel"
              placeholder="+6591234567"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              required
            />

            <label className="settings-label">Guardian Email</label>
            <input
              className="settings-input"
              type="email"
              placeholder="guardian@email.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
            />

            <button className="settings-btn" type="submit" disabled={saving}>
              {saving ? "Saving..." : "Save Settings"}
            </button>
          </form>
        )}

        {status && (
          <div className={`settings-status ${status.ok ? "settings-status--ok" : "settings-status--err"}`}>
            {status.msg}
          </div>
        )}

        <div className="settings-note">
          Settings are stored in memory and will reset when the server restarts.
        </div>
      </div>
    </div>
  );
}
