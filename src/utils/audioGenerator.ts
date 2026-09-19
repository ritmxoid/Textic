// Web Audio procedural music and soundtrack generator
// Generates high-quality ambient, synthwave, lofi, phonk, and acoustic musical tracks without external network requests

import { MusicPresetId } from '../types';

export interface MusicPresetInfo {
  id: MusicPresetId;
  name: string;
  genre: string;
  bpm: number;
  description: string;
  emoji: string;
  key: string;
}

export const MUSIC_PRESETS: MusicPresetInfo[] = [
  {
    id: 'lofi-chill',
    name: 'Lo-Fi Chill Hop',
    genre: 'Lo-Fi & Study',
    bpm: 78,
    description: 'Мягкий бит, тёплый родес-пианино и уютный виниловый шум для атмосферных видео.',
    emoji: '☕',
    key: 'Cmaj7 / Am9',
  },
  {
    id: 'synthwave-retro',
    name: 'Cyber Synthwave',
    genre: 'Electronic & Retro',
    bpm: 110,
    description: 'Пульсирующий 80s бас, арпеджио и космические пэды в стиле ретрофутуризма.',
    emoji: '🌌',
    key: 'Fm / D# / C#',
  },
  {
    id: 'deep-ambient',
    name: 'Deep Ambient Calm',
    genre: 'Atmospheric & Zen',
    bpm: 60,
    description: 'Глубокий медитативный фон, мягкие переливы и кинематографичный простор.',
    emoji: '🕊️',
    key: 'Dmin / Fmaj',
  },
  {
    id: 'epic-drive',
    name: 'Motivational Drive',
    genre: 'Cinema & Energy',
    bpm: 125,
    description: 'Нарастающий драйв с динамичными аккордами для экспертных рилсов и мотивации.',
    emoji: '🔥',
    key: 'A Minor',
  },
  {
    id: 'phonk-energy',
    name: 'Drift Phonk Beat',
    genre: 'Phonk & Bass',
    bpm: 135,
    description: 'Плотный 808 бас, каубелл и агрессивный ритм для трендовых Reels и Shorts.',
    emoji: '⚡',
    key: 'C# Minor',
  },
  {
    id: 'acoustic-warmth',
    name: 'Acoustic Warmth',
    genre: 'Indie & Warm',
    bpm: 85,
    description: 'Тёплая акустическая гармония, звонкие ноты и вдохновляющее настроение.',
    emoji: '🌿',
    key: 'G Major',
  },
];

// Complete 12-TET Note Frequency Map (C1 to B7)
const NOTE_BASE_INDEX: Record<string, number> = {
  C: 0, 'C#': 1, Db: 1,
  D: 2, 'D#': 3, Eb: 3,
  E: 4,
  F: 5, 'F#': 6, Gb: 6,
  G: 7, 'G#': 8, Ab: 8,
  A: 9, 'A#': 10, Bb: 10,
  B: 11,
};

/**
 * Returns exact finite frequency in Hz for standard note notation (e.g., 'C4', 'F#5', 'Ab3')
 */
