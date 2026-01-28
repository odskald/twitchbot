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
  // Keep track of preferred voice for logging purposes (even if we use Google TTS now)
  const preferredVoiceRef = useRef<SpeechSynthesisVoice | null>(null);

  const addLog = (msg: string) => {
      console.log(msg);
      setLogs(prev => [...prev.slice(-4), msg]); // Keep last 5 logs
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
    
    // --- SECONDARY FALLBACK: GOOGLE (client=tw-ob) ---
    const playGoogleFallback = () => {
        addLog("Trying Secondary TTS (Google)...");
        const googleUrl = `https://translate.googleapis.com/translate_tts?client=tw-ob&ie=UTF-8&tl=pt-BR&q=${encodedText}`;
        const audio = new Audio(googleUrl);
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
        
        audio.onerror = (e) => {
            addLog(`Google TTS Failed: ${e.type}`);
            fallbackToBrowserTTS();
        };
        
        audio.play().catch(e => {
            addLog(`Google TTS Blocked: ${e.message}`);
            fallbackToBrowserTTS();
        });
    };

    // 1. Try StreamElements (Direct Audio, No Fetch)
    // Voice "Vitoria" is a high-quality Portuguese voice
    const seUrl = `https://api.streamelements.com/kappa/v2/speech?voice=Vitoria&text=${encodedText}`;
    addLog(`Playing TTS (StreamElements)...`);
    
    const audio = new Audio(seUrl);
    audio.volume = 1.0;

    audio.onplay = () => {
        addLog("StreamElements TTS Playing 🔊");
        hasStarted = true;
        onStart();
    };

    audio.onended = () => {
        addLog("StreamElements TTS Finished");
        onEnd();
    };

    audio.onerror = (e) => {
        const errorType = e instanceof Event ? e.type : String(e);
        addLog(`StreamElements Error: [${errorType}]`);
        playGoogleFallback();
    };

    const playPromise = audio.play();
    if (playPromise !== undefined) {
        playPromise.catch(error => {
            addLog(`StreamElements Blocked: ${error.message}`);
            playGoogleFallback();
        });
    }

    // Safety fallback
    setTimeout(() => {
        if (!hasStarted && !fallbackTriggered) {
            addLog("Timeout -> Trying Fallback");
            playGoogleFallback();
        } else if (!hasStarted && fallbackTriggered) {
             addLog("Final Timeout -> Visuals Only");
             hasStarted = true;
             onStart();
        }
    }, 2500);
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
