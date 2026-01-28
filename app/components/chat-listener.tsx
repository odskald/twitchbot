"use client";

import { useEffect, useRef, useState } from "react";
import tmi from "tmi.js";
import { processChatCommand } from "@/app/actions/chat-commands";

interface ChatListenerProps {
  channel: string;
}

export function ChatListener({ channel }: ChatListenerProps) {
  const clientRef = useRef<tmi.Client | null>(null);
  const [status, setStatus] = useState<"disconnected" | "connected" | "error">("disconnected");
  const [logs, setLogs] = useState<string[]>([]);

  useEffect(() => {
    if (!channel) return;

    // Prevent multiple connections
    if (clientRef.current) return;

    const client = new tmi.Client({
      channels: [channel],
      // Anonymous connection is fine for reading public chat
      // We will send replies via the Server Action -> Helix API
    });

    client.on("connected", () => {
      console.log(`[ChatListener] Connected to ${channel}`);
      setStatus("connected");
      setLogs(prev => [`Connected to #${channel}`, ...prev].slice(0, 5));
    });

    client.on("disconnected", () => {
      console.log(`[ChatListener] Disconnected`);
      setStatus("disconnected");
    });

    client.on("message", async (channel, tags, message, self) => {
      if (self) return; // Ignore own messages if we were logged in (we aren't, but good practice)

      if (message.startsWith("!")) {
        const args = message.slice(1).split(" ");
        const command = "!" + args.shift()?.toLowerCase();
        
        console.log(`[ChatListener] Command detected: ${command}`);
        setLogs(prev => [`Cmd: ${command} (${tags["display-name"]})`, ...prev].slice(0, 5));

        // Call Server Action to handle logic and reply
        await processChatCommand(command, args, {
            username: tags["display-name"] || tags.username || "Unknown",
            userId: tags["user-id"] || "",
            isMod: tags.mod || false,
            isBroadcaster: tags.badges?.broadcaster === "1"
        }, tags.id);
      }
    });

    client.connect().catch((err) => {
      console.error("[ChatListener] Connection failed:", err);
      setStatus("error");
    });

    clientRef.current = client;

    return () => {
      if (clientRef.current) {
        clientRef.current.disconnect();
        clientRef.current = null;
      }
    };
  }, [channel]);

  // Minimal UI to show it's working (hidden by default in overlay? Or small indicator?)
  // For the overlay, we might want it invisible or just a small status dot.
  return (
    <div style={{ 
        position: "fixed", 
        bottom: 10, 
        right: 10, 
        padding: 8, 
        background: "rgba(0,0,0,0.7)", 
        color: "white", 
        fontSize: 10,
        borderRadius: 4,
        zIndex: 9999,
        pointerEvents: "none",
        fontFamily: "monospace"
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <div style={{ 
            width: 8, 
            height: 8, 
            borderRadius: "50%", 
            background: status === "connected" ? "#10b981" : status === "error" ? "#ef4444" : "#6b7280" 
        }} />
        <span>Chat Listener: {status}</span>
      </div>
      <div style={{ marginTop: 4, opacity: 0.7 }}>
        {logs.map((log, i) => <div key={i}>{log}</div>)}
      </div>
    </div>
  );
}
