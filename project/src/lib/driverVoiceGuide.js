import { useEffect, useMemo, useRef, useState } from 'react';

function canSpeak() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
}

function pickVoice(voices) {
  if (!voices?.length) return null;
  const premiumMatches = [
    /google us english/i,
    /samantha/i,
    /ava/i,
    /allison/i,
    /victoria/i,
    /serena/i,
    /moira/i,
    /siri/i,
  ];
  const matchByName = (voice) => premiumMatches.some(pattern => pattern.test(`${voice.name} ${voice.voiceURI}`));
  return (
    voices.find(v => /en-US/i.test(v.lang) && matchByName(v)) ||
    voices.find(v => /en-US/i.test(v.lang) && /natural|premium|enhanced/i.test(`${v.name} ${v.voiceURI}`)) ||
    voices.find(v => /en-US/i.test(v.lang)) ||
    voices.find(v => /en/i.test(v.lang)) ||
    voices[0]
  );
}

function normalizeNarrationText(text) {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .replace(/([.!?])(?=[A-Z])/g, '$1 ')
    .trim();
}

function splitIntoChunks(text) {
  const cleaned = normalizeNarrationText(text);
  if (!cleaned) return [];

  const sentences = cleaned
    .split(/(?<=[.!?])\s+/)
    .map(part => part.trim())
    .filter(Boolean);

  const chunks = [];
  let current = '';

  sentences.forEach(sentence => {
    const next = current ? `${current} ${sentence}` : sentence;
    if (next.length > 180 && current) {
      chunks.push(current);
      current = sentence;
    } else {
      current = next;
    }
  });

  if (current) chunks.push(current);
  return chunks;
}

export function useVoiceGuide(text, options = {}) {
  const { rate = 0.92, pitch = 1.0, volume = 1, autoStopOnUnmount = true } = options;
  const utteranceRef = useRef([]);
  const queueRef = useRef([]);
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
    utteranceRef.current = [];
    queueRef.current = [];
    setSpeaking(false);
    setPaused(false);
  }

  function speak(nextText = text) {
    if (!supported || !nextText?.trim()) return;
    stop();
    const chunks = splitIntoChunks(nextText);
    if (!chunks.length) return;

    queueRef.current = chunks;
    utteranceRef.current = chunks.map(chunk => {
      const utterance = new window.SpeechSynthesisUtterance(chunk);
      utterance.rate = rate;
      utterance.pitch = pitch;
      utterance.volume = volume;
      if (selectedVoice) utterance.voice = selectedVoice;
      return utterance;
    });

    utteranceRef.current.forEach((utterance, index) => {
      utterance.onstart = () => {
        if (index === 0) {
          setSpeaking(true);
          setPaused(false);
        }
      };
      utterance.onend = () => {
        if (index === utteranceRef.current.length - 1) {
          setSpeaking(false);
          setPaused(false);
          utteranceRef.current = [];
          queueRef.current = [];
        }
      };
      utterance.onerror = () => {
        setSpeaking(false);
        setPaused(false);
        utteranceRef.current = [];
        queueRef.current = [];
      };
      window.speechSynthesis.speak(utterance);
    });
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

export function useDriverVoiceGuide(text, options = {}) {
  return useVoiceGuide(text, options);
}
