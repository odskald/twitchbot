import React from "react";
import Link from "next/link";
import prisma from "@/lib/db";
import { getLiveChatters } from "@/lib/twitch-api";

export const dynamic = "force-dynamic";

export default async function Page() {
  const [channelsCount, usersCount, recentUsers, liveChatters] = await Promise.all([
    prisma.channel.count(),
    prisma.user.count(),
    prisma.user.findMany({
      orderBy: { updatedAt: 'desc' },
      take: 10,
      include: {
        pointLedger: {
          select: { points: true }
        }
      }
    }),
    getLiveChatters()
  ]);

  const botStatus = {
    health: "ok",
    channelsTracked: channelsCount,
    usersKnown: usersCount,
    liveViewers: liveChatters.count
  };

  return (
    <div>
      <section>
        <h2>Bot status</h2>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
            gap: 16,
          }}
        >
          <Card title="Live Chatters (Helix)" value={String(botStatus.liveViewers)} />
          <Card title="Users in DB" value={String(botStatus.usersKnown)} />
          <Card title="Channels tracked" value={String(botStatus.channelsTracked)} />
        </div>
      </section>

      {/* Live Chatters Section */}
      <section style={{ marginTop: 32 }}>
        <h3>Live Chatters (Connected to Chat)</h3>
        {liveChatters.chatters.length === 0 ? (
          <div style={{ padding: 16, background: "rgba(255, 255, 255, 0.05)", borderRadius: 8 }}>
            <p style={{ margin: 0, color: "#a7abb9" }}>
              No chatters detected or bot not authenticated. 
              Ensure you have <Link href="/settings" style={{ color: "#7aa2f7" }}>connected the bot account</Link> in settings.
            </p>
          </div>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {liveChatters.chatters.map((chatter) => (
              <span 
                key={chatter.user_id}
                style={{
                  background: "#1a1b26",
                  border: "1px solid #24283b",
                  padding: "4px 12px",
                  borderRadius: 16,
                  fontSize: 14,
                  color: "#c0caf5"
                }}
              >
                {chatter.user_name}
              </span>
            ))}
          </div>
        )}
      </section>

      <section style={{ marginTop: 32 }}>
        <h3>Recently Active Users (Database)</h3>
        {recentUsers.length === 0 ? (
          <p style={{ color: "#a7abb9" }}>No users tracked yet. Waiting for events...</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: 14 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #24283b" }}>
                  <th style={{ padding: "12px 8px", color: "#a7abb9" }}>Twitch ID</th>
                  <th style={{ padding: "12px 8px", color: "#a7abb9" }}>Display Name</th>
                  <th style={{ padding: "12px 8px", color: "#a7abb9" }}>Last Seen</th>
                  <th style={{ padding: "12px 8px", color: "#a7abb9" }}>Points</th>
                </tr>
              </thead>
              <tbody>
                {recentUsers.map((user) => {
                  const totalPoints = user.pointLedger.reduce((acc, curr) => acc + curr.points, 0);
                  return (
                    <tr key={user.id} style={{ borderBottom: "1px solid #1a1b26" }}>
                      <td style={{ padding: "12px 8px" }}>{user.twitchId}</td>
                      <td style={{ padding: "12px 8px", fontWeight: 500 }}>{user.displayName || "-"}</td>
                      <td style={{ padding: "12px 8px", color: "#a7abb9" }}>
                        {new Date(user.updatedAt).toLocaleDateString()} {new Date(user.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td style={{ padding: "12px 8px" }}>{totalPoints}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section style={{ marginTop: 24 }}>
        <h3>Utilities</h3>
        <ul style={{ marginBottom: 24 }}>
          <li>
            <Link href="/api/health">Health endpoint</Link>
          </li>
        </ul>
        <Link 
          href="/settings"
          style={{
            display: "inline-block",
            background: "#24283b",
            color: "white",
            textDecoration: "none",
            padding: "8px 16px",
            borderRadius: 6,
            fontSize: 14
          }}
        >
          ⚙️ Open Settings
        </Link>
      </section>

      <footer style={{ marginTop: 64, borderTop: "1px solid #24283b", paddingTop: 24, color: "#565f89", fontSize: 12 }}>
        <p>Twitch Lurker Bot v1.0.1 • Running on Vercel</p>
      </footer>
    </div>
  );
}

function Card({ title, value }: { title: string; value: string }) {
  return (
    <div
      style={{
        border: "1px solid #24283b",
        borderRadius: 8,
        padding: 12,
        background: "#14182c",
      }}
    >
      <div style={{ fontSize: 12, color: "#a7abb9", marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: 18 }}>{value}</div>
    </div>
  );
}
