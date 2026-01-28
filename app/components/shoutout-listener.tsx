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
  // Default to TRUE (Optimistic Autoplay). If blocked, we set to false to show overlay.
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [logs, setLogs] = useState<string[]>([]);
  
  const clientRef = useRef<tmi.Client | null>(null);
  const queueRef = useRef<ShoutoutMessage[]>([]);
  const isPlayingRef = useRef(false);
  // Keep track of preferred voice for logging purposes (even if we use Google TTS now)
  const preferredVoiceRef = useRef<SpeechSynthesisVoice | null>(null);

  // Check for silent mode (Visuals Only)
  const [isSilentMode, setIsSilentMode] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
        const params = new URLSearchParams(window.location.search);
        if (params.get('silent') === 'true') {
            setIsSilentMode(true);
        }
    }
  }, []);

  const addLog = (msg: string) => {
    setLogs(prev => [...prev.slice(-4), `[${new Date().toLocaleTimeString()}] ${msg}`]);
    console.log(`[ShoutoutDebug] ${msg}`);
  };

  const enableAudio = () => {
      // Play a silent buffer to unlock AudioContext (valid WAV header)
      const silentWav = "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA";
      const audio = new Audio(silentWav);
      
      audio.play().then(() => {
          addLog("Audio Context Unlocked ✅");
          setAudioEnabled(true);
      }).catch(e => {
          addLog(`Unlock failed: ${e.message}`);
          // Still set to true to try anyway (maybe browser allows via user interaction elsewhere)
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
    if (isSilentMode) {
        addLog("Silent Mode -> Skipping Audio");
        onStart();
        setTimeout(onEnd, 3000); // Show for 3s then hide
        return;
    }

    // HYBRID IMPLEMENTATION: Google TTS -> Browser TTS Fallback
    
    // 1. Truncate text to 200 chars
    const safeText = text.substring(0, 200);
    const encodedText = encodeURIComponent(safeText);
    
    let hasStarted = false;
    let fallbackTriggered = false;

    // --- FALLBACK SYSTEM ---
    const fallbackToBrowserTTS = () => {
        if (fallbackTriggered) return;
        fallbackTriggered = true;
        addLog("Remote TTS Failed -> Falling back to Browser TTS");

        if (!window.speechSynthesis) {
            addLog("Browser TTS not supported");
            if (!hasStarted) onStart();
            onEnd();
            return;
        }

        // Resume audio context
        if (window.speechSynthesis.paused) window.speechSynthesis.resume();
        window.speechSynthesis.cancel();

        const utterance = new SpeechSynthesisUtterance(safeText);
        
        // Use preferred PT-BR voice or fallback
        if (preferredVoiceRef.current) {
            utterance.voice = preferredVoiceRef.current;
            utterance.lang = preferredVoiceRef.current.lang;
        } else {
            utterance.lang = 'pt-BR';
        }

        utterance.rate = 0.8; // Slower speed
        
        utterance.onstart = () => {
            addLog("Browser TTS Playing 🔊");
            hasStarted = true;
            onStart();
        };

        utterance.onend = () => {
            addLog("Browser TTS Finished");
            onEnd();
        };

        utterance.onerror = (e) => {
            addLog(`Browser TTS Error: ${e.error}`);
            if (!hasStarted) onStart();
            onEnd();
        };

        window.speechSynthesis.speak(utterance);
    };
    
    // --- STRATEGY 1: STREAM ELEMENTS (Direct Audio) ---
    const playStreamElements = () => {
        addLog("Attempt 1: StreamElements (Direct)...");
        const url = `https://api.streamelements.com/kappa/v2/speech?voice=Vitoria&text=${encodedText}`;
        const audio = new Audio(url);
        audio.volume = 1.0;

        audio.onplay = () => {
            addLog("StreamElements Playing 🔊");
            hasStarted = true;
            onStart();
        };

        audio.onended = () => {
            addLog("StreamElements Finished");
            onEnd();
        };

        audio.onerror = () => {
            const err = audio.error;
            addLog(`SE Error: Code ${err?.code} (${err?.message || 'Unknown'})`);
            playGoogleTTS(); // Fallback
        };

        audio.play().catch(e => {
            addLog(`SE Blocked: ${e.name} - ${e.message}`);
            playGoogleTTS(); // Fallback
        });
    };

    // --- STRATEGY 2: GOOGLE TTS (Direct Audio) ---
    const playGoogleTTS = () => {
        addLog("Attempt 2: Google TTS (Direct)...");
        // Try client=tw-ob first as it's standard for this hack
        const url = `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=pt-BR&q=${encodedText}`;
        
        const audio = new Audio(url);
        audio.volume = 1.0;
        
        audio.onplay = () => {
            addLog("Google TTS Playing 🔊");
            hasStarted = true;
            onStart();
        };
        
        audio.onended = () => {
            addLog("Google TTS Finished");
            onEnd();
        };
        
        audio.onerror = () => {
            const err = audio.error;
            addLog(`Google Error: Code ${err?.code} (${err?.message || 'Unknown'})`);
            fallbackToBrowserTTS();
        };
        
        audio.play().catch(e => {
            addLog(`Google Blocked: ${e.name} - ${e.message}`);
            fallbackToBrowserTTS();
        });
    };

    // Start Chain
    playStreamElements();

    // Safety fallback timeout
    setTimeout(() => {
        if (!hasStarted && !fallbackTriggered) {
            addLog("Timeout -> Trying Browser Fallback");
            fallbackToBrowserTTS();
        } else if (!hasStarted && fallbackTriggered) {
             addLog("Final Timeout -> Visuals Only");
             hasStarted = true;
             onStart();
        }
    }, 3500);
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
                background: 'rgba(0,0,0,0.85)', color: 'white',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                zIndex: 9999, cursor: 'pointer', flexDirection: 'column',
                textAlign: 'center', padding: '20px'
            }}>
            <div style={{ fontSize: '40px', marginBottom: '10px' }}>🔇 TTS Audio Blocked</div>
            <div style={{ fontSize: '24px', color: '#fbbf24', fontWeight: 'bold' }}>
                OBS: Right Click Source ➡ Interact ➡ Click Here
            </div>
            <div style={{ marginTop: '20px', opacity: 0.8, fontSize: '18px' }}>
                Or Uncheck "Control Audio via OBS" in Source Properties
            </div>
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
      )}
    </>
  );
}