export function getNoteFreq(note: string, fallback = 440): number {
  if (!note || typeof note !== 'string') return fallback;
  const match = note.trim().match(/^([A-Ga-g][#b]?)([0-8])$/);
  if (!match) return fallback;

  const noteName = match[1].toUpperCase();
  const octave = parseInt(match[2], 10);
  const semitoneOffset = NOTE_BASE_INDEX[noteName];

  if (semitoneOffset === undefined) return fallback;

  // MIDI Note Number: C4 is 60, A4 is 69 (440Hz)
  const midi = (octave + 1) * 12 + semitoneOffset;
  const freq = 440 * Math.pow(2, (midi - 69) / 12);
  return Number.isFinite(freq) && freq > 0 ? Number(freq.toFixed(2)) : fallback;
}

/**
 * Procedurally generates an AudioBuffer of specified duration for a given preset
 */
export async function generateProceduralTrack(
  presetId: MusicPresetId,
  durationSeconds: number,
  sampleRate = 44100
): Promise<AudioBuffer> {
  const safeDuration = Math.max(3, Number.isFinite(durationSeconds) ? durationSeconds : 3);
  const offlineCtx = new OfflineAudioContext(2, Math.ceil(safeDuration * sampleRate), sampleRate);

  const masterGain = offlineCtx.createGain();
  masterGain.gain.setValueAtTime(0.7, 0);
  masterGain.connect(offlineCtx.destination);

  // Add subtle stereo reverb/delay bus
  const delay = offlineCtx.createDelay();
  delay.delayTime.setValueAtTime(0.3, 0);
  const delayFeedback = offlineCtx.createGain();
  delayFeedback.gain.setValueAtTime(0.25, 0);
  const delayFilter = offlineCtx.createBiquadFilter();
  delayFilter.type = 'lowpass';
  delayFilter.frequency.setValueAtTime(2400, 0);

  delay.connect(delayFilter);
  delayFilter.connect(delayFeedback);
  delayFeedback.connect(delay);
  delayFilter.connect(masterGain);

  const now = 0;

  switch (presetId) {
    case 'lofi-chill':
      renderLofiTrack(offlineCtx, masterGain, delay, safeDuration, now);
      break;
    case 'synthwave-retro':
      renderSynthwaveTrack(offlineCtx, masterGain, delay, safeDuration, now);
      break;
    case 'deep-ambient':
      renderAmbientTrack(offlineCtx, masterGain, delay, safeDuration, now);
      break;
    case 'epic-drive':
      renderEpicDriveTrack(offlineCtx, masterGain, delay, safeDuration, now);
      break;
    case 'phonk-energy':
      renderPhonkTrack(offlineCtx, masterGain, delay, safeDuration, now);
      break;
    case 'acoustic-warmth':
      renderAcousticTrack(offlineCtx, masterGain, delay, safeDuration, now);
      break;
    default:
      renderLofiTrack(offlineCtx, masterGain, delay, safeDuration, now);
      break;
  }

  return await offlineCtx.startRendering();
}

/**
 * Render Lo-Fi Track
 */
function renderLofiTrack(
  ctx: OfflineAudioContext,
  dest: AudioNode,
  delayBus: AudioNode,
  duration: number,
  startTime: number
) {
  const bpm = 78;
  const beatLen = 60 / bpm;
  const chords = [
    [getNoteFreq('C4'), getNoteFreq('E4'), getNoteFreq('G4'), getNoteFreq('B4')], // Cmaj7
    [getNoteFreq('A3'), getNoteFreq('C4'), getNoteFreq('E4'), getNoteFreq('G4')], // Am7
    [getNoteFreq('F3'), getNoteFreq('A3'), getNoteFreq('C4'), getNoteFreq('E4')], // Fmaj7
    [getNoteFreq('G3'), getNoteFreq('B3'), getNoteFreq('D4'), getNoteFreq('F4')], // G7
  ];

  // Vinyl Crackle Noise
  const bufferSize = ctx.sampleRate * 2;
  const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const output = noiseBuffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    output[i] = (Math.random() * 2 - 1) * (Math.random() > 0.98 ? 0.4 : 0.03);
  }
  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuffer;
  noise.loop = true;
  const noiseFilter = ctx.createBiquadFilter();
  noiseFilter.type = 'bandpass';
  noiseFilter.frequency.setValueAtTime(1200, 0);
  noiseFilter.Q.setValueAtTime(1.5, 0);
  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(0.08, 0);
  noise.connect(noiseFilter);
  noiseFilter.connect(noiseGain);
  noiseGain.connect(dest);
  noise.start(startTime);
  noise.stop(startTime + duration);

  // Rhodes style chord progression
  let t = startTime;
  let chordIdx = 0;
  while (t < startTime + duration) {
    const chord = chords[chordIdx % chords.length];
    chord.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t);

      // slight detune for warmth
      osc.detune.setValueAtTime((i - 1.5) * 4, t);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.12, t + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, t + beatLen * 3.8);

      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(1400, t);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(dest);
      gain.connect(delayBus);

      osc.start(t);
      osc.stop(t + beatLen * 4);
    });

    // Lo-Fi Kick & Snare
    playKick(ctx, dest, t);
    playSnare(ctx, dest, t + beatLen * 2);
    playKick(ctx, dest, t + beatLen * 2.75);

    // Closed Hihats
    for (let b = 0; b < 4; b += 0.5) {
      playHihat(ctx, dest, t + b * beatLen, 0.03);
    }

    t += beatLen * 4;
    chordIdx++;
  }
}

/**
 * Render Synthwave Track
 */
