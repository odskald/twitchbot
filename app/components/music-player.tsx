"use client";

import { useEffect, useState, useRef } from 'react';
import tmi from 'tmi.js';

interface MusicPlayerProps {
  channel: string;
  botName?: string;
}

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: () => void;
  }
}

export default function MusicPlayer({ channel, botName }: MusicPlayerProps) {
  // State
  const [queue, setQueue] = useState<string[]>([]);
  const [currentVideoId, setCurrentVideoId] = useState<string | null>(null);
  const [player, setPlayer] = useState<any>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [lastSignal, setLastSignal] = useState<string>("None");
  
  // Refs for closure access
  const queueRef = useRef<string[]>([]);
  const playerRef = useRef<any>(null);

  // Sync Refs
  useEffect(() => { queueRef.current = queue; }, [queue]);
  useEffect(() => { playerRef.current = player; }, [player]);

  // Logging Helper
  const addLog = (msg: string) => {
    const time = new Date().toLocaleTimeString().split(' ')[0];
    const logLine = `[${time}] ${msg}`;
    console.log(`[MusicPlayer] ${logLine}`);
    setLogs(prev => [logLine, ...prev].slice(0, 10)); // Newest first, max 10
  };

  // --- YouTube Player Logic ---

  // Initialize YouTube API
  useEffect(() => {
    if (!window.YT) {
      const tag = document.createElement('script');
      tag.src = "https://www.youtube.com/iframe_api";
      const firstScriptTag = document.getElementsByTagName('script')[0];
      firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);
      
      window.onYouTubeIframeAPIReady = () => {
        addLog("YouTube API Ready");
        // We don't init player here immediately, we wait for a video ID
      };
    }
  }, []);

  // Handle Video Change
  useEffect(() => {
    if (!currentVideoId) return;

    addLog(`Attempting to play: ${currentVideoId}`);

    if (playerRef.current && playerRef.current.loadVideoById) {
      // Player exists, just load new video
      try {
        playerRef.current.loadVideoById(currentVideoId);
        playerRef.current.playVideo(); // Ensure play
        addLog("Loaded video into existing player");
      } catch (e) {
        addLog("Error loading video: " + e);
      }
    } else {
      // Create new player
      if (window.YT && window.YT.Player) {
        try {
          new window.YT.Player('player-frame', {
            height: '100%',
            width: '100%',
            videoId: currentVideoId,
            playerVars: {
              'autoplay': 1,
              'controls': 0,
              'disablekb': 1,
              'fs': 0,
              'rel': 0,
            },
            events: {
              'onReady': (event: any) => {
                addLog("Player Ready Event");
                setPlayer(event.target);
                event.target.playVideo();
              },
              'onStateChange': (event: any) => {
                // 0 = Ended
                if (event.data === 0) {
                  playNext();
                }
              },
              'onError': (event: any) => {
                 addLog(`Player Error: ${event.data}`);
                 playNext(); // Skip on error
              }
            },
          });
          addLog("Initialized new Player instance");
        } catch (e) {
          addLog("Error creating player: " + e);
        }
      } else {
        addLog("YouTube API not yet loaded. Retrying in 1s...");
        setTimeout(() => setCurrentVideoId(prev => prev), 1000); // Trigger re-render
      }
    }
  }, [currentVideoId]);

  const playNext = () => {
    const next = queueRef.current[0];
    if (next) {
      addLog(`Auto-playing next: ${next}`);
      setQueue(prev => prev.slice(1));
      setCurrentVideoId(next);
    } else {
      addLog("Queue empty, stopping.");
      setCurrentVideoId(null);
      // Optional: Destroy player to show black screen/background
      if (playerRef.current) {
         playerRef.current.destroy();
         setPlayer(null);
      }
    }
  };

  // --- Chat Listener Logic ---

  useEffect(() => {
    if (!channel) return;

    const client = new tmi.Client({
      channels: [channel],
      connection: { reconnect: true, secure: true }
    });

    client.connect().then(() => addLog(`Connected to chat: ${channel}`)).catch(e => addLog(`Chat Error: ${e}`));

    client.on('message', (channel, tags, message, self) => {
      // NOTE: We REMOVED 'if (self) return' to allow bot signals to be heard!
      
      const msg = message.trim();
      const sender = tags.username || 'unknown';
      
      // Authorization Check (Loose)
      const isMod = tags.mod || tags.badges?.broadcaster === "1";
      const isMe = tags.username?.toLowerCase() === botName?.toLowerCase(); // Bot itself
      const isAuthorized = isMod || isMe || (sender.toLowerCase() === channel.toLowerCase());

      // 1. Client-Side !music Override (For direct links)
      // This bypasses the server if it's a direct link, ensuring it works even if server actions fail.
      if ((msg.startsWith('!music ') || msg.startsWith('!play ')) && isAuthorized) {
          const args = msg.split(' ');
          const input = args[1];
          if (input) {
             // Basic YouTube ID extraction regex
             const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
             const match = input.match(regExp);
             const videoId = (match && match[2].length === 11) ? match[2] : null;
             
             if (videoId) {
                 addLog(`[ClientOverride] Playing Link: ${videoId}`);
                 setCurrentVideoId(videoId);
                 return; // handled
             }
          }
      }

      // 2. Signal Handling (Standard)
      if (msg.startsWith('[')) {
          // Normalize spaces: "[InstantPlay]  ID" -> "[InstantPlay] ID"
          const cleanMsg = msg.replace(/\s+/g, ' '); 
          
          if (cleanMsg.startsWith('[InstantPlay]')) {
              if (!isAuthorized) { addLog(`Auth Fail: ${sender}`); return; }
              const parts = cleanMsg.split(' ');
              const videoId = parts[1];
              if (videoId) {
                  setLastSignal(`InstantPlay ${videoId}`);
                  addLog(`Signal: InstantPlay ${videoId}`);
                  setCurrentVideoId(videoId);
              }
          }

          else if (cleanMsg.startsWith('[QueueAdd]')) {
             if (!isAuthorized) { return; }
             const parts = cleanMsg.split(' ');
             const videoId = parts[1];
             if (videoId) {
                 setLastSignal(`QueueAdd ${videoId}`);
                 addLog(`Signal: QueueAdd ${videoId}`);
                 setQueue(prev => [...prev, videoId]);
             }
          }

          else if (cleanMsg.startsWith('[Skip]')) {
              if (!isAuthorized) return;
              addLog("Signal: Skip");
              playNext();
          }

          else if (cleanMsg.startsWith('[Stop]')) {
              if (!isAuthorized) return;
              addLog("Signal: Stop");
              setQueue([]);
              setCurrentVideoId(null);
              if (playerRef.current) {
                  playerRef.current.destroy();
                  setPlayer(null);
              }
          }
      }
    });

    return () => {
      client.disconnect();
    };
  }, [channel, botName]);


  return (
    <div className="w-full h-screen bg-black text-white overflow-hidden relative group">
        {/* Video Container */}
        <div id="player-frame" className="w-full h-full absolute inset-0 z-10" />

        {/* Placeholder / Idle State */}
        {!currentVideoId && (
            <div className="absolute inset-0 flex items-center justify-center z-0">
                <div className="text-center opacity-50">
                    <h1 className="text-4xl font-bold mb-4">Music Overlay</h1>
                    <p>Waiting for commands...</p>
                    <p className="text-sm mt-2">!music &lt;link&gt; or !music &lt;name&gt;</p>
                </div>
            </div>
        )}

        {/* Debug Overlay (Always visible for now to help user) */}
        <div className="absolute top-0 left-0 p-4 bg-black/80 z-50 text-xs font-mono w-full max-h-48 overflow-y-auto pointer-events-none">
            <div className="font-bold text-green-400 border-b border-green-800 mb-1">
                STATUS: {currentVideoId ? 'PLAYING' : 'IDLE'} | AUTH: {botName || '???'} | LAST: {lastSignal}
            </div>
            {logs.map((log, i) => (
                <div key={i} className="opacity-80 border-b border-gray-800 py-0.5">
                    {log}
                </div>
            ))}
        </div>
    </div>
  );
}