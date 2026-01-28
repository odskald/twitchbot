"use client";

import { useEffect, useRef, useState } from "react";
import tmi from "tmi.js";

interface ShoutoutListenerProps {
  channel: string;
}

interface ShoutoutMessage {
  user: string;
  message: string;
  id: string;
}

export function ShoutoutListener({ channel }: ShoutoutListenerProps) {
  const [currentShoutout, setCurrentShoutout] = useState<ShoutoutMessage | null>(null);
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  
  const clientRef = useRef<tmi.Client | null>(null);
  const queueRef = useRef<ShoutoutMessage[]>([]);
  const isPlayingRef = useRef(false);

  const addLog = (msg: string) => {
      console.log(msg);
      setLogs(prev => [...prev.slice(-4), msg]); // Keep last 5 logs
  };

  const enableAudio = () => {
      // Play a silent buffer to unlock AudioContext
      const audio = new Audio("");
      audio.play().then(() => {
          addLog("Audio Context Unlocked ✅");
          setAudioEnabled(true);
      }).catch(e => {
          addLog(`Unlock failed: ${e.message}`);
          // Still set to true to try anyway
          setAudioEnabled(true);
      });
  };


  useEffect(() => {
    const loadVoices = () => {
      const voices = window.speechSynthesis.getVoices();
      if (voices.length > 0) {
        // 1. Try exact pt-BR match
        let voice = voices.find(v => v.lang === 'pt-BR' || v.lang === 'pt_BR');
        
        // 2. Try matching common Brazilian voice names
        if (!voice) {
          voice = voices.find(v => 
            v.name.includes('Google Português') || 
            v.name.includes('Microsoft Maria') ||
            v.name.includes('Luciana')
          );
        }

        // 3. Fallback to any 'pt'
        if (!voice) {
          voice = voices.find(v => v.lang.toLowerCase().includes('pt'));
        }

        if (voice) {
          console.log(`[TTS] Selected voice: ${voice.name} (${voice.lang})`);
          preferredVoiceRef.current = voice;
        } else {
            console.warn("[TTS] No Portuguese voice found in:", voices.map(v => `${v.name} (${v.lang})`));
        }
      }
    };

    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
    
    return () => {
        window.speechSynthesis.onvoiceschanged = null;
    };
  }, []);

  useEffect(() => {
    if (!channel) return;
    if (clientRef.current) return;

    const client = new tmi.Client({
      channels: [channel],
    });

    client.on("message", (channel, tags, message, self) => {
      // Look for the specific bot pattern: [100 pts] @User says: Message
      // Regex updated to support all characters in username (non-greedy match before " says: ")
      const match = message.match(/^\[100 pts\] @(.+?) says: (.*)$/);
      
      if (match) {
        const user = match[1];
        const content = match[2];
        const id = tags.id || Math.random().toString();
        
        console.log(`[Shoutout] Detected: ${user} says ${content}`);
        addLog(`Msg: ${user}`);
        
        // Add to queue
        queueRef.current.push({ user, message: content, id });
        processQueue();
      }
    });

    client.connect().then(() => addLog("Connected to Chat")).catch(e => addLog(`Chat Error: ${e}`));
    clientRef.current = client;

    return () => {
      if (clientRef.current) {
        clientRef.current.disconnect();
        clientRef.current = null;
      }
    };
  }, [channel]);

  const processQueue = () => {
    if (isPlayingRef.current) return;
    if (queueRef.current.length === 0) return;

    isPlayingRef.current = true;
    const next = queueRef.current.shift();
    if (next) {
      // Don't show visuals yet - wait for TTS start
      speak(
        next.message, 
        () => {
            // onStart: Show Visuals NOW
            setCurrentShoutout(next);
        },
        () => {
            // onEnd: Cleanup after delay
            setTimeout(() => {
                setCurrentShoutout(null);
                isPlayingRef.current = false;
                processQueue(); // Process next
            }, 2000); 
        }
      );
    }
  };

  const speak = (text: string, onStart: () => void, onEnd: () => void) => {
    // New Implementation: Use Google Translate TTS via Audio Element
    // This bypasses browser synthesis quirks and works better in OBS
    
    // 1. Truncate text to 200 chars (Google API limit)
    const safeText = text.substring(0, 200);
    const encodedText = encodeURIComponent(safeText);
    
    // 2. Construct URL
    // client=gtx is often more permissive than tw-ob
    const url = `https://translate.googleapis.com/translate_tts?client=gtx&ie=UTF-8&tl=pt-BR&q=${encodedText}`;
    
    addLog(`Playing TTS...`);
    const audio = new Audio(url);
    audio.volume = 1.0;
    
    let hasStarted = false;

    audio.onplay = () => {
        addLog("TTS Playing 🔊");
        hasStarted = true;
        onStart();
    };

    audio.onended = () => {
        addLog("TTS Finished");
        onEnd();
    };

    audio.onerror = (e) => {
        addLog(`TTS Error: ${e}`);
        // Fallback to visual only
        if (!hasStarted) onStart();
        onEnd();
    };

    // 3. Play
    const playPromise = audio.play();
    
    if (playPromise !== undefined) {
        playPromise.catch(error => {
            addLog(`Blocked: ${error.message}`);
            // If blocked, try to force visual at least
            if (!hasStarted) onStart();
            onEnd();
        });
    }

    // Safety fallback still needed
    setTimeout(() => {
        if (!hasStarted) {
            addLog("Timeout (No Audio)");
            hasStarted = true;
            onStart();
        }
    }, 1500); // Increased timeout for network fetch
  };

  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link href="https://fonts.googleapis.com/css2?family=Bangers&family=Poppins:wght@400;600&display=swap" rel="stylesheet" />
      
      {/* Audio Enable Overlay */}
      {!audioEnabled && (
        <div 
            onClick={enableAudio}
            style={{
                position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                background: 'rgba(0,0,0,0.8)', color: 'white',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                zIndex: 9999, cursor: 'pointer', flexDirection: 'column'
            }}>
            <div style={{ fontSize: '40px' }}>🔇 Click to Enable Audio</div>
            <div style={{ marginTop: '10px', opacity: 0.7 }}>Required for TTS</div>
        </div>
      )}

      {/* Debug Logs (Bottom Left) */}
      <div style={{
          position: 'fixed', bottom: 10, left: 10,
          background: 'rgba(0,0,0,0.5)', color: '#0f0',
          padding: '5px', fontSize: '12px', fontFamily: 'monospace',
          pointerEvents: 'none', borderRadius: '4px'
      }}>
          {logs.map((log, i) => <div key={i}>{log}</div>)}
      </div>

      {currentShoutout && (
      <div style={{
        position: 'fixed',
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        background: 'linear-gradient(135deg, rgba(20, 0, 40, 0.95), rgba(40, 0, 80, 0.9))',
        padding: '30px 50px',
        borderRadius: '24px',
        border: '3px solid #d8b4fe',
        color: 'white',
        textAlign: 'center',
        boxShadow: '0 0 30px rgba(168, 85, 247, 0.6), inset 0 0 20px rgba(168, 85, 247, 0.2)',
        animation: 'popIn 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
        maxWidth: '80vw',
        width: 'auto',
        minWidth: '300px',
        zIndex: 9999,
        fontFamily: "'Poppins', sans-serif"
      }}>
        <div style={{ 
          fontSize: '2.5rem', 
          fontWeight: 'bold', 
          marginBottom: '15px',
          color: '#fbbf24', // Amber/Gold color
          fontFamily: "'Bangers', cursive",
          letterSpacing: '2px',
          textShadow: '3px 3px 0px #000'
        }}>
          {currentShoutout.user} SAYS:
        </div>
        <div style={{ 
          fontSize: '2rem',
          lineHeight: '1.4',
          textShadow: '0 2px 4px rgba(0,0,0,0.5)',
          fontWeight: 600
        }}>
          "{currentShoutout.message}"
        </div>
        
        <style jsx>{`
          @keyframes popIn {
            0% { opacity: 0; transform: translate(-50%, -50%) scale(0.5); }
            100% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
          }
        `}</style>
      </div>
    </>
  );
}
