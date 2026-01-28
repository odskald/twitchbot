import React from "react";
import type { Metadata } from "next";

import Link from "next/link";

export const metadata: Metadata = {
  title: "Twitch Lurker Bot",
  description: "Bot status dashboard",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body
        style={{
          fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
          margin: 0,
          background: "#0f1220",
          color: "#e6e8ef",
        }}
      >
        <div style={{ maxWidth: 900, margin: "0 auto", padding: "24px" }}>
          <header style={{ marginBottom: 24, display: "flex", justifyContent: "space-between", alignItems: "start" }}>
            <div>
              <h1 style={{ margin: 0 }}>Twitch Lurker Bot</h1>
              <p style={{ margin: "4px 0 0 0", color: "#a7abb9" }}>
                Serverless EventSub, Prisma + Neon Postgres
              </p>
            </div>
            <nav style={{ display: "flex", gap: 16, marginTop: 8 }}>
              <Link href="/" style={{ color: "#3b82f6", textDecoration: "none", fontWeight: "bold" }}>Dashboard</Link>
              <Link href="/settings" style={{ color: "#3b82f6", textDecoration: "none", fontWeight: "bold" }}>Settings</Link>
              <Link href="/leaderboard" target="_blank" style={{ color: "#a855f7", textDecoration: "none", fontWeight: "bold" }}>Overlay ↗</Link>
            </nav>
          </header>
          <main>{children}</main>
        </div>
      </body>
    </html>
  );
}
