import React from "react";
import Link from "next/link";

export default async function Page() {
  // Simple status placeholders; could be populated from DB in future
  const botStatus = {
    health: "ok",
    channelsTracked: 0,
    usersKnown: 0,
  };

  return (
    <div>
      <section>
        <h2>Bot status</h2>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
            gap: 16,
          }}
        >
          <Card title="Health" value={botStatus.health} />
          <Card title="Channels tracked" value={String(botStatus.channelsTracked)} />
          <Card title="Users known" value={String(botStatus.usersKnown)} />
        </div>
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
