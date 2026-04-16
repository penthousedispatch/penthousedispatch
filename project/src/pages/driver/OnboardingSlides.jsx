import React, { useMemo, useState } from 'react';
import { Volume2, Pause, Square } from 'lucide-react';
import { useDriverVoiceGuide } from '../../lib/driverVoiceGuide';

const SLIDES = [
  {
    icon: '👋',
    title: 'Welcome to Penthouse Dispatch',
    desc: 'The premium NEMT driver experience. Accept trips, navigate, and earn — all in one place.',
  },
  {
    icon: '🏠',
    title: 'Set Your Home Address',
    desc: 'Adding your starting address helps the AI scheduler find the best trips near you.',
  },
  {
    icon: '📲',
    title: 'Accepting Trips',
    desc: 'When a new trip arrives your phone vibrates. You have 30 seconds to accept or reject.',
  },
  {
    icon: '⚡',
    title: 'You\'re All Set!',
    desc: 'Tap "Request Rides Near Me" to start getting trip offers. Drive safe and earn big!',
  },
];

export default function OnboardingSlides({ onDone }) {
  const [idx, setIdx] = useState(0);
  const slide = SLIDES[idx];
  const narration = useMemo(
    () => `${slide.title}. ${slide.desc}`,
    [slide]
  );
  const voice = useDriverVoiceGuide(narration);

  return (
    <div className="fixed inset-0 flex flex-col" style={{ background: '#07090d' }}>
      <div className="flex items-center justify-between p-4">
        <div className="flex items-center gap-2">
          {voice.supported && (
            <>
              <button
                onClick={voice.toggle}
                className="px-3 py-1.5 rounded-full text-xs flex items-center gap-1.5"
                style={{ background: 'rgba(201,168,76,0.12)', border: '1px solid rgba(201,168,76,0.25)', color: '#c9a84c' }}
              >
                {voice.speaking && !voice.paused ? <Pause className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                {voice.speaking ? (voice.paused ? 'Resume voice' : 'Pause voice') : 'Listen'}
              </button>
              {voice.speaking && (
                <button
                  onClick={voice.stop}
                  className="px-3 py-1.5 rounded-full text-xs flex items-center gap-1.5"
                  style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.72)' }}
                >
                  <Square className="w-3.5 h-3.5" />
                  Stop
                </button>
              )}
            </>
          )}
        </div>
        <button onClick={onDone} style={{ color: 'rgba(255,255,255,0.4)', background: 'none', border: 'none', fontSize: 14 }}>Skip</button>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-8 gap-8">
        <div
          className="w-28 h-28 rounded-3xl flex items-center justify-center text-6xl"
          style={{ background: 'rgba(201,168,76,0.1)', border: '1px solid rgba(201,168,76,0.2)' }}
        >
          {slide.icon}
        </div>
        <div className="text-center">
          <h2 className="text-2xl font-800 mb-3" style={{ fontWeight: 800 }}>{slide.title}</h2>
          <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 15, lineHeight: 1.6 }}>{slide.desc}</p>
          {voice.supported && (
            <p className="mt-3 text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>
              Voice helper reads each step aloud for new drivers.
            </p>
          )}
        </div>
        <div className="flex gap-2">
          {SLIDES.map((_, i) => (
            <div
              key={i}
              className="h-1.5 rounded-full transition-all"
              style={{ width: i === idx ? 24 : 8, background: i === idx ? '#c9a84c' : 'rgba(255,255,255,0.2)' }}
            />
          ))}
        </div>
      </div>

      <div className="p-6">
        <button
          onClick={() => idx === SLIDES.length - 1 ? onDone() : setIdx(idx + 1)}
          className="w-full py-4 rounded-2xl text-base font-700"
          style={{ background: 'linear-gradient(135deg, #c9a84c, #b8983e)', color: '#07090d', fontWeight: 700 }}
        >
          {idx === SLIDES.length - 1 ? "Let's Go!" : 'Next'}
        </button>
      </div>
    </div>
  );
}
