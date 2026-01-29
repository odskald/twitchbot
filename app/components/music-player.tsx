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
  
  // Audio Handling State
  const [isAudioLocked, setIsAudioLocked] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(false); // Default false until click

  const addLog = (msg: string) => {
    // Only console log to keep overlay clean
    console.log(`[Music] ${msg}`);
  };

  const unlockAudio = () => {
      // Play a silent buffer to unlock AudioContext
      const silentWav = "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA";
      const audio = new Audio(silentWav);
      
      audio.play().then(() => {
          addLog("Audio Context Unlocked ✅");
          setAudioEnabled(true);
          setIsAudioLocked(false);
          
          // If player exists, unmute and play
          if (player && player.unMute) {
             player.unMute();
             player.setVolume(100);
             if (player.getPlayerState() !== 1) { // 1 = playing
                 player.playVideo();
             }
          }
      }).catch(e => {
          addLog(`Unlock failed: ${e.message}`);
          // Still try to clear the lock visually
          setIsAudioLocked(false);
      });
  };

  const handleAutoplayError = () => {
      addLog("⚠️ Autoplay Blocked! Click overlay to enable.");
      setIsAudioLocked(true);
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
    if (!currentVideoId || !isApiReady) return;

    if (player) {
      player.loadVideoById(currentVideoId);
    } else {
      const newPlayer = new window.YT.Player('player', {
        height: '360',
        width: '640',
        videoId: currentVideoId,
        playerVars: {
          'autoplay': 1,
          'controls': 0, // Hide controls for clean overlay
          'rel': 0,
          'showinfo': 0,
          'mute': 0 // Try to start unmuted
        },
        events: {
          'onReady': onPlayerReady,
          'onStateChange': onPlayerStateChange,
          'onError': onPlayerError
        }
      });
      setPlayer(newPlayer);
    }
  }, [currentVideoId, isApiReady]);

  const onPlayerReady = (event: any) => {
    event.target.setVolume(100);
    // Try to play. If blocked, catch it.
    try {
        event.target.playVideo();
    } catch (e) {
        handleAutoplayError();
    }
    
    // Check if it actually started playing after a moment
    setTimeout(() => {
        if (event.target.getPlayerState() !== 1 && event.target.getPlayerState() !== 3) { // Not playing or buffering
             // It might be blocked or paused
             if (!audioEnabled) {
                 handleAutoplayError();
             }
        }
    }, 1000);
  };

  const onPlayerStateChange = (event: any) => {
    // 0 = Ended
    if (event.data === 0) {
      addLog("Video Ended");
      setCurrentVideoId(null); // This will trigger the queue effect
    }
  };

  const onPlayerError = (event: any) => {
      console.error("YouTube Player Error:", event.data);
      // 150 = restricted embed, etc.
      if (event.data === 150 || event.data === 101) {
          addLog("Video restricted from playback");
          setCurrentVideoId(null);
      }
  };

  const extractVideoId = (url: string) => {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
  };

  // --- BLOCKED OVERLAY ---
  if (isAudioLocked) {
    return (
        <div 
          onClick={unlockAudio}
          style={{
              position: 'fixed',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              background: 'rgba(255, 0, 0, 0.8)',
              color: 'white',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 9999,
              cursor: 'pointer',
              fontFamily: 'Arial, sans-serif',
              textAlign: 'center'
          }}
        >
            <h1 style={{ fontSize: '48px', margin: '0 0 20px 0' }}>⚠️ AUDIO BLOCKED</h1>
            <p style={{ fontSize: '24px' }}>Click anywhere to enable music!</p>
            <p style={{ fontSize: '16px', marginTop: '20px' }}>OBS Users: Interact with the source or check "Control Audio via OBS"</p>
        </div>
    );
  }

  // --- ENABLE BUTTON (Persistent if not enabled) ---
  if (!audioEnabled) {
      return (
          <div 
            onClick={unlockAudio}
            style={{
                position: 'fixed',
                bottom: '10px',
                right: '10px',
                background: 'rgba(0,0,0,0.7)',
                color: 'white',
                padding: '10px',
                borderRadius: '5px',
                cursor: 'pointer',
                zIndex: 9999,
                fontSize: '12px',
                fontFamily: 'sans-serif'
            }}
          >
              Click to Enable Audio 🔊
          </div>
      );
  }

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
      {currentVideoId && (
        <div style={{
          background: 'rgba(0, 0, 0, 0.8)',
          padding: '10px',
          borderRadius: '10px',
          boxShadow: '0 0 20px rgba(0,0,0,0.5)',
          display: 'flex',
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
      )}

      <style jsx>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
