"use client";

import { useEffect, useState } from "react";
import LeaderboardDisplay from "./leaderboard-display";

interface UserData {
  displayName: string | null;
  points: number;
  level: number;
  xp?: number;
}

export default function LeaderboardPage() {
  const [data, setData] = useState<{ topPoints: UserData[]; topLevel: UserData[] } | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch("/api/stats/leaderboard");
        if (res.ok) {
          const json = await res.json();
          setData(json);
        }
      } catch (err) {
        console.error("Failed to fetch leaderboard", err);
      }
    };

    fetchData(); // Initial fetch
    const interval = setInterval(fetchData, 5000); // Poll every 5s

    return () => clearInterval(interval);
  }, []);

  if (!data) {
    return <div style={{ color: "white", padding: 16 }}>Loading...</div>;
  }

  return (
    <LeaderboardDisplay topPoints={data.topPoints} topLevel={data.topLevel} />
  );
}
