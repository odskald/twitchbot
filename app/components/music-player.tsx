"use client";

import { useEffect, useState, useRef } from 'react';
import tmi from 'tmi.js';

interface MusicPlayerProps {
  channel: string;
}

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: () => void;
  }
}

export default function MusicPlayer({ channel }: MusicPlayerProps) {
  const [queue, setQueue] = useState<string[]>([]);
  const [currentVideoId, setCurrentVideoId] = useState<string | null>(null);
  const [player, setPlayer] = useState<any>(null);
  const [isApiReady, setIsApiReady] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);

  const queueRef = useRef<string[]>([]);
  
  // Sync queue ref
  useEffect(() => {
    queueRef.current = queue;
  }, [queue]);

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

      // Command: !music <url>
      if (message.toLowerCase().startsWith('!music ')) {
        const parts = message.split(' ');
        if (parts.length > 1) {
          const url = parts[1];
          const videoId = extractVideoId(url);
          
          if (videoId) {
            addLog(`Queueing: ${videoId} (${tags['display-name']})`);
            setQueue(prev => [...prev, videoId]);
          } else {
            addLog(`Invalid Link from ${tags['display-name']}`);
          }
        }
      }

      // Command: !skip
      if (message.toLowerCase() === '!skip') {
        // Check if mod or broadcaster
        if (tags.mod || tags.badges?.broadcaster) {
            addLog(`Skipping by ${tags['display-name']}`);
            
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
    <div style={{ 
      width: '100vw', 
      height: '100vh', 
      display: 'flex', 
      flexDirection: 'column', 
      alignItems: 'flex-start',
      justifyContent: 'flex-end', // Position at bottom left usually
      padding: '20px'
    }}>
      {/* Visual Player Container */}
      <div style={{
          background: 'rgba(0, 0, 0, 0.8)',
          padding: '10px',
          borderRadius: '10px',
          boxShadow: '0 0 20px rgba(0,0,0,0.5)',
          display: currentVideoId ? 'flex' : 'none', // Use display: none instead of unmounting
          flexDirection: 'column',
          alignItems: 'center',
          animation: 'fadeIn 0.5s ease-out'
        }}>
          <div id="player"></div>
          <div style={{
            color: 'white',
            fontFamily: 'Poppins, sans-serif',
            marginTop: '10px',
            fontSize: '14px',
            textAlign: 'center'
          }}>
            Now Playing
          </div>
        </div>

      {/* Debug Logs (Optional, similar to TTS overlay) */}
      <div style={{
        position: 'fixed',
        top: 0,
        right: 0,
        padding: '10px',
        color: 'rgba(255,255,255,0.5)',
        fontFamily: 'monospace',
        fontSize: '12px',
        pointerEvents: 'none'
      }}>
        {logs.map((l, i) => <div key={i}>{l}</div>)}
      </div>

      <style jsx>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
