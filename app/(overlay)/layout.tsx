import React from "react";

export const metadata = {
  title: "Twitch Bot Overlay",
  description: "Overlay for Twitch Bot",
};

export default function OverlayLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body style={{ margin: 0, padding: 0, background: "transparent", overflow: "hidden", fontFamily: "sans-serif" }}>
        {children}
      </body>
    </html>
  );
}
