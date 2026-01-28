"use client";

import { useState } from "react";

interface UserData {
  displayName: string | null;
  points: number;
  level: number;
  xp?: number;
}

interface LeaderboardDisplayProps {
  topPoints: UserData[];
  topLevel: UserData[];
}

export default function LeaderboardDisplay({ topPoints, topLevel }: LeaderboardDisplayProps) {
  const [activeTab, setActiveTab] = useState<'points' | 'level'>('points');

  const activeData = activeTab === 'points' ? topPoints : topLevel;

  return (
    <div style={{ padding: 16, width: 300, fontFamily: "system-ui, sans-serif" }}>
      {/* Menu */}
      <div style={{ 
        display: "flex", 
        gap: 8, 
        marginBottom: 16, 
        background: "rgba(0,0,0,0.6)", 
        padding: 4, 
        borderRadius: 999,
        border: "1px solid rgba(255,255,255,0.1)",
        backdropFilter: "blur(4px)"
      }}>
        <button
          onClick={() => setActiveTab('points')}
          style={{
            flex: 1,
            background: activeTab === 'points' ? "#7c3aed" : "transparent",
            color: "white",
            border: "none",
            borderRadius: 999,
            padding: "8px 16px",
            cursor: "pointer",
            fontWeight: "bold",
            fontSize: 14,
            transition: "all 0.2s"
          }}
        >
          Points
        </button>
        <button
          onClick={() => setActiveTab('level')}
          style={{
            flex: 1,
            background: activeTab === 'level' ? "#7c3aed" : "transparent",
            color: "white",
            border: "none",
            borderRadius: 999,
            padding: "8px 16px",
            cursor: "pointer",
            fontWeight: "bold",
            fontSize: 14,
            transition: "all 0.2s"
          }}
        >
          Levels
        </button>
      </div>

      {/* List */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {activeData.map((user, index) => (
          <div key={index} style={{
            display: "flex",
            alignItems: "center",
            background: "rgba(15, 23, 42, 0.9)",
            padding: "12px",
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.1)",
            color: "white",
            boxShadow: "0 4px 6px rgba(0,0,0,0.1)"
          }}>
            <div style={{ 
              width: 24, 
              height: 24, 
              background: index === 0 ? "#fbbf24" : index === 1 ? "#94a3b8" : index === 2 ? "#b45309" : "#334155",
              color: index < 3 ? "black" : "white",
              borderRadius: "50%", 
              display: "flex", 
              alignItems: "center", 
              justifyContent: "center",
              fontWeight: "bold",
              fontSize: 12,
              marginRight: 12,
              flexShrink: 0
            }}>
              {index + 1}
            </div>
            <div style={{ flex: 1, fontWeight: "bold", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {user.displayName || "Unknown"}
            </div>
            <div style={{ fontSize: 14, color: "#a5b4fc", fontWeight: "bold", marginLeft: 8 }}>
              {activeTab === 'points' ? `${user.points} Pts` : `Lvl ${user.level}`}
            </div>
          </div>
        ))}
        {activeData.length === 0 && (
          <div style={{ 
            padding: 16, 
            textAlign: "center", 
            color: "#94a3b8", 
            background: "rgba(15, 23, 42, 0.6)",
            borderRadius: 12
          }}>
            No data yet
          </div>
        )}
      </div>
    </div>
  );
}
