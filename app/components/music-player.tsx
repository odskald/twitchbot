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
  const [queue, setQueue] = useState<string[]>([]);
  const [currentVideoId, setCurrentVideoId] = useState<string | null>(null);
  const [player, setPlayer] = useState<any>(null);
  const [isApiReady, setIsApiReady] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);

  const queueRef = useRef<string[]>([]);
  const playerRef = useRef<any>(null);
  const [playerKey, setPlayerKey] = useState(0);
  
  // Sync queue ref
  useEffect(() => {
    queueRef.current = queue;
  }, [queue]);

  // Sync player ref
  useEffect(() => {
    playerRef.current = player;
  }, [player]);

  const addLog = (msg: string) => {
    setLogs(prev => [...prev.slice(-4), msg]); // Keep last 5
    console.log(`[Music] ${msg}`);
  };

  // 1. Initialize TMI Client
  useEffect(() => {
    if (!channel) return;

    const client = new tmi.Client({
      channels: [channel],
      connection: { reconnect: true, secure: true }
    });

    client.connect().catch(console.error);

    client.on('message', (channel, tags, message, self) => {
      if (self) return;

      const sender = tags.username || 'unknown';
      const isAuthorized = tags.mod || tags.badges?.broadcaster || tags.username === channel.toLowerCase() || (botName && tags.username === botName.toLowerCase());

      // DEBUG: Log all messages that look like commands
      if (message.startsWith('[') || message.startsWith('!')) {
         console.log(`[Debug] Msg: "${message}" | Sender: ${sender} | Auth: ${isAuthorized} | BotName: ${botName}`);
      }

      // Signal: [InstantPlay] <videoId> <requestedBy>
      if (message.startsWith('[InstantPlay] ')) {
          if (isAuthorized) {
              const parts = message.split(' ');
              if (parts.length >= 2) {
                  const videoId = parts[1];
                  const requester = parts[2] || 'Unknown';
                  addLog(`Instant Play: ${videoId} (${requester})`);
                  setCurrentVideoId(videoId); // Replaces current video immediately
              }
          } else {
              addLog(`Ignored Cmd from ${sender} (No Auth)`);
          }
      }

      // Signal: [QueueAdd] <videoId> <requestedBy>
      if (message.startsWith('[QueueAdd] ')) {
          if (isAuthorized) {
              const parts = message.split(' ');
              if (parts.length >= 2) {
                  const videoId = parts[1];
                  const requester = parts[2] || 'Unknown';
                  addLog(`Queueing: ${videoId} (${requester})`);
                  setQueue(prev => [...prev, videoId]);
              }
          }
      }
      
      // Signal: [QueueCheck] <requestedBy>
      if (message.startsWith('[QueueCheck] ') && isAuthorized) {
           // Log it on overlay
           addLog(`Queue Length: ${queueRef.current.length}`);
      }

      // Signal: [Skip] <requestedBy>
      if (message.startsWith('[Skip] ') && isAuthorized) {
          const parts = message.split(' ');
          const requester = parts[1] || 'Unknown';
          addLog(`Skipping (Signal by ${requester})`);
          
          // Direct Queue Processing
          const currentQueue = queueRef.current;
          if (currentQueue.length > 0) {
              const nextId = currentQueue[0];
              setQueue(prev => prev.slice(1));
              setCurrentVideoId(nextId);
              addLog(`Playing Next: ${nextId}`);
          } else {
              setCurrentVideoId(null);
          }
      }

      // Signal: [Stop]
      if (message.startsWith('[Stop] ') && isAuthorized) {
           addLog(`Stopping...`);
           
           if (playerRef.current && playerRef.current.destroy) {
               try { playerRef.current.destroy(); } catch (e) { console.error(e); }
           }

           setPlayer(null);
           setCurrentVideoId(null);
           setPlayerKey(prev => prev + 1);
      }

      // Signal: [Clear]
      if (message.startsWith('[Clear] ') && isAuthorized) {
           addLog(`Queue Cleared`);
           setQueue([]);
      }

      // Signal: [Play]
      if (message.startsWith('[Play] ') && isAuthorized) {
           addLog(`Resuming...`);
           setPlayer((p: any) => {
               if (p && p.playVideo) p.playVideo();
               return p;
           });
      }

      // Signal: [Pause]
      if (message.startsWith('[Pause] ') && isAuthorized) {
           addLog(`Pausing...`);
           setPlayer((p: any) => {
               if (p && p.pauseVideo) p.pauseVideo();
               return p;
           });
      }

      // Command: !queue
      if (message.toLowerCase() === '!queue') {
          addLog(`Queue Length: ${queueRef.current.length}`);
      }
    });

    return () => {
      client.disconnect().catch(console.error);
    };
  }, [channel]);

  // 2. Load YouTube IFrame API
  useEffect(() => {
    if (!window.YT) {
      const tag = document.createElement('script');
      tag.src = "https://www.youtube.com/iframe_api";
      const firstScriptTag = document.getElementsByTagName('script')[0];
      firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);

      window.onYouTubeIframeAPIReady = () => {
        addLog("YouTube API Ready");
        setIsApiReady(true);
      };
    } else {
      setIsApiReady(true);
    }
  }, []);

  // 3. Process Queue
  useEffect(() => {
    if (!isApiReady) return;

    // If no video playing and queue has items
    if (!currentVideoId && queue.length > 0) {
      const nextId = queue[0];
      setQueue(prev => prev.slice(1));
      setCurrentVideoId(nextId);
      addLog(`Playing: ${nextId}`);
    }
  }, [queue, currentVideoId, isApiReady]);

  // 4. Initialize/Update Player
  useEffect(() => {
    if (!isApiReady) return;

    if (player) {
      if (currentVideoId) {
        player.loadVideoById(currentVideoId);
      } else {
        player.stopVideo(); // Stop if no video
      }
    } else if (currentVideoId) {
       // Only create player if we have a video to play initially
       // or we could create it empty, but let's stick to on-demand creation for first video
      const newPlayer = new window.YT.Player('player', {
        height: '360',
        width: '640',
        videoId: currentVideoId,
        playerVars: {
          'autoplay': 1,
          'controls': 0, // Hide controls for clean overlay
          'rel': 0,
          'showinfo': 0
        },
        events: {
          'onReady': onPlayerReady,
          'onStateChange': onPlayerStateChange
        }
      });
      setPlayer(newPlayer);
    }
  }, [currentVideoId, isApiReady]);

  const onPlayerReady = (event: any) => {
    event.target.playVideo();
  };

  const onPlayerStateChange = (event: any) => {
    // 0 = Ended
    if (event.data === 0) {
      addLog("Video Ended");
      setCurrentVideoId(null); // This will trigger the queue effect
    }
  };

  const extractVideoId = (url: string) => {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
  };

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', background: '#000' }}>
      <div id="player" key={playerKey} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }} />
      
      {/* Controls Overlay */}
      <div style={{
          position: 'absolute',
          bottom: 20,
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          gap: 10,
          opacity: 0.1,
          transition: 'opacity 0.3s',
      }}
      onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
      onMouseLeave={(e) => e.currentTarget.style.opacity = '0.1'}
      >
          <button 
            onClick={() => {
                if (player && player.destroy) {
                    try { player.destroy(); } catch(e) {}
                }
                setPlayer(null);
                setCurrentVideoId(null);
                setPlayerKey(prev => prev + 1);
            }}
            style={{
                padding: '8px 16px',
                background: '#ef4444',
                color: 'white',
                border: 'none',
                borderRadius: 4,
                cursor: 'pointer',
                fontWeight: 'bold'
            }}
          >
              STOP
          </button>
      </div>

      <div style={{ 
        position: 'absolute', 
        top: 10, 
        left: 10, 
        color: '#fff', 
        fontFamily: 'monospace',
        textShadow: '0 1px 2px #000'
      }}>
        <div>Queue: {queue.length}</div>
        {logs.map((l, i) => <div key={i} style={{ fontSize: 12, opacity: 0.8 }}>{l}</div>)}
      </div>
    </div>
  );
}
