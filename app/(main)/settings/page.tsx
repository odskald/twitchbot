import React from "react";
import Link from "next/link";
import { getGlobalConfig } from "@/lib/config";
import prisma from "@/lib/db";
import { SettingsForm } from "./settings-form";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  let dbConfig = null;
  let effectiveConfig = null;
  let dbError = null;

  try {
    // Fetch direct from DB to see what's stored vs env
    dbConfig = await prisma.globalConfig.findUnique({
      where: { id: "default" },
    });
    
    effectiveConfig = await getGlobalConfig();
  } catch (error: any) {
    console.error("Failed to load settings:", error);
    dbError = error.message || "Unknown database error";
    // Fallback object so page renders
    effectiveConfig = {
      twitchClientId: process.env.TWITCH_CLIENT_ID,
      twitchClientSecret: process.env.TWITCH_CLIENT_SECRET,
      twitchWebhookSecret: process.env.TWITCH_WEBHOOK_SECRET,
      appBaseUrl: process.env.BASE_URL,
      isConfigured: false
    };
  }

  if (dbError) {
    return (
      <div style={{ padding: 24, fontFamily: 'system-ui, sans-serif' }}>
        <h1 style={{ color: '#ef4444' }}>⚠️ Configuration Error</h1>
        <p>Could not connect to the database.</p>
        <pre style={{ background: '#1f2937', color: '#e5e7eb', padding: 16, borderRadius: 8, overflow: 'auto' }}>
          {dbError}
        </pre>
        <p style={{ marginTop: 16 }}>
          <strong>Action Required:</strong> Please ensure you have added the <code>DATABASE_URL</code> to your Vercel Project Settings (Environment Variables).
        </p>
        <p>
          Value should look like: <code>postgres://user:pass@host/db?sslmode=require</code>
        </p>
      </div>
    );
  }

  const envFlags = {
    hasClientId: !!process.env.TWITCH_CLIENT_ID,
    hasClientSecret: !!process.env.TWITCH_CLIENT_SECRET,
    hasWebhookSecret: !!process.env.TWITCH_WEBHOOK_SECRET,
    hasBaseUrl: !!process.env.BASE_URL,
  };

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

      <SettingsForm dbConfig={dbConfig} envFlags={envFlags} />

      <div style={{ marginTop: 48, padding: 24, background: "#14182c", borderRadius: 8 }}>
        <h3>Effective Configuration Status</h3>
        <ul style={{ lineHeight: 1.8, color: "#a7abb9" }}>
          <li>Client ID: {effectiveConfig?.twitchClientId ? "✅ Configured" : "❌ Missing"}</li>
          <li>Client Secret: {effectiveConfig?.twitchClientSecret ? "✅ Configured" : "❌ Missing"}</li>
          <li>Webhook Secret: {effectiveConfig?.twitchWebhookSecret ? "✅ Configured" : "❌ Missing"}</li>
          <li>Base URL: {effectiveConfig?.appBaseUrl ? "✅ Configured" : "❌ Missing"}</li>
        </ul>
        <p style={{ fontSize: 12, marginTop: 16, color: "#6b7280" }}>
          Note: DATABASE_URL must be configured in Vercel Environment Variables.
        </p>
      </div>
    </div>
  );
}
