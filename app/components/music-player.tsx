"use client";

import { useEffect, useState, useRef } from 'react';
import tmi from 'tmi.js';

interface MusicPlayerProps {
  channel: string;
  botName?: string;
}

interface QueueItem {
    id: string;
    title: string;
    requester: string;
}

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: () => void;
  }
}

export default function MusicPlayer({ channel, botName }: MusicPlayerProps) {
  // State
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [currentVideoId, setCurrentVideoId] = useState<string | null>(null);
  const [currentTitle, setCurrentTitle] = useState<string>("");
  const [currentRequester, setCurrentRequester] = useState<string>("");
  const [player, setPlayer] = useState<any>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [lastSignal, setLastSignal] = useState<string>("None");
  
  // Refs for closure access
  const queueRef = useRef<QueueItem[]>([]);
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
                
                // If title is missing (e.g. client override), try to fetch it
                if (!currentTitle) {
                     const data = event.target.getVideoData();
                     if (data && data.title) {
                         setCurrentTitle(data.title);
                     }
                }
              },
              'onStateChange': (event: any) => {
                // 1 = Playing. Update title if needed
                if (event.data === 1) {
                    const data = event.target.getVideoData();
                     if (data && data.title) {
                         // Only update if we don't have a better title from server
                         if (!currentTitle || currentTitle === "Loading...") {
                             setCurrentTitle(data.title);
                         }
                     }
                }

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
    const nextItem = queueRef.current[0];
    if (nextItem) {
      addLog(`Auto-playing next: ${nextItem.title}`);
      setQueue(prev => prev.slice(1));
      setCurrentVideoId(nextItem.id);
      setCurrentTitle(nextItem.title);
      setCurrentRequester(nextItem.requester);
    } else {
      addLog("Queue empty, stopping.");
      setCurrentVideoId(null);
      setCurrentTitle("");
      setCurrentRequester("");
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
      // Fix: Always authorize 'self' (the bot) so signals are accepted!
      const isAuthorized = isMod || isMe || self || (sender.toLowerCase() === channel.toLowerCase());

      // 1. Client-Side Overrides (Bypass Server Signals for faster response)
      if (isAuthorized) {
        // !music / !play
        if (msg.startsWith('!music ') || msg.startsWith('!play ')) {
            const args = msg.split(' ');
            const input = args[1];
            if (input) {
               const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
               const match = input.match(regExp);
               const videoId = (match && match[2].length === 11) ? match[2] : null;
               
               if (videoId) {
                   addLog(`[ClientOverride] Playing Link: ${videoId}`);
                   setCurrentVideoId(videoId);
                   setCurrentTitle("Loading..."); 
                   setCurrentRequester(sender);
                   return; 
               }
            }
        }

        // !skip / !next
        if (msg === '!skip' || msg === '!next') {
            addLog("[ClientOverride] Skip");
            playNext();
            return;
        }

        // !stop
        if (msg === '!stop') {
            addLog("[ClientOverride] Stop");
            setQueue([]);
            setCurrentVideoId(null);
            setCurrentTitle("");
            setCurrentRequester("");
            if (playerRef.current) {
                playerRef.current.destroy();
                setPlayer(null);
            }
            return;
        }

        // !pause
        if (msg === '!pause') {
            addLog("[ClientOverride] Pause");
            if (playerRef.current && playerRef.current.pauseVideo) {
                playerRef.current.pauseVideo();
            }
            return;
        }

        // !play (resume)
        if (msg === '!play' || msg === '!resume') {
             addLog("[ClientOverride] Resume");
             if (playerRef.current && playerRef.current.playVideo) {
                 playerRef.current.playVideo();
             }
             return;
        }

        // !queue (view)
        if (msg === '!queue') {
             // Just show log for now, as we can't reply to chat easily from client without auth token
             // But the UI shows the queue anyway.
             addLog(`[ClientOverride] Queue Check (${queueRef.current.length} items)`);
        }
      }

      // 2. Signal Handling (Standard)
          if (msg.startsWith('[')) {
              // Normalize spaces: "[InstantPlay]  ID" -> "[InstantPlay] ID"
              const cleanMsg = msg.replace(/\s+/g, ' '); 
              const signalType = cleanMsg.split(' ')[0]; // e.g. [InstantPlay]

              // Debug Log for Signal Analysis
              if (['[InstantPlay]', '[QueueAdd]', '[Skip]', '[Stop]', '[Pause]', '[Play]', '[QueueCheck]'].includes(signalType)) {
                  addLog(`Rx Signal: ${signalType} | Sender: ${sender} | Auth: ${isAuthorized} (Mod:${isMod} Me:${isMe} Self:${self})`);
              }
              
              if (cleanMsg.startsWith('[InstantPlay]')) {
                  if (!isAuthorized) { addLog(`Auth Fail for InstantPlay`); return; }
              const parts = cleanMsg.split(' ');
              const videoId = parts[1];
              const requester = parts[2] || "Unknown";
              // Title is everything after the requester. 
              // cleanMsg = "[InstantPlay] ID Requester Title goes here"
              // parts = ["[InstantPlay]", "ID", "Requester", "Title", "goes", "here"]
              const title = parts.slice(3).join(' ') || "Unknown Title";

              if (videoId) {
                  setLastSignal(`InstantPlay ${videoId}`);
                  addLog(`Signal: InstantPlay ${title}`);
                  setCurrentVideoId(videoId);
                  setCurrentTitle(title);
                  setCurrentRequester(requester);
              }
          }

          else if (cleanMsg.startsWith('[QueueAdd]')) {
             if (!isAuthorized) { return; }
             const parts = cleanMsg.split(' ');
             const videoId = parts[1];
             const requester = parts[2] || "Unknown";
             const title = parts.slice(3).join(' ') || "Unknown Title";

             if (videoId) {
                 setLastSignal(`QueueAdd ${videoId}`);
                 addLog(`Signal: QueueAdd ${title}`);
                 setQueue(prev => [...prev, { id: videoId, title, requester }]);
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
              setCurrentTitle("");
              setCurrentRequester("");
              if (playerRef.current) {
                  playerRef.current.destroy();
                  setPlayer(null);
              }
          }

          else if (cleanMsg.startsWith('[Pause]')) {
              if (!isAuthorized) return;
              addLog("Signal: Pause");
              if (playerRef.current && playerRef.current.pauseVideo) {
                  playerRef.current.pauseVideo();
              }
          }

          else if (cleanMsg.startsWith('[Play]')) {
              if (!isAuthorized) return;
              addLog("Signal: Play/Resume");
              if (playerRef.current && playerRef.current.playVideo) {
                  playerRef.current.playVideo();
              }
          }

          else if (cleanMsg.startsWith('[QueueCheck]')) {
              if (!isAuthorized) return;
              const q = queueRef.current;
              addLog(`Signal: QueueCheck (${q.length} items)`);
              if (q.length > 0) {
                  addLog(`Next: ${q.slice(0, 3).map(i => i.title).join(', ')}...`);
              } else {
                  addLog("Queue is empty.");
              }
          }
      }
    });

    return () => {
      client.disconnect();
    };
  }, [channel, botName]);


  return (
    <div className="w-full h-screen bg-black text-white overflow-hidden relative group font-sans">
        {/* Video Container (HIDDEN/INVISIBLE) */}
        {/* We keep it in DOM for playback, but hide it visually */}
        <div id="player-frame" className="absolute top-0 left-0 w-1 h-1 opacity-5 pointer-events-none" />

        {/* Main Music UI */}
        <div className="absolute inset-0 flex flex-col items-center justify-center z-10 bg-gradient-to-br from-purple-900 to-black p-8">
            
            {/* Now Playing Card */}
            {currentVideoId ? (
                <div className="text-center animate-pulse-slow">
                    <div className="text-sm text-purple-300 uppercase tracking-widest mb-2">Now Playing</div>
                    <h1 className="text-4xl md:text-6xl font-bold text-white mb-4 drop-shadow-lg leading-tight max-w-4xl">
                        {currentTitle || "Loading Title..."}
                    </h1>
                    <div className="text-xl text-gray-300 flex items-center justify-center gap-2">
                        <span className="opacity-60">Requested by:</span>
                        <span className="font-semibold text-purple-200">{currentRequester}</span>
                    </div>
                </div>
            ) : (
                <div className="text-center opacity-50">
                    <h1 className="text-4xl font-bold mb-4">Music Idle</h1>
                    <p>Waiting for a DJ...</p>
                    <p className="text-sm mt-2">!music &lt;name&gt;</p>
                </div>
            )}

            {/* Queue Preview */}
            {queue.length > 0 && (
                <div className="mt-12 w-full max-w-lg bg-black/30 backdrop-blur-sm rounded-lg p-4 border border-white/10">
                    <h3 className="text-xs font-bold text-gray-400 uppercase mb-3 tracking-wider">Up Next</h3>
                    <div className="space-y-2">
                        {queue.slice(0, 3).map((item, i) => (
                            <div key={i} className="flex items-center gap-3 text-sm">
                                <span className="text-purple-400 font-mono">0{i+1}</span>
                                <span className="truncate flex-1">{item.title}</span>
                                <span className="text-gray-500 text-xs">{item.requester}</span>
                            </div>
                        ))}
                        {queue.length > 3 && (
                            <div className="text-xs text-center text-gray-500 pt-2">
                                + {queue.length - 3} more
                            </div>
                        )}
                    </div>
                </div>
            )}

        </div>

        {/* Debug Overlay (Still useful for setup, maybe smaller or toggleable later) */}
        <div className="absolute top-0 left-0 p-2 bg-black/50 z-50 text-[10px] font-mono w-full max-h-32 overflow-y-auto pointer-events-none opacity-50 hover:opacity-100 transition-opacity">
            <div className="text-green-400">
                STATUS: {currentVideoId ? 'PLAYING' : 'IDLE'} | {logs[0]}
            </div>
        </div>
    </div>
  );
}
