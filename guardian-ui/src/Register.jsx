import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "./AuthContext";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000";

export default function Register() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState(1);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const [gName, setGName] = useState("");
  const [gContact, setGContact] = useState("");
  const [gPassword, setGPassword] = useState("");
  const [gConfirm, setGConfirm] = useState("");
  const [showGPw, setShowGPw] = useState(false);

  const [eName, setEName] = useState("");
  const [eContact, setEContact] = useState("");
  const [eAddress, setEAddress] = useState("");
  const [ePassword, setEPassword] = useState("");
  const [showEPw, setShowEPw] = useState(false);

  function handleNext(e) {
    e.preventDefault();
    setError("");
    if (gPassword !== gConfirm) { setError("Passwords do not match"); return; }
    if (gPassword.length < 4) { setError("Password must be at least 4 characters"); return; }
    setStep(2);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (ePassword.length < 4) { setError("Elderly password must be at least 4 characters"); return; }
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "ngrok-skip-browser-warning": "1" },
        body: JSON.stringify({
          guardian: { guardian_name: gName, guardian_contact: gContact, password: gPassword },
          elderly: { elderly_name: eName, elderly_contact: eContact, residential_address: eAddress, password: ePassword },
        }),
      });
      const data = await res.json();
      if (data.success) {
        login({ guardianId: data.guardianId, elderlyId: data.elderlyId, name: data.guardianName });
        navigate("/");
      } else {
        setError(data.message || "Registration failed");
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
          display: flex; justify-content: center; align-items: center;
          min-height: 100vh; width: 100%;
          background: var(--bg); font-family: var(--font-ui);
          position: fixed; top: 0; left: 0; right: 0; bottom: 0; z-index: 100;
          overflow-y: auto; padding: 30px 20px;
        }
        .login-card {
          background: var(--panel); border: 1px solid var(--border);
          border-radius: var(--radius-lg); box-shadow: var(--shadow-lg);
          padding: 36px 32px; width: 100%; max-width: 420px; margin: auto;
        }
        .login-header { text-align: center; margin-bottom: 24px; }
        .login-header h2 { font-size: 20px; font-weight: 700; color: var(--text); margin: 0 0 4px; }
        .login-header p { font-size: 13px; color: var(--muted); margin: 0; }
        .login-error {
          background: var(--red-soft); color: var(--red-strong);
          border: 1px solid var(--red); border-radius: var(--radius-md);
          padding: 10px 14px; font-size: 13px; margin-bottom: 16px; text-align: center;
        }
        .login-label {
          display: block; font-size: 13px; font-weight: 600; color: var(--muted);
          margin-bottom: 5px; letter-spacing: 0.3px;
        }
        .login-input {
          width: 100%; padding: 10px 14px; margin-bottom: 14px;
          border-radius: var(--radius-md); font-size: 14px; font-family: var(--font-ui);
          border: 1px solid var(--border); background: var(--panel-strong); color: var(--text);
          outline: none; box-sizing: border-box; transition: border-color 0.15s, box-shadow 0.15s;
        }
        .login-input:focus { border-color: var(--cyan); box-shadow: var(--glow-cyan); }
        .login-input::placeholder { color: var(--muted-2); }
        .login-pw-wrap { position: relative; margin-bottom: 14px; }
        .login-pw-wrap .login-input { margin-bottom: 0; padding-right: 56px; }
        .login-pw-toggle {
          position: absolute; right: 10px; top: 50%; transform: translateY(-50%);
          background: none; border: none; cursor: pointer;
          font-size: 11px; font-weight: 600; font-family: var(--font-ui);
          color: var(--muted); letter-spacing: 0.5px; padding: 4px 6px;
          border-radius: var(--radius-sm); transition: color 0.15s;
        }
        .login-pw-toggle:hover { color: var(--cyan); }
        .login-btn-primary {
          width: 100%; padding: 11px; border: none; border-radius: var(--radius-md);
          font-size: 14px; font-weight: 600; font-family: var(--font-ui);
          cursor: pointer; background: var(--cyan); color: #fff; transition: opacity 0.15s;
          margin-top: 6px;
        }
        .login-btn-primary:hover { opacity: 0.9; }
        .login-btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
        .login-btn-secondary {
          width: 100%; padding: 10px; margin-top: 10px;
          border: 1px solid var(--border); border-radius: var(--radius-md);
          font-size: 13px; font-weight: 500; font-family: var(--font-ui);
          cursor: pointer; background: transparent; color: var(--muted);
          transition: border-color 0.15s, color 0.15s;
        }
        .login-btn-secondary:hover { border-color: var(--cyan); color: var(--cyan); }
        .reg-section-label {
          font-size: 11px; font-weight: 700; text-transform: uppercase;
          letter-spacing: 1px; margin-bottom: 14px; margin-top: 4px;
        }
        .reg-step-bar { display: flex; gap: 8px; margin-bottom: 20px; }
        .reg-step-bar div {
          flex: 1; height: 3px; border-radius: 2px;
          background: var(--border); transition: background 0.3s;
        }
        .reg-step-bar div.active { background: var(--cyan); }
      `}</style>

      <div className="login-card">
        <div className="login-header">
          <div style={{ lineHeight: 1, marginBottom: "6px" }}>
            <span style={{ fontSize: "28px", fontWeight: 800, letterSpacing: "-0.5px", color: "var(--cyan)" }}>Elder</span>
            <span style={{ fontSize: "28px", fontWeight: 800, letterSpacing: "-0.5px", color: "var(--green)" }}>All</span>
          </div>
          <h2>Create Account</h2>
          <p>Step {step} of 2 — {step === 1 ? "Your details" : "Elderly details"}</p>
        </div>

        <div className="reg-step-bar">
          <div className="active" />
          <div className={step === 2 ? "active" : ""} />
        </div>

        {error && <div className="login-error">{error}</div>}

        {step === 1 && (
          <form onSubmit={handleNext}>
            <div className="reg-section-label" style={{ color: "var(--cyan)" }}>Your Details (Guardian)</div>

            <label className="login-label">Full Name</label>
            <input className="login-input" type="text" placeholder="e.g. John Tan"
              value={gName} onChange={(e) => setGName(e.target.value)} required />

            <label className="login-label">Phone Number</label>
            <input className="login-input" type="tel" placeholder="e.g. 6591234567"
              value={gContact} onChange={(e) => setGContact(e.target.value)} required />

            <label className="login-label">Password</label>
            <div className="login-pw-wrap">
              <input className="login-input" type={showGPw ? "text" : "password"} placeholder="Create a password"
                value={gPassword} onChange={(e) => setGPassword(e.target.value)} required />
              <button type="button" className="login-pw-toggle" onClick={() => setShowGPw(!showGPw)}>
                {showGPw ? "HIDE" : "SHOW"}
              </button>
            </div>

            <label className="login-label">Confirm Password</label>
            <input className="login-input" type="password" placeholder="Re-enter password"
              value={gConfirm} onChange={(e) => setGConfirm(e.target.value)} required />

            <button type="submit" className="login-btn-primary">Next — Add Elderly Details</button>
            <button type="button" className="login-btn-secondary" onClick={() => navigate("/login")}>
              Already have an account? Sign in
            </button>
          </form>
        )}

        {step === 2 && (
          <form onSubmit={handleSubmit}>
            <div className="reg-section-label" style={{ color: "var(--green)" }}>Elderly Details</div>

            <label className="login-label">Full Name</label>
            <input className="login-input" type="text" placeholder="e.g. Mdm Tan Ah Kow"
              value={eName} onChange={(e) => setEName(e.target.value)} required />

            <label className="login-label">Phone Number</label>
            <input className="login-input" type="tel" placeholder="e.g. 6587654321"
              value={eContact} onChange={(e) => setEContact(e.target.value)} required />

            <label className="login-label">Home Address</label>
            <input className="login-input" type="text" placeholder="e.g. Blk 123 Bedok North Ave 1"
              value={eAddress} onChange={(e) => setEAddress(e.target.value)} required />

            <label className="login-label">Password (for elderly phone app login)</label>
            <div className="login-pw-wrap">
              <input className="login-input" type={showEPw ? "text" : "password"} placeholder="Set a simple password"
                value={ePassword} onChange={(e) => setEPassword(e.target.value)} required />
              <button type="button" className="login-pw-toggle" onClick={() => setShowEPw(!showEPw)}>
                {showEPw ? "HIDE" : "SHOW"}
              </button>
            </div>

            <button type="submit" className="login-btn-primary" disabled={loading}>
              {loading ? "Creating accounts..." : "Create Accounts"}
            </button>
            <button type="button" className="login-btn-secondary" onClick={() => { setStep(1); setError(""); }}>
              Back
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
