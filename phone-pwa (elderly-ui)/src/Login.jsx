import { useState } from "react";
import { useAuth } from "./AuthContext";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000";

export default function Login() {
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();

  async function handleSubmit(e) {
    e.preventDefault();
    if (!phone || !password) {
      setError("Please enter phone number and password");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/auth/login/elderly`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "ngrok-skip-browser-warning": "1" },
        body: JSON.stringify({ phone, password }),
      });
      if (!res.ok) { setError("Server error, please try again"); setLoading(false); return; }
      const data = await res.json();
      if (data.success) {
        login({ elderlyId: data.elderlyId, name: data.name });
      } else {
        setError(data.message || "Invalid credentials");
      }
    } catch {
      setError("Unable to connect");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="ea-app" style={{
      display: "flex", flexDirection: "column", alignItems: "center",
      justifyContent: "center", minHeight: "100vh", padding: "24px",
    }}>
      <form onSubmit={handleSubmit} style={{ width: "100%", maxWidth: "340px" }}>
        <div style={{ textAlign: "center", marginBottom: "32px" }}>
          <div style={{ fontSize: "44px", marginBottom: "8px" }}>&#x1F9D3;</div>
          <h2 style={{ fontSize: "22px", fontWeight: 700, margin: 0, color: "#1a3c28" }}>
            ElderAll
          </h2>
          <p style={{ fontSize: "14px", color: "#6b7280", margin: "8px 0 0" }}>
            Sign in with your phone number
          </p>
        </div>

        {error && (
          <div style={{
            background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca",
            borderRadius: "10px", padding: "12px 16px", fontSize: "14px",
            marginBottom: "16px", textAlign: "center",
          }}>{error}</div>
        )}

        <label style={{
          display: "block", fontSize: "15px", fontWeight: 600,
          marginBottom: "8px", color: "#374151",
        }}>Phone Number</label>
        <input
          type="tel" placeholder="e.g. 6591234567"
          value={phone} onChange={(e) => setPhone(e.target.value)} required
          style={{
            width: "100%", padding: "14px 16px", marginBottom: "18px",
            borderRadius: "12px", fontSize: "18px",
            border: "1px solid #d1d5db", background: "#f9fafb",
            boxSizing: "border-box", outline: "none",
          }}
        />

        <label style={{
          display: "block", fontSize: "15px", fontWeight: 600,
          marginBottom: "8px", color: "#374151",
        }}>Password</label>
        <div style={{ position: "relative", marginBottom: "24px" }}>
          <input
            type={showPassword ? "text" : "password"} placeholder="Enter password"
            value={password} onChange={(e) => setPassword(e.target.value)} required
            style={{
              width: "100%", padding: "14px 60px 14px 16px",
              borderRadius: "12px", fontSize: "18px",
              border: "1px solid #d1d5db", background: "#f9fafb",
              boxSizing: "border-box", outline: "none",
            }}
          />
          <button type="button" onClick={() => setShowPassword(!showPassword)} style={{
            position: "absolute", right: "14px", top: "50%", transform: "translateY(-50%)",
            background: "none", border: "none", cursor: "pointer",
            fontSize: "12px", fontWeight: 600, color: "#6b7280",
            letterSpacing: "0.5px", padding: "4px",
          }}>
            {showPassword ? "HIDE" : "SHOW"}
          </button>
        </div>

        <button type="submit" disabled={loading} style={{
          width: "100%", padding: "15px", border: "none",
          borderRadius: "12px", fontSize: "17px", fontWeight: 600,
          cursor: loading ? "not-allowed" : "pointer",
          background: loading ? "#9ca3af" : "#227A54",
          color: "#fff",
        }}>
          {loading ? "Signing in..." : "Sign In"}
        </button>
      </form>
    </div>
  );
}
