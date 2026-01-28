"use client";

import { useFormState, useFormStatus } from "react-dom";
import { updateGlobalConfig } from "@/app/actions/settings";

const initialState = {
  message: "",
  success: false,
};

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      style={{
        background: pending ? "#1f2937" : "#3b82f6",
        color: "white",
        border: "none",
        padding: "12px 24px",
        borderRadius: 6,
        cursor: pending ? "not-allowed" : "pointer",
        fontWeight: 600,
        fontSize: 16,
        transition: "background 0.2s",
      }}
    >
      {pending ? "Saving..." : "Save Settings"}
    </button>
  );
}

export function SettingsForm({ dbConfig, envFlags }: { dbConfig: any, envFlags: any }) {
  const [state, formAction] = useFormState(updateGlobalConfig, initialState);

  return (
    <div style={{ maxWidth: 600 }}>
      <div style={{ marginBottom: 32, padding: 16, border: "1px solid #24283b", borderRadius: 8, background: "#1a1b26" }}>
        <h3 style={{ marginTop: 0, marginBottom: 12 }}>Bot Authorization</h3>
        <p style={{ fontSize: 14, color: "#a7abb9", marginBottom: 16 }}>
          The bot needs permission to read chatters and events. Click below to log in with the bot account.
        </p>
        {dbConfig?.botUserName ? (
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ color: "#34d399", fontSize: 14 }}>
              ✅ Connected as <strong>{dbConfig.botUserName}</strong>
            </span>
            <a href="/api/auth/twitch" style={{ fontSize: 12, color: "#7aa2f7", textDecoration: "none" }}>(Reconnect)</a>
          </div>
        ) : (
          <a href="/api/auth/twitch" style={{ display: "inline-block", background: "#7aa2f7", color: "#1a1b26", padding: "8px 16px", borderRadius: 4, textDecoration: "none", fontWeight: "bold", fontSize: 14 }}>Connect Bot Account</a>
        )}
      </div>

      <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      
      {state?.message && (
        <div style={{ 
          padding: 12, 
          borderRadius: 6, 
          background: state.success ? "rgba(16, 185, 129, 0.1)" : "rgba(239, 68, 68, 0.1)",
          color: state.success ? "#34d399" : "#f87171",
          border: `1px solid ${state.success ? "#059669" : "#b91c1c"}`
        }}>
          {state.success ? "✅ " : "❌ "}{state.message}
        </div>
      )}

      <FormGroup 
        label="Twitch Client ID" 
        name="twitchClientId" 
        defaultValue={dbConfig?.twitchClientId || ""} 
        placeholder={envFlags.hasClientId ? "(Set in Env)" : "Enter Client ID"}
      />

      <FormGroup 
        label="Twitch Client Secret" 
        name="twitchClientSecret" 
        type="password"
        defaultValue={dbConfig?.twitchClientSecret || ""} 
        placeholder={envFlags.hasClientSecret ? "(Set in Env)" : "Enter Client Secret"}
      />

      <FormGroup 
        label="Twitch Webhook Secret" 
        name="twitchWebhookSecret" 
        type="password"
        defaultValue={dbConfig?.twitchWebhookSecret || ""} 
        placeholder={envFlags.hasWebhookSecret ? "(Set in Env)" : "Enter Webhook Secret"}
      />

      <FormGroup 
        label="Base URL" 
        name="appBaseUrl" 
        defaultValue={dbConfig?.appBaseUrl || ""} 
        placeholder={envFlags.hasBaseUrl ? "(Set in Env)" : "https://your-app.vercel.app"}
      />

      <FormGroup 
          label="Twitch Channel Name" 
          name="twitchChannel" 
          defaultValue={dbConfig?.twitchChannel || ""} 
          placeholder={dbConfig?.botUserName ? `Defaults to ${dbConfig.botUserName}` : "e.g. ninja (The channel to watch)"}
        />

      <div style={{ marginTop: 16 }}>
        <SubmitButton />
      </div>
    </form>
    
    <div style={{ marginTop: 32, padding: 16, border: "1px solid #24283b", borderRadius: 8, background: "#1a1b26" }}>
      <h3 style={{ marginTop: 0, marginBottom: 12 }}>Chat Integration</h3>
       {/* Helper text explaining the new architecture */}
       <div style={{ padding: 12, background: "rgba(59, 130, 246, 0.1)", borderRadius: 6, color: "#93c5fd", fontSize: 13, border: "1px solid rgba(59, 130, 246, 0.2)" }}>
          ℹ️ <strong>Note:</strong> Chat commands (!pontos, !shop) now work via the Overlay/Leaderboard. 
          Keep the <a href="/leaderboard" target="_blank" style={{ color: "#fff", textDecoration: "underline" }}>Leaderboard</a> open in a browser tab or OBS source for the bot to reply to chat.
       </div>
    </div>
    </div>
  );
}

function FormGroup({ label, name, defaultValue, placeholder, type = "text" }: { 
  label: string, 
  name: string, 
  defaultValue: string, 
  placeholder: string,
  type?: string
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <label style={{ fontWeight: 500 }}>{label}</label>
      <input
        type={type}
        name={name}
        defaultValue={defaultValue}
        placeholder={placeholder}
        style={{
          background: "#1a1b26",
          border: "1px solid #24283b",
          color: "white",
          padding: "10px 12px",
          borderRadius: 6,
          outline: "none",
          fontSize: 14,
        }}
      />
    </div>
  );
}