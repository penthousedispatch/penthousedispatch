import { useEffect, useMemo, useRef, useState } from 'react';

export const GUIDE_AUDIO_SOURCES = {
  driver_onboarding: '',
  driver_guide: '',
  company_guide: '',
  admin_guide: '',
  dispatcher_guide: '',
  rider_guide: '',
};

export function getGuideAudioSrc(key) {
  const value = GUIDE_AUDIO_SOURCES[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function useGuideAudioPlayback(src) {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [paused, setPaused] = useState(false);

  const available = useMemo(() => typeof src === 'string' && src.trim().length > 0, [src]);

  useEffect(() => {
    if (!available) {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      setPlaying(false);
      setPaused(false);
      return;
    }

    const audio = new Audio(src);
    audio.preload = 'auto';
    audioRef.current = audio;

    const handlePlay = () => {
      setPlaying(true);
      setPaused(false);
    };
    const handlePause = () => {
      setPlaying(false);
      setPaused(true);
    };
    const handleEnd = () => {
      setPlaying(false);
      setPaused(false);
      audio.currentTime = 0;
    };

    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('ended', handleEnd);

    return () => {
      audio.pause();
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('ended', handleEnd);
      if (audioRef.current === audio) {
        audioRef.current = null;
      }
    };
  }, [available, src]);

  async function play() {
    if (!audioRef.current) return;
    try {
      await audioRef.current.play();
    } catch {
      setPlaying(false);
    }
  }

  function pause() {
    audioRef.current?.pause();
  }

  function resume() {
    if (!audioRef.current) return;
    audioRef.current.play().catch(() => {});
  }

  function stop() {
    if (!audioRef.current) return;
    audioRef.current.pause();
    audioRef.current.currentTime = 0;
    setPlaying(false);
    setPaused(false);
  }

  function toggle() {
    if (!available) return;
    if (!playing && !paused) {
      play();
      return;
    }
    if (paused) {
      resume();
      return;
    }
    pause();
  }

  return {
    available,
    playing,
    paused,
    play,
    pause,
    resume,
    stop,
    toggle,
  };
}
