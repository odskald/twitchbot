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
    <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: 24, maxWidth: 600 }}>
      
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

      <div style={{ marginTop: 16 }}>
        <SubmitButton />
      </div>
    </form>
  );
}

function FormGroup({ label, name, type = "text", defaultValue, placeholder }: any) {
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