function renderSynthwaveTrack(
  ctx: OfflineAudioContext,
  dest: AudioNode,
  delayBus: AudioNode,
  duration: number,
  startTime: number
) {
  const bpm = 110;
  const beatLen = 60 / bpm;
  const bassNotes = [
    getNoteFreq('F3'), getNoteFreq('F3'), getNoteFreq('D#3'), getNoteFreq('C#3'),
  ];

  let t = startTime;
  let bar = 0;
  while (t < startTime + duration) {
    const root = bassNotes[bar % bassNotes.length];

    // 16th note rolling synth bass
    for (let s = 0; s < 16; s++) {
      const noteTime = t + (s * beatLen) / 4;
      if (noteTime >= startTime + duration) break;

      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(root / 2, noteTime);

      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(800, noteTime);
      filter.frequency.exponentialRampToValueAtTime(200, noteTime + 0.12);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.18, noteTime);
      gain.gain.exponentialRampToValueAtTime(0.001, noteTime + 0.14);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(dest);

      osc.start(noteTime);
      osc.stop(noteTime + 0.15);
    }

    // Lead Arp
    const arpNotes = [root, root * 1.25, root * 1.5, root * 2];
    for (let s = 0; s < 8; s++) {
      const noteTime = t + (s * beatLen) / 2;
      if (noteTime >= startTime + duration) break;
      const note = arpNotes[s % arpNotes.length];
      const osc = ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.setValueAtTime(note, noteTime);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.06, noteTime);
      gain.gain.exponentialRampToValueAtTime(0.001, noteTime + 0.2);

      osc.connect(gain);
      gain.connect(delayBus);
      gain.connect(dest);

      osc.start(noteTime);
      osc.stop(noteTime + 0.22);
    }

    // Drums
    playKick(ctx, dest, t);
    playSnare(ctx, dest, t + beatLen);
    playKick(ctx, dest, t + beatLen * 2);
    playSnare(ctx, dest, t + beatLen * 3);

    t += beatLen * 4;
    bar++;
  }
}

/**
 * Render Ambient Track
 */
function renderAmbientTrack(
  ctx: OfflineAudioContext,
  dest: AudioNode,
  delayBus: AudioNode,
  duration: number,
  startTime: number
) {
  const rootFreqs = [220, 261.63, 293.66, 329.63, 392.0]; // Am, C, D, E, G

  const attack = Math.min(2, Math.max(0.5, duration * 0.2));
  const release = Math.min(2, Math.max(0.5, duration * 0.2));

  rootFreqs.forEach((freq, idx) => {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, startTime);

    // Slow LFO modulation for breathing texture
    const lfo = ctx.createOscillator();
    lfo.frequency.setValueAtTime(0.15 + idx * 0.05, startTime);
    const lfoGain = ctx.createGain();
    lfoGain.gain.setValueAtTime(4, startTime);
    lfo.connect(osc.frequency);
    lfo.start(startTime);
    lfo.stop(startTime + duration);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(0.08, startTime + attack);

    if (duration > attack + release) {
      gain.gain.setValueAtTime(0.08, startTime + duration - release);
    }
    gain.gain.linearRampToValueAtTime(0.001, startTime + duration);

    osc.connect(gain);
    gain.connect(dest);
    gain.connect(delayBus);

    osc.start(startTime);
    osc.stop(startTime + duration);
  });
}

/**
 * Render Epic Drive Track
 */
function renderEpicDriveTrack(
  ctx: OfflineAudioContext,
  dest: AudioNode,
  delayBus: AudioNode,
  duration: number,
  startTime: number
) {
  const bpm = 125;
  const beatLen = 60 / bpm;
  let t = startTime;

  while (t < startTime + duration) {
    // Punchy 4-on-the-floor kick
    for (let b = 0; b < 4; b++) {
      playKick(ctx, dest, t + b * beatLen, 0.4);
      playHihat(ctx, dest, t + (b + 0.5) * beatLen, 0.05);
    }
    playSnare(ctx, dest, t + beatLen);
    playSnare(ctx, dest, t + beatLen * 3);

    // Staccato String/Brass Stabs
    const notes = [getNoteFreq('A3'), getNoteFreq('C4'), getNoteFreq('E4')];
    notes.forEach((freq) => {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, t);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.12, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
      osc.connect(gain);
      gain.connect(dest);
      gain.connect(delayBus);
      osc.start(t);
      osc.stop(t + 0.28);
    });

    t += beatLen * 4;
  }
}

/**
 * Render Phonk Track
 */
