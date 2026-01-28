"use client";

import { useState } from "react";
import { checkSettingsPassword } from "@/app/actions/auth";

export function SettingsLock() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const result = await checkSettingsPassword(password);
      if (result.success) {
        window.location.reload(); // Reload to bypass the server-side check
      } else {
        setError(result.error || "Invalid password");
      }
    } catch (err) {
      setError("An error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ 
      display: "flex", 
      flexDirection: "column", 
      alignItems: "center", 
      justifyContent: "center", 
      minHeight: "50vh",
      padding: 24,
      background: "#1a1b26",
      borderRadius: 12,
      border: "1px solid #24283b"
    }}>
      <h2 style={{ marginBottom: 16 }}>🔒 Settings Locked</h2>
      <p style={{ color: "#a7abb9", marginBottom: 24 }}>Please enter the admin password to continue.</p>
      
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16, width: "100%", maxWidth: 320 }}>
        <input 
          type="password" 
          placeholder="Enter Password" 
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={{
            padding: "12px",
            borderRadius: 6,
            border: "1px solid #24283b",
            background: "#16161e",
            color: "white",
            outline: "none"
          }}
        />
        
        {error && <div style={{ color: "#f87171", fontSize: 14 }}>{error}</div>}
        
        <button 
          type="submit" 
          disabled={loading}
          style={{
            padding: "12px",
            background: "#3b82f6",
            color: "white",
            border: "none",
            borderRadius: 6,
            fontWeight: "bold",
            cursor: loading ? "not-allowed" : "pointer"
          }}
        >
          {loading ? "Verifying..." : "Unlock"}
        </button>
      </form>
    </div>
  );
}