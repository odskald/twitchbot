import React from "react";
import type { Metadata } from "next";

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
          <header style={{ marginBottom: 24 }}>
            <h1 style={{ margin: 0 }}>Twitch Lurker Bot</h1>
            <p style={{ margin: "4px 0 0 0", color: "#a7abb9" }}>
              Serverless EventSub, Prisma + Neon Postgres
            </p>
          </header>
          <main>{children}</main>
        </div>
      </body>
    </html>
  );
}
