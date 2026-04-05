import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "./AuthContext";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000";

export default function Login() {
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/auth/login/guardian`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "ngrok-skip-browser-warning": "1" },
        body: JSON.stringify({ phone, password }),
      });
      const data = await res.json();
      if (data.success) {
        login({
          guardianId: data.guardianId,
          elderlyId: data.elderlyId,
          name: data.name,
        });
        navigate("/");
      } else {
        setError(data.message || "Invalid credentials");
      }
    } catch {
      setError("Unable to connect to server");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <style>{`
        .login-page {
          display: flex;
          justify-content: center;
          align-items: center;
          min-height: 100vh;
          width: 100%;
          background: var(--bg);
          font-family: var(--font-ui);
          position: fixed;
          top: 0; left: 0; right: 0; bottom: 0;
          z-index: 100;
        }
        .login-card {
          background: var(--panel);
          border: 1px solid var(--border);
          border-radius: var(--radius-lg);
          box-shadow: var(--shadow-lg);
          padding: 40px 36px;
          width: 100%;
          max-width: 400px;
        }
        .login-header {
          text-align: center;
          margin-bottom: 32px;
        }
        .login-header h2 {
          font-size: 22px;
          font-weight: 700;
          color: var(--text);
          margin: 8px 0 4px;
        }
        .login-header p {
          font-size: 14px;
          color: var(--muted);
          margin: 0;
        }
        .login-error {
          background: var(--red-soft);
          color: var(--red-strong);
          border: 1px solid var(--red);
          border-radius: var(--radius-md);
          padding: 10px 14px;
          font-size: 13px;
          margin-bottom: 16px;
          text-align: center;
        }
        .login-label {
          display: block;
          font-size: 13px;
          font-weight: 600;
          color: var(--muted);
          margin-bottom: 6px;
          letter-spacing: 0.3px;
        }
        .login-input {
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
        .login-input:focus {
          border-color: var(--cyan);
          box-shadow: var(--glow-cyan);
        }
        .login-input::placeholder {
          color: var(--muted-2);
        }
        .login-pw-wrap {
          position: relative;
          margin-bottom: 24px;
        }
        .login-pw-wrap .login-input {
          margin-bottom: 0;
          padding-right: 56px;
        }
        .login-pw-toggle {
          position: absolute;
          right: 10px;
          top: 50%;
          transform: translateY(-50%);
          background: none;
          border: none;
          cursor: pointer;
          font-size: 11px;
          font-weight: 600;
          font-family: var(--font-ui);
          color: var(--muted);
          letter-spacing: 0.5px;
          padding: 4px 6px;
          border-radius: var(--radius-sm);
          transition: color 0.15s;
        }
        .login-pw-toggle:hover {
          color: var(--cyan);
        }
        .login-btn-primary {
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
        }
        .login-btn-primary:hover { opacity: 0.9; }
        .login-btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
        .login-btn-secondary {
          width: 100%;
          padding: 10px;
          margin-top: 10px;
          border: 1px solid var(--border);
          border-radius: var(--radius-md);
          font-size: 13px;
          font-weight: 500;
          font-family: var(--font-ui);
          cursor: pointer;
          background: transparent;
          color: var(--muted);
          transition: border-color 0.15s, color 0.15s;
        }
        .login-btn-secondary:hover {
          border-color: var(--cyan);
          color: var(--cyan);
        }
      `}</style>

      <div className="login-card">
        <div className="login-header">
          <div style={{ lineHeight: 1, marginBottom: "6px" }}>
            <span style={{ fontSize: "32px", fontWeight: 800, letterSpacing: "-0.5px", color: "var(--cyan)" }}>Elder</span><span style={{ fontSize: "32px", fontWeight: 800, letterSpacing: "-0.5px", color: "var(--green)" }}>All</span>
          </div>
          <div style={{ fontSize: "10px", fontWeight: 600, letterSpacing: "1.5px", color: "var(--muted-2)", textTransform: "uppercase", marginBottom: "6px" }}>Guardian Portal</div>
          <p>Sign in to monitor your loved one</p>
        </div>

        {error && <div className="login-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <label className="login-label">Phone Number</label>
          <input
            className="login-input"
            type="tel"
            placeholder="e.g. 6598765432"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            required
          />

          <label className="login-label">Password</label>
          <div className="login-pw-wrap">
            <input
              className="login-input"
              type={showPassword ? "text" : "password"}
              placeholder="Enter password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <button
              type="button"
              className="login-pw-toggle"
              onClick={() => setShowPassword(!showPassword)}
            >
              {showPassword ? "HIDE" : "SHOW"}
            </button>
          </div>

          <button type="submit" className="login-btn-primary" disabled={loading}>
            {loading ? "Signing in..." : "Sign In"}
          </button>

          <button type="button" className="login-btn-secondary" onClick={() => navigate("/register")}>
            Create Account
          </button>
        </form>
      </div>
    </div>
  );
}
