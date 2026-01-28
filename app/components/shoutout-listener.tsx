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
  const clientRef = useRef<tmi.Client | null>(null);
  const queueRef = useRef<ShoutoutMessage[]>([]);
  const isPlayingRef = useRef(false);

  useEffect(() => {
    if (!channel) return;
    if (clientRef.current) return;

    const client = new tmi.Client({
      channels: [channel],
    });

    client.on("message", (channel, tags, message, self) => {
      // Look for the specific bot pattern: [100 pts] @User says: Message
      // Regex: ^\[100 pts\] @(\w+) says: (.*)$
      const match = message.match(/^\[100 pts\] @(\w+) says: (.*)$/);
      
      if (match) {
        const user = match[1];
        const content = match[2];
        const id = tags.id || Math.random().toString();
        
        console.log(`[Shoutout] Detected: ${user} says ${content}`);
        
        // Add to queue
        queueRef.current.push({ user, message: content, id });
        processQueue();
      }
    });

    client.connect().catch(console.error);
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
      setCurrentShoutout(next);
      speak(next.message, () => {
        // After speech + display time
        setTimeout(() => {
            setCurrentShoutout(null);
            isPlayingRef.current = false;
            processQueue(); // Process next
        }, 2000); // Wait 2s after speech ends before clearing
      });
    }
  };

  const speak = (text: string, onEnd: () => void) => {
    if (!window.speechSynthesis) {
        console.warn("TTS not supported");
        onEnd();
        return;
    }

    // Cancel any current speech
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.volume = 1;
    utterance.rate = 1;
    utterance.pitch = 1;
    
    utterance.onend = () => {
        onEnd();
    };
    
    utterance.onerror = (e) => {
        console.error("TTS Error", e);
        onEnd();
    };

    window.speechSynthesis.speak(utterance);
  };

  if (!currentShoutout) return null;

  return (
    <div style={{
      position: 'fixed',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      background: 'rgba(0, 0, 0, 0.8)',
      padding: '20px 40px',
      borderRadius: '16px',
      border: '2px solid #a855f7',
      color: 'white',
      textAlign: 'center',
      boxShadow: '0 0 20px rgba(168, 85, 247, 0.5)',
      animation: 'fadeIn 0.5s ease-out',
      maxWidth: '80vw',
      zIndex: 9999
    }}>
      <div style={{ 
        fontSize: '1.5rem', 
        fontWeight: 'bold', 
        marginBottom: '10px',
        color: '#d8b4fe' 
      }}>
        {currentShoutout.user} says:
      </div>
      <div style={{ 
        fontSize: '2rem',
        textShadow: '0 2px 4px rgba(0,0,0,0.5)' 
      }}>
        "{currentShoutout.message}"
      </div>
      
      <style jsx>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translate(-50%, -40%); }
          to { opacity: 1; transform: translate(-50%, -50%); }
        }
      `}</style>
    </div>
  );
}
