import { useEffect, useMemo, useRef, useState } from 'react';

function canSpeak() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
}

function pickVoice(voices) {
  if (!voices?.length) return null;
  return (
    voices.find(v => /en-US/i.test(v.lang) && /female|samantha|ava|victoria|allison/i.test(`${v.name}`)) ||
    voices.find(v => /en-US/i.test(v.lang)) ||
    voices.find(v => /en/i.test(v.lang)) ||
    voices[0]
  );
}

export function useDriverVoiceGuide(text, options = {}) {
  const { rate = 0.98, pitch = 1.02, volume = 1, autoStopOnUnmount = true } = options;
  const utteranceRef = useRef(null);
  const [supported] = useState(canSpeak());
  const [speaking, setSpeaking] = useState(false);
  const [paused, setPaused] = useState(false);
  const [voices, setVoices] = useState([]);

  useEffect(() => {
    if (!supported) return undefined;

    const loadVoices = () => setVoices(window.speechSynthesis.getVoices());
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
    return () => {
      window.speechSynthesis.onvoiceschanged = null;
      if (autoStopOnUnmount) window.speechSynthesis.cancel();
    };
  }, [supported, autoStopOnUnmount]);

  const selectedVoice = useMemo(() => pickVoice(voices), [voices]);

  function stop() {
    if (!supported) return;
    window.speechSynthesis.cancel();
    utteranceRef.current = null;
    setSpeaking(false);
    setPaused(false);
  }

  function speak(nextText = text) {
    if (!supported || !nextText?.trim()) return;
    stop();
    const utterance = new window.SpeechSynthesisUtterance(nextText);
    utterance.rate = rate;
    utterance.pitch = pitch;
    utterance.volume = volume;
    if (selectedVoice) utterance.voice = selectedVoice;
    utterance.onstart = () => {
      setSpeaking(true);
      setPaused(false);
    };
    utterance.onend = () => {
      setSpeaking(false);
      setPaused(false);
      utteranceRef.current = null;
    };
    utterance.onerror = () => {
      setSpeaking(false);
      setPaused(false);
      utteranceRef.current = null;
    };
    utteranceRef.current = utterance;
    window.speechSynthesis.speak(utterance);
  }

  function pause() {
    if (!supported || !speaking || paused) return;
    window.speechSynthesis.pause();
    setPaused(true);
  }

  function resume() {
    if (!supported || !paused) return;
    window.speechSynthesis.resume();
    setPaused(false);
  }

  function toggle() {
    if (!speaking) {
      speak();
      return;
    }
    if (paused) resume();
    else pause();
  }

  return {
    supported,
    speaking,
    paused,
    selectedVoiceName: selectedVoice?.name || 'Default voice',
    speak,
    pause,
    resume,
    stop,
    toggle,
  };
}
