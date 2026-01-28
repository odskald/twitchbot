import React from "react";
import Link from "next/link";
import { getGlobalConfig } from "@/lib/config";
import { updateGlobalConfig } from "@/app/actions/settings";
import prisma from "@/lib/db";

export default async function SettingsPage() {
  // Fetch direct from DB to see what's stored vs env
  const dbConfig = await prisma.globalConfig.findUnique({
    where: { id: "default" },
  });

  const effectiveConfig = await getGlobalConfig();

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <Link href="/" style={{ color: "#a7abb9", textDecoration: "none" }}>
          ← Back to Dashboard
        </Link>
      </div>

      <h1>Settings</h1>
      <p style={{ color: "#a7abb9", marginBottom: 32 }}>
        Configure external keys and URLs. Values entered here override environment variables.
      </p>

      <form action={updateGlobalConfig} style={{ display: "flex", flexDirection: "column", gap: 24, maxWidth: 600 }}>
        
        <FormGroup 
          label="Twitch Client ID" 
          name="twitchClientId" 
          defaultValue={dbConfig?.twitchClientId || ""} 
          placeholder={process.env.TWITCH_CLIENT_ID ? "(Set in Env)" : "Enter Client ID"}
        />

        <FormGroup 
          label="Twitch Client Secret" 
          name="twitchClientSecret" 
          type="password"
          defaultValue={dbConfig?.twitchClientSecret || ""} 
          placeholder={process.env.TWITCH_CLIENT_SECRET ? "(Set in Env)" : "Enter Client Secret"}
        />

        <FormGroup 
          label="Twitch Webhook Secret" 
          name="twitchWebhookSecret" 
          type="password"
          defaultValue={dbConfig?.twitchWebhookSecret || ""} 
          placeholder={process.env.TWITCH_WEBHOOK_SECRET ? "(Set in Env)" : "Enter Webhook Secret"}
        />

        <FormGroup 
          label="Base URL" 
          name="appBaseUrl" 
          defaultValue={dbConfig?.appBaseUrl || ""} 
          placeholder={process.env.BASE_URL ? "(Set in Env)" : "https://your-app.vercel.app"}
        />

        <div style={{ marginTop: 16 }}>
          <button
            type="submit"
            style={{
              background: "#3b82f6",
              color: "white",
              border: "none",
              padding: "12px 24px",
              borderRadius: 6,
              cursor: "pointer",
              fontWeight: 600,
              fontSize: 16
            }}
          >
            Save Settings
          </button>
        </div>
      </form>

      <div style={{ marginTop: 48, padding: 24, background: "#14182c", borderRadius: 8 }}>
        <h3>Effective Configuration Status</h3>
        <ul style={{ lineHeight: 1.8, color: "#a7abb9" }}>
          <li>Client ID: {effectiveConfig.twitchClientId ? "✅ Configured" : "❌ Missing"}</li>
          <li>Client Secret: {effectiveConfig.twitchClientSecret ? "✅ Configured" : "❌ Missing"}</li>
          <li>Webhook Secret: {effectiveConfig.twitchWebhookSecret ? "✅ Configured" : "❌ Missing"}</li>
          <li>Base URL: {effectiveConfig.appBaseUrl ? "✅ Configured" : "❌ Missing"}</li>
        </ul>
        <p style={{ fontSize: 12, marginTop: 16, color: "#6b7280" }}>
          Note: DATABASE_URL must be configured in Vercel Environment Variables.
        </p>
      </div>
    </div>
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
          background: "#0f1220",
          border: "1px solid #24283b",
          padding: "10px 12px",
          borderRadius: 6,
          color: "white",
          fontSize: 14
        }}
      />
    </div>
  );
}
