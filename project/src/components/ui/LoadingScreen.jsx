import React from 'react';

export default function LoadingScreen({ message = 'Loading Penthouse Dispatch...' }) {
  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center" style={{ background: '#07090d' }}>
      <div className="flex flex-col items-center gap-6">
        <div className="relative">
          <div
            className="w-20 h-20 rounded-2xl flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, rgba(201,168,76,0.2), rgba(201,168,76,0.05))', border: '1px solid rgba(201,168,76,0.3)' }}
          >
            <span style={{ color: '#c9a84c', fontSize: 40, fontWeight: 800, fontFamily: 'Inter,sans-serif' }}>P</span>
          </div>
          <div
            className="absolute inset-0 rounded-2xl"
            style={{
              background: 'transparent',
              border: '2px solid rgba(201,168,76,0.4)',
              animation: 'pulseRing 1.5s ease-out infinite',
            }}
          />
        </div>
        <div className="flex flex-col items-center gap-2">
          <p style={{ color: '#c9a84c', fontSize: 18, fontWeight: 700, letterSpacing: '0.5px' }}>PENTHOUSE DISPATCH</p>
          <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>{message}</p>
        </div>
        <div className="flex gap-1.5">
          {[0, 1, 2].map(i => (
            <div
              key={i}
              className="w-2 h-2 rounded-full"
              style={{
                background: '#c9a84c',
                animation: `blink 1.2s ease-in-out ${i * 0.2}s infinite`,
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
