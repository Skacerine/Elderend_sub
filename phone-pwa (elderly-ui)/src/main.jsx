import React from "react";
import ReactDOM from "react-dom/client";
import { AuthProvider, useAuth } from "./AuthContext";
import App from "./App";
import Login from "./Login";
import "./theme.css";

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(console.error);
  });
}

function Root() {
  const { isLoggedIn } = useAuth();
  return isLoggedIn ? <App /> : <Login />;
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AuthProvider>
      <Root />
    </AuthProvider>
  </React.StrictMode>
);
