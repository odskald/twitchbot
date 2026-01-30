"use client";

import React, { useEffect, useState, useRef } from 'react';

type Alert = {
  id: string;
  type: string;
  message: string;
  mediaUrl?: string;
};

export default function FollowAlertPage() {
  const [currentAlert, setCurrentAlert] = useState<Alert | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Poll for new alerts
  useEffect(() => {
    const interval = setInterval(async () => {
      if (currentAlert) return; // Don't fetch if currently showing one

      try {
        const res = await fetch('/api/alerts');
        const data = await res.json();
        
        if (data && data.length > 0) {
          const alert = data[0];
          setCurrentAlert(alert);
          
          // Play Audio
          if (audioRef.current) {
            audioRef.current.volume = 0.5;
            audioRef.current.play().catch(e => console.error("Audio play failed:", e));
          }

          // Auto-dismiss after 5 seconds
          setTimeout(async () => {
             // Ack the alert
             await fetch('/api/alerts', {
                 method: 'POST',
                 body: JSON.stringify({ id: alert.id })
             });
             setCurrentAlert(null);
          }, 5000);
        }
      } catch (e) {
        console.error("Polling error:", e);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [currentAlert]);

  if (!currentAlert) return null;

  return (
    <div style={{
      width: '100vw',
      height: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
      background: 'transparent'
    }}>
      {/* Discord Notification Sound (Placeholder) */}
      <audio ref={audioRef} src="https://cdn.discordapp.com/attachments/1065005953055490048/1065005953055490048/discord_notification.mp3" />
      
      <div className="alert-box" style={{
        position: 'relative',
        padding: '40px 60px',
        background: 'rgba(0, 0, 0, 0.85)',
        border: '3px solid #00f3ff', // Blue Neon
        borderRadius: '16px',
        boxShadow: '0 0 20px #00f3ff, 0 0 40px #00f3ff inset',
        textAlign: 'center',
        animation: 'slideIn 0.5s ease-out'
      }}>
        {/* Nordic Scorpion Icon Placeholder */}
        <div style={{ fontSize: '48px', marginBottom: '16px', filter: 'drop-shadow(0 0 10px #00f3ff)' }}>
            🦂
        </div>

        <h1 style={{
          margin: 0,
          fontFamily: "'Orbitron', sans-serif", // Futuristic font if available, fallback sans
          color: '#fff',
          fontSize: '32px',
          textTransform: 'uppercase',
          letterSpacing: '2px',
          textShadow: '0 0 10px #00f3ff'
        }}>
          New Follower!
        </h1>
        
        <div style={{
          marginTop: '16px',
          fontSize: '48px',
          fontWeight: 'bold',
          color: '#00f3ff',
          textShadow: '0 0 20px #00f3ff'
        }}>
          {currentAlert.message.replace(' is now following!', '')}
        </div>
      </div>

      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700&display=swap');
        
        @keyframes slideIn {
          from { transform: translateY(100px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
