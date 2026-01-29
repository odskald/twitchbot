"use client";

import React, { useState } from 'react';
import Link from 'next/link';

const overlays = [
  { name: 'Leaderboard', path: '/leaderboard', description: 'Shows top users by points/XP' },
  { name: 'Music Player', path: '/music', description: 'Video player for song requests' },
  { name: 'Shoutout', path: '/shoutout', description: 'Popup for shoutouts (!so)' },
];

export default function OverlaysPage() {
  const [copied, setCopied] = useState<string | null>(null);

  const copyToClipboard = (path: string) => {
    const url = `${window.location.origin}${path}`;
    navigator.clipboard.writeText(url);
    setCopied(path);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div>
      <h2 style={{ color: "#3b82f6", textShadow: "0 0 10px #3b82f6", marginBottom: '24px' }}>Overlays Manager</h2>
      <div style={{ display: 'grid', gap: '16px', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
        {overlays.map((overlay) => (
          <div key={overlay.path} style={{
            background: '#1a1b26',
            border: '1px solid #3b82f6',
            borderRadius: '8px',
            padding: '16px',
            boxShadow: '0 0 15px rgba(59, 130, 246, 0.2)'
          }}>
            <h3 style={{ marginTop: 0, color: '#c0caf5', marginBottom: '8px' }}>{overlay.name}</h3>
            <p style={{ color: '#a7abb9', fontSize: '14px', marginBottom: '16px' }}>{overlay.description}</p>
            <div style={{ display: 'flex', gap: '8px' }}>
              <Link href={overlay.path} target="_blank" style={{
                flex: 1,
                textAlign: 'center',
                padding: '8px',
                background: 'rgba(59, 130, 246, 0.1)',
                border: '1px solid #3b82f6',
                color: '#3b82f6',
                textDecoration: 'none',
                borderRadius: '4px',
                fontWeight: 'bold',
                transition: 'all 0.2s'
              }}>
                Open ↗
              </Link>
              <button onClick={() => copyToClipboard(overlay.path)} style={{
                flex: 1,
                padding: '8px',
                background: copied === overlay.path ? '#3b82f6' : 'transparent',
                border: '1px solid #3b82f6',
                color: copied === overlay.path ? '#fff' : '#3b82f6',
                borderRadius: '4px',
                cursor: 'pointer',
                fontWeight: 'bold',
                transition: 'all 0.2s'
              }}>
                {copied === overlay.path ? 'Copied!' : 'Copy Link'}
              </button>
            </div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: '32px' }}>
        <Link href="/" style={{ color: '#a7abb9', textDecoration: 'none', fontSize: '14px' }}>&larr; Back to Dashboard</Link>
      </div>
    </div>
  );
}
