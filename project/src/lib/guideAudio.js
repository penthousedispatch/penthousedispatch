import { useEffect, useMemo, useRef, useState } from 'react';

export const GUIDE_AUDIO_SOURCES = {
  driver_onboarding: '',
  driver_guide: '',
  company_guide: '',
  admin_guide: '',
  dispatcher_guide: '',
  rider_guide: '',
};

const GUIDE_AUDIO_STORAGE_PREFIX = 'pd_guide_audio:';

function getStorageKey(key) {
  return `${GUIDE_AUDIO_STORAGE_PREFIX}${key}`;
}

export function getGuideAudioRecord(key) {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(getStorageKey(key));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !parsed.src) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function getGuideAudioSrc(key) {
  const stored = getGuideAudioRecord(key);
  if (stored?.src && typeof stored.src === 'string' && stored.src.trim()) {
    return stored.src.trim();
  }
  const value = GUIDE_AUDIO_SOURCES[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function saveGuideAudioUrl(key, url, label = '') {
  if (typeof window === 'undefined') return null;
  const record = {
    key,
    type: 'url',
    label: label || url,
    src: String(url || '').trim(),
    updatedAt: new Date().toISOString(),
  };
  window.localStorage.setItem(getStorageKey(key), JSON.stringify(record));
  return record;
}

export function saveGuideAudioFile(key, file) {
  if (typeof window === 'undefined') {
    return Promise.resolve(null);
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const record = {
          key,
          type: 'upload',
          label: file?.name || `${key}.audio`,
          src: String(reader.result || ''),
          updatedAt: new Date().toISOString(),
        };
        window.localStorage.setItem(getStorageKey(key), JSON.stringify(record));
        resolve(record);
      } catch (error) {
        reject(error);
      }
    };
    reader.onerror = () => reject(reader.error || new Error('Failed to read audio file'));
    reader.readAsDataURL(file);
  });
}

export function clearGuideAudio(key) {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(getStorageKey(key));
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