function renderPhonkTrack(
  ctx: OfflineAudioContext,
  dest: AudioNode,
  delayBus: AudioNode,
  duration: number,
  startTime: number
) {
  const bpm = 135;
  const beatLen = 60 / bpm;
  let t = startTime;

  while (t < startTime + duration) {
    // Heavy 808 Sub-bass
    const subOsc = ctx.createOscillator();
    subOsc.type = 'sine';
    subOsc.frequency.setValueAtTime(65, t);
    subOsc.frequency.exponentialRampToValueAtTime(38, t + 0.3);
    const subGain = ctx.createGain();
    subGain.gain.setValueAtTime(0.4, t);
    subGain.gain.exponentialRampToValueAtTime(0.01, t + beatLen * 1.8);
    subOsc.connect(subGain);
    subGain.connect(dest);
    subOsc.start(t);
    subOsc.stop(t + beatLen * 2);

    // Cowbell Melody (Classic Phonk)
    const cowbellNotes = [
      getNoteFreq('C#5'), getNoteFreq('E5'), getNoteFreq('C#5'), getNoteFreq('F#5'),
      getNoteFreq('E5'), getNoteFreq('D#5'), getNoteFreq('C#5'), getNoteFreq('B4'),
    ];

    cowbellNotes.forEach((freq, idx) => {
      const noteTime = t + (idx * beatLen) / 2;
      if (noteTime >= startTime + duration) return;

      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, noteTime);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.14, noteTime);
      gain.gain.exponentialRampToValueAtTime(0.001, noteTime + 0.16);

      osc.connect(gain);
      gain.connect(delayBus);
      gain.connect(dest);

      osc.start(noteTime);
      osc.stop(noteTime + 0.18);
    });

    playKick(ctx, dest, t, 0.35);
    playSnare(ctx, dest, t + beatLen);
    playKick(ctx, dest, t + beatLen * 2);
    playSnare(ctx, dest, t + beatLen * 3);

    t += beatLen * 4;
  }
}

/**
 * Render Acoustic Warmth Track
 */
function renderAcousticTrack(
  ctx: OfflineAudioContext,
  dest: AudioNode,
  delayBus: AudioNode,
  duration: number,
  startTime: number
) {
  const bpm = 85;
  const beatLen = 60 / bpm;
  const arpeggios = [
    [getNoteFreq('G3'), getNoteFreq('B3'), getNoteFreq('D4'), getNoteFreq('G4')],
    [getNoteFreq('E3'), getNoteFreq('G3'), getNoteFreq('B3'), getNoteFreq('E4')],
    [getNoteFreq('C3'), getNoteFreq('E3'), getNoteFreq('G3'), getNoteFreq('C4')],
    [getNoteFreq('D3'), getNoteFreq('F#3'), getNoteFreq('A3'), getNoteFreq('D4')],
  ];

  let t = startTime;
  let pattern = 0;
  while (t < startTime + duration) {
    const notes = arpeggios[pattern % arpeggios.length];
    notes.forEach((freq, i) => {
      const noteTime = t + (i * beatLen);
      if (noteTime >= startTime + duration) return;

      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, noteTime);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, noteTime);
      gain.gain.linearRampToValueAtTime(0.12, noteTime + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, noteTime + beatLen * 1.5);

      osc.connect(gain);
      gain.connect(dest);
      gain.connect(delayBus);

      osc.start(noteTime);
      osc.stop(noteTime + beatLen * 1.6);
    });

    t += beatLen * 4;
    pattern++;
  }
}

// Drum synthesizer helpers
function playKick(ctx: OfflineAudioContext, dest: AudioNode, time: number, vol = 0.35) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.frequency.setValueAtTime(130, time);
  osc.frequency.exponentialRampToValueAtTime(35, time + 0.12);
  gain.gain.setValueAtTime(vol, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + 0.14);
  osc.connect(gain);
  gain.connect(dest);
  osc.start(time);
  osc.stop(time + 0.15);
}

function playSnare(ctx: OfflineAudioContext, dest: AudioNode, time: number, vol = 0.2) {
  // Noise part
  const bufferSize = ctx.sampleRate * 0.12;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
  }
  const noise = ctx.createBufferSource();
  noise.buffer = buffer;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(vol, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + 0.12);
  noise.connect(gain);
  gain.connect(dest);
  noise.start(time);
  noise.stop(time + 0.13);
}

function playHihat(ctx: OfflineAudioContext, dest: AudioNode, time: number, vol = 0.05) {
  const bufferSize = ctx.sampleRate * 0.04;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
  }
  const noise = ctx.createBufferSource();
  noise.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = 'highpass';
  filter.frequency.setValueAtTime(7000, time);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(vol, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + 0.04);
  noise.connect(filter);
  filter.connect(gain);
  gain.connect(dest);
  noise.start(time);
  noise.stop(time + 0.05);
}
