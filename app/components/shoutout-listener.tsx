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
  
  const clientRef = useRef<tmi.Client | null>(null);
  const queueRef = useRef<ShoutoutMessage[]>([]);
  const isPlayingRef = useRef(false);
  // Keep track of preferred voice for logging purposes (even if we use Google TTS now)
  const preferredVoiceRef = useRef<SpeechSynthesisVoice | null>(null);

  // Check for silent mode (Visuals Only)
  const [isSilentMode, setIsSilentMode] = useState(false);
  const [isAudioLocked, setIsAudioLocked] = useState(false); // New state to track Autoplay blocks

  useEffect(() => {
    if (typeof window !== 'undefined') {
        const params = new URLSearchParams(window.location.search);
        if (params.get('silent') === 'true') {
            setIsSilentMode(true);
        }
    }
  }, []);

  const addLog = (msg: string) => {
    console.log(`[ShoutoutDebug] ${msg}`);
  };

  const unlockAudio = () => {
      // Play a silent buffer to unlock AudioContext (valid WAV header)
      const silentWav = "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA";
      const audio = new Audio(silentWav);
      
      audio.play().then(() => {
          addLog("Audio Context Unlocked ✅");
          setAudioEnabled(true);
          setIsAudioLocked(false);
      }).catch(e => {
          addLog(`Unlock failed: ${e.message}`);
          // Still try to clear the lock visually
          setIsAudioLocked(false);
      });
  };

  const handleAutoplayError = (errorName: string) => {
      if (errorName === 'NotAllowedError' || errorName === 'not-allowed') {
          addLog("⚠️ Autoplay Blocked! Click overlay to enable.");
          setIsAudioLocked(true);
      }
  };


  useEffect(() => {
    const loadVoices = () => {
      const voices = window.speechSynthesis.getVoices();
      if (voices.length > 0) {
        // Log all voices for debugging
        console.log("[TTS] Available Voices:", voices.map(v => `${v.name} (${v.lang})`));
        
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
          addLog(`Selected Voice: ${voice.name}`);
          preferredVoiceRef.current = voice;
        } else {
            addLog("No PT Voice found - using default");
            console.warn("[TTS] No Portuguese voice found");
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
      // 1. Look for the specific bot pattern: [100 pts] @User says: Message
      const matchMsg = message.match(/^\[100 pts\] @(.+?) says: (.*)$/);
      
      if (matchMsg) {
        const user = matchMsg[1];
        const content = matchMsg[2];
        const id = tags.id || Math.random().toString();
        
        console.log(`[Shoutout] Detected Msg: ${user} says ${content}`);
        addLog(`Msg: ${user}`);
        
        queueRef.current.push({ user, message: content, id });
        processQueue();
        return;
      }

      // 2. Look for Shoutout pattern: [Shoutout] TargetUser playing Game
      const matchSo = message.match(/^\[Shoutout\] (.+?) playing (.*)$/);
      
      if (matchSo) {
        const user = matchSo[1];
        const game = matchSo[2];
        const id = tags.id || Math.random().toString();

        console.log(`[Shoutout] Detected SO: ${user} playing ${game}`);
        addLog(`SO: ${user}`);

        // Custom message for shoutout
        const message = `Confira ${user}! Estava jogando ${game}.`;
        
        queueRef.current.push({ user, message, id });
        processQueue();
        return;
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
      // 1. Show Visuals IMMEDIATELY
      setCurrentShoutout(next);

      // 2. Play Audio (Async)
      speak(
        next.message, 
        () => {
            // onStart: Audio started (Log only, visuals already up)
            addLog("Audio Sync Start");
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
            handleAutoplayError(e.error);
            if (!hasStarted) onStart();
            onEnd();
        };

        window.speechSynthesis.speak(utterance);
    };
    
    // --- PROXY STRATEGY: Call internal API (bypasses CORS/OBS blocks) ---
    const playProxyTTS = () => {
        addLog("Requesting TTS from Backend...");
        
        // Use the internal API route
        const url = `/api/tts?text=${encodedText}`;
        const audio = new Audio(url);
        audio.volume = 1.0;

        audio.onplay = () => {
            addLog("Proxy TTS Playing 🔊");
            hasStarted = true;
            onStart();
        };

        audio.onended = () => {
            addLog("Proxy TTS Finished");
            onEnd();
        };

        audio.onerror = (e) => {
            const err = audio.error;
            addLog(`Proxy Error: Code ${err?.code} (${err?.message || 'Unknown'})`);
            // If proxy fails (e.g., 500 error), fall back to browser
            fallbackToBrowserTTS();
        };

        audio.play().catch(e => {
            addLog(`Proxy Blocked: ${e.name} - ${e.message}`);
            handleAutoplayError(e.name);
            fallbackToBrowserTTS();
        });
    };

    // Start Chain
    // If Audio is explicitly disabled or blocked, skip directly to fallback/end
    if (!audioEnabled) {
         addLog("Audio Disabled -> Skipping TTS");
         onStart();
         onEnd();
         return;
    }

    playProxyTTS();

    // Safety fallback timeout
    setTimeout(() => {
        if (!hasStarted && !fallbackTriggered) {
            addLog("Timeout -> Trying Browser Fallback");
            fallbackToBrowserTTS();
        } else if (!hasStarted && fallbackTriggered) {
             addLog("Final Timeout -> Force Finish");
             hasStarted = true;
             onStart();
             onEnd(); // Ensure queue clears
        }
    }, 8000); // Extended to 8s for network request
  };

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
              <h1 style={{ fontSize: '48px', margin: '0 0 20px 0' }}>⚠️ TTS BLOCKED</h1>
              <p style={{ fontSize: '24px' }}>Click anywhere to enable audio!</p>
              <p style={{ fontSize: '16px', marginTop: '20px' }}>OBS Users: Interact with the source or check "Control Audio via OBS"</p>
          </div>
      );
  }

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
                fontSize: '12px'
            }}
          >
              Click to Enable Audio 🔊
          </div>
      );
  }

  return (
    <>
      {currentShoutout && (
        <div style={{
          position: 'fixed',
          top: '50px',
          right: '50px',
          background: 'linear-gradient(135deg, #6e45e2, #88d3ce)',
          padding: '20px',
          borderRadius: '15px',
          boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
          color: 'white',
          fontFamily: "'Poppins', sans-serif",
          maxWidth: '400px',
          animation: 'slideIn 0.5s ease-out',
          zIndex: 1000,
          border: '3px solid white'
        }}>
          <div style={{
            fontSize: '1.2rem',
            fontWeight: 'bold',
            marginBottom: '5px',
            textShadow: '2px 2px 0px #000'
          }}>
            🎉 Shoutout!
          </div>
          <div style={{
            fontSize: '1.5rem',
            fontFamily: "'Bangers', cursive",
            letterSpacing: '1px',
            textShadow: '3px 3px 0px #000',
            marginBottom: '10px'
          }}>
            {currentShoutout.user}
          </div>
          <div style={{
            fontSize: '1.1rem',
            lineHeight: '1.4',
            background: 'rgba(0,0,0,0.2)',
            padding: '10px',
            borderRadius: '10px'
          }}>
            {currentShoutout.message}
          </div>
        </div>
      )}
      
      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Bangers&family=Poppins:wght@400;700&display=swap');
        @keyframes slideIn {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>
    </>
  );
}
