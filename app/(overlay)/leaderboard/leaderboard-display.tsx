"use client";

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

function LeaderboardList({ title, data, type }: { title: string, data: UserData[], type: 'points' | 'level' }) {
  return (
    <div style={{ flex: 1, minWidth: 250 }}>
      <h3 style={{ 
        margin: "0 0 12px 0", 
        color: "white", 
        fontSize: 18, 
        textShadow: "0 2px 4px rgba(0,0,0,0.5)",
        textAlign: "center",
        background: "rgba(0,0,0,0.4)",
        padding: "8px",
        borderRadius: 8,
        backdropFilter: "blur(4px)"
      }}>
        {title}
      </h3>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {data.map((user, index) => (
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
              {type === 'points' ? `${user.points} Pts` : `Lvl ${user.level}`}
            </div>
          </div>
        ))}
        {data.length === 0 && (
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

export default function LeaderboardDisplay({ topPoints, topLevel }: LeaderboardDisplayProps) {
  return (
    <div style={{ 
      padding: 16, 
      fontFamily: "system-ui, sans-serif",
      display: "flex",
      gap: 24,
      width: "fit-content"
    }}>
      <LeaderboardList title="🏆 Top Points" data={topPoints} type="points" />
      <LeaderboardList title="⭐ Top Levels" data={topLevel} type="level" />
    </div>
  );
}
