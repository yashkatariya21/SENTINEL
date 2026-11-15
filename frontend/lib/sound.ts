"use client";
/**
 * Three tiny synthesised sounds. Off by default; the choice is remembered.
 *
 * No audio files: two oscillators and a gain envelope each, so nothing is downloaded
 * and nothing plays until the user has explicitly enabled sound.
 */
export type SoundName = "key" | "seal" | "chime";

const STORAGE_KEY = "sentinel.prefs.sound";
let context: AudioContext | null = null;

function ctx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!context) context = new Ctor();
  return context;
}

export function soundEnabled(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setSoundEnabled(on: boolean): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, on ? "1" : "0");
  } catch {
    /* private mode */
  }
}

export function playSound(name: SoundName): void {
  if (!soundEnabled()) return;
  const audio = ctx();
  if (!audio) return;
  if (audio.state === "suspended") void audio.resume();

  const now = audio.currentTime;
  const master = audio.createGain();
  master.connect(audio.destination);

  if (name === "key") {
    // a soft key tick: short sine, very low gain
    const osc = audio.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.exponentialRampToValueAtTime(660, now + 0.05);
    master.gain.setValueAtTime(0.035, now);
    master.gain.exponentialRampToValueAtTime(0.0001, now + 0.06);
    osc.connect(master);
    osc.start(now);
    osc.stop(now + 0.07);
    return;
  }

  if (name === "seal") {
    // low wax-press thump: filtered noise burst + a falling body tone
    const osc = audio.createOscillator();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(120, now);
    osc.frequency.exponentialRampToValueAtTime(48, now + 0.18);
    master.gain.setValueAtTime(0.08, now);
    master.gain.exponentialRampToValueAtTime(0.0001, now + 0.26);
    osc.connect(master);
    osc.start(now);
    osc.stop(now + 0.27);
    return;
  }

  // chime: two quiet sine tones a fifth apart
  [523.25, 783.99].forEach((freq, i) => {
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, now + i * 0.06);
    gain.gain.linearRampToValueAtTime(0.03, now + i * 0.06 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.06 + 0.5);
    osc.connect(gain).connect(audio.destination);
    osc.start(now + i * 0.06);
    osc.stop(now + i * 0.06 + 0.55);
  });
}
