"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";

interface Chatter {
  user_id: string;
  user_name: string;
  points?: number;
  level?: number;
  xp?: number;
}

interface DashboardData {
  channelsCount: number;
  usersCount: number;
  liveChatters: {
    count: number;
    chatters: Chatter[];
    error?: string;
  };
}

export default function Page() {
  const [data, setData] = useState<DashboardData | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch("/api/stats/dashboard");
        if (res.ok) {
          const json = await res.json();
          setData(json);
        }
      } catch (err) {
        console.error("Failed to fetch dashboard data", err);
      }
    };

    fetchData(); // Initial fetch
    const interval = setInterval(fetchData, 10000); // Poll every 10s

    return () => clearInterval(interval);
  }, []);

  if (!data) {
    return <div style={{ color: "#a7abb9", padding: 20 }}>Loading dashboard stats...</div>;
  }

  const { channelsCount, usersCount, liveChatters } = data;

  const botStatus = {
    channelsTracked: channelsCount,
    usersKnown: usersCount,
    liveViewers: liveChatters.count
  };

  function Card({ title, value }: { title: string; value: string }) {
    return (
      <div
        style={{
          background: "#1a1b26",
          padding: 24,
          borderRadius: 12,
          border: "1px solid #24283b",
        }}
      >
        <h3 style={{ margin: "0 0 8px 0", fontSize: 14, color: "#a9b1d6" }}>
          {title}
        </h3>
        <p style={{ margin: 0, fontSize: 24, fontWeight: "bold", color: "#c0caf5" }}>
          {value}
        </p>
      </div>
    );
  }

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
        {liveChatters.error ? (
           <div style={{ padding: 16, background: "rgba(239, 68, 68, 0.1)", borderRadius: 8, border: "1px solid #b91c1c" }}>
             <p style={{ margin: 0, color: "#f87171" }}>
               <strong>Error:</strong> {liveChatters.error}
             </p>
             <p style={{ marginTop: 8, fontSize: 14, color: "#fca5a5" }}>
               Please check <Link href="/settings" style={{ color: "#fff", textDecoration: "underline" }}>Settings</Link> to ensure the bot is connected.
             </p>
           </div>
        ) : liveChatters.chatters.length === 0 ? (
          <div style={{ padding: 16, background: "rgba(255, 255, 255, 0.05)", borderRadius: 8 }}>
            <p style={{ margin: 0, color: "#a7abb9" }}>
              No chatters detected. (Channel is empty or offline)
            </p>
          </div>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
            {liveChatters.chatters.map((chatter) => (
              <div 
                key={chatter.user_id}
                style={{
                  background: "#1a1b26",
                  border: "1px solid #24283b",
                  padding: "8px 16px",
                  borderRadius: 8,
                  display: "flex",
                  flexDirection: "column",
                  minWidth: 120
                }}
              >
                <span style={{ fontSize: 14, fontWeight: "bold", color: "#c0caf5", marginBottom: 4 }}>
                  {chatter.user_name}
                </span>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#7aa2f7" }}>
                  <span>Lvl {chatter.level || 1}</span>
                  <span>{chatter.points || 0} Pts</span>
                </div>
                <div style={{ fontSize: 11, color: "#565f89", marginTop: 2 }}>
                  XP: {chatter.xp || 0}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
